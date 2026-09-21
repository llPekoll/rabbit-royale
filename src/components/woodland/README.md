# Woodland

Kit React pour les overlays du jeu, inspiré de la référence bois / feuillage.
Voir **Design Kit / Woodland / Collection** dans Storybook (`bun run storybook`).

```tsx
import { WoodlandPanel, WoodlandButton, WoodlandMeter } from '@/components/woodland';

<WoodlandPanel title="Le terrier">
  <WoodlandMeter label="Énergie" value={72} />
  <WoodlandButton tone="gold" icon="garden" onClick={explore}>
    Explorer
  </WoodlandButton>
</WoodlandPanel>
```

Composants : Button (gold, wood, green, danger), Panel, Icon, Meter,
Toggle contrôlé, Slot sélectionnable et Notice (status / alert).
Les styles sont importés avec le kit et isolés par le préfixe `wl-`.
Les boutons conservent les props HTML natives, dont disabled et aria-label.
Pour un bouton sans texte, fournir aria-label.

Palette : encre #352011, écorce #6c3e22, parchemin #ffe4a1,
or #ffc83d, feuille #87bd3a, alerte #d84c39. Typographie : police pixel du jeu.
Réserver l’or à l’action principale et le rouge aux dangers.

Réutilise les assets transparents existants : plank.webp (3-slice horizontal),
leaf-frame.webp (9-slice) et ui/icons. Les libellés restent en HTML pour la
traduction et l’accessibilité. Le JPEG de référence n’est pas utilisé comme
atlas : son damier et ses textes sont intégrés à l’image.

Cette première version concerne les interfaces React, pas les contrôles Pixi.
Elle est disponible à l’import sans remplacer les écrans actuels.
Les boutons utilisent uniquement la planche illustrée comme fond, sans
rectangle coloré superposé. Le texte des onglets sélectionnés devient doré.
La prop tone est conservée pour permettre de futurs sprites dédiés.

## Boutique et récompenses

Story **Design Kit / Woodland / Shop And Rewards** :

- `WoodlandTabs` : `tabs` (id, label, icon, content), `value`, `onChange`,
  `orientation="horizontal" | "vertical"`. Navigation flèches, Home et End,
  panneaux associés et sélection contrôlée.
- `WoodlandNotification` : `title`, `icon`, contenu descriptif, `onOpen`
  optionnel et `actionLabel` pour nommer l’action.
- `WoodlandHarvest` : bouton de récolte, `tone="green" | "gold" | "danger" | "blue"`,
  props natives dont `onClick` et `disabled`.
- `WoodlandNotice` : message passif, tons green, gold, danger, blue et wood.
  Le ton wood affiche la carotte ; danger est annoncé comme alerte.

Les bandeaux utilisent quatre images complètes notice-*.webp, reconstruites
d’après la référence : doré, vert, rouge et bleu. Aucun filtre coloré ni
rectangle ne se superpose au bois. Les extrémités restent fixes en 3-slice.
Les exemples simulent les événements ; ils ne modifient pas les stocks du jeu.

## Notifications illustrées compactes

`WoodlandParchmentToast` propose `variant="quest" | "achievement"`, `title`,
`description`, `onOpen` et `actionLabel`. Voir la story **Parchment Notifications**.
Deux PNG transparents dédiés dans `public/assets/ui/notification-*.png` :
parchemin avec étoile et flèche, ou étoiles de succès et petites feuilles, sans animal.
Les images sont générées ; les textes restent en HTML. Utiliser un titre court
et une description d’une ligne. Le format conserve les proportions de l’art,
avec une largeur maximale de 320px. Pour des messages longs, utiliser
`WoodlandNotification`, qui grandit avec son contenu.

## Pastilles de coin

`WoodlandCornerBadge` accepte `value` (nombre ou '!'), `shape` (round ou square)
et `attached`. Les compteurs supérieurs à 99 affichent 99+. Pour une pastille
attachée, entourer le bouton et la pastille avec `.wl-corner-anchor`.
La pastille est décorative ; inclure son sens dans l’aria-label du bouton.
Voir **Badges And Banners** pour les deux formes et les exemples au coin.

## Le runtime : remplacer le 9-slice dans le jeu

`woodland/index.tsx` est le kit — les composants qu'on écrit à neuf, montrés
dans les stories. `woodland/runtime.tsx` est autre chose : la couche qui
remplace l'ancien chrome arcade **dans les écrans déjà livrés**, sans les
réécrire.

Les écrans importaient `NineSlicePanel`, `NineSliceButton` et `CloseButton` de
`@domin8/arcade-kit`. Le runtime exporte `WoodlandSurface`, `WoodlandAction` et
`WoodlandClose` avec les mêmes props, donc chaque fichier ne change que son
import :

```tsx
import { WoodlandSurface as NineSlicePanel } from '@/components/woodland/runtime';
```

Les props de l'ancien kit (`color`, `pixelScale`, `shadowColor`…) sont acceptées
et ignorées : l'art décide de la couleur, plus le `color` du site d'appel. Le
runtime choisit la bonne matière en lisant la `className` déjà présente —
`rr-energy-track` devient une gouttière, `rr-hub-btn` une planche, un
`role="tab"` un onglet doré. Aucun écran n'a eu besoin d'une prop en plus.

`runtime.css` se charge **après** les feuilles de mise en page, dans
`main.tsx` et dans `.storybook/preview.ts` : il ne reprend que la matière
(fond, bordure, ombre) et laisse la taille et le comportement aux règles
existantes.

La légende de l'île (`.rr-caption`) est la seule surface qui ne prend PAS le
bois : c'est une narration posée sur le plateau, donc une pastille sombre
translucide à coins ronds (`.wl-runtime-caption`), texte blanc. Une planche à
cet endroit se battait avec la barre d'énergie juste au-dessus et cachait le
terrain. Les variantes dorées passent par `--wl-runtime-ink`, pas par `color` :
le texte est dans un `span` que le runtime peint en `!important`.

Le bevel : l'ancien bouton du kit réservait 6 pixels de lèvre sous son label, et
`px-dialogs.css` ajoutait son inset par-dessus. La planche Woodland est plate,
donc `--rr-btn-bevel` vaut désormais `0px` — sinon le label monte et les
jambages se font couper par le bas de la planche.

Vérification : `node tools/verify-woodland.mjs` (Storybook sur 6007) prend les
captures et compte ce qui reste d'ancien chrome. `legacy: 0` partout.

## Le menu son prend l'interrupteur du kit

Les deux bus du panneau son (`sound-button.tsx`) étaient des planches qui
épelaient ON ou OFF. Ce sont désormais des `WoodlandToggle` : un interrupteur
dont le bouton glisse, vert à droite quand c'est allumé, sourd et creux à
gauche sinon — l'état est dans la lumière, sans mot à traduire. `t.sound.on`
et `t.sound.off` ne servent donc plus.

Le vrai défaut du panneau n'était pas sa couleur : quatre rangées prétendaient
avoir la même forme (nom à gauche, contrôle à droite) alors que leurs contrôles
allaient d'une pastille de 14px à une planche large comme la moitié du panneau.
Rien ne s'alignait. Les trois réglages partagent donc une gouttière,
`--rr-sound-gutter`, et chaque rangée est une grille à deux colonnes plutôt
qu'un `space-between` où chaque contrôle décide de sa largeur. Le panneau passe
à 216px : c'est ce qu'il faut pour que le rail du volume tienne dans la même
gouttière que les interrupteurs.

Deux pièges rencontrés, et ce qu'ils imposent :

- La teinte du libellé vient de `--wl-runtime-ink`, que `runtime.css` impose à
  tout descendant de la surface. Inutile de peindre le texte ici : ce panneau
  est en parchemin, pas en terre.
- `.wl-runtime-action` pose sa taille en `!important` et se charge après
  `globals.css`, donc rétrécir la planche INSTALL demande le même poids. La
  planche garde son art : c'est un `border-image` à caps de 25px, elle ne
  rapetisse pas vraiment en dessous d'une certaine largeur.

Le rail du volume est remonté de 3px dans sa rangée (`transform`). Mesuré, il
était géométriquement centré — mais le libellé bitmap à côté a son centre
optique au-dessus du milieu de sa boîte, donc un rail centré pend sous son mot.
Le décalage est sur l'input et non sur la piste, parce que WebKit ignore les
marges sur `::-webkit-slider-runnable-track`.
