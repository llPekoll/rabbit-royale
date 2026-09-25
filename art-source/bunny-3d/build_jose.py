"""Give Jose a stepped, rounded voxel crown while retaining the original body."""
import sys
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_bunny as base

grid = base.voxels()
# Replace the thin ears with ears anchored on the raised crown.
grid = {p: c for p, c in grid.items() if p[2] < 8}
# Three nested tiers round the head in both width and depth.
for k, xs, ys in [(7, range(9), range(7)),
                   (8, range(1, 8), range(1, 6)),
                   (9, range(2, 7), range(2, 5))]:
    for i in xs:
        for j in ys:
            if k == 7 and i in (0, 8) and j in (0, 6):
                continue
            grid[i, j, k] = "light"
for start, inner in [(1, 2), (6, 6)]:
    for i in (start, start + 1):
        for j in (3, 4):
            for k in range(9, 13):
                grid[i, j, k] = (
                    "pink" if j == 3 and i == inner and k in (10, 11)
                    else "light"
                )

if "--export-vox" in sys.argv:
    from export_vox import write_vox
    write_vox(HERE / "jose.vox", grid, base.PALETTE)
    sys.exit(0)

bpy.ops.wm.open_mainfile(filepath=str(HERE / "jose.blend"))
old = next(o for o in bpy.context.scene.objects if o.type == "MESH")
base.MATS = {key: bpy.data.materials[key] for key in
             ("fur", "light", "pink", "ink")}
base.MATS["outline"] = base.outline_material()
base.voxels = lambda: grid
rabbit = base.build()
rabbit.name = "Jose"
bpy.data.objects.remove(old, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
rabbit.select_set(True)
bpy.context.view_layer.objects.active = rabbit
scene = bpy.context.scene
scene.camera.data.ortho_scale = 1.95
bpy.data.objects["cam_pivot"].location.z = 0.65
scene.render.filepath = str(HERE / "jose.png")
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "jose.blend"))
bpy.ops.render.render(write_still=True)
assert rabbit.dimensions.z > 1.25
print("Jose saved: rounded voxel crown, raised ears.")
