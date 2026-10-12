# FUSION A LA LIGNE DE D8, pour l'anglais (2026-10-12).
#
#   python3 tools/fusion-tight.py godot/assets/fonts/fusion-pixel-10-rr-latin.ttf \
#       godot/assets/fonts/fusion-pixel-10-rr-latin-tight.ttf
#
# En anglais, d8 dessine seul et ne sait que l'ASCII : le « · », le « ’ »,
# le « — » et un nom accentue tombaient sur les faces du systeme, absentes
# sur le web (tofu). Fusion derriere d8 les dessine, mais Godot prend la
# ligne la plus haute de toute la pile : 1,25 em (9 au-dessus, 1 dessous)
# au lieu du 1 em de d8, et chaque texte anglais sur deux lignes s'ecartait.
# Cette copie garde les dessins et ne change que la ligne : 1 em au-dessus
# de la ligne de base, rien dessous, comme d8. Un chapeau (É) ou un jambage
# (g) en depasse d'un pixel, sans rien pousser.
import sys

from fontTools.ttLib import TTFont

src, dst = sys.argv[1], sys.argv[2]
font = TTFont(src)
em = font["head"].unitsPerEm
hhea = font["hhea"]
hhea.ascent, hhea.descent, hhea.lineGap = em, 0, 0
os2 = font["OS/2"]
os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = em, 0, 0
os2.usWinAscent, os2.usWinDescent = em, 0
font.save(dst)
