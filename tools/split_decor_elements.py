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

# Pieces standing on a drawn slab. The artist's slabs are not all at the
# 2:1 isometric angle, so each is straightened: an affine map sends the
# slab's three visible corners — bottom, left, right — onto a true diamond
# of the same width, and the foliage comes along.
SLABBED = {'flowers-small', 'meadow-tuft', 'hill-big', 'hill-wide', 'bush-small', 'flowers-patch'}


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


def straighten(piece: Image.Image) -> Image.Image:
    """
    Map the slab's bottom, left and right corners onto a 2:1 diamond of the
    same width, bottom corner fixed. The corners are read off the alpha: the
    lowest opaque point, and the extreme points of the piece's lowest share.
    """
    a = piece.split()[3]
    w, h = piece.size
    pts = [(x, y) for y in range(h) for x in range(w) if a.getpixel((x, y)) > 8]
    ymax = max(y for _, y in pts)
    bottom_xs = [x for x, y in pts if y == ymax]
    B = (sum(bottom_xs) / len(bottom_xs), float(ymax))
    base = [p for p in pts if p[1] >= h * (1 - BASE)]
    L = min(base, key=lambda p: p[0])
    R = max(base, key=lambda p: p[0])
    width = R[0] - L[0]
    L2 = (B[0] - width / 2, B[1] - width / 4)
    R2 = (B[0] + width / 2, B[1] - width / 4)
    # Forward affine F with F(L)=L2, F(R)=R2, F(B)=B; PIL wants the inverse.
    src = [L, R, B]
    dst = [L2, R2, B]

    def solve(src, dst):
        # Least squares is overkill for three points: solve the 3x3 system per axis.
        import itertools
        (x0, y0), (x1, y1), (x2, y2) = src
        det = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1)
        out = []
        for k in range(2):
            u0, u1, u2 = dst[0][k], dst[1][k], dst[2][k]
            a_ = (u0 * (y1 - y2) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1)) / det
            b_ = (x0 * (u1 - u2) - u0 * (x1 - x2) + (x1 * u2 - x2 * u1)) / det
            c_ = (x0 * (y1 * u2 - y2 * u1) - y0 * (x1 * u2 - x2 * u1) + u0 * (x1 * y2 - x2 * y1)) / det
            out.append((a_, b_, c_))
        return out

    inv = solve(dst, src)  # output pixel -> input pixel
    # Room for the foliage to move: pad the canvas generously, then re-crop.
    pad = w // 2
    canvas = Image.new('RGBA', (w + 2 * pad, h + pad), (0, 0, 0, 0))
    canvas.paste(piece, (pad, pad))
    (a0, b0, c0), (d0, e0, f0) = inv
    # Shift for the padding: output (x, y) -> input (x - pad, y - pad) space.
    data = (a0, b0, c0 - a0 * pad - b0 * pad + pad, d0, e0, f0 - d0 * pad - e0 * pad + pad)
    out = canvas.transform(canvas.size, Image.AFFINE, data, resample=Image.BICUBIC)
    tight = out.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    return out.crop(tight)


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
        name = NAMES.get(len(manifest), f'decor-{len(manifest):02d}')
        if name in SLABBED:
            piece = straighten(piece)
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
