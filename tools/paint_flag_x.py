"""The red X a player stamps on a tile they think hides a bomb — in pixels.

    python3 tools/paint_flag_x.py godot/assets/fx/flag-x.png

Godot drew it with smooth lines (tile_view.gd `FlagMark`, the web's
`Tile.setFlag`), which read as vector ink on a pixel-art board. This paints
the same mark at the ground's own pixel size: one painted pixel is one pixel
of the dig tile (42 painted px across a 44 px diamond).

LYING ON THE GROUND. The X is two strokes along the diamond's diagonals, so
each is a classic 2:1 iso line — two pixels across for one down. The web's
reach (0.62 of the half height, squashed 1.5 x 0.75) puts the tips at about
+-11 x +-5.5; the strokes keep their weight (a dark rim 7 wide round a red
core 4 wide), with a lit top edge and a dark drop under it, so the X sits on the
sod rather than floating over it.
"""
import sys
from PIL import Image

W, H = 30, 18
CX, CY = 15.0, 8.5
# Tips of the strokes, in painted pixels: 2:1 iso diagonals.
REACH_X, REACH_Y = 10.0, 5.0

RIM = (0x3a, 0x0d, 0x0d, 255)
RED = (0xff, 0x5a, 0x4a, 255)
LIT = (0xff, 0x9a, 0x84, 255)
# Where the X meets the sod: a soft dark under the bottom rim.
DROP = (0x1a, 0x08, 0x08, 110)


def seg_dist(px, py, ax, ay, bx, by):
    """Distance from a point to a segment, measured with y doubled: a 2:1 iso
    line is a 45-degree line once the ground is un-squashed, so the stroke
    keeps an even width along its length."""
    px, py, ay, by = px, py * 2.0, ay * 2.0, by * 2.0
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    qx, qy = ax + t * dx, ay + t * dy
    return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5


def dist(x, y):
    a = seg_dist(x, y, CX - REACH_X, CY - REACH_Y, CX + REACH_X, CY + REACH_Y)
    b = seg_dist(x, y, CX + REACH_X, CY - REACH_Y, CX - REACH_X, CY + REACH_Y)
    return min(a, b)


CORE = 2.3
EDGE = 3.9


def main(out):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = im.load()
    for y in range(H):
        for x in range(W):
            d = dist(x + 0.5, y + 0.5)
            if d <= CORE:
                # Lit from the upper left like the sod: the pixel above is
                # further out of the core → this is the stroke's top edge.
                up = dist(x + 0.5, y - 0.5)
                down = dist(x + 0.5, y + 1.5)
                # The shade stays in the rim: a darker row inside the core
                # muddied the crossing into a knot.
                px[x, y] = LIT if up > CORE and down <= CORE + 1.2 else RED
            elif d <= EDGE:
                px[x, y] = RIM
    # The drop: one pixel under every bottom rim pixel that sits on nothing.
    for y in range(H - 1, 0, -1):
        for x in range(W):
            if px[x, y][3] == 0 and px[x, y - 1] == RIM:
                px[x, y] = DROP
    im.save(out)
    print(f'{out}: {W}x{H}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'godot/assets/fx/flag-x.png')
