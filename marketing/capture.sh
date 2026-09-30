#!/usr/bin/env bash
# Les rushes pour l'equipe marketing, filmes dans Godot (Movie Maker), 16:9 1080p.
#   marketing/capture.sh [beat ...]      (sans argument : tout)
# Sort dans marketing/out/raw/<beat>.mp4.
#
# Le cadrage telephone : le jeu rend sur 854x480 (la hauteur d'un Seeker
# couche) agrandi a 1920x1080 — sans ca la camera montre l'ile entiere.
# SANS BORDURE, en 0,0 : une fenetre de 1080 a bordure ne tient pas sous la
# barre des menus, macOS la raccourcit et l'image s'elargit (992x480) — le
# bord droit sortait du film.
# `override.cfg` est lu par Godot au lancement et retire a la fin.
set -euo pipefail
cd "$(dirname "$0")/.."

GODOT=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
OUT=marketing/out/raw
SEED=${SEED:-reef}
mkdir -p "$OUT"

[ -e godot/override.cfg ] && { echo "godot/override.cfg existe deja — une autre capture tourne ?" >&2; exit 1; }
cat > godot/override.cfg <<'CFG'
[display]
window/size/viewport_width=854
window/size/viewport_height=480
window/size/window_width_override=1920
window/size/window_height_override=1080
window/size/mode=0
window/size/borderless=true
window/size/initial_position_type=0
window/size/initial_position=Vector2i(0, 0)
CFG
trap 'rm -f godot/override.cfg' EXIT

shoot() { # name frames scene args...
  local name=$1 frames=$2 scene=$3; shift 3
  local avi; avi=$(mktemp -t "$name").avi
  "$GODOT" --path godot --write-movie "$avi" --fixed-fps 30 --quit-after "$frames" \
    "$scene" -- "$@" 2>&1 | grep -E "SCRIPT ERROR|WARNING: \[trailer\]|Done recording" || true
  ffmpeg -nostdin -v error -y -i "$avi" -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p \
    -c:a aac -b:a 192k -movflags +faststart "$OUT/$name.mp4"
  rm -f "$avi" "${avi%.avi}"
  echo "$OUT/$name.mp4"
}

TB=scenes/bench/trailer_bench.tscn
all="pvp-duel pvp-zap pvp-lightning pvp-bloop pvp-shove pvp-bombshove pvp-drown solo-dig solo-explosions solo-chest raid-attack raid-defend"
for b in ${@:-$all}; do
  case $b in
    pvp-duel)        shoot $b 440 $TB --clean --names --hand --seed="$SEED" --beat=duel ;;
    pvp-zap)         shoot $b 190 $TB --clean --names --seed="$SEED" --beat=zap ;;
    pvp-lightning)   shoot $b 240 $TB --clean --names --hand --seed="$SEED" --beat=lightning ;;
    pvp-bloop)       shoot $b 270 $TB --clean --names --hand --seed="$SEED" --beat=bloop ;;
    pvp-shove)       shoot $b 170 $TB --clean --names --hand --seed="$SEED" --beat=shove ;;
    pvp-bombshove)   shoot $b 200 $TB --clean --names --hand --seed="$SEED" --beat=bombshove ;;
    pvp-drown)       shoot $b 250 $TB --clean --names --hand --seed="$SEED" --beat=drown ;;
    solo-dig)        shoot $b 1200 $TB --clean --seed="$SEED" --auto=60 --auto-every=0.3 --hand ;;
    solo-explosions) shoot $b 1200 $TB --clean --seed=${BOMB_SEED:-mines} --auto=80 --auto-every=0.3 --hunt --hand ;;
    solo-chest)      shoot $b 170 $TB --clean --hand --seed="$SEED" --beat=chest ;;
    raid-attack)     shoot $b 540 scenes/bench/raid_film_bench.tscn --side=attack ;;
    raid-defend)     shoot $b 540 scenes/bench/raid_film_bench.tscn --side=defend ;;
    *) echo "beat inconnu : $b" >&2; exit 1 ;;
  esac
done
