#!/usr/bin/env python3
"""
Generate the sound control's speaker icon, in the arcade-kit's pixel idiom.

WHY IN CODE. The kit ships no speaker sprite (it has arrows, a cup, a glove, a
chat bubble — no audio glyph), so this one had to be drawn. Drawn HERE rather
than by hand for the same reason as the gauge (tools/gen_energy_bar.py): the two
states stay on one grid and one palette, and a colour tweak is a re-run instead
of a re-draw.

THE GRID. 16x16, which is the kit's own `UNIT` for button sprites — so the icon
lands on whole pixels at every scale the button is rendered at, and never falls
between them the way the emoji it replaces did.

TWO STATES, ONE CONE. `on` and `off` share an identical speaker body: only the
right-hand side changes (waves vs. a cross). A toggle whose two faces redraw the
whole glyph reads as two different buttons; holding the body fixed makes the
change read as the state changing, which is what it is.

Palette is the kit's own button ink — near-black outline, white face — because
this rides ON a NineSliceButton and has to look like it was cut from the same
sheet as the [X]. No anti-aliasing, ever: the page scales these with
image-rendering: pixelated, and a soft edge would smear exactly the hard pixels
the art is made of.

Output is 1x lossless WebP, like every other generated sprite in this repo.
"""
from PIL import Image

OUT = "public/assets/sound"

# ── Palette ───────────────────────────────────────────────────────────────
# The kit's [X] is a white glyph on a dark grey face; this matches it exactly so
# the two controls read as one set. The outline is the kit's button ink.
INK = (12, 10, 18, 255)      # the heavy outline every kit sprite carries
FACE = (255, 255, 255, 255)  # the glyph itself — white, like the [X]
MUTE = (193, 68, 46, 255)    # the cross — RR's own DANGER red (burrow-chrome)
CLEAR = (0, 0, 0, 0)

S = 16  # 16x16 — the kit's UNIT, so the icon lands on whole button pixels


def px(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def hline(img, x0, x1, y, c):
    for x in range(x0, x1 + 1):
        px(img, x, y, c)


def vline(img, x, y0, y1, c):
    for y in range(y0, y1 + 1):
        px(img, x, y, c)


def speaker_body(img):
    """
    The cabinet + cone, identical in both states.

    Sits in the LEFT half (x 1..8) so the right half is free for whatever the
    state needs to say. Vertically centred on the 16px grid: the neck spans
    y 6..9 and the cone flares out to y 2..13, which keeps one pixel of air
    top and bottom at every scale.

    Built as a SILHOUETTE first (the white face), then outlined by walking the
    silhouette and inking any transparent pixel that touches it. Drawing the
    outline by hand column by column is what leaked a stray bar down the right
    edge; deriving it from the shape cannot, because there is only one shape.
    """
    # The neck: a small block at x 2..4, y 6..9.
    for y in range(6, 10):
        hline(img, 2, 4, y, FACE)

    # The cone: opens up and to the right, two rows taller per column, so the
    # flare reads as a triangle and not as a second box.
    for i, x in enumerate(range(5, 9)):
        top = 6 - (i + 1) * 1
        bot = 9 + (i + 1) * 1
        vline(img, x, top, bot, FACE)

    # Outline: ink every clear pixel orthogonally adjacent to the face. One
    # pass over a snapshot so freshly-inked pixels never seed more outline.
    face = {(x, y) for x in range(S) for y in range(S)
            if img.getpixel((x, y)) == FACE}
    for (x, y) in face:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) not in face:
                px(img, nx, ny, INK)


def draw_on():
    """Speaker + two arcs: sound is coming out."""
    img = Image.new("RGBA", (S, S), CLEAR)
    speaker_body(img)
    # Two arcs, near and far, each 2px thick so they carry the same visual
    # weight as the speaker's outline instead of reading as thin brackets.
    #
    # An arc at this size is a vertical span whose ENDS pull back toward the
    # cone by one pixel — that back-step is the entire difference between a
    # curve and a parenthesis. A real arc would need anti-aliasing, which is
    # the one thing this art cannot have.
    #
    # Near arc: 2px wide at x 10..11, spanning y 6..9, ends pulled in at x 10.
    vline(img, 11, 6, 9, FACE)
    vline(img, 10, 7, 8, FACE)
    # Far arc: 2px wide at x 13..14, taller (y 4..11), same construction. The
    # gap between the two is what makes them read as radiating, not as a wall.
    vline(img, 14, 4, 11, FACE)
    vline(img, 13, 6, 9, FACE)
    return img


def draw_off():
    """Speaker + a cross: the sound is stopped."""
    img = Image.new("RGBA", (S, S), CLEAR)
    speaker_body(img)
    # An X in the space the waves occupied, centred on the same axis (y 7/8) so
    # the two states share an optical centre and the button does not appear to
    # jump when it is toggled.
    #
    # Six columns (x 10..15) over six rows (y 5..10), so the cross fills the
    # same box the two arcs did and reads at the same weight. Each stroke is
    # 2px thick — a 1px X disappears against artwork at small scales, and this
    # control sits over a hand-painted burrow.
    for i in range(6):
        for t in (0, 1):
            px(img, 10 + i, 5 + i + t, MUTE)      # ╲
            px(img, 10 + i, 10 - i + t, MUTE)     # ╱
    return img


def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    for name, img in (("speaker-on", draw_on()), ("speaker-off", draw_off())):
        path = f"{OUT}/{name}.webp"
        img.save(path, "WEBP", lossless=True)
        print(f"wrote {path} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
