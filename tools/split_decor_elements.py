#!/usr/bin/env python3
"""
Cut `public/assets/world/green_nature_iso_decor_elements.png` into one image
per decoration, plus a manifest the renderer reads to place them.

The sheet is a loose scatter of hand-drawn pieces on transparency, not a
grid. Pieces are found as connected blobs of alpha after a dilation that
glues the parts of one piece together (a flower head and its stem, the blades
of a tuft), then each is cropped tight to its own pixels.

For every piece the manifest records:

  - `anchor`: the pixel where it stands on the ground: the bottom row, under
    the middle of the base's widest row. A patch's base diamond ends in its
    bottom corner and a stem ends at its foot, so this is the cell's bottom
    corner in both cases;
  - `cells`: how many cells its base covers, from the width of that widest
    base row — the base being the lowest `BASE` share of the piece, under the
    foliage: the sheet draws a one-cell patch about 130px wide, and larger
    bases are square multiples.

Names are given by hand, by index in reading order (top to bottom, then left
to right) — run once, look at the contact sheet, then fill `NAMES`.

Run:  python3 tools/split_decor_elements.py
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'assets' / 'world' / 'green_nature_iso_decor_elements.png'
OUT = ROOT / 'public' / 'assets' / 'world' / 'decor'
MANIFEST = OUT / 'manifest.json'

GLUE = 31        # dilation, px: parts closer than this belong to one piece
SCALE = 4        # labelling is done at 1/SCALE
ONE_CELL = 150   # a base narrower than this covers one cell

# Index in reading order -> name. Filled after the first run's contact sheet.
NAMES: dict[int, str] = {
    0: 'flower-tall',
    1: 'flower-leafy',
    2: 'flowers-small',
    3: 'tuft-small',
    4: 'meadow-tuft',
    5: 'hill-big',
    6: 'hill-wide',
    7: 'bush-small',
    8: 'flowers-patch',
    9: 'tuft-left',
    10: 'tuft-right',
}

MIN_AREA = 1500  # px of a piece's tight box; anything less is a stray mark
BASE = 0.45      # the lowest share of a piece that is its base, not foliage


def label(mask: Image.Image) -> list[tuple[tuple[int, int, int, int], Image.Image]]:
    """
    The connected regions of a small L-mode mask: each as its bounding box
    and its own mask, so a piece can be cut free of any neighbour whose box
    overlaps its own.
    """
    w, h = mask.size
    px = mask.load()
    seen = bytearray(w * h)
    regions = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or px[x0, y0] == 0:
                continue
            q = deque([(x0, y0)])
            seen[y0 * w + x0] = 1
            cells = [(x0, y0)]
            while q:
                x, y = q.popleft()
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny]:
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
                        cells.append((nx, ny))
            own = Image.new('L', (w, h), 0)
            own.putdata([0] * (w * h))
            opx = own.load()
            for x, y in cells:
                opx[x, y] = 255
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            regions.append(((min(xs), min(ys), max(xs) + 1, max(ys) + 1), own))
    return regions


def main() -> None:
    sheet = Image.open(SOURCE).convert('RGBA')
    alpha = sheet.split()[3].point(lambda a: 255 if a > 8 else 0)
    glued = alpha.filter(ImageFilter.MaxFilter(GLUE))
    small = glued.resize((sheet.width // SCALE, sheet.height // SCALE), Image.NEAREST)
    regions = sorted(label(small), key=lambda r: (r[0][1] // 12, r[0][0]))

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    contact = sheet.copy()
    draw = ImageDraw.Draw(contact)
    for (x0, y0, x1, y1), own in regions:
        box = (max(0, x0 * SCALE - GLUE), max(0, y0 * SCALE - GLUE), min(sheet.width, x1 * SCALE + GLUE), min(sheet.height, y1 * SCALE + GLUE))
        # Only this region's pixels: its small mask blown back up and applied
        # to the alpha, so an overlapping neighbour's parts are cut away.
        keep = own.resize(sheet.size, Image.NEAREST).crop(box)
        piece = sheet.crop(box)
        alpha = ImageChops.multiply(piece.split()[3], keep)
        piece.putalpha(alpha)
        tight = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
        if not tight:
            continue
        piece = piece.crop(tight)
        if piece.width * piece.height < MIN_AREA:
            continue
        a = piece.split()[3]
        # The base: the widest opaque row in the piece's lowest share.
        base, centre = 0, piece.width / 2
        for y in range(round(piece.height * (1 - BASE)), piece.height):
            row = [x for x in range(piece.width) if a.getpixel((x, y)) > 8]
            if row and row[-1] - row[0] + 1 > base:
                base = row[-1] - row[0] + 1
                centre = (row[0] + row[-1]) / 2
        anchor = (round(centre), piece.height - 1)
        i = len(manifest)
        name = NAMES.get(i, f'decor-{i:02d}')
        piece.save(OUT / f'{name}.png', optimize=True)
        cells = 1 if base < ONE_CELL else 2 if base < 2 * ONE_CELL else 3
        manifest.append({'name': name, 'file': f'{name}.png', 'width': piece.width, 'height': piece.height, 'anchor': anchor, 'base': base, 'cells': cells})
        gx, gy = box[0] + tight[0], box[1] + tight[1]
        draw.rectangle([gx, gy, gx + piece.width, gy + piece.height], outline=(255, 0, 0), width=2)
        draw.text((gx + 4, gy + 4), f'{i} {name} {piece.width}x{piece.height} b{base} c{cells}', fill=(200, 0, 0))
        print(i, name, piece.size, 'anchor', anchor, 'base', base, 'cells', cells)

    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    contact.save(ROOT / 'art-source' / 'iso-smooth' / 'decor-contact.png')
    print(f'{len(manifest)} pieces -> {OUT.relative_to(ROOT)}, manifest and contact sheet written')


if __name__ == '__main__':
    main()
