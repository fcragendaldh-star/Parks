#!/usr/bin/env python3
"""
Generate responsive, web-optimised derivatives of the Fast-Track theme photography.

The source files in assets/park-themes/ are 156KB-882KB each (2.6MB total) at
1280px wide with inconsistent aspect ratios - far heavier than the ~370px card
slots they render into, and enough on their own to push Lighthouse Performance
below 90.

This script writes assets/park-themes/opt/ containing, per source image:
    <slug>-480.webp  <slug>-720.webp  <slug>-1080.webp   (modern, primary)
    <slug>-720.jpg                                        (fallback for the
                                                           ~3% without WebP)
All derivatives are centre-cropped to a uniform 16:9 so the card grid has no
layout shift, with the crop biased slightly above centre (portrait sources such
as open-air-reading-park.jpg are 1280x1921 and would otherwise lose their
subject).

Idempotent - safe to re-run. Sources are never modified.
Requires Pillow.  Run from the project root:  python tools/optimize-images.py
"""
import os
from PIL import Image

SRC_DIR = os.path.join("assets", "park-themes")
OUT_DIR = os.path.join(SRC_DIR, "opt")
WIDTHS = (480, 720, 1080)
JPEG_FALLBACK_WIDTH = 720
TARGET_RATIO = 16 / 9
VERTICAL_BIAS = 0.42   # 0.5 = dead centre; <0.5 keeps more of the upper frame

def crop_to_ratio(im, ratio):
    """Centre-crop to `ratio`, biasing the vertical window above centre."""
    w, h = im.size
    if w / h > ratio:                      # too wide -> trim left/right
        new_w = round(h * ratio)
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    new_h = round(w / ratio)               # too tall -> trim top/bottom
    top = round((h - new_h) * VERTICAL_BIAS)
    return im.crop((0, top, w, top + new_h))

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    total_src = total_out = 0

    for name in sorted(os.listdir(SRC_DIR)):
        src = os.path.join(SRC_DIR, name)
        if not os.path.isfile(src) or not name.lower().endswith((".jpg", ".jpeg", ".png")):
            continue

        slug = os.path.splitext(name)[0]
        total_src += os.path.getsize(src)

        with Image.open(src) as im:
            im = im.convert("RGB")
            base = crop_to_ratio(im, TARGET_RATIO)

            for w in WIDTHS:
                resized = base.resize((w, round(w / TARGET_RATIO)), Image.LANCZOS)

                webp = os.path.join(OUT_DIR, f"{slug}-{w}.webp")
                resized.save(webp, "WEBP", quality=76, method=6)
                total_out += os.path.getsize(webp)

                if w == JPEG_FALLBACK_WIDTH:
                    jpg = os.path.join(OUT_DIR, f"{slug}-{w}.jpg")
                    resized.save(jpg, "JPEG", quality=74,
                                 optimize=True, progressive=True)
                    total_out += os.path.getsize(jpg)

        print(f"  {slug}")

    print(f"\nsources : {total_src/1024:8.0f} KB")
    print(f"derived : {total_out/1024:8.0f} KB  (all widths + fallbacks)")

if __name__ == "__main__":
    main()
