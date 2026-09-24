"""Lapin blanc de bunny-white.png, en volumes.

Blender 4.5 :
  Blender -b -P art-source/bunny-3d/build_bunny.py
Ecrit bunny-white.blend + renders/ a cote du script.

Le sprite est un bloc : tete et corps de meme largeur, oreilles courtes et
carrees a interieur rose, joues roses, pattes et queue plus claires, contour
noir. Voxels d'un pixel fondus en un maillage : chaque face porte la couleur
du pixel, ombrage toon a deux tons, contour en coque inversee (solidify). Face au -Y, queue au +Y, pieds sur z = 0.
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
}
OUTLINE = 0.035
PX = 0.1


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


def outline_material():
    mat = bpy.data.materials.new("outline")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = [srgb_to_linear(c) for c in PALETTE["ink"]] + [1]
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs[0], out.inputs[0])
    mat.use_backface_culling = True
    mat.diffuse_color = (0, 0, 0, 1)
    return mat


def voxels():
    """Grille lue sur la frame idle, 1 voxel = 1 pixel du sprite.
    i = x (0..8, gauche -> droite), j = profondeur (0 = face, 6 = dos), k = hauteur."""
    v = {}
    # Corps : 9 x 7 x 8, gris ; le dessus et le haut de la face en blanc.
    # Les aretes du haut perdent un pixel : la tete s'arrondit comme au sprite.
    for i in range(9):
        for j in range(7):
            for k in range(8):
                if k == 7 and (i in (0, 8) or j == 6):
                    continue
                v[i, j, k] = "light" if k >= 6 or (k >= 5 and j <= 1) else "fur"
    # Visage (face avant, j = 0) : un pixel d'encre par oeil, nez rose.
    v[2, 0, 6] = "ink"
    v[6, 0, 6] = "ink"
    v[4, 0, 5] = "pink"
    # Oreilles 2 x 1 x 3, un pixel d'ecart ; interieur rose sur la colonne du dedans.
    for i0, inner in ((1, 2), (6, 6)):
        for i in (i0, i0 + 1):
            for k in (8, 9, 10):
                v[i, 3, k] = "pink" if i == inner and k in (8, 9) else "light"
    # Pattes avant 2 x 1 x 2, qui depassent de la face.
    for i in (2, 3, 5, 6):
        for k in (0, 1):
            v[i, -1, k] = "light"
    # Pieds arriere sur les flancs, queue en boule au dos.
    for j in range(2, 6):
        v[-1, j, 0] = "light"
        v[9, j, 0] = "light"
    for i in (3, 4, 5):
        for k in (1, 2, 3):
            v[i, 7, k] = "light"
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
    order = ["fur", "light", "pink", "ink", "outline"]
    mesh = bpy.data.meshes.new("bunny")
    for key in order:
        mesh.materials.append(MATS[key])
    bm = bmesh.new()
    verts = {}

    def vert(p):
        if p not in verts:
            # Centre en x, face vers -Y, pieds sur z = 0.
            verts[p] = bm.verts.new(((p[0] - 4.5) * PX, (p[1] - 3.5) * PX, p[2] * PX))
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
    so = ob.modifiers.new("outline", "SOLIDIFY")
    so.thickness = OUTLINE
    so.offset = 1.0
    so.use_flip_normals = True
    so.use_rim = False
    so.material_offset = order.index("outline")
    so.material_offset_rim = order.index("outline")
    return ob


def scene_setup():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.resolution_x = 512
    sc.render.resolution_y = 512
    sc.view_settings.view_transform = "Standard"

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
    # Vue iso du jeu : 30 degres de plongee.
    cam.location = (0, -8 * math.cos(math.radians(30)), 8 * math.sin(math.radians(30)))
    cam.rotation_euler = (math.radians(60), 0, 0)
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
MATS["outline"] = outline_material()
build()
pivot = scene_setup()
render_views(pivot)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "bunny-white.blend"))
