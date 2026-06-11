#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

def make_icon(size, path):
    img = Image.new("RGB", (size, size), (26, 31, 46))
    d = ImageDraw.Draw(img)
    # Rounded square feel via circle
    margin = size // 8
    d.ellipse([margin, margin, size-margin, size-margin], fill=(74, 126, 181))
    # Letter C
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    font = None
    for p in font_paths:
        if os.path.exists(p):
            font = ImageFont.truetype(p, size // 2)
            break
    if font:
        d.text((size//2, size//2), "C", font=font, fill="white", anchor="mm")
    img.save(path, "PNG")
    print(f"Saved {path}")

make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
