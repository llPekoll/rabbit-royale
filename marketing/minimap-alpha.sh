#!/usr/bin/env bash
# La mini-carte SEULE, en .mov ProRes 4444 avec alpha, carree, 60 i/s : le
# lapin marche au hasard, creuse, les chiffres sortent, des rivaux rodent.
#   marketing/minimap-alpha.sh            (3 s, 1080x1080, ile lv1:minimap-0)
# SECONDS_=6 SIZE=720 SEED=lv2:autre EVERY=0.5 pour varier.
# Sort dans marketing/out/fx/minimap[-<graine>].mov.
set -euo pipefail
cd "$(dirname "$0")/.."

GODOT=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
DURATION=${SECONDS_:-3}
SIZE=${SIZE:-1080}
SEED=${SEED:-lv1:minimap-0}
EVERY=${EVERY:-0.7}
OUT=marketing/out/fx
mkdir -p "$OUT"

tmp=$(mktemp -d -t minimap)
until "$GODOT" --path godot --fixed-fps 60 scenes/demo/minimap_alpha_bench.tscn -- \
    --out="$tmp/pre" --seconds="$DURATION" --size="$SIZE" --seed="$SEED" \
    --clean --auto=200 --auto-every="$EVERY" > "$tmp/log" 2>&1; do
  grep -E "SCRIPT ERROR|\[minimap\]" "$tmp/log" >&2 || true
  rm -rf "$tmp/pre"; echo "rendu incomplet, on recommence" >&2
done
grep -E "\[minimap\]" "$tmp/log" || true
# PREMULTIPLIE -> ALPHA DROIT (voir fx-alpha.sh).
python3 - "$tmp/pre" "$tmp/straight" <<'PY'
import sys, os, numpy as np
from PIL import Image
src, dst = sys.argv[1:]
os.makedirs(dst)
for name in sorted(os.listdir(src)):
    p = np.asarray(Image.open(f"{src}/{name}").convert("RGBA")).astype(np.float32) / 255
    rgb, a = p[..., :3], p[..., 3]
    out = np.zeros_like(p)
    m = a > 0
    out[..., :3][m] = np.clip(rgb[m] / a[m, None], 0, 1)
    out[..., 3] = a
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(f"{dst}/{name}")
PY
suffix=$([ "$SEED" = lv1:minimap-0 ] && echo "" || echo "-${SEED//:/-}")
ffmpeg -nostdin -v error -y -framerate 60 -i "$tmp/straight/%04d.png" \
  -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16 \
  -vendor apl0 "$OUT/minimap$suffix.mov"
rm -rf "$tmp"
echo "$OUT/minimap$suffix.mov"
