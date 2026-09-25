# Ep02 — Le 50/50

**Durée** ~25 s · **Cible** X (carré) + Reels (9:16) · **Ton** meme, sans un mot

## L'idée

Au démineur, il arrive que les chiffres ne suffisent plus : deux cases, une
bombe, il faut parier. Le héros réfléchit. Degen se moque, passe devant, saute
sans regarder — et prend la bombe. Le héros pose la patte sur l'autre case et
ouvre le coffre, sans un regard pour Degen.

C'est le cœur du jeu (un démineur à plusieurs) et c'est la phrase du codex :
*« The island does not kill the unlucky. It kills the hurried. »*

---

## Partie HQ (0:00 → 0:08) — une génération Seedance, 8 s

| Temps | Plan | Action | Texte (montage) |
|---|---|---|---|
| 0 → 2 s | **Large**, légèrement en plongée | Deux cases d'herbe devant le héros, sa carotte géante sur le dos. Juste derrière, un **coffre** qui brille. Patte levée, il regarde la case gauche, puis la droite. | `left or right?` |
| 2 → 3,5 s | **Même cadre** | Degen entre par la gauche, s'arrête derrière lui, croise les bras, lève les yeux au ciel. | — |
| 3,5 → 5 s | **Même cadre** | Degen le double, saute sur la case de gauche sans regarder. **BOUM** : il est éjecté en arrière, en arc, en gardant sa forme de lapin. | — |
| 5 → 8 s | **Plan serré** sur le héros | Il ne tourne pas la tête. Il pose calmement la patte sur la case de droite, puis ouvre le coffre : lumière dorée sur son visage. | — |

**Carte de l'île** (montage, 2,5 s, blanc sur noir, Avenir Next) :
*The island does not kill the unlucky.*
*It kills the hurried.*

## Partie jeu (filmée dans Godot)

| Contenu | Séquence |
|---|---|
| Il creuse, les chiffres apparaissent | `dig` |
| Un lapin marche sur une bombe, renvoyé d'où il vient | `bomb` ✅ |
| Un coffre qui s'ouvre | `chest` ✅ |

Puis l'iris en crâne et la carte de fin, comme l'ep01.

## Post

- `left or right? 🐇💣`
- `he had a 50/50. his friend had an opinion.`

## Checklist

- [ ] Planche pixel 3D de Degen (une image Grok, référence pour toute la série)
- [ ] Intro Seedance (une génération, 8 s)
- [x] Séquences `bomb` et `chest` dans `trailer_bench` (`capture.sh bomb chest`)
- [ ] Montage carré + 9:16
