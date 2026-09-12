#!/usr/bin/env python3
"""
Cut the energy bar's pixel art out of Tiny Swords' UI bars.

This used to DRAW the gauge in code, in fuse's blue-night/neon palette. The
game around it is Tiny Swords' wood and brass, and a neon tube in a HUD made of
planks was the one piece of UI that still read as borrowed from another game.
So the shape stays and the source changes: the slices below are cut from
`art-source/.../Bars/BigBar_{Base,Fill}.png` rather than plotted pixel by pixel.

What did NOT change is the contract, because the CSS and the component are
built on it: the same nine filenames, the same 9-slice geometry (fixed ends, a
1px middle repeated between them, a fill that sits in the channel the ends
leave), and lossless WebP at 1x — the page scales it with `image-rendering:
pixelated`, and lossy compression would smear exactly the hard edges the art is
made of. Re-running this replaces the sprites in place; nothing else moves.

Tiny Swords ships each bar as one 320px sheet holding three pieces at 64px
intervals — left cap, repeatable body, right cap — which is the same 9-slice
idea under another layout, so the cut is a crop rather than a redraw.

The one thing the source cannot give is COLOUR. Tiny Swords' fill is a single
red, and energy's fill is the reading: gold while the run is healthy, amber
when a bomb would hurt, red when the next one ends it. So the fill's banding —
shadow, body, specular — is taken from the art and re-tinted per state, which
keeps one lighting model across all three while letting the hue carry meaning.
"""
from PIL import Image

SRC = "art-source/tiny-swords-png/UI Elements/UI Elements/Bars/BigBar_Base.png"
SRC_FILL = "art-source/tiny-swords-png/UI Elements/UI Elements/Bars/BigBar_Fill.png"
OUT = "public/assets/gauge"

# Where the three pieces sit in the 320px sheet, measured off the source's
# opaque columns rather than guessed: (left cap, body, right cap).
SLICES = {"base": (40, 64), "mid": (128, 192), "cap": (256, 280)}

# The body is 64px of identical wood; one column of it tiles to any width, and
# a 1px middle is what keeps the HUD's bar cheap at any length.
MID_W = 1

# The fill's three bands in the source, read off BigBar_Fill: a dark rim, the
# body, and the specular streak that catches the light near the top. Given as
# (y_start, y_end, role) over the source's 24px height.
BANDS = ((0, 2, "dark"), (3, 4, "body"), (5, 7, "spec"), (8, 13, "body"), (14, 23, "dark"))

# Energy's three states. Names say the STATE, never the hue, so the component
# picks a meaning and this file decides what that looks like. Each is
# (dark, body, spec) — the same three roles the source's banding uses.
FILLS = {
    "carrot": ((150, 86, 0, 255), (255, 176, 0, 255), (255, 230, 150, 255)),
    "warn":   ((150, 70, 0, 255), (255, 138, 0, 255), (255, 205, 130, 255)),
    "danger": ((150, 12, 46, 255), (255, 62, 62, 255), (255, 167, 98, 255)),
}


def sheet(path):
    return Image.open(path).convert("RGBA")


def shell_slice(src, part):
    """One piece of the empty tube, cropped from the sheet."""
    x0, x1 = SLICES[part]
    if part == "mid":
        # One column, not the whole 64px body: it repeats, so the rest is
        # bytes the page would download to draw the same pixels again.
        x1 = x0 + MID_W
    return src.crop((x0, 0, x1, src.height))


def fill_slice(w, part, colors):
    """The liquid inside: 'cap' is the bright leading crest, 'mid' repeats.

    Height is the source fill's, so it lands in the channel the shell's walls
    leave without the CSS having to know either number.
    """
    dark, body, spec = colors
    role = {"dark": dark, "body": body, "spec": spec}
    h = sum(b - a + 1 for a, b, _ in BANDS)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for a, b, kind in BANDS:
        for y in range(a, b + 1):
            for x in range(w):
                img.putpixel((x, y), role[kind])
    if part == "cap":
        # A bright crest on the leading edge, so the bar's head pops off the
        # wood instead of dissolving into it. The source has no such crest —
        # its bar is always full — but a gauge that moves needs its end read at
        # a glance, so it is added here in the fill's own light colour.
        for y in range(h):
            img.putpixel((w - 1, y), spec)
    return img


def build():
    made = []
    src = sheet(SRC)
    for part in ("base", "mid", "cap"):
        img = shell_slice(src, part)
        name = f"{OUT}/bar-shell-{part}.webp"
        # Lossless, always: WebP's lossy mode blends neighbouring pixels, which
        # is precisely the hard edge this art is made of.
        img.save(name, lossless=True)
        made.append((name, img.size))
    for cname, colors in FILLS.items():
        for part, w in (("cap", 3), ("mid", MID_W)):
            img = fill_slice(w, part, colors)
            name = f"{OUT}/bar-fill-{cname}-{part}.webp"
            img.save(name, lossless=True)
            made.append((name, img.size))
    return made


if __name__ == "__main__":
    for name, size in build():
        print(f"{size[0]:>3}x{size[1]:<3} {name.split('/')[-1]}")
