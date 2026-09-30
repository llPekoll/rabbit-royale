# LES LETTRES VIETNAMIENNES QUE FUSION PIXEL N'A PAS, fabriquees au pixel.
#
#   python tools/fusion-vietnamese.py <fusion-pixel-10px-proportional-latin.ttf>
#
# Reecrit la police sur place. Fusion Pixel (2026.09.25) couvre â ê ô ă ơ ư đ
# et les accents du Latin-1, mais aucune lettre du bloc U+1EA0-1EF9 : « ạ »,
# « ấ », « ự »... sortiraient en carres, et le web n'a pas de face de secours.
#
# Chaque lettre manquante est RECOMPOSEE depuis les glyphes qui existent :
#
#   • la lettre de base est le glyphe precompose sans le ton (« â » pour « ấ »,
#     « ư » pour « ự », « ı » sans point pour « ỉ ») ;
#   • l'aigu, le grave et le tilde sont DECOUPES dans « á », « à », « ã »
#     (et « Á », « À », « Ã » pour les capitales) : la difference avec « a » ;
#   • le crochet (hoi) n'existe nulle part : il est dessine, 2 x 3 ;
#   • le point dessous (nang) est un pixel, deux rangees sous la ligne de base,
#     a la profondeur du jambage d'un « g ».
#
# LE PLACEMENT suit l'usage vietnamien en petit corps : sur un circonflexe, le
# ton se met A DROITE (« ấ » : ^ puis ´) ; sur une breve il se pose DESSUS ; le
# tilde, trop large pour la droite, se pose toujours dessus. Sans premier
# accent, le ton prend la place de l'aigu de la meme lettre (« ó » pour « ỏ »).
#
# A lancer AVANT le sous-ensemble et fusion-godot.py (voir
# tools/subset-fusion-font.sh), qui passe ensuite ces lettres en gras comme
# les autres.
import sys
import unicodedata

import pathops
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

PX = 100
TONES = {"̀": "grave", "́": "acute", "̃": "tilde", "̉": "hook", "̣": "dot"}
# Le crochet, rangee du haut d'abord.
HOOK = ["##", ".#", "#."]
# Tout ce que le vietnamien ecrit : le bloc etendu, plus les tons simples
# que le Latin-1 n'a pas (« ĩ », « ũ », « ỳ »...).
TARGETS = [chr(c) for c in range(0x1EA0, 0x1EFA)] + list("ĨĩŨũƠơƯư")


def pixels(gs, name: str) -> set[tuple[int, int]]:
    path = pathops.Path()
    gs[name].draw(path.getPen())
    if path.bounds is None or path.bounds == (0, 0, 0, 0):
        return set()
    xmin, ymin, xmax, ymax = path.bounds
    lit = set()
    for cx in range(int(xmin) // PX - 1, int(xmax) // PX + 1):
        for cy in range(int(ymin) // PX - 1, int(ymax) // PX + 1):
            if path.contains((cx * PX + PX / 2, cy * PX + PX / 2)):
                lit.add((cx, cy))
    return lit


def squares(lit) -> pathops.Path:
    path = pathops.Path()
    for (x, y) in sorted(lit):
        sq = pathops.Path()
        pen = sq.getPen()
        pen.moveTo((x * PX, y * PX))
        pen.lineTo((x * PX, (y + 1) * PX))
        pen.lineTo(((x + 1) * PX, (y + 1) * PX))
        pen.lineTo(((x + 1) * PX, y * PX))
        pen.closePath()
        path = pathops.op(path, sq, pathops.PathOp.UNION)
    return path


def normalize(pts):
    """Un accent ramene a son coin bas-gauche."""
    x0 = min(x for x, _ in pts)
    y0 = min(y for _, y in pts)
    return {(x - x0, y - y0) for x, y in pts}


def main(path: str) -> None:
    font = TTFont(path)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()

    def grid(ch: str):
        return pixels(gs, cmap[ord(ch)]) if ord(ch) in cmap else None

    def mark(accented: str, plain: str):
        return normalize(grid(accented) - grid(plain))

    marks = {}
    for case, a in (("lower", "a"), ("upper", "A")):
        marks[case] = {
            "acute": mark(unicodedata.normalize("NFC", a + "́"), a),
            "grave": mark(unicodedata.normalize("NFC", a + "̀"), a),
            "tilde": mark(unicodedata.normalize("NFC", a + "̃"), a),
            "hook": {(x, len(HOOK) - 1 - y) for y, row in enumerate(HOOK) for x, c in enumerate(row) if c == "#"},
        }

    added = 0
    glyf, hmtx = font["glyf"], font["hmtx"]
    for ch in TARGETS:
        if ord(ch) in cmap or unicodedata.category(ch) not in ("Lu", "Ll"):
            continue
        nfd = unicodedata.normalize("NFD", ch)
        tone = next((m for m in nfd if m in TONES), None)
        rest = unicodedata.normalize("NFC", nfd.replace(tone, "") if tone else nfd)
        plain = nfd[0]
        case = "upper" if ch.isupper() else "lower"
        first = rest != plain  # un circonflexe, une breve ou une corne deja la
        if tone is None or ord(rest) not in cmap:
            print(f"  saute {ch} (U+{ord(ch):04X}) : pas de base")
            continue
        kind = TONES[tone]
        base_ch = rest
        if kind != "dot" and rest == "i":
            base_ch = "ı"  # le ton remplace le point
        lit = set(grid(base_ch))
        body = grid(plain)
        body_xs = [x for x, y in body if y >= 0]
        if kind == "dot":
            cx = (min(body_xs) + max(body_xs) + 1) // 2
            lit.add((cx, -2))
        else:
            shape = marks[case][kind]
            w = max(x for x, _ in shape) + 1
            above = {(x, y) for x, y in lit - body}  # le premier accent
            horned = rest in "ơưƠƯ"
            if first and not horned:
                top = max(y for _, y in above)
                bottom = min(y for _, y in above)
                if "̂" in nfd and kind != "tilde":
                    # A droite du circonflexe, sur sa rangee du bas.
                    ox, oy = max(x for x, _ in above) + 1, bottom
                else:
                    ox = (min(x for x, _ in above) + max(x for x, _ in above) + 1 - w) // 2
                    oy = top + 2
            else:
                # La place de l'aigu sur la meme lettre nue.
                ref = unicodedata.normalize("NFC", plain + "́")
                acute = grid(ref) - grid(plain)
                ax0, ax1 = min(x for x, _ in acute), max(x for x, _ in acute)
                ox = (ax0 + ax1 + 1 - w) // 2
                oy = min(y for _, y in acute)
            ox = max(0, ox)  # le tilde, plus large que l'aigu, sortait a gauche
            lit |= {(ox + x, oy + y) for x, y in shape}

        name = f"uni{ord(ch):04X}"
        pen = TTGlyphPen(None)
        squares(lit).draw(pen)
        glyf[name] = pen.glyph()
        glyf[name].recalcBounds(glyf)
        width = hmtx[cmap[ord(base_ch)]][0]
        width = max(width, (max(x for x, _ in lit) + 2) * PX)
        hmtx[name] = (width, glyf[name].xMin)
        if "vmtx" in font:  # Fusion porte aussi des metriques verticales
            font["vmtx"][name] = font["vmtx"][cmap[ord(base_ch)]]
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[ord(ch)] = name
        added += 1

    # `glyf[name] = ...` range le nouveau nom dans l'ordre de glyf ; la police
    # entiere prend le meme.
    font.setGlyphOrder(list(glyf.glyphOrder))
    font.save(path)
    print(f"{path}: {added} lettres vietnamiennes ajoutees")


if __name__ == "__main__":
    main(sys.argv[1])
