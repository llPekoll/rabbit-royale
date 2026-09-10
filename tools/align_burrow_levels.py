"""
Align the burrow's upgrade art to level 1, and emit each level as WebP.

The four paintings are the same homestead redrawn — same camera, same grass,
same mound — but the enclosure changes with the level (wooden rails, iron
railings, castle wall) and the artist drew the tilled FIELD at a different size
and position in each one. Level 3's field is 195px across where level 1's is
252, and it sits 20px higher.

That matters more than it looks. The board is not a free-floating grid: its
origin, zoom and LAYOUT are solved against the soil level 1 paints, and
`test/burrow-calibration.test.ts` asserts that every FIELD cell — the win
condition of a raid — lands on that soil. Swapping the backdrop for a picture
whose field is somewhere else would put the objective on a lawn again, which is
precisely the regression that test exists to catch.

There are two ways out: calibrate the board per level, or move the art so every
level's field lands where level 1's does. This is the second. It keeps ONE set
of numbers (one origin, one zoom, one layout, one plot list) for all four
backdrops, so the levels differ in what the player sees and in nothing the game
has to reason about — an upgrade re-skins the burrow, it does not re-survey it.

The target is not level 1's painting but the BOARD ITSELF: the bounding diamond
of the FIELD cells, computed from burrowConfig's origin, zoom and LAYOUT. That
is the region the game actually treats as the field, so it is the region every
painting's soil has to cover — calibrating to it directly is what "same place"
means, and it makes level 1 just another level rather than a privileged one.

The fit is PER AXIS (x and y scaled separately), not uniform. It has to be: the
artist drew each level's field at its own depth-to-width ratio, and level 4's is
15% shallower than the board's isometric angle expects. A uniform scale can
satisfy width or depth but not both, and matching only the width is what left
the top row of cells sitting on the fence. Stretching one axis does technically
change the apparent camera angle, but at these magnitudes it is invisible in
isometric pixel art — checked by eye, level by level, with the board drawn over
it (Burrow/Calibration in Storybook).

Cropping is the cost, and it is affordable: every level scales UP (its field is
smaller than level 1's), so the enlarged painting still covers the frame and
what falls off the edges is outer grass the scene already crops away — the
burrow is drawn at BURROW_ZOOM 1.445, so a good third of the source is off
screen before this tool touches it.

Run:  python3 tools/align_burrow_levels.py
"""
from PIL import Image
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'public/assets/island'

# The soil diamond of each painting, in that painting's own pixels.
#
# Read off the art on a 20px grid rather than flood-filled, because a fill
# cannot be trusted here: the fence rails, the castle's wooden gate and the
# tilled soil are all the same browns, so a colour fill leaks along whichever
# rails happen to touch the dirt — and it leaks DIFFERENTLY in each of the four
# images, which is the one thing that would quietly corrupt the alignment.
#
# Only three corners are needed. The bottom one is the most occluded (the near
# fence sits on it in every level) and a diamond is over-determined by three.
#   T = top corner, L = left corner, R = right corner.
#
# Read these on a 10px grid, not a 50px one. An earlier pass measured level 2 on
# a coarse grid, put its depth 12px out, and that alone was enough to leave the
# board's top row of field cells on grass.
FIELDS = {
    'burrow':          dict(T=(686, 443), L=(560, 512), R=(812, 505)),
    'burrow_lvl2':     dict(T=(690, 425), L=(573, 483), R=(806, 483)),
    'burrow_lvl3':     dict(T=(694, 437), L=(600, 487), R=(795, 488)),
    'burrow_lvl4':     dict(T=(706, 400), L=(614, 447), R=(830, 447)),
    # burrow_lvl4_bis is measured but NOT emitted: it draws a watchtower inside
    # the field, and once aligned five of the crop's plots land on its roof —
    # carrots growing through solid stone. Put it back in the rotation (see
    # burrowArt.ts) if the tower is ever painted out of the soil.
    'burrow_lvl4_bis': dict(T=(714, 410), L=(626, 452), R=(806, 452)),
}

# Level 1 still supplies the canvas SIZE every level must share, and it is the
# one file this tool does not rewrite (plant_carrots.py owns it, and emits the
# carrot plots alongside it). It is no longer the alignment target, though: the
# board is. See TARGET below.
REFERENCE = 'burrow'

# Level 1 already ships as burrow.webp, converted by tools/plant_carrots.py
# alongside the carrot plots. Re-emitting it here would be a second, competing
# source for the same file.
# `burrow_lvl4_bis` is skipped for a different reason: see its entry in FIELDS.
SKIP_OUTPUT = {REFERENCE, 'burrow_lvl4_bis'}

# Quality 85 at method 6, matching plant_carrots.py: these sit behind the whole
# burrow at nearest-neighbour filtering, and above 85 the file grows faster
# than anything visible does.
QUALITY = 85
METHOD = 6

# Where the measured alignment is recorded for the test suite.
#
# The test cannot re-derive this: asserting that the field really is on soil
# means DECODING a WebP, and the repo has no decoder it could depend on. So the
# tool — which does have Pillow — writes down what it measured and what it
# corrected to, and the test checks that the shipped files still match the
# record. Re-export a level without re-running this and the sizes stop
# agreeing, which is the failure worth catching.
MANIFEST = ROOT / 'src/config/burrowArtAlignment.json'

# The canvas the scene fits the backdrop into, and the size every backdrop is.
# Both are asserted against the real files in main().
GAME_W, GAME_H = 960, 540
REF_SIZE = (1376, 768)


def geometry(field):
    """A field diamond's centre, width and depth, from its three read corners.

    The fourth corner is implied: a diamond's bottom is L + R - T.
    """
    top, left, right = field['T'], field['L'], field['R']
    bottom = (left[0] + right[0] - top[0], left[1] + right[1] - top[1])
    centre = ((left[0] + right[0]) / 2, (top[1] + bottom[1]) / 2)
    return centre, right[0] - left[0], bottom[1] - top[1]


def board_field():
    """The diamond the BOARD calls the field, in the backdrop's own pixels.

    Read out of burrowConfig rather than restated here, so this cannot drift
    from the layout the game actually plays: it is the bounding diamond of the
    `F` cells, put through the inverse of the scene's cover-fit-then-zoom.
    That diamond is the target every painting's soil is fitted to.
    """
    cfg = (ROOT / 'src/config/burrowConfig.ts').read_text()

    def const(name):
        return float(re.search(rf'export const {name} = ([\d.]+)', cfg).group(1))

    cols, rows_n = int(const('BURROW_COLS')), int(const('BURROW_ROWS'))
    half_w, half_h = const('BURROW_TILE_W') / 2, const('BURROW_TILE_H') / 2
    origin_x, origin_y, zoom = const('BURROW_ORIGIN_X'), const('BURROW_ORIGIN_Y'), const('BURROW_ZOOM')
    layout = re.findall(
        r"'([.#EF]{%d})'" % cols,
        re.search(r'const LAYOUT = \[(.*?)\] as const', cfg, re.S).group(1),
    )
    if len(layout) != rows_n:
        raise SystemExit(f'burrowConfig LAYOUT has {len(layout)} rows, expected {rows_n}')

    art_w, art_h = REF_SIZE
    cover = max(GAME_W / art_w, GAME_H / art_h)
    w, h = art_w * cover * zoom, art_h * cover * zoom
    left, top = GAME_W / 2 - w / 2, GAME_H / 2 - h / 2

    us, vs = [], []
    for i in range(cols * rows_n):
        if layout[i // cols][i % cols] != 'F':
            continue
        col, row = i % cols, i // cols
        # scene space -> art space
        x = (origin_x + (col - row) * half_w - left) * (art_w / w)
        y = (origin_y + (col + row) * half_h - top) * (art_h / h)
        # iso space: constant along each of the diamond's two edge directions
        us.append(x / 2 + y)
        vs.append(x / 2 - y)

    def to_xy(u, v):
        return (u + v, (u - v) / 2)

    t = to_xy(min(us), max(vs))
    l = to_xy(min(us), min(vs))
    r = to_xy(max(us), max(vs))
    b = to_xy(max(us), min(vs))
    centre = ((l[0] + r[0]) / 2, (t[1] + b[1]) / 2)
    return centre, r[0] - l[0], b[1] - t[1]


def align(img, field, target):
    """Scale `img` so its field lands on the board's, and crop back to size.

    Returns a canvas the SAME size as the source: the scene places the board by
    fitting the backdrop's natural dimensions, so a level shipped at a different
    size would land its board somewhere else however well the field was fitted.
    """
    target_centre, target_w, target_d = target
    centre, width, depth = geometry(field)
    kx, ky = target_w / width, target_d / depth

    big = img.resize(
        (round(img.width * kx), round(img.height * ky)),
        # NEAREST keeps the pixel art crisp. The scene draws this backdrop with
        # nearest-neighbour filtering too, so resampling it smoothly here would
        # blur the art and then present the blur as pixels.
        Image.NEAREST,
    )

    # Where the field's centre ended up, and where it has to be once cropped.
    left = round(centre[0] * kx - target_centre[0])
    top = round(centre[1] * ky - target_centre[1])

    out = Image.new('RGB', img.size)
    out.paste(big, (-left, -top))
    return out, (kx, ky), (left, top)


def main() -> None:
    ref_src = ART / f'{REFERENCE}.jpg'
    if not ref_src.exists():
        raise SystemExit(
            f'{ref_src.relative_to(ROOT)} is missing. The hand-drawn sources are\n'
            'deliberately not tracked in git — put them back to re-run this tool.'
        )
    ref_size = Image.open(ref_src).size
    if ref_size != REF_SIZE:
        raise SystemExit(f'{REFERENCE}.jpg is {ref_size}, expected {REF_SIZE}.')

    target = board_field()
    centre, width, depth = target
    print(f'board field: {width:.1f} x {depth:.1f} px, '
          f'centred ({centre[0]:.1f}, {centre[1]:.1f})  [from burrowConfig]')

    aligned = {}

    for name, field in FIELDS.items():
        src = ART / f'{name}.jpg'
        if not src.exists():
            raise SystemExit(f'{src.relative_to(ROOT)} is missing.')

        img = Image.open(src).convert('RGB')
        if img.size != ref_size:
            # Every level has to be the same size, because the scene fits the
            # backdrop by its natural dimensions. A source that differs would
            # need its own origin, which is what this tool exists to avoid.
            raise SystemExit(
                f'{name} is {img.size}, but {REFERENCE} is {ref_size}. '
                'The levels must share one canvas size.'
            )

        out, (kx, ky), (left, top) = align(img, field, target)
        record = {
            'source_field': {k: list(v) for k, v in field.items()},
            'scale': [round(kx, 5), round(ky, 5)],
            'crop': [left, top],
        }

        if name in SKIP_OUTPUT:
            # Measured and recorded, but not written: level 1's WebP is owned by
            # plant_carrots.py (which emits the carrot plots from the same
            # image), and _bis is held back for the tower in its field. Keeping
            # their numbers here still lets the test check them.
            print(f'{name}: scale ({kx:.4f}, {ky:.4f})  [measured only, not written]')
        else:
            dest = ART / f'{name}.webp'
            out.save(dest, 'WEBP', quality=QUALITY, method=METHOD)
            record['bytes'] = dest.stat().st_size
            print(f'{name}: scale ({kx:.4f}, {ky:.4f}), crop ({left:+d}, {top:+d})  '
                  f'-> {dest.name}  {dest.stat().st_size // 1024} KB')

        aligned[name] = record

    MANIFEST.write_text(json.dumps({
        '_comment': 'GENERATED by tools/align_burrow_levels.py — do not edit by hand.',
        'target': {
            'source': 'src/config/burrowConfig.ts (bounding diamond of the F cells)',
            'centre': [round(centre[0], 2), round(centre[1], 2)],
            'width': round(width, 2),
            'depth': round(depth, 2),
            'size': list(ref_size),
        },
        'aligned': aligned,
    }, indent=1) + chr(10))
    print(f'wrote {MANIFEST.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
