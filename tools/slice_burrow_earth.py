"""Cut public/assets/buildings/previews/burrow-earth-levels.png into five frames.

The preview packs the five earth burrows edge to edge: levels 4 and 5 even
touch at their tips. Each burrow stands on its own ground diamond (2:1), so
every frame is re-centred on THAT diamond's centre, which is the point that
has to land on the building cell's centre. The Godot sheet is 5 x 64x80, the
diamond centre at (32, 60) in each frame.

    python3 tools/slice_burrow_earth.py
"""
import collections
from PIL import Image

SRC = 'public/assets/buildings/previews/burrow-earth-levels.png'
OUT = 'godot/assets/buildings/burrow-earth.png'
FRAME_W, FRAME_H = 64, 80
CENTRE = (32, 60)
# Levels 4 and 5 meet at their tips: 211 is level 4's last column.
CUT_4_5 = 212

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

# 4-connected components; the first three burrows come apart on their own.
label = {}
comps = []
for y in range(h):
    for x in range(w):
        if px[x, y][3] == 0 or (x, y) in label:
            continue
        q = collections.deque([(x, y)])
        label[(x, y)] = len(comps)
        pts = []
        while q:
            cx, cy = q.popleft()
            pts.append((cx, cy))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (cx + dx, cy + dy)
                if 0 <= n[0] < w and 0 <= n[1] < h and n not in label and px[n][3] > 0:
                    label[n] = len(comps)
                    q.append(n)
        comps.append(pts)

big = sorted((c for c in comps if len(c) > 50), key=lambda c: min(p[0] for p in c))
assert len(big) == 4, f'expected 3 burrows + the 4/5 pair, got {len(big)}'
frames = [[] for _ in range(5)]
for i, c in enumerate(big[:3]):
    frames[i] += c
for p in big[3]:
    frames[3 if p[0] < CUT_4_5 else 4].append(p)

# Stray tufts go to the burrow whose span holds them.
spans = [(min(p[0] for p in f), max(p[0] for p in f)) for f in frames]
for c in comps:
    if len(c) > 50:
        continue
    x = sum(p[0] for p in c) / len(c)
    near = min(range(5), key=lambda i: 0 if spans[i][0] <= x <= spans[i][1]
               else min(abs(x - spans[i][0]), abs(x - spans[i][1])))
    frames[near] += c

sheet = Image.new('RGBA', (FRAME_W * 5, FRAME_H), (0, 0, 0, 0))
for i, pts in enumerate(frames):
    solid = [p for p in pts if px[p][3] > 128]
    x0 = min(p[0] for p in solid)
    x1 = max(p[0] for p in solid)
    # The foot is the diamond's bottom tip; a lone speck below it is not.
    ys = sorted(p[1] for p in solid)
    foot = ys[-1] if ys[-1] - ys[-4] < 3 else ys[-4]
    width = x1 - x0 + 1
    cx = (x0 + x1 + 1) / 2
    cy = foot + 1 - width / 4
    ox = round(CENTRE[0] - cx) + i * FRAME_W
    oy = round(CENTRE[1] - cy)
    for (x, y) in pts:
        if y > foot + 2:
            continue  # a lone speck far under the ground, not part of the art
        tx, ty = x + ox, y + oy
        assert i * FRAME_W <= tx < (i + 1) * FRAME_W and 0 <= ty < FRAME_H, (i, x, y)
        sheet.putpixel((tx, ty), px[x, y])
    print(f'level {i + 1}: diamond {width}px wide, foot y={foot}, centre ({cx:.1f}, {cy:.1f})')

sheet.save(OUT)
print('wrote', OUT)
