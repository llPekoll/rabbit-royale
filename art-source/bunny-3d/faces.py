"""Expressions de hero-voxel-v2 : yeux, bouche, sourcils a echanger.

Blender 4.5 :
  Blender -b art-source/bunny-3d/hero-voxel-v2.blend -P art-source/bunny-3d/faces.py

Les traits du visage sont hors du modele, des plaques fines un poil devant la
face : on les echange sans toucher aux voxels. Style mixte : les yeux neutres
sont des carres francs (la video, plan rapproche) ; le reste est lisse et net
(arcs de joie, bouches), plus defini que les voxels pour bien se lire.

Tout se pilote depuis l'empty `visage` (proprietes, cle-ables) :
  expression  numero dans EXPRESSIONS (cles en interpolation constante)
  regard_x/y  -1..1, les yeux glissent sur la face
  cligne      0..1, au-dessus de 0.5 les yeux se ferment (par-dessus l'expression)
Chaque forme est un objet ; un driver la met a l'echelle 1 quand l'expression
la demande, a 0.001 sinon (expressions simples : pas besoin d'Auto Run).

Rend aussi renders/faces/<expression>.png et renders/faces-sheet.png.
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

FACE_Y = -0.4             # face avant de la tete
Y0, THIN = -0.405, 0.01   # plaques : de Y0 vers l'avant, epaisseur THIN
EYE_X, EYE_Z = 0.15, 0.725
MOUTH_Z = 0.555
BROW_Z = 0.815
GAZE = (0.03, 0.02)       # course du regard (x, z) en metres
COLL = "visage"

# --- Formes (2D, x vers la droite de l'ecran, z vers le haut, en metres) -----


def rect(w, h, cx=0.0, cz=0.0):
    return [[(cx - w / 2, cz - h / 2), (cx + w / 2, cz - h / 2),
             (cx + w / 2, cz + h / 2), (cx - w / 2, cz + h / 2)]]


def arc(r, t, a0, a1, cx=0.0, cz=0.0, n=14):
    """Bande d'arc (rayon exterieur r, epaisseur t) de a0 a a1 degres : des quads."""
    out = []
    for i in range(n):
        u0 = math.radians(a0 + (a1 - a0) * i / n)
        u1 = math.radians(a0 + (a1 - a0) * (i + 1) / n)
        ri = r - t
        out.append([(cx + ri * math.cos(u0), cz + ri * math.sin(u0)),
                    (cx + r * math.cos(u0), cz + r * math.sin(u0)),
                    (cx + r * math.cos(u1), cz + r * math.sin(u1)),
                    (cx + ri * math.cos(u1), cz + ri * math.sin(u1))])
    return out


def ellipse(w, h, cx=0.0, cz=0.0, n=24):
    return [[(cx + w / 2 * math.cos(2 * math.pi * i / n), cz + h / 2 * math.sin(2 * math.pi * i / n))
             for i in range(n)]]


def half_disc(w, h, cx=0.0, cz=0.0, n=16):
    """Demi-disque plat en haut (bouche ouverte en « D » couche)."""
    pts = [(cx + w / 2 * math.cos(math.pi + math.pi * i / n), cz + h * math.sin(math.pi + math.pi * i / n))
           for i in range(n + 1)]
    return [pts]


def bar(w, t, angle):
    """Barre centree, tournee de `angle` degres."""
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    return [[(x * c - z * s, x * s + z * c) for x, z in rect(w, t)[0]]]


# Chaque forme : liste de (matiere, polygones convexes, devant ?). `devant` :
# un cheveu plus en avant (reflet sur l'oeil, langue dans la bouche).
EYE_SHAPES = {
    "carre": [("ink", rect(0.1, 0.1), False)],
    "ferme": [("ink", rect(0.1, 0.02, cz=-0.01), False)],
    "content": [("ink", arc(0.055, 0.02, 15, 165, cz=-0.03), False)],
    "grand": [("ink", rect(0.13, 0.13), False),
              ("light", rect(0.04, 0.04, cx=-0.03, cz=0.03), True)],
    "mi-clos": [("ink", rect(0.1, 0.055, cz=-0.022), False),
                ("ink", rect(0.12, 0.018, cz=0.012), False)],
    "x": [("ink", bar(0.12, 0.022, 45), False), ("ink", bar(0.12, 0.022, -45), False)],
    # Plisse : un trapeze qui tombe vers le nez (la moitie .L est en miroir).
    "plisse": [("ink", [[(-0.05, -0.04), (0.05, -0.04), (0.05, 0.005), (-0.05, 0.03)]], False)],
}
MOUTH_SHAPES = {
    "dents": [("tooth", rect(0.06, 0.07, cz=0.01), False)],
    "o": [("ink", ellipse(0.06, 0.075), False)],
    "sourire": [("ink", arc(0.05, 0.018, 200, 340, cz=0.03), False)],
    "ouvert": [("ink", half_disc(0.12, 0.08, cz=0.03), False),
               ("pink", half_disc(0.06, 0.035, cz=-0.012), True)],
    "moue": [("ink", rect(0.08, 0.018), False)],
    "malin": [("ink", arc(0.07, 0.018, 250, 320, cx=-0.01, cz=0.055), False)],
}
BROW = [("ink", rect(0.1, 0.02), False)]

# nom -> (oeil, bouche, sourcils (angle en degres, + = bout interieur leve)
# ou None). Oeil .L en miroir de .R.
EXPRESSIONS = {
    "neutre": ("carre", "dents", None),
    "ravi": ("content", "ouvert", None),
    "pensif": ("mi-clos", "moue", 14),
    "surpris": ("grand", "o", -6),
    "sur de lui": ("mi-clos", "malin", -8),
    "sonne": ("x", "o", None),
    "determine": ("plisse", "moue", -18),
    "content": ("content", "sourire", None),
}
NAMES = list(EXPRESSIONS)


# --- Construction ------------------------------------------------------------

def prism(bm, poly, y0, y1):
    """Un polygone convexe (x, z) extrude de y0 a y1."""
    back = [bm.verts.new((x, y0, z)) for x, z in poly]
    front = [bm.verts.new((x, y1, z)) for x, z in poly]
    bm.faces.new(front)  # normale -Y : vers la camera de face
    bm.faces.new(list(reversed(back)))
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([back[i], back[j], front[j], front[i]])


def shape_object(name, parts, mats, mirror=False):
    bm = bmesh.new()
    names = [m.name for m in mats]
    for mat, polys, ahead in parts:
        y0 = Y0 - (THIN if ahead else 0.0)
        for poly in polys:
            if mirror:
                poly = [(-x, z) for x, z in reversed(poly)]
            before = set(bm.faces)
            prism(bm, poly, y0, y0 - THIN)
            for f in set(bm.faces) - before:
                f.material_index = names.index(mat)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[COLL].objects.link(ob)
    return ob


def empty(name, loc, parent):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = "PLAIN_AXES"
    ob.empty_display_size = 0.04
    ob.location = loc
    ob.parent = parent
    bpy.data.collections[COLL].objects.link(ob)
    return ob


def drive(ob, path, index, expression, ctrl, props):
    d = ob.driver_add(path, index).driver
    d.type = "SCRIPTED"
    for var, prop in props.items():
        v = d.variables.new()
        v.name = var
        v.type = "SINGLE_PROP"
        v.targets[0].id_type = "OBJECT"
        v.targets[0].id = ctrl
        v.targets[0].data_path = f'["{prop}"]'
    d.expression = expression


def show_when(ob, ctrl, indices, blink=None):
    """Echelle 1 si `expression` est dans `indices` (et selon le clignement)."""
    terms = "+".join(f"(e=={i})" for i in indices) or "0"
    if blink == "hide":
        expr = f"max(0.001, min(1, ({terms})*(b<0.5)))"
    elif blink == "show":
        expr = f"max(0.001, min(1, ({terms})*(b<0.5) + (b>=0.5)))"
    else:
        expr = f"max(0.001, min(1, {terms}))"
    for i in range(3):
        drive(ob, "scale", i, expr, ctrl, {"e": "expression", "b": "cligne"})


def clear():
    coll = bpy.data.collections.get(COLL)
    if coll:
        for ob in list(coll.objects):
            bpy.data.objects.remove(ob)
    else:
        coll = bpy.data.collections.new(COLL)
        bpy.context.scene.collection.children.link(coll)
    # Les anciennes plaques de hero_v2 (yeux et bouche) : remplacees ici.
    for name in ("oeil R", "oeil L", "bouche"):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name])


def build():
    clear()
    body = bpy.data.objects["Hero • lapin voxel"]
    mats = list(body.data.materials)
    # Les traits suivent la tete (objet `tête`, pivot au cou) : positions
    # ci-dessous donnees dans le repere du corps, ramenees a celui de la tete.
    head = bpy.data.objects["tête"]
    hx, hy, hz = head.location
    ctrl = empty("visage", (0, FACE_Y - 0.12, 0.95), body)
    ctrl.empty_display_type = "CIRCLE"
    ctrl.empty_display_size = 0.06
    ctrl.rotation_euler = (math.radians(90), 0, 0)
    ctrl["expression"] = 0
    ctrl.id_properties_ui("expression").update(
        min=0, max=len(NAMES) - 1,
        description=" ".join(f"{i}={n}" for i, n in enumerate(NAMES)))
    for prop in ("regard_x", "regard_y"):
        ctrl[prop] = 0.0
        ctrl.id_properties_ui(prop).update(min=-1.0, max=1.0)
    ctrl["cligne"] = 0.0
    ctrl.id_properties_ui("cligne").update(min=0.0, max=1.0)

    for side, s in (("R", -1), ("L", 1)):
        # L'oeil : un empty qui porte les formes et suit le regard.
        eye = empty(f"oeil {side}", (s * EYE_X - hx, -hy, EYE_Z - hz), head)
        drive(eye, "location", 0, f"{s * EYE_X - hx} + x*{GAZE[0]}", ctrl, {"x": "regard_x"})
        drive(eye, "location", 2, f"{EYE_Z - hz} + z*{GAZE[1]}", ctrl, {"z": "regard_y"})
        for shape, parts in EYE_SHAPES.items():
            ob = shape_object(f"oeil {side} {shape}", parts, mats, mirror=side == "L")
            ob.parent = eye
            used = [i for i, n in enumerate(NAMES) if EXPRESSIONS[n][0] == shape]
            show_when(ob, ctrl, used, blink="show" if shape == "ferme" else "hide")
        brow = shape_object(f"sourcil {side}", BROW, mats)
        brow.location = (s * EYE_X - hx, -hy, BROW_Z - hz)
        brow.parent = head
        with_brows = [i for i, n in enumerate(NAMES) if EXPRESSIONS[n][2] is not None]
        show_when(brow, ctrl, with_brows)
        angle = "+".join(f"(e=={i})*{EXPRESSIONS[n][2]}" for i, n in enumerate(NAMES)
                         if EXPRESSIONS[n][2] is not None)
        # Bout interieur leve : .R tourne dans un sens, .L dans l'autre.
        drive(brow, "rotation_euler", 1, f"{s}*({angle})*0.0174533", ctrl, {"e": "expression"})

    mouth = empty("bouche", (-hx, -hy, MOUTH_Z - hz), head)
    for shape, parts in MOUTH_SHAPES.items():
        ob = shape_object(f"bouche {shape}", parts, mats)
        ob.parent = mouth
        used = [i for i, n in enumerate(NAMES) if EXPRESSIONS[n][1] == shape]
        show_when(ob, ctrl, used)
    return ctrl


def render_faces(ctrl):
    scene = bpy.context.scene
    here = os.path.dirname(os.path.abspath(bpy.data.filepath))
    out = os.path.join(here, "renders", "faces")
    os.makedirs(out, exist_ok=True)
    pivot = bpy.data.objects["cam_pivot"]
    cam = scene.camera
    old = (tuple(pivot.rotation_euler), cam.data.ortho_scale, pivot.location.z,
           scene.render.resolution_x, scene.render.resolution_y)
    pivot.rotation_euler = (0, 0, math.radians(-20))
    pivot.location.z = 0.85
    cam.data.ortho_scale = 0.95
    scene.render.resolution_x = scene.render.resolution_y = 360
    files = []
    for i, name in enumerate(NAMES):
        ctrl["expression"] = i
        scene.render.filepath = os.path.join(out, f"{i:02d}-{name.replace(' ', '-')}.png")
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
    ctrl["expression"] = 0
    pivot.rotation_euler = old[0]
    cam.data.ortho_scale, pivot.location.z = old[1], old[2]
    scene.render.resolution_x, scene.render.resolution_y = old[3], old[4]
    return files


if __name__ == "__main__":
    ctrl = build()
    bpy.context.view_layer.update()
    render_faces(ctrl)
    bpy.ops.wm.save_mainfile()
