# Ep01 — Prompts vidéo

**Image-to-video** : on part de l'image validée du plan et on décrit
**uniquement le mouvement**. Ne pas redécrire la scène — l'image la porte ;
la redécrire fait dériver le rendu.

```
CAMÉRA    Fixe sur A et B. Shake court et décroissant sur C, à l'impact.
DURÉE     Générer 1s de plus que le besoin, couper au montage.
INTERDITS Pas de morphing, pas de changement de couleur, rien de nouveau
          dans le décor, pas de boucle.
```

## SHOT A — La joie · 1s

```
Le lapin tient la carotte brandie, immobile, radieux. Mouvement minimal :
une respiration, les oreilles qui frémissent une fois. Expression fixe,
yeux fermés. Caméra fixe. Rien d'autre ne bouge.
```
Piège : l'outil voudra le faire sauter ou danser. **Non.** Une image fixe
avec un zoom de 2% au montage suffit si la génération dérive.

## SHOT B — Le bruit · 1s

```
Une lumière orange envahit le côté droit du plan en une frame. Au même
instant les oreilles se dressent, les yeux s'ouvrent grand, la tête amorce
une rotation vers la droite — coupée avant la fin du mouvement. Corps et
bras immobiles, carotte brandie. Caméra fixe.
```
Piège : ⚠️ aucun feu dans le cadre. La tête **ne finit pas** sa rotation.

## SHOT C — Rekt · 2s

```
Au fond à droite l'explosion se développe : boule de feu qui monte, onde de
choc au sol, le second lapin projeté en arrière en arc bas, deux tours sur
lui-même, retombe plus loin, débris, fumée qui persiste. Au premier plan
notre lapin reste parfaitement immobile, de dos, carotte brandie. Léger
tremblement de caméra à l'impact, qui décroît.
```
Piège : le lapin au premier plan **ne bouge pas**. Son absence de réaction
est le gag.
Réf. commit `4677b12` : arc bas, deux tours en arrière, rebond élastique.

## Si ça dérive

1. Raccourcir le prompt — garder la première phrase.
2. Générer 1s et rallonger au ralenti.
3. Découper en deux générations, recoller.

## Ce qui ne se génère pas

Le gameplay (`0:05 → 0:13`) se **capture** : story `FX/Bomb walk` (`c0780a6`)
et `HUD/Carrot burst`. Un gameplay généré ment sur le produit et ça se voit.
