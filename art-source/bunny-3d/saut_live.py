"""Poses du saut : le lapin entier, courbe par une cage, recale en voxels.

Colle dans saut-edit.blend (texte `saut_live.py`, lance a l'ouverture) :
un minuteur regarde si une cage a bouge et refait l'apercu de sa pose.
jump.py l'importe aussi pour fabriquer les poses du lapin.

Chaque pose de saut-edit.blend est un empty `saut <n>` avec :
  - `<n> · lapin` : le lapin entier (corps, tete, oreilles, pattes) en nuage
    de points, trois par voxel sur chaque axe, deforme par le lattice ;
  - `<n> · cage` : le lattice, a courber en mode edition ;
  - `apercu saut <n>` : les points deformes, recales sur la grille.
Le corps est recale en voxels, les oreilles en demi-voxels (leur liseré).
Les yeux, le nez et la bouche ne sont pas dans le bloc : la pose donne
seulement ou va la tete (reperes au cou), pour y poser les plaques.
"""
import json
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

PX, NX, NY = 0.1, 9, 10
FACES = {
    (1, 0, 0): ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
    (-1, 0, 0): ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)),
    (0, 1, 0): ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
    (0, -1, 0): ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
    (0, 0, 1): ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
    (0, 0, -1): ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)),
}
# Points par voxel, sur chaque axe : trois laissaient des trous quand la
# cage etire (on voyait l'interieur, en rayures noires).
SAMPLES = (0.125, 0.375, 0.625, 0.875)
# Grilles : 0 = voxels du corps, 1 = demi-voxels des oreilles.
GRIDS = {
    0: Matrix.Translation((-NX / 2 * PX, -NY / 2 * PX, 0)) @ Matrix.Scale(PX, 4),
    1: Matrix.Translation((-NX / 2 * PX, -NY / 2 * PX, 0)) @ Matrix.Scale(PX / 2, 4),
}
# Reperes de la tete (metres du modele) : le milieu de la face (entre les
# yeux), puis un pas en x et en z. La tete (son origine, au cou) est posee
# d'apres eux, puis avancee jusqu'a la face recalee : sinon les yeux et la
# bouche finissaient dans le bloc.
NECK = Vector((0.0, -0.2, 0.5))
FACE = Vector((0.0, -0.4, 0.72))
MARKS = [FACE, FACE + Vector((0.1, 0, 0)), FACE + Vector((0, 0, 0.1))]
FACE_CELLS = (range(1, 8), range(0, 2), range(6, 9))  # (i, j, k) de la face avant


def role(name):
    return name.split(" · ")[-1].split(".")[0]


def key(c):
    return f"{c[0]},{c[1]},{c[2]}"


def unkey(s):
    return tuple(int(v) for v in s.split(","))


# --- Nuage de points (fait par saut_edit.py) ----------------------------------

def make_cloud(name, grids):
    """grids : {grille: {cellule: {direction: materiau}}} -> maillage de points.
    Chaque point porte sa grille et sa cellule d'origine ; les couleurs vont
    en JSON dans une propriete de l'objet. Les trois derniers points sont les
    reperes de la tete (grille -1)."""
    me = bpy.data.meshes.new(name)
    pts, grid, ci, cj, ck = [], [], [], [], []
    for g, cells in grids.items():
        to_m = GRIDS[g]
        for c in cells:
            for a in SAMPLES:
                for b in SAMPLES:
                    for e in SAMPLES:
                        pts.append(to_m @ Vector((c[0] + a, c[1] + b, c[2] + e)))
                        grid.append(g)
                        ci.append(c[0])
                        cj.append(c[1])
                        ck.append(c[2])
    for m in MARKS:
        pts.append(m)
        grid.append(-1)
        ci.append(0)
        cj.append(0)
        ck.append(0)
    me.from_pydata([tuple(p) for p in pts], [], [])
    for attr, vals in (("grid", grid), ("ci", ci), ("cj", cj), ("ck", ck)):
        a = me.attributes.new(attr, "INT", "POINT")
        a.data.foreach_set("value", vals)
    ob = bpy.data.objects.new(name, me)
    ob["colors"] = json.dumps({str(g): {key(c): {key(d): m for d, m in f.items()}
                                        for c, f in cells.items()}
                               for g, cells in grids.items()})
    return ob


# --- Recalage ------------------------------------------------------------------

def deformed(cloud):
    """Positions des points apres le lattice (repere du lapin, metres)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = cloud.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [v.co.copy() for v in me.vertices]
    ev.to_mesh_clear()
    src = cloud.data
    attrs = {n: [0] * len(src.vertices) for n in ("grid", "ci", "cj", "ck")}
    for n, vals in attrs.items():
        src.attributes[n].data.foreach_get("value", vals)
    return pts, attrs


def close(cells):
    """Bouche les trous : une case vide entouree sur 5 de ses 6 faces est remplie
    (avec la cellule d'origine d'un voisin)."""
    for _ in range(2):
        add = {}
        for c in cells:
            for d in FACES:
                e = (c[0] + d[0], c[1] + d[1], c[2] + d[2])
                if e in cells or e in add:
                    continue
                around = [(e[0] + f[0], e[1] + f[1], e[2] + f[2]) for f in FACES]
                if sum(n in cells for n in around) >= 5:
                    add[e] = cells[c]
        if not add:
            break
        cells.update(add)


def build_pose(cloud, name, mats):
    """Le bloc de la pose, et la tete (matrice, repere du lapin)."""
    pts, a = deformed(cloud)
    colors = {int(g): {unkey(c): {unkey(d): m for d, m in f.items()} for c, f in cells.items()}
              for g, cells in json.loads(cloud["colors"]).items()}
    placed = {0: {}, 1: {}}
    marks = []
    for n, p in enumerate(pts):
        g = a["grid"][n]
        if g < 0:
            marks.append(p)
            continue
        t = GRIDS[g].inverted() @ p
        cell = (math.floor(t.x), math.floor(t.y), math.floor(t.z))
        placed[g].setdefault(cell, (a["ci"][n], a["cj"][n], a["ck"][n]))
    for g in placed:
        close(placed[g])
    # Les oreilles gagnent sur le corps la ou elles se chevauchent.
    ear_cover = {(math.floor(c[0] / 2), math.floor(c[1] / 2), math.floor(c[2] / 2))
                 for c in placed[1]}
    placed[0] = {c: s for c, s in placed[0].items() if c not in ear_cover}

    order = [role(m.name) for m in mats]
    bm = bmesh.new()
    for g, cells in placed.items():
        verts = {}
        to_m = GRIDS[g]

        def vert(q, verts=verts, to_m=to_m):
            if q not in verts:
                verts[q] = bm.verts.new(to_m @ Vector(q))
            return verts[q]

        for c, s in cells.items():
            own = colors[g].get(s, {})
            vals = list(own.values())
            for d, corners in FACES.items():
                if (c[0] + d[0], c[1] + d[1], c[2] + d[2]) in cells:
                    continue
                m = own.get(d) or (max(set(vals), key=vals.count) if vals else "fur")
                f = bm.faces.new([vert((c[0] + x, c[1] + y, c[2] + z)) for x, y, z in corners])
                f.material_index = order.index(m) if m in order else 0
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)

    o, px, pz = marks
    x = (px - o).normalized()
    z = (pz - o)
    z = (z - x * z.dot(x)).normalized()
    y = z.cross(x)
    rot = Matrix((x, y, z)).transposed()
    # La face recalee : l'avant le plus en avant des cases venues de la face.
    fi, fj, fk = FACE_CELLS
    front = [c for c, s in placed[0].items() if s[0] in fi and s[1] in fj and s[2] in fk]
    if front:
        y_front = min((GRIDS[0] @ Vector(c)).y for c in front)  # le bas de la case en y = son avant
        o = o + Vector((0, min(0.0, y_front - o.y), 0))
    head = rot.to_4x4()
    head.translation = o + rot @ (NECK - FACE)
    return me, head


# --- Dans saut-edit.blend : l'apercu en direct --------------------------------

def poses():
    return [o for o in bpy.data.objects if o.get("saut_root")]


def part(root, kind):
    return next((o for o in root.children if o.get("saut_kind") == kind), None)


def refresh(root):
    prev, cloud = part(root, "preview"), part(root, "cloud")
    if prev is None or cloud is None:
        return
    old = prev.data
    me, _ = build_pose(cloud, f"apercu {root.name}", list(old.materials) or list(cloud.data.materials))
    prev.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


_last = {}


def signature(root):
    cage = part(root, "cage")
    if cage is None:
        return None
    pts = tuple(round(c, 4) for p in cage.data.points for c in p.co_deform)
    return pts + tuple(round(v, 4) for row in cage.matrix_world for v in row)


def tick():
    try:
        for root in poses():
            sig = signature(root)
            if sig is not None and _last.get(root.name) != sig:
                _last[root.name] = sig
                refresh(root)
    except Exception as e:
        print("saut_live:", e)
    return 0.3


def install():
    if bpy.app.background:
        return
    ns = bpy.app.driver_namespace
    old = ns.get("saut_live_tick")
    if old and bpy.app.timers.is_registered(old):
        bpy.app.timers.unregister(old)
    ns["saut_live_tick"] = tick
    bpy.app.timers.register(tick, first_interval=0.3, persistent=True)


if __name__ != "saut_live":  # colle dans le .blend (pas importe par jump.py)
    install()
