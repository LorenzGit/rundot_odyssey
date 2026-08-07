/* Synthetic test for cutout.mjs: uniform bg + red object + soft neutral
   shadow + isolated green dot. Verifies:
   1. background clears to alpha 0
   2. object stays fully opaque, color intact
   3. shadow pixels come back translucent black, alpha ∝ darkness
   4. isolated colored object survives (wand semantics)
*/
import { writeFileSync } from "node:fs";
import { encodePng, decodePng } from "./cutout.mjs";
import { readFileSync } from "node:fs";

const DIR = new URL(".", import.meta.url).pathname;
import { execFileSync } from "node:child_process";

const W = 200,
    H = 120;
const BG = [230, 226, 220];
const d = new Uint8ClampedArray(W * H * 4);
const set = (x, y, r, g, b, a = 255) => {
    const i = (y * W + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
};

// bg + soft multiply shadow blob (neutral darkening), t peaks 0.55 at core
for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
        const dist = Math.hypot(x - 125, y - 75);
        const t = Math.max(0, 1 - dist / 45) * 0.55;
        set(x, y, BG[0] * (1 - t), BG[1] * (1 - t), BG[2] * (1 - t));
    }
// red circle (object) overlapping the shadow
for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
        if (Math.hypot(x - 70, y - 50) <= 28) set(x, y, 200, 40, 30);
    }
// isolated green dot (a second "object" — wand must leave it alone)
for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
        if (Math.hypot(x - 175, y - 95) <= 8) set(x, y, 40, 180, 60);
    }
writeFileSync(DIR + "shadow-src.png", encodePng({ w: W, h: H, data: d }));

// Seeds: bg corner + three points down the shadow gradient (like app clicks)
execFileSync(
    "node",
    [
        DIR + "cutout.mjs",
        DIR + "shadow-src.png",
        "-o",
        DIR + "shadow-out.png",
        "--seed",
        "0,0,20",
        "--seed",
        "154,75,30",
        "--seed",
        "137,75,30",
        "--seed",
        "125,75,30",
    ],
    { stdio: "inherit" },
);

// Also smoke-test chroma mode on a green-screen version
const g = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
        const dist = Math.hypot(x - 125, y - 75);
        const t = Math.max(0, 1 - dist / 45) * 0.55;
        const i = (y * W + x) * 4;
        g[i] = 0;
        g[i + 1] = 255 * (1 - t);
        g[i + 2] = 0;
        g[i + 3] = 255;
    }
for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
        if (Math.hypot(x - 70, y - 50) <= 28) {
            const i = (y * W + x) * 4;
            g[i] = 200;
            g[i + 1] = 40;
            g[i + 2] = 30;
            g[i + 3] = 255;
        }
    }
writeFileSync(DIR + "chroma-src.png", encodePng({ w: W, h: H, data: g }));
execFileSync(
    "node",
    [DIR + "cutout.mjs", DIR + "chroma-src.png", "-o", DIR + "chroma-out.png", "--mode", "chroma", "--key", "00ff00"],
    { stdio: "inherit" },
);

// ---- assertions ----
const px = (img, x, y) => {
    const i = (y * img.w + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
const out = decodePng(Buffer.from(readFileSync(DIR + "shadow-out.png")));
const cout = decodePng(Buffer.from(readFileSync(DIR + "chroma-out.png")));

const checks = [
    ["wand bg corner cleared", px(out, 0, 0)[3] === 0, px(out, 0, 0)],
    [
        "wand object opaque + color",
        px(out, 70, 50)[3] === 255 && Math.abs(px(out, 70, 50)[0] - 200) < 3,
        px(out, 70, 50),
    ],
    ["wand shadow core translucent (~137)", Math.abs(px(out, 125, 75)[3] - 137) < 25, px(out, 125, 75)],
    ["wand shadow core is black", Math.max(...px(out, 125, 75).slice(0, 3)) < 40, px(out, 125, 75)],
    ["wand mid shadow weaker (~87)", Math.abs(px(out, 140, 75)[3] - 87) < 30, px(out, 140, 75)],
    ["wand green dot survives", px(out, 175, 95)[3] === 255, px(out, 175, 95)],
    ["chroma bg cleared", px(cout, 0, 0)[3] === 0, px(cout, 0, 0)],
    ["chroma object opaque", px(cout, 70, 50)[3] === 255, px(cout, 70, 50)],
    ["chroma shadow core translucent", px(cout, 125, 75)[3] > 60 && px(cout, 125, 75)[3] < 200, px(cout, 125, 75)],
];
let fail = 0;
for (const [name, ok, got] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(got)}`);
    if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
