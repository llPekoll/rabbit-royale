# Gabarits — tuiles isométriques

Fichiers de base pour redessiner les tuiles du jeu. **Aucun n'est de l'art** :
ce sont des cages vides, exactes au pixel, à peindre dedans.

Régénérer : `python3 tools/gen_gabarits.py` (écrase tout ce dossier).

> ⚠️ Le générateur **écrase**. Peins dans un dossier à toi
> (`art-source/tuiles/`), pas ici, ou une régénération effacera ton travail.

## Les chiffres

| | |
|---|---|
| Losange | **44 × 24** px |
| Palier (falaise) | **18** px |
| Ancre | centre exact, `(0.5, 0.5)` |

Ils viennent de `src/config/gridConfig.ts` et valent aussi pour le terrier
depuis qu'on a aligné les deux. `test/gabarit-metrics.test.ts` casse si le
code et ces gabarits divergent.

## Les couleurs de repère

Toutes en **alpha 255**, et choisies pour n'exister nulle part dans la palette
du jeu — « sélectionner par couleur » puis supprimer marche dans n'importe quel
éditeur, sans rogner l'art.

| Couleur | Hex | Sens |
|---|---|---|
| 🟣 magenta | `#FF00FF` | le bord du losange — l'art doit **l'atteindre**, sans le dépasser |
| 🔵 cyan | `#00FFFF` | l'ancre / la ligne de sol où posent les pieds |
| 🟡 jaune | `#FFE600` | la bande de falaise de 18 px |
| ⚪ gris | `#6E6E6E` | boîte englobante et subdivisions |

Le reste du fichier est **transparent** : mets un calque sous le gabarit et
peins, les repères restent visibles par-dessus.

## Rangement

```
00-reference/   planche-controle    → un plateau à 2 niveaux, pour juger en contexte
                planche-contact-sol → les 16 tuiles côte à côte, nommées
01-sol/         les 16 tuiles du blob set
02-falaise/     falaise-se, -sw, -double
03-props/       gabarits d'ancrage : petit / moyen / grand
```

Chaque dossier a un `1x/` et un `4x/`.

## Les noms des tuiles de sol

Le nom dit **quels voisins la tuile a**, donc quels bords sont exposés.
`sol-ne.png` = voisin au nord et à l'est, donc les bords **sud et ouest** sont
à dessiner (ils sont tracés en gras sur le gabarit).

`sol-seul.png` est la tuile isolée : les 4 bords sont visibles.
`sol-nesw.png` est la tuile pleine : aucun bord, elle est entourée.

C'est la convention de `src/game/island/autotile.ts`, qui choisit la colonne
d'après ouest/est et la ligne d'après nord/sud.

## Méthode conseillée

1. Ouvre `1x` et travaille à **44×24 réels** si ta tablette le permet.
   Sinon prends le `4x` et réduis en **NEAREST** à la fin — jamais bilinéaire,
   qui transforme un bord net en dégradé de 3 px que le jeu ré-agrandit ensuite.
2. Commence par `sol-nesw` (la tuile pleine) : c'est elle qui fixe la matière
   et la palette. Les 15 autres en découlent.
3. Puis `falaise-se`. Fais un test **à ce moment-là**, pas après 16 tuiles.
4. Vérifie toujours sur `planche-controle` : une tuile qui va bien toute seule
   et mal sur la planche est mauvaise.

## Les trois pièges

- **La falaise fait 18 px pile.** Plus courte, la mer passe entre deux paliers ;
  plus haute, une bande de roche pend sous la plateforme.
- **Une seule source de lumière** pour toutes les tuiles (convention iso :
  haut-gauche). C'est ce qui fait « design cassé » avant même la géométrie.
- **Pas d'antialiasing.** Le rendu est en `scaleMode: 'nearest'` ; un bord
  flou devient une bouillie à l'écran.

## Ce qui n'est pas encore là

Les **props debout** (arbres, lapins, bâtiments) ne se déforment pas en
losange — ils se posent dessus. `03-props/` ne donne que la boîte et la ligne
de sol ; les silhouettes sont à toi.
