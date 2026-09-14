#!/usr/bin/env python3
"""
Draw the SMOOTH isometric block sheet for /isoworld.

The pixel sandbox sheet (`public/assets/world/isometric-sandbox-sheet-32x32.png`)
gave the block world its geometry; this tool draws the same pieces in the flat,
outlined, vector-ish style of the "Nature and Frogs" reference: three levels
(dark green, medium green, sand), tan cliff faces with a couple of earthy
stripes, a thin dark outline on every silhouette edge and a faint lighter grid
on the top faces. No decoration — the plants, flowers and rocks come later, by
hand.

The output is meant to be EDITED: it is a correctly-shaped, correctly-aligned
starting point, saved as a lossless PNG at 4x the pixel sheet's cell so it can
be retouched without fighting anti-aliasing.

## Layout — the same grid as the pixel sheet, 4x larger

Four columns by ten rows of 128px cells, three materials stacked three rows
each: rows 0-2 moss (dark green, the highest tier), 3-5 grass (medium green),
6-8 sand (the lowest tier). Every cell sits in a `PAD`-pixel gutter filled with
its own edge pixels, so the sheet's pitch is `CELL + 2 * PAD`: the renderer
filters this sheet, and a frame cut flush against the next would sample its
neighbour's transparent edge and draw a hairline seam down every wall.

    col   0        1        2          3          4         5         6         7
    r0    cube     slab     slope W    slope N    inner NE  inner SE  inner SW  inner NW
    r1    turf     flat     slope S    slope E    outer NE  outer SE  outer SW  outer NW
    r2    rim N    rim E    rim S      rim W      fringe N  fringe E  fringe S  fringe W
    r2    ...      col 8    patch      col 9-12   patch fringe N E S W
    r2    ...      col 13-16 lace cap NE SE SW NW   col 17-20 slope fringe N E S W
    r2    ...      col 21-28 fold N^ Nv E^ Ev S^ Sv W^ Wv

The flat fringe (4-7) lies in the plane of the tier above: it is for the
inner corner, whose surface is flat where the fringe hangs. The SLOPE FRINGE
(17-20) is the same lace projected down a straight slope climbing toward
that side, so it clings to the hillside instead of floating over it; the
lace cap is likewise laid on the outer corner's slope.

A LACE CAP is the fringe wrapped around one corner of the cell, for the
outer-corner ramp, which the plateau above touches only at that point. A
FOLD is the line along a SLOPED edge — one end a block up — where two
slopes bend against each other: the ridge at a plateau's corner. It is the
ridge cell's own colour, a shade darker, so a ridge in the sand is yellow.
`^` has the edge's first corner (clockwise) raised, `v` the second.

A FRINGE is the scalloped lace of this material's colour that hangs over a
neighbouring cell along one of ITS edges — the reference's plateaus spill
over the ground below them with a wavy outline. It is drawn INSIDE the base
diamond along that edge, so the renderer places it on the cell being spilled
onto. The PATCH is a darker tuft of grass filling one cell, with its own
fringes in its own colour, so a patch spills onto the cells around it the
same way.

Columns 4-7 are the corner ramps, in `Dir` order of their first side (see
`rampHighSides` in terrain.ts): an INNER corner climbs toward two adjacent
sides, an OUTER corner rises to one corner point. With the four straight
slopes they cover every way a cell can meet the tier above, so a regularised
island has no wall between two land tiers.

and a tenth row of pieces shared by every material:

    r9    corner L corner R corner F

The pixel sheet's last two columns (stairs, prop blocks) are not drawn: this
sheet is terrain only, and the renderer builds a flight of stairs as a slope
and skips the props, post included. Row 2 differs too: there is no water (the island
floats on the page's gradient) and the four cells hold the RIM pieces, the
dark outline along one edge of the top face. Row 9's corners are the vertical
outline at the cell's left, right and front (bottom) corner, one block tall.

## Why the outlines are separate pieces

In the reference every silhouette edge has a dark line and nothing else does:
a cliff wall is one continuous face however many cells long, and the grid on
the top is a faint light line. A cube that carried its own outline would draw
a dark line at every cell along a wall, a bar across a two-block cliff and a
grid of ink over the whole island. So the cube here is BARE — faces, stripes,
pebbles, the light grid — and the renderer lays a rim on an edge only where
the neighbour stands at a different height, and a corner only where a wall
ends. The lines are still bitmaps, drawn with round caps so they join cleanly
where three meet.

## Geometry

Same lattice as the pixel sheet, scaled by 4: one block is 128 wide, 64 deep
and 64 tall; every piece is bottom-aligned with its base diamond's top corner
at (64, 64) of the cell. `(u, v, z)` below is a point on that lattice — `u`
runs along the east edge, `v` along the south edge, `z` up in blocks — and
`P()` projects it to the cell:

    x = 64 + 64u - 64v          y = 64 + 32u + 32v - 64z

## Seams

Tiles meet edge to edge, and two anti-aliased edges laid on the same line
leave a hairline of background between them. Every filled face is therefore
drawn `BLEED` wider than its geometry; a neighbour drawn later covers the
overlap exactly as it would cover the face. Outlines on the side faces are
drawn INSIDE the face for the same reason: a neighbour's top face then hides
them completely on interior tiles and they show only on the cliffs.

The light grid is drawn on a tile's north and west edges only. Every interior
edge is the north or west edge of exactly one tile, so the grid comes out
complete with a single line per seam, and the south-east silhouette edges,
where the dark outline goes, get no highlight beside it.

Run:  python3 tools/gen_iso_smooth_sheet.py
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_SOURCE = ROOT / 'art-source' / 'iso-smooth' / 'iso-smooth-sheet-128.png'
OUT_PUBLIC = ROOT / 'public' / 'assets' / 'world' / 'iso-smooth-sheet-128.png'

CELL = 128
PAD = 2
PITCH = CELL + 2 * PAD
COLS, ROWS = 29, 10
SS = 4  # supersampling: drawn at 512px per cell, then resolved down

# Line weights, in OUTPUT pixels, matched to the hand-drawn decorations: their
# outlines run 2-3px at the same scale (a one-cell base ~130px wide).
OUTLINE = 2.6   # silhouette, rims, fringes, folds
GRID = 2.0      # the sharp grid line on top faces
GLOW = 7.0      # the soft dark halo under it, the line's own colour multiplied in
GLOW_STRENGTH = 0.3
STRIPE = 3.0    # earth stripes on cliff faces
BLEED = 0.8     # how far a filled face overshoots its edge to hide seams

# Palette, sampled from public/assets/world/nature-isoworld.png.
INK = (96, 104, 90)              # silhouette outline: the reference's grey-green cliff line
LACE_INK = (104, 160, 82)        # outline of fringes and patches: dark green
TUFT = (110, 170, 84)
CLIFF = (191, 180, 150)          # cliff face, tan
CLIFF_SOUTH = (181, 170, 141)    # the face turned away from the light, a touch darker
STRIPE_INK = (168, 158, 132)
PEBBLE = (118, 120, 108)

# Fringe geometry, in lattice units of the cell edge.
FRINGE_DEPTH = 0.16
FRINGE_BUMPS = 4

# Each material: its flat top, the grid on it — a sharp line a shade darker
# than the fill, over a soft halo of the same colour multiplied in — its
# PATCH, the darker tuft of grass the reference scatters on it, its FOLD,
# the ridge line drawn on its slopes, and its EDGE, the rim drawn where it
# meets the sea or a drop — the island's outline is sand-coloured. A slope leading up to a material is that
# material's colour: the reference's plateaus run down their slopes in one
# tone and only the lace at the top marks the change.
MATERIALS = [
    # name,   top fill,        grid line,       patch fill,      fold line,       edge (rim)
    ('moss', (176, 218, 120), (148, 200, 98), (128, 188, 96), (112, 170, 84), (96, 150, 72)),
    ('grass', (211, 244, 153), (180, 230, 134), (148, 204, 110), (140, 196, 104), (120, 176, 90)),
    ('sand', (239, 243, 185), (224, 229, 158), (211, 244, 153), (198, 198, 126), (184, 182, 112)),
]

# --- lattice ---------------------------------------------------------------

def P(u: float, v: float, z: float = 0.0) -> tuple[float, float]:
    """Project a lattice point to cell pixels (supersampled)."""
    x = 64 + 64 * u - 64 * v
    y = 64 + 32 * u + 32 * v - 64 * z
    return (x * SS, y * SS)


def poly(*pts: tuple[float, float, float]) -> list[tuple[float, float]]:
    return [P(*p) for p in pts]


def offset_polygon(points: list[tuple[float, float]], d: float) -> list[tuple[float, float]]:
    """
    Push every edge of a convex polygon outward by `d` (inward when negative)
    and rebuild the corners from the shifted edges. Points may go either way
    round; the winding is detected from the signed area.
    """
    n = len(points)
    area = sum(points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1] for i in range(n))
    sign = 1 if area > 0 else -1
    lines = []
    for i in range(n):
        (x1, y1), (x2, y2) = points[i], points[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1
        # outward normal for this winding
        nx, ny = sign * dy / length, -sign * dx / length
        lines.append(((x1 + nx * d, y1 + ny * d), (x2 + nx * d, y2 + ny * d)))
    out = []
    for i in range(n):
        (ax, ay), (bx, by) = lines[i - 1]
        (cx, cy), (dx_, dy_) = lines[i]
        # intersection of the two shifted edges
        r = (bx - ax, by - ay)
        s = (dx_ - cx, dy_ - cy)
        denom = r[0] * s[1] - r[1] * s[0]
        if abs(denom) < 1e-9:
            out.append((cx, cy))
            continue
        t = ((cx - ax) * s[1] - (cy - ay) * s[0]) / denom
        out.append((ax + t * r[0], ay + t * r[1]))
    return out


# --- drawing ---------------------------------------------------------------

class Cell:
    """One 128px cell, drawn supersampled. `img` is RGBA at CELL*SS."""

    def __init__(self) -> None:
        self.img = Image.new('RGBA', (CELL * SS, CELL * SS), (0, 0, 0, 0))

    def fill(self, points, color, bleed: float = BLEED) -> None:
        pts = offset_polygon(points, bleed * SS) if bleed else points
        ImageDraw.Draw(self.img).polygon(pts, fill=color)

    def stroke_inside(self, points, color, width: float, edges=None, extras=None) -> None:
        """
        Outline the given edges of a face (indices into `points`, all of them by
        default), keeping the line entirely INSIDE the face. `extras` is a list
        of (polyline, color, width) drawn under the same clip — stripes, pebbles.
        """
        n = len(points)
        layer = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for pl, col, w in extras or []:
            d.line(pl, fill=col, width=round(w * SS), joint='curve')
        for i in (edges if edges is not None else range(n)):
            a, b = points[i], points[(i + 1) % n]
            d.line([a, b], fill=color, width=round(2 * width * SS))
        mask = Image.new('L', self.img.size, 0)
        ImageDraw.Draw(mask).polygon(points, fill=255)
        self.img.paste(layer, (0, 0), Image.composite(layer.split()[3], mask, mask))

    def stroke(self, a, b, color, width: float, caps: bool = False) -> None:
        d = ImageDraw.Draw(self.img)
        d.line([a, b], fill=color, width=round(width * SS))
        if caps:
            r = width * SS / 2
            for (x, y) in (a, b):
                d.ellipse([x - r, y - r, x + r, y + r], fill=color)

    def ellipse(self, center, rx, ry, fill, outline, width) -> None:
        cx, cy = center
        box = [cx - rx * SS, cy - ry * SS, cx + rx * SS, cy + ry * SS]
        ImageDraw.Draw(self.img).ellipse(box, fill=fill, outline=outline, width=round(width * SS))

    def resolve(self) -> Image.Image:
        # Premultiplied so the transparent corners do not bleed dark fringes.
        return self.img.convert('RGBa').resize((CELL, CELL), Image.LANCZOS).convert('RGBA')


def cliff_extras(face_pts, rng: random.Random, rows=(0.38, 0.72)):
    """Two wobbly earth stripes and a few pebbles, laid across a side face."""
    # face_pts: 4 points, top edge first (a->b), then bottom edge (c->d) reversed
    a, b, c, d = face_pts
    extras = []
    for t in rows:
        pts = []
        for k in range(9):
            s = k / 8
            x = a[0] + (b[0] - a[0]) * s
            y0 = a[1] + (b[1] - a[1]) * s
            y1 = d[1] + (c[1] - d[1]) * s
            wob = math.sin(s * math.pi * 3 + t * 7) * 0.012
            pts.append((x, y0 + (y1 - y0) * (t + wob)))
        extras.append((pts, STRIPE_INK, STRIPE))
    return extras


def pebbles(cell: Cell, face_pts, rng: random.Random, count=3) -> None:
    a, b, c, d = face_pts
    for _ in range(count):
        s = rng.uniform(0.18, 0.82)
        t = rng.uniform(0.2, 0.85)
        x = a[0] + (b[0] - a[0]) * s
        y0 = a[1] + (b[1] - a[1]) * s
        y1 = d[1] + (c[1] - d[1]) * s
        cell.ellipse((x, y0 + (y1 - y0) * t), rng.uniform(2.6, 4.2), rng.uniform(1.6, 2.4), CLIFF, PEBBLE, 1.2)


def side_face(cell: Cell, pts, color, rng: random.Random, textured=True, pebble_count=3, outline=None) -> None:
    """
    A cliff face: fill, stripes, pebbles, and an inset outline on the edges in
    `outline` (indices into `pts`; none by default — see the module notes on
    why a bare cube carries no ink).
    """
    cell.fill(pts, color)
    extras = cliff_extras(pts, rng) if textured else []
    if extras or outline:
        cell.stroke_inside(pts, INK, OUTLINE, edges=outline or [], extras=extras)
    if textured:
        pebbles(cell, pts, rng, pebble_count)


def top_face(cell: Cell, pts, fill, grid, grid_edges=(0, 3)) -> None:
    """
    A walkable surface. `pts` go top, right, bottom, left (N edge = 0->1, E = 1->2,
    S = 2->3, W = 3->0); the grid goes on N (edge 0) and W (edge 3). `grid` is
    the (line, glow) pair.
    """
    cell.fill(pts, fill)
    for i in grid_edges:
        top_face_line(cell, pts[i], pts[(i + 1) % len(pts)], grid)


# The four faces of a unit block, as lattice quads (top edge first).
def east_face(z0=0.0, z1=1.0):
    return poly((1, 0, z1), (1, 1, z1), (1, 1, z0), (1, 0, z0))


def south_face(z0=0.0, z1=1.0):
    return poly((0, 1, z1), (1, 1, z1), (1, 1, z0), (0, 1, z0))


def top_quad(z=1.0):
    return poly((0, 0, z), (1, 0, z), (1, 1, z), (0, 1, z))


# --- pieces ----------------------------------------------------------------

def grid_of(mat):
    return mat[2]


def cube(mat, rng, height=1.0) -> Cell:
    fill, grid = mat[1], grid_of(mat)
    c = Cell()
    top_face(c, top_quad(height), fill, grid)
    side_face(c, south_face(0, height), CLIFF_SOUTH, rng, pebble_count=2 if height < 1 else 3)
    side_face(c, east_face(0, height), CLIFF, rng, pebble_count=2 if height < 1 else 3)
    return c


def turf(mat, rng) -> Cell:
    """A thin tile, a quarter block thick: for laying one surface over another."""
    fill, grid = mat[1], grid_of(mat)
    c = Cell()
    top_face(c, top_quad(0.25), fill, grid)
    side_face(c, south_face(0, 0.25), CLIFF_SOUTH, rng, textured=False)
    side_face(c, east_face(0, 0.25), CLIFF, rng, textured=False)
    return c


def flat(mat) -> Cell:
    fill, grid = mat[1], grid_of(mat)
    c = Cell()
    top_face(c, top_quad(0), fill, grid)
    return c


def ramp(mat, rng, heights) -> Cell:
    """
    Any ramp, from its four corner heights `(h00, h10, h11, h01)` — the
    lattice corners (u, v) = (0,0) top, (1,0) right, (1,1) bottom, (0,1)
    left, each 0 or 1 block above the cell. The surface is two planar
    triangles; the cut runs between the two corners that differ from the odd
    one out, so a single raised or lowered corner is a crease and a straight
    slope is one plane. The east and south faces follow their edge's profile:
    nothing, a wedge, or a full wall. The wedge's top edge is outlined — it is
    the silhouette of the ramp against its own side — a wall's is not, since
    the tier above always covers it.
    """
    fill, grid = mat[1], grid_of(mat)
    h00, h10, h11, h01 = heights
    corners = [(0, 0, h00), (1, 0, h10), (1, 1, h11), (0, 1, h01)]
    c = Cell()

    raised = sum(heights)
    if raised in (0, 4) or (raised == 2 and h00 == h11):
        # Flat, or a straight slope: one plane.
        top_face(c, poly(*corners), fill, grid)
    else:
        # The odd corner: the single raised one, or the single lowered one.
        odd = heights.index(1) if raised == 1 else heights.index(0)
        a, b = corners[(odd + 1) % 4], corners[(odd + 3) % 4]
        opposite = corners[(odd + 2) % 4]
        c.fill(poly(a, opposite, b), fill)
        c.fill(poly(corners[odd], a, b), fill)
        # The light grid, on the N and W edges as everywhere else.
        for i, j in ((0, 1), (3, 0)):
            top_face_line(c, P(*corners[i]), P(*corners[j]), grid)

    for edge, color in (((3, 2), CLIFF_SOUTH), ((1, 2), CLIFF)):
        i, j = edge
        (ui, vi, zi), (uj, vj, zj) = corners[i], corners[j]
        if zi == 0 and zj == 0:
            continue
        face = poly((ui, vi, zi), (uj, vj, zj), (uj, vj, 0), (ui, vi, 0))
        if zi and zj:
            side_face(c, face, color, rng, textured=True)
        else:
            # The raised top corner first, then the far base corner, so edge 0
            # is the crease where the surface meets the wedge.
            top_i, top_j, base_j, base_i = face
            tri = [top_i, base_j, base_i] if zi else [top_j, base_i, base_j]
            side_face(c, tri, color, rng, textured=False, outline=[0])
    return c


def top_face_line(cell: Cell, a, b, line) -> None:
    """
    One grid line: a soft dark halo — the line's colour, multiplied into the
    surface at `GLOW_STRENGTH` — then the sharp line over it.
    """
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    # Pulled in by half the width at each end, or the flat cap pokes past
    # the corner onto the wall below.
    k = GRID * SS / 2 / length
    a2 = (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
    b2 = (b[0] - (b[0] - a[0]) * k, b[1] - (b[1] - a[1]) * k)
    # Multiply: white leaves the surface alone; the halo is the line colour
    # faded toward white by the strength, so it darkens gently.
    halo = tuple(round(255 - GLOW_STRENGTH * (255 - c)) for c in line)
    layer = Image.new('RGB', cell.img.size, (255, 255, 255))
    ImageDraw.Draw(layer).line([a2, b2], fill=halo, width=round(GLOW * SS))
    rgb = ImageChops.multiply(cell.img.convert('RGB'), layer)
    rgb.putalpha(cell.img.split()[3])
    cell.img = rgb
    cell.stroke(a2, b2, line, GRID)


# Corner heights (h00, h10, h11, h01) of each piece. A side's two corners are
# raised for a straight slope toward it; corner c (NE 0, SE 1, SW 2, NW 3) is
# lattice corner (1,0), (1,1), (0,1), (0,0) — index 1, 2, 3, 0 below.
CORNER_INDEX = {0: 1, 1: 2, 2: 3, 3: 0}
SIDE_CORNERS = {'N': (0, 1), 'E': (1, 2), 'S': (2, 3), 'W': (3, 0)}


def slope(mat, rng, direction: str) -> Cell:
    """A ramp climbing toward one side: that side's two corners raised."""
    heights = [0, 0, 0, 0]
    for i in SIDE_CORNERS[direction]:
        heights[i] = 1
    return ramp(mat, rng, heights)


def inner(mat, rng, first_side: int) -> Cell:
    """Climbs toward sides `first_side` and the next clockwise: three corners raised."""
    heights = [1, 1, 1, 1]
    heights[CORNER_INDEX[(first_side + 2) % 4]] = 0
    return ramp(mat, rng, heights)


def outer(mat, rng, first_side: int) -> Cell:
    """Rises to the corner between `first_side` and the next clockwise."""
    heights = [0, 0, 0, 0]
    heights[CORNER_INDEX[first_side]] = 1
    return ramp(mat, rng, heights)


RIM_EDGES = {
    'N': ((0, 0, 0), (1, 0, 0)),
    'E': ((1, 0, 0), (1, 1, 0)),
    'S': ((1, 1, 0), (0, 1, 0)),
    'W': ((0, 1, 0), (0, 0, 0)),
}

CORNERS = {'L': (0, 1), 'R': (1, 0), 'F': (1, 1)}


def scallop_band(edge: str, depth: float, bumps: int, z=lambda u, v: 0.0):
    """
    The polygon of a lace along one edge of the base diamond, inside it: the
    straight edge, then a wavy far side of `bumps` semicircles. `z` lifts each
    lattice point onto a surface, so the lace can lie on a slope.
    """
    (a, b) = RIM_EDGES[edge]
    # Inward direction, in lattice units: from the edge toward the cell.
    inward = {'N': (0, 1), 'E': (-1, 0), 'S': (0, -1), 'W': (1, 0)}[edge]
    pts = [P(a[0], a[1], z(a[0], a[1])), P(b[0], b[1], z(b[0], b[1]))]
    steps = 24 * bumps
    for k in range(steps, -1, -1):
        t = k / steps
        phase = (t * bumps) % 1
        d = depth * (0.55 + 0.45 * math.sqrt(max(0.0, 1 - (2 * phase - 1) ** 2)))
        u = a[0] + (b[0] - a[0]) * t + inward[0] * d
        v = a[1] + (b[1] - a[1]) * t + inward[1] * d
        pts.append(P(u, v, z(u, v)))
    return pts


# Height of a straight slope climbing toward a side, over the cell.
SLOPE_Z = {
    'N': lambda u, v: 1 - v,
    'E': lambda u, v: u,
    'S': lambda u, v: v,
    'W': lambda u, v: 1 - u,
}


def fringe(color, edge: str, sloped: bool = False) -> Cell:
    """
    The lace of `color` hanging over this cell from the neighbour across
    `edge`: flat, or laid down the slope that climbs toward that edge.
    """
    c = Cell()
    pts = scallop_band(edge, FRINGE_DEPTH, FRINGE_BUMPS, SLOPE_Z[edge] if sloped else (lambda u, v: 0.0))
    d = ImageDraw.Draw(c.img)
    d.polygon(pts, fill=color)
    # Outline the wavy side only; the straight side meets the neighbour's fill.
    d.line(pts[2:], fill=LACE_INK, width=round(OUTLINE * 0.8 * SS), joint='curve')
    return c


def lace_cap(color, corner: int) -> Cell:
    """The lace of `color` wrapped around corner `corner` (NE 0, SE 1, SW 2, NW 3)."""
    c = Cell()
    cu, cv = [(1, 0), (1, 1), (0, 1), (0, 0)][corner]
    # The two edges leaving the corner, as unit inward directions.
    a, b = [((-1, 0), (0, 1)), ((0, -1), (-1, 0)), ((1, 0), (0, -1)), ((0, 1), (1, 0))][corner]
    # On the outer corner's slope, which falls away from the raised corner.
    z = lambda u, v: 1 - abs(u - cu) - abs(v - cv)
    pts = [P(cu, cv, 1)]
    steps = 48
    # One smooth bulge, at the fringe's full depth, so it reads as the fringe
    # turning the corner rather than as a separate blob.
    depth = FRINGE_DEPTH
    for k in range(steps + 1):
        t = k / steps
        theta = t * math.pi / 2
        d = depth * (0.75 + 0.25 * math.sin(theta * 2))
        u = cu + d * (a[0] * math.cos(theta) + b[0] * math.sin(theta))
        v = cv + d * (a[1] * math.cos(theta) + b[1] * math.sin(theta))
        pts.append(P(u, v, z(u, v)))
    d2 = ImageDraw.Draw(c.img)
    d2.polygon(pts, fill=color)
    d2.line(pts[1:], fill=LACE_INK, width=round(OUTLINE * 0.8 * SS), joint='curve')
    return c


def fold(color, direction: str, first_raised: bool) -> Cell:
    """A line along one edge, one end a block up: the ridge at a plateau's corner."""
    c = Cell()
    (au, av, _), (bu, bv, _) = RIM_EDGES[direction]
    a = (au, av, 1 if first_raised else 0)
    b = (bu, bv, 0 if first_raised else 1)
    c.stroke(P(*a), P(*b), color, OUTLINE * 0.8, caps=True)
    return c


def patch(mat, rng) -> Cell:
    """A darker tuft of grass filling the cell, with a few blades marked on it."""
    c = Cell()
    c.fill(top_quad(0), mat[3])
    for _ in range(3):
        u, v = rng.uniform(0.25, 0.75), rng.uniform(0.25, 0.75)
        x, y = P(u, v, 0)
        w, h = 5 * SS, 4 * SS
        d = ImageDraw.Draw(c.img)
        d.line([(x - w, y - h), (x, y), (x + w, y - h)], fill=TUFT, width=round(1.6 * SS), joint='curve')
        d.line([(x - 2 * w, y - 2), (x - w * 0.6, y + h * 0.8)], fill=TUFT, width=round(1.4 * SS))
    return c


def rim(color, direction: str) -> Cell:
    """The outline along one edge of the base diamond, centred on it, in this material's edge colour."""
    c = Cell()
    a, b = RIM_EDGES[direction]
    c.stroke(P(*a), P(*b), color, OUTLINE, caps=True)
    return c


def corner(which: str) -> Cell:
    """A vertical outline, one block tall, at the left, right or front corner."""
    c = Cell()
    u, v = CORNERS[which]
    c.stroke(P(u, v, 0), P(u, v, 1), INK, OUTLINE, caps=True)
    return c


# --- the sheet -------------------------------------------------------------

def build() -> Image.Image:
    sheet = Image.new('RGBA', (COLS * PITCH, ROWS * PITCH), (0, 0, 0, 0))

    def put(row: int, col: int, cell: Cell) -> None:
        # The cell, then its four edges and corners extruded into the gutter.
        img = cell.resolve()
        x0, y0 = col * PITCH + PAD, row * PITCH + PAD
        sheet.paste(img, (x0, y0))
        left, right = img.crop((0, 0, 1, CELL)), img.crop((CELL - 1, 0, CELL, CELL))
        top, bottom = img.crop((0, 0, CELL, 1)), img.crop((0, CELL - 1, CELL, CELL))
        for k in range(1, PAD + 1):
            sheet.paste(left, (x0 - k, y0))
            sheet.paste(right, (x0 + CELL - 1 + k, y0))
            sheet.paste(top, (x0, y0 - k))
            sheet.paste(bottom, (x0, y0 + CELL - 1 + k))
        for (cx, cy), (px, py) in (((0, 0), (x0 - PAD, y0 - PAD)), ((CELL - 1, 0), (x0 + CELL, y0 - PAD)),
                                   ((0, CELL - 1), (x0 - PAD, y0 + CELL)), ((CELL - 1, CELL - 1), (x0 + CELL, y0 + CELL))):
            sheet.paste(Image.new('RGBA', (PAD, PAD), img.getpixel((cx, cy))), (px, py))

    for m, mat in enumerate(MATERIALS):
        rng = random.Random(f'iso-smooth:{mat[0]}')
        r = m * 3
        put(r, 0, cube(mat, rng))
        put(r, 1, cube(mat, rng, height=0.5))
        put(r, 2, slope(mat, rng, 'W'))
        put(r, 3, slope(mat, rng, 'N'))
        put(r + 1, 0, turf(mat, rng))
        put(r + 1, 1, flat(mat))
        put(r + 1, 2, slope(mat, rng, 'S'))
        put(r + 1, 3, slope(mat, rng, 'E'))
        for d in range(4):
            put(r, 4 + d, inner(mat, rng, d))
            put(r + 1, 4 + d, outer(mat, rng, d))
        for col, direction in enumerate('NESW'):
            put(r + 2, col, rim(mat[5], direction))
            put(r + 2, 4 + col, fringe(mat[1], direction))
            put(r + 2, 9 + col, fringe(mat[3], direction))
        put(r + 2, 8, patch(mat, rng))
        for col in range(4):
            put(r + 2, 13 + col, lace_cap(mat[1], col))
        for col, direction in enumerate('NESW'):
            put(r + 2, 17 + col, fringe(mat[1], direction, sloped=True))
            put(r + 2, 21 + 2 * col, fold(mat[4], direction, True))
            put(r + 2, 22 + 2 * col, fold(mat[4], direction, False))
    for col, which in enumerate('LRF'):
        put(9, col, corner(which))
    return sheet


if __name__ == '__main__':
    sheet = build()
    OUT_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_SOURCE, optimize=True)
    sheet.save(OUT_PUBLIC, optimize=True)
    print(f'wrote {OUT_SOURCE.relative_to(ROOT)} and {OUT_PUBLIC.relative_to(ROOT)} ({sheet.width}x{sheet.height})')
