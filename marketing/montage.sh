#!/usr/bin/env bash
# Le paquet pour l'equipe marketing, a partir des rushes de capture.sh.
#   marketing/montage.sh
# Sort dans marketing/out/Rabbit-Royale-marketing/ :
#   01-pvp-shiro-vs-kuro.mp4 ... 05-solo-explosions.mp4   (montes, musique dessous)
#   clips/<beat>.mp4                                       (chaque plan seul, effets seuls)
#   sounds/                                                (le dossier son du jeu)
# et le zip a cote.
#
# Le son du jeu sort du Movie Maker vers -40 dB : +14 dB. La musique de l'ile
# passe dessous a -17 dB, sinon elle couvre les effets (ep01, montage.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=marketing/out/raw
PKG=marketing/out/Rabbit-Royale-marketing
SND=godot/assets/sound
rm -rf "$PKG"
mkdir -p "$PKG/clips" "$PKG/sounds"

GAIN=14dB
MUSIC=-17dB
V="-c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p -movflags +faststart"
A="-c:a aac -b:a 192k -ar 48000"

# Le debut de chaque rush : le plateau se pose (et le lapin est deplace a
# 0,8 s pour les plans qui le posent ailleurs) — on coupe avant.
start_of() {
  case $1 in
    pvp-zap|pvp-lightning|pvp-bloop) echo 0.5 ;;
    pvp-*|solo-chest) echo 0.9 ;;
    raid-*) echo 0.2 ;;
    *) echo 0.5 ;;
  esac
}

# La fin d'un plan, quand le pilote s'y enlise (aucun pour l'instant : la
# main de solo-dig va jusqu'au bout).
length_of() {
  case $1 in
    *) echo "" ;;
  esac
}

# 1. Chaque plan seul, coupe, son remonte.
for f in "$RAW"/*.mp4; do
  b=$(basename "$f" .mp4); s=$(start_of "$b")
  ffmpeg -nostdin -v error -y -ss "$s" $(length_of "$b") -i "$f" -af "volume=$GAIN,alimiter=limit=0.95" $V $A "$PKG/clips/$b.mp4"
done

# 2. Un montage : des plans a la suite, coupes francs, la musique dessous.
cut() { # out plan...
  local out=$1; shift
  local inputs=() chain="" n=0 total=0
  for p in "$@"; do
    inputs+=(-i "$PKG/clips/$p.mp4")
    chain+="[$n:v][$n:a]"
    n=$((n + 1))
  done
  total=$(for p in "$@"; do ffprobe -v error -show_entries format=duration -of csv=p=0 "$PKG/clips/$p.mp4"; done | paste -sd+ - | bc)
  local fade; fade=$(echo "$total - 1.2" | bc)
  ffmpeg -nostdin -v error -y "${inputs[@]}" -stream_loop -1 -i "$SND/music_island.mp3" -filter_complex "
    ${chain}concat=n=$n:v=1:a=1[v][g];
    [$n:a]atrim=0:$total,volume=$MUSIC,afade=t=in:d=0.4,afade=t=out:st=$fade:d=1.2[m];
    [g][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]" \
    -map "[v]" -map "[a]" $V $A "$PKG/$out.mp4"
  echo "$PKG/$out.mp4  ($(printf %.0f "$total") s)"
}

cut 01-pvp-shiro-vs-kuro pvp-duel pvp-bombshove pvp-zap pvp-bloop pvp-shove pvp-drown pvp-lightning
cut 02-raid-shiro-raids-kuro raid-attack
cut 03-raid-kuro-raids-shiro raid-defend
cut 04-solo-dig solo-dig solo-chest
cut 05-solo-explosions solo-explosions

# 3. Le dossier son : les mp3 du jeu, sans les .import de Godot.
cp "$SND"/*.mp3 "$PKG/sounds/"

(cd marketing/out && rm -f Rabbit-Royale-marketing.zip && zip -qr Rabbit-Royale-marketing.zip Rabbit-Royale-marketing)
du -sh "$PKG" marketing/out/Rabbit-Royale-marketing.zip
