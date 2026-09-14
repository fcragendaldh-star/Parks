#!/usr/bin/env python3
"""
Build the hero backdrop derivatives.

The hero photo is a deliberately low-opacity texture layer sitting under a
heavy tonal wash (see style.css §07), so it is cropped wide (2:1) and needs
no more resolution than the widest available source provides. Every source
in assets/park-themes/ is 1280px wide, so 1280 is the ceiling — upscaling
beyond it would only ship blurry bytes.

Run from the project root:  python tools/build-hero.py
"""
import os
from PIL import Image

SRC = os.path.join("assets", "park-themes", "urban-miyawaki-microforest.jpg")
OUT_DIR = os.path.join("assets", "hero")
WIDTHS = (900, 1280)
JPEG_FALLBACK_WIDTH = 1280
RATIO = 2 / 1
VERTICAL_BIAS = 0.38   # keep the canopy, drop some foreground

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with Image.open(SRC) as im:
        im = im.convert("RGB")
        w, h = im.size
        new_h = round(w / RATIO)
        if new_h <= h:
            top = round((h - new_h) * VERTICAL_BIAS)
            base = im.crop((0, top, w, top + new_h))
        else:
            new_w = round(h * RATIO)
            left = (w - new_w) // 2
            base = im.crop((left, 0, left + new_w, h))

        for width in WIDTHS:
            resized = base.resize((width, round(width / RATIO)), Image.LANCZOS)
            p = os.path.join(OUT_DIR, f"canopy-{width}.webp")
            resized.save(p, "WEBP", quality=56, method=6)
            print(f"  {p}  {os.path.getsize(p)/1024:.0f} KB")
            if width == JPEG_FALLBACK_WIDTH:
                p = os.path.join(OUT_DIR, f"canopy-{width}.jpg")
                resized.save(p, "JPEG", quality=62, optimize=True, progressive=True)
                print(f"  {p}  {os.path.getsize(p)/1024:.0f} KB")

if __name__ == "__main__":
    main()
