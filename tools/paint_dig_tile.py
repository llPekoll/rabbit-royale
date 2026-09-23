#!/usr/bin/env python3
"""LA MOTTE D'UNE CASE NON CREUSEE — une plaque de gazon levee, en pixel art.

Ecrit `art-source/dig-tile/dig-tile.png` (le maitre, a retoucher dans Aseprite)
et `godot/assets/terrain/dig-tile.png` (ce que le jeu charge).

UNE RANGEE PAR PALIER (palette-1 a palette-4, dans l'ordre de
`BurrowTerrain.GRASS_SHEETS`), DEUX CASES DE 64 cote a cote par rangee, au format des feuilles du terrain (losange de
44x24 pose en (10, 20), peint sur 42 de large comme elles) : c'est ce qui
permet a `Slopes.ramp_texture` de deformer la motte sur une rampe comme il
deforme l'herbe.

  • case 0 — ENTERREE : la motte levee de `RAISED` px, bord eclaire en haut,
    tranche de terre dessous. Se lit comme un bouton de demineur couche.
  • derniere rangee — LE POTAGER DU TERRIER : la meme motte en terre
    retournee, sillons compris. Un carre de jardin sureleve, pas du pre.
  • LES RAMPES : chaque rangee repete ses deux mottes pour les 16 formes de
    rampe (coins nord, est, sud, ouest leves d'un palier ou non, `n*8+e*4+s*2+w`,
    la forme 0 est le plat) — colonne `forme*2 + motte`. LA FORME EST CELLE DU
    SOL (`Slopes._facet` : deux facettes, meme diagonale), sinon un coin de
    rampe se bombait ou se creusait et ses bords ne tombaient plus sur les
    voisines plates — des pics dans les coins. L'OMBRE, elle, est LISSE (le
    gradient bilineaire des coins) : c'est le saut d'ombre d'une facette a
    l'autre qui faisait la cassure.
  • case 1 — INDICEE : la meme motte ENFONCEE (`PRESSED` px), plus claire,
    pour que le chiffre multiplie se lise dessus.

Le gazon du dessus est celui de la palette de SON palier (la case pleine du
milieu), et les bords en derivent : une motte du plateau est un morceau du
plateau, pas un carre de pre pose dessus.

    python3 tools/paint_dig_tile.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Les feuilles QUE LE JEU CHARGE, pas les maitres : ce sont elles que la motte
# doit prolonger, retouches comprises.
GRASS_SHEETS = [ROOT / f"godot/assets/terrain/palette-{n}.webp" for n in range(1, 5)]
OUT_MASTER = ROOT / "art-source/dig-tile/dig-tile.png"
OUT_GAME = ROOT / "godot/assets/terrain/dig-tile.png"

CELL = 64
# Le losange peint des feuilles : x 11..52, y 20..43 (mesure, pas calcule).
CX = 31.5
CY = 31.5
HALF_W = 21.0
HALF_H = 12.0
# Le retrait du bord : un pixel de sol entre deux mottes, et la grille se lit.
INSET = 1.0

RAISED = 4
PRESSED = 1

# La case pleine du milieu (colonne 6, ligne 1 : l'origine du blob est en 5).
GRASS_CELL = (6, 1)

SOIL_W = (0x8c, 0x68, 0x42)
SOIL_E = (0x69, 0x4c, 0x31)
SOIL_SPECK = (0x55, 0x3d, 0x28)
OUTLINE = (0x2b, 0x22, 0x1e)


def inside(x: int, y: int, cy: float, inset: float) -> bool:
    """Le CENTRE du pixel est-il dans le losange ? (meme test que `_diamond_texture`)."""
    hw = HALF_W - inset
    hh = HALF_H - inset * HALF_H / HALF_W
    dx = abs(x + 0.5 - (CX + 0.5)) / hw
    dy = abs(y + 0.5 - (cy + 0.5)) / hh
    return dx + dy <= 1.0


def shade(c, k):
    return tuple(max(0, min(255, int(round(v * k)))) for v in c[:3])


def lighten(c, k):
    return tuple(max(0, min(255, int(round(v + (255 - v) * k)))) for v in c[:3])


def grass_colours(grass: Image.Image):
    """Les trois verts du dessus, du plus courant au moins courant — lus
    dans le losange seulement : sous lui pend la bande de rocher."""
    from collections import Counter
    cnt = Counter()
    for y in range(CELL):
        for x in range(CELL):
            c = grass.getpixel((x, y))
            if c[3] and inside(x, y, CY, 0.0):
                cnt[c[:3]] += 1
    return [c for c, _ in cnt.most_common(3)]


def paint(grass: Image.Image, lift: int, bright: float) -> Image.Image:
    greens = grass_colours(grass)
    main, second = greens[0], greens[min(1, len(greens) - 1)]
    light = max(greens, key=sum)
    rim_light = lighten(light, 0.35)
    rim_soft = lighten(light, 0.18)
    lip = shade(second, 0.78)

    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    px = out.load()
    top_cy = CY - lift

    def on_top(x, y):
        return 0 <= x < CELL and 0 <= y < CELL and inside(x, y, top_cy, INSET)

    # LE DESSUS : le gazon du pre, pris a la meme place, un rien eclaire.
    for y in range(CELL):
        for x in range(CELL):
            if not on_top(x, y):
                continue
            src = grass.getpixel((x, min(CELL - 1, y + lift)))
            # Les traits sombres de la case source sont des BORDS de pre :
            # repetes sur chaque motte, ils faisaient un motif. On les rend au
            # vert du pre.
            if src[3] == 0 or src[:3] not in greens:
                src = second + (255,)
            px[x, y] = shade(src, bright) + (255,)

    # LE BORD : eclaire sur les deux aretes du haut (la lumiere vient d'en
    # haut a gauche, comme le soleil du ciel), une levre sombre sur celles du
    # bas, la ou le gazon deborde sur la terre.
    for y in range(CELL):
        for x in range(CELL):
            if not on_top(x, y):
                continue
            up = not on_top(x, y - 1)
            down = not on_top(x, y + 1)
            if up:
                px[x, y] = (rim_light if x <= CX else rim_soft) + (255,)
            elif down and lift > 0:
                px[x, y] = lip + (255,)

    # LA TRANCHE : ce que la motte a sous elle, sur `lift` rangees.
    for y in range(CELL):
        for x in range(CELL):
            if on_top(x, y):
                continue
            under = any(on_top(x, y - k) for k in range(1, lift + 1))
            if not under:
                continue
            soil = SOIL_W if x <= CX else SOIL_E
            # Quelques cailloux, toujours aux memes places : du bruit fixe, pas
            # un tirage — la motte est la meme d'une ile a l'autre.
            if (x * 7 + y * 13) % 11 == 0:
                soil = SOIL_SPECK
            px[x, y] = soil + (255,)

    # LE TRAIT : une rangee sombre sous la tranche, qui pose la motte au sol.
    if lift > 0:
        for y in range(CELL - 1, -1, -1):
            for x in range(CELL):
                if px[x, y][3] == 0 and y > 0 and px[x, y - 1][3] != 0 \
                        and not on_top(x, y - 1):
                    px[x, y] = OUTLINE + (255,)
    return out


# LE POTAGER : terre retournee, sillons le long d'une diagonale de la case.
GARDEN_SOIL = (0x7c, 0x55, 0x36)
GARDEN_FURROW = (0x5c, 0x3c, 0x25)
GARDEN_CREST = (0x96, 0x6c, 0x47)
GARDEN_RIM = (0xb4, 0x8c, 0x5f)
GARDEN_SIDE_W = (0x5e, 0x40, 0x29)
GARDEN_SIDE_E = (0x49, 0x31, 0x20)


def paint_garden(lift: int) -> Image.Image:
    """La motte en terre : dessus en sillons, tranche plus sombre que le
    dessus pour que le bord se lise sur de la terre."""
    out = paint(Image.new("RGBA", (CELL, CELL), (0x9B, 0xB9, 0x4E, 255)), lift, 1.0)
    px = out.load()
    top_cy = CY - lift

    def on_top(x, y):
        return 0 <= x < CELL and 0 <= y < CELL and inside(x, y, top_cy, INSET)

    for y in range(CELL):
        for x in range(CELL):
            if px[x, y][3] == 0:
                continue
            if on_top(x, y):
                if not on_top(x, y - 1):
                    c = GARDEN_RIM
                else:
                    # Les sillons suivent l'axe x+2y de l'iso : une rangee
                    # sur quatre creuse, celle d'avant en crete.
                    k = (x + 2 * y) % 8
                    c = GARDEN_FURROW if k in (0, 1) else GARDEN_CREST if k == 2 else GARDEN_SOIL
                px[x, y] = c + (255,)
            elif px[x, y][:3] in (SOIL_W, SOIL_SPECK) :
                px[x, y] = GARDEN_SIDE_W + (255,)
            elif px[x, y][:3] == SOIL_E:
                px[x, y] = GARDEN_SIDE_E + (255,)
    return out


# LA RAMPE : la hauteur d'un palier en pixels (`BurrowMap.TIER_LIFT`), et
# l'ombre par la direction que la pente regarde — les chiffres de slopes.gd,
# adoucis : la motte est deja plus sombre que l'herbe sur sa tranche.
TIER_LIFT = 6
SLOPE_SHADE = 0.9
SLOPE_FACING = 0.05
SLOPE_SIDE = 0.02
DIAMOND_W = 44.0
DIAMOND_H = 24.0


def corners(form: int):
    return ((form >> 3) & 1, (form >> 2) & 1, (form >> 1) & 1, form & 1)


def ramp(src: Image.Image, form: int) -> Image.Image:
    """La motte posee sur une rampe : chaque pixel monte de la hauteur
    BILINEAIRE de son point du losange. Meme parcours inverse que
    `Slopes._warp_to_ramp`, sans les facettes."""
    n, e, s_, w = (c * TIER_LIFT for c in corners(form))
    top = max(n, e, s_, w)
    sp = src.load()
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    op = out.load()
    c = CELL / 2.0

    def uv(x, y):
        sx = x + 0.5 - c
        sy = y + 0.5 - c
        return sx / DIAMOND_W + sy / DIAMOND_H + 0.5, sy / DIAMOND_H - sx / DIAMOND_W + 0.5

    # La diagonale dont les bouts s'accordent — la regle de `Slopes`.
    cut_tb = n == s_ or e != w

    def height(u, v):
        # La tranche d'une motte prend la hauteur du bord au-dessus d'elle.
        u = min(1.0, max(0.0, u))
        v = min(1.0, max(0.0, v))
        if cut_tb:
            if u >= v:
                return n + (e - n) * u + (s_ - e) * v
            return n + (s_ - w) * u + (w - n) * v
        if u + v <= 1.0:
            return n + (e - n) * u + (w - n) * v
        return s_ + (s_ - w) * (u - 1.0) + (s_ - e) * (v - 1.0)

    for Y in range(CELL):
        for X in range(CELL):
            best, err, bu, bv = -1, 9.0, 0.0, 0.0
            for ys in range(Y, min(Y + top + 2, CELL)):
                u, v = uv(X, ys)
                e_ = abs(ys - height(u, v) - Y)
                if e_ < err:
                    best, err, bu, bv = ys, e_, u, v
            if best < 0 or err > 0.75:
                continue
            px = sp[X, best]
            if px[3] == 0:
                continue
            # L'OMBRE : le gradient de la hauteur, en direction unitaire.
            u = min(1.0, max(0.0, bu))
            v = min(1.0, max(0.0, bv))
            gu = (e - n) * (1 - v) + (s_ - w) * v
            gv = (w - n) * (1 - u) + (s_ - e) * u
            g = (gu * gu + gv * gv) ** 0.5
            k = 1.0
            if g > 0:
                nx, ny = -gu / g, -gv / g
                k = SLOPE_SHADE - SLOPE_FACING * (nx + ny) + SLOPE_SIDE * (nx - ny)
            op[X, Y] = shade(px, k) + (px[3],)
    return out


FORMS = 16


def main() -> None:
    gx, gy = GRASS_CELL
    rows = []
    for path in GRASS_SHEETS:
        sheet = Image.open(path).convert("RGBA")
        grass = sheet.crop((gx * CELL, gy * CELL, (gx + 1) * CELL, (gy + 1) * CELL))
        rows.append([paint(grass, RAISED, 1.06), paint(grass, PRESSED, 1.14)])
    rows.append([paint_garden(RAISED), paint_garden(PRESSED)])

    out = Image.new("RGBA", (CELL * 2 * FORMS, CELL * len(rows)), (0, 0, 0, 0))
    for row, looks in enumerate(rows):
        for form in range(FORMS):
            for look, flat in enumerate(looks):
                tile = flat if form == 0 else ramp(flat, form)
                out.paste(tile, ((form * 2 + look) * CELL, row * CELL))

    for dst in (OUT_MASTER, OUT_GAME):
        dst.parent.mkdir(parents=True, exist_ok=True)
        out.save(dst)
        print("wrote", dst.relative_to(ROOT))


if __name__ == "__main__":
    main()
