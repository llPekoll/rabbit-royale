#!/usr/bin/env python3
"""
Draw the two isometric clouds of the smooth island, cleanly.

Paul's `iso-cloud-01/02.png` set the shapes: a cartoon cloud profile — flat
underside, round lobes on top — standing in a vertical plane and extruded
back along one isometric axis into a slab, so it shows a front face (the
profile), a top (the lobes' sweep) and a flat end. Those were cut out by
hand and their edges are ragged; this draws the same thing with the
sheet's own tools — masks at 8x, resolved down with a real filter — and
inks the edges in the lace ink at the lace's weight, so a cloud sits in
the picture like a piece of the island.

## Geometry

Profile coordinates: `s` along the slab, `z` up. The profile is a base
rectangle `[0, L] x [0, b]` under circles of radius `r_i` centred on the
rectangle's top edge at `s = c_i`, the first and last lobes reaching past
the rectangle's ends so the slab's ends are round: the sweep of an end
lobe's outer arc is the end face, and it shows by itself. The slab runs `d` from 0 (back) to `D`
(front) along the iso direction `n`, perpendicular to the axis `a`; a
profile point `(s, d, z)` sits at lattice `(u, v) = s * a + d * n` and is
projected with the sheet's `P()` — the tiles' own 2:1 foreshortening.

Faces, painted back to front: the profile at every `d` in the top colour
(what survives is the top surface and the round ends), then the profile
at `d = D`, the front face. Ink: the whole silhouette's outline, the front face's
outline, the lobes' joins on the front face as arcs and their sweep over
the top as lines.

Cloud 01 runs along `a = (1, 0)` (down-right on screen), 02 along
`a = (0, -1)` (up-right), as the hand-drawn ones did, so the renderer's
per-cloud axes still hold.

Run:  python3 tools/gen_iso_clouds.py
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'world'

SS = 8
OUTLINE = 2.6   # px at output: the lace's weight
INK = (104, 160, 82)
FILL_FRONT = (247, 250, 220)
FILL_TOP = (238, 244, 204)
CELL = 128
SLICES = 24


def P(u: float, v: float, z: float = 0.0) -> tuple[float, float]:
    x = (u - v) * CELL / 2
    y = (u + v) * CELL / 4 - z * CELL / 2
    return (x * SS, y * SS)


class Cloud:
    def __init__(self, axis, L, b, lobes, D):
        self.a = axis
        # The side of the slab the camera sees: `d` grows toward +u / +v.
        self.n = (0.0, 1.0) if axis == (1, 0) else (1.0, 0.0)
        self.L, self.b, self.lobes, self.D = L, b, lobes, D

    def at(self, s, d, z):
        u = s * self.a[0] + d * self.n[0]
        v = s * self.a[1] + d * self.n[1]
        return P(u, v, z)

    def profile_polys(self, d):
        """The base rectangle and each lobe circle at slab depth `d`, projected, cut to [0, L]."""
        rect = [self.at(0, d, 0), self.at(self.L, d, 0), self.at(self.L, d, self.b), self.at(0, d, self.b)]
        circles = []
        for c, r in self.lobes:
            # Whole circles, but nothing below the underside: the cloud is flat there.
            circles.append([self.at(c + r * math.cos(t), d, max(0.0, self.b + r * math.sin(t)))
                            for t in (2 * math.pi * k / 72 for k in range(72))])
        return [rect] + circles

    def joins(self):
        """Where adjacent lobes meet on the profile: (s, z) of the upper crossing."""
        out = []
        for (c0, r0), (c1, r1) in zip(self.lobes, self.lobes[1:]):
            dd = c1 - c0
            a = (r0 * r0 - r1 * r1 + dd * dd) / (2 * dd)
            hh = math.sqrt(max(0.0, r0 * r0 - a * a))
            out.append((c0 + a, self.b + hh))
        return out


def render(cloud: Cloud) -> Image.Image:
    pts = []
    for d in (0.0, cloud.D):
        for poly in cloud.profile_polys(d):
            pts += poly
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    pad = OUTLINE * SS * 3
    ox, oy = -min(xs) + pad, -min(ys) + pad
    W = int(max(xs) - min(xs) + 2 * pad)
    H = int(max(ys) - min(ys) + 2 * pad)
    sh = lambda p: (p[0] + ox, p[1] + oy)

    def mask(polys):
        m = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(m)
        for poly in polys:
            d.polygon([sh(p) for p in poly], fill=255)
        return m

    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    silhouette = Image.new('L', (W, H), 0)
    # Back to front: every slice in the top colour...
    for k in range(SLICES + 1):
        d = cloud.D * k / SLICES
        m = mask(cloud.profile_polys(d))
        silhouette = ImageChops.lighter(silhouette, m)
        img.paste(Image.new('RGBA', (W, H), (*FILL_TOP, 255)), (0, 0), m)
    # ...then the front face.
    front = mask(cloud.profile_polys(cloud.D))
    img.paste(Image.new('RGBA', (W, H), (*FILL_FRONT, 255)), (0, 0), front)

    ink = Image.new('L', (W, H), 0)
    di = ImageDraw.Draw(ink)
    w_thin = round(OUTLINE * 0.75 * SS)
    # Lobe joins: an arc of each lobe inside its neighbour on the front face,
    # and the join's sweep over the top, front to back.
    joins = cloud.joins()
    for i, (c, r) in enumerate(cloud.lobes):
        for j in (i - 1, i + 1):
            if not 0 <= j < len(cloud.lobes):
                continue
            cj, rj = cloud.lobes[j]
            arc = [cloud.at(c + r * math.cos(t), cloud.D, cloud.b + r * math.sin(t))
                   for t in (math.pi * k / 90 for k in range(181))
                   if math.hypot(c + r * math.cos(t) - cj, r * math.sin(t)) < rj - 1e-6]
            if len(arc) > 1:
                di.line([sh(p) for p in arc], fill=255, width=w_thin, joint='curve')
    for s, z in joins:
        di.line([sh(cloud.at(s, cloud.D, z)), sh(cloud.at(s, 0, z))], fill=255, width=w_thin)
    # Keep the ink inside the silhouette only.
    ink = ImageChops.multiply(ink, silhouette)
    # The front face's outline, the end's outline, and the silhouette's.
    ring = lambda m, wpx: ImageChops.subtract(m, m.filter(ImageFilter.MinFilter(wpx * 2 + 1)))
    ink = ImageChops.lighter(ink, ImageChops.multiply(ring(front, round(OUTLINE * 0.75 * SS)), silhouette))
    ink = ImageChops.lighter(ink, ring(silhouette, round(OUTLINE * SS)))
    img.paste(Image.new('RGBA', (W, H), (*INK, 255)), (0, 0), ink)

    out = img.convert('RGBa').resize((W // SS, H // SS), Image.LANCZOS).convert('RGBA')
    bbox = out.split()[3].point(lambda v: 255 if v > 4 else 0).getbbox()
    return out.crop(bbox)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    # 01: the small one, three lobes, down-right. Lobes barely overlap, so
    # their joins are short arcs in the notches, not circles.
    c1 = Cloud((1, 0), L=1.1, b=0.14, lobes=[(0.16, 0.26), (0.58, 0.36), (1.0, 0.24)], D=0.3)
    # 02: the big one, five lobes, up-right.
    c2 = Cloud((0, -1), L=2.0, b=0.16, lobes=[(0.16, 0.24), (0.56, 0.34), (1.04, 0.44), (1.52, 0.34), (1.9, 0.22)], D=0.34)
    i1 = render(c1)
    i2 = render(c2)
    i1.save(OUT / 'iso-cloud-01.png', optimize=True)
    i2.save(OUT / 'iso-cloud-02.png', optimize=True)
    print('01', i1.size, '02', i2.size)
