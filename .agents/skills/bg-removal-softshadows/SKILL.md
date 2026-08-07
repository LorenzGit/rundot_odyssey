---
name: bg-removal-softshadows
description: "Remove image backgrounds while preserving soft contact shadows as translucent black. Two engines: (A) BiRefNet AI matte + shadow double pass (birefnet_cutout.py) for complex/photographic backgrounds; (B) zero-dependency wand/chroma cutout (cutout.mjs) for uniform backgrounds and green/magenta screens. Use whenever a cutout must keep its soft shadow. rundot's birefnet removal is a fallback but does NOT retain shadows."
---

# Background removal with soft-shadow preservation

Two engines, one shadow math. Both end in the same **double pass**: a cutout
(layer 1) plus recovery of *neutral darkening* pixels as **translucent black**
(layer 2) — the exact un-compositing of a multiply shadow, so the asset
darkens any new background instead of graying. Colored elements fail the
neutrality test (same chroma as a background anchor, lower luminance,
per-channel residual ≤ 12, 3% noise floor) and are never resurrected.

## Engine A — BiRefNet AI matte + shadow double pass

`birefnet_cutout.py` — for complex, textured, or photographic backgrounds
where color-keying fails. The exact pipeline:

1. **AI matte:** BiRefNet via `AutoModelForImageSegmentation`
   (`trust_remote_code=True`, fp32, CPU, threads=min(cpus,8), matmul
   precision "high"). Input LANCZOS-resized to 1024/2048/2304 square,
   ImageNet normalization; take `model(...)[-1].sigmoid()`, clamp, resize
   BILINEAR to source size, multiply by source alpha.
2. **Foreground refine** (default on): the official BiRefNet
   fast-foreground-estimation CPU recipe — two box-blur passes
   (r=90, then r=6) that strip background bleed from semi-transparent edges.
3. **Shadow pass:** `recover_soft_shadows` on the AI cutout. The AI alpha
   protects the subject (`shadow_alpha = darkness * source_alpha *
   (1 - subject_alpha)`). Anchors are `--bg` samples or the **auto border
   palette** (dominant opaque colors along the image border, quantized to
   16-steps, ≥38² apart, max 4).

### Setup (heavy, once)

```bash
SKILL=.agents/skills/bg-removal-softshadows   # from your project root
python3 -m venv $SKILL/.venv && . $SKILL/.venv/bin/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install "transformers>=4.45" "huggingface-hub>0.25" safetensors timm \
  einops kornia scipy scikit-image "numpy<2" opencv-python-headless Pillow
```

~3 GB of wheels; each model downloads ~1–2 GB of weights from Hugging Face
on first use (cached in `HF_HOME`/`~/.cache/huggingface`). CPU inference is
tens of seconds per megapixel — expect ~30–90 s for a 1–2 MP asset.

### Usage

```bash
$SKILL/.venv/bin/python $SKILL/birefnet_cutout.py in.png out.png \
  --model "General Use (Light)" --resolution 1024 \
  --shadow-strength 100 --shadow-tolerance 12
```

- Models: `General Use (Light|Light 2K|Heavy|HR|Matting|Portrait|Dynamic)`
  (raw HF ids also accepted). 2304 requires `General Use (Dynamic)`.
- `--bg r,g,b` (repeatable, max 8) pins shadow anchors; default auto-samples
  the border palette. `--no-refine`, `--no-shadow`, `--mask-only`,
  `--mask-out` available. Stdout prints a JSON stats line.

## Engine B — wand/chroma cutout (zero dependencies)

`cutout.mjs` — for uniform/near-uniform backgrounds and green/magenta
screens. Node ≥ 18, no installs, offline. See the Seeding guidance below;
full option list in the script header.

```bash
node $SKILL/cutout.mjs in.png -o out.png --seed 0,0,32 --seed 767,0,32
node $SKILL/cutout.mjs in.png -o out.png --mode chroma --key 00ff00
```

## Seeding/anchor craft (both engines)

- A pixel only counts as shadow of anchors it is **darker** than — always
  include the unshadowed background color as an anchor.
- Engine A: auto border palette is right for sprite sheets on a matte; pin
  `--bg` when the border contains subject pixels or multiple mats.
- Engine B wand: tolerance is measured against the **seed** color — a soft
  shadow darker than `tolerance` blocks the flood, so seed several points
  down the shadow gradient (click the background and the shadow-tone areas).
- rundot's `--remove-background-model birefnet` also produces a BiRefNet
  matte, but **without** the shadow pass — prefer these engines when the
  asset has a contact shadow worth keeping.

## Verification (blocking)

1. `node .agents/skills/bg-removal-softshadows/test-cutout.mjs` —
   engine B synthetic fixture, must print 9 PASS (shadow core alpha exactly
   137, translucent pure black).
2. `<venv>/bin/python .agents/skills/bg-removal-softshadows/test-birefnet-shadow.py`
   — engine A shadow pass + border sampler + foreground refine, must print
   8 PASS (same numeric expectations; runs without torch in a lightweight
   numpy/Pillow/opencv env).
3. Real assets: read the output back, check the JSON `transparentPct`, and
   inspect composited over a **contrasting** background — the shadow must
   darken smoothly, no hard ring, no color tint. For engine A also sanity-
   check the matte edges (hair/fur, fine lines) at full resolution.

## Known limits

- Engine A: CPU-only here (slow on huge images; 80 MP input cap); first run
  per model downloads weights; square-resize can soften extreme aspect
  ratios — crop tightly around the subject first.
- Engine B: uniform/screen backgrounds only; wand mode can't reach enclosed
  pockets; 8-bit non-interlaced PNG only (convert with `sips -s format png`).
- GIF output has 1-bit transparency — always use PNG/WebP for soft shadows.

## Files

- `birefnet_cutout.py` — engine A CLI.
- `cutout.mjs` — engine B CLI/module (`decodePng`, `encodePng`, `wandCutout`,
  `chromaCutout` importable).
- `test-birefnet-shadow.py` — torch-free test of engine A's shadow/refine
  logic. `test-cutout.mjs` — engine B synthetic test with golden PNGs.
