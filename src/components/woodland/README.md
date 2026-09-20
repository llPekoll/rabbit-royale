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
