"""Five rabbit burrows, ISOMETRIC, on a 2x2 footprint, with NO ground of their own.

    python3 tools/paint_burrows_iso.py <out dir>

Writes burrow-iso-1..5.png and the sheet burrow-iso-levels.png (5 x 96x112),
the same frame and footprint as tools/paint_burrows.py (whose palette and
projection this reuses) so the game anchors them the same way: the centre of
the 2x2 footprint at (48, 85) of each frame.

WHY A SECOND PAINTER. The first one paints domes: round footprints (a circle
in u, v reads as an ellipse on screen), each on its own ring of earth. In the
game the burrow stands on FOUR real ground tiles, and against them a round
mound on a painted base reads as a sticker, not a building of the board
("ces terriers ne sont pas isometriques", 2026-09-23). So here:

  - the footprint is the SQUARE of the four cells, inset a little so the
    tiles' edges show round it;
  - the walls are vertical planes on the two faces the camera sees (+v, the
    front-left, lit; +u, the front-right, in shade), their edges on the iso
    axes;
  - the roof is a rounded cap of turf that overhangs the walls in drips;
  - doors and windows are drawn IN the wall planes, so they lean with them;
  - nothing is painted outside the building: the tiles are the ground.

Forward-rendered (points of the roof and walls splatted with a depth test),
not ray-marched: it is exact for vertical walls and a hundred times faster.
"""
import math
import sys

from PIL import Image

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from paint_burrows import P, noise  # noqa: E402  (palette and hash noise)

W, H = 96, 112
CX = 48
CY = H - 3 - 24          # footprint centre, as in paint_burrows.py
HW, HH = 22, 12          # one cell's half diamond: the game's 44x24 tile
PX = 25.0                # screen pixels per unit of height slope (paint_burrows)


def to_screen(u, v, z=0.0):
    """u, v in cells from the footprint centre (the square is [-1, 1]^2)."""
    return CX + (u - v) * HW, CY + (u + v) * HH - z


class Canvas:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]
        self.depth = [[-1e9] * W for _ in range(H)]

    def splat(self, x, y, depth, colour):
        x, y = int(math.floor(x)), int(math.floor(y))
        if 0 <= x < W and 0 <= y < H and depth >= self.depth[y][x]:
            self.depth[y][x] = depth
            self.px[y][x] = P[colour] if isinstance(colour, str) else colour

    def put(self, x, y, colour):
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = P[colour] if isinstance(colour, str) else colour

    def image(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for y in range(H):
            for x in range(W):
                if self.px[y][x]:
                    im.putpixel((x, y), self.px[y][x])
        return im


def outline(cv):
    src = [row[:] for row in cv.px]
    for y in range(H):
        for x in range(W):
            if src[y][x] is None:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and src[yy][xx] is not None:
                        cv.px[y][x] = P['ol']
                        break


RAMP_GRASS = ['g5', 'g4', 'g3', 'g2', 'g1', 'g0']
CUT_GRASS = [0.15, 0.42, 0.62, 0.8, 0.93]
LIGHT = (-0.55, 0.35, 0.9)      # from the upper left of the screen


class Burrow:
    """One building: a square of walls under a rounded roof of turf."""

    def __init__(self, level, half=0.86, wall=11.0, cap=3.0, rounding=0.22, dome=5.0, seed=1):
        self.level = level
        self.a, self.b = -half, half      # the square, in cells
        self.wall = wall                  # wall height, px
        self.cap = cap                    # how much the roof rises above it, px
        self.rounding = rounding          # how far in from the edge it rises, cells
        self.dome = dome                  # the hump over the middle, px
        self.seed = seed
        self.cv = Canvas()
        self.openings = []                # (face, shape(s, z) -> colour|None)

    # -- the shape ----------------------------------------------------------

    def roof(self, u, v):
        d = min(u - self.a, self.b - u, v - self.a, self.b - v)
        if d < 0:
            return 0.0
        k = min(d / self.rounding, 1.0)
        edge = math.sqrt(max(0.0, 1 - (1 - k) ** 2))          # a round lip
        span = (self.b - self.a) / 2
        # A CUSHION, not a pyramid: the distance to the middle is a rounded
        # square (a superellipse of power 4), so the hump has no ridges
        # running to the corners.
        rr = (abs(u) ** 4 + abs(v) ** 4) ** 0.25 / span           # 0 centre, 1 rim
        dome = self.dome * max(0.0, 1 - rr * rr) ** 0.6          # a soft hump
        lump = 0.6 * math.sin(u * 5.1 + self.seed) * math.sin(v * 4.3 - self.seed)
        return self.wall + self.cap * edge + dome * k + lump * k

    # -- painting -----------------------------------------------------------

    def paint(self):
        self._roof()
        self._walls()
        self._drips()
        outline(self.cv)
        return self

    def _roof(self):
        n = 260
        e = 0.01
        for i in range(n + 1):
            for j in range(n + 1):
                u = self.a + (self.b - self.a) * i / n
                v = self.a + (self.b - self.a) * j / n
                z = self.roof(u, v)
                hu = (self.roof(min(u + e, self.b), v) - self.roof(max(u - e, self.a), v)) / (2 * e) / PX
                hv = (self.roof(u, min(v + e, self.b)) - self.roof(u, max(v - e, self.a))) / (2 * e) / PX
                nrm = (-hu, -hv, 1.0)
                lam = sum(a * b for a, b in zip(nrm, LIGHT)) / math.hypot(*nrm) / math.hypot(*LIGHT)
                x, y = to_screen(u, v, z)
                lam += (noise(int(x), int(y), self.seed) - 0.5) * 0.06
                colour = RAMP_GRASS[sum(lam > c for c in CUT_GRASS)]
                self.cv.splat(x, y, u + v + z / 1000.0, colour)

    def _walls(self):
        # The two faces the camera sees. `s` runs along the face, `z` up it.
        for face in ('v', 'u'):
            steps = 220
            for i in range(steps + 1):
                s = self.a + (self.b - self.a) * i / steps
                u, v = (s, self.b) if face == 'v' else (self.b, s)
                top = self.roof(u - (0.001 if face == 'u' else 0), v - (0.001 if face == 'v' else 0))
                z = 0.0
                while z <= top:
                    x, y = to_screen(u, v, z)
                    colour = self._wall_colour(face, s, z, x, y)
                    self.cv.splat(x, y, u + v + 0.002, colour)
                    z += 0.45
            for shape in self.openings:
                pass

    def _wall_colour(self, face, s, z, x, y):
        for f, shape in self.openings:
            if f == face:
                c = shape(s, z)
                if c:
                    return c
        n = noise(int(x), int(y), self.seed + 3)
        # Strata: a darker band every few pixels, a stone now and then.
        band = int(z) % 6 == 0 and n > 0.35
        if face == 'v':   # front-left, in the light
            c = 'd2' if n < 0.55 else 'd1'
            if band:
                c = 'd3'
        else:             # front-right, in shade
            c = 'd3' if n < 0.6 else 'd4'
            if band:
                c = 'd4'
        if z < 2.0:
            c = 'd4' if face == 'v' else 'd5'   # the foot, where it meets the tile
        if n > 0.985:
            c = 's1' if face == 'v' else 's2'
        return c

    def _drips(self):
        """Turf hanging over the top of the walls, by noise."""
        cv = self.cv
        grass = {P[k] for k in ('g1', 'g2', 'g3', 'g4', 'g5')}
        dirt = {P[k] for k in ('d1', 'd2', 'd3', 'd4', 'd5')}
        for x in range(W):
            for y in range(1, H - 2):
                if cv.px[y][x] in dirt and cv.px[y - 1][x] in grass:
                    hang = 1 + int(noise(x, y, self.seed + 7) * 3.2)
                    for k in range(hang):
                        if y + k < H and cv.px[y + k][x] in dirt:
                            cv.px[y + k][x] = P['g4' if k < hang - 1 else 'g5']
                    break

    # -- what goes in the walls ------------------------------------------

    def door(self, at=0.0, width=0.6, height=10.0, frame=True, face='v'):
        """A round burrow door in the wall plane: a hole, or planks in a ring of stone."""
        half = width / 2

        def shape(s, z):
            # Plane coordinates in screen pixels: across the face, and up it.
            ds = (s - at) * HW * 1.12
            r = half * HW * 1.12
            cz = height - r                     # the arch's centre
            if z <= cz:
                d = abs(ds) / r
            else:
                d = math.hypot(ds, z - cz) / r
            if d > 1.0 + 2.2 / r:
                return None
            if d > 1.0:
                return ('s1' if ds < 0 else 's2') if frame else 'd4'
            if not frame:
                return 'hole2' if d > 0.8 else 'hole'
            plank = int(ds + r) % 3 == 0
            if abs(ds - r * 0.45) < 0.9 and abs(z - height * 0.45) < 0.9:
                return 'au1'                      # the knob
            if abs(z - height * 0.3) < 0.6 or abs(z - height * 0.7) < 0.6:
                return 'w3'                       # iron bands
            return 'w2' if plank else ('w1' if face == 'v' else 'w2')
        self.openings.append((face, shape))
        return self

    def window(self, at, z0, r=3.4, face='u'):
        """A round window, lit from inside, with a cross."""
        def shape(s, z):
            ds = (s - at) * HW * 1.12
            dz = z - z0
            d = math.hypot(ds, dz)
            if d > r + 1.3:
                return None
            if d > r:
                return 'w3'
            if abs(ds) < 0.6 or abs(dz) < 0.6:
                return 'w3'
            return 'y1' if dz > 0 else 'y2'
        self.openings.append((face, shape))
        return self

    def stones(self, count=5):
        """Round stones at the foot of the two faces."""
        cv = self.cv
        for i in range(count):
            t = (i + 0.5) / count
            face = 'v' if i % 2 == 0 else 'u'
            s = self.a + (self.b - self.a) * t
            u, v = (s, self.b + 0.05) if face == 'v' else (self.b + 0.05, s)
            x, y = to_screen(u, v, 1.5)
            for dx in range(-2, 3):
                for dy in range(-2, 2):
                    if dx * dx + dy * dy * 1.6 <= 5:
                        cv.put(int(x) + dx, int(y) + dy, 's1' if dy < 0 else 's2')
            cv.put(int(x) - 1, int(y) - 2, 's0')
        return self

    def chimney(self, u=-0.35, v=-0.45, height=7):
        cv = self.cv
        base = self.roof(u, v)
        x, y = to_screen(u, v, base)
        x, y = int(x), int(y)
        for dy in range(height):
            for dx in range(-2, 3):
                cv.put(x + dx, y - dy, 's1' if dx < 0 else 's2')
        for dx in range(-3, 4):
            cv.put(x + dx, y - height, 's0')
        cv.put(x, y - height - 1, 'sm1')
        cv.put(x + 1, y - height - 3, 'sm0')
        return self

    def flag(self, u=0.35, v=-0.55, height=12):
        cv = self.cv
        x, y = to_screen(u, v, self.roof(u, v))
        x, y = int(x), int(y)
        for dy in range(height):
            cv.put(x, y - dy, 'w3')
        for dy in range(4):
            for dx in range(1, 6 - dy):
                cv.put(x + dx, y - height + dy, 'r1' if dy < 3 else 'r2')
        cv.put(x, y - height - 1, 'au1')
        return self

    def carrot(self, u=0.7, v=0.98):
        x, y = to_screen(u, v, 0)
        x, y = int(x), int(y)
        cv = self.cv
        for k, c in enumerate(('c0', 'c1', 'c1', 'c2')):
            cv.put(x, y - 2 - k, c)
        cv.put(x - 1, y - 6, 'l1')
        cv.put(x + 1, y - 6, 'l0')
        cv.put(x, y - 7, 'l1')
        return self


def level1():
    b = Burrow(1, half=0.66, wall=9.0, cap=2.5, dome=4.0, seed=11)
    b.door(at=0.0, width=0.62, height=8.0, frame=False)
    return b.paint()


def level2():
    b = Burrow(2, half=0.76, wall=12.0, cap=2.5, dome=5.0, seed=12)
    b.door(at=-0.05, width=0.62, height=10.5)
    return b.paint().carrot(u=0.6)


def level3():
    b = Burrow(3, half=0.84, wall=14.0, cap=3.0, dome=6.0, seed=13)
    b.door(at=-0.25, width=0.64, height=11.5).window(at=0.0, z0=8.0)
    b.window(at=0.45, z0=8.5, face='v', r=2.8)
    return b.paint().carrot(u=0.72)


def level4():
    b = Burrow(4, half=0.9, wall=16.0, cap=3.5, dome=7.0, seed=14)
    b.door(at=-0.3, width=0.66, height=12.5).window(at=-0.35, z0=9.5).window(at=0.4, z0=9.5)
    b.window(at=0.45, z0=9.5, face='v', r=3.0)
    return b.paint().stones(6).chimney(u=-0.4, v=-0.4, height=8)


def level5():
    b = Burrow(5, half=0.94, wall=18.0, cap=4.0, dome=8.0, seed=15)
    b.door(at=-0.28, width=0.72, height=14.0).window(at=-0.38, z0=11.0, r=3.8)
    b.window(at=0.4, z0=11.0, r=3.8).window(at=0.48, z0=11.0, face='v', r=3.2)
    return b.paint().stones(8).chimney(u=-0.5, v=-0.3, height=10).flag(u=0.4, v=-0.5)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    frames = []
    for i, f in enumerate((level1, level2, level3, level4, level5), 1):
        im = f().cv.image()
        im.save(f'{out}/burrow-iso-{i}.png')
        frames.append(im)
    sheet = Image.new('RGBA', (W * 5, H), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im, (i * W, 0))
    sheet.save(f'{out}/burrow-iso-levels.png')
