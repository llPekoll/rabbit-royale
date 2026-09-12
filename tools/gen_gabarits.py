#!/usr/bin/env python3
"""
Generate blank, geometrically exact drawing templates for the island's tiles.

This tool draws NO art. It draws the CAGE the art has to live in — the 44x24
diamond, the 18px cliff face, the anchor point — and leaves the inside empty
for an artist to paint. That is the whole point: every tile in the game today
is a 64x64 square laid on a 44px lattice, so each one overlaps its neighbours
by 45%, and no amount of repainting fixes a tile that is the wrong SHAPE.

## Why templates rather than art

The numbers here are not style, they are contract. `gridConfig.ts` places tiles
at `(col - row) * 22, (col + row) * 12` and lifts a shelf by `TIER_LIFT = 18`.
A tile drawn 2px too tall leaves a seam under every plateau in the game, and
that is invisible in the drawing app and obvious on the board. So the geometry
is generated from the config's own numbers (mirrored below, and pinned by
`test/gabarit-metrics.test.ts`) and the artist paints inside it.

## What the layers mean

Every template is RGBA with a transparent interior, so painting on a layer
underneath shows through and the guides can be deleted when the tile is done:

  magenta  the diamond's exact edge — the art must reach it, and not pass it
  cyan     the centre, which is the sprite's (0.5, 0.5) anchor
  yellow   the 18px cliff band, on the faces only
  grey     the bounding box, for alignment in the drawing app

Guides are drawn at FULL opacity on their own pixels rather than blended, so
"delete by colour" works in any editor. Nothing else in the file is opaque.

## Scale

Written at 1x (44x24) and at 4x (176x96), both nearest-neighbour exact. Draw at
4x if the tablet needs the room, then downscale with NEAREST — never bilinear,
which turns a hard pixel edge into a three-pixel gradient the game then
upscales again. The 1x file is the one the game would load.

## The sheet templates (04-feuilles)

The loose 44x24 tiles above are for designing a tile. The SHEETS are what the
game actually loads, and they are what gets overwritten — so they are
generated at the exact geometry `tileset.ts` slices, and a painted sheet drops
in with no code change at all.

The one thing to understand before painting them: a sheet cell is 64x64, and
`IsoIslandView` SHEARS it onto the 44x24 diamond with

    Matrix(w/2/TILE, h/2/TILE, -w/2/TILE, h/2/TILE)

which maps the square's four corners to the diamond's four points. So the cell
is painted FULL — edge to edge, not as a diamond inside a square — and the
shear makes the diamond. What it also does is squash the art to 69% of its
width and 37% of its height, and THAT is why the current tiles read as mushy:
they were drawn to be seen square. Paint with the squash in mind — vertical
detail survives, fine horizontal detail does not.
"""
from PIL import Image, ImageDraw
import os

# ---------------------------------------------------------------------------
# The contract. Mirrors src/config/gridConfig.ts — see test/gabarit-metrics.test.ts,
# which fails if these drift from the TypeScript.
# ---------------------------------------------------------------------------
TILE_W = 44
TILE_H = 24
TIER_LIFT = 18

OUT = "art-source/gabarits"
SCALES = (1, 4)

# Guide colours, full alpha, chosen to appear nowhere in the game's palette so
# that selecting by colour in an editor never catches real art.
EDGE   = (255,   0, 255, 255)   # magenta — the diamond edge
ANCHOR = (  0, 255, 255, 255)   # cyan    — the anchor pixel
BAND   = (255, 230,   0, 255)   # yellow  — the 18px cliff band
BOX    = (110, 110, 110, 255)   # grey    — bounding box
FAINT  = (110, 110, 110, 90)    # grey    — subdivisions, semi-transparent


def diamond_points(w, h, s):
    """The four corners of the diamond, inset by half a pixel so the
    polygon's stroke lands ON the boundary rather than half outside it."""
    return [
        (w * s // 2, 0),
        (w * s - 1, h * s // 2),
        (w * s // 2, h * s - 1),
        (0, h * s // 2),
    ]


def new_canvas(w, h, s):
    return Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))


def draw_box(d, w, h, s):
    d.rectangle([0, 0, w * s - 1, h * s - 1], outline=BOX, width=s)


def draw_diamond(d, w, h, s, colour=EDGE):
    d.polygon(diamond_points(w, h, s), outline=colour)
    if s > 1:
        # At 4x a 1px outline is hard to see against the art; thicken it by
        # redrawing inset, which keeps the OUTER edge exact.
        for i in range(1, s):
            d.polygon(
                [(x + (1 if x < w * s // 2 else -1) * 0, y) for x, y in diamond_points(w, h, s)],
                outline=colour,
            )


def draw_anchor(img, w, h, s):
    """The anchor is the sprite's (0.5, 0.5) — one pixel at 1x, a cross at 4x."""
    cx, cy = w * s // 2, h * s // 2
    px = img.load()
    for dx in range(-s // 2 if s > 1 else 0, (s // 2) + 1 if s > 1 else 1):
        for dy in range(-s // 2 if s > 1 else 0, (s // 2) + 1 if s > 1 else 1):
            x, y = cx + dx, cy + dy
            if 0 <= x < img.width and 0 <= y < img.height:
                px[x, y] = ANCHOR


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return path


# ---------------------------------------------------------------------------
# 01 — the ground blob set
#
# The sixteen tiles of the classic 4-wide blob set, named by which neighbours
# they have. `autotile.ts` picks the column from west/east and the row from
# north/south, so the NAME here is the mask, which is what makes a file
# findable: the tile drawn when a cell has neighbours north and west is
# `sol-nw.png`, and nothing has to be counted.
#
# Edges are marked on the template: a side with NO neighbour is the side that
# needs a finished, visible edge, and it is drawn thicker so the artist can see
# at a glance which two or three sides of this particular tile are exposed.
# ---------------------------------------------------------------------------
MASKS = []
for n in (0, 1):
    for e in (0, 1):
        for s_ in (0, 1):
            for w in (0, 1):
                name = "".join(c for c, v in (("n", n), ("e", e), ("s", s_), ("w", w)) if v)
                MASKS.append((name or "seul", n, e, s_, w))


def gen_ground(scale):
    made = []
    for name, n, e, s_, w in MASKS:
        img = new_canvas(TILE_W, TILE_H, scale)
        d = ImageDraw.Draw(img)
        draw_box(d, TILE_W, TILE_H, scale)
        draw_diamond(d, TILE_W, TILE_H, scale)

        # Thicken the OPEN sides — the ones that need a drawn edge. On an iso
        # diamond, north is the upper-right edge, east the lower-right, south
        # the lower-left, west the upper-left.
        top    = (TILE_W * scale // 2, 0)
        right  = (TILE_W * scale - 1, TILE_H * scale // 2)
        bottom = (TILE_W * scale // 2, TILE_H * scale - 1)
        left   = (0, TILE_H * scale // 2)
        sides = {"n": (top, right), "e": (right, bottom), "s": (bottom, left), "w": (left, top)}
        for key, has in (("n", n), ("e", e), ("s", s_), ("w", w)):
            if not has:
                a, b = sides[key]
                d.line([a, b], fill=EDGE, width=max(2, scale))

        draw_anchor(img, TILE_W, TILE_H, scale)
        made.append(save(img, f"{OUT}/01-sol/{scale}x/sol-{name}.png"))
    return made


# ---------------------------------------------------------------------------
# 02 — the cliff faces
#
# The piece that breaks first and breaks loudest. A face is exactly TIER_LIFT
# tall where it meets the tile above it: the shelf's lower edges are its south
# and east sides (the two an iso camera sees past), and the face hangs straight
# down from them. Draw it shorter and the sea shows through between two tiers;
# draw it taller and a band of rock hangs below the shelf it belongs to.
#
# The template therefore carries the whole silhouette — the diamond's lower V
# at the top, the 18px band below it, the closing V at the bottom — so the
# artist can see the exact quadrilateral the rock has to fill.
# ---------------------------------------------------------------------------
def gen_cliff(scale):
    w, h = TILE_W, TILE_H // 2 + TIER_LIFT
    made = []
    for side in ("se", "sw", "double"):
        img = new_canvas(w, h, scale)
        d = ImageDraw.Draw(img)
        draw_box(d, w, h, scale)

        mid = TILE_H * scale // 2
        lift = TIER_LIFT * scale
        cx = w * scale // 2
        left, right = 0, w * scale - 1

        # Top: the shelf's lower V, which this face hangs from.
        if side in ("sw", "double"):
            d.line([(left, mid - 1), (cx, TILE_H * scale - 1)], fill=EDGE, width=max(1, scale // 2))
        if side in ("se", "double"):
            d.line([(cx, TILE_H * scale - 1), (right, mid - 1)], fill=EDGE, width=max(1, scale // 2))

        # The band itself: the two verticals and the bottom V, in yellow.
        if side in ("sw", "double"):
            d.line([(left, mid - 1), (left, mid - 1 + lift)], fill=BAND, width=max(1, scale // 2))
            d.line([(left, mid - 1 + lift), (cx, TILE_H * scale - 1 + lift)], fill=BAND, width=max(1, scale // 2))
        if side in ("se", "double"):
            d.line([(right, mid - 1), (right, mid - 1 + lift)], fill=BAND, width=max(1, scale // 2))
            d.line([(cx, TILE_H * scale - 1 + lift), (right, mid - 1 + lift)], fill=BAND, width=max(1, scale // 2))
        # The centre seam, where the two faces meet on a corner.
        if side == "double":
            d.line([(cx, TILE_H * scale - 1), (cx, TILE_H * scale - 1 + lift)], fill=FAINT, width=max(1, scale // 2))

        made.append(save(img, f"{OUT}/02-falaise/{scale}x/falaise-{side}.png"))
    return made


# ---------------------------------------------------------------------------
# 03 — the standing-prop template
#
# Trees, rabbits, buildings are NOT sheared onto the diamond — that is how an
# isometric scene draws standing things. What they need instead is a FOOT: the
# point that touches the ground, which the renderer anchors to the centre of
# the cell. Get it wrong and the prop hovers or sinks.
#
# So this template is a tall box with the tile's diamond drawn at its base, at
# the position the prop will actually stand on. Draw the prop with its feet on
# the cyan line.
# ---------------------------------------------------------------------------
def gen_prop(scale):
    made = []
    for name, h in (("petit", 32), ("moyen", 64), ("grand", 128)):
        img = new_canvas(TILE_W, h, scale)
        d = ImageDraw.Draw(img)
        draw_box(d, TILE_W, h, scale)

        # The cell the prop stands in, drawn at the bottom of the box.
        base_top = (h - TILE_H) * scale
        pts = [
            (TILE_W * scale // 2, base_top),
            (TILE_W * scale - 1, base_top + TILE_H * scale // 2),
            (TILE_W * scale // 2, h * scale - 1),
            (0, base_top + TILE_H * scale // 2),
        ]
        d.polygon(pts, outline=FAINT)
        # The ground line: where the feet go.
        d.line(
            [(0, base_top + TILE_H * scale // 2), (TILE_W * scale - 1, base_top + TILE_H * scale // 2)],
            fill=ANCHOR, width=max(1, scale // 2),
        )
        made.append(save(img, f"{OUT}/03-props/{scale}x/prop-{name}.png"))
    return made



# ---------------------------------------------------------------------------
# 04 — the sheets the game actually loads
#
# These are overwrite targets. `tileset.ts` slices them at fixed offsets, so
# the geometry is a contract: a palette sheet is 9x6 cells of 64px and the blob
# set is read from columns 5-8, rows 0-3; the elevation sheet is 4x8 and its
# faces live on row 3. Everything outside those windows is never read, and is
# drawn here as a dead zone so no time is spent painting it.
# ---------------------------------------------------------------------------
SHEET_CELL = 64

# Where each sheet's live windows are: (col0, row0, cols, rows, label).
PALETTE_WINDOWS = [(5, 0, 4, 4, "sol")]
ELEVATION_WINDOWS = [
    (0, 0, 4, 3, "surface"),
    (0, 3, 4, 1, "FACE"),
    (0, 4, 4, 1, "surface 1 ligne"),
    (0, 5, 4, 1, "face courte"),
    (0, 7, 4, 1, "face empilee"),
]


def gen_sheets(scale):
    """Blank sheets at the exact geometry the loader slices."""
    made = []
    for fname, cols, rows, windows in (
        ("palette", 9, 6, PALETTE_WINDOWS),
        ("tilemap-elevation", 4, 8, ELEVATION_WINDOWS),
    ):
        cell = SHEET_CELL * scale
        img = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        live = set()
        for c0, r0, cw, ch, _label in windows:
            for c in range(c0, c0 + cw):
                for r in range(r0, r0 + ch):
                    live.add((c, r))

        for r in range(rows):
            for c in range(cols):
                x, y = c * cell, r * cell
                if (c, r) in live:
                    # A live cell: full-bleed box, plus the diamond the shear
                    # will make of it, so the artist can see where the corners
                    # of the square end up.
                    d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=EDGE)
                    d.polygon(
                        [(x + cell // 2, y), (x + cell - 1, y + cell // 2),
                         (x + cell // 2, y + cell - 1), (x, y + cell // 2)],
                        outline=FAINT,
                    )
                else:
                    # Dead zone: never sliced, never drawn. Marked with a cross
                    # so it is obvious at a glance which cells are wasted work.
                    d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=BOX)
                    d.line([(x, y), (x + cell - 1, y + cell - 1)], fill=BOX)
                    d.line([(x + cell - 1, y), (x, y + cell - 1)], fill=BOX)

        # Label each live window once, at its top-left.
        for c0, r0, _cw, _ch, label in windows:
            d.text((c0 * cell + 3 * scale, r0 * cell + 3 * scale), label, fill=BAND)

        made.append(save(img, f"{OUT}/04-feuilles/{scale}x/{fname}.png"))
    return made


# ---------------------------------------------------------------------------
# 00 — the control sheet
#
# One image that lays real tiles on the real lattice, so a finished tile can be
# dropped in and checked in context. A tile that looks right alone and wrong
# here is wrong; this is the only test that matters.
# ---------------------------------------------------------------------------
def gen_control(scale):
    """The lattice with a shelf on it, cliff faces included.

    Drawn tight to its content — a template with a wide empty margin wastes the
    tablet's screen, and the margin is exactly where an artist zooms past.
    """
    cols = rows = 6
    half_w, half_h = TILE_W * scale // 2, TILE_H * scale // 2
    lift = TIER_LIFT * scale
    w = (cols + rows) * half_w
    h = (cols + rows) * half_h + TILE_H * scale
    img = Image.new("RGBA", (w, h + lift), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ox, oy = rows * half_w, lift + half_h

    def raised(c, r):
        return 1 <= c <= 3 and 1 <= r <= 3

    # Painter's order, so a near cell's cliff covers the far ground behind it.
    for diag in range(cols + rows - 1):
        for col in range(cols):
            row = diag - col
            if not (0 <= row < rows):
                continue
            tier = 1 if raised(col, row) else 0
            cx = ox + (col - row) * half_w
            cy = oy + (col + row) * half_h - tier * lift

            # The cliff band, on the two sides the camera sees past, wherever
            # the neighbour below is lower. This is the piece the whole
            # template set exists to get right, so the control sheet shows it.
            if tier:
                for dc, dr, a, b in (
                    (0, 1, (cx - half_w, cy), (cx, cy + half_h)),   # south-west
                    (1, 0, (cx, cy + half_h), (cx + half_w, cy)),   # south-east
                ):
                    if raised(col + dc, row + dr):
                        continue
                    # Explicit segments, not polygon(outline=): Pillow drops
                    # edges of a thin parallelogram, which left the faces as
                    # two bare verticals with no bottom — exactly the shape
                    # the artist must see closed.
                    quad = [a, b, (b[0], b[1] + lift), (a[0], a[1] + lift)]
                    for i in range(4):
                        d.line([quad[i], quad[(i + 1) % 4]], fill=BAND, width=max(1, scale // 2))

            d.polygon(
                [(cx, cy - half_h), (cx + half_w, cy), (cx, cy + half_h), (cx - half_w, cy)],
                outline=EDGE if tier else FAINT,
            )

    return [save(img, f"{OUT}/00-reference/{scale}x/planche-controle.png")]


def gen_contact(scale):
    """All sixteen ground tiles on one sheet, labelled by their mask.

    For picking the right file at a glance, and for seeing the set as a set:
    sixteen tiles drawn over as many sittings drift apart, and they only read
    as one material when they are looked at side by side.
    """
    pad = 6 * scale
    label_h = 10 * scale
    cell_w = TILE_W * scale + pad
    cell_h = TILE_H * scale + pad + label_h
    cols = 4
    img = Image.new("RGBA", (cols * cell_w + pad, 4 * cell_h + pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, (name, *_rest) in enumerate(MASKS):
        tile = Image.open(f"{OUT}/01-sol/{scale}x/sol-{name}.png").convert("RGBA")
        x = pad + (i % cols) * cell_w
        y = pad + (i // cols) * cell_h
        img.alpha_composite(tile, (x, y))
        # The mask, under each tile. Without it the sheet is sixteen near
        # identical diamonds and picking the right FILE means counting cells.
        d.text((x, y + TILE_H * scale + 2 * scale), f"sol-{name}", fill=BOX)
    return [save(img, f"{OUT}/00-reference/{scale}x/planche-contact-sol.png")]
def main():
    total = []
    for scale in SCALES:
        total += gen_ground(scale)
        total += gen_control(scale)
        total += gen_contact(scale)
        total += gen_cliff(scale)
        total += gen_prop(scale)
        total += gen_sheets(scale)
    print(f"{len(total)} fichiers")
    for p in total[:4]:
        print("  ", p)
    print("   ...")


if __name__ == "__main__":
    main()
