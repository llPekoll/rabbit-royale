#!/usr/bin/env bash
# Rend l'oiseau du ciel en spritesheet pixel art. Blender headless : rien a
# ouvrir, rejouable a l'identique. Voir scripts/render-bird.py.
set -euo pipefail

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
if [ ! -x "$BLENDER" ]; then
  echo "Blender introuvable : $BLENDER (surcharge avec BLENDER=/chemin/vers/blender)" >&2
  exit 1
fi

exec "$BLENDER" --background --factory-startup \
  --python "$(dirname "$0")/render-bird.py"
