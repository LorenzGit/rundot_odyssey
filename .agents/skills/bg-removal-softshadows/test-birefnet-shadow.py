#!/usr/bin/env python3
"""Torch-free test of the BiRefNet double-pass pieces extracted into
birefnet_cutout.py: recover_soft_shadows, sample_border_palette, and
refine_foreground. Uses a synthetic fixture (object + soft neutral shadow)
with a simulated AI matte, exactly like the server pipeline's final stage.
Run with the skill's venv (numpy/Pillow/opencv only — no torch needed)."""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from birefnet_cutout import recover_soft_shadows, sample_border_palette, refine_foreground

W, H = 200, 120
BG = (230.0, 226.0, 220.0)

# --- fixture: bg + soft multiply shadow (t peaks 0.55) + red object ---
src = np.zeros((H, W, 4), dtype=np.float32)
yy, xx = np.mgrid[0:H, 0:W]
dist_shadow = np.hypot(xx - 125, yy - 75)
t = np.maximum(0, 1 - dist_shadow / 45) * 0.55
for c in range(3):
    src[:, :, c] = BG[c] * (1 - t)
src[:, :, 3] = 255
obj = np.hypot(xx - 70, yy - 50) <= 28
src[obj, 0], src[obj, 1], src[obj, 2] = 200, 40, 30

source = Image.fromarray(src.astype(np.uint8), "RGBA")

# --- simulated AI matte: object opaque, everything else clear ---
matte = np.where(obj, 255, 0).astype(np.uint8)
cutout = source.copy()
cutout.putalpha(Image.fromarray(matte, "L"))

out = np.asarray(recover_soft_shadows(source, cutout, [list(map(int, BG))]), dtype=np.int32)


def px(x, y):
    return tuple(int(v) for v in out[y, x])


checks = [
    ("object opaque + color", px(70, 50) == (200, 40, 30, 255), px(70, 50)),
    ("bg corner cleared", px(0, 0)[3] == 0, px(0, 0)),
    ("shadow core translucent (~137)", abs(px(125, 75)[3] - 137) < 12, px(125, 75)),
    ("shadow core is black", max(px(125, 75)[:3]) < 40, px(125, 75)),
    ("mid shadow weaker (~88)", abs(px(140, 75)[3] - 88) < 15, px(140, 75)),
]

# --- border auto-sampling: quantized anchor, same recovery within slack ---
anchors = sample_border_palette(source)
checks.append(("border palette ~bg", all(abs(a - b) <= 8 for a, b in zip(anchors[0], (224, 224, 224))), anchors))
out_auto = np.asarray(recover_soft_shadows(source, cutout, anchors), dtype=np.int32)
checks.append(("auto-anchor shadow core ~explicit", abs(int(out_auto[75, 125, 3]) - px(125, 75)[3]) < 10,
               (anchors[0], int(out_auto[75, 125, 3]))))

# --- refine_foreground: bg bleed is stripped from semi-transparent edges ---
ramp = np.zeros((20, 100, 3), dtype=np.uint8)
alpha = np.zeros((20, 100), dtype=np.uint8)
edge = np.zeros((20, 100), dtype=bool)
for x in range(100):
    if x < 40:
        a = 255
    elif x < 60:
        a = round(255 * (60 - x) / 20)
    else:
        a = 0
    alpha[:, x] = a
    edge[:, x] = 0 < a < 255
    comp = (np.array([200, 40, 30]) * (a / 255) + np.array([255, 255, 255]) * (1 - a / 255))
    ramp[:, x, :] = comp.astype(np.uint8)
refined = np.asarray(refine_foreground(Image.fromarray(ramp, "RGB"), Image.fromarray(alpha, "L")), dtype=np.int32)
mid = refined[10, 50]  # alpha ~50%: worst-case bleed point
checks.append(("refined edge ~pure fg", abs(mid[0] - 200) < 25 and mid[1] < 90 and mid[2] < 80, tuple(mid)))

fail = 0
for name, ok, got in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {got}")
    fail += 0 if ok else 1
sys.exit(1 if fail else 0)
