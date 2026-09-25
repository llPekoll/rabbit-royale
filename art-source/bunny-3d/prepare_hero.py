"""Prepare the existing white rabbit for Blender editing and portable glTF export.

Run with Blender --background --python art-source/bunny-3d/prepare_hero.py
The original bunny-white.blend is preserved.
"""
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE / "bunny-white.blend"))
scene = bpy.context.scene
rabbit = bpy.data.objects["bunny"]
rabbit.name = "Hero • lapin voxel"
bpy.ops.object.select_all(action="DESELECT")
rabbit.select_set(True)
bpy.context.view_layer.objects.active = rabbit

# Keep the authored toon materials and outline in the editable Blender file.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
            area.spaces.active.shading.type = "MATERIAL"
scene.render.filepath = str(HERE / "hero-voxel.png")
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "hero-voxel.blend"))
bpy.ops.render.render(write_still=True)

# Shader-to-RGB is Blender-specific. Export simple rough materials using the
# same base palette, and omit the inverted outline shell for game engines.
rabbit.modifiers.clear()
for index, source in enumerate(list(rabbit.data.materials)):
    material = bpy.data.materials.new(source.name + " • glTF")
    material.use_nodes = True
    material.diffuse_color = source.diffuse_color
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = source.diffuse_color
    bsdf.inputs["Roughness"].default_value = 1.0
    rabbit.data.materials[index] = material
bpy.ops.export_scene.gltf(
    filepath=str(HERE / "hero-voxel.glb"),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
)

# Verify the exported file can be loaded back as a mesh with materials.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HERE / "hero-voxel.glb"))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
assert meshes and sum(len(obj.data.polygons) for obj in meshes) > 0
assert all(obj.data.materials for obj in meshes)
print("Verified GLB:", len(meshes), "mesh(es)")
