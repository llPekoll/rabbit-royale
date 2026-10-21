"""Le Clyde de Discord, 26x26, au trait des icones de la barre (fullscreen.png)
et au violet de la marque (#5865F2) : gris, il passait pour une manette."""
import sys
from PIL import Image

A = (22, 28, 46, 255)     # trait
B = (136, 146, 247, 255)  # lumiere du haut
C = (88, 101, 242, 255)   # corps, #5865F2
SHAPE = """
.....XXXX......XXXX.....
...XXXXXXXXXXXXXXXXXX...
..XXXXXXXXXXXXXXXXXXXX..
.XXXXXXXXXXXXXXXXXXXXXX.
.XXXXXXXXXXXXXXXXXXXXXX.
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXX
.XXXXXXXXXXXXXXXXXXXXXX.
.XXXXXXXX......XXXXXXXX.
..XXXXX..........XXXXX..
...XXX............XXX...
""".strip().splitlines()
EYES = [(x, y) for y in range(7, 12) for x in (7, 8, 15, 16)] + [(x, y) for y in range(8, 11) for x in (6, 9, 14, 17)]

w, h = len(SHAPE[0]), len(SHAPE)
inside = lambda x, y: 0 <= x < w and 0 <= y < h and SHAPE[y][x] == "X"
im = Image.new("RGBA", (26, 26))
ox, oy = 1, (26 - h) // 2
for y in range(h):
    for x in range(w):
        if not inside(x, y):
            continue
        edge = any(not inside(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        light = not edge and (not inside(x, y - 2) or not inside(x - 2, y))
        im.putpixel((ox + x, oy + y), A if edge or (x, y) in EYES else B if light else C)
im.save(sys.argv[1])
