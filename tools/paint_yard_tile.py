"""The burrow's YARD: one iso ground tile of earth, in the style of the
earth burrows' own ground (public/assets/buildings/previews/
burrow-earth-levels.png) — brown soil, olive moss in patches, a few pebbles.

    python3 tools/paint_yard_tile.py godot/assets/terrain/yard-tile.png

Same frame as the flat sheet's tiles (tilemap-flat.webp): 64x64, the top
diamond 42x21 at (11, 20), a 6-pixel flank under it. The four cells under the
house are laid with it instead of turf (burrow_terrain.gd `paint_yard`): the
house art paints no ground of its own ("le sol compose de 4 tiles de base").
"""
import sys
from PIL import Image

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from paint_burrows import noise  # noqa: E402

T = 64
CX, CY = 32.0, 30.5       # centre of the top diamond
HW, HH = 21.0, 10.5
FLANK = 6

SOIL = ['#6e4a2e', '#86593a', '#9c6b45', '#b07c50', '#c39062']
MOSS = ['#6f7a33', '#8c963e', '#a9ad4f', '#c4c46a']
RIM_DARK = '#4f3322'
PEBBLE = ['#8f8a7c', '#b6b1a2', '#d8d3c3']


def rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def main(out):
    im = Image.new('RGBA', (T, T), (0, 0, 0, 0))
    px = im.load()
    for y in range(T):
        for x in range(T):
            dx = (x + 0.5 - CX) / HW
            dy = (y + 0.5 - CY) / HH
            d = abs(dx) + abs(dy)
            if d <= 1.0:
                # The top: soil, lit from the upper left, moss in patches.
                n = noise(x, y, 41)
                m = noise(x // 3, y // 2, 77)
                shade = 2 + (1 if (dx + dy) < -0.25 else 0) - (1 if (dx + dy) > 0.45 else 0)
                shade += 1 if n > 0.8 else (-1 if n < 0.15 else 0)
                colour = SOIL[max(0, min(4, shade))]
                if m > 0.62 and d > 0.35:
                    colour = MOSS[min(3, int((m - 0.62) / 0.1) + (1 if dy < 0 else 0))]
                if n > 0.975:
                    colour = PEBBLE[2 if dy < 0 else 1]
                elif n > 0.955:
                    colour = PEBBLE[0]
                if d > 0.9 and dy > 0:
                    colour = RIM_DARK          # the lip, where the top turns down
                px[x, y] = rgb(colour)
                continue
            # The flank under the two front edges.
            for k in range(1, FLANK + 1):
                ddy = (y - k + 0.5 - CY) / HH
                if abs(dx) + abs(ddy) <= 1.0 and ddy > 0:
                    left = dx < 0
                    colour = SOIL[1] if left else SOIL[0]
                    if k == FLANK:
                        colour = RIM_DARK
                    elif noise(x, y, 5) > 0.85:
                        colour = SOIL[2] if left else SOIL[1]
                    px[x, y] = rgb(colour)
                    break
    im.save(out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'yard-tile.png')
