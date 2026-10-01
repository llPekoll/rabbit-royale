#!/usr/bin/env bash
# L'explosion et la foudre SEULES, en .mov ProRes 4444 avec alpha, 1920x1080
# 60 i/s, pour que le marketing les pose sur ses plans.
#   marketing/fx-alpha.sh [explosion|lightning ...]   (sans argument : les deux)
# ZOOM=2 grossit l'effet (1 = la taille des rushes de capture.sh).
# Sort dans marketing/out/fx/<fx>[-x<zoom>].mov.
#
# Godot rend sur un fond transparent en PREMULTIPLIE, et l'additif (le flash,
# la foudre) y pousse la couleur au-dessus de l'alpha — la foudre, dessinee
# en blend_add dans un rectangle opaque, sort meme a alpha 255 partout. On
# repasse donc chaque image en alpha DROIT : alpha = max(alpha, couleur)
# pour l'explosion, alpha = couleur seule (une cle de luminance) pour la
# foudre, qui n'est que de la lumiere.
set -euo pipefail
cd "$(dirname "$0")/.."

GODOT=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
ZOOM=${ZOOM:-1}
OUT=marketing/out/fx
mkdir -p "$OUT"

for fx in ${@:-explosion lightning}; do
  tmp=$(mktemp -d -t "fx-$fx")
  # Une image sautee (fenetre cachee) fait echouer le banc : on retourne.
  until "$GODOT" --path godot --fixed-fps 60 scenes/demo/fx_alpha_bench.tscn -- \
      --fx="$fx" --out="$tmp/pre" --zoom="$ZOOM" > "$tmp/log" 2>&1; do
    grep -E "SCRIPT ERROR|\[fx\]" "$tmp/log" >&2 || true
    rm -rf "$tmp/pre"; echo "rendu incomplet, on recommence" >&2
  done
  grep -E "\[fx\]" "$tmp/log" || true
  python3 - "$fx" "$tmp/pre" "$tmp/straight" <<'PY'
import sys, os, numpy as np
from PIL import Image
fx, src, dst = sys.argv[1:]
os.makedirs(dst)
for name in sorted(os.listdir(src)):
    p = np.asarray(Image.open(f"{src}/{name}")).astype(np.float32) / 255
    rgb, a = p[..., :3], p[..., 3]
    peak = rgb.max(-1)
    if fx == "lightning":
        a = peak
        # LE HALO S'ARRETE NET AU PIED (le bas du rectangle du shader, FOOT.y
        # de fx_alpha_bench.gd) : en jeu le sol le cache, ici il se lirait
        # comme une coupe. Fondu sur les 90 px du bas, le coeur blanc garde.
        foot = int(0.62 * p.shape[0])
        ramp = np.ones(p.shape[0], np.float32)
        ramp[foot - 90:foot] = np.linspace(1, 0, 90)
        r = ramp[:, None]
        a = a * (r + (1 - r) * a * a)
    else:
        a = np.maximum(a, peak)
    out = np.zeros_like(p)
    m = a > 0
    out[..., :3][m] = np.clip(rgb[m] / a[m, None], 0, 1)
    out[..., 3] = a
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(f"{dst}/{name}")
PY
  suffix=$([ "$ZOOM" = 1 ] && echo "" || echo "-x$ZOOM")
  ffmpeg -nostdin -v error -y -framerate 60 -i "$tmp/straight/%04d.png" \
    -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16 \
    -vendor apl0 "$OUT/$fx$suffix.mov"
  rm -rf "$tmp"
  echo "$OUT/$fx$suffix.mov"
done
