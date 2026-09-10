#!/usr/bin/env python3
"""
Generate the carrot iris' aperture mask, from the kit's own carrot.

The wipe (src/game/fx/CarrotWipe.ts) cuts a carrot-shaped hole out of a black
sheet. It used the kit's carrot sprite directly, and at small apertures the
shape fell apart at the top: the leaves are three SEPARATE thin fronds, so the
hole broke into a scatter of specks exactly where it should have read as one
clear opening.

So this is a DERIVED silhouette, not a redrawn one. Every pixel comes from the
kit's alpha channel — the outline is never traced by hand — and the script only
does what the art cannot do for itself:

  1. FILL the leaves into one solid crown, so the aperture stays a single hole
     all the way down to nothing.
  2. TILT the whole shape, so the carrot enters at an angle instead of standing
     to attention. A wipe reads as motion; a vertical vegetable reads as a logo.

Output is a white-on-transparent WebP. White because a mask is read for its
ALPHA and nothing else — colour would be a lie about what the file is for — and
because a flat white silhouette is the thing you actually want to look at when
you are working on the shape.

    bun run tools/gen_carrot_mask.py     # or: python3 tools/gen_carrot_mask.py

Re-run it if the kit's carrot ever changes; the wipe reads the OUTPUT, so a new
carrot upstream does not reach the game until this is run again. That is the
trade for a shape the art cannot express on its own.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

SRC = Path("node_modules/@domin8/arcade-kit/src/assets/game/carrot.png")
OUT = Path("public/assets/fx/carrot-mask.webp")

# How far the carrot leans, in degrees, anticlockwise. Enough to read as a tilt
# at a glance; past ~20 the root starts to point at a corner rather than down,
# and the shape stops saying "carrot" the moment it is small.
TILT_DEG = 10

# Room for the rotated corners, and for the filled crown to grow into. The
# source is 13x29 and a rotation needs its diagonal, or the leaves clip.
PAD = 8

# The aperture's own grid. Bigger than the kit's 13x29 so the taper has room
# to be a taper rather than a staircase of three steps.
MASK_W = 26
MASK_H = 38

# Where the leaves stop and the root starts, as a share of the height.
CROWN_HEIGHT = 0.38

# Half-widths, in pixels. The gap between ROOT_HALF_W and TUFT_HALF_W IS the
# notch — make them equal and the silhouette goes back to being a bean.
ROOT_HALF_W = 9.0
TIP_HALF_W = 0.8
TUFT_HALF_W = 2.6


def draw_carrot(w: int, h: int) -> list[list[int]]:
    """
    Draw the aperture: a tapered root, a notch, and a tuft of leaves.

    Drawn outright rather than derived from the kit's sprite. Three attempts at
    deriving it — filling the fronds in place, clamping their spans, rebuilding
    a crown over the art's shoulders — all produced the same soft blob, because
    the kit's carrot is drawn to be LOOKED AT: it carries its shape in shading
    and outline as much as in its outline, and an alpha channel keeps only the
    latter. A mask has no shading to lean on, so the silhouette has to do all
    the work, and that means proportions chosen for a hole rather than borrowed
    from a picture.

    Three parts, all measured as fractions of the box so the shape survives
    being retuned:

      root    a wedge, widest at the shoulders, tapering to a blunt tip
      notch   the step where leaves meet root — the one feature that separates
              a carrot from any other tapering vegetable
      tuft    a narrow spray above the notch, solid so it cannot shatter
    """
    grid = [[0] * w for _ in range(h)]

    shoulder_y = round(h * CROWN_HEIGHT)
    cx = (w - 1) / 2

    # The root: linear taper from the shoulders down to the tip.
    for y in range(shoulder_y, h):
        t = (y - shoulder_y) / max(1, h - 1 - shoulder_y)
        half = ROOT_HALF_W * (1 - t) + TIP_HALF_W * t
        for x in range(w):
            if abs(x - cx) <= half:
                grid[y][x] = 1

    # The tuft: narrower than the shoulders by design, tapering upward, and
    # solid — its whole reason to exist is that the art's separate fronds
    # break into specks as the aperture closes.
    for y in range(shoulder_y):
        t = (y + 1) / shoulder_y
        half = TUFT_HALF_W * t
        for x in range(w):
            if abs(x - cx) <= half:
                grid[y][x] = 1

    return grid


def despeckle(im: Image.Image) -> Image.Image:
    """
    Close the pinholes a nearest-neighbour rotation leaves behind.

    Rotating a 13px sprite on a whole-pixel grid drops the odd pixel out of an
    edge and punches the odd hole in the body. On a normal sprite that is a
    blemish; on a MASK it is a speck of black floating inside the aperture, and
    a hole in the shutter where there should be none.

    So: any transparent pixel with three or more solid orthogonal neighbours is
    filled, and any solid pixel with fewer than two is dropped. The first mends
    the body, the second sheds the orphans left along the edge.
    """
    w, h = im.size
    px = im.load()
    solid = [[px[x, y][3] > 0 for x in range(w)] for y in range(h)]

    def neighbours(x: int, y: int) -> int:
        n = 0
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and solid[ny][nx]:
                n += 1
        return n

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            n = neighbours(x, y)
            # Only FILL holes; never drop a solid pixel. Shedding thin pixels
            # was eating the tuft's corners — the narrowest part of the shape
            # is exactly where a rotation leaves single-neighbour pixels, and
            # they are silhouette, not noise.
            keep = solid[y][x] or n >= 3
            if keep:
                op[x, y] = (255, 255, 255, 255)
    return out


def to_image(grid: list[list[int]], w: int, h: int) -> Image.Image:
    """White where the mask is solid, fully transparent everywhere else."""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y in range(h):
        for x in range(w):
            if grid[y][x]:
                px[x, y] = (255, 255, 255, 255)
    return im


def main() -> None:
    w, h = MASK_W, MASK_H
    grid = draw_carrot(w, h)

    im = to_image(grid, w, h)

    # Pad first, then rotate about the middle, so no corner is cut off.
    padded = Image.new("RGBA", (w + PAD * 2, h + PAD * 2), (0, 0, 0, 0))
    padded.paste(im, (PAD, PAD))

    # NEAREST, always: this is a mask for pixel art blown up past a screen's
    # diagonal, and any interpolation here becomes a soft grey fringe that the
    # renderer will happily turn into a blurry hole.
    rotated = padded.rotate(TILT_DEG, resample=Image.NEAREST, expand=True)
    rotated = despeckle(rotated)

    # Trim back to the ink, so the sprite's box IS its shape — the wipe scales
    # by height, and dead padding would shrink the visible carrot.
    bbox = rotated.getbbox()
    if bbox is None:
        raise SystemExit("the mask came out empty — check LEAF_ROWS and TILT_DEG")
    final = rotated.crop(bbox)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, "WEBP", lossless=True)

    solid = sum(1 for p in final.getdata() if p[3] > 0)
    print(f"{OUT}  {final.width}x{final.height}  {solid} px solid  tilt {TILT_DEG}deg")

    # An ASCII proof on stdout: this is a shape, and a shape is checked by
    # looking at it, not by trusting that the maths was right.
    px = final.load()
    for y in range(final.height):
        print("".join("#" if px[x, y][3] > 0 else "." for x in range(final.width)))


if __name__ == "__main__":
    main()
