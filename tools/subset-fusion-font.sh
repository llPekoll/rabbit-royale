#!/usr/bin/env bash
# LA FACE PIXEL DES LANGUES AUTRES QUE L'ANGLAIS, reduite a nos mots.
#
# Fusion Pixel 12px (OFL 1.1, https://github.com/TakWolf/fusion-pixel-font)
# fait 7 Mo par variante ; on n'en garde que les caracteres des quatre
# dictionnaires (godot/assets/i18n/*.json, src/i18n/dict/*.ts) plus la
# ponctuation typographique, soit ~140 Ko. A relancer quand une traduction
# ajoute un caractere : un glyphe absent tombe sur la face du systeme.
#
#   tools/subset-fusion-font.sh <dossier du zip ttf 12px proportional>
#
# Deux variantes : la latine (« ’ » a sa chasse de lettre) pour fr et pt-BR,
# la zh_hans pour le chinois. Voir godot/scripts/i18n.gd `face`.
set -euo pipefail
SRC="${1:?dossier des ttf Fusion Pixel 12px proportional}"
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
  uvx --from 'fonttools[woff]' pyftsubset "$SRC/fusion-pixel-12px-proportional-$v.ttf" \
    --text-file="$CHARS" --layout-features='*' \
    --output-file="$ROOT/godot/assets/fonts/fusion-pixel-12-rr-$name.ttf"
done
rm -f "$CHARS"
ls -la "$ROOT"/godot/assets/fonts/fusion-pixel-12-rr-*.ttf
