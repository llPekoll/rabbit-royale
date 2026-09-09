#!/usr/bin/env python3
"""
Generate the energy bar's pixel art, after fuse's gauge (art/fuse/gen_bars.py).

Same 9-slice idea, same palette, turned on its side: fuse's gauge is vertical
because it stands next to a button, ours is horizontal because it lives in a
HUD strip on a phone, where vertical space is the scarce one. So the repeatable
slice is 1px WIDE and the caps are left/right rather than top/bottom.

Drawn in code rather than by hand so the whole set stays on one grid and one
palette, and so a colour tweak is a re-run instead of a re-draw. Output is 1x
pixel art — the page scales it with image-rendering: pixelated, which is what
keeps the edges hard.

Palette follows the INSERT COIN logo, held identical to fuse's: heavy near-black
outline, saturated core, a lighter bevel and a darker one, no anti-aliasing.
"""
from PIL import Image

OUT = "public/assets/ui/gauge"

# ── Palette ───────────────────────────────────────────────────────────────
OUTLINE = (10, 8, 20, 255)
SHELL_D = (32, 30, 52, 255)
SHELL_M = (48, 46, 74, 255)
SHELL_L = (72, 70, 104, 255)
VOID    = (18, 16, 32, 255)
CLEAR   = (0, 0, 0, 0)

# Energy's three states, not fuse's four multipliers: full, low, and the last
# bomb's worth. Names say the STATE, so the component never picks a hue.
FILLS = {
    "carrot": ((170, 96, 0, 255), (255, 176, 0, 255), (255, 224, 130, 255), (255, 248, 220, 255)),
    "warn":   ((150, 84, 0, 255), (255, 138, 0, 255), (255, 200, 120, 255), (255, 244, 214, 255)),
    "danger": ((150, 12, 46, 255), (255, 23, 68, 255), (255, 130, 150, 255), (255, 225, 230, 255)),
}

H = 14          # bar height in source pixels — fuse's W, on its side
CAP_W = 6       # right end of the shell (fuse's cap)
BASE_W = 7      # left end of the shell (fuse's base)
MID_W = 1       # the repeatable slice


def px(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def hline(img, x0, x1, y, c):
    for x in range(x0, x1 + 1):
        px(img, x, y, c)


def vline(img, x, y0, y1, c):
    for y in range(y0, y1 + 1):
        px(img, x, y, c)


def shell_slice(w, part):
    """One piece of the empty tube: 'cap' (right), 'mid', or 'base' (left)."""
    img = Image.new("RGBA", (w, H), CLEAR)
    # Outer outline, 2px so it reads at scale.
    for y in (0, 1, H - 2, H - 1):
        hline(img, 0, w - 1, y, OUTLINE)
    # Inner walls: light on top, dark below — one light source, top-left, held
    # across every asset (fuse lights left/right; on its side that is up/down).
    hline(img, 0, w - 1, 2, SHELL_L)
    hline(img, 0, w - 1, 3, SHELL_M)
    hline(img, 0, w - 1, H - 4, SHELL_D)
    hline(img, 0, w - 1, H - 3, SHELL_D)
    # The empty channel.
    for y in range(4, H - 4):
        hline(img, 0, w - 1, y, VOID)

    if part == "base":
        # Rounded-off corners, stepped — never a smooth curve.
        for x, inset in enumerate((4, 2, 1, 0, 0, 0, 0)):
            for y in range(0, inset):
                px(img, x, y, CLEAR)
                px(img, x, H - 1 - y, CLEAR)
            px(img, x, inset, OUTLINE)
            px(img, x, H - 1 - inset, OUTLINE)
        vline(img, 0, 4, H - 5, OUTLINE)
        vline(img, 1, 4, H - 5, OUTLINE)
        vline(img, 2, 4, H - 5, SHELL_M)
        vline(img, 3, 4, H - 5, SHELL_D)
    elif part == "cap":
        for i, inset in enumerate((0, 0, 1, 2, 4, 4)):
            x = i
            if inset:
                for y in range(0, inset):
                    px(img, x, y, CLEAR)
                    px(img, x, H - 1 - y, CLEAR)
                px(img, x, inset, OUTLINE)
                px(img, x, H - 1 - inset, OUTLINE)
        vline(img, w - 1, 4, H - 5, OUTLINE)
        vline(img, w - 2, 4, H - 5, OUTLINE)
        vline(img, w - 3, 4, H - 5, SHELL_L)
    return img


def fill_slice(w, part, colors):
    """The liquid inside: 'cap' is the bright leading crest, 'mid' repeats."""
    dark, mid, light, spark = colors
    img = Image.new("RGBA", (w, H - 8), CLEAR)
    h = img.height
    for y in range(h):
        for x in range(w):
            # Banding in flat steps across the bar's thickness, never a
            # smooth gradient.
            c = mid
            if y < 2:
                c = light
            elif y >= h - 2:
                c = dark
            img.putpixel((x, y), c)
    if part == "cap":
        # Bright crest on the leading edge, so the bar's head pops off the tube.
        vline(img, w - 1, 0, h - 1, spark)
        vline(img, w - 2, 0, h - 1, light)
        px(img, w - 1, 1, (255, 255, 255, 255))
        px(img, w - 1, 2, (255, 255, 255, 255))
    return img


def build():
    made = []
    for part, w in (("base", BASE_W), ("mid", MID_W), ("cap", CAP_W)):
        img = shell_slice(w, part)
        name = f"{OUT}/bar-shell-{part}.png"
        img.save(name)
        made.append((name, img.size))
    for cname, colors in FILLS.items():
        for part, w in (("cap", 3), ("mid", MID_W)):
            img = fill_slice(w, part, colors)
            name = f"{OUT}/bar-fill-{cname}-{part}.png"
            img.save(name)
            made.append((name, img.size))
    return made


if __name__ == "__main__":
    for name, size in build():
        print(f"{size[0]:>3}x{size[1]:<3} {name.split('/')[-1]}")
