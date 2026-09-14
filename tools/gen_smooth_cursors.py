#!/usr/bin/env python3
"""
Draw the smooth-style pointers: arrow, hand, denied.

The game's own cursors (`public/assets/ui/cursors/*.png`) are pixel art, at
home over the 8px game. Over the smooth island they are the one pixelated
thing on screen, so this draws the same three at the same sizes and hotspots
in the island's style: the sand fill, a grass-green shade on the facet turned
from the light, the cliff-outline ink around, and a soft white highlight.

Each shape is built as a mask at 8x, its outline taken as the band between
the mask and its erosion, coloured, then resolved down with a real filter.
The sizes are the pixel cursors' exact ones, so `globals.css` keeps its
hotspots: arrow 22x30 from its tip, hand 27x32 from the fingertip, denied
32x36 from its centre.

Run:  python3 tools/gen_smooth_cursors.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'ui' / 'cursors' / 'smooth'

SS = 8
INK = (96, 104, 90)
SAND = (239, 243, 185)
SHADE = (211, 244, 153)
LIGHT = (255, 255, 255)
BAR = (150, 136, 112)
OUTLINE = 1.8  # px at output size


def resolve(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def colour(mask: Image.Image, fill, shade_mask: Image.Image | None = None, light_mask: Image.Image | None = None) -> Image.Image:
    """Fill inside, ink around: the outline is the band the erosion takes off."""
    r = round(OUTLINE * SS) * 2 + 1
    inner = mask.filter(ImageFilter.MinFilter(r))
    out = Image.new('RGBA', mask.size, (0, 0, 0, 0))
    out.paste(Image.new('RGBA', mask.size, (*INK, 255)), (0, 0), mask)
    out.paste(Image.new('RGBA', mask.size, (*fill, 255)), (0, 0), inner)
    if shade_mask is not None:
        out.paste(Image.new('RGBA', mask.size, (*SHADE, 255)), (0, 0), ImageChops.multiply(inner, shade_mask))
    if light_mask is not None:
        out.paste(Image.new('RGBA', mask.size, (*LIGHT, 200)), (0, 0), ImageChops.multiply(inner, light_mask))
    return out


def S(*pts):
    return [(x * SS, y * SS) for x, y in pts]


def arrow() -> Image.Image:
    size = (22, 30)
    mask = Image.new('L', (size[0] * SS, size[1] * SS), 0)
    d = ImageDraw.Draw(mask)
    body = [(1, 1), (1, 23), (6.6, 17.8), (10.4, 26.4), (15.2, 24.2), (11.4, 15.8), (19.6, 15.8)]
    d.polygon(S(*body), fill=255)
    # Rounded tip and corners: a soft blur then threshold.
    mask = mask.filter(ImageFilter.GaussianBlur(0.6 * SS)).point(lambda v: 255 if v > 128 else 0)
    # The facet turned from the light: right of the arrow's spine.
    shade = Image.new('L', mask.size, 0)
    ImageDraw.Draw(shade).polygon(S((1, 1), (19.6, 15.8), (11.4, 15.8), (15.2, 24.2), (10.4, 26.4), (8.5, 22), (1, 1)), fill=255)
    shade = ImageChops.multiply(shade, Image.new('L', mask.size, 255))
    # A highlight along the left edge, inside.
    light = Image.new('L', mask.size, 0)
    ImageDraw.Draw(light).line(S((3.2, 4), (3.2, 18)), fill=255, width=round(1.2 * SS))
    light = light.filter(ImageFilter.GaussianBlur(0.5 * SS))
    return resolve(colour(mask, SAND, shade, light), size)


def hand() -> Image.Image:
    size = (27, 32)
    W, H = size[0] * SS, size[1] * SS
    mask = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(mask)
    # Palm, with the index finger standing up from its left — the fingertip
    # is the hotspot, at (5, 0) — three fingers folded along its top, and the
    # thumb tucked across the left side.
    d.rounded_rectangle(S((5, 14), (25.5, 30.5)), radius=6 * SS, fill=255)
    d.rounded_rectangle(S((5.5, 1), (11.8, 19)), radius=3.1 * SS, fill=255)
    for x in (12.2, 16.8, 21.3):
        d.rounded_rectangle(S((x, 9.8), (x + 4.6, 19)), radius=2.3 * SS, fill=255)
    d.rounded_rectangle(S((1.2, 17), (9.5, 25.5)), radius=3.6 * SS, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.45 * SS)).point(lambda v: 255 if v > 128 else 0)
    # Flat shade, as on the island: the palm's lower right.
    shade = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shade).polygon(S((12, 21), (27, 16), (27, 32), (8, 32), (8, 28)), fill=255)
    light = Image.new('L', (W, H), 0)
    ImageDraw.Draw(light).line(S((7.8, 3.6), (7.8, 14)), fill=255, width=round(1.3 * SS))
    light = light.filter(ImageFilter.GaussianBlur(0.4 * SS))
    out = colour(mask, SAND, shade, light)
    # Creases: between the folded fingers, and the thumb's edge along the palm.
    dd = ImageDraw.Draw(out)
    w = round(1.2 * SS)
    for x in (12.2, 16.8, 21.3):
        dd.line(S((x, 12.5), (x, 18.5)), fill=(*INK, 255), width=w)
    dd.arc(S((3.5, 16), (13.5, 26)), start=250, end=360, fill=(*INK, 255), width=w)
    return resolve(out, size)


def denied() -> Image.Image:
    size = (32, 36)
    W, H = size[0] * SS, size[1] * SS
    mask = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(mask)
    cx, cy, r = 16, 18, 12.5
    d.ellipse(S((cx - r, cy - r), (cx + r, cy + r)), fill=255)
    shade = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shade).pieslice(S((cx - r, cy - r), (cx + r, cy + r)), start=-20, end=160, fill=255)
    out = colour(mask, SAND, shade)
    dd = ImageDraw.Draw(out)
    # The bar, corner to corner, and a ring inside the outline.
    dd.line(S((cx - 7.6, cy - 7.6), (cx + 7.6, cy + 7.6)), fill=(*BAR, 255), width=round(3.4 * SS))
    dd.ellipse(S((cx - r + 2.6, cy - r + 2.6), (cx + r - 2.6, cy + r - 2.6)), outline=(*BAR, 255), width=round(2.6 * SS))
    return resolve(out, size)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (('arrow', arrow), ('hand', hand), ('denied', denied)):
        img = fn()
        img.save(OUT / f'{name}.png', optimize=True)
        print(name, img.size)
