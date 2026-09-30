# Ep02 — Le 50/50

**Durée** ~25 s · **Cible** X (carré) + Reels (9:16) · **Ton** meme, sans un mot

## L'idée

Shiro est seul devant deux cases marquées `?`, entourées de cases déjà révélées avec des chiffres. Il réfléchit. Degen arrive en sautillant, regarde Shiro hésiter et passe quand même. Shiro le suit du regard ; on recoupe sur Degen, qui pose la patte sur la bombe : explosion et éjection fulgurantes. Shiro marche alors sur l'autre case. Le `?` disparaît progressivement sous son pas, puis il continue jusqu'au coffre et l'ouvre. On découvre son visage ravi dans la lumière dorée.

C'est le cœur du jeu (un démineur à plusieurs) et c'est la phrase du codex :
_« The island does not kill the unlucky. It kills the hurried. »_

---

## Partie HQ (0:00 → 0:08) — nouveau découpage, cible 8 s

**La v1 est rejetée.** Refaire la composition et le prompt vidéo avant toute nouvelle génération. Le timing ci-dessous est une proposition de montage : le regard de Shiro précède l'explosion, l'éjection est très rapide et la marche jusqu'au coffre reste visible.

### Références à préparer

| Référence | Source | Rôle dans la génération |
| --------- | ------ | ---------------------- |
| **Shiro + style** | `../ep01-carotte-bombe/shots/cool/pixel3d-clean.png` | Même lapin blanc et même rendu pixel 3D que l'ep01, ventre uni. Shiro a les pattes vides dans cet épisode. |
| **Degen** | `shots/refs/degen-pixel3d-v1.png` (créée depuis le sprite brun) | Fixer le lapin brun dans le même rendu que Shiro, avec ses proportions et ses couleurs propres. |
| **Coffre fermé et ouvert** | `shots/refs/chest-pixel3d-v1.png` (créée depuis le coffre actuel du jeu) | Deux vues du même coffre : fermé pour l'approche, ouvert pour la récompense. Conserver sa silhouette et ses couleurs ; ajouter la lumière dorée à l'ouverture. |
| **Décor / composition** | À refaire ; `shots/refs/composition-v1.png` est obsolète | Shiro seul devant deux `?`, sur une grille d'herbe continue avec des chiffres sur les cases latérales déjà révélées. Coffre quelques pas derrière les deux cases. Degen hors champ au départ. |

Les planches de Degen et du coffre reprennent le rendu de la référence Shiro. La planche du coffre utilise le sprite fermé comme base ; la vue ouverte est une interprétation pour le film. Les prompts sont conservés dans `shots/PROMPTS-REFS.md`. Le repère bombe `×1` et son accolade sont ajoutés au montage.

**Géographie lisible dès la première image :** un plateau de démineur en herbe, continu et au même niveau. Deux cases inconnues côte à côte devant Shiro ; sur les côtés, des cases révélées portent des chiffres. Le coffre se trouve quelques pas derrière les deux `?`. Les chiffres doivent former une situation cohérente avec une seule bombe parmi les deux cases. Shiro doit réellement traverser la case sûre puis rejoindre le coffre à l'image. **En montage**, le repère bombe `×1` et son accolade restent prévus.

| Temps       | Plan | Action | Texte (montage) |
| ----------- | ---- | ------ | --------------- |
| 0 → 1,2 s | **Large**, en plongée, **trois quarts** | **Shiro seul** devant les deux `?`. Il réfléchit : regarde les chiffres sur les côtés, puis les deux choix, une patte hésitante. Le coffre est visible au-delà. | `left or right?` + repère bombe `×1` |
| 1,2 → 2,4 s | **Même cadre** | Degen **entre en sautillant**, regarde Shiro hésiter, puis le dépasse quand même avec assurance. Son regard vers Shiro doit être lisible. | — |
| 2,4 → 2,9 s | **Plan serré sur Shiro** | Shiro tourne la tête et **regarde Degen passer**, avant que la bombe explose. | — |
| 2,9 → 3,5 s | **Retour sur Degen et la case gauche** | Sa patte touche le `?` : **BOUM, éjection fulgurante**, il file hors cadre avec une brève traînée de fumée. Impact et départ en une fraction de seconde, aucun long vol flottant. | — |
| 3,5 → 6,5 s | **Plan moyen de trois quarts, suivi de Shiro** | On retrouve Shiro **encore avant les cases**. Il avance et marche sur le `?` de droite. Le symbole **s'efface doucement pendant son pas**, la case reste intacte. On le voit poursuivre sa marche sur le sol jusqu'au coffre, puis poser ses pattes sur le couvercle. | — |
| 6,5 → 8 s | **Plan rapproché de face**, depuis le coffre | Shiro ouvre le coffre. La lumière dorée monte sur **son visage ravi**, bien visible ; on tient brièvement cette expression pour finir. | — |

**Carte de l'île** (montage, 2,5 s, blanc sur noir, Avenir Next) :
_The island does not kill the unlucky._
_It kills the hurried._

## Partie jeu (filmée dans Godot)

| Contenu                                              | Séquence   |
| ---------------------------------------------------- | ---------- |
| Il creuse, les chiffres apparaissent                 | `dig`      |
| Un lapin marche sur une bombe, renvoyé d'où il vient | `bomb` ✅  |
| Un coffre qui s'ouvre                                | `chest` ✅ |

Puis l'iris en crâne et la carte de fin, comme l'ep01.

## Post

- `left or right? 🐇💣`
- `he had a 50/50. his friend had an opinion.`

## Checklist

- [x] Planche pixel 3D de Degen (imagegen, trois angles, référence pour toute la série)
- [x] Planche pixel 3D du coffre du jeu, fermé + ouvert, dans le même rendu que Shiro
- [ ] Nouvelle composition : Shiro seul, deux `?`, cases chiffrées sur les côtés (remplace `composition-v1.png`)
- [ ] Déclinaison de la composition en 9:16
- [x] Première intro Seedance générée : `shots/out/hq2-ep02-v1.mp4` — **rejetée**
- [ ] Refaire le prompt vidéo d'après ce découpage ; `shots/VIDEO-PROMPT.txt` décrit encore la v1 rejetée
- [ ] Nouvelle intro à générer après reprise des références
- [x] Séquences `bomb` et `chest` dans `trailer_bench` (`capture.sh bomb chest`)
- [ ] Montage carré + 9:16
