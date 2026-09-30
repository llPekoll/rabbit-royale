"""Tourner la tete par une cage : le maillage se deforme, il ne pivote pas d'un bloc.

Blender 4.5 (apres hero_v2.py et faces.py, avant rim_ink.py et jump.py) :
  Blender -b art-source/bunny-3d/hero-voxel-v2.blend -P art-source/bunny-3d/head_cage.py

Un lattice `cage tête` entoure le lapin ; l'empty `contrôle tête`, au cou, le
tient par des crochets : le corps reste, le cou se tord sur une rangee de
voxels, la tete suit en entier (FOLLOW). On tourne le
controle (R). Tout le lapin (corps, pattes, tete, oreilles, traits du visage)
porte le modificateur de la cage.
"""
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hero_v2 as H  # noqa: E402

CENTER = Vector((0.0, 0.02, 0.75))   # metres du modele : tout le lapin en hauteur
SIZE = Vector((1.1, 1.2, 1.5))       # de z 0 au-dessus des oreilles
POINTS = (3, 3, 16)                  # une couche par rangee de voxels : z 0, 0.1 ... 1.5
# Couche en z -> part du mouvement du controle. La torsion tient sur UNE
# rangee de voxels, entre z 0.4 (fixe : tout le corps dessous) et z 0.5 (le
# bas de la tete, qui suit en entier). Sur trois rangees, le corps se tordait.
FOLLOW = {k: 1.0 for k in range(5, 16)}
CAGE, CTRL = "cage tête", "contrôle tête"


def main():
    body = bpy.data.objects[H.BODY]
    for name in (CAGE, CTRL):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name])

    ctrl = bpy.data.objects.new(CTRL, None)
    ctrl.empty_display_type = "SPHERE"
    ctrl.empty_display_size = 0.08
    ctrl.location = H.NECK
    ctrl.parent = body
    ctrl.lock_location = (True, True, True)
    ctrl.lock_scale = (True, True, True)
    ctrl.rotation_mode = "XYZ"

    lat = bpy.data.lattices.new(CAGE)
    lat.points_u, lat.points_v, lat.points_w = POINTS
    # Lineaire : la couche fixe ne tire pas sur celles du dessus (le B-spline lissait).
    for axis in ("interpolation_type_u", "interpolation_type_v", "interpolation_type_w"):
        setattr(lat, axis, "KEY_LINEAR")
    cage = bpy.data.objects.new(CAGE, lat)
    cage.location = CENTER
    # Les points d'un lattice sont espaces d'une unite : n points = n - 1 de large.
    cage.scale = [SIZE[i] / max(1, POINTS[i] - 1) for i in range(3)]
    cage.parent = body
    cage.hide_select = True  # on tourne le controle, pas la cage
    for ob in (ctrl, cage):
        for c in body.users_collection:
            c.objects.link(ob)
    bpy.context.view_layer.update()

    u, v, w = POINTS
    for layer, strength in FOLLOW.items():
        idx = [i for i in range(u * v * w) if i // (u * v) == layer]
        hook = cage.modifiers.new(f"cou {layer}", "HOOK")
        hook.object = ctrl
        hook.strength = strength
        hook.vertex_indices_set(idx)
        # Au repos, pas de decalage : l'inverse de la place du controle.
        hook.matrix_inverse = ctrl.matrix_world.inverted() @ cage.matrix_world
        hook.center = ctrl.matrix_world.translation

    face = [o for o in bpy.data.objects if o.type == "MESH" and (
        o.name.startswith(("oeil ", "bouche ", "sourcil ", "joue ")) or o.name in ("nez",))]
    # Tout le lapin porte la cage : le haut du corps suit la tete un peu, et
    # les pattes restent collees au corps.
    limbs = [bpy.data.objects[n] for n in list(H.PAWS) + list(H.HIND)]
    for ob in [body, bpy.data.objects[H.HEAD]] + [bpy.data.objects[e] for e in H.EARS_AT] + limbs + face:
        for m in [m for m in ob.modifiers if m.type == "LATTICE" and m.name == "cage tête"]:
            ob.modifiers.remove(m)
        mod = ob.modifiers.new("cage tête", "LATTICE")
        mod.object = cage
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
