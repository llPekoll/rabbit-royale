# Ep01 — Prompts, premières images

Trois images (A, B, C). Chacune est la **première frame** de son plan et la
cible de style pour l'image-to-video.

---

## Le problème à résoudre d'abord : « mon pixel, en HQ »

Un sprite de 32px ne contient pas assez d'information pour définir un
personnage HQ. Ce qui fait que l'image « ressemble à ton pixel », c'est
**quatre choses** — et seulement quatre :

1. **La silhouette** (trapu, ramassé, oreilles courtes et larges)
2. **Les proportions** (tête/corps, taille des oreilles)
3. **La palette** (le brun exact, les verts, l'orange de la carotte)
4. **Le monde** (herbe, île, lumière du jeu)

Tout le reste (texture du poil, détail des yeux, rendu de la lumière) est une
**interprétation** que le générateur invente. On ne la contrôle pas par le
texte ; on la contrôle avec des **images de référence**.

### Les références — dans `refs/`

| Fichier | Sert à |
|---|---|
| `bunny-idle-a/b/c-x16.png` | Silhouette + palette du lapin, frame idle, agrandie ×16 **sans lissage** |
| `bunny-stand-x16.png` | Le lapin **debout, dressé** — la pose du shot A |
| `bunny-fly-x16.png`, `bunny-tumble-x16.png` | En l'air / en vrille — le lapin projeté du shot C |
| `bunny-flat-x16.png` | Écrasé au sol — l'atterrissage, si besoin |
| `bunny-sheet-x4.png` | Toutes les poses — pour choisir la bonne |
| `carrot-sheet-x8.png` | Stades de la carotte ; le shot A utilise le dernier stade |
| `game-screenshot.png` | ⚠️ **À ajouter par toi** — une capture du jeu sur le serveur, plein cadre, une île. C'est la référence de palette et de lumière. |

L'agrandissement est en **nearest-neighbor** exprès : les pixels restent nets,
le générateur voit une forme, pas un flou.

### Comment les brancher, selon l'outil

- **Midjourney** — `--cref refs/bunny-stand-x16.png` pour le personnage,
  `--sref refs/game-screenshot.png` pour le style/palette. `--cw 100` pour
  garder la silhouette au maximum.
- **Flux / SD (ComfyUI, Krea, etc.)** — IP-Adapter sur le sprite ×16
  (poids ~0.6-0.8) + ControlNet **canny ou scribble** sur le même sprite
  pour verrouiller la silhouette. C'est la méthode la plus fidèle.
- **Nano Banana / GPT-image / Ideogram** — joindre les deux images et écrire
  explicitement : *« garde exactement la silhouette, les proportions et les
  couleurs de la référence pixel ; rends-la en haute fidélité »*.
- **Magnific / Krea Enhance** — sur le sprite ×16 directement, créativité
  haute. Rapide, moins contrôlable. Bon pour explorer, pas pour figer.

### Le piège du mot « réaliste »

« Réaliste » au sens photo = poils, yeux humides, museau → **un vrai lapin**,
plus ton personnage. Ce n'est pas ce que tu veux.
La cible est **haute fidélité stylisée** : rendu type figurine / jouet 3D /
illustration HD, avec les formes rondes et franches du pixel conservées.
Dans les prompts ci-dessous c'est formulé comme ça, et « photoréaliste » est
dans les interdits.

---

## IDENTITÉ — bloc à coller dans chaque prompt

```
LAPIN     brun chaud, cerné d'un contour sombre bleu nuit (pas noir pur) ;
          corps trapu et rond, ramassé, pattes à peine marquées ; oreilles
          courtes et larges, arrondies, intérieur rose ; une petite dent
          blanche qui dépasse. Yeux : dans le sprite ce sont deux points
          sombres, presque des fentes — pour le HQ, garder les yeux PETITS
          (pas de grands yeux ronds façon mascotte, ça change le personnage).
          Formes simples et franches, fidèles à la référence pixel jointe.
CAROTTE   racine orange saturé, épaule large et ronde, ombrée de rouge
          sombre sur un côté ; fanes vert vif en TOUFFE RONDE et touffue
          (pas des tiges fines) ; ombre portée bleu nuit au sol.
          Absurdement grosse.
MONDE     île d'herbe verte, sol en légères marches iso ; lumière de jour
          franche ; les ombres sont BLEU NUIT, pas grises ni noires ;
          palette de la capture du jeu jointe.
STYLE     haute fidélité stylisée — rendu type figurine 3D / illustration HD.
          Contraste dur, couleurs poussées, lumière franche. Lisible en
          vignette : formes larges, peu de détail fin.
FORMAT    carré 1:1. Composition centrée, marge haute libre pour du texte.
INTERDITS pas de photoréalisme, pas de poil réaliste, pas de vrai lapin ;
          pas de texte, logo, UI, watermark ; pas de volcan.
```

Note la ligne **« marge haute libre pour du texte »** : les cartes texte vont
dans le tiers supérieur. Si le générateur y met le sujet, on le recadre mal.

---

## SHOT A — La joie · frame 0 ⭐

> [IDENTITÉ] — Plan rapproché poitrine, **face caméra**. Le lapin brandit une
> carotte énorme à deux mains au-dessus de sa tête, bras tendus. Fier,
> radieux, **yeux fermés de bonheur**, oreilles bien droites. Pose de trophée.
> Herbe et île derrière lui, légèrement floue. Lumière chaude de face.
> Joie sincère, sans ironie.

**Réf.** `bunny-stand-x16.png` + `game-screenshot.png`.
**Points durs** : c'est la vignette. Doit se lire à 100px de large. La carotte
doit être ridiculement grosse. **Sincèrement** joyeux — si l'image est déjà
drôle seule, c'est raté.

---

## SHOT B — Le bruit

> Même image que le shot A (image-to-image, pas une génération neuve).
> Un **flash orange chaud** venu du hors-champ droite éclaire violemment le
> côté droit du visage et du corps — bord net, lumière crue, le reste du plan
> garde sa lumière normale. Yeux maintenant **grands ouverts**, oreilles en
> alerte, tête à peine tournée vers la droite. Corps et bras inchangés,
> carotte toujours brandie. Surprise brute, pas de peur.

**Réf.** l'image validée du shot A.
**Points durs** : ⚠️ **aucun feu dans le cadre** — uniquement la lumière.
Denoise bas (0.3-0.45) pour que ce soit *le même* lapin.

---

## SHOT C — Rekt

> [IDENTITÉ] — **Plan large** sur une petite île d'herbe. Au premier plan, en
> bas à gauche, de dos et petit dans le cadre : notre lapin brun, immobile,
> carotte brandie au-dessus de la tête. Au fond à droite : **un second lapin**
> (gris) projeté en l'air par une explosion — arc bas, corps en vrille, pattes
> en l'air. Sous lui, une case éventrée, boule de feu orange, onde de choc au
> sol, fumée noire, débris. Contraste total : premier plan triomphant, fond en
> catastrophe.

**Réf.** `bunny-idle-a-x16.png` (le nôtre) + `bunny-fly-x16.png` / `bunny-tumble-x16.png` (celui qui vole) + `game-screenshot.png` (l'île).
**Points durs** : les deux lapins doivent se lire **d'un coup** — bas-gauche /
haut-droite. Le second est **le même genre de personnage**, autre couleur.
Le nôtre est **de dos**, ne réagit pas.

---

## Ordre

1. **A** — jusqu'à ce que ce soit *ton* lapin. Tout le reste en hérite.
2. **B** — image-to-image depuis A validé.
3. **C** — avec A comme référence de style en plus des sprites.

Trois images. Si A n'est pas bon, ne pas passer à B.
