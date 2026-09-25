#!/usr/bin/env bash
# Filme le gameplay de l'ep01 dans Godot (Movie Maker), hors ligne, carre 1080.
#   episodes/ep01-carotte-bombe/capture.sh [dig|lightning|bloop|drown|bomb|chest ...]
# Sort dans episodes/ep01-carotte-bombe/gameplay/<beat>.mp4.
#
# Le cadrage telephone : le jeu rend sur 480x480 (la hauteur d'un Seeker
# couche, ~400) agrandi a 1080 — sans ca la camera montre l'ile entiere.
# `override.cfg` est lu par Godot au lancement et retire a la fin.
set -euo pipefail
cd "$(dirname "$0")/../.."

GODOT=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
OUT=episodes/ep01-carotte-bombe/gameplay
SEED=${SEED:-reef}
mkdir -p "$OUT"

cat > godot/override.cfg <<'EOF'
[display]
window/size/viewport_width=480
window/size/viewport_height=480
window/size/window_width_override=1080
window/size/window_height_override=1080
window/size/mode=0
EOF
trap 'rm -f godot/override.cfg' EXIT

shoot() { # beat frames scene args...
  local beat=$1 frames=$2 scene=$3; shift 3
  local avi; avi=$(mktemp -t "$beat").avi
  "$GODOT" --path godot --write-movie "$avi" --fixed-fps 30 --quit-after "$frames" \
    "$scene" -- --clean --seed="$SEED" "$@" 2>&1 | grep -E "SCRIPT ERROR|Done recording" || true
  ffmpeg -nostdin -v error -y -i "$avi" -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k "$OUT/$beat.mp4"
  rm -f "$avi" "${avi%.avi}"
  echo "$OUT/$beat.mp4"
}

for beat in "${@:-dig lightning bloop drown}"; do
  for b in $beat; do
    case $b in
      dig)       shoot dig 330 scenes/bench/trailer_bench.tscn --auto=14 --auto-every=0.8 ;;
      lightning) shoot lightning 200 scenes/bench/trailer_bench.tscn --beat=lightning ;;
      bloop)     shoot bloop 230 scenes/bench/trailer_bench.tscn --beat=bloop ;;
      drown)     shoot drown 230 scenes/bench/trailer_bench.tscn --beat=drown ;;
      bomb)      shoot bomb 150 scenes/bench/trailer_bench.tscn --beat=bomb ;;
      chest)     shoot chest 150 scenes/bench/trailer_bench.tscn --beat=chest ;;
      *) echo "beat inconnu : $b" >&2; exit 1 ;;
    esac
  done
done
