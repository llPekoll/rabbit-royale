#!/usr/bin/env bash
# LA FACE PIXEL DES LANGUES AUTRES QUE L'ANGLAIS, reduite a nos mots.
#
# Fusion Pixel 12px (OFL 1.1, https://github.com/TakWolf/fusion-pixel-font)
# fait 7 Mo par variante ; on n'en garde que les caracteres des quatre
# dictionnaires (godot/assets/i18n/*.json, src/i18n/dict/*.ts) plus la
# ponctuation typographique, soit ~140 Ko. A relancer quand une traduction
# ajoute un caractere : un glyphe absent tombe sur la face du systeme.
#
#   tools/subset-fusion-font.sh <dossier ttf 12px proportional> <dossier ttf 10px proportional>
#
# Deux variantes : la latine (« ’ » a sa chasse de lettre) pour fr, pt-BR et vi,
# la zh_hans pour le chinois. Le web prend le 12px ; Godot le 10px, taille
# sur la grille de la face de l'anglais par tools/fusion-godot.py (voir
# godot/scripts/i18n.gd `face`).
#
# Fusion n'a pas les lettres vietnamiennes (U+1EA0-1EF9) : la latine 10px les
# recoit de tools/fusion-vietnamese.py avant le sous-ensemble. La source doit
# etre la version 2026.09.01, celle de toutes les autres lettres.
set -euo pipefail
SRC="${1:?dossier des ttf Fusion Pixel 12px proportional}"
SRC10="${2:?dossier des ttf Fusion Pixel 10px proportional}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHARS="$(mktemp)"
python3 - "$ROOT" "$CHARS" <<'PY'
import json, glob, sys
root, out = sys.argv[1], sys.argv[2]
chars = set(chr(c) for c in range(0x20, 0x7f))
def walk(v):
    if isinstance(v, str): chars.update(v)
    elif isinstance(v, dict):
        for k, x in v.items(): chars.update(k); walk(x)
    elif isinstance(v, list):
        for x in v: walk(x)
for f in glob.glob(root + '/godot/assets/i18n/*.json'): walk(json.load(open(f)))
chars.update(open(root + '/godot/scripts/i18n.gd').read())
for f in glob.glob(root + '/src/i18n/dict/*.ts'): chars.update(open(f).read())
chars.update("’‘“”«»…–—·•×→←↑↓⚡")
open(out, 'w').write(''.join(sorted(c for c in chars if c.isprintable())))
PY
for v in latin zh_hans; do
  name="$([ "$v" = latin ] && echo latin || echo zh)"
  out="$ROOT/godot/assets/fonts/fusion-pixel-10-rr-$name.ttf"
  src10="$SRC10/fusion-pixel-10px-proportional-$v.ttf"
  if [ "$v" = latin ]; then
    cp "$src10" "$CHARS.latin.ttf"
    src10="$CHARS.latin.ttf"
    uvx --from fonttools --with skia-pathops python "$ROOT/tools/fusion-vietnamese.py" "$src10"
  fi
  uvx --from 'fonttools[woff]' pyftsubset "$src10" \
    --text-file="$CHARS" --layout-features='*' --output-file="$out"
  uvx --from fonttools --with skia-pathops python "$ROOT/tools/fusion-godot.py" "$out"
  # Le meme sous-ensemble pour le web (src/components/pixel-font.tsx).
  uvx --from 'fonttools[woff]' pyftsubset "$SRC/fusion-pixel-12px-proportional-$v.ttf" \
    --text-file="$CHARS" --layout-features='*' --flavor=woff2 \
    --output-file="$ROOT/public/assets/fonts/fusion-pixel-12-rr-$name.woff2"
done
rm -f "$CHARS" "$CHARS.latin.ttf"
ls -la "$ROOT"/godot/assets/fonts/fusion-pixel-10-rr-*.ttf "$ROOT"/public/assets/fonts/fusion-pixel-12-rr-*.woff2
