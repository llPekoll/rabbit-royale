"""hero-voxel.blend -> hero-voxel-v2.blend : oreilles cernees, pattes avant a part.

Blender 4.5 :
  Blender -b art-source/bunny-3d/hero-voxel.blend -P art-source/bunny-3d/hero_v2.py

Le maillage de hero-voxel a ete retouche a la main (joues `shade` a cote des
yeux) : on ne le regenere pas depuis build_bunny.py, on le relit voxel par
voxel (une face = un cote d'un cube de 0.1, sa matiere = sa couleur), puis :
- oreilles : refaites en demi-voxels comme dans la video (bord noir,
  liseré blanc, rose) ; joues repassees en blanc ;
- yeux, nez, bouche : des plaques a part, un poil devant la face ;
- tete (lignes 5+) a part, pivot au cou : oreilles et visage la suivent ;
- pattes avant et arriere : memes voxels, mais quatre objets a part
  (fermes derriere, le corps aussi), pivot a l'attache pour les rigger plus
  tard ; le bas des pattes avant en `ink`.
Chaque objet porte `rim_ink` : rim_ink.py y peint le contour.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PX = 0.1
BODY = "Hero • lapin voxel"

# Grille : i = x (0..8), j = profondeur (0 = devant), k = hauteur (0..11).
NX, NY, NZ = 9, 10, 12
EARS = range(9, 12)  # les oreilles d'origine, retirees du corps
# Oreilles refaites en demi-voxels, comme la video : 3 voxels de large (6
# demi), 2 de profondeur (4 demi : le dessus est carre), 4 de haut ; un
# voxel d'ecart entre elles, vide ; tete + oreilles = 7 de large.
HALF = PX / 2
EAR_W, EAR_D, EAR_H = 6, 4, 8  # en demi-voxels
EAR_J = 3  # profondeur (voxel) du devant des oreilles
EARS_AT = {"oreille R": 1, "oreille L": 5}  # colonne (voxel) du bord gauche
CHEEKS = ((1, 7), (7, 7))  # (i, k) : les joues `shade` a cote des yeux
# Yeux, nez, bouche : hors du modele, des plaques posees un poil devant la
# face (faciles a animer). La tete dessous redevient unie.
FACE_Y = (1 - NY / 2) * PX  # la face avant de la tete (j = 1)
LIFT, THIN = 0.005, 0.01  # ecart a la face, epaisseur des plaques
FACE_X0, FACE_Z0 = (1 - NX / 2) * PX, 6 * PX  # coin des demi-voxels du visage
# Yeux « ^ » (contents) en demi-voxels (a, c) depuis ce coin, symetriques sur 6.5.
EYES = {"oeil R": [(4, 3), (3, 2), (5, 2)], "oeil L": [(9, 3), (8, 2), (10, 2)]}
FEATURES = {  # nom -> (matiere, demi-voxels)
    **{n: ("ink", cells) for n, cells in EYES.items()},
    "nez": ("pink", [(6, 0), (7, 0), (6, 1), (7, 1)]),
    "bouche": ("tooth", [(6, -2), (7, -2), (6, -1), (7, -1)]),
}
# Ce que les plaques recouvrent redevient la couleur de la tete : (i, k) -> matiere.
UNDER_FEATURES = {(2, 7): "light", (6, 7): "light", (4, 6): "light", (4, 5): "fur"}
# Pompon : un voxel de plus vers l'arriere (+j), de la couleur de celui
# qui est devant lui. (Le crane epaissi de meme a ete essaye : moins bien.)
TAIL_J = 9
# Tete : les lignes 5 et plus du corps (bloc blanc + museau), un objet a part
# pour la tourner ; oreilles et traits du visage y sont accroches. Pivot au cou.
HEAD, HEAD_FROM = "tête", 5
NECK = Vector((0.0, (3 - NY / 2) * PX, HEAD_FROM * PX))
PAWS = {"patte avant R": (2, 3), "patte avant L": (5, 6)}  # colonnes, j = 0, k = 0..2
PAW_ROWS = range(0, 3)
# Pattes arriere : une colonne sur chaque flanc, j = 4..8, k = 0..1.
HIND = {"patte arriere R": 0, "patte arriere L": 8}
HIND_DEPTH, HIND_ROWS = range(4, 9), range(0, 2)

FACES = {
    (1, 0, 0): ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
    (-1, 0, 0): ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)),
    (0, 1, 0): ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
    (0, -1, 0): ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
    (0, 0, 1): ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
    (0, 0, -1): ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)),
}


def read_voxels(ob):
    """(i, j, k) -> {normale: matiere} pour chaque face du maillage."""
    me = ob.data
    out = {}
    for p in me.polygons:
        c = p.center - p.normal * (PX / 2)
        key = (math.floor(c.x / PX + NX / 2), math.floor(c.y / PX + NY / 2),
               math.floor(c.z / PX))
        n = tuple(round(v) for v in p.normal)
        out.setdefault(key, {})[n] = me.materials[p.material_index].name
    return out


def solid_cells(surface):
    """Voxels de surface + ce qu'ils enferment (remplissage depuis l'exterieur)."""
    outside, stack = set(), [(-1, -1, -1)]
    while stack:
        c = stack.pop()
        if c in outside or c in surface:
            continue
        if not all(-1 <= c[a] <= (NX, NY, NZ)[a] for a in range(3)):
            continue
        outside.add(c)
        for d in FACES:
            stack.append((c[0] + d[0], c[1] + d[1], c[2] + d[2]))
    return {(i, j, k) for i in range(NX) for j in range(NY) for k in range(NZ)
            if (i, j, k) not in outside}


def build(name, cells, color, mats, size=PX, origin=(-NX / 2 * PX, -NY / 2 * PX, 0.0)):
    """Un objet : les faces de `cells` qui ne touchent pas une autre de ses cellules.
    Cellule (a, b, c) = cube de cote `size` au coin origin + (a, b, c) * size."""
    order = [m.name for m in mats]
    bm = bmesh.new()
    verts = {}

    def vert(p):
        if p not in verts:
            verts[p] = bm.verts.new(tuple(o + v * size for o, v in zip(origin, p)))
        return verts[p]

    for (i, j, k) in cells:
        for d, corners in FACES.items():
            if (i + d[0], j + d[1], k + d[2]) in cells:
                continue
            f = bm.faces.new([vert((i + c[0], j + c[1], k + c[2])) for c in corners])
            f.material_index = order.index(color((i, j, k), d))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def plate(name, subs, mat, mats):
    """Une plaque fine devant la face : un carre par demi-voxel (a, c)."""
    bm = bmesh.new()
    y1 = FACE_Y - LIFT
    for a, c in subs:
        x0, z0 = FACE_X0 + a * HALF, FACE_Z0 + c * HALF
        geom = bmesh.ops.create_cube(bm, size=1.0)
        for v in geom["verts"]:
            v.co.x = x0 if v.co.x < 0 else x0 + HALF
            v.co.y = y1 - THIN if v.co.y < 0 else y1
            v.co.z = z0 if v.co.z < 0 else z0 + HALF
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    idx = [m.name for m in mats].index(mat)
    for p in me.polygons:
        p.material_index = idx
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    # Origine au centre de la plaque : on l'anime depuis son milieu.
    center = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    me.transform(Matrix.Translation(-center))
    ob.location = center
    return ob


def ear_color(cell, d):
    """Oreille en demi-voxels : bord noir, liseré blanc, rose au milieu (devant)."""
    a, b, c = cell
    if c == EAR_H - 1 or a in (0, EAR_W - 1):
        return "ink"
    if 1 <= c <= EAR_H - 3 and a in (2, EAR_W - 3) and (b == 0 and d != (0, 1, 0)):
        return "pink"
    return "light"


def model(src):
    """Les voxels du lapin, lus sur `src` : (cellules par partie, color(cell, d)).
    Parties : corps, tete, les quatre pattes. jump.py s'en sert aussi."""
    faces = read_voxels(src)
    solid = solid_cells(set(faces))

    alias = {}  # voxel ajoute -> voxel dont il prend la couleur
    for (i, j, k) in [c for c in solid if c[1] == TAIL_J]:
        alias[i, j + 1, k] = (i, j, k)
    solid = solid | set(alias)

    def color(cell, d):
        cell = alias.get(cell, cell)
        i, j, k = cell
        if (i, k) in CHEEKS:
            return "light"  # le visage reste blanc jusqu'au bord : le noir, c'est le contour
        if j == 1 and (i, k) in UNDER_FEATURES:
            return UNDER_FEATURES[i, k]
        if j == 0 and k == 0 and any(i in cols for cols in PAWS.values()):
            return "ink"  # le dessous des pattes avant
        known = faces.get(cell, {})
        if d in known:
            return known[d]
        if known:  # face nouvelle (derriere une patte) : la couleur du voxel
            return max(set(known.values()), key=list(known.values()).count)
        return "fur"

    paw_cells = {name: {(i, 0, k) for i in cols for k in PAW_ROWS}
                 for name, cols in PAWS.items()}
    for name, i in HIND.items():
        paw_cells[name] = {(i, j, k) for j in HIND_DEPTH for k in HIND_ROWS}
    body_cells = solid - set().union(*paw_cells.values())
    body_cells = {c for c in body_cells if c[2] not in EARS}
    head_cells = {c for c in body_cells if c[2] >= HEAD_FROM}
    body_cells -= head_cells
    return body_cells, head_cells, paw_cells, color


def main():
    src = bpy.data.objects[BODY]
    mats = list(src.data.materials)
    body_cells, head_cells, paw_cells, color = model(src)
    bpy.data.objects.remove(src)
    body = build(BODY, body_cells, color, mats)
    body["rim_ink"] = True
    body["rim_root"] = True  # rim_ink calcule chaque lapin dans le repere de ce corps
    for name, cells in paw_cells.items():
        paw = build(name, cells, color, mats)
        # Pivot en haut a l'arriere de la patte : la ou elle s'attache.
        if name in PAWS:
            # Avant : en haut a l'arriere de la patte, la ou elle s'attache.
            cols = PAWS[name]
            pivot = Vector((((cols[0] + cols[1] + 1) / 2 - NX / 2) * PX,
                            (1 - NY / 2) * PX, (PAW_ROWS[-1] + 1) * PX))
        else:
            # Arriere : en haut, cote corps, au milieu de la longueur (la hanche).
            i = HIND[name]
            pivot = Vector((((i + 1 if i == 0 else i) - NX / 2) * PX,
                            ((HIND_DEPTH[0] + HIND_DEPTH[-1] + 1) / 2 - NY / 2) * PX,
                            (HIND_ROWS[-1] + 1) * PX))
        paw.data.transform(Matrix.Translation(-pivot))
        paw.location = pivot
        paw.parent = body
        paw["rim_ink"] = True

    head = build(HEAD, head_cells, color, mats)
    head.data.transform(Matrix.Translation(-NECK))
    head.location = NECK
    head.parent = body
    head["rim_ink"] = True
    # Tourner la tete : rotation seulement (R), jamais deplacee ni etiree.
    head.lock_location = (True, True, True)
    head.lock_scale = (True, True, True)

    for name, (mat, subs) in FEATURES.items():
        feat = plate(name, subs, mat, mats)
        feat.location -= NECK
        feat.parent = head

    for name, col in EARS_AT.items():
        cells = {(a, b, c) for a in range(EAR_W) for b in range(EAR_D) for c in range(EAR_H)}
        origin = ((col - NX / 2) * PX, (EAR_J - NY / 2) * PX, EARS[0] * PX)
        ear = build(name, cells, ear_color, mats, size=HALF, origin=origin)
        # Pivot a la base, au milieu : l'oreille bascule depuis la tete.
        pivot = Vector((origin[0] + EAR_W * HALF / 2, origin[1] + EAR_D * HALF / 2, origin[2]))
        ear.data.transform(Matrix.Translation(-pivot))
        ear.location = pivot - NECK
        ear.parent = head
        ear["rim_ink"] = True
        ear["rim_paint"] = False  # deja dessinee : bord noir, liseré blanc, rose
        ear["voxel"] = HALF

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "hero-voxel-v2.blend"))
    bpy.context.scene.render.filepath = os.path.join(HERE, "hero-voxel-v2.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
