#!/usr/bin/env bash
# APK RELEASE POUR LE SOLANA DAPP STORE (Seeker).
#
#   tools/release-dappstore.sh            # construit HEAD
#   tools/release-dappstore.sh <commit>   # ou un commit precis
#
# Construit depuis un worktree propre, jamais depuis le dossier de travail :
# une autre session y ecrit souvent du code pas encore deploye, et un APK qui
# appelle une route absente de la prod est casse chez le joueur.
#
# La cle vit HORS du repo, dans ~/.config/rabbit-royale/ (keystore + mot de
# passe dans release-signing.env). La perdre = ne plus jamais pouvoir mettre
# l'app a jour sur le store. Ne jamais la reutiliser pour Google Play.
#
# Avant chaque nouvelle version : monter version/code (et version/name) dans
# godot/export_presets.cfg, commiter, puis lancer ce script. Le store refuse
# un versionCode deja publie.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
REV=${1:-HEAD}
SIGNING=~/.config/rabbit-royale/release-signing.env
GODOT=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
BT=$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)

[ -f "$SIGNING" ] || { echo "pas de $SIGNING : la cle de release manque" >&2; exit 1; }
set -a; . "$SIGNING"; set +a

WT=$(mktemp -d)/rr-release
git -C "$REPO" worktree add --detach "$WT" "$REV" >/dev/null
trap 'git -C "$REPO" worktree remove --force "$WT"' EXIT

# Ce que git ignore mais que l'export Android exige : le gabarit gradle, les
# AAR des plugins, la config Firebase, le cache d'import.
cd "$REPO/godot"
rsync -a --exclude 'build/build/' --exclude '.gradle/' android/ "$WT/godot/android/"
rsync -aR addons/RabbitFirebase/bin addons/RabbitMWA/bin \
	plugin-src/firebase/google-services.json .godot "$WT/godot/"

NAME=$(sed -n 's/^version\/name="\(.*\)"/\1/p' "$WT/godot/export_presets.cfg" | head -1)
CODE=$(sed -n 's/^version\/code=//p' "$WT/godot/export_presets.cfg" | head -1)
OUT="$REPO/dist/rabbit-royale-$NAME-$CODE.apk"
# La coque se presente au manifeste avec SHELL (godot/scripts/boot.gd) : s'il
# ment sur le versionCode, elle prend des packs qu'elle ne sait pas faire
# tourner, ou refuse ceux qu'elle sait.
SHELL_CODE=$(sed -n 's/^const SHELL := \([0-9]*\).*/\1/p' "$WT/godot/scripts/boot.gd")
[ "$SHELL_CODE" = "$CODE" ] \
	|| { echo "boot.gd SHELL=$SHELL_CODE mais version/code=$CODE" >&2; exit 1; }
mkdir -p "$REPO/dist"

cd "$WT/godot"
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
"$GODOT" --headless --path . --export-release "Android" "$OUT" 2>&1 | grep -E "ERROR|DONE.*export" || true

# Les trois refus du store, verifies avant de soumettre.
"$BT/apksigner" verify --print-certs "$OUT" | grep -q "CN=Rabbit Royale" \
	|| { echo "APK pas signe avec la cle de release" >&2; exit 1; }
if "$BT/aapt2" dump badging "$OUT" | grep -q application-debuggable; then
	echo "APK debuggable : c'est un build debug" >&2; exit 1
fi
"$BT/aapt2" dump badging "$OUT" | grep -E "^package|targetSdk"
echo "OK $(git -C "$REPO" rev-parse --short "$REV") -> $OUT"
