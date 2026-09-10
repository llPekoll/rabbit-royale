"""
Plant carrots in the burrow's field, and emit the backdrop as WebP.

The art ships an EMPTY tilled field: five furrow ridges and nothing growing in
them. The burrow is where a player waits out an energy regen, so it is the
screen they stare at longest — and a bare field reads as an unfinished asset
rather than as a farm between harvests.

Rather than hand-painting the carrots in, they are composited from the SAME
sprite sheet the game animates (public/assets/carottes), so the planted field
and any future growing animation cannot drift apart in style. The sheet's 12
frames are a growth cycle; a row's position along the furrow picks the frame,
so the field reads as sown over time rather than stamped in one pass.

Geometry is MEASURED from the image (the soil is flood-filled from a seed and
its diamond corners taken from the extremes), not hardcoded from a screenshot,
so re-running this against a redrawn field still lands the carrots in the dirt.

Run:  python3 tools/plant_carrots.py
"""
from PIL import Image
import numpy as np
from collections import deque
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# The hand-drawn source. NOT tracked in git (only the converted .webp is), so
# re-running this needs the JPEG put back in place first — the committed
# artefacts are burrow.webp and src/config/carrotPlots.json.
SRC = ROOT / 'public/assets/island/burrow.jpg'
SHEET = ROOT / 'public/assets/carottes/carrote.png'
ATLAS = ROOT / 'public/assets/carottes/carrote.json'
# The backdrop, converted and NOTHING ELSE: the field stays bare.
#
# There is deliberately no carrots-baked-in variant. A painted carrot cannot
# grow, so shipping one would mean the field is permanently full — which is the
# opposite of the thing the garden is for. Every carrot on screen is a live
# sprite drawn over this (see components/carrot-field.tsx); this file only ever
# supplies the ground they stand in.
OUT = ROOT / 'public/assets/island/burrow.webp'
# The plots, for the LIVE field (see src/components/carrot-field.tsx).
PLOTS = ROOT / 'src/config/carrotPlots.json'

# A seed inside the tilled field, used to flood-fill the soil. Any soil pixel
# does; this one sits in the middle ridge.
SEED_YX = (500, 680)

# How large a carrot is drawn, relative to its 31px sprite. The field is ~250px
# across and holds five ridges, so a carrot has to stay small enough that a row
# does not merge into a hedge.
SCALE = 0.62

# How many plants sit in one row. Deliberately loose: at nine the rows closed
# into a hedge and the soil stopped reading as soil, which loses the furrows the
# art went to the trouble of drawing.
PER_ROW = 7

# Keep the plants off the field's rim: the fence posts sit just inside the
# soil's bounding diamond, and a carrot centred on the edge pokes through them.
MARGIN = 0.10


def soil_mask(img: Image.Image) -> np.ndarray:
    """The tilled field, as a boolean mask.

    Brown is not unique in this picture — the path, the fence and the cabin are
    all brown — so a colour threshold alone catches half the map. The mask is
    the colour test FLOOD-FILLED from a point known to be in the field, which
    keeps exactly the one connected patch we mean.
    """
    a = np.asarray(img.convert('RGB')).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    brown = (r > 60) & (r < 150) & (g > 35) & (g < 110) & (b < 90) \
        & (r > g + 15) & (g > b + 5)

    h, w = brown.shape
    seen = np.zeros_like(brown)
    if not brown[SEED_YX]:
        raise SystemExit(f'seed {SEED_YX} is not on soil — has the art moved?')
    q = deque([SEED_YX])
    seen[SEED_YX] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and brown[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def corners(mask: np.ndarray):
    """The field's four diamond corners, as (x, y).

    An isometric quad's extremes in x and y ARE its corners, which is why this
    can be read straight off the mask instead of fitting edges.
    """
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs, ys], 1)
    return (tuple(pts[xs.argmin()]), tuple(pts[xs.argmax()]),
            tuple(pts[ys.argmin()]), tuple(pts[ys.argmax()]))


def ridge_crests(img, mask, top, u, v):
    """Where the furrow ridges run, as positions along the field's short axis.

    The art draws five raised ridges with troughs between them, and a carrot
    belongs ON a ridge — planted by eye they drift off it, and the rows stop
    agreeing with the soil underneath. So the ridges are MEASURED: brightness
    averaged along each furrow direction peaks on a crest (it catches the light)
    and dips in a trough, and the peaks of that profile are the rows.

    Falls back to an even split if the profile is flat, so a redrawn field
    without visible ridges still gets planted rather than crashing.
    """
    lum = np.asarray(img.convert('RGB')).astype(float).mean(2)
    ux, uy = u
    vx, vy = v

    samples = 200
    prof = []
    for k in range(samples):
        s = k / (samples - 1)
        vals = []
        for t in np.linspace(0.15, 0.85, 60):
            x = int(top[0] + ux * s + vx * t)
            y = int(top[1] + uy * s + vy * t)
            if 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1] and mask[y, x]:
                vals.append(lum[y, x])
        prof.append(np.mean(vals) if vals else np.nan)
    prof = np.array(prof)

    # Smooth, so single-pixel speckle in the dirt texture is not read as a ridge.
    valid = ~np.isnan(prof)
    if valid.sum() < samples // 2:
        return [MARGIN + (1 - 2 * MARGIN) * (i + 0.5) / 5 for i in range(5)]
    prof = np.interp(np.arange(samples), np.flatnonzero(valid), prof[valid])
    kernel = np.ones(9) / 9
    sm = np.convolve(prof, kernel, mode='same')

    peaks = [i for i in range(1, samples - 1)
             if sm[i] >= sm[i - 1] and sm[i] > sm[i + 1]]
    # Keep peaks that are genuinely apart — a crest is ~1/5 of the field wide,
    # so anything closer than half that is the same ridge counted twice.
    keep = []
    for i in peaks:
        if not keep or i - keep[-1] > samples // 12:
            keep.append(i)
        elif sm[i] > sm[keep[-1]]:
            keep[-1] = i
    crests = [i / (samples - 1) for i in keep]
    crests = [c for c in crests if MARGIN <= c <= 1 - MARGIN]
    if not crests:
        return [MARGIN + (1 - 2 * MARGIN) * (i + 0.5) / 5 for i in range(5)]
    return crests


def frames():
    """The growth sprites, smallest first.

    The atlas lists them in sheet order, which IS growth order here (row-major
    across a 4x3 sheet), so the index doubles as a growth stage.
    """
    meta = json.loads(ATLAS.read_text())
    sheet = Image.open(SHEET).convert('RGBA')
    out = []
    for f in meta['frames']:
        r = f['frame']
        out.append(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])))
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(
            f'{SRC.relative_to(ROOT)} is missing. It is the hand-drawn source and is\n'
            'deliberately not tracked in git — put it back to re-run this tool.'
        )
    img = Image.open(SRC).convert('RGB')
    mask = soil_mask(img)
    left, right, top, bottom = corners(mask)
    print(f'field corners  L{left} R{right} T{top} B{bottom}  ({mask.sum()} px)')

    # Parametric axes along the field's own two edges, so the rows follow the
    # furrows the art drew rather than the screen's axes.
    ux, uy = left[0] - top[0], left[1] - top[1]
    vx, vy = right[0] - top[0], right[1] - top[1]

    ridges = ridge_crests(img, mask, top, (ux, uy), (vx, vy))
    print(f'ridge crests at s = {", ".join(f"{r:.3f}" for r in ridges)}')

    rng = random.Random(7)  # fixed: the field must be the same every build

    # Where each plant stands. Only the POSITIONS are computed here — nothing is
    # drawn into the art, because a painted carrot cannot grow and the field is
    # supposed to fill and empty with the garden.
    spots = []
    for s_ in ridges:
        for i in range(PER_ROW):
            t = MARGIN + (1 - 2 * MARGIN) * (i + 0.5) / PER_ROW
            # A touch of jitter, so the field reads as planted by hand.
            js = s_ + rng.uniform(-0.012, 0.012)
            jt = t + rng.uniform(-0.012, 0.012)
            spots.append((top[1] + uy * js + vy * jt, top[0] + ux * js + vx * jt))

    # Sorted by y so the runtime can draw them back-to-front: a nearer plant has
    # to overlap the one behind it, or the rows have no depth.
    plots = []
    skipped = 0
    for y, x in sorted(spots):
        # Only plant where there is actually dirt: the diamond's corners poke
        # under the fence, and the mask is the honest answer.
        if not mask[int(y), int(x)]:
            skipped += 1
            continue
        # `y - 1` sits the root just inside the soil rather than on its very
        # edge, which at this scale is the difference between standing in the
        # furrow and hovering over it.
        plots.append({'x': round(x, 1), 'y': round(y - 1, 1)})

    print(f'{len(plots)} plots ({skipped} skipped off-soil)')

    # The frame rectangles come straight from the Aseprite atlas rather than
    # from a cols x rows formula: a re-export that changes the packing would
    # leave a formula silently reading the wrong pixels.
    atlas = json.loads(ATLAS.read_text())
    rects = [{'x': f['frame']['x'], 'y': f['frame']['y'],
              'w': f['frame']['w'], 'h': f['frame']['h']} for f in atlas['frames']]

    PLOTS.write_text(json.dumps({
        '_comment': 'GENERATED by tools/plant_carrots.py — do not edit by hand.',
        'art': {'w': img.width, 'h': img.height},
        'sprite': {'scale': SCALE},
        'frames': rects,
        'plots': plots,
    }, indent=1) + chr(10))
    print(f'wrote {PLOTS.relative_to(ROOT)}  ({len(plots)} plots)')

    # Quality 85 at method 6. The backdrop is drawn with nearest-neighbour
    # filtering and sits behind the whole burrow, so it is the biggest single
    # asset the scene loads — and above 85 the file grows faster than anything
    # visible does. 92 produced a WebP LARGER than the source JPEG, which
    # defeats the point of converting it.
    img.save(OUT, 'WEBP', quality=85, method=6)
    print(f'wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
