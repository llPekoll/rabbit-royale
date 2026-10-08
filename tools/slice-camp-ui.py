"""Decoupe les maquettes « Camp de raid » (art-source/profile-ui-proposals-20261008)
en pieces pour godot/assets/ui/camp/.

  P = 02-camp-de-raid.png (profil en haut, historique en bas)
  S = 05-reglages-camp-de-raid.png (reglages, dessine ~1,16x plus grand que P)

Trois sortes de pieces :
  • 9-slice symetriques (sym9) : le coin haut-gauche d'un panneau, recopie en
    miroir aux trois autres coins ; bords et centre echantillonnes a cote.
  • bandes horizontales (h3) : chapeau gauche, une colonne etiree, chapeau
    droit — pour ce qui a une hauteur fixe (onglets, pilules, jauges).
  • images detourees (key) : le fond du panneau retire par distance de
    couleur, les cernes sombres gardes.

    python3 tools/slice-camp-ui.py
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-source", "profile-ui-proposals-20261008")
OUT = os.path.join(ROOT, "godot", "assets", "ui", "camp")
os.makedirs(OUT, exist_ok=True)


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGBA")).astype(np.float32)


P = load("02-camp-de-raid.png")
S = load("05-reglages-camp-de-raid.png")


def save(name, a):
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + ".png"))


def crop(img, x0, y0, x1, y1):
    return img[y0:y1, x0:x1].copy()


def dist(a, color):
    return np.sqrt(((a[..., :3] - np.asarray(color, np.float32)) ** 2).sum(-1))


def border_bg(a):
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])[:, :3]
    return np.median(edge, axis=0)


def key(a, bg=None, tol=26.0, soft=18.0):
    """Le fond (median du pourtour, ou `bg`) devient transparent, en douceur."""
    a = a.copy()
    bg = border_bg(a) if bg is None else np.asarray(bg, np.float32)
    alpha = np.clip((dist(a, bg) - tol) / soft, 0.0, 1.0)
    a[..., 3] = np.minimum(a[..., 3], alpha * 255.0)
    return a


def fill(a, x0, y0, x1, y1, color):
    a[y0:y1, x0:x1, :3] = color
    a[y0:y1, x0:x1, 3] = 255


def mean_color(img, x, y, r=2):
    return img[y - r:y + r + 1, x - r:x + r + 1, :3].reshape(-1, 3).mean(0)


def round_outside(corner, c):
    """Ce qui est hors du coin arrondi (la couleur du pixel 0,0, dans le
    triangle exterieur) devient transparent : le panneau se pose sur
    n'importe quel fond."""
    out = corner.copy()
    bg = corner[0, 0, :3]
    yy, xx = np.mgrid[0:c, 0:c]
    outer = (xx + yy) < c * 0.75
    same = dist(corner, bg) < 22
    out[..., 3] = np.where(outer & same, 0, out[..., 3])
    return out


def sym9(img, x, y, c, e=4, sample=None, center=None, outside=True, sx=None, sy=None):
    """Un panneau symetrique : coin haut-gauche (c x c) a (x, y), un bord de
    `e` pixels pris juste apres le coin (ou a `sample` px du coin ; `sx` pour
    le bord du haut, `sy` pour celui de gauche, la ou aucun texte ne passe),
    et le centre plein. Rend une texture (2c+e) carree, coupes = c."""
    k = c + (sample if sample is not None else 2)
    kx = c + sx if sx is not None else k
    ky = c + sy if sy is not None else k
    tl = crop(img, x, y, x + c, y + c)
    if outside:
        tl = round_outside(tl, c)
    top = crop(img, x + kx, y, x + kx + e, y + c)
    left = crop(img, x, y + ky, x + c, y + ky + e)
    mid = np.zeros((e, e, 4), np.float32)
    mid[..., :3] = center if center is not None else mean_color(img, x + k, y + k)
    mid[..., 3] = 255
    row0 = np.concatenate([tl, top, tl[:, ::-1]], 1)
    row1 = np.concatenate([left, mid, left[:, ::-1]], 1)
    return np.concatenate([row0, row1, row0[::-1]], 0)


def h3(img, x0, y0, x1, y1, left, right, mid_x, e=4, mirror=False):
    """Une bande : chapeau gauche, `e` colonnes prises a `mid_x`, chapeau
    droit (ou le gauche en miroir)."""
    lc = crop(img, x0, y0, x0 + left, y1)
    rc = lc[:, ::-1] if mirror else crop(img, x1 - right, y0, x1, y1)
    mid = crop(img, mid_x, y0, mid_x + e, y1)
    return np.concatenate([lc, mid, rc], 1)


def inpaint(a, mask, steps=600, seed=True):
    """Bouche `mask` par diffusion depuis ses bords (Laplace) : flou, mais
    sous un sprite redessine par-dessus ca ne se voit qu'aux contours."""
    rgb = a[..., :3]
    ys, xs = np.nonzero(mask)
    ring = np.zeros_like(mask)
    ring[max(ys.min() - 2, 0):ys.max() + 3, max(xs.min() - 2, 0):xs.max() + 3] = True
    ring &= ~mask
    if seed:
        rgb[mask] = rgb[ring].mean(0)
    for _ in range(steps):
        avg = (np.roll(rgb, 1, 0) + np.roll(rgb, -1, 0) + np.roll(rgb, 1, 1) + np.roll(rgb, -1, 1)) / 4.0
        rgb[mask] = avg[mask]
    a[..., :3] = rgb


def grow(mask, n=1):
    out = mask.copy()
    for _ in range(n):
        m = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m |= np.roll(np.roll(out, dy, 0), dx, 1)
        out = m
    return out


def pill(a, inset=0.5):
    """Alpha d'une pilule (demi-cercles aux bouts) : la piste se pose sans
    les coins du fond d'origine."""
    h, w = a.shape[:2]
    r = h / 2.0 - inset
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    cx = np.clip(xx, r + inset, w - r - inset)
    d = np.sqrt((xx - cx) ** 2 + (yy - h / 2.0) ** 2)
    a[..., 3] = np.clip(r - d + 0.5, 0, 1) * 255.0
    return a


def erase_rows(a, x0, x1, y0, y1):
    """Efface un objet en interpolant chaque ligne entre ses deux bords :
    assez pour ce qu'un sprite redessine par-dessus cachera."""
    for y in range(y0, y1):
        l = a[y, x0 - 3:x0, :3].mean(0)
        r = a[y, x1:x1 + 3, :3].mean(0)
        t = np.linspace(0, 1, x1 - x0)[:, None]
        a[y, x0:x1, :3] = l * (1 - t) + r * t


# ── Le cadre de cuivre et son fond de nuit ───────────────────────────────────

FRAME_C = 64
FRAME_INNER = np.array([3, 24, 35], np.float32)


def leafy(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bright = np.maximum(r, g) > 85
    return bright & ((g - b > 28) | (r - b > 55))


def edge_mask(a, line, axis):
    """Une tranche de bord : rien dehors, le filet garde, le fond dedans."""
    a = a.copy()
    n = a.shape[axis]
    for i in range(n):
        sl = (slice(i, i + 1), slice(None)) if axis == 0 else (slice(None), slice(i, i + 1))
        if i < line:
            a[sl + (slice(3, 4),)] = 0
        elif i == line:
            # Le pixel de bord melange au fond de nuit : un cerne sombre.
            a[sl + (slice(0, 3),)] = [70, 40, 22]
        elif i >= line + 5:
            a[sl + (slice(0, 3),)] = FRAME_INNER
            a[sl + (slice(3, 4),)] = 255
    return a


# Le filet de cuivre de P : bord exterieur a x 47 / 1292, y 105 / 644.
# Chaque boite de coin est choisie pour que ce bord tombe a FRAME_LINE
# pixels du bord de la boite, lu « comme un haut-gauche » : les quatre coins
# et les bords se raccordent.
FRAME_LINE = 12


def corner(a):
    c, l = FRAME_C, FRAME_LINE
    a = a.copy()
    yy, xx = np.mgrid[0:c, 0:c]
    outside = (xx < l) | (yy < l)
    inside = (xx >= l + 5) & (yy >= l + 5)
    a[..., 3] = np.where(outside & ~grow(leafy(a), 1), 0, 255)
    a[inside, :3] = FRAME_INNER
    a[inside, 3] = 255
    return a


def build_frame():
    c, e = FRAME_C, 4
    tl = corner(crop(P, 35, 93, 35 + c, 93 + c))
    tr = corner(crop(P, 1241, 93, 1241 + c, 93 + c)[:, ::-1])
    br = corner(crop(P, 1241, 595, 1241 + c, 595 + c)[::-1, ::-1])
    top = edge_mask(crop(P, 640, 93, 640 + e, 93 + c), FRAME_LINE, axis=0)
    left = edge_mask(crop(P, 35, 380, 35 + c, 380 + e), FRAME_LINE, axis=1)
    mid = np.zeros((e, e, 4), np.float32)
    mid[..., :3] = FRAME_INNER
    mid[..., 3] = 255
    row0 = np.concatenate([tl, top, tr[:, ::-1]], 1)
    row1 = np.concatenate([left, mid, left[:, ::-1]], 1)
    # Le bas-gauche est le bas-droit en miroir : celui de la maquette est
    # cache sous la fougere de la vignette.
    row2 = np.concatenate([br[::-1, :], top[::-1], br[::-1, ::-1]], 1)
    return np.concatenate([row0, row1, row2], 0)


def main():
    save("frame", build_frame())

    # Le fond de nuit derriere le cadre : la maquette des reglages entiere
    # (son interieur est cache par le cadre plein).
    Image.fromarray(S[..., :3].astype(np.uint8)).save(os.path.join(OUT, "backdrop.jpg"), quality=88)

    # ── Panneaux (P) ──
    save("panel-content", sym9(P, 294, 123, 16, sample=6, sx=400, center=[11, 50, 63]))
    save("panel-section", sym9(P, 756, 187, 16, sample=6, sx=330, center=[10, 42, 53]))
    # La plaque du nom a son portrait colle au bord : son style est celui
    # de l'onglet eteint, pris la ou rien ne passe.
    save("panel-plate", sym9(P, 65, 299, 14, sx=120, sy=4))
    save("panel-face", sym9(P, 68, 128, 8, sample=2))
    save("panel-name", sym9(P, 318, 486, 14, sx=268, sy=4, center=[12, 56, 68]))
    save("panel-inset", sym9(P, 336, 512, 10, sx=280, sy=4, center=[6, 29, 37]))
    save("panel-row", sym9(P, 745, 800, 12, sx=240, sy=6, center=[15, 66, 80]))
    save("panel-list", sym9(P, 316, 800, 12, sx=320, sy=6))
    save("cell-off", sym9(P, 872, 244, 10, sample=4))
    save("cell-on", sym9(P, 777, 243, 12, sample=4))
    save("button-outline", sym9(P, 772, 517, 12, sample=10))

    # Onglets : hauteur fixe, une bande.
    save("tab-on", h3(P, 64, 225, 287, 292, 14, 31, 76))
    save("tab-off", h3(P, 64, 297, 279, 364, 14, 14, 76, mirror=True))
    save("pill", h3(P, 444, 562, 578, 590, 14, 14, 452, mirror=True))

    # ── Illustrations (P) ──
    # Toute la hauteur du panneau : le cadre du nom se repose par-dessus le
    # sien, au meme endroit.
    portrait = crop(P, 305, 186, 744, 620)
    # Le lapin de la maquette part : le vrai (AvatarFace) se pose a sa place.
    box = np.zeros(portrait.shape[:2], bool)
    box[268 - 186:432 - 186, 448 - 305:598 - 305] = True
    # Ligne a ligne : le ciel, la mer et l'herbe gardent chacun leur bande.
    erase_rows(portrait, 448 - 305, 598 - 305, 268 - 186, 432 - 186)
    inpaint(portrait, box, steps=40, seed=False)
    save("portrait-scene", portrait)
    save("vignette-side", key(crop(P, 52, 470, 289, 632), bg=FRAME_INNER, tol=14, soft=22))
    save("vignette-harvest", key(crop(P, 305, 935, 718, 1118), bg=[10, 42, 53], tol=14, soft=22))
    save("vignette-chest", key(crop(P, 925, 985, 1068, 1062), bg=[10, 42, 53]))

    # ── Petites pieces (P) ──
    save("close", key(crop(P, 1232, 120, 1278, 164), bg=[8, 34, 45], tol=30))
    save("pencil", crop(P, 662, 511, 717, 556))
    save("check", key(crop(S, 1014, 510, 1063, 557), bg=[12, 40, 50], tol=34))
    icons = {
        "icon-leaf": (P, 316, 133, 360, 170),
        "icon-scroll": (P, 316, 688, 358, 732),
        "icon-rabbit": (P, 773, 200, 803, 230),
        "icon-shield": (P, 773, 449, 808, 484),
        "icon-google": (P, 793, 527, 830, 564),
        "icon-mail": (P, 953, 527, 993, 563),
        "icon-wallet": (P, 1116, 525, 1153, 565),
        "icon-exit": (P, 903, 597, 932, 625),
        "icon-carrot": (P, 320, 757, 360, 798),
        "icon-swords": (P, 743, 759, 781, 795),
        "icon-swords-small": (P, 756, 806, 791, 843),
        "icon-carrot-small": (P, 1090, 809, 1120, 843),
        "icon-shop": (P, 743, 947, 782, 988),
        "icon-scroll-tab": (P, 80, 305, 128, 353),
        "icon-gear-tab": (P, 78, 378, 124, 427),
        "icon-gear": (S, 402, 97, 462, 157),
        "icon-note": (S, 410, 177, 460, 223),
        "icon-note-small": (S, 932, 222, 970, 262),
        "icon-speaker": (S, 1220, 222, 1265, 264),
        "icon-speaker-volume": (S, 866, 366, 910, 408),
        "icon-picture": (S, 410, 467, 458, 510),
        "icon-rabbit-solo": (S, 1106, 466, 1156, 522),
        "icon-check-small": (S, 774, 836, 806, 865),
    }
    for name, (img, x0, y0, x1, y1) in icons.items():
        save(name, key(crop(img, x0, y0, x1, y1)))

    # ── Reglages (S) ──
    save("scene-music", crop(S, 393, 230, 846, 445))
    save("preview-smooth", crop(S, 412, 523, 722, 724))
    pretty = crop(S, 750, 525, 1053, 724)
    medal = np.zeros(pretty.shape[:2], bool)
    medal[0:36, 1010 - 750:] = True
    inpaint(pretty, medal)
    save("preview-pretty", pretty)
    save("scene-solo", crop(S, 1104, 516, 1543, 711))
    save("card-off", sym9(S, 407, 519, 16, sx=120, sy=225, center=[5, 30, 42]))
    save("card-on", sym9(S, 744, 517, 18, sx=120, sy=225, center=[5, 30, 42]))
    save("panel-console", sym9(S, 851, 208, 16, sample=8))

    # Interrupteurs : la piste avec son bouton, le mot efface.
    on = crop(S, 946, 265, 1122, 330)
    off = crop(S, 1355, 720, 1537, 784)
    erase_rows(on, 26, 100, 12, 54)
    erase_rows(off, 86, 160, 12, 52)
    pill(on)
    pill(off)
    save("switch-on", on)
    save("switch-off", off)
    # Glissiere : gouttiere sombre, remplissage orange, bouton.
    save("slider-track", h3(S, 1380, 371, 1440, 404, 0, 22, 1400, mirror=False)[:, :])
    save("slider-fill", h3(S, 1024, 371, 1100, 404, 22, 0, 1100))
    save("slider-knob", key(crop(S, 1338, 358, 1396, 416), tol=30))
    # Jauge de l'historique.
    save("bar-track", h3(P, 337, 832, 634, 852, 10, 10, 500, mirror=True))
    save("bar-fill", h3(P, 337, 832, 416, 852, 10, 10, 360, mirror=True))
    print("ok", OUT)


if __name__ == "__main__":
    main()
