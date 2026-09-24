"""The Godot client's [x]: a square, bevelled wooden key, one sheet per state.

    python3 tools/draw-close-square.py

Same wood and cream as the round knob of draw-close.py (the web keeps that
one), but square: a bark rim with notched corners, a lit top-left bevel, a
shaded bottom-right one, and a two-pixel lip under the face that is the key's
thickness. Pressed sinks the face into its lip instead of shrinking it.

Drawn at 1x on a 16px grid, nearest-scaled x2: 32px on screen at the 890x400
reference, where one art pixel is exactly two screen pixels (the project
filters textures NEAREST, so it stays crisp when the canvas stretches).
"""
from PIL import Image

N = 16
SCALE = 2
OUT = 'godot/assets/ui/close-{}.png'

# draw-close.py's palette (woodland.css).
RIM = (58, 34, 20, 255)       # #3a2214 bark rim
FACE = (140, 86, 54, 255)     # #8c5636 the plank's mid wood
LIGHT = (176, 116, 74, 255)   # #b0744a top-left lit edge
SHADE = (104, 62, 38, 255)    # #683e26 bottom-right shade
LIP = (74, 41, 24, 255)       # #4a2918 the key's side, under the face
X = (255, 240, 203, 255)      # #fff0cb the kit's cream ink
XSH = (74, 41, 24, 255)       # the X's one-pixel drop shadow
# Hover: the whole face lifts, like the knob's.
HFACE = (170, 108, 68, 255)
HLIGHT = (206, 142, 94, 255)
HSHADE = (128, 78, 48, 255)
# Disabled: the same wood gone grey, the X faded into it.
DFACE = (120, 104, 92, 255)
DLIGHT = (146, 130, 116, 255)
DSHADE = (94, 80, 70, 255)
DLIP = (70, 58, 50, 255)
DX = (188, 176, 158, 255)
# Keyboard focus: an overlay drawn over the key, the rim turned gold.
GOLD = (255, 200, 61, 255)    # Palette.GOLD


def key(state):
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = im.load()
    face, light, shade, lip, ink = FACE, LIGHT, SHADE, LIP, X
    if state == 'hover':
        face, light, shade = HFACE, HLIGHT, HSHADE
    elif state == 'disabled':
        face, light, shade, lip, ink = DFACE, DLIGHT, DSHADE, DLIP, DX
    sunk = 2 if state == 'pressed' else 0

    # The rim, corners notched: square, but a pixel key, not a vector box.
    for i in range(N):
        for j in (0, N - 1):
            px[i, j] = RIM
            px[j, i] = RIM
    for c in ((0, 0), (N - 1, 0), (0, N - 1), (N - 1, N - 1)):
        px[c] = (0, 0, 0, 0)

    # Inside the rim: the lip at the bottom, the face on top of it. Pressed,
    # the face drops by the lip's height and the gap above it is shadow.
    top, bottom = 1 + sunk, N - 4 + sunk
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            px[x, y] = lip
    for y in range(top, bottom + 1):
        for x in range(1, N - 1):
            px[x, y] = face
    if state == 'pressed':
        # Sunk: the bevel turns over, the top-left now in shade, nothing lit.
        for x in range(1, N - 1):
            px[x, top] = shade
        for y in range(top, bottom + 1):
            px[1, y] = shade
    else:
        for x in range(1, N - 2):
            px[x, top] = light
        for y in range(top, bottom):
            px[1, y] = light
        for x in range(2, N - 1):
            px[x, bottom] = shade
        for y in range(top + 1, bottom + 1):
            px[N - 2, y] = shade

    # The X: two diagonals two pixels thick, a one-pixel shadow under them,
    # centred on the face.
    x0, y0, span = 4, 3 + sunk, 7
    if state != 'disabled':
        for i in range(span):
            for dx in (0, 1):
                px[x0 + i + dx, y0 + i + 1] = XSH
                px[x0 + span - 1 - i + dx, y0 + i + 1] = XSH
    for i in range(span):
        for dx in (0, 1):
            px[x0 + i + dx, y0 + i] = ink
            px[x0 + span - 1 - i + dx, y0 + i] = ink
    return im


def focus_ring():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = im.load()
    for i in range(1, N - 1):
        for j in (0, N - 1):
            px[i, j] = GOLD
            px[j, i] = GOLD
    return im


sheets = {s: key(s) for s in ('normal', 'hover', 'pressed', 'disabled')}
sheets['focus'] = focus_ring()
for state, im in sheets.items():
    big = im.resize((N * SCALE, N * SCALE), Image.NEAREST)
    big.save(OUT.format(state))
    print(state, big.size)
