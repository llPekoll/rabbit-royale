#!/usr/bin/env python3
"""
The two launcher-tile marks the game had no art for: a shield and crossed swords.

WHY IN CODE. Same reason as the gauge (tools/gen_energy_bar.py) and the speaker
(tools/gen_sound_icon.py): the set stays on one grid and one palette, and a
colour tweak is a re-run instead of a re-draw. Tiny Swords ships buildings,
units, terrain and bars — no glyph-sized icons — and the shield the game already
draws over a raided burrow is plotted in code inside a Pixi scene, not a sprite
anything else can reuse.

WHAT THEY ARE FOR. BASE and RAIDING, two of the four tiles along the bottom of
the burrow (see `hub-tab.tsx`). SHOP wears the animated loot chest and STORY the
scroll, both of which already exist; these two complete the row.

THE GRID. 32x32, twice the 16x16 the smaller marks use. These are rendered at
roughly half a tile — 40-50px on desktop — where a 16px source would be scaled
by 3x and every diagonal would staircase in steps three screen pixels tall. At
32 the same diagonal has twice the resolution to turn in, which is the whole
difference between a drawn edge and a jagged one.

THE PALETTE IS THE GAME'S. The shield takes the burrow's DANGER red over its
CARROT rim — it is the defensive tile, and red is what the UI already uses to
mean "this is about being hit". The swords are steel over the same carrot
hilts, so the two read as a matched pair rather than as two borrowed icons.

Output is 1x lossless WebP like every generated sprite here: the page scales it
with `image-rendering: pixelated`, and a lossy codec would smear exactly the
hard edges the art is made of.
"""
import os

from PIL import Image

OUT = "public/assets/ui/icons"

# ── Palette ───────────────────────────────────────────────────────────────
# Sampled from the UI these sit in, not invented beside it: the outline is the
# card's own SOIL_DEEP, the accents are burrow-chrome's CARROT and DANGER.
INK = (29, 16, 10, 255)        # SOIL_DEEP — the outline every mark carries
CARROT = (224, 122, 47, 255)   # CARROT — rims and hilts
CARROT_HI = (255, 178, 56, 255)  # LAMP — where the light catches
DANGER = (193, 68, 46, 255)    # DANGER — the shield's face
DANGER_HI = (232, 101, 74, 255)  # its lit half
STEEL = (196, 204, 216, 255)   # blade
STEEL_HI = (245, 248, 255, 255)  # its edge
STEEL_LO = (120, 132, 150, 255)  # its shadowed side
CLEAR = (0, 0, 0, 0)

S = 32


def px(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def outline(img):
    """
    Ink every clear pixel orthogonally touching the drawing.

    Derived from the shape rather than walked by hand — the lesson
    gen_sound_icon.py records, because a hand-walked outline leaks stray pixels
    wherever the silhouette turns. One pass over a SNAPSHOT, so freshly-inked
    pixels never seed more outline.
    """
    solid = {(x, y) for x in range(S) for y in range(S)
             if img.getpixel((x, y))[3] > 0}
    for (x, y) in solid:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in solid:
                px(img, x + dx, y + dy, INK)


def draw_shield():
    """
    A heater shield: square shoulders, sides tapering to a point.

    Built from a per-row WIDTH rather than plotted pixel by pixel, so the taper
    is monotonic by construction — a shield whose edge widens again halfway
    down reads as a bell, and that is the failure mode of drawing this by eye.

    Rows 3..10 are the full-width body, 11..26 taper to the tip. The face is
    split down the middle: the left half lit, the right in shadow, which is the
    same one-light-source model the gauge's fill uses.
    """
    img = Image.new("RGBA", (S, S), CLEAR)
    cx = 16
    for y in range(3, 27):
        if y <= 10:
            half = 11
        else:
            # Taper: full width at row 10, a 2px tip at row 26.
            t = (y - 10) / (26 - 10)
            half = round(11 - t * 9)
        for x in range(cx - half, cx + half):
            # The rim is the outer ring; the face fills what it encloses.
            #
            # THREE pixels thick, not two. At two the rim vanished once the
            # 32px source was scaled up to the ~55px the tile renders it at:
            # carrot on red is two warm tones a hair apart, and a hairline
            # between them is the first thing a scale-up loses. Three pixels of
            # it survives, which is what makes the shield read as a rimmed
            # object rather than as a flat red triangle.
            edge = x < cx - half + 3 or x >= cx + half - 3 or y < 6 or y > 23
            if edge:
                px(img, x, y, CARROT if x >= cx else CARROT_HI)
            else:
                px(img, x, y, DANGER if x >= cx else DANGER_HI)
    outline(img)
    return img


def blade(img, flip, colours):
    """
    One sword, drawn as a continuous run from pommel to tip.

    THE FIRST CUT WAS WRONG and the way it was wrong is worth recording: the
    blade, guard, grip and pommel were each plotted from their own hard-coded
    coordinates, and they did not meet — the outline pass then ringed four
    separate islands, so the icon read as a diagonal streak with loose pixels
    below it rather than as a sword.

    This walks ONE axis instead. `t` runs from the pommel (0) to the tip (1)
    along a single diagonal, and every part of the sword is a range of `t`, so
    the pieces cannot come apart. The guard is the only thing drawn across that
    axis, and it is centred on a `t` that lies on the blade, so it crosses the
    steel it belongs to.

    `colours` lets the two swords differ: the one drawn second is the one lying
    ON TOP, and giving it a lighter steel is what makes the pair read as two
    objects crossing rather than as a flat X.
    """
    steel_hi, steel, steel_lo = colours

    def place(x, y, c):
        px(img, S - 1 - x if flip else x, y, c)

    # The axis: from the pommel at (6, 27) to the tip at (25, 4).
    x0, y0, x1, y1 = 6, 27, 25, 4
    n = 24

    def at(t):
        return round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)

    for i in range(n + 1):
        t = i / n
        x, y = at(t)
        if t < 0.16:
            # Grip: narrow, and the same carrot as the guard it runs into.
            place(x, y, CARROT)
            place(x + 1, y, CARROT_HI)
        else:
            # Blade: three pixels across the diagonal, lit on its upper edge.
            place(x + 1, y, steel_hi)
            place(x, y, steel)
            place(x - 1, y, steel_lo)

    # The pommel: a blunt cap at the axis's start, so the grip ends in
    # something rather than stopping.
    pxx, pyy = at(0)
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0)):
        place(pxx + dx, pyy + dy, CARROT_HI)

    # The guard: a SHORT HORIZONTAL bar where the grip meets the blade.
    #
    # Not perpendicular to the axis, which is what the first two attempts
    # reached for. A true perpendicular here is a 9px diagonal, and at 32px
    # that is indistinguishable from a second blade — it grew two "feet" below
    # each sword and the icon read as a rune. A horizontal guard is what pixel
    # art of this size actually does: it is unambiguous against a diagonal
    # blade precisely because it does not share its direction.
    gx, gy = at(0.17)
    for k in range(-3, 4):
        place(gx + k, gy, CARROT if abs(k) == 3 else CARROT_HI)


def draw_swords():
    """
    Two blades crossed.

    Drawn in two passes with different steel so one clearly lies over the
    other: a single flat X reads as a rune, two overlapping objects read as
    swords.
    """
    img = Image.new("RGBA", (S, S), CLEAR)
    # The one underneath: darker steel throughout, so the overlap has contrast
    # to show at all.
    blade(img, flip=True, colours=(STEEL, STEEL_LO, STEEL_LO))
    # The one on top, drawn second so it wins every shared pixel.
    blade(img, flip=False, colours=(STEEL_HI, STEEL, STEEL_LO))
    outline(img)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, img in (("shield", draw_shield()), ("swords", draw_swords())):
        path = f"{OUT}/{name}.webp"
        img.save(path, "WEBP", lossless=True)
        print(f"wrote {path} ({S}x{S})")


if __name__ == "__main__":
    main()
