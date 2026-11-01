# LES SIGNES D'ARGENT QUE FUSION PIXEL N'A PAS, dessines au pixel.
#
#   python tools/fusion-currency.py godot/assets/fonts/fusion-pixel-10-rr-*.ttf
#
# Reecrit sur place les polices DEJA passees par fusion-godot.py (grille de
# d8, gras). Fusion Pixel (2026.09.01) a « $ », « £ », « ¥ », « ¢ » mais ni
# « € », ni « ≈ », ni le « ₫ », le « ₩ », le « ₹ »... que Play et Stripe
# ecrivent dans les prix (« 4,99 € », « ≈ 0,25 € » a cote d'un prix en Gold) :
# le web n'a pas de face de secours, ils sortaient en carres (2026-11-01).
# Ni l'espace insecable (U+00A0, U+202F) que Play met entre le nombre et la
# devise : elle prend le glyphe de l'espace.
#
# Les dessins sont au trait simple, sur la grille de Fusion 10 (capitales de
# 5 x 7, rangee 0 = ligne de base), puis passes au meme gras que les lettres
# (`embolden` de fusion-godot.py) : chasse 7, comme le « $ » voisin.
#
# tools/subset-fusion-font.sh le relance apres chaque sous-ensemble.
import importlib.util
import sys
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

_spec = importlib.util.spec_from_file_location("fusion_godot", Path(__file__).with_name("fusion-godot.py"))
_godot = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_godot)
PX = _godot.PX

# Rangee du haut d'abord ; le nombre = la hauteur de la rangee du bas
# (0 = posee sur la ligne de base).
SIGNS: dict[str, tuple[list[str], int]] = {
    "€": ([
        "..###",
        ".#...",
        "####.",
        ".#...",
        "####.",
        ".#...",
        "..###",
    ], 0),
    "≈": ([
        ".##.#",
        "#..#.",
        ".....",
        ".##.#",
        "#..#.",
    ], 0),  # deux tildes, de la ligne de base a la hauteur d'un « ~ »
    "₫": ([
        "..###",
        "...#.",
        ".###.",
        "#..#.",
        ".###.",
        ".....",
        "####.",
    ], 0),
    "₩": ([
        "#...#",
        "#...#",
        "#####",
        "#.#.#",
        "#####",
        "##.##",
        "#...#",
    ], 0),
    "₹": ([
        "#####",
        "...#.",
        "#####",
        "..#..",
        "##...",
        "..#..",
        "...#.",
    ], 0),
    "₱": ([
        ".###.",
        "#####",
        ".#..#",
        "#####",
        ".#...",
        ".#...",
        ".#...",
    ], 0),
    "₺": ([
        ".#...",
        ".#.#.",
        ".##..",
        ".#.#.",
        ".##..",
        ".#..#",
        ".###.",
    ], 0),
    "₽": ([
        ".###.",
        ".#..#",
        ".#..#",
        ".###.",
        "###..",
        ".#...",
        ".#...",
    ], 0),
    "₴": ([
        ".###.",
        "#...#",
        "#####",
        "..#..",
        "#####",
        "#...#",
        ".###.",
    ], 0),
    "₪": ([
        "###.#",
        "#.#.#",
        "#.#.#",
        "#.#.#",
        "#.#.#",
        "#...#",
        "#.###",
    ], 0),
    "₦": ([
        "#...#",
        "##..#",
        "#####",
        "#.#.#",
        "#####",
        "#..##",
        "#...#",
    ], 0),
    "₸": ([
        "#####",
        ".....",
        "#####",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
    ], 0),
}
SPACES = [0x00A0, 0x202F]


def lit_of(rows: list[str], bottom: int) -> set[tuple[int, int]]:
    """Les pixels d'un dessin, sa rangee du bas a la hauteur `bottom`."""
    h = len(rows)
    return {(x, bottom + h - 1 - y) for y, row in enumerate(rows) for x, c in enumerate(row) if c == "#"}


def main(paths: list[str]) -> None:
    for path in paths:
        font = TTFont(path)
        cmap = font.getBestCmap()
        glyf, hmtx = font["glyf"], font["hmtx"]
        ref = cmap[ord("$")]  # la chasse et les metriques verticales du voisin
        added = 0
        for ch, (rows, lift) in SIGNS.items():
            if ord(ch) in cmap:
                continue
            lit = _godot.embolden(lit_of(rows, lift))
            name = f"uni{ord(ch):04X}"
            pen = TTGlyphPen(None)
            _godot.squares(lit).draw(pen)
            glyf[name] = pen.glyph()
            glyf[name].recalcBounds(glyf)
            hmtx[name] = (hmtx[ref][0], glyf[name].xMin)
            if "vmtx" in font:
                font["vmtx"][name] = font["vmtx"][ref]
            for table in font["cmap"].tables:
                if table.isUnicode():
                    table.cmap[ord(ch)] = name
            added += 1
        space = cmap[ord(" ")]
        for code in SPACES:
            if code not in cmap:
                for table in font["cmap"].tables:
                    if table.isUnicode():
                        table.cmap[code] = space
                added += 1
        font.setGlyphOrder(list(glyf.glyphOrder))
        font.save(path)
        print(f"{path}: {added} signes ajoutes")


if __name__ == "__main__":
    main(sys.argv[1:])
