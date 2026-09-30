#!/bin/sh
# Double-clic apres avoir enregistre saut-edit.blend : les poses du saut
# passent au lapin (hero-voxel-v2.blend) puis a l'animatique (ep02-scene-v5).
# Attention : ep02-scene-v5.blend est refait depuis la v4 (lapins puis decor).
cd "$(dirname "$0")"
B=/Applications/Blender.app/Contents/MacOS/Blender
"$B" -b hero-voxel-v2.blend -P jump.py && \
  cd ../../episodes/ep02-cinquante-cinquante/blender && \
  "$B" -b ep02-scene-v4.blend -P put_bunnies.py && \
  "$B" -b ep02-scene-v5.blend -P decor.py && \
  echo "OK : saut mis a jour dans le lapin et l'animatique (File > Revert dans Blender)."
