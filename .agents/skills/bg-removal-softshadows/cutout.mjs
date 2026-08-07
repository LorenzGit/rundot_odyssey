#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* cutout.mjs — background removal with soft-shadow preservation.      */
/*                                                                     */
/* Zero-dependency wand/chroma double-pass cutout engine for Node.     */
/*                                                                     */
/* Layer 1 (object): select the background — magic-wand flood or       */
/* luma-invariant chroma key — refine (contract → smooth → feather),   */
/* clear it.                                                           */
/* Layer 2 (shadow): cleared pixels that are a *neutral darkening*     */
/* of the background (same chroma, lower luminance) come back as       */
/* translucent black, opacity = darkness fraction — the exact          */
/* un-compositing of a multiply shadow, correct over any new           */
/* background. Colored elements fail the neutrality test and stay      */
/* removed.                                                            */
/*                                                                     */
/* Usage:                                                              */
/*   node cutout.mjs in.png -o out.png [options]                       */
/*                                                                     */
/* Options:                                                            */
/*   --mode wand|chroma        (default wand)                          */
/*   --seed x,y[,tol]          repeat; wand: defaults to 4 corners;    */
/*                             chroma: optional, falls back to --key   */
/*   --key 00ff00              chroma key color when no seeds given    */
/*   --tolerance 20            max per-channel difference              */
/*   --contract 1              selection contraction px (neg = expand) */
/*   --smooth 2                contour rounding px                     */
/*   --feather 1               edge blur px                            */
/*   --shadow on|off           shadow recovery layer (default on)      */
/*   --shadow-strength 100     shadow opacity scale %                  */
/*   --despill 100             chroma decontamination strength %       */
/*   --despill-reach 3         despill fade distance inside cut px     */
/*   --despill-tone 100        100=luma-preserving, 0=black, 200=white */
/*                                                                     */
/* Output: RGBA PNG + one JSON stats line on stdout.                   */
/* ------------------------------------------------------------------ */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

/* ----------------------------- PNG I/O ---------------------------- */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
    const p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Decode an 8-bit non-interlaced PNG (color types 2=RGB, 6=RGBA) into
// { w, h, data: Uint8ClampedArray RGBA }.
export function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
    let pos = 8,
        w = 0,
        h = 0,
        bitDepth = 0,
        colorType = 0,
        interlace = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const chunk = buf.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") {
            w = chunk.readUInt32BE(0);
            h = chunk.readUInt32BE(4);
            bitDepth = chunk[8];
            colorType = chunk[9];
            interlace = chunk[12];
        } else if (type === "IDAT") idat.push(chunk);
        else if (type === "IEND") break;
        pos += 12 + len;
    }
    if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth} (need 8)`);
    if (interlace !== 0) throw new Error("interlaced PNG not supported");
    if (colorType !== 2 && colorType !== 6) {
        throw new Error(`unsupported color type ${colorType} (need 2=RGB or 6=RGBA)`);
    }
    const srcBpp = colorType === 6 ? 4 : 3;
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * srcBpp;
    const out = new Uint8ClampedArray(w * h * 4);
    const prev = new Uint8Array(stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
        const f = raw[p++];
        const row = raw.subarray(p, p + stride);
        p += stride;
        const cur = new Uint8Array(stride);
        for (let i = 0; i < stride; i++) {
            const a = i >= srcBpp ? cur[i - srcBpp] : 0;
            const b = prev[i],
                c = i >= srcBpp ? prev[i - srcBpp] : 0;
            let v = row[i];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) v += paeth(a, b, c);
            cur[i] = v & 255;
        }
        for (let x = 0; x < w; x++) {
            const s = x * srcBpp,
                t = (y * w + x) * 4;
            out[t] = cur[s];
            out[t + 1] = cur[s + 1];
            out[t + 2] = cur[s + 2];
            out[t + 3] = srcBpp === 4 ? cur[s + 3] : 255;
        }
        prev.set(cur);
    }
    return { w, h, data: out };
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

// Encode { w, h, data: RGBA } as an 8-bit RGBA PNG (filter 0 rows).
export function encodePng({ w, h, data }) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // 8-bit RGBA
    const raw = Buffer.alloc(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
        const rowStart = y * (w * 4 + 1);
        raw[rowStart] = 0;
        Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, rowStart + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw, { level: 9 })),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

/* -------------------- color math (from color.js) ------------------- */

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hexToRgb(hex) {
    const m = (hex || "#000000").replace("#", "").match(/.{1,2}/g) || ["00", "00", "00"];
    return m.slice(0, 3).map((x) => parseInt(x, 16));
}

/* ---------------- tuning constants (from constants.js) -------------- */

const ALPHA_VISIBLE = 8;
const SHADOW_NEUTRAL_TOL = 12;
const SHADOW_NOISE_FLOOR = 0.03;
const CHROMA_DARK_FLOOR = 0.35;

/* -------------- selection engine (from wand.js) --------------------- */

const chanDiff = (d, i, r, g, b) => Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b));

export function floodSelect(d, w, h, sx, sy, tolerance, sel) {
    const start = sy * w + sx;
    const i0 = start * 4;
    const sr = d[i0],
        sg = d[i0 + 1],
        sb = d[i0 + 2];
    const tol = Math.max(0, tolerance);
    const soft = Math.max(1, tol);
    const seen = new Uint8Array(w * h);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
        const p = stack.pop();
        const diff = chanDiff(d, p * 4, sr, sg, sb);
        if (diff > tol) {
            const frac = 1 - (diff - tol) / soft;
            if (frac > 0) {
                const v = Math.round(255 * frac);
                if (v > sel[p]) sel[p] = v;
            }
            continue;
        }
        sel[p] = 255;
        const x = p % w,
            y = (p / w) | 0;
        if (x + 1 < w && !seen[p + 1]) {
            seen[p + 1] = 1;
            stack.push(p + 1);
        }
        if (x > 0 && !seen[p - 1]) {
            seen[p - 1] = 1;
            stack.push(p - 1);
        }
        if (y + 1 < h && !seen[p + w]) {
            seen[p + w] = 1;
            stack.push(p + w);
        }
        if (y > 0 && !seen[p - w]) {
            seen[p - w] = 1;
            stack.push(p - w);
        }
    }
}

export function erodeSel(sel, w, h, r) {
    const tmp = new Uint8ClampedArray(sel.length);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let v = 255;
            for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                v = Math.min(v, sel[y * w + nx]);
                if (!v) break;
            }
            tmp[y * w + x] = v;
        }
    for (let x = 0; x < w; x++)
        for (let y = 0; y < h; y++) {
            let v = 255;
            for (let dy = -r; dy <= r; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) continue;
                v = Math.min(v, tmp[ny * w + x]);
                if (!v) break;
            }
            sel[y * w + x] = v;
        }
}

export function dilateSel(sel, w, h, r) {
    const tmp = new Uint8ClampedArray(sel.length);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let v = 0;
            for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                v = Math.max(v, sel[y * w + nx]);
                if (v === 255) break;
            }
            tmp[y * w + x] = v;
        }
    for (let x = 0; x < w; x++)
        for (let y = 0; y < h; y++) {
            let v = 0;
            for (let dy = -r; dy <= r; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) continue;
                v = Math.max(v, tmp[ny * w + x]);
                if (v === 255) break;
            }
            sel[y * w + x] = v;
        }
}

export function blurSel(sel, w, h, r) {
    const n = Math.floor(r),
        f = r - n;
    const win = 2 * n + 1 + 2 * f;
    const tmp = new Float32Array(sel.length);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let sum = 0;
        for (let x = -n; x <= n; x++) sum += sel[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
            let v = sum;
            if (f > 0) v += f * (sel[row + Math.max(0, x - n - 1)] + sel[row + Math.min(w - 1, x + n + 1)]);
            tmp[row + x] = v / win;
            sum += sel[row + Math.min(w - 1, x + n + 1)] - sel[row + Math.max(0, x - n)];
        }
    }
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = -n; y <= n; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
            let v = sum;
            if (f > 0) v += f * (tmp[Math.max(0, y - n - 1) * w + x] + tmp[Math.min(h - 1, y + n + 1) * w + x]);
            sel[y * w + x] = Math.round(v / win);
            sum += tmp[Math.min(h - 1, y + n + 1) * w + x] - tmp[Math.max(0, y - n) * w + x];
        }
    }
}

export function smoothSel(sel, w, h, r) {
    blurSel(sel, w, h, r);
    const k = 1 + 2 * Math.min(1, r);
    for (let p = 0; p < sel.length; p++) sel[p] = Math.max(0, Math.min(255, (sel[p] - 128) * k + 128));
}

export function contractSel(sel, w, h, r) {
    const op = r > 0 ? erodeSel : dilateSel;
    const a = Math.abs(r);
    const n = Math.floor(a),
        f = a - n;
    if (n > 0) op(sel, w, h, n);
    if (f > 1e-3) {
        const more = sel.slice();
        op(more, w, h, 1);
        for (let p = 0; p < sel.length; p++) sel[p] = Math.round(sel[p] * (1 - f) + more[p] * f);
    }
}

/* ---------------- shadow layer (from wand.js) ----------------------- */

export function shadowDarkness(d, i, bg) {
    const Lb = luminance(bg[0], bg[1], bg[2]);
    if (Lb < 8) return 0;
    const k = luminance(d[i], d[i + 1], d[i + 2]) / Lb;
    if (k >= 1) return 0;
    if (
        Math.abs(d[i] - k * bg[0]) > SHADOW_NEUTRAL_TOL ||
        Math.abs(d[i + 1] - k * bg[1]) > SHADOW_NEUTRAL_TOL ||
        Math.abs(d[i + 2] - k * bg[2]) > SHADOW_NEUTRAL_TOL
    )
        return 0;
    return Math.max(0, 1 - k - SHADOW_NOISE_FLOOR) / (1 - SHADOW_NOISE_FLOOR);
}

const transparentPct = (data, totalPx) => {
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > ALPHA_VISIBLE) opaque++;
    return Math.round((1 - opaque / totalPx) * 100);
};

/* ------------------ recipes (wand.js / chroma.js) ------------------- */

export function wandCutout(img, seeds, opts) {
    const { tolerance = 20, contract = 1, smooth = 2, feather = 1, shadow = true, shadowStrength = 100 } = opts;
    const { w, h, data: d } = img;
    const sel = new Uint8ClampedArray(w * h);
    const bgColors = [];
    for (const s of seeds) {
        const x = Math.min(w - 1, Math.max(0, Math.round(s.x)));
        const y = Math.min(h - 1, Math.max(0, Math.round(s.y)));
        const i = (y * w + x) * 4;
        bgColors.push([d[i], d[i + 1], d[i + 2]]);
        floodSelect(d, w, h, x, y, s.tolerance ?? tolerance, sel);
    }
    if (contract) contractSel(sel, w, h, contract);
    if (smooth > 0) smoothSel(sel, w, h, smooth);
    if (feather > 0) blurSel(sel, w, h, feather);

    const strength = shadowStrength / 100;
    for (let p = 0, i = 0; p < sel.length; p++, i += 4) {
        const aO = ((d[i + 3] / 255) * (255 - sel[p])) / 255; // layer 1: selection cleared
        let aS = 0;
        if (shadow && aO < 1 && bgColors.length) {
            // layer 2: anchored shadow
            let dark = 0;
            for (const bg of bgColors) {
                const v = shadowDarkness(d, i, bg);
                if (v > dark) dark = v;
            }
            aS = Math.min(1, dark * strength) * (d[i + 3] / 255) * (1 - aO);
        }
        const aF = aO + aS;
        if (aS > 0 && aF > 0) {
            // Shadow contributes as translucent BLACK (un-composited multiply).
            const f = aO / aF;
            d[i] = Math.round(d[i] * f);
            d[i + 1] = Math.round(d[i + 1] * f);
            d[i + 2] = Math.round(d[i + 2] * f);
        }
        d[i + 3] = Math.round(255 * aF);
    }
    return { w, h, data: d, transparentPct: transparentPct(d, w * h) };
}

function keyResidual(d, i, K, KK) {
    const r = d[i],
        g = d[i + 1],
        b = d[i + 2];
    let s = (r * K[0] + g * K[1] + b * K[2]) / KK;
    if (s < 0) s = 0;
    const res = Math.max(Math.abs(r - s * K[0]), Math.abs(g - s * K[1]), Math.abs(b - s * K[2]));
    return res / Math.max(CHROMA_DARK_FLOOR, Math.min(1, s));
}

function selectKey(d, w, h, K, tolerance, sel) {
    const KK = Math.max(1, K[0] * K[0] + K[1] * K[1] + K[2] * K[2]);
    const tol = Math.max(0, tolerance);
    const soft = Math.max(1, tol);
    for (let p = 0, i = 0; p < sel.length; p++, i += 4) {
        const res = keyResidual(d, i, K, KK);
        if (res <= tol) {
            sel[p] = 255;
            continue;
        }
        const frac = 1 - (res - tol) / soft;
        if (frac > 0) {
            const v = Math.round(255 * frac);
            if (v > sel[p]) sel[p] = v;
        }
    }
}

export function chromaCutout(img, seeds, opts) {
    const {
        tolerance = 20,
        contract = 1,
        smooth = 2,
        feather = 1,
        shadow = true,
        shadowStrength = 100,
        despill = 100,
        despillReach = 3,
        despillTone = 100,
    } = opts;
    const { w, h, data: d } = img;
    const sel = new Uint8ClampedArray(w * h);
    const keys = [];
    for (const s of seeds) {
        const x = Math.min(w - 1, Math.max(0, Math.round(s.x)));
        const y = Math.min(h - 1, Math.max(0, Math.round(s.y)));
        const i = (y * w + x) * 4;
        keys.push({ K: [d[i], d[i + 1], d[i + 2]], tol: s.tolerance ?? tolerance });
    }
    if (!keys.length && opts.key) keys.push({ K: hexToRgb(opts.key), tol: tolerance });
    for (const k of keys) selectKey(d, w, h, k.K, k.tol, sel);

    const selRaw = sel.slice();
    if (contract) contractSel(sel, w, h, contract);
    if (smooth > 0) smoothSel(sel, w, h, smooth);
    if (feather > 0) blurSel(sel, w, h, feather);

    // Shadow darkness is measured before despill repaints cleared pixels;
    // reference brightness = 95th percentile luma of fully-selected pixels.
    const strength = shadowStrength / 100;
    let dark = null;
    if (shadow && keys.length) {
        const hist = new Uint32Array(256);
        let selCount = 0;
        for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            if (selRaw[p] >= 250) {
                hist[Math.min(255, Math.round(luminance(d[i], d[i + 1], d[i + 2])))]++;
                selCount++;
            }
        }
        let Lref = 0;
        if (selCount) {
            let acc = 0;
            for (let v = 0; v < 256; v++) {
                acc += hist[v];
                if (acc >= selCount * 0.95) {
                    Lref = v;
                    break;
                }
            }
        } else {
            for (const { K } of keys) Lref = Math.max(Lref, luminance(K[0], K[1], K[2]));
        }
        if (Lref >= 8) {
            dark = new Float32Array(w * h);
            for (let p = 0, i = 0; p < dark.length; p++, i += 4) {
                const conf = selRaw[p] / 255;
                if (!conf) continue;
                const L = luminance(d[i], d[i + 1], d[i + 2]);
                const v = Math.max(0, 1 - L / Lref - SHADOW_NOISE_FLOOR) / (1 - SHADOW_NOISE_FLOOR);
                dark[p] = v * conf;
            }
        }
    }

    // Key-dominance despill with chessboard (chamfer) distance to the cut.
    if (keys.length && despill > 0) {
        const K = [0, 1, 2].map((c) => keys.reduce((s, k) => s + k.K[c], 0) / keys.length);
        const Lk = luminance(K[0], K[1], K[2]);
        const cK = [K[0] - Lk, K[1] - Lk, K[2] - Lk];
        const [top, mid, low] = [0, 1, 2].sort((a, b) => K[b] - K[a]);
        const dual = K[top] - K[mid] < K[mid] - K[low];
        const domK = dual ? Math.min(cK[top], cK[mid]) - cK[low] : cK[top] - Math.max(cK[mid], cK[low]);
        if (domK > 20) {
            const FAR = 250;
            const dist = new Uint8Array(w * h);
            for (let p = 0; p < dist.length; p++) dist[p] = selRaw[p] >= 128 ? 0 : FAR;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const p = y * w + x;
                    if (!dist[p]) continue;
                    let m = dist[p];
                    if (x > 0) m = Math.min(m, dist[p - 1] + 1);
                    if (y > 0) {
                        m = Math.min(m, dist[p - w] + 1);
                        if (x > 0) m = Math.min(m, dist[p - w - 1] + 1);
                        if (x + 1 < w) m = Math.min(m, dist[p - w + 1] + 1);
                    }
                    dist[p] = m;
                }
            for (let y = h - 1; y >= 0; y--)
                for (let x = w - 1; x >= 0; x--) {
                    const p = y * w + x;
                    if (!dist[p]) continue;
                    let m = dist[p];
                    if (x + 1 < w) m = Math.min(m, dist[p + 1] + 1);
                    if (y + 1 < h) {
                        m = Math.min(m, dist[p + w] + 1);
                        if (x + 1 < w) m = Math.min(m, dist[p + w + 1] + 1);
                        if (x > 0) m = Math.min(m, dist[p + w - 1] + 1);
                    }
                    dist[p] = m;
                }
            const amt = despill / 100;
            const reach = Math.max(1, despillReach);
            const tone = (despillTone - 100) / 100;
            for (let p = 0, i = 0; p < sel.length; p++, i += 4) {
                const band = dist[p] <= 1 ? 1 : Math.max(0, 1 - (dist[p] - 1) / reach);
                const wt = Math.max(band, selRaw[p] / 255) * amt;
                if (wt <= 0) continue;
                const e = dual
                    ? Math.min(d[i + top], d[i + mid]) - d[i + low]
                    : d[i + top] - Math.max(d[i + mid], d[i + low]);
                if (e <= 0) continue;
                const m = (e / domK) * wt;
                d[i] -= m * cK[0];
                d[i + 1] -= m * cK[1];
                d[i + 2] -= m * cK[2];
                if (tone) {
                    const dL = tone * m * Lk;
                    d[i] += dL;
                    d[i + 1] += dL;
                    d[i + 2] += dL;
                }
            }
        }
    }

    for (let p = 0, i = 0; p < sel.length; p++, i += 4) {
        const aO = ((d[i + 3] / 255) * (255 - sel[p])) / 255;
        let aS = 0;
        if (dark && aO < 1) aS = Math.min(1, dark[p] * strength) * (d[i + 3] / 255) * (1 - aO);
        const aF = aO + aS;
        if (aS > 0 && aF > 0) {
            const f = aO / aF;
            d[i] = Math.round(d[i] * f);
            d[i + 1] = Math.round(d[i + 1] * f);
            d[i + 2] = Math.round(d[i + 2] * f);
        }
        d[i + 3] = Math.round(255 * aF);
    }
    return { w, h, data: d, transparentPct: transparentPct(d, w * h) };
}

/* ------------------------------ CLI --------------------------------- */

function parseArgs(argv) {
    const args = { seeds: [], mode: "wand", out: null, input: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === "-o" || a === "--out") args.out = next();
        else if (a === "--mode") args.mode = next();
        else if (a === "--seed") {
            const [x, y, tol] = next().split(",").map(Number);
            if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`bad --seed "${a}"`);
            args.seeds.push({ x, y, tolerance: Number.isFinite(tol) ? tol : undefined });
        } else if (a === "--key") args.key = next();
        else if (a === "--tolerance") args.tolerance = Number(next());
        else if (a === "--contract") args.contract = Number(next());
        else if (a === "--smooth") args.smooth = Number(next());
        else if (a === "--feather") args.feather = Number(next());
        else if (a === "--shadow") args.shadow = next() !== "off";
        else if (a === "--shadow-strength") args.shadowStrength = Number(next());
        else if (a === "--despill") args.despill = Number(next());
        else if (a === "--despill-reach") args.despillReach = Number(next());
        else if (a === "--despill-tone") args.despillTone = Number(next());
        else if (!a.startsWith("-") && !args.input) args.input = a;
        else throw new Error(`unknown argument: ${a}`);
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.input || !args.out) {
        console.error("usage: node cutout.mjs in.png -o out.png [--mode wand|chroma] [--seed x,y[,tol]] ...");
        process.exit(2);
    }
    const img = decodePng(readFileSync(args.input));

    let result;
    if (args.mode === "chroma") {
        if (!args.seeds.length && !args.key) args.key = "00ff00";
        result = chromaCutout(img, args.seeds, args);
    } else {
        // Wand needs clicks; agent convenience: default to the four corners.
        if (!args.seeds.length) {
            args.seeds = [
                { x: 0, y: 0 },
                { x: img.w - 1, y: 0 },
                { x: 0, y: img.h - 1 },
                { x: img.w - 1, y: img.h - 1 },
            ];
            console.error("note: no --seed given, defaulting to the four corners");
        }
        result = wandCutout(img, args.seeds, args);
    }

    writeFileSync(args.out, encodePng(result));
    console.log(
        JSON.stringify({
            mode: args.mode,
            seeds: args.seeds.map((s) => [s.x, s.y]),
            w: result.w,
            h: result.h,
            transparentPct: result.transparentPct,
            out: args.out,
        }),
    );
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main();
