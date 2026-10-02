#!/usr/bin/env python3
"""
Generate the settings gear (godot/assets/ui/icons/gear.png).

WHY REDRAWN. The old gear was a 16x16 white silhouette with a black line: on
the hub rail it sat next to the shaded, outlined pickaxe and shop and read as
a placeholder. This one speaks their idiom — navy ink outline, lit from the
top-left, the pickaxe's steel — with a brass hub so it is not a flat grey blob
on the ring's dark stone.

THE SHAPE. 24x24 (+1 px of ink each side). Square teeth, not polar ones: at
this size teeth cut by angle come out as thin spikes (a snowflake), while four
straight bars plus four corner blocks give eight chunky teeth of equal reach.
The hole is round, the hub a brass washer with a groove around it.

DRAWN STRAIGHT, SHOWN TURNED. The hub button turns the
glyph 45 degrees in the interface (sound_cluster.gd), so that a corner tooth
points up. A pre-turned drawing and a narrow-top-tooth redraw were both tried
and rejected (2026-10-02): keep this art, turn the node.

STEEL, NOT GOLD. A gold gear was tried: it reads well but looks like the gold
carrot currency. Light steel keeps it a tool, same family as the pickaxe.

    python3 tools/gen_gear_icon.py
"""
import math
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "godot/assets/ui/icons/gear.png"

INK = (0x16, 0x1C, 0x2E)  # the pickaxe's outline
HI = (0xF4, 0xF8, 0xF0)
LT = (0xC6, 0xD4, 0xD2)
MID = (0x9C, 0xAC, 0xB0)
DK = (0x6C, 0x78, 0x84)
DD = (0x4A, 0x52, 0x60)
BR_L = (0xF8, 0xD0, 0x78)
BR = (0xD8, 0x96, 0x4A)
BR_D = (0x96, 0x5A, 0x34)

N = 24
R_DISC = 7.9  # body
TOOTH_HALF = 3.0  # straight teeth: 6 px wide...
REACH = 11.0  # ...reaching the edge
CORNER = (4.0, 8.0)  # the other four: 4x4 blocks, measured from the centre
R_HOLE = 2.9
R_HUB = 5.0


def solid(x: int, y: int) -> bool:
    if not (0 <= x < N and 0 <= y < N):
        return False
    c = (N - 1) / 2
    dx, dy = x - c, y - c
    r = math.hypot(dx, dy)
    if r <= R_HOLE:
        return False
    if r <= R_DISC:
        return True
    u, v = dx, dy
    if (abs(u) <= TOOTH_HALF and abs(v) <= REACH) or (abs(v) <= TOOTH_HALF and abs(u) <= REACH):
        return True
    lo, hi = CORNER
    return lo <= abs(u) <= hi and lo <= abs(v) <= hi


def main() -> None:
    c = (N - 1) / 2
    im = Image.new("RGBA", (N + 2, N + 2), (0, 0, 0, 0))
    px = im.load()
    sides = ((1, 0), (-1, 0), (0, 1), (0, -1))
    corners = ((1, 1), (-1, -1), (1, -1), (-1, 1))
    for y in range(-1, N + 1):
        for x in range(-1, N + 1):
            at = (x + 1, y + 1)
            if not solid(x, y):
                if any(solid(x + i, y + j) for i, j in sides):
                    px[at] = INK + (255,)
                continue
            dx, dy = x - c, y - c
            r = math.hypot(dx, dy)
            # Light from the top-left: dx + dy < 0 faces it.
            if r <= R_HUB:
                if r <= R_HOLE + 1.05:  # inside of the hole: its far rim catches the light
                    col = BR_D if dx + dy < 0 else BR_L
                else:
                    col = BR_L if dx + dy < -1.5 else BR_D if dx + dy > 1.5 else BR
                px[at] = col + (255,)
                continue
            open_ = [(i, j) for i, j in sides if not solid(x + i, y + j)]
            open_ = open_ or [(i, j) for i, j in corners if not solid(x + i, y + j)]
            if open_:
                d = sum(i + j for i, j in open_)
                col = HI if d <= -2 else LT if d < 0 else DD if d >= 2 else DK if d > 0 else MID
            elif r <= R_HUB + 1.05:  # groove around the washer
                col = DK if dx + dy < 0 else LT
            else:
                col = MID
            px[at] = col + (255,)
    im.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
