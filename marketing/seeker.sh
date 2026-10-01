#!/usr/bin/env bash
# LA VIDEO SEEKER (Solana Mobile) — le vrai jeu, du demarrage a une partie en
# ligne, joue par un doigt. Ecran du Seeker couche : 890x400, rendu en
# 1780x800 puis agrandi a 2670x1200 au montage.
#   marketing/seeker.sh [secondes]          (defaut 150)
# Sort marketing/out/seeker/raw/game.mp4 et game.log (les reperes [film]).
#   RAW=marketing/out/x/raw NOMUSIC=1 marketing/seeker.sh   (le preview X :
#   bruitages seuls, la musique est posee au montage)
#
# Il faut un rr-ws LOCAL avec la scene : RR_STAGE=1 WS_PORT=3012 (lance ici
# s'il ne tourne pas) et la base locale. Un invite neuf, un user:// neuf
# (config/custom_user_dir) : la vraie session de ce Mac n'est ni lue ni ecrite.
set -euo pipefail
cd "$(dirname "$0")/.."

GODOT=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
SECS=${1:-150}
OUT=${RAW:-marketing/out/seeker/raw}
ORACLE=$(mktemp -d -t rr-oracle)
mkdir -p "$OUT"

if ! lsof -ti tcp:3012 -sTCP:LISTEN >/dev/null; then
  RR_STAGE=1 WS_PORT=3012 bun run server/index.ts > "$OUT/server.log" 2>&1 &
  for _ in $(seq 1 40); do lsof -ti tcp:3012 -sTCP:LISTEN >/dev/null && break; sleep 0.5; done
fi
bun run marketing/seeker/oracle.ts "$ORACLE" > "$OUT/oracle.log" 2>&1 &
ORACLE_PID=$!

[ -e godot/override.cfg ] && { echo "godot/override.cfg existe deja — une autre capture tourne ?" >&2; exit 1; }
cat > godot/override.cfg <<'CFG'
[application]
config/use_custom_user_dir=true
config/custom_user_dir_name="rabbit-royale-film"
[display]
window/size/viewport_width=890
window/size/viewport_height=400
window/size/window_width_override=1780
window/size/window_height_override=800
window/size/mode=0
window/size/borderless=true
window/size/initial_position_type=0
window/size/initial_position=Vector2i(0, 0)
CFG
trap 'rm -f godot/override.cfg; kill $ORACLE_PID 2>/dev/null; rm -rf "$ORACLE"' EXIT
rm -rf "$HOME/Library/Application Support/rabbit-royale-film"
sleep 2

avi=$(mktemp -t seeker).avi
"$GODOT" --path godot --write-movie "$avi" --fixed-fps 30 --quit-after $((SECS * 30)) \
  scenes/demo/seeker_film.tscn -- --server=http://localhost:3012 --token=film --doorstep \
  --oracle="$ORACLE" ${NOMUSIC:+--no-music} > "$OUT/game.log" 2>&1 || true
grep -E "\[film\]|SCRIPT ERROR" "$OUT/game.log" || true
ffmpeg -nostdin -v error -y -i "$avi" -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 192k "$OUT/game.mp4"
rm -f "$avi" "${avi%.avi}"
echo "$OUT/game.mp4"
