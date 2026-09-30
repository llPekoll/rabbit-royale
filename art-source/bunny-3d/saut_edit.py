"""Fabrique saut-edit.blend : la scene ou l'on courbe le saut a la main.

Blender 4.5 :
  Blender -b art-source/bunny-3d/hero-voxel.blend -P art-source/bunny-3d/saut_edit.py
  (-- reset pour repartir des courbes de depart ; sans ca, un fichier existant
  n'est jamais ecrase : ce sont tes poses.)

Chaque pose du saut est le lapin ENTIER, d'un seul bloc (corps, tete, oreilles,
pattes), courbe par une cage (lattice) : `<n> · cage`, a modifier en mode
edition (Tab, puis G / R sur ses points). `apercu saut <n>` montre le bloc
recale en voxels ; il se refait quand on quitte le mode edition.
Trois poses en file, vues de profil par `cam profil` :
  1 impulsion (arc qui monte), 2 en l'air (droit, etire), 3 reception (arc qui plonge).
Pour passer les poses au lapin et a l'animatique : maj-saut.command.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hero_v2 as H  # noqa: E402
import saut_live as L  # noqa: E402

OUT = os.path.join(HERE, "saut-edit.blend")
RESET = "reset" in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
SPACING = 2.6  # metres entre deux poses : les cages ne se chevauchent pas
CAGE_CENTER = Vector((0.0, 0.02, 0.65))  # la boite du lapin (metres du modele)
CAGE_SIZE = Vector((1.1, 1.3, 1.5))
CAGE_POINTS = (2, 5, 4)  # x, y (la longueur du corps), z
FRONT, BACK = -0.5, 0.55  # y du museau et du pompon
EARS_FROM = 0.9  # au-dessus : les oreilles, qui se couchent


def rot_x(p, deg, pivot):
    r = Matrix.Rotation(math.radians(deg), 3, "X")
    return pivot + r @ (p - pivot)


# Poses de depart (metres du modele) : le lapin reste entier et compact en
# l'air, comme la video (tete sur le corps, pattes dessous) ; il bascule a
# peine. Des arcs plus forts enfoncaient la tete dans le corps.
# Angles autour de X : - = le devant monte.
def pose_1(p):
    """Impulsion : bascule nez en l'air, autour du pied arriere."""
    return rot_x(p, -10, Vector((0, BACK, 0)))


def pose_2(p):
    """En l'air : la forme de repos, a peine etiree en hauteur."""
    return Vector((p.x, p.y, p.z * 1.05))


def pose_3(p):
    """Reception : bascule nez en bas, autour du pied avant."""
    return rot_x(p, 10, Vector((0, FRONT, 0)))


POSES = {1: pose_1, 2: pose_2, 3: pose_3}


def grids(model):
    """Le lapin entier : voxels du corps (grille 0) et demi-voxels des oreilles (1)."""
    body_cells, head_cells, paw_cells, color = model
    coarse = set(body_cells) | set(head_cells) | set().union(*paw_cells.values())
    g0 = {c: {d: color(c, d).split(".")[0] for d in L.FACES} for c in coarse}
    g1 = {}
    for col in H.EARS_AT.values():
        for a in range(H.EAR_W):
            for b in range(H.EAR_D):
                for c in range(H.EAR_H):
                    cell = (2 * col + a, 2 * H.EAR_J + b, 2 * H.EARS[0] + c)
                    g1[cell] = {d: H.ear_color((a, b, c), d) for d in L.FACES}
    return {0: g0, 1: g1}


def make_cage(name, fn):
    lat = bpy.data.lattices.new(name)
    lat.points_u, lat.points_v, lat.points_w = CAGE_POINTS
    for axis in ("interpolation_type_u", "interpolation_type_v", "interpolation_type_w"):
        setattr(lat, axis, "KEY_BSPLINE")
    ob = bpy.data.objects.new(name, lat)
    ob.location = CAGE_CENTER
    # Les points d'un lattice sont espaces d'une unite (n points = n - 1 de large) :
    # l'echelle ramene la cage a CAGE_SIZE.
    scale = cage_scale(CAGE_SIZE, CAGE_POINTS)
    ob.scale = scale
    for p in lat.points:
        m = CAGE_CENTER + Vector([p.co[i] * scale[i] for i in range(3)])
        q = fn(m) - CAGE_CENTER
        p.co_deform = Vector([q[i] / scale[i] for i in range(3)])
    return ob


def cage_scale(size, points):
    return Vector([size[i] / max(1, points[i] - 1) for i in range(3)])


def main():
    if os.path.exists(OUT) and not RESET:
        print(f"{OUT} existe : rien a faire (-- reset pour repartir de zero).")
        return
    src = bpy.data.objects[H.BODY]
    mats = list(src.data.materials)
    g = grids(H.model(src))
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)

    scene = bpy.context.scene
    for n, fn in POSES.items():
        coll = bpy.data.collections.new(f"saut {n}")
        scene.collection.children.link(coll)
        root = bpy.data.objects.new(f"saut {n}", None)
        root["saut_root"] = True
        root.empty_display_type = "ARROWS"
        root.empty_display_size = 0.2
        # En file le long de Y, face a droite de la camera : 1, 2, 3 de gauche a droite.
        root.location = (0, -(n - 1) * SPACING, 0)
        cage = make_cage(f"{n} · cage", fn)
        cage["saut_kind"] = "cage"
        cloud = L.make_cloud(f"{n} · lapin", g)
        cloud["saut_kind"] = "cloud"
        for m in mats:
            cloud.data.materials.append(m)
        mod = cloud.modifiers.new("cage", "LATTICE")
        mod.object = cage
        cloud.hide_select = True
        # Ses points (des milliers) se dessinaient en rayures noires sur l'apercu.
        prev = bpy.data.objects.new(f"apercu saut {n}", bpy.data.meshes.new("tmp"))
        prev["saut_kind"] = "preview"
        prev.hide_select = True
        for m in mats:
            prev.data.materials.append(m)
        for ob in (root, cage, cloud, prev):
            coll.objects.link(ob)
            if ob is not root:
                ob.parent = root
        cloud.hide_set(True)  # cache, mais toujours calcule
        bpy.context.view_layer.update()
        L.refresh(root)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 6.0
    cam = bpy.data.objects.new("cam profil", cam_data)
    cam.location = (-8, -SPACING, 0.6)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    scene.collection.objects.link(cam)
    scene.camera = cam

    text = bpy.data.texts.new("saut_live.py")
    with open(os.path.join(HERE, "saut_live.py")) as f:
        text.write(f.read())
    text.use_module = True
    text.use_fake_user = True
    bpy.ops.wm.save_as_mainfile(filepath=OUT)


main()
