#!/usr/bin/env python3
"""
Turn the hand-drawn carrot silhouette into the iris' aperture mask.

The wipe (src/game/fx/CarrotWipe.ts) cuts a carrot-shaped hole out of a black
sheet, and a Pixi mask reads ALPHA and nothing else. The drawing this starts
from is white-on-black and fully opaque — its shape lives in its colour — so as
a mask it would cover the screen in one solid block. Converting luminance to
alpha is the whole job.

Everything the mask needs is already in the drawing: it leans, its leaves read
as leaves, and it has a waist. An earlier version of this script drew the shape
from scratch, because deriving it from the kit's carrot SPRITE kept producing a
soft blob (that sprite carries its form in shading as much as in outline, and
alpha keeps only the outline). A drawn silhouette settles it properly — the
shape is authored once, by eye, in the file it belongs in.

    python3 tools/gen_carrot_mask.py

Re-run it whenever the drawing changes; the game loads the OUTPUT, so an edit
to the source does not reach the wipe until this has run.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path("public/assets/misc/carrote_silouhette.png")
OUT = Path("public/assets/fx/carrot-mask.webp")

# Luminance above this is inside the shape. The drawing is hard black and hard
# white, so anything near the middle works; the midpoint keeps it that way if
# the source is ever redrawn with a soft edge.
THRESHOLD = 127


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"no silhouette at {SRC}")

    src = Image.open(SRC).convert("RGBA")
    w, h = src.size
    px = src.load()

    # White where the drawing is light, fully transparent where it is dark.
    # White because a mask is read for its alpha alone — any other colour would
    # be a claim about the file that is not true.
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    solid = 0
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Rec. 601 luma: the drawing is greyscale, but a stray coloured
            # pixel should still land on the side its brightness says.
            if (r * 299 + g * 587 + b * 114) / 1000 > THRESHOLD:
                op[x, y] = (255, 255, 255, 255)
                solid += 1

    # Trim to the ink: the wipe scales the sprite by height, so any dead margin
    # in the box would shrink the visible carrot and shift it off centre.
    bbox = out.getbbox()
    if bbox is None:
        raise SystemExit("the mask came out empty — check THRESHOLD")
    final = out.crop(bbox)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Lossless: this is a hard-edged silhouette blown up past a screen's
    # diagonal, and lossy compression would smear the one thing it is made of.
    final.save(OUT, "WEBP", lossless=True)

    print(f"{OUT}  {final.width}x{final.height}  {solid} px solid  (from {w}x{h})")

    # An ASCII proof on stdout: a shape is checked by looking at it.
    fp = final.load()
    step = max(1, final.height // 34)
    for y in range(0, final.height, step * 2):
        print("".join("#" if fp[x, y][3] > 0 else "." for x in range(0, final.width, step)))


if __name__ == "__main__":
    main()
