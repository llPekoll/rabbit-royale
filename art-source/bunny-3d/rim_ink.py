"""Le contour DANS le lapin : les voxels au bord de la silhouette passent en noir.

Blender 4.5 :
  Blender -b art-source/bunny-3d/hero-voxel-v2.blend -P art-source/bunny-3d/rim_ink.py

Pas un trait autour du modele : pour le point de vue, un voxel dont un
voisin a l'image (gauche, droite, haut, bas, d'un voxel) ne voit que du vide
le long du regard est un voxel du bord ; toutes ses faces prennent `ink`.
Le contour est fait de vrais voxels, cale sur la grille, et suit le regard :
- dans Blender, il suit la vue 3D en direct (la camera si on regarde a
  travers elle, sinon la vue libre) : un minuteur regarde 10 fois par
  seconde si la vue ou le lapin a bouge ;
- au rendu, il prend la camera de la scene.

Objets concernes : ceux qui portent la propriete `rim_ink` (hero_v2.py).
Le script s'installe dans le .blend (texte `rim_ink.py`, lance a l'ouverture
si Preferences > Save & Load > Auto Run Python Scripts est coche ; sinon
Text Editor > rim_ink.py > Run Script, une fois par session).
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

PX = 0.1
INK = "ink"
# Jamais noircies : l'interieur rose des oreilles (2 voxels de large, elles
# touchent le vide des deux cotes et passeraient toutes en noir).
KEEP = {"pink"}


def cell_of(p):
    return (math.floor(p.x / PX + 1e-6), math.floor(p.y / PX + 1e-6),
            math.floor(p.z / PX + 1e-6))


def role(name):
    """« Degen · ink.001 » -> « ink » : le role d'un materiau, quel que soit le lapin."""
    return name.split(" · ")[-1].split(".")[0]


def targets():
    return [o for o in bpy.data.objects if o.get("rim_ink") and o.type == "MESH"]


def rabbits():
    """{corps racine: [ses objets rim_ink]}. Chaque lapin est calcule dans le
    repere de son corps (`rim_root`) : il peut bouger, tourner, etre mis a
    l'echelle, et deux lapins ne se cachent pas leurs bords."""
    groups = {}
    for o in targets():
        root = o
        while root and not root.get("rim_root"):
            root = root.parent
        groups.setdefault(root, []).append(o)
    return groups


def face_cells(ob, to_local):
    """Pour chaque face, le voxel qu'elle borde, dans le repere du corps."""
    m = to_local @ ob.matrix_world
    rot = m.to_3x3()
    half = ob.get("voxel", PX) / 2
    # Le maillage deforme (la cage de la tete) : memes faces, dans le meme ordre.
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    out = []
    for p in me.polygons:
        n = (rot @ p.normal).normalized()
        out.append(cell_of(m @ p.center - n * half))
    ev.to_mesh_clear()
    return out


def rim_cells(cells, view):
    """Voxels du bord de la silhouette. `view` = (matrice de l'oeil, perspective ?)."""
    m, persp = view
    rot = m.to_3x3()
    eye = m.translation
    back = (rot @ Vector((0, 0, 1))).normalized()  # vers l'oeil
    right = rot.col[0].normalized() * PX
    up = rot.col[1].normalized() * PX
    steps = [t * PX * 0.25 for t in range(-48, 49)]
    rim = set()
    for c in cells:
        center = Vector(((c[0] + 0.5) * PX, (c[1] + 0.5) * PX, (c[2] + 0.5) * PX))
        d = (eye - center).normalized() if persp else back
        for o in (right, -right, up, -up):
            p = center + o
            # Le rayon qui passe par ce voisin touche-t-il le lapin ? (Compter
            # aussi un voisin loin derriere, a 1.5 ou 4 voxels, noircissait
            # le dos en bandes et doublait les flancs : essaye, retire.)
            if not any(cell_of(p + d * t) in cells for t in steps):
                rim.add(c)
                break
    return rim


def paint(view):
    for root, obs in rabbits().items():
        if any(o.mode == "EDIT" for o in obs):
            continue
        # Sans racine (ancien fichier) : le monde sert de repere.
        to_local = root.matrix_world.inverted() if root else Matrix()
        m, persp = view
        paint_rabbit(obs, (to_local @ m, persp), to_local)


def paint_rabbit(obs, view, to_local):
    per_ob = {o.name: face_cells(o, to_local) for o in obs}
    cells = {c for fc in per_ob.values() for c in fc}
    rim = rim_cells(cells, view)
    # `rim_paint` faux : l'objet cache ce qui est derriere mais garde ses
    # couleurs (les oreilles en demi-voxels ont leur contour dessine).
    for o in [o for o in obs if o.get("rim_paint", True) and len(o.data.polygons)]:
        me = o.data
        names = [role(m.name) for m in me.materials]
        ink = names.index(INK)
        attr = me.attributes.get("base_mat")
        if attr is None:
            attr = me.attributes.new("base_mat", "INT", "FACE")
            for p, a in zip(me.polygons, attr.data):
                a.value = p.material_index
        for p, a, c in zip(me.polygons, attr.data, per_ob[o.name]):
            keep = names[a.value] in KEEP
            idx = ink if c in rim and not keep else a.value
            if p.material_index != idx:
                p.material_index = idx
        me.update()


def camera_view(scene):
    cam = scene.camera
    return (cam.matrix_world.copy(), cam.data.type != "ORTHO") if cam else None


def viewport_view():
    """La vue 3D la plus grande : la camera si on regarde a travers, sinon l'oeil libre."""
    best = None
    wm = bpy.context.window_manager
    for win in wm.windows if wm else []:
        for area in win.screen.areas:
            if area.type != "VIEW_3D":
                continue
            if best is None or area.width * area.height > best.width * best.height:
                best = area
    if best is None:
        return None
    r3d = best.spaces.active.region_3d
    if r3d.view_perspective == "CAMERA":
        return camera_view(bpy.context.scene)
    return (r3d.view_matrix.inverted(), r3d.is_perspective)


_last = {"sig": None}


def signature(view):
    m, persp = view
    obs = tuple(tuple(round(v, 4) for row in o.matrix_world for v in row) for o in targets())
    return (tuple(round(v, 4) for row in m for v in row), persp, obs)


def tick():
    """Minuteur : repeint si la vue ou le lapin a bouge."""
    try:
        view = viewport_view()
        if view:
            sig = signature(view)
            if sig != _last["sig"]:
                _last["sig"] = sig
                paint(view)
    except Exception as e:  # un minuteur qui leve s'arrete : on le garde en vie
        print("rim_ink:", e)
    return 0.1


def on_render(scene, *_):
    view = camera_view(scene)
    if view:
        paint(view)
    _last["sig"] = None  # apres le rendu, la vue 3D reprend la main


def install():
    for h in (bpy.app.handlers.render_pre, bpy.app.handlers.frame_change_pre):
        for f in list(h):
            if getattr(f, "__name__", "") in ("on_render", "paint"):
                h.remove(f)
    bpy.app.handlers.render_pre.append(on_render)
    if not bpy.app.background:
        # Relancer le script ne doit pas empiler les minuteurs : l'ancien est
        # garde dans driver_namespace, qui survit aux relances.
        ns = bpy.app.driver_namespace
        old = ns.get("rim_ink_tick")
        if old and bpy.app.timers.is_registered(old):
            bpy.app.timers.unregister(old)
        ns["rim_ink_tick"] = tick
        bpy.app.timers.register(tick, first_interval=0.1, persistent=True)


def render_views(scene):
    here = os.path.dirname(os.path.abspath(bpy.data.filepath))
    pivot = bpy.data.objects["cam_pivot"]
    out = os.path.join(here, "renders")
    os.makedirs(out, exist_ok=True)
    for name, yaw in {"sprite": -35, "front": 0, "side": 90, "back": 200}.items():
        pivot.rotation_euler = (0, 0, math.radians(yaw))
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(out, f"rim-{name}.png")
        bpy.ops.render.render(write_still=True)
    pivot.rotation_euler = (0, 0, math.radians(-35))
    bpy.context.view_layer.update()
    paint(camera_view(scene))


if __name__ == "__main__" and bpy.app.background:
    # Lance depuis la ligne de commande : installe dans le .blend, rend, sauve.
    scene = bpy.context.scene
    scene.render.use_freestyle = False  # plus de trait autour : le noir est dans le lapin
    here = os.path.dirname(os.path.abspath(bpy.data.filepath))
    text = bpy.data.texts.get("rim_ink.py") or bpy.data.texts.new("rim_ink.py")
    text.clear()
    # La copie dans le .blend ne doit que brancher le direct : a l'ouverture,
    # Blender la lance aussi sous le nom __main__ (elle re-rendait tout).
    with open(os.path.join(here, "rim_ink.py")) as f:
        text.write(f.read().replace('if __name__ == "__main__" and bpy.app.background:',
                                    "if False:"))
    text.use_module = True
    install()
    render_views(scene)
    bpy.ops.wm.save_mainfile()
else:
    # Dans le .blend (a l'ouverture ou Run Script) : on branche le direct.
    install()
