"""Five rabbit burrows, painted at game resolution on a 2x2 iso footprint (88x48)."""
import math, random, sys
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'

W, H = 96, 112
CX = 48
CY = H - 3 - 24          # footprint centre; bottom tip at H-3
HW, HH = 22, 12          # one cell's half diamond

def hexc(s):
    s = s.lstrip('#'); return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)

P = {k: hexc(v) for k, v in dict(
    ol='#2a1d18',
    g0='#c9dc72', g1='#a3c455', g2='#86b152', g3='#6c9a4c', g4='#557b48', g5='#3f5c40',
    d0='#e0b27a', d1='#c18d58', d2='#9c6a40', d3='#744a2d', d4='#4f3020', d5='#33201a',
    hole='#1a120f', hole2='#2b1c16',
    w0='#d9a066', w1='#b67a44', w2='#8a5530', w3='#5e3721',
    s0='#e3dfd0', s1='#b6b2a2', s2='#8a8678', s3='#5d5a50',
    c0='#ffb04a', c1='#f07f28', c2='#c2561a', l0='#9be05a', l1='#5fae3c', l2='#3c7d2e',
    y0='#fff0a0', y1='#ffd35a', y2='#e09a2a', y3='#a8661e',
    au0='#fff2a8', au1='#f2c94c', au2='#c48f28', au3='#855a1a',
    r0='#ff7a6a', r1='#d6453c', r2='#8f2830',
    sm0='#f4f1ea', sm1='#cfcac0', sm2='#a29d95',
    wt='#ffffff', pk='#f2a7b0',
).items()}

def noise(x, y, seed=0):
    n = (x * 374761393 + y * 668265263 + seed * 2147483647) & 0xffffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0xffffffff
    return ((n ^ (n >> 16)) & 0xffff) / 65535.0

def to_screen(u, v, h=0):
    return CX + (u - v) * HW, CY + (u + v) * HH - h


class Canvas:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]
        self.depth = [[-99] * W for _ in range(H)]

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H and c is not None:
            self.px[y][x] = P[c] if isinstance(c, str) else c

    def get(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            return self.px[y][x]
        return None

    def sprite(self, x, y, rows, key):
        """rows: list of strings; key: char -> colour name. Top-left at (x, y)."""
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in key:
                    self.put(x + i, y + j, key[ch])

    def image(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for y in range(H):
            for x in range(W):
                if self.px[y][x]:
                    im.putpixel((x, y), self.px[y][x])
        return im


# ---------------------------------------------------------------- the mound

def dome_h(domes, u, v):
    best = 0.0
    for (uc, vc, r, hgt, *rest) in domes:
        # squash the dome's footprint slightly along the view axis so it reads as a mound
        du, dv = u - uc, v - vc
        q = (du * du + dv * dv) / (r * r)
        if q < 1:
            k = rest[0] if rest else 0.75
            # rounded, slightly flat top: superellipse profile
            hh = hgt * (1 - q ** (1 / k * 0.9)) ** 0.55
            best = max(best, hh)
    return best


def mound(cv, domes, seed=1, grass_line=3.0, lumps=0.0, flowers=0.0):
    rnd = random.Random(seed)
    def h(u, v):
        base = dome_h(domes, u, v)
        if base > 0 and lumps:
            base += lumps * (math.sin(u * 9.1 + seed) * math.sin(v * 7.3 - seed)) * min(1, base / 6)
        return base
    for Y in range(H):
        for X in range(W):
            d = (X + 0.5 - CX) / HW
            t0 = (Y + 0.5 - CY) / HH
            # march from the viewer's side (large t, high up) towards the
            # ray's ground point t0; the first cell tall enough is what shows
            t = 2.2
            hit = None
            while t >= t0 and t > -2.2:
                u, v = (t + d) / 2, (t - d) / 2
                z = (t - t0) * HH
                hv = h(u, v)
                if hv > 0.05 and hv >= z:
                    hit = (u, v, hv, t)
                    break
                t -= 0.004
            if not hit:
                continue
            u, v, hv, t = hit
            e = 0.01
            hu = (h(u + e, v) - h(u - e, v)) / (2 * e) / 25
            hvv = (h(u, v + e) - h(u, v - e)) / (2 * e) / 25
            n = (-hu, -hvv, 1.0)
            nl = math.sqrt(sum(a * a for a in n))
            L = (-0.55, 0.35, 0.9)   # light from the upper left of the screen
            Ll = math.sqrt(sum(a * a for a in L))
            lam = sum(a * b for a, b in zip(n, L)) / nl / Ll
            slope = math.sqrt(hu * hu + hvv * hvv)
            nz = noise(X, Y, seed)
            grassy = hv > grass_line + nz * 1.5 and slope < 2.2 + nz * 0.8
            lam += (nz - 0.5) * 0.05
            if grassy:
                ramp = ['g5', 'g4', 'g3', 'g2', 'g1', 'g0']
                cuts = [0.15, 0.42, 0.62, 0.8, 0.93]
            else:
                ramp = ['d5', 'd4', 'd3', 'd2', 'd1', 'd0']
                cuts = [0.02, 0.22, 0.5, 0.74, 0.93]
            idx = sum(lam > c for c in cuts)
            cv.put(X, Y, ramp[idx])
            cv.depth[Y][X] = t
    # grass drips: grass pixel above dirt sometimes hangs one more pixel
    for Y in range(H - 1, 0, -1):
        for X in range(W):
            c, up = cv.px[Y][X], cv.px[Y - 1][X]
            if c and up and c in (P['d1'], P['d2'], P['d3'], P['d0']) and up in (P['g3'], P['g4'], P['g2']):
                if noise(X, Y, seed + 5) > 0.55:
                    cv.px[Y][X] = P['g4']
                    if noise(X, Y, seed + 9) > 0.8 and cv.px[Y + 1][X] if Y + 1 < H else False:
                        cv.px[Y + 1][X] = P['g5']
    # a dark seam where a nearer hump overlaps a farther one
    src = [row[:] for row in cv.px]
    for Y in range(1, H):
        for X in range(W):
            if src[Y][X] and src[Y - 1][X] and cv.depth[Y][X] - cv.depth[Y - 1][X] > 0.22:
                cv.px[Y - 1][X] = P['g5'] if src[Y - 1][X][1] > src[Y - 1][X][0] else P['d5']
    # grass blades: a light tick over a darker one, scattered by noise
    grass = {P[k] for k in ('g1', 'g2', 'g3', 'g4')}
    lighter = {P['g4']: 'g3', P['g3']: 'g2', P['g2']: 'g1', P['g1']: 'g0'}
    darker = {P['g4']: 'g5', P['g3']: 'g4', P['g2']: 'g3', P['g1']: 'g2'}
    for Y in range(1, H - 1):
        for X in range(1, W - 1):
            c = cv.px[Y][X]
            if c in grass and cv.px[Y + 1][X] in grass and cv.px[Y - 1][X] in grass:
                n = noise(X, Y, seed + 21)
                if n > 0.965:
                    cv.px[Y][X] = P[lighter[c]]
                    cv.px[Y + 1][X] = P[darker[cv.px[Y + 1][X]]]
                elif flowers and n < flowers and cv.px[Y][X] in (P['g1'], P['g2']):
                    f = ('wt', 'y1', 'pk')[int(noise(X, Y, seed) * 3)]
                    cv.px[Y][X] = P[f]
                    cv.px[Y + 1][X] = P['g4']
    return h


def outline(cv, color='ol'):
    src = [row[:] for row in cv.px]
    for y in range(H):
        for x in range(W):
            if src[y][x] is None:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and src[yy][xx] is not None:
                        cv.px[y][x] = P[color]
                        break


def front_foot(dome):
    """Screen point where the dome meets the ground, straight towards the viewer."""
    uc, vc, r, hgt = dome[:4]
    k = r / math.sqrt(2)
    return to_screen(uc + k, vc + k)


def surface_y(cv, x, y_from):
    """First painted pixel scanning down from y_from at column x."""
    for y in range(int(y_from), H):
        if cv.px[y][x] is not None:
            return y
    return None


# ---------------------------------------------------------------- props

def tuft(cv, x, y, dark=False):
    a, b = ('g3', 'g1') if not dark else ('g4', 'g2')
    cv.sprite(x - 2, y - 3, [
        '.b.b.',
        'ab.ba',
        '.aaa.',
    ], {'a': a, 'b': b})


def clod(cv, x, y):
    cv.sprite(x - 1, y - 1, ['bc', 'dd'], {'b': 'd1', 'c': 'd2', 'd': 'd3'})


def stone(cv, x, y, big=False):
    if big:
        cv.sprite(x - 3, y - 3, [
            '.oooo.',
            'oabbco',
            'obbcdo',
            '.oooo.',
        ], {'o': 'ol', 'a': 's0', 'b': 's1', 'c': 's2', 'd': 's3'})
    else:
        cv.sprite(x - 2, y - 2, [
            '.ooo.',
            'oabco',
            '.ooo.',
        ], {'o': 'ol', 'a': 's0', 'b': 's1', 'c': 's2'})


def carrot(cv, x, y):
    """A carrot planted in the ground, leaves up. (x, y) = soil line."""
    cv.sprite(x - 3, y - 9, [
        '.a..a.',
        '.ab.a.',
        '..bab.',
        '..bb..',
        '.ocao.',
        '.ocdo.',
        '.oddo.',
        '..od..',
        '..ee..',
    ], {'a': 'l0', 'b': 'l1', 'o': 'ol', 'c': 'c0', 'd': 'c1', 'e': 'd3'})


def hole(cv, x, y, w=13, h=9):
    """A dug entrance: dark oval with a dirt lip. (x, y) = bottom centre."""
    x0 = x - w // 2
    for j in range(h):
        for i in range(w):
            dx = (i + 0.5 - w / 2) / (w / 2)
            dy = (j + 0.5 - h) / h
            q = dx * dx + dy * dy
            if q <= 1.0:
                c = 'hole' if q < 0.62 else ('hole2' if q < 0.85 else 'd4')
                if j >= h - 2 and q > 0.55:
                    c = 'd3'
                cv.put(x0 + i, y - h + j, c)
    # lip highlight on top rim
    for i in range(1, w - 1):
        dx = (i + 0.5 - w / 2) / (w / 2)
        yy = y - h + int(round(h * (1 - math.sqrt(max(0, 1 - dx * dx))))) - 1
        cv.put(x0 + i, yy, 'd1' if i < w // 2 else 'd2')


def spill(cv, x, y, w=16, seed=3):
    """Fan of excavated dirt in front of a hole: (x, y) = where it starts."""
    for j in range(5):
        half = w / 2 - j * 0.6 + 2
        for i in range(int(-half), int(half) + 1):
            if noise(x + i, y + j, seed) < 0.12:
                continue
            c = 'd1' if j < 2 else ('d2' if noise(x + i, y + j, seed + 1) > 0.4 else 'd1')
            if abs(i) > half - 1.2:
                c = 'd3'
            cv.put(x + i, y + j, c)
    for j in range(5, 6):
        for i in range(-w // 2 + 2, w // 2 - 1):
            cv.put(x + i, y + j, 'd3')


def round_door(cv, x, y, big=False, gold=False):
    """A round wooden door set in a stone ring. (x, y) = bottom centre."""
    if not big:
        rows = [
            '....ooooo....',
            '..oosaabsoo..',
            '.osbwwwwwbso.',
            '.sbwwvwwvwbs.',
            'osbwxvwwvxbso',
            'osbwxvwwvxbso',
            'osbwxvkwvxbso',
            'osbwxvwwvxbso',
            'osbwxvwwvxbso',
            'osbwxvwwvxbso',
            'oddddddddddo.',
        ]
    else:
        rows = [
            '.....ooooooo.....',
            '...oosaabbbsoo...',
            '..osbbwwwwwbbso..',
            '.osbwwvwwwvwwbso.',
            '.sbwwxvwwwvxwwbs.',
            'osbwwxvwwwvxwwbso',
            'osbwwxvwwwvxwwbso',
            'osbwwxvwwwvxkwbso',
            'osbwwxvwwwvxkwbso',
            'osbwwxvwwwvxwwbso',
            'osbwwxvwwwvxwwbso',
            'osbwwxvwwwvxwwbso',
            'odddddddddddddddo',
        ]
    frame = {'o': 'ol', 's': 's2', 'a': 's0', 'b': 's1', 'w': 'w1', 'x': 'w2', 'v': 'w3',
             'k': 'au1' if gold else 's3', 'd': 'd3'}
    if gold:
        frame.update({'s': 'au2', 'a': 'au0', 'b': 'au1'})
    w = len(rows[0])
    cv.sprite(x - w // 2, y - len(rows) + 1, rows, frame)


def round_window(cv, x, y, lit=True):
    """A small round window; (x, y) = centre."""
    cv.sprite(x - 4, y - 4, [
        '..ddd..',
        '.ddeed.',
        'dd...ed',
        'de...ed',
        'de...ed',
        '.de.ee.',
        '..ddd..',
    ], {'d': 'd3', 'e': 'd2'})
    cv.sprite(x - 3, y - 3, [
        '.ooo.',
        'oabco',
        'obwbo',
        'ocbco',
        '.ooo.',
    ], {'o': 'w3', 'a': 'y0', 'b': 'y1' if lit else 's2', 'c': 'y2' if lit else 's3', 'w': 'w2'})


def lantern(cv, x, y):
    """Lantern on a crooked stick; (x, y) = foot."""
    cv.sprite(x - 2, y - 13, [
        '.ooo.',
        'owwwo',
        'oaybo',
        'oyyco',
        'owwwo',
        '.ooo.',
        '..v..',
        '..v..',
        '..x..',
        '..v..',
        '..v..',
        '..x..',
        '.dxd.',
    ], {'o': 'ol', 'w': 'w2', 'a': 'y0', 'y': 'y1', 'b': 'y1', 'c': 'y2', 'v': 'w2', 'x': 'w3', 'd': 'd3'})


def chimney(cv, x, y):
    """A clay pipe chimney; (x, y) = where it enters the mound."""
    cv.sprite(x - 3, y - 9, [
        'ooooooo',
        'odddddo',
        'oabbcco',
        '.oabco.',
        '.oabco.',
        '.oabco.',
        '.oabco.',
        '.oabco.',
        '.goooo.',
    ], {'o': 'ol', 'd': 'hole', 'a': 'r0', 'b': 'r1', 'c': 'r2', 'g': 'g4'})
    # smoke
    cv.sprite(x - 3, y - 20, [
        '....aa.',
        '...abba',
        '...bbc.',
        '..ab...',
        '.abbc..',
        '.bcc...',
        '..a....',
        '.ab....',
        '..c....',
    ], {'a': 'sm0', 'b': 'sm1', 'c': 'sm2'})


def flag(cv, x, y):
    """A pole with a carrot pennant; (x, y) = foot."""
    for j in range(18):
        cv.put(x, y - j, 'w3' if j % 5 else 'w2')
        cv.put(x + 1, y - j, 'ol')
    cv.put(x - 1, y - 17, 'ol'); cv.put(x, y - 18, 'au1'); cv.put(x + 1, y - 18, 'ol')
    cv.sprite(x + 1, y - 17, [
        'rrrrrrrro',
        'rqqqqcqqqo',
        'rqqqcllqqqo',
        'rqqccqqqqo',
        'rqcqqqqqo',
        'rrrrrrrro',
    ], {'r': 'ol', 'q': 'r1', 'c': 'c0', 'l': 'l0', 'o': 'ol'})


def ear_hedge(cv, x, y, flip=False):
    """A tall ear-shaped topiary; (x, y) = base."""
    rows = [
        '..ooo..',
        '.oabbo.',
        '.oabco.',
        'oabpco.',
        'oabpcco',
        'oabpcco',
        'oabpcco',
        'oabpcco',
        'oabpcco',
        'oabpcco',
        '.oabco.',
        '.oabco.',
        '..obo..',
    ]
    if flip:
        rows = [r[::-1] for r in rows]
    cv.sprite(x - 3, y - len(rows) + 1, rows,
              {'o': 'ol', 'a': 'g1', 'b': 'g2', 'c': 'g4', 'p': 'pk'})


def fence_post(cv, x, y):
    cv.sprite(x - 1, y - 6, ['oao', 'oao', 'obo', 'oao', 'oao', 'obo', '.o.'],
              {'o': 'ol', 'a': 'w1', 'b': 'w2'})


# ---------------------------------------------------------------- the ladder

def level1():
    cv = Canvas()
    dome = (-0.15, -0.15, 0.62, 11)
    mound(cv, [dome], seed=11, grass_line=4)
    outline(cv)
    fx, fy = front_foot(dome)
    spill(cv, int(fx), int(fy) - 1, w=14, seed=4)
    hole(cv, int(fx), int(fy), w=13, h=9)
    tuft(cv, int(fx) - 14, int(fy) - 10)
    tuft(cv, int(fx) + 10, int(fy) - 13, dark=True)
    clod(cv, int(fx) + 11, int(fy) + 3)
    clod(cv, int(fx) - 9, int(fy) + 4)
    return cv


def level2():
    cv = Canvas()
    dome = (-0.1, -0.1, 0.78, 15)
    mound(cv, [dome, (-0.55, 0.15, 0.4, 8)], seed=12, grass_line=4)
    outline(cv)
    fx, fy = front_foot(dome)
    spill(cv, int(fx) - 1, int(fy) - 1, w=16, seed=5)
    hole(cv, int(fx) - 1, int(fy), w=15, h=11)
    # twig lintel over the hole
    cv.sprite(int(fx) - 10, int(fy) - 13, [
        'oooooooooooooooooo',
        'owwxwwwxwwxwwwxwwo',
        'ooooooooooooooooo.',
    ], {'o': 'ol', 'w': 'w1', 'x': 'w2'})
    carrot(cv, int(fx) + 16, int(fy) - 2)
    stone(cv, int(fx) - 15, int(fy) + 2)
    tuft(cv, int(fx) - 4, int(fy) - 24)
    tuft(cv, int(fx) + 8, int(fy) - 20, dark=True)
    return cv


def level3():
    cv = Canvas()
    dome = (-0.05, -0.05, 0.9, 19)
    mound(cv, [dome, (-0.55, 0.3, 0.42, 10), (0.3, -0.55, 0.42, 9)], seed=13, grass_line=4, flowers=0.006)
    outline(cv)
    fx, fy = front_foot(dome)
    fx, fy = int(fx), int(fy)
    spill(cv, fx, fy, w=18, seed=6)
    round_door(cv, fx, fy)
    round_window(cv, fx - 16, fy - 14)
    lantern(cv, fx + 12, fy + 1)
    stone(cv, fx - 9, fy + 4)
    tuft(cv, fx - 2, fy - 29)
    tuft(cv, fx - 20, fy - 20, dark=True)
    carrot(cv, fx + 21, fy - 2)
    return cv


def level4():
    cv = Canvas()
    dome = (0.05, 0.05, 0.85, 21)
    back = (-0.38, -0.38, 0.58, 24)
    mound(cv, [dome, back, (-0.62, 0.35, 0.36, 9), (0.38, -0.6, 0.38, 10)], seed=14, grass_line=4, flowers=0.01)
    outline(cv)
    fx, fy = front_foot(dome)
    fx, fy = int(fx), int(fy)
    bx, by = to_screen(back[0], back[1], back[3])
    chimney(cv, int(bx) + 6, int(by) + 7)
    spill(cv, fx, fy, w=20, seed=7)
    round_door(cv, fx, fy, big=True)
    round_window(cv, fx - 18, fy - 15)
    round_window(cv, fx + 18, fy - 15)
    lantern(cv, fx - 12, fy + 3)
    for i, ox in enumerate((17, 21, 25)):
        fence_post(cv, fx + ox, fy + 2 - i * 2)
    carrot(cv, fx + 20, fy - 5)
    stone(cv, fx + 11, fy + 5, big=True)
    tuft(cv, fx - 25, fy - 16, dark=True)
    return cv


def level5():
    cv = Canvas()
    dome = (0.08, 0.08, 0.86, 24)
    back = (-0.36, -0.36, 0.6, 30)
    domes = [dome, back, (-0.62, 0.3, 0.38, 12), (0.3, -0.62, 0.38, 12)]
    mound(cv, domes, seed=15, grass_line=4, flowers=0.015)
    bx, by = to_screen(back[0], back[1], back[3])
    bx, by = int(bx), int(by)
    ear_hedge(cv, bx - 5, by + 3)
    ear_hedge(cv, bx + 5, by + 3, flip=True)
    outline(cv)
    fx, fy = front_foot(dome)
    fx, fy = int(fx), int(fy)
    chimney(cv, fx + 18, fy - 22)
    spill(cv, fx, fy, w=22, seed=8)
    round_door(cv, fx, fy, big=True, gold=True)
    round_window(cv, fx - 19, fy - 16)
    round_window(cv, fx + 19, fy - 16)
    flag(cv, fx - 26, fy - 2)
    lantern(cv, fx - 12, fy + 3)
    lantern(cv, fx + 12, fy + 3)
    carrot(cv, fx + 24, fy - 3)
    carrot(cv, fx + 29, fy - 5)
    stone(cv, fx - 18, fy + 3, big=True)
    return cv


if __name__ == '__main__':
    ims = []
    for i, f in enumerate((level1, level2, level3, level4, level5), 1):
        im = f().image()
        im.save(f'{OUT}/burrow-{i}.png')
        ims.append(im)
    sheet = Image.new('RGBA', (W * 5, H), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, (i * W, 0))
    sheet.save(f'{OUT}/burrow-levels.png')
