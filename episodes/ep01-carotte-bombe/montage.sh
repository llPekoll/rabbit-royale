#!/usr/bin/env bash
# Montage final de l'ep01, carre 960, 30 i/s, AAC. Aucune generation, gratuit.
#
#   episodes/ep01-carotte-bombe/capture.sh     # filme le gameplay dans Godot
#   episodes/ep01-carotte-bombe/montage.sh     # intro HQ + gameplay + fin
#
# CUTS="dig:2.6:5.0 ..." : les plans de gameplay, « sequence:debut:duree ».
# Les images (iris en crane de lapin, carte de fin) viennent de cards.py.
set -euo pipefail
cd "$(dirname "$0")/../.."

EP=episodes/ep01-carotte-bombe
OUT=$EP/shots/out
GP=$EP/gameplay
SND=godot/assets/sound
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

CUTS=${CUTS:-"dig:2.6:5.0 lightning:1.0:3.8 bloop:1.0:4.8 drown:1.0:4.4"}
SWIPE=0.4      # le passage HQ -> jeu
IRIS=36        # images de l'iris, a la fin du dernier plan de jeu
END_S=5.0      # la carte de fin

V="fps=30,format=yuv420p,setsar=1"
A="aresample=48000,aformat=channel_layouts=stereo"
ENC=(-c:v libx264 -crf 16 -c:a aac -b:a 192k)
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
calc() { python3 -c "print($1)"; }

# 1. L'INTRO HQ et son mix : les sons du jeu, cales a l'image. Un seul son
#    quand il arrache la carotte (le « coin » a la sortie, pas de carillon
#    derriere) ; silence net sur le
#    gros plan de reaction.
ffmpeg -nostdin -v error -y -i "$OUT/for Peko.mp4" \
  -i $SND/music_island.mp3 -i $SND/hop.mp3 -i $SND/hop.mp3 -i $SND/coin.mp3 \
  -i $SND/hop.mp3 -i $SND/hop.mp3 -i $SND/explosion.mp3 -i $SND/die.mp3 \
  -f lavfi -t 6.93 -i anullsrc=r=48000:cl=stereo \
  -filter_complex "
[0:v]scale=960:960,$V[v];
[1]atrim=0:3.8,afade=t=in:d=0.2,afade=t=out:st=3.72:d=0.08,volume=-16dB[mus];
[2]volume=8dB,adelay=150|150[h1];
[3]volume=8dB,adelay=450|450[h2];
[4]volume=-1dB,adelay=1750|1750[coin];
[5]volume=4dB,adelay=3150|3150[h3];
[6]volume=4dB,adelay=3550|3550[h4];
[7]atrim=0:0.45,afade=t=out:st=0.42:d=0.03,adelay=3800|3800[boom];
[8]volume=-2dB,adelay=6150|6150[die];
[9][mus][h1][h2][coin][h3][h4][boom][die]amix=inputs=9:normalize=0:duration=first,alimiter=limit=0.9,$A[a]" \
  -map "[v]" -map "[a]" "${ENC[@]}" "$TMP/hq.mp4"

# 2. LE JEU : les plans bout a bout, le son du jeu remonte (il est mixe bas).
i=0; list=""
for cut in $CUTS; do
  IFS=: read -r beat start len <<<"$cut"
  i=$((i + 1))
  if [[ $beat == bloop ]]; then
    # Le bloop n'a pas de son a lui quand l'encre tache l'ecran : un « die ».
    ms=$(calc "round(max(0, 3.3 - $start) * 1000)")
    ffmpeg -nostdin -v error -y -ss "$start" -t "$len" -i "$GP/$beat.mp4" -i "$SND/die.mp3" \
      -filter_complex "[0:v]scale=960:960:flags=lanczos,$V[v];[0:a]volume=12dB[g];[1:a]volume=2dB,adelay=$ms|$ms[x];[g][x]amix=inputs=2:normalize=0:duration=first,$A[a]" \
      -map "[v]" -map "[a]" "${ENC[@]}" "$TMP/gp$i.mp4"
  else
    ffmpeg -nostdin -v error -y -ss "$start" -t "$len" -i "$GP/$beat.mp4" \
      -vf "scale=960:960:flags=lanczos,$V" -af "volume=12dB,$A" "${ENC[@]}" "$TMP/gp$i.mp4"
  fi
  list+="file '$TMP/gp$i.mp4'"$'\n'
done
printf "%s" "$list" > "$TMP/gp.txt"
ffmpeg -nostdin -v error -y -f concat -safe 0 -i "$TMP/gp.txt" -c copy "$TMP/gp-raw.mp4"

# La musique du jeu dessous, basse ; puis l'IRIS EN CRANE DE LAPIN (RR-Skull) qui ferme le dernier plan.
python3 $EP/cards.py iris "$TMP/iris" $IRIS
gpd=$(dur "$TMP/gp-raw.mp4")
iris_at=$(calc "$gpd - $IRIS / 30")
ffmpeg -nostdin -v error -y -i "$TMP/gp-raw.mp4" -stream_loop -1 -i $SND/music_island.mp3 \
  -framerate 30 -i "$TMP/iris/iris%03d.png" \
  -f lavfi -i "color=black:s=960x960:r=30:d=$gpd" \
  -filter_complex "
[2:v]format=gray,tpad=start_duration=$iris_at:start_mode=add:color=white,setpts=PTS-STARTPTS[m];
[0:v]format=gbrp[g];[3:v]format=gbrp[k];[m]format=gbrp[mm];
[k][g][mm]maskedmerge,$V[v];
[1:a]atrim=0:$gpd,volume=-15dB,afade=t=in:d=0.4,afade=t=out:st=$(calc "$gpd - 0.9"):d=0.9[mus];
[0:a][mus]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.9,$A[a]" \
  -map "[v]" -map "[a]" -t "$gpd" "${ENC[@]}" "$TMP/gp.mp4"

# 3. LE SWIPE HQ -> jeu, flou de mouvement horizontal pendant qu'il glisse,
#    et un souffle synthetise dessus.
hqd=$(dur "$TMP/hq.mp4")
off=$(calc "$hqd - $SWIPE")
wms=$(calc "round(($hqd - $SWIPE - 0.1) * 1000)")
ffmpeg -nostdin -v error -y -i "$TMP/hq.mp4" -i "$TMP/gp.mp4" \
  -f lavfi -t 0.6 -i "anoisesrc=color=pink:amplitude=0.6:r=48000" \
  -filter_complex "
[0:v][1:v]xfade=transition=slideleft:duration=$SWIPE:offset=$off,gblur=sigma=14:sigmaV=0:enable='between(t,$off,$off+$SWIPE)',$V[v];
[0:a][1:a]acrossfade=d=$SWIPE[x];
[2:a]highpass=f=400,lowpass=f=5000,afade=t=in:d=0.25,afade=t=out:st=0.3:d=0.3,volume=-10dB,$A,adelay=$wms|$wms[w];
[x][w]amix=inputs=2:normalize=0:duration=first[a]" \
  -map "[v]" -map "[a]" "${ENC[@]}" "$TMP/body.mp4"

# 4. LA CARTE DE FIN, fond noir, le telephone qui monte ; un carillon.
python3 $EP/cards.py end "$TMP/end" $END_S
ffmpeg -nostdin -v error -y -framerate 30 -i "$TMP/end/end%03d.png" -i $SND/chime.mp3 \
  -filter_complex "[0:v]$V[v];[1:a]volume=8dB,adelay=150|150,apad,atrim=0:$END_S,$A[a]" \
  -map "[v]" -map "[a]" -t $END_S "${ENC[@]}" "$TMP/end.mp4"

ffmpeg -nostdin -v error -y -i "$TMP/body.mp4" -i "$TMP/end.mp4" \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k \
  -movflags +faststart "$EP/ep01-x.mp4"
echo "$EP/ep01-x.mp4 ($(dur "$EP/ep01-x.mp4") s)"
