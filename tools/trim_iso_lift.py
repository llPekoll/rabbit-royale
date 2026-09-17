#!/usr/bin/env python3
"""
Rogne la bande de rocher cuite sous chaque tuile a la hauteur du palier.

`gen_iso_sheets.py` cuit un bloc par tuile : la face du dessus et, sous ses
deux aretes basses, `LIFT` lignes de rocher. Les feuilles en jeu ont ete cuites
a 18, puis retouchees a la main dans Aseprite — on ne peut donc pas les
recuire depuis `art-source/` sans perdre les retouches. Quand `TIER_LIFT`
baisse, ce script coupe la bande en place, ligne par ligne sous l'arete du
losange, et garde les `lift` premieres : `rock_band` prend les `lift` lignes
du HAUT de la face sans les reechantillonner verticalement, donc les 6
premieres lignes d'une bande de 18 sont, au pixel pres, la bande de 6.

Idempotent : une feuille deja rognee ressort identique.

    python3 tools/trim_iso_lift.py [--lift 6] fichiers...
"""
from PIL import Image
import sys

TILE = 64
DIAMOND_W = 44
DIAMOND_H = 24
# Ce que la bande cuite mesure au plus : au-dela, ce sont des pixels du dessus
# de la cellule d'en dessous, qu'on ne touche pas.
BAKED_LIFT = 18


def edge_y(col: int) -> int:
    """La ligne de l'arete basse du losange a cette colonne (geometrie de
    `add_volume`, a l'identique)."""
    oy = (TILE - DIAMOND_H) // 2
    t = abs(col - DIAMOND_W / 2) / (DIAMOND_W / 2)
    return oy + int((DIAMOND_H - 1) - t * (DIAMOND_H / 2 - 1))


def trim(path: str, lift: int) -> int:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    ox = (TILE - DIAMOND_W) // 2
    cleared = 0
    for r in range(im.height // TILE):
        for c in range(im.width // TILE):
            for col in range(DIAMOND_W):
                x = c * TILE + ox + col
                ey = r * TILE + edge_y(col)
                for dy in range(lift + 1, BAKED_LIFT + 1):
                    y = ey + dy
                    if y >= (r + 1) * TILE:
                        break
                    if px[x, y][3]:
                        px[x, y] = (0, 0, 0, 0)
                        cleared += 1
    if path.endswith(".webp"):
        im.save(path, "WEBP", lossless=True)
    else:
        im.save(path)
    return cleared


def main() -> None:
    args = sys.argv[1:]
    lift = 6
    if "--lift" in args:
        i = args.index("--lift")
        lift = int(args[i + 1])
        del args[i:i + 2]
    if not args:
        sys.exit(__doc__)
    for p in args:
        print(f"{p}: {trim(p, lift)} px rognes")


if __name__ == "__main__":
    main()
