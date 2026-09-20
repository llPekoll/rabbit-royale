from PIL import Image, ImageDraw

# Drawn at 1x in source pixels, then nearest-scaled: a pixel sprite, not a
# smooth one. 22x22 gives a crisp 2px rim and a 3px-thick X at 2x/4x.
N = 30

# The kit's palette (woodland.css): bark rim, plank face, parchment ink.
RIM   = (58, 34, 20, 255)     # #3a2214 - darker than --wl-ink, reads as a rim
FACE  = (140, 86, 54, 255)    # #8c5636 - the plank's mid wood
LIGHT = (176, 116, 74, 255)   # #b0744a - top-left lit edge
SHADE = (104, 62, 38, 255)    # #683e26 - bottom-right shade
X     = (255, 240, 203, 255)  # #fff0cb - the kit's cream ink
HFACE = (170, 108, 68, 255)   # hover: the whole face lifts, not just a ring
HLIGHT= (206, 142, 94, 255)
XSH   = (74, 41, 24, 255)     # the X's own drop shadow

def disc(d, cx, cy, r, colour):
    """A filled circle on the pixel grid, no antialiasing."""
    for y in range(N):
        for x in range(N):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                d.point((x, y), colour)

def build(state):
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = (N - 1) / 2
    # The knob: a rim, a lit face, and a shaded underside.
    disc(d, c, c, 14.6, RIM)
    disc(d, c, c, 12.2, SHADE)
    face, light = (HFACE, HLIGHT) if state == 'hover' else (FACE, LIGHT)
    disc(d, c - 0.7, c - 0.8, 11.6, face)
    if state != 'pressed':
        # A lit crescent along the top-left, the way every other kit piece sits.
        disc(d, c - 1.8, c - 2.2, 7.6, light)
    # The X: two 2px strokes with a 1px shadow under them.
    arm = 6
    for dx in (0, 1):
        for i in range(-arm, arm + 1):
            for (px, py) in ((c + i + dx, c + i + 1), (c - i + dx, c + i + 1)):
                d.point((px, py), XSH)
    for dx in (0, 1):
        for i in range(-arm, arm + 1):
            for (px, py) in ((c + i + dx, c + i), (c - i + dx, c + i)):
                d.point((px, py), X)
    return im

for state in ('default', 'hover', 'pressed'):
    im = build(state)
    if state == 'pressed':
        # Pressed sinks a pixel: the whole knob moves down, nothing resizes.
        sunk = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        sunk.paste(im.crop((0, 0, N, N - 1)), (0, 1))
        im = sunk
    big = im.resize((N * 3, N * 3), Image.NEAREST)
    big.save(f'public/assets/ui/close-{state}.webp', lossless=True)
    big.save(f'public/assets/ui/close-{state}.png')
    print(state, big.size)
