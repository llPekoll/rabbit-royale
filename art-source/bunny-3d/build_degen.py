"""Degen, le lapin brun, en voxels d'apres episodes/ep02-cinquante-cinquante/shots/refs/degen-pixel3d-v1.png.

Blender 4.5 :
  Blender -b -P art-source/bunny-3d/build_degen.py
Ecrit degen.blend, degen.glb, degen.vox, degen.png et renders/degen-*.png a cote
du script. Ne touche a aucun autre fichier.

Pas de coque d'encre : le contour sombre est porte par les voxels eux-memes
(oreilles, touffes des flancs, semelles), comme sur la planche.
Face au -Y, queue au +Y, pieds sur z = 0.
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_bunny as base  # noqa: E402

# Palette relevee sur la planche (sRGB 0-255).
PALETTE = {
    "fur": (147, 110, 86),
    "light": (160, 121, 95),
    "shade": (104, 77, 61),
    "dark": (42, 41, 44),
    "pink": (250, 163, 171),
    "white": (250, 247, 243),
    "ink": (30, 28, 29),
}
PX = 0.1


def voxels():
    """i = x (0..8 gauche -> droite, vue de face), j = profondeur (negatif = devant), k = hauteur."""
    v = {}

    def box(i_range, j_range, k_range, color, skip=None):
        for i in i_range:
            for j in j_range:
                for k in k_range:
                    if skip and skip(i, j, k):
                        continue
                    v[i, j, k] = color

    # Pieds : semelle sombre, dessus brun, un orteil qui depasse devant.
    for feet in (range(1, 4), range(5, 8)):
        box(feet, range(-1, 4), [0], "dark")
        box(feet, range(-1, 4), [1], "fur")
    # Bassin, puis corps 9 x 6 aux aretes verticales cassees.
    box(range(1, 8), range(0, 5), [2], "fur")
    box(range(0, 9), range(0, 6), range(3, 9), "fur",
        skip=lambda i, j, k: i in (0, 8) and j in (0, 5))
    # Ventre plus clair, en relief.
    box(range(2, 7), [-1], range(3, 8), "light")
    # Bras : cubes poses sur l'avant des flancs.
    for arm in (range(-1, 1), range(8, 10)):
        box(arm, range(-2, 0), range(4, 6), "fur")
    # Touffes sombres des flancs, en dents de scie.
    for i in (-1, 9):
        box([i], range(2, 4), range(5, 8), "dark", skip=lambda i, j, k: (j, k) == (3, 7))
        box([i], [3], [4], "dark")
    # Queue en boule au dos, bordee de sombre.
    box(range(3, 6), [6], range(3, 6), "shade")
    box([4], [7], [4], "fur")
    box(range(3, 6), [6], [6], "dark")

    # Tete 9 x 7, dessus arrondi.
    box(range(0, 9), range(-1, 6), range(9, 15), "fur",
        skip=lambda i, j, k: k == 14 and (i in (0, 8) or j in (-1, 5)))
    # Joues sombres.
    for i in (-1, 9):
        box([i], range(1, 3), range(10, 13), "dark", skip=lambda i, j, k: (j, k) == (2, 12))
    # Museau plus sombre, nez rose et dent blanche en relief.
    box(range(2, 7), [-2], range(9, 11), "light")
    v[4, -3, 11] = "pink"
    v[4, -3, 10] = "white"
    # Yeux.
    v[2, -1, 12] = "ink"
    v[6, -1, 12] = "ink"

    # Oreilles 3 x 2 x 4 : bord exterieur, dos et pointe sombres, interieur rose.
    for cols, outer, inner in ((range(1, 4), 1, 3), (range(5, 8), 7, 5)):
        for i in cols:
            for k in range(15, 19):
                v[i, 2, k] = "dark" if k == 18 or i == outer else "fur"
                if k == 18 or i == outer:
                    front = "dark"
                elif i == inner and k in (15, 16, 17):
                    front = "pink"
                else:
                    front = "fur"
                v[i, 1, k] = front
    v[4, 2, 15] = "dark"
    return v


def build(grid):
    """Un maillage, faces exterieures seules, une couleur par face."""
    import bmesh

    order = list(PALETTE)
    mesh = bpy.data.meshes.new("degen")
    for key in order:
        mesh.materials.append(MATS[key])
    bm = bmesh.new()
    verts = {}

    def vert(p):
        if p not in verts:
            verts[p] = bm.verts.new(((p[0] - 4.5) * PX, (p[1] - 2.0) * PX, p[2] * PX))
        return verts[p]

    for (i, j, k), color in grid.items():
        for d, corners in base.FACES.items():
            if (i + d[0], j + d[1], k + d[2]) in grid:
                continue
            f = bm.faces.new([vert((i + c[0], j + c[1], k + c[2])) for c in corners])
            f.material_index = order.index(color)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("Degen", mesh)
    bpy.context.collection.objects.link(ob)
    return ob


def render_views(pivot):
    out_dir = os.path.join(HERE, "renders")
    views = {"three-quarter": -35, "front": 0, "side": 90, "back": 180}
    for name, yaw in views.items():
        pivot.rotation_euler = (0, 0, math.radians(yaw))
        bpy.context.scene.render.filepath = os.path.join(out_dir, f"degen-{name}.png")
        bpy.ops.render.render(write_still=True)
    pivot.rotation_euler = (0, 0, math.radians(views["three-quarter"]))
    bpy.context.scene.render.filepath = os.path.join(HERE, "degen.png")
    bpy.ops.render.render(write_still=True)


def export_glb(ob):
    """Materiaux simples pour les moteurs : le Shader-to-RGB reste dans le .blend."""
    for index, source in enumerate(list(ob.data.materials)):
        material = bpy.data.materials.new(source.name + " • glTF")
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = source.diffuse_color
        bsdf.inputs["Roughness"].default_value = 1.0
        ob.data.materials[index] = material
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    glb = os.path.join(HERE, "degen.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              use_selection=True, export_animations=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    assert meshes and all(o.data.materials for o in meshes)
    print("Verified GLB:", glb, sum(len(o.data.polygons) for o in meshes), "faces")


if __name__ == "__main__":
    grid = voxels()
    from export_vox import write_vox
    write_vox(os.path.join(HERE, "degen.vox"), grid, PALETTE)

    base.reset()
    MATS = {k: base.toon_material(k, c) for k, c in PALETTE.items()}
    ob = build(grid)
    pivot = base.scene_setup()
    cam = bpy.context.scene.camera
    cam.data.ortho_scale = 2.6
    pivot.location.z = 0.95
    bpy.context.scene.render.resolution_x = 768
    bpy.context.scene.render.resolution_y = 768
    render_views(pivot)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "degen.blend"))
    export_glb(ob)
