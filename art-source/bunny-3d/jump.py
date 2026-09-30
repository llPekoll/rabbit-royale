"""Le saut en poses, comme la 2e ligne de la sprite sheet : un bloc par image.

Blender 4.5 (apres hero_v2.py, faces.py et rim_ink.py) :
  Blender -b art-source/bunny-3d/hero-voxel-v2.blend -P art-source/bunny-3d/jump.py

Les poses viennent de saut-edit.blend (saut_edit.py) : le lapin entier courbe
par une cage, recale en voxels. Pose 0 = le lapin assis (corps, tete,
oreilles et pattes a part) ; poses 1..3 = un seul maillage, tete et oreilles
comprises. Les yeux, le nez et la bouche restent des plaques : la tete
(`tête`, alors vide) est posee la ou la cage emmene le cou, et les plaques
suivent.

On choisit la pose avec la propriete `saut` (0..3, cle-able) du corps. Le
texte `poses.py` colle dans le .blend echange les maillages a chaque image
(et au rendu).
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hero_v2 as H  # noqa: E402
import saut_live as L  # noqa: E402

EDIT = os.path.join(HERE, "saut-edit.blend")
EMPTY = "vide"

POSES_TEXT = '''"""Echange les maillages du lapin selon la propriete `saut` du corps (jump.py)."""
import bpy


def swap_poses(scene=None, *_):
    for body in [o for o in bpy.data.objects if "saut_meshes" in o]:
        p = int(body.get("saut", 0))
        meshes = list(body["saut_meshes"])
        if not 0 <= p < len(meshes):
            continue
        me = bpy.data.meshes.get(meshes[p])
        if me and body.data != me:
            body.data = me
        empty = bpy.data.meshes.get(body["saut_empty"])
        # Pose 0 : les morceaux a part ; au saut, tout est dans le bloc du corps.
        for name, base in zip(body["saut_parts"], body["saut_parts_mesh"]):
            ob = bpy.data.objects.get(name)
            want = bpy.data.meshes.get(base) if p == 0 else empty
            if ob and want and ob.data != want:
                ob.data = want
        head = bpy.data.objects.get(body["saut_head"])
        if head is None:
            continue
        pose = list(body["saut_head_pose"])[6 * p:6 * p + 6]
        head.location = pose[:3]
        if p or not (head.animation_data and head.animation_data.action):
            head.rotation_euler = pose[3:]


_last = {}


def tick():
    try:
        state = tuple(int(o.get("saut", 0)) for o in bpy.data.objects if "saut_meshes" in o)
        if state != _last.get("s"):
            _last["s"] = state
            swap_poses()
    except Exception as e:
        print("poses:", e)
    return 0.1


def install():
    # Apres l'animation de l'image (frame_change_post : `saut` y a sa valeur
    # cle), et avant le contour au rendu (render_pre, en tete de liste).
    hs = bpy.app.handlers
    for h in (hs.frame_change_pre, hs.frame_change_post, hs.render_pre):
        for f in list(h):
            if getattr(f, "__name__", "") == "swap_poses":
                h.remove(f)
    hs.frame_change_post.append(swap_poses)
    hs.render_pre.insert(0, swap_poses)
    if not bpy.app.background:
        ns = bpy.app.driver_namespace
        old = ns.get("poses_tick")
        if old and bpy.app.timers.is_registered(old):
            bpy.app.timers.unregister(old)
        ns["poses_tick"] = tick
        bpy.app.timers.register(tick, first_interval=0.1, persistent=True)


install()
'''


def bake_poses(mats):
    """Les blocs des poses de saut-edit.blend, et la tete de chaque pose."""
    with bpy.data.libraries.load(EDIT, link=False) as (src, dst):
        dst.objects = list(src.objects)
    edit = [o for o in dst.objects if o]
    for o in edit:
        bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    out = []
    for root in sorted([o for o in edit if o.get("saut_root")], key=lambda o: o.name):
        cloud = L.part(root, "cloud")
        me, head = L.build_pose(cloud, f"corps saut {root.name.split()[-1]}", mats)
        me.use_fake_user = True
        out.append((me, head))
    for o in edit:
        bpy.data.objects.remove(o)
    return out


def main():
    if not os.path.exists(EDIT):
        sys.exit(f"{EDIT} manque : lancer d'abord saut_edit.py.")
    body = bpy.data.objects[H.BODY]
    mats = list(body.data.materials)
    # Relancer : les poses d'avant partent.
    for me in [m for m in bpy.data.meshes if m.name.startswith("corps saut")]:
        bpy.data.meshes.remove(me)
    head = bpy.data.objects[H.HEAD]
    names = [body.data.name]
    head_pose = list(head.location) + list(head.rotation_euler)
    for me, m in bake_poses(mats):
        names.append(me.name)
        head_pose += list(m.translation) + list(m.to_euler())

    empty = bpy.data.meshes.get(EMPTY) or bpy.data.meshes.new(EMPTY)
    empty.use_fake_user = True
    body.data.use_fake_user = True
    parts = list(H.PAWS) + list(H.HIND) + [H.HEAD] + list(H.EARS_AT)
    for n in parts:
        bpy.data.objects[n].data.use_fake_user = True
    body["saut"] = 0
    body.id_properties_ui("saut").update(
        min=0, max=len(names) - 1,
        description="0 assis, 1 impulsion, 2 en l'air, 3 reception")
    body["saut_meshes"] = names
    body["saut_empty"] = EMPTY
    body["saut_parts"] = parts
    body["saut_parts_mesh"] = [bpy.data.objects[n].data.name for n in parts]
    body["saut_head"] = H.HEAD
    body["saut_head_pose"] = head_pose

    text = bpy.data.texts.get("poses.py") or bpy.data.texts.new("poses.py")
    text.clear()
    text.write(POSES_TEXT)
    text.use_module = True
    text.use_fake_user = True
    ns = {"__name__": "poses"}
    exec(compile(POSES_TEXT, "poses.py", "exec"), ns)

    render(body, ns["swap_poses"])
    body["saut"] = 0
    ns["swap_poses"]()
    bpy.ops.wm.save_mainfile()


def render(body, swap):
    """Planche : les 4 poses de profil et de trois quarts."""
    scene = bpy.context.scene
    pivot = bpy.data.objects["cam_pivot"]
    out = os.path.join(HERE, "renders", "jump")
    os.makedirs(out, exist_ok=True)
    rim = {}  # le contour, si rim_ink est deja installe
    if "rim_ink.py" in bpy.data.texts:
        rim["__name__"] = "rim"
        exec(compile(bpy.data.texts["rim_ink.py"].as_string(), "rim_ink.py", "exec"), rim)
    old = tuple(pivot.rotation_euler)
    for n in range(len(body["saut_meshes"])):
        body["saut"] = n
        swap()
        for view, yaw in (("side", 90), ("sprite", -35)):
            pivot.rotation_euler = (0, 0, math.radians(yaw))
            bpy.context.view_layer.update()
            if rim:
                rim["on_render"](scene)
            scene.render.filepath = os.path.join(out, f"{n}-{view}.png")
            bpy.ops.render.render(write_still=True)
    pivot.rotation_euler = old


if __name__ == "__main__":
    main()
