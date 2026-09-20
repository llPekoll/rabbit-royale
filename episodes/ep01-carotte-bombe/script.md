# Ep01 — Carotte / bombe

**Durée** ~15s · **Cible** X, vidéo native, muet + texte à l'écran · **Ton** punchy, meme, degen

## L'idée

Un lapin a trouvé une carotte. Il est ravi. À côté, son pote vient de trouver
une bombe. *Rekt.*

La règle du jeu en 4 secondes, sans un mot parlé : **parfois carotte, parfois
bombe — choisis ta case.** Le protagoniste survit ; la menace, c'est ce qu'il
voit. Carotte = bag, bombe = rug. Le gag est déjà un meme crypto, on l'assume.

## Trois règles

1. **La frame 0 est la vignette.** Elle doit se lire dans la grille, sans son,
   à la taille d'un timbre. Pas d'établissement, pas de fondu, pas de logo.
2. **Le texte porte le sens.** 80% des vues sont sans son. Gros, gras,
   2-4 mots par carte, police meme. Chaque carte tient ≥ 0,8s.
3. **Un impact par cut.** Aucun plan sans événement. Si un plan « prépare »,
   on le coupe et on laisse le texte préparer.

---

## Partie HQ (0:00 → 0:05)

### SHOT A — La joie · `0:00 → 0:01` · 1s ⭐ frame 0
**Cadre** Plan rapproché poitrine, face caméra.
**Action** Le lapin brandit une carotte énorme à deux mains, bras tendus.
Radieux, yeux fermés, oreilles droites. Pose de trophée.
**Texte** `found a carrot 🥕`
**Note** C'est la vignette. Sincèrement joyeux — aucune ironie. C'est le
contraste avec la suite qui fait la blague, pas l'image.

### SHOT B — Le bruit · `0:01 → 0:02` · 1s
**Cadre** Même cadre, il n'a pas bougé.
**Action** Un flash orange venu du hors-champ droite éclaire violemment un
côté de son visage. Oreilles dressées d'un coup, yeux grands ouverts, la tête
amorce une rotation vers la droite — coupée en plein mouvement.
**Texte** aucun (le texte précédent reste affiché jusqu'à `0:01.5`)
**Note** ⚠️ L'explosion n'est **pas** dans le cadre. Seulement sa lumière.

### SHOT C — Rekt · `0:02 → 0:04` · 2s
**Cadre** Plan large. Notre lapin au premier plan, de dos, petit, carotte
toujours brandie. Au fond à droite, l'autre lapin.
**Action** L'autre lapin décolle : arc bas, deux tours en arrière, boule de
feu, onde de choc au sol, fumée. Le nôtre reste **totalement immobile**.
**Texte** `his friend found a bomb 💣` — puis, sur l'atterrissage : `rekt.`
**Note** Son absence de réaction est le gag. S'il sursaute, c'est raté.
**Asset** commit `4677b12` : arc bas, deux tours en arrière, rebond élastique.

### SHOT D — Titre · `0:04 → 0:05` · 1s
**Action** 1 frame d'explosion plein cadre (blanc/orange) → **RABBIT ROYALE**
en gros, plein écran, sur fond du plan large figé. Shake court qui décroît.
**Note** Le nom arrive sur l'impact, pas en fin de clip.

---

## Partie gameplay (0:05 → 0:13)

Cuts de 2s. **Un impact par cut.** Texte court sur chaque.

| Temps | Contenu | Texte |
|-------|---------|-------|
| `0:05 → 0:07` | L'île. Un lapin révèle 3 cases d'affilée, les chiffres apparaissent. | `dig.` |
| `0:07 → 0:09` | Une carotte sort, compteur qui monte (burst du HUD). | `win.` |
| `0:09 → 0:11` | Bombe. Le lapin décolle en vrille — même gag qu'en HQ, en pixel. | `or get rekt.` |
| `0:11 → 0:13` | Il retombe, se relève, repart vers une autre case. | — |

**Capture** `0:09 → 0:11` vient de la story `FX/Bomb walk` (commit `c0780a6`),
qui joue déjà : deux pas, bombe, flash, renvoi, sortie en clignotant.
Le burst de carottes du HUD : story `HUD/Carrot burst`.

**Note** L'écho entre le vol HQ (shot C) et le vol pixel (`0:09`) est la
soudure : même gag, deux rendus → « le jeu, c'est ça ».

---

## Fin · `0:13 → 0:15`

Card : **RABBIT ROYALE** + `soon` (ou la date). Rien d'autre.
Lien dans un **reply**, jamais dans le post.

## Post

Texte du tweet — deux options, à tester :

- `99% carrot. 1% bomb. pick a tile. 🥕💣`
- `he found a carrot. his friend didn't.`

---

## Checklist

- [ ] Shots A, B, C : images (prompts dans `shots/PROMPTS.md`)
- [ ] Animation HQ (prompts dans `shots/PROMPTS-VIDEO.md`)
- [ ] Capture gameplay `0:05 → 0:09` (île, dig, carotte)
- [ ] Capture gameplay `0:09 → 0:13` (story `FX/Bomb walk`)
- [ ] Cartes texte (police, taille, safe-zone)
- [ ] Montage, export carré 1:1
- [ ] Vérif **sans son** et **en vignette** — les deux décident du scroll
