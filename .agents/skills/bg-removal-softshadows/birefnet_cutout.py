#!/usr/bin/env python3
"""BiRefNet background removal with soft-shadow recovery (double pass).

Standalone CLI. Pipeline:

  pass 1 (AI matte):  BiRefNet (AutoModelForImageSegmentation, fp32, CPU,
                      threads=min(cpus,8), matmul precision "high") on the
                      LANCZOS-resized square input, ImageNet normalization;
                      take model(...)[-1].sigmoid(), clamp, resize BILINEAR
                      back to source size, multiply by source alpha.
  foreground refine:  official BiRefNet/fast-foreground-estimation CPU recipe
                      (two box-blur passes r=90 then r=6) — de-bleeds bg color
                      from semi-transparent edge pixels.
  pass 2 (shadow):    neutral-darkening recovery — any pixel outside the AI
                      subject that is a *neutral darkening* of a background
                      anchor color (same chroma, lower luminance, per-channel
                      residual <= tolerance) returns as translucent black,
                      opacity = darkness fraction. Anchors come from
                      --bg, or auto-sampled border palette otherwise.

Install (isolated env, CPU wheels; ~3 GB incl. model weights on first run):
  python3 -m venv .venv && . .venv/bin/activate
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  pip install "transformers>=4.45" "huggingface-hub>0.25" safetensors timm \
    einops kornia scipy scikit-image "numpy<2" opencv-python-headless Pillow

Usage:
  python birefnet_cutout.py in.png out.png \
      [--model "General Use (Light)"|HF-id] [--resolution 1024|2048|2304] \
      [--no-refine] [--mask-only] [--mask-out mask.png] \
      [--no-shadow] [--shadow-strength 100] [--shadow-tolerance 12] \
      [--bg r,g,b ...]  # repeatable; default: auto-sample border palette
"""

from __future__ import annotations

import argparse
import gc
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps

MODELS = {
    "General Use (Light)": "ZhengPeng7/BiRefNet",
    "General Use (Light 2K)": "ZhengPeng7/BiRefNet_lite-2K",
    "General Use (Heavy)": "ZhengPeng7/BiRefNet_lite",
    "General Use (HR)": "ZhengPeng7/BiRefNet_HR",
    "Matting": "ZhengPeng7/BiRefNet-matting",
    "Portrait": "ZhengPeng7/BiRefNet-portrait",
    "General Use (Dynamic)": "ZhengPeng7/BiRefNet_dynamic",
}
RESOLUTIONS = {"1024": 1024, "2048": 2048, "2304": 2304}

_loaded_model = None
_loaded_model_id = None


def load_model(model_id: str):
    global _loaded_model, _loaded_model_id
    if _loaded_model is not None and _loaded_model_id == model_id:
        return _loaded_model
    _loaded_model = None
    _loaded_model_id = None
    gc.collect()
    import torch
    from transformers import AutoModelForImageSegmentation

    torch.set_num_threads(min(__import__("os").cpu_count() or 1, 8))
    torch.set_float32_matmul_precision("high")
    _loaded_model = AutoModelForImageSegmentation.from_pretrained(
        model_id, trust_remote_code=True, dtype=torch.float32
    ).to("cpu").eval()
    _loaded_model_id = model_id
    return _loaded_model


def refine_foreground(image: Image.Image, mask: Image.Image, radius: int = 90) -> Image.Image:
    """Official BiRefNet/fast-foreground-estimation CPU refinement recipe."""
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    alpha = np.asarray(mask, dtype=np.float32)[:, :, None] / 255.0

    def pass_once(fg, bg, r):
        blurred_alpha = cv2.blur(alpha, (r, r))
        if blurred_alpha.ndim == 2:
            blurred_alpha = blurred_alpha[:, :, None]
        blurred_fg = cv2.blur(fg * alpha, (r, r)) / (blurred_alpha + 1e-5)
        blurred_bg = cv2.blur(bg * (1 - alpha), (r, r)) / (1 - blurred_alpha + 1e-5)
        estimate = blurred_fg + alpha * (rgb - alpha * blurred_fg - (1 - alpha) * blurred_bg)
        return np.clip(estimate, 0, 1), blurred_bg

    foreground, background = pass_once(rgb, rgb, radius)
    foreground, _ = pass_once(foreground, background, 6)
    return Image.fromarray((foreground * 255).astype(np.uint8), "RGB")


def sample_border_palette(image: Image.Image, max_colors: int = 4) -> list[list[int]]:
    """Find dominant opaque matte colors around a sprite sheet's border."""
    from collections import Counter

    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    border = np.concatenate((rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]), axis=0)
    border = border[border[:, 3] > 127, :3]
    if not len(border):
        return [[255, 255, 255]]
    step = max(1, len(border) // 512)
    quantized = np.minimum(255, np.round(border[::step] / 16) * 16).astype(np.uint8)
    ranked = [list(color) for color, _ in Counter(map(tuple, quantized)).most_common()]
    picked: list[list[int]] = []
    for color in ranked:
        if all(sum((int(a) - int(b)) ** 2 for a, b in zip(color, old)) > 38 ** 2 for old in picked):
            picked.append([int(v) for v in color])
        if len(picked) >= max_colors:
            break
    return picked or [[int(v) for v in np.median(border, axis=0)]]


def recover_soft_shadows(source: Image.Image, cutout: Image.Image, backgrounds: list[list[int]],
                         strength: float = 100, tolerance: int = 12) -> Image.Image:
    """Add neutral matte darkening outside the AI subject as translucent black."""
    src = np.asarray(source.convert("RGBA"), dtype=np.float32)
    out = np.asarray(cutout.convert("RGBA"), dtype=np.float32).copy()
    source_alpha = src[:, :, 3] / 255.0
    subject_alpha = out[:, :, 3] / 255.0
    rgb = src[:, :, :3]
    luma = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
    darkness = np.zeros(subject_alpha.shape, dtype=np.float32)
    for bg in backgrounds:
        bg_arr = np.asarray(bg[:3], dtype=np.float32)
        bg_luma = float(bg_arr @ np.asarray([0.2126, 0.7152, 0.0722]))
        if bg_luma < 8:
            continue
        scale = luma / bg_luma
        neutral = (scale < 1) & (np.max(np.abs(rgb - scale[:, :, None] * bg_arr), axis=2) <= tolerance)
        candidate = np.maximum(0, (1 - scale) - 0.03) / 0.97
        darkness = np.maximum(darkness, np.where(neutral, candidate, 0))

    # AI alpha protects the subject. The remaining matte darkening is
    # un-composited as black so it behaves like a real multiply shadow over
    # checkerboards, game scenes, and exported transparent atlases.
    shadow_alpha = np.minimum(1, darkness * max(0, strength) / 100.0) * source_alpha * (1 - subject_alpha)
    final_alpha = subject_alpha + shadow_alpha
    safe = np.maximum(final_alpha, 1e-6)
    out[:, :, :3] *= (subject_alpha / safe)[:, :, None]
    out[:, :, 3] = final_alpha * 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def infer(source: Image.Image, model_id: str, resolution: int, refine: bool,
          mask_only: bool, recover_shadows: bool, shadow_strength: float,
          shadow_tolerance: int, background_samples: list[list[int]] | None,
          shadow_auto_sample: bool):
    import torch
    from torchvision.transforms import Normalize, ToTensor

    model = load_model(model_id)
    source_rgb = source.convert("RGB")
    resized = source_rgb.resize((resolution, resolution), Image.Resampling.LANCZOS)
    tensor = ToTensor()(resized)
    tensor = Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])(tensor).unsqueeze(0)
    with torch.inference_mode():
        prediction = model(tensor)[-1].sigmoid().float().cpu()[0].squeeze()
    mask_array = (prediction.clamp(0, 1).numpy() * 255).astype(np.uint8)
    mask = Image.fromarray(mask_array, "L").resize(source.size, Image.Resampling.BILINEAR)
    source_alpha = source.getchannel("A") if source.mode == "RGBA" else Image.new("L", source.size, 255)
    mask = Image.fromarray(
        ((np.asarray(mask, dtype=np.float32) / 255) * (np.asarray(source_alpha, dtype=np.float32) / 255) * 255).astype(np.uint8), "L"
    )

    if mask_only:
        return mask.convert("RGBA"), mask

    foreground = refine_foreground(source_rgb, mask) if refine else source_rgb
    result = foreground.convert("RGBA")
    result.putalpha(mask)
    if recover_shadows:
        samples = sample_border_palette(source) if shadow_auto_sample or not background_samples else background_samples
        result = recover_soft_shadows(source, result, samples, shadow_strength, shadow_tolerance)
        mask = result.getchannel("A")
    return result, mask


def main() -> int:
    ap = argparse.ArgumentParser(description="BiRefNet cutout with soft-shadow recovery")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--model", default="General Use (Light)",
                    help="preset name or raw Hugging Face model id")
    ap.add_argument("--resolution", default="1024", choices=sorted(RESOLUTIONS))
    ap.add_argument("--no-refine", action="store_true")
    ap.add_argument("--mask-only", action="store_true")
    ap.add_argument("--mask-out")
    ap.add_argument("--no-shadow", action="store_true")
    ap.add_argument("--shadow-strength", type=float, default=100)
    ap.add_argument("--shadow-tolerance", type=int, default=12)
    ap.add_argument("--bg", action="append", default=[],
                    help="background anchor 'r,g,b' (repeatable, max 8); default: auto border palette")
    args = ap.parse_args()

    model_id = MODELS.get(args.model, args.model)
    resolution = RESOLUTIONS[args.resolution]
    if resolution == 2304 and model_id != MODELS["General Use (Dynamic)"]:
        ap.error("2304 requires --model 'General Use (Dynamic)'")
    if not 0 <= args.shadow_tolerance <= 64 or not 0 <= args.shadow_strength <= 200:
        ap.error("shadow settings out of range (tolerance 0..64, strength 0..200)")
    samples = []
    for raw in args.bg[:8]:
        try:
            c = [max(0, min(255, int(v))) for v in raw.split(",")][:3]
            assert len(c) == 3
        except (ValueError, AssertionError):
            ap.error(f"invalid --bg {raw!r} (want r,g,b)")
        samples.append(c)

    source = ImageOps.exif_transpose(Image.open(args.input)).convert("RGBA")
    if source.width * source.height > 80_000_000:
        ap.error("image exceeds 80 megapixels")
    result, mask = infer(source, model_id, resolution, not args.no_refine,
                         args.mask_only, not args.no_shadow, args.shadow_strength,
                         args.shadow_tolerance, samples, shadow_auto_sample=not samples)
    result.save(args.output, optimize=True)
    if args.mask_out:
        mask.save(args.mask_out, optimize=True)
    alpha = np.asarray(result.getchannel("A"), dtype=np.uint8)
    print({"out": args.output, "size": result.size,
           "transparentPct": round(100 * float((alpha <= 8).mean()), 1),
           "shadowAnchors": samples or "auto-border"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
