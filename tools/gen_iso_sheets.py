#!/usr/bin/env python3
"""
Bake Tiny Swords' top-down terrain into TRUE isometric sheets.

The game currently ships the pack's flat 64px squares and lets the renderer
shear them at draw time (`IsoIslandView.stamp`, a Matrix that maps the square's
corners onto the 44x24 diamond). That shear happens on the GPU, every frame,
on nearest-neighbour pixel art — and squashing art to 69% of its width and 37%
of its height at sample time is precisely why the ground reads as mushy.

This tool does the same projection ONCE, offline, with control over the
resampling, and writes the result as new sheets. Two things fall out of that:

  - the pixels are resolved with a real filter and then snapped, rather than
    point-sampled by the GPU, so edges land where they should;
  - the output is EDITABLE. It is a painted starting point at the right
    geometry, which is the thing a blank template cannot be.

## This is a starting point, not the finished art

An honest warning, because it decides how the output should be used: no
transform invents detail that squashing destroyed. A 64px tile projected to a
44x24 diamond has ~4x fewer pixels, and horizontal detail suffers worst. What
comes out is correctly shaped and correctly lit, and it wants a pass by hand —
which is the stated plan.

## Geometry

Every cell is projected by the same matrix the renderer uses, so a baked sheet
drops into the existing slicer unchanged:

    east  step = ( w/2, h/2)      south step = (-w/2, h/2)

applied to the cell's unit square, with `w, h = 44, 24`. The output cell stays
64px so the sheet's grid, and therefore `tileset.ts`, is untouched — the
diamond simply sits inside it, centred, with transparent corners.

## Why the cell stays 64

Changing it would mean changing `TILE` in `tileset.ts`, every slice offset, and
every foot measurement in the pack. The diamond is 44x24 and lives inside a
64px cell: that costs some empty pixels and keeps the entire loader, the prop
anchors and the blob-set offsets exactly as they are.
"""
from PIL import Image
from typing import Optional
import os
import sys

TILE = 64
DIAMOND_W = 44
DIAMOND_H = 24

# The ORIGINAL top-down art, kept out of the game's asset folder on purpose.
#
# This tool used to read `public/assets/terrain/` and `--install` used to write
# back to it, so a second run projected its own output: tiles shrank by 45% per
# run and the geometry silently collapsed. Reading from a pristine copy makes
# the bake idempotent — run it as often as you like, the result is identical.
SRC = "art-source/terrain-flat"
OUT = "art-source/iso-sheets"

# Supersampling factor for the projection. The transform is done at this
# multiple and reduced with NEAREST, which resolves the diagonal edges of the
# diamond far better than projecting straight to 44x24 (where a one-pixel
# error on a 24px-tall shape is 4% of the whole tile).
SS = 8


def project_cell(cell: Image.Image, w: int, h: int, box: int = TILE) -> Image.Image:
    """One 64x64 square onto one w x h diamond, centred in a 64px box.

    The projection is affine and Pillow wants the INVERSE (output -> input),
    which is the reason for the explicit inversion rather than feeding the
    forward matrix straight in — passing the forward one silently yields a
    mirrored, wrongly-scaled tile that still looks plausible at a glance.
    """
    n = cell.size[0]
    # Forward: unit square -> diamond, in pixels.
    #   east  (1,0) -> ( w/2,  h/2)
    #   south (0,1) -> (-w/2,  h/2)
    a, b = w / 2 / n, h / 2 / n
    c, d = -w / 2 / n, h / 2 / n

    det = a * d - b * c
    ia, ib = d / det, -b / det
    ic, id_ = -c / det, a / det

    big_w, big_h = w * SS, h * SS
    # Output origin sits at the diamond's top vertex: the source's (0,0) corner
    # maps there, so the inverse transform is offset by half the width.
    ox = -(w * SS) / 2

    out = cell.transform(
        (big_w, big_h),
        Image.AFFINE,
        (
            ia / SS, ic / SS, (ia * ox) / SS,
            ib / SS, id_ / SS, (ib * ox) / SS,
        ),
        resample=Image.NEAREST,
    )
    out = out.resize((w, h), Image.NEAREST)

    out_box = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    out_box.alpha_composite(out, ((box - w) // 2, (box - h) // 2))
    return out_box



# ---------------------------------------------------------------------------
# Blocks: the tile WITH its volume
#
# A projected surface is a lid — a diamond with no thickness — and a lid does
# not read as ground you could stand on. The volume used to be reconstituted at
# mount time, the renderer stacking a separate cliff-face tile underneath; that
# works, but it means the thickness is invisible while the tile is being
# painted, and the artist is editing two files to see one object.
#
# So the block is baked. Each tile carries its top face and the two sides this
# camera sees (south-west and south-east), `LIFT` pixels tall — the same 18 the
# board lifts a tier by, which is what makes a stack of them close with no seam.
#
# The sides are shaded from the top's own pixels rather than filled flat: a
# column of rock lit like the grass above it reads as one object, and it keeps
# whatever palette the tile is painted in without a second colour decision.
# ---------------------------------------------------------------------------
LIFT = 18

# Row of the elevation sheet holding the tall cliff face.
FACE_SHEET_ROW = 3

# How much the two visible faces darken, relative to the surface they hang from.
# South-west catches less light than south-east, which is the convention the
# pack's own cliffs use and what gives an iso block its readable corner.
FACE_SHADE = {"sw": 0.62, "se": 0.80}


def rock_band(elevation: Image.Image, col: int, lift: int, w: int) -> Image.Image:
    """A `lift`-tall strip of the pack's own cliff rock, at diamond width.

    Sides used to be a flat tone derived from the tile's top face, which made a
    raised patch of grass grow GRASS-coloured walls. A shelf's side is rock —
    that is what the pack draws, and what the eye expects under a plateau — so
    the texture is taken from the elevation sheet's face row rather than
    invented from the surface above it.

    Taken from the TOP of the face tile, because that is where the rock is
    solid: the lower part of a 64px face fades into the shelf below it.
    """
    cell = elevation.crop((col * TILE, FACE_SHEET_ROW * TILE,
                           (col + 1) * TILE, FACE_SHEET_ROW * TILE + lift))
    return cell.resize((w, lift), Image.NEAREST)


def add_volume(top: Image.Image, rock: Optional[Image.Image] = None,
               w=DIAMOND_W, h=DIAMOND_H, lift=LIFT) -> Image.Image:
    """Hang two faces under a projected top face, following the diamond's edge.

    Two earlier attempts are worth recording, because both look plausible and
    both are wrong:

    - sampling each column of the top face independently STRIPED the wall: a
      tile's lower edge is its dark outline, so every column inherited a
      different fragment of it and the side came out as vertical ribbons.
    - a flat tone averaged from the top gave a raised patch of grass green
      walls, when a shelf's side is rock.

    So the face is real rock texture (`rock`), darkened per side so the corner
    reads, and clipped to hang from the diamond's own lower edge — which is
    what keeps a cut-corner blob variant from growing a wall in mid-air.
    """
    box = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    ox, oy = (TILE - w) // 2, (TILE - h) // 2
    src = top.load()

    if rock is None:
        return top

    rock_px = rock.load()
    faces = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    px = faces.load()

    for col in range(w):
        x = ox + col
        # The diamond's lower boundary at this column: the edge runs from the
        # side tips down to the bottom vertex at the centre.
        t = abs(col - w / 2) / (w / 2)
        edge_y = oy + int((h - 1) - t * (h / 2 - 1))

        # Only hang a face where the tile has ground in this column.
        if not any(src[x, y][3] > 0 for y in range(oy, min(edge_y + 1, TILE))):
            continue

        shade = FACE_SHADE["sw"] if col < w / 2 else FACE_SHADE["se"]
        for dy in range(1, lift + 1):
            y = edge_y + dy
            if not (0 <= y < TILE):
                continue
            r, g, b, a = rock_px[col, dy - 1]
            if a == 0:
                continue
            px[x, y] = (int(r * shade), int(g * shade), int(b * shade), 255)

    box.alpha_composite(faces)
    box.alpha_composite(top)
    return box


def project_sheet(path_in: str, path_out: str, cols: int, rows: int,
                  w=DIAMOND_W, h=DIAMOND_H, volume: bool = True) -> str:
    src = Image.open(path_in).convert("RGBA")
    elevation = Image.open(f"{SRC}/tilemap-elevation.webp").convert("RGBA")
    dst = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            cell = src.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
            if not cell.getbbox():
                continue
            tile = project_cell(cell, w, h)
            if volume:
                # Blob column decides which of the four rock variants is used,
                # so neighbouring cells do not all show the same face.
                tile = add_volume(tile, rock_band(elevation, c % 4, LIFT, w), w, h)
            dst.alpha_composite(tile, (c * TILE, r * TILE))
    os.makedirs(os.path.dirname(path_out), exist_ok=True)
    dst.save(path_out)
    return path_out


# ---------------------------------------------------------------------------
# Foam
#
# The pack's surf is drawn for a TOP-DOWN grid: a 192px frame around a 64px
# tile, three tiles across, counting on the neighbouring cells to overdraw most
# of it. On a diamond lattice nothing overdraws anything, so every shore cell
# lays its own full ring and the coast silts up into a bank of cloud — which is
# exactly what it did.
#
# So the foam is re-cut the way the ground was: projected onto the diamond, and
# cropped to ONE cell plus a small margin. What survives is the ragged lip of
# the ring, which is the part that reads as water meeting a shore; the rest was
# only ever there to be covered up.
# ---------------------------------------------------------------------------
FOAM_FRAMES = 8
FOAM_CELL = 192
# How far past its own diamond a cell's surf may reach, as a share of the cell.
# Enough to break the straight edge, not enough to touch the next cell's ring.
FOAM_MARGIN = 0.30


def project_foam(path_in: str, path_out: str) -> str:
    src = Image.open(path_in).convert("RGBA")
    w = int(DIAMOND_W * (1 + FOAM_MARGIN * 2))
    h = int(DIAMOND_H * (1 + FOAM_MARGIN * 2))
    out = Image.new("RGBA", (TILE * FOAM_FRAMES, TILE), (0, 0, 0, 0))
    for i in range(FOAM_FRAMES):
        cell = src.crop((i * FOAM_CELL, 0, (i + 1) * FOAM_CELL, FOAM_CELL))
        # The frame's own 64px tile sits at its centre; project THAT square, so
        # the diamond lands where the cell is, and let the margin carry the
        # overspill.
        inner = cell.crop((
            (FOAM_CELL - TILE) // 2, (FOAM_CELL - TILE) // 2,
            (FOAM_CELL + TILE) // 2, (FOAM_CELL + TILE) // 2,
        ))
        tile = project_cell(inner, w, h)
        out.alpha_composite(tile, (i * TILE, 0))
    os.makedirs(os.path.dirname(path_out), exist_ok=True)
    out.save(path_out)
    return path_out


# ---------------------------------------------------------------------------
# The pack's own shadow and foam, sheared onto the diamond
#
# Both were being RECONSTRUCTED before: the cast shadow as the island's
# rendered silhouette blurred and offset, the foam as sixteen offset copies of
# that silhouette union'd into a ring. Neither reproduced what the pack already
# draws — an irregular, hand-stippled edge — and the ring in particular had no
# way to be hollow (`blendMode: 'erase'` and an inverse mask were both tried
# and measured; neither cut a hole).
#
# The pack ships both, drawn for a top-down grid. Shearing them onto the
# isometric diamond is the same one-line matrix the terrain uses, and it
# replaces all of that machinery with an image.
# ---------------------------------------------------------------------------
PACK = "art-source/tiny-swords-png/Terrain/Tileset"

FOAM_PACK_FRAMES = 16


def project_pack_shadow(path_out: str) -> str:
    """The pack's blob shadow, on the diamond, at one cell."""
    src = Image.open(f"{PACK}/Shadow.png").convert("RGBA")
    box = src.crop(src.getbbox()).resize((TILE, TILE), Image.NEAREST)
    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    out.alpha_composite(project_cell(box, DIAMOND_W, DIAMOND_H))
    os.makedirs(os.path.dirname(path_out), exist_ok=True)
    out.save(path_out)
    return path_out


def project_pack_foam(path_out: str) -> str:
    """The pack's animated surf, sheared onto the diamond at its own size.

    Sixteen frames of 86x91. Each is squared off to 86x86 — shape only, not
    scale — so the projected diamond comes out symmetric, then sheared with the
    board's own ratio. The result lands at roughly 59x32 against a 44x24 cell,
    so a sprite placed on its tile spills a few pixels past it on every side.
    That spill is the whole point: it is what reads as surf, and it is what
    lets neighbouring cells join into one coastline instead of a quilt.

    Two things NOT to do here, both tried and measured:

    - Resizing a frame to the cell before shearing. It then lands exactly
      inside the diamond, overhangs nothing, and every shore cell paints a
      separate lozenge.
    - Hollowing the middle out to leave a rim. The pack's foam is a filled
      shape — in Tiny Swords a water tile covers its centre — so erasing the
      inside erases the sprite.
    """
    src = Image.open(f"{PACK}/Water Foam.png").convert("RGBA")
    fw = src.width // FOAM_PACK_FRAMES
    k = fw / TILE
    w = int(round(DIAMOND_W * k))
    h = int(round(DIAMOND_H * k))
    # A box wide enough to hold the overhang; a cell-sized one clips it off.
    box = TILE * 2
    out = Image.new("RGBA", (box * FOAM_PACK_FRAMES, box), (0, 0, 0, 0))
    for i in range(FOAM_PACK_FRAMES):
        frame = src.crop((i * fw, 0, (i + 1) * fw, src.height)).resize((fw, fw), Image.NEAREST)
        out.alpha_composite(project_cell(frame, w, h, box), (i * box, 0))
    os.makedirs(os.path.dirname(path_out), exist_ok=True)
    out.save(path_out)
    return path_out


def project_faces(path_in: str, path_out: str) -> str:
    """The elevation sheet, whose FACE rows must not be projected.

    Rows 3, 5 and 7 are cliff faces: they stand vertically and the renderer
    does not shear them — it only squashes them horizontally to the diamond's
    width (`sprite.scale.set(metrics.w / TILE, 1)`). Project those like ground
    and the island's walls come out lying on the floor.

    So this walks the sheet row by row and applies the right treatment to each,
    which is the whole reason the elevation sheet cannot go through
    `project_sheet` unchanged.
    """
    FACE_ROWS = {3, 5, 7}
    cols, rows = 4, 8
    src = Image.open(path_in).convert("RGBA")
    dst = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            cell = src.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
            if not cell.getbbox():
                continue
            if r in FACE_ROWS:
                # Horizontal squash only, exactly what the renderer does, baked
                # so the face's own pixels are resolved once instead of every
                # frame. Height is untouched: the wall's 32px is what
                # `FACE_SOLID_H` and `TIER_LIFT` are measured against.
                squashed = cell.resize((DIAMOND_W, TILE), Image.NEAREST)
                box = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                box.alpha_composite(squashed, ((TILE - DIAMOND_W) // 2, 0))
                dst.alpha_composite(box, (c * TILE, r * TILE))
            else:
                dst.alpha_composite(project_cell(cell, DIAMOND_W, DIAMOND_H),
                                    (c * TILE, r * TILE))
    os.makedirs(os.path.dirname(path_out), exist_ok=True)
    dst.save(path_out)
    return path_out


# Where the Storybook preview reads the baked sheets from. Separate from the
# game's own `public/assets/terrain/`, so a bake can be looked at without
# touching what the game loads — validate first, install second.
# Where the game loads its terrain from — the overwrite target of `--install`.
GAME = "public/assets/terrain"

PREVIEW = "public/assets/terrain-iso"


def preview(png_path: str) -> str:
    """Publish a baked sheet for the Storybook preview, as lossless WebP."""
    name = os.path.basename(png_path).replace(".png", ".webp")
    dst = f"{PREVIEW}/{name}"
    os.makedirs(PREVIEW, exist_ok=True)
    Image.open(png_path).convert("RGBA").save(dst, "WEBP", lossless=True)
    return dst


def install(png_path: str) -> str:
    """Write the baked sheet where the game loads it, as lossless WebP.

    Lossless because the game scales this art with nearest-neighbour: lossy
    compression smears exactly the hard edges pixel art is made of, and the
    smear is then magnified by the upscale.
    """
    name = os.path.basename(png_path).replace(".png", ".webp")
    # GAME, not SRC. Writing back to SRC is what made the bake eat its own
    # output — every run projected the previous result and the tiles shrank.
    dst = f"{GAME}/{name}"
    Image.open(png_path).convert("RGBA").save(dst, "WEBP", lossless=True)
    return dst


def main():
    made = []
    for i in range(1, 6):
        # Palette 1 is SEA LEVEL, and a cell at sea level has no drop to show:
        # its neighbour is water, not a shelf below it. Extruding it gave the
        # coast a rim of cliff standing in the sea, as if the island were a
        # tabletop lifted out of the water. Tiers 2+ do sit above something and
        # keep their sides.
        made.append(project_sheet(
            f"{SRC}/palette-{i}.webp", f"{OUT}/palette-{i}.png", 9, 6,
            volume=(i > 1)))
    made.append(project_sheet(
        f"{SRC}/tilemap-flat.webp", f"{OUT}/tilemap-flat.png", 10, 4))
    made.append(project_faces(
        f"{SRC}/tilemap-elevation.webp", f"{OUT}/tilemap-elevation.png"))
    made.append(project_foam(f"{SRC}/foam.webp", f"{OUT}/foam.png"))
    made.append(project_pack_shadow(f"{OUT}/pack-shadow.png"))
    made.append(project_pack_foam(f"{OUT}/pack-foam.png"))

    print(f"{len(made)} feuilles bakees dans {OUT}/")

    # The preview copy is always refreshed: it is what the story shows, and a
    # stale one silently validates the wrong bake.
    for p in made:
        preview(p)
    print(f"   preview -> {PREVIEW}/")

    if "--install" in sys.argv:
        # Overwrite the sheets the game loads. The originals stay in git, which
        # is the undo: `git checkout public/assets/terrain`.
        for p in made:
            print("   ->", install(p))
    else:
        print("   (--install pour ecraser public/assets/terrain/)")


if __name__ == "__main__":
    main()
