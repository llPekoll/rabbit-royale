#!/usr/bin/env python3
"""
Cut the iris' OTHER two apertures — a rabbit skull and a bomb — out of sprites
the game already ships.

The carrot's mask comes from a silhouette drawn by hand for the job
(tools/gen_carrot_mask.py). These two do not: a skull and a bomb are already in
the kit, and drawing them a second time by eye would give the wipe two shapes
that mean the same thing as the sprites but do not match them.

Both are read from their ALPHA, which is all a Pixi mask looks at. That works
here where it failed for the carrot (whose sprite carries its form in shading,
so its alpha came out a blob) because these two are drawn as outlines: a ball
with a fuse, and a skull with ears.

WHICH RABBIT was the thing got wrong first, twice. The live sprite sheet came
first: its 64 frames differ mostly in shading, but their SILHOUETTES differ
too, and most of them are a rounded rectangle with a notch in the top —
recognisable as a rabbit only because you already know it is one. `idle` was
the pick of a bad set, and still only a lump with two ears.

RR-Skull is the shape that actually reads. The ears are SEPARATED by a gap
that runs down into the cranium, so the eye gets a contour to hold on to at the
one size that matters — an aperture is only a shape during the moment it is
small, and a notch closes up long before a gap does. It is also the right thing
to mean: this wipe covers a death, a raid and a return to the burrow, and a
skull says so where a live rabbit idling does not.

    python3 tools/gen_wipe_masks.py

Re-run it whenever the source sprites change; the game loads the OUTPUT.

EACH MASK IS WRITTEN TWICE: a `.webp` the game loads, and a `.png` beside it
in tools/masks/ to open in Aseprite. A derived silhouette is a STARTING POINT,
not an answer — the trip through an alpha channel gives you the sprite's
outline, but an aperture is judged at a size the sprite never gets drawn at,
and the pixel that wants thickening to survive that is a thing you can only see
by looking. So the PNG is the editable copy.

And a PNG that has been edited WINS. Re-running this after retouching a mask
would otherwise throw the retouch away and put the raw silhouette back, which
is the one thing a tool that gets re-run "whenever the source sprites change"
must not do to work that took a hand. So: if the PNG exists, it is baked to
webp as-is and the source sprite is not read at all. Delete the PNG to go back
to the derived shape.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SKULL = Path("public/assets/bunnies/RR-Skull.webp")
BOMB = Path("public/assets/misc/RR-Bomb-Small.webp")
OUT_DIR = Path("public/assets/fx")

# Where the editable copies live: OUT of public/, because these are source art
# for a build step, not something the game should be able to fetch. A stray
# `/assets/fx/bunny-mask.png` served next to the webp is an invitation to load
# the wrong one.
EDIT_DIR = Path("tools/masks")

# Alpha above this is inside the shape. The sprites are pixel art with hard
# edges, so this only ever catches a stray antialiased pixel at the rim; it is
# there so a resave of a source with a soft edge cannot smuggle a grey fringe
# into a silhouette.
ALPHA_THRESHOLD = 127

def trim(img: Image.Image) -> Image.Image:
    """Crop to the ink. The wipe sizes the hole by HEIGHT, so empty margin in
    the box is not neutral: it shrinks the shape and shifts it off centre."""
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("the mask came out empty — check the source sprite")
    return img.crop(bbox)


def silhouette(src: Image.Image) -> Image.Image:
    """Flatten to white-on-transparent, trimmed to the ink.

    White because a mask is read for its alpha alone — any other colour would
    be a claim about the file that is not true. Trimmed because the wipe scales
    the sprite by HEIGHT: dead margin in the box would shrink the visible shape
    and shift it off centre.
    """
    w, h = src.size
    px = src.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > ALPHA_THRESHOLD:
                op[x, y] = (255, 255, 255, 255)
    return trim(out)


def show(img: Image.Image, name: str) -> None:
    """An ASCII proof on stdout: a shape is checked by looking at it."""
    px = img.load()
    step = max(1, img.height // 34)
    print(f"--- {name}  {img.width}x{img.height}")
    for y in range(0, img.height, step * 2):
        print("".join("#" if px[x, y][3] > 0 else "." for x in range(0, img.width, step)))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    EDIT_DIR.mkdir(parents=True, exist_ok=True)

    for name, src_path in (("bunny-mask", SKULL), ("bomb-mask", BOMB)):
        edit = EDIT_DIR / f"{name}.png"

        if edit.exists():
            # A retouched mask. Bake it and leave it alone — see the note at the
            # top: the hand always beats the derivation.
            img = Image.open(edit).convert("RGBA")
            # Trimmed on the way through all the same. Aseprite pads a canvas
            # freely, and the wipe scales the sprite by HEIGHT, so margin left
            # around the drawing would shrink the hole and push it off centre —
            # a mask that looked right in the editor and small on screen.
            img = trim(img)
            origin = f"{edit} (hand-edited)"
        else:
            if not src_path.exists():
                raise SystemExit(f"missing source sprite: {src_path}")
            img = silhouette(Image.open(src_path).convert("RGBA"))
            img.save(edit)
            origin = str(src_path)

        out = OUT_DIR / f"{name}.webp"
        # Lossless: these are hard-edged silhouettes blown up past a screen's
        # diagonal, and lossy compression would smear the one thing they are
        # made of.
        img.save(out, "WEBP", lossless=True)
        print(f"{out}  {img.width}x{img.height}   <- {origin}")
        show(img, name)


if __name__ == "__main__":
    main()
