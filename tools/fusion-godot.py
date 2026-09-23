# LA FACE PIXEL DES AUTRES LANGUES, taillee comme celle de l'anglais.
#
#   uvx --from fonttools --with skia-pathops python tools/fusion-godot.py <ttf>
#
# Reecrit sur place un sous-ensemble de Fusion Pixel 10px (voir
# tools/subset-fusion-font.sh). Paul, 2026-09-23 : Fusion 12 « est bien
# pixelisee mais ne ressemble pas — trop fine, trop allongee ». Mesure : la
# face de l'anglais (d8-pixel) est une grille de 8 par em, capitales de 6x7,
# traits verticaux de 2 px, horizontaux de 1, chasse de 7 ; Fusion 12 avait
# des capitales de 5x9 au trait de 1. Trois gestes la ramenent a d8 :
#
#   1. LA GRILLE DE D8 : 800 unites par em au lieu de 1000, donc 8 pixels de
#      police par em comme d8 — a taille egale, un pixel de l'une vaut un
#      pixel de l'autre, et les capitales de 7 ont la meme hauteur.
#   2. LE GRAS DES POLICES BITMAP, pour l'ecriture latine seulement : chaque
#      pixel double vers la droite (verticales de 2, horizontales de 1, comme
#      d8) sauf la ou il refermerait un creux d'un pixel, et la chasse prend
#      un pixel (6 -> 7, celle de d8 ; pas les espaces). Les sinogrammes
#      gardent leur trait simple : en gras, a 9 px, ils se bouchent.
#   3. UNE LIGNE COURTE : 9 px au-dessus de la ligne de base, 1 dessous
#      (1,25 em). Le chapeau d'une capitale (É) et le jambage d'un g
#      depassent d'un pixel ; a 1,4 em chaque rangee etait bien plus haute
#      que dans d8.
import sys

import pathops
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

PX = 100  # un pixel de Fusion 10, en unites
HAN_FROM = 0x2E80  # les ecritures CJK et leur ponctuation pleine chasse


def pixels(glyph_set, name: str) -> set[tuple[int, int]]:
    """Les pixels allumes d'un glyphe (colonne, rangee), lus au centre de
    chaque case : les contours de Fusion sont des reunions de carres."""
    path = pathops.Path()
    glyph_set[name].draw(path.getPen())
    xmin, ymin, xmax, ymax = path.bounds
    lit: set[tuple[int, int]] = set()
    for cx in range(int(xmin) // PX, int(xmax) // PX + 1):
        for cy in range(int(ymin) // PX - 1, int(ymax) // PX + 1):
            if path.contains((cx * PX + PX / 2, cy * PX + PX / 2)):
                lit.add((cx, cy))
    return lit


def embolden(lit: set[tuple[int, int]]) -> set[tuple[int, int]]:
    """Chaque pixel s'etend d'un cran a droite — SAUF s'il refermerait un
    creux d'un pixel (le pixel d'apres est deja allume) : le « m » et le « M »
    gardent leurs jours au lieu de se boucher."""
    out = set(lit)
    for (x, y) in lit:
        if (x + 1, y) not in lit and (x + 2, y) not in lit:
            out.add((x + 1, y))
    return out


def squares(lit: set[tuple[int, int]]) -> pathops.Path:
    path = pathops.Path()
    for (x, y) in sorted(lit):
        square = pathops.Path()
        pen = square.getPen()
        pen.moveTo((x * PX, y * PX))
        pen.lineTo((x * PX, (y + 1) * PX))
        pen.lineTo(((x + 1) * PX, (y + 1) * PX))
        pen.lineTo(((x + 1) * PX, y * PX))
        pen.closePath()
        path = pathops.op(path, square, pathops.PathOp.UNION)
    return path


def main(path: str) -> None:
    font = TTFont(path)
    assert font["head"].unitsPerEm == 1000, "attendu : Fusion Pixel 10px"
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    glyph_set = font.getGlyphSet()

    latin: set[str] = set()
    han: set[str] = set()
    for code, name in font.getBestCmap().items():
        (han if code >= HAN_FROM else latin).add(name)
    bold = latin - han

    for name in sorted(bold):
        g = glyf[name]
        width, lsb = hmtx[name]
        if g.numberOfContours == 0:
            # Un blanc garde sa chasse : les lettres en prennent deja un pixel
            # chacune, et des espaces elargis ecartaient les mots plus que d8.
            continue
        pen = TTGlyphPen(None)
        squares(embolden(pixels(glyph_set, name))).draw(pen)
        glyf[name] = pen.glyph()
        glyf[name].recalcBounds(glyf)
        hmtx[name] = (width + PX, glyf[name].xMin)

    font["head"].unitsPerEm = 800
    hhea, os2 = font["hhea"], font["OS/2"]
    hhea.ascent, hhea.descent, hhea.lineGap = 900, -100, 0
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = 900, -100, 0
    os2.usWinAscent, os2.usWinDescent = 900, 100
    font.save(path)
    print(f"{path}: {len(bold)} glyphes latins en gras, {len(han)} sinogrammes tels quels")


if __name__ == "__main__":
    main(sys.argv[1])
