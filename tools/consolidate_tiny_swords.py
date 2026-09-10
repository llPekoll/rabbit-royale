#!/usr/bin/env python3
"""
Fold the two Tiny Swords drops into ONE asset tree.

The pack ships twice, in two folders whose names carry spaces and parentheses
("Tiny Swords (Free Pack)", "Tiny Swords (Update 010)"), with editor sources
(.aseprite, .zip), macOS junk (.DS_Store), doubled-up folders
("Resources/Resources", "UI Elements/UI Elements"), Title Case, and PNGs where
the rest of this repo ships WebP. None of that survives here.

    Update 010  ->  art-source/tiny-swords/          (canon: the newer art)
    Free Pack   ->  art-source/tiny-swords/classic/  (the older cut, kept
                                                         for the units and UI
                                                         that 010 never redrew)

Everything is re-encoded as LOSSLESS WebP, so the pixels are byte-identical
after decode and the tree lands at roughly a third of the size. Rerunning is
safe: the target directory is rebuilt from scratch every time.

    python3 tools/consolidate_tiny_swords.py [--src art-source] [--keep-src]

Writes `manifest.json` beside the art, listing every file with its pixel size —
that file is the input to `src/game/island/tileset.ts`, so no sheet geometry is
ever typed in by hand.

This tree is SOURCE, not shipped art: it lives outside `public/` so the browser
is never served six hundred files to use thirty. The sheets the island actually
loads are copied into `public/assets/terrain/` and `public/assets/deco/` — see
ISLAND_SHEETS, propUrl, seaRockUrl and tierPaletteUrl in tileset.ts for the
exact list. Add a sheet there and you must copy it across too.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

CANON_SRC = "Tiny Swords (Update 010)"
CLASSIC_SRC = "Tiny Swords (Free Pack)"
OUT_DIR = "tiny-swords"

DROP_SUFFIXES = {".aseprite", ".zip", ".ase"}
DROP_NAMES = {".DS_Store", "Thumbs.db"}

# Paths that get a deliberate name rather than the mechanical one. Keys are
# POSIX paths relative to the pack root; values are relative to the pack's
# output root. These are the load-bearing files — the tilemaps the renderer
# indexes into — so they are named for what they are, not for where the artist
# filed them.
CANON_RENAMES = {
    "Terrain/Ground/Tilemap_Flat.png": "terrain/tilemap-flat.png",
    "Terrain/Ground/Tilemap_Elevation.png": "terrain/tilemap-elevation.png",
    "Terrain/Ground/Shadows.png": "terrain/tile-shadow.png",
    "Terrain/Water/Water.png": "terrain/water.png",
    "Terrain/Water/Foam/Foam.png": "terrain/foam.png",
    "Terrain/Bridge/Bridge_All.png": "terrain/bridge.png",
    "Resources/Trees/Tree.png": "resources/tree.png",
    "Effects/Explosion/Explosions.png": "effects/explosions.png",
    "Effects/Fire/Fire.png": "effects/fire.png",
}
for _n in range(1, 5):
    CANON_RENAMES[f"Terrain/Water/Rocks/Rocks_0{_n}.png"] = f"terrain/sea-rock-0{_n}.png"
for _n in range(1, 19):
    CANON_RENAMES[f"Deco/{_n:02d}.png"] = f"deco/prop-{_n:02d}.png"

CLASSIC_RENAMES = {
    "Terrain/Tileset/Shadow.png": "terrain/tile-shadow.png",
    "Terrain/Tileset/Water Background color.png": "terrain/water-background.png",
    "Terrain/Tileset/Water Foam.png": "terrain/foam.png",
}
for _n in range(1, 6):
    CLASSIC_RENAMES[f"Terrain/Tileset/Tilemap_color{_n}.png"] = f"terrain/tilemap-color-{_n}.png"

# Parent/child folder pairs where the parent says nothing the child does not:
# the Free Pack files its bushes under "Terrain/Decorations", and the bushes are
# not terrain. The parent is dropped and the child kept. Names here are the ones
# left after SEGMENT_RENAMES.
COLLAPSE = {
    ("terrain", "deco"),
    ("terrain", "resources"),
}

# Typos and awkward spellings in the shipped filenames.
FIXUPS = {
    "archer-purlple": "archer-purple",
    "bushe": "bush",
    "rubber-duck": "duck",
    "ui-banners-from-the-store-page": "store-banners",
}

# Folder names renamed wholesale, so the two packs file the same thing the same
# way ("Decorations" and "Deco" are one folder here, not two).
SEGMENT_RENAMES = {
    "decorations": "deco",
    "ui-elements": "ui",
    "particle-fx": "fx",
    "rocks-in-the-water": "water-rocks",
    "troops": "units",
    "archer-and-bow": "bow",
    "tileset": "terrain",
}


def kebab(segment: str) -> str:
    """`Rocks in the Water` -> `rocks-in-the-water`, `Archer_Blue` -> `archer-blue`."""
    s = segment.replace("+", " and ")
    s = re.sub(r"[()\[\]]", " ", s)
    s = re.sub(r"[\s_]+", "-", s.strip())
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", s)
    s = s.lower()
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return FIXUPS.get(s, s)


def strip_known_words(segment: str, known: set[str]) -> str:
    """
    Drop words an ancestor folder already says.

    `factions/knights/troops/archer/blue/Archer_Blue.png` says "archer" three
    times and "blue" twice before it names anything new. Stripping what the path
    already established turns it into `factions/knights/units/archer/blue.webp`,
    which is the same information with none of the stutter. A segment is never
    emptied out this way — when every word is already known, its last word is
    kept, since something has to name the file.
    """
    words = [w for w in segment.split("-") if w not in known]
    if words:
        return "-".join(words)
    return segment.split("-")[-1]


def normalize(rel: Path) -> Path:
    """Mechanical path rule: kebab every segment, drop what the path repeats."""
    parts = [SEGMENT_RENAMES.get(k := kebab(p), k) for p in rel.parts[:-1]]

    collapsed: list[str] = []
    for part in parts:
        if collapsed and (collapsed[-1], part) in COLLAPSE:
            collapsed[-1] = part
            continue
        # A doubled name ("Resources/Resources") is its own kind of noise.
        if collapsed and collapsed[-1] == part:
            continue
        collapsed.append(part)

    known: set[str] = set()
    folders: list[str] = []
    for part in collapsed:
        part = strip_known_words(part, known)
        known.update(part.split("-"))
        folders.append(part)

    return Path(*folders, strip_known_words(kebab(rel.stem), known) + rel.suffix.lower())


def hoist_lone_files(jobs: list[tuple[Path, Path]]) -> list[tuple[Path, Path]]:
    """
    Lift `.../archer/blue/blue.webp` up to `.../archer/blue.webp`.

    Only when the folder holds that one file: a folder whose whole contents is a
    file of the same name is a level of nesting carrying no information, but a
    folder with siblings is a grouping, and flattening it would scatter them.
    """
    counts: dict[Path, int] = {}
    for _, dest in jobs:
        counts[dest.parent] = counts.get(dest.parent, 0) + 1
    out: list[tuple[Path, Path]] = []
    for src, dest in jobs:
        if counts[dest.parent] == 1 and dest.stem == dest.parent.name:
            dest = dest.parent.parent / dest.name
        out.append((src, dest))
    return out


def plan(pack_root: Path, out_root: Path, renames: dict[str, str]) -> list[tuple[Path, Path]]:
    jobs: list[tuple[Path, Path]] = []
    for src in sorted(pack_root.rglob("*")):
        if not src.is_file():
            continue
        if src.name in DROP_NAMES or src.suffix.lower() in DROP_SUFFIXES:
            continue
        rel = src.relative_to(pack_root)
        override = renames.get(rel.as_posix())
        dest_rel = Path(override) if override else normalize(rel)
        if dest_rel.suffix.lower() == ".png":
            dest_rel = dest_rel.with_suffix(".webp")
        jobs.append((src, out_root / dest_rel))
    return jobs


def run(jobs: list[tuple[Path, Path]], assets_root: Path, manifest: list[dict]) -> None:
    seen: dict[Path, Path] = {}
    for src, dest in jobs:
        if dest in seen:
            raise SystemExit(f"name collision: {src} and {seen[dest]} both -> {dest}")
        seen[dest] = src
        dest.parent.mkdir(parents=True, exist_ok=True)
        bbox = None
        if src.suffix.lower() == ".png":
            with Image.open(src) as im:
                im = im.convert("RGBA")
                im.save(dest, "WEBP", lossless=True, quality=100, method=6)
                w, h = im.size
                # Where the art actually is inside its padded box. Placing a
                # prop on a tile needs this: these sprites are padded by wildly
                # different amounts, and anchoring them all at their centre
                # leaves half of them hovering off the ground.
                bbox = im.getchannel("A").getbbox()
        else:
            shutil.copy2(src, dest)
            w = h = 0
        entry = {
            "path": "/" + dest.relative_to(assets_root.parent).as_posix(),
            "width": w,
            "height": h,
            "bytes": dest.stat().st_size,
        }
        if bbox:
            entry["bbox"] = list(bbox)
        manifest.append(entry)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="art-source", type=Path)
    ap.add_argument("--keep-src", action="store_true", help="leave the two original pack folders in place")
    args = ap.parse_args()

    assets = args.src.resolve()
    out_root = assets / OUT_DIR
    canon_src, classic_src = assets / CANON_SRC, assets / CLASSIC_SRC

    for path in (canon_src, classic_src):
        if not path.is_dir():
            raise SystemExit(f"missing pack: {path}")

    if out_root.exists():
        shutil.rmtree(out_root)

    jobs = hoist_lone_files(plan(canon_src, out_root, CANON_RENAMES))
    jobs += hoist_lone_files(plan(classic_src, out_root / "classic", CLASSIC_RENAMES))

    manifest: list[dict] = []
    run(jobs, assets, manifest)
    manifest.sort(key=lambda e: e["path"])
    # One entry per line: a 607-line file a diff can show you, rather than a
    # 4000-line one where every bounding box is spread over six lines.
    lines = ",\n ".join(json.dumps(e) for e in manifest)
    (out_root / "manifest.json").write_text(f"[\n {lines}\n]\n")

    if not args.keep_src:
        shutil.rmtree(canon_src)
        shutil.rmtree(classic_src)

    total = sum(e["bytes"] for e in manifest)
    print(f"{len(manifest)} files -> {out_root}  ({total / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
