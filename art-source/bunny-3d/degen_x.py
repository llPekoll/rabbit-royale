"""Degen tel qu'il saute dans episodes/ep01-carotte-bombe/ep01-x.mp4 (t = 3 a 6 s).

Blender 4.5 :
  Blender -b -P art-source/bunny-3d/degen_x.py

Ecrit degen-x.blend, degen-x.glb et renders/degen-x-*.png a cote du script.
Ne lit ni n'ecrit aucun autre fichier.

Le modele : un seul bloc corps + tete (pas de cou), deux oreilles en U reliees
par un pont sombre, deux pattes avant a semelle sombre devant, deux pattes
arriere qui debordent sur les flancs, touffes sombres aux joues, queue sombre.
Couleurs = une par face (materiau par face, et l'attribut de face `Col`).

Un maillage, un squelette : root > body > ear.L/R, paw_front.L/R, paw_back.L/R.
Chaque voxel pese 1 sur l'os de son morceau (rigide, comme dans la video).
Face au -Y, queue au +Y, pieds sur z = 0. `.L` = cote +X (gauche du lapin).
L'action `hop` boucle sur 10 images (24 i/s).
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PX = 0.1  # un voxel = 10 cm

# Releve sur la video (sRGB 0-255).
PALETTE = {
    "fur": (112, 79, 58),
    "dark": (42, 43, 45),
    "pink": (216, 115, 115),
    "white": (228, 220, 206),
}

# Six faces d'un voxel : normale -> coins (ordre CCW vu de l'exterieur).
FACES = {
    (1, 0, 0): ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
    (-1, 0, 0): ((0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)),
    (0, 1, 0): ((1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)),
    (0, -1, 0): ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
    (0, 0, 1): ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
    (0, 0, -1): ((0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0)),
}


def voxels():
    """{part: {(i, j, k): couleur}}. i = x (0..8, vue de face de gauche a droite
    = cote droit du lapin d'abord), j = profondeur (0 = face avant), k = hauteur."""
    parts = {}

    def box(part, ir, jr, kr, color, skip=None):
        p = parts.setdefault(part, {})
        for i in ir:
            for j in jr:
                for k in kr:
                    if not (skip and skip(i, j, k)):
                        p[i, j, k] = color

    # Bloc corps + tete 9 x 9 x 7, aretes du dessus et verticales cassees.
    box("body", range(0, 9), range(0, 9), range(2, 9), "fur",
        skip=lambda i, j, k: i in (0, 8) and j in (0, 8))
    box("body", range(2, 7), range(2, 7), [1], "fur")  # ventre
    body = parts["body"]
    # Visage : yeux 2 x 1, nez rose, dent blanche.
    for i in (1, 2, 6, 7):
        body[i, 0, 7] = "dark"
    body[4, 0, 6] = "pink"
    body[4, 0, 5] = "white"
    # Touffes des joues, en escalier, qui debordent d'un voxel.
    for i in (-1, 9):
        box("body", [i], [0, 1], [6], "dark")
        box("body", [i], [1, 2], [5], "dark")
        # Touffe basse du flanc, au-dessus de la patte arriere.
        box("body", [i], [4, 5], [3], "dark")
    # Queue sombre au dos.
    box("body", range(3, 6), [9], range(3, 6), "dark")
    box("body", [4], [10], [4], "dark")
    # Pont sombre entre les oreilles (le creux du U).
    box("body", [4], [2, 3], [9], "dark")

    # Oreilles 4 x 2 x 4 : bord exterieur et interieur sombres, pointe sombre,
    # bande rose, le coin exterieur du haut arrondi.
    for part, cols, outer, pink, inner in (("ear.R", range(0, 4), 0, 2, 3),
                                           ("ear.L", range(5, 9), 8, 6, 5)):
        for i in cols:
            for k in range(9, 13):
                if i == outer and k == 12:
                    continue
                edge = i in (outer, inner) or k == 12
                front = "dark" if edge else ("pink" if i == pink and k <= 10 else "fur")
                box(part, [i], [2], [k], front)
                box(part, [i], [3], [k], "dark" if edge else "fur")

    # Pattes avant 3 x 3, semelle sombre, le devant deborde du corps.
    for part, cols in (("paw_front.R", range(1, 4)), ("paw_front.L", range(5, 8))):
        box(part, cols, range(-1, 2), [0], "dark")
        box(part, cols, range(-1, 2), [1], "fur")
        box(part, cols, [-1], [2], "fur")
    # Pattes arriere 3 x 4, semelle sombre, debordent des flancs.
    for part, cols in (("paw_back.R", range(-1, 2)), ("paw_back.L", range(7, 10))):
        box(part, cols, range(4, 9), [0], "dark")
        box(part, cols, range(5, 9), [1], "fur")
    return parts


def world(p):
    """Coin de grille -> metres, lapin centre en x et en y."""
    return Vector(((p[0] - 4.5) * PX, (p[1] - 4.5) * PX, p[2] * PX))


# Os : tete, queue (en coins de grille), parent.
BONES = {
    "root": ((4.5, 4.5, 0), (4.5, 4.5, 2), None),
    "body": ((4.5, 4.5, 2), (4.5, 4.5, 9), "root"),
    "ear.R": ((2, 2.5, 9), (2, 2.5, 13), "body"),
    "ear.L": ((7, 2.5, 9), (7, 2.5, 13), "body"),
    "paw_front.R": ((2.5, 0.5, 3), (2.5, 0.5, 0), "body"),
    "paw_front.L": ((6.5, 0.5, 3), (6.5, 0.5, 0), "body"),
    "paw_back.R": ((0.5, 6, 3), (0.5, 6, 0), "body"),
    "paw_back.L": ((8.5, 6, 3), (8.5, 6, 0), "body"),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def materials():
    mats = {}
    for name, rgb in PALETTE.items():
        lin = [((c / 255 + 0.055) / 1.055) ** 2.4 for c in rgb] + [1.0]
        m = bpy.data.materials.new("degen-" + name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = lin
        bsdf.inputs["Roughness"].default_value = 1.0
        m.diffuse_color = lin
        mats[name] = m
    return mats


def build_mesh(parts, mats):
    """Faces exterieures de chaque morceau (un morceau ne cache pas l'autre :
    ils bougent separement). Une couleur par face."""
    order = list(PALETTE)
    mesh = bpy.data.meshes.new("Degen")
    for key in order:
        mesh.materials.append(mats[key])
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    col = bm.faces.layers.float_color.new("Col") if hasattr(bm.faces.layers, "float_color") else None
    group_index = {name: n for n, name in enumerate(parts)}
    for part, grid in parts.items():
        verts = {}

        def vert(p):
            if p not in verts:
                v = bm.verts.new(world(p))
                v[deform][group_index[part]] = 1.0
                verts[p] = v
            return verts[p]

        for (i, j, k), color in grid.items():
            for d, corners in FACES.items():
                if (i + d[0], j + d[1], k + d[2]) in grid:
                    continue
                f = bm.faces.new([vert((i + c[0], j + c[1], k + c[2])) for c in corners])
                f.material_index = order.index(color)
                if col is not None:
                    f[col] = mats[color].diffuse_color[:]
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("Degen", mesh)
    bpy.context.collection.objects.link(ob)
    for name in parts:
        ob.vertex_groups.new(name=name)
    return ob


def build_rig(ob):
    arm = bpy.data.armatures.new("Degen_rig")
    rig = bpy.data.objects.new("Degen_rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        b = arm.edit_bones.new(name)
        b.head, b.tail = world(head), world(tail)
        b.roll = 0
        if parent:
            b.parent = arm.edit_bones[parent]
        b.use_deform = name in ob.vertex_groups
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    arm.display_type = "STICK"
    rig.show_in_front = True
    return rig


# Le saut, pose par pose. Angles en degres autour de X (vu du monde) :
#   body   + = nez vers le bas ;  pattes + = pied vers l'arriere ;
#   oreilles + = pointe vers l'avant.
# z = garde au sol du point le plus bas, en voxels (0 = pose au sol).
HOP = [
    # image, z, body, pattes avant, pattes arriere, oreilles
    (0, 0.0, 4, -6, 14, 8),      # atterrit sur les pattes avant
    (2, 0.0, 0, 8, -6, 4),       # ramasse : pattes arriere sous le corps
    (4, 1.0, -8, -18, 26, -10),  # pousse : nez en l'air, pattes arriere tendues
    (6, 2.4, -2, -14, 16, -6),   # sommet
    (8, 1.0, 6, -20, 22, 6),     # retombe : pattes avant tendues vers le sol
    (10, 0.0, 4, -6, 14, 8),
]


def pose_matrix(rig, name, rot_deg, lift=0.0):
    """Matrice (espace armature) : os tourne autour de sa tete, en X monde."""
    rest = rig.data.bones[name].matrix_local
    head = rest.to_translation()
    rot = Euler((math.radians(rot_deg), 0, 0)).to_matrix().to_4x4()
    return (Matrix.Translation(Vector((0, 0, lift)) + head) @ rot
            @ Matrix.Translation(-head) @ rest)


def animate(rig):
    scene = bpy.context.scene
    action = bpy.data.actions.new("hop")
    action.use_fake_user = True
    rig.animation_data_create().action = action
    mesh_ob = next(o for o in rig.children if o.type == "MESH")

    def pose(lift, pitch, front, back, ears):
        want = {"body": pose_matrix(rig, "body", pitch, lift)}
        delta = want["body"] @ rig.data.bones["body"].matrix_local.inverted()
        for side in ("L", "R"):
            for name, deg in ((f"paw_front.{side}", front), (f"paw_back.{side}", back),
                              (f"ear.{side}", ears)):
                want[name] = delta @ pose_matrix(rig, name, deg)
        for name, m in want.items():  # body d'abord : les autres en dependent
            rig.pose.bones[name].matrix = m
            bpy.context.view_layer.update()
        return want

    def lowest():
        ev = mesh_ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        return min((ev.matrix_world @ v.co).z for v in ev.data.vertices)

    for frame, z, pitch, front, back, ears in HOP:
        scene.frame_set(frame)
        # Une patte tournee ou le nez qui plonge passent sous le sol : on
        # mesure le point le plus bas et on remonte le corps d'autant.
        pose(0.0, pitch, front, back, ears)
        want = pose(z * PX - lowest(), pitch, front, back, ears)
        for name in want:
            pb = rig.pose.bones[name]
            pb.keyframe_insert("location", frame=frame)
            pb.keyframe_insert("rotation_euler", frame=frame)
    for fc in action.fcurves:
        fc.modifiers.new("CYCLES")
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    scene.frame_start, scene.frame_end = 0, 9
    scene.render.fps = 24
    return action


def scene_setup():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_shadows = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.view_settings.view_transform = "Standard"
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.0
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    pivot = bpy.data.objects.new("cam_pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (0, 0, 0.7)
    cam.parent = pivot
    cam.location = (0, -6, 1.2)
    cam.rotation_euler = (math.radians(79), 0, 0)
    scene.camera = cam
    return pivot


def render(pivot, rig, out_dir):
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    rig.hide_render = True
    views = {"three-quarter": 35, "front": 0, "side": -90, "back": 180}
    scene.frame_set(1)  # pose au sol, pattes arriere ramassees
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
    for name, yaw in views.items():
        pivot.rotation_euler = (0, 0, math.radians(yaw))
        scene.render.filepath = os.path.join(out_dir, f"degen-x-{name}.png")
        bpy.ops.render.render(write_still=True)
    rig.animation_data.action = bpy.data.actions["hop"]
    for yaw, tag in ((35, "34"), (-90, "side")):
        pivot.rotation_euler = (0, 0, math.radians(yaw))
        for f in range(10):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(out_dir, "degen-x-hop", f"{tag}-{f:02d}.png")
            bpy.ops.render.render(write_still=True)
    pivot.rotation_euler = (0, 0, math.radians(35))
    scene.frame_set(0)


def export_glb(rig, ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    glb = os.path.join(HERE, "degen-x.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True,
                              export_animations=True, export_animation_mode="ACTIONS")
    return glb


if __name__ == "__main__":
    reset()
    parts = voxels()
    ob = build_mesh(parts, materials())
    rig = build_rig(ob)
    animate(rig)
    pivot = scene_setup()
    render(pivot, rig, os.path.join(HERE, "renders"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "degen-x.blend"))
    glb = export_glb(rig, ob)
    print("OK", glb, len(ob.data.polygons), "faces,", len(rig.data.bones), "os")
