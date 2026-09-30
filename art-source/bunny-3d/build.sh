#!/bin/sh
# Refait le lapin voxel de bout en bout, dans l'ordre :
#   hero_v2 (voxels, pattes, tete, oreilles) -> faces (expressions)
#   -> head_cage (cage de la tete) -> rim_ink (contour) -> jump (poses du saut,
#   lues dans saut-edit.blend).
set -e
cd "$(dirname "$0")"
B=/Applications/Blender.app/Contents/MacOS/Blender
run() { "$B" -b "$1" -P "$2" 2>&1 | grep -iE "error|Traceback" -A6 && { echo "ECHEC : $2"; exit 1; } || true; }
run hero-voxel.blend hero_v2.py
run hero-voxel-v2.blend faces.py
run hero-voxel-v2.blend head_cage.py
run hero-voxel-v2.blend rim_ink.py
run hero-voxel-v2.blend jump.py
echo "OK : hero-voxel-v2.blend refait."
