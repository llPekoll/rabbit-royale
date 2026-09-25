"""Lapin blanc de bunny-white.png, en volumes.

Blender 4.5 :
  Blender -b -P art-source/bunny-voxel/build_bunny.py
Ecrit bunny-white.blend + renders/ a cote du script.

Le sprite est un bloc : tete et corps de meme largeur, oreilles courtes et
carrees a interieur rose, joues roses, pattes et queue plus claires, contour
noir. Voxels d'un pixel fondus en un maillage : chaque face porte la couleur
du pixel, ombrage toon a deux tons, contour Freestyle (silhouettes seules). Face au -Y, queue au +Y, pieds sur z = 0.
"""
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))

# Palette du sprite (sRGB 0-255).
PALETTE = {
    "fur": (196, 195, 184),
    "light": (230, 232, 234),
    "shade": (133, 132, 119),
    "pink": (247, 143, 159),
    "ink": (47, 47, 46),
    "tooth": (241, 240, 253),
}
OUTLINE_PX = 9
PX = 0.1
PITCH = 18


def srgb_to_linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def toon_material(name, rgb):
    """Diffuse -> deux paliers -> emission : les aplats du pixel art."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    lin = [srgb_to_linear(c) for c in rgb] + [1.0]

    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.62, 0.62, 0.6, 1)
    ramp.color_ramp.elements[1].position = 0.18
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs["A"].default_value = lin
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    nt.links.new(diffuse.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs[0])
    mat.diffuse_color = lin  # vue solide
    return mat


def voxels():
    """Grille lue sur la frame idle (bunny-white.png, case 0), 1 voxel = 1 pixel.
    i = x (0..6, gauche -> droite), j = profondeur (0 = face, 7 = dos), k = hauteur.
    Corps 7 x 8 en fourrure, 6 de haut devant et 4 a la croupe, tete 7 x 5 x 3 posee dessus, calee sur la face."""
    v = {}
    # Le dos descend vers la croupe, comme les marches du contour au sprite.
    height = (6, 6, 6, 6, 5, 5, 4, 4)
    for i in range(7):
        for j in range(8):
            for k in range(height[j]):
                v[i, j, k] = "fur"
    # Tete : dessus et front clairs, joues/flancs en fourrure.
    for i in range(7):
        for j in range(5):
            for k in (6, 7, 8):
                if k == 8 and j == 4 and i in (0, 6):
                    continue
                v[i, j, k] = "light" if k == 8 or j == 0 else "fur"
    # Visage : un oeil d'encre, une ombre cote exterieur ; nez rose ; une dent.
    v[1, 0, 7] = "ink"
    v[5, 0, 7] = "ink"
    v[0, 0, 7] = "shade"
    v[6, 0, 7] = "shade"
    v[3, 0, 6] = "pink"
    v[3, 0, 5] = "tooth"
    # Oreilles 2 x 1 x 3 aux deux bords, rose sur la colonne du dedans.
    for i0, inner in ((0, 1), (5, 5)):
        for i in (i0, i0 + 1):
            for k in (9, 10, 11):
                v[i, 2, k] = "pink" if i == inner and k in (9, 10) else "light"
    # Pattes avant 2 x 1 x 3 devant le poitrail, ombre entre les deux.
    for i in (1, 2, 4, 5):
        for k in (0, 1, 2):
            v[i, -1, k] = "light"
    v[3, 0, 0] = "shade"
    # Pieds arriere le long des flancs, queue en boule au dos.
    for j in range(3, 8):
        for k in (0, 1):
            v[-1, j, k] = "light"
            v[7, j, k] = "light"
    for i in (2, 3, 4):
        for k in (1, 2, 3):
            v[i, 8, k] = "light"
    return v


FACES = {
    (1, 0, 0): ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
    (-1, 0, 0): ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)),
    (0, 1, 0): ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
    (0, -1, 0): ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
    (0, 0, 1): ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
    (0, 0, -1): ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)),
}


def build():
    """Un seul maillage : seules les faces exterieures, une couleur par face."""
    import bmesh

    grid = voxels()
    order = ["fur", "light", "shade", "pink", "ink", "tooth"]
    mesh = bpy.data.meshes.new("bunny")
    for key in order:
        mesh.materials.append(MATS[key])
    bm = bmesh.new()
    verts = {}

    def vert(p):
        if p not in verts:
            # Centre en x, face vers -Y, pieds sur z = 0.
            verts[p] = bm.verts.new(((p[0] - 3.5) * PX, (p[1] - 4) * PX, p[2] * PX))
        return verts[p]

    for (i, j, k), color in grid.items():
        for d, corners in FACES.items():
            if (i + d[0], j + d[1], k + d[2]) in grid:
                continue
            f = bm.faces.new([vert((i + c[0], j + c[1], k + c[2])) for c in corners])
            f.material_index = order.index(color)
    bm.to_mesh(mesh)
    bm.free()

    ob = bpy.data.objects.new("bunny", mesh)
    bpy.context.collection.objects.link(ob)
    return ob


def scene_setup():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.resolution_x = 512
    sc.render.resolution_y = 512
    sc.view_settings.view_transform = "Standard"

    # Contour au Freestyle : une coque inversee perce aux angles rentrants des voxels.
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    layer = bpy.context.view_layer
    layer.use_freestyle = True
    ls = layer.freestyle_settings.linesets[0]
    for flag in ("silhouette", "border", "crease", "contour", "external_contour", "material_boundary"):
        setattr(ls, "select_" + flag, flag in ("silhouette", "contour"))
    style = ls.linestyle or bpy.data.linestyles.new("ink")
    ls.linestyle = style
    style.color = [srgb_to_linear(c) for c in PALETTE["ink"]]
    style.thickness = OUTLINE_PX
    style.thickness_position = "CENTER"
    style.caps = "SQUARE"

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    sc.world = world

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun_data.use_shadow = False
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-30))
    sc.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.8
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    pivot = bpy.data.objects.new("cam_pivot", None)
    pivot.location = (0, 0, 0.6)
    sc.collection.objects.link(pivot)
    cam.parent = pivot
    # Le sprite montre peu le dessus : plongee faible.
    cam.location = (0, -8 * math.cos(math.radians(PITCH)), 8 * math.sin(math.radians(PITCH)))
    cam.rotation_euler = (math.radians(90 - PITCH), 0, 0)
    return pivot


def render_views(pivot):
    out_dir = os.path.join(HERE, "renders")
    os.makedirs(out_dir, exist_ok=True)
    # Le sprite regarde vers la droite-avant : la vue « sprite » tourne de 35 degres.
    views = {"sprite": -35, "front": 0, "side": 90, "back": 200}
    for name, yaw in views.items():
        pivot.rotation_euler = (0, 0, math.radians(yaw))
        bpy.context.scene.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
    pivot.rotation_euler = (0, 0, math.radians(views["sprite"]))


reset()
MATS = {k: toon_material(k, v) for k, v in PALETTE.items()}
build()
pivot = scene_setup()
render_views(pivot)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "bunny-white.blend"))
