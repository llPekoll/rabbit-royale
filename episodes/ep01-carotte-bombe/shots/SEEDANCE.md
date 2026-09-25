# Ep01 — Une seule génération Seedance

Une vidéo, **un seul appel**, les trois plans montés dedans. Les raccords tiennent
parce que c'est le même clip : même lapin, même lumière, même île.

**Modèle** `bytedance/seedance-2.5/reference-to-video` (Higgsfield)
**Réglages** `duration: 6`, `aspect_ratio: "1:1"`, `resolution: "720p"`, `generate_audio: false`

Les images sont des **références**, pas la première image : le ciel de nuit de
`A-v1` ne passe pas dans la vidéo si le prompt demande le jour.

| # | Fichier | Rôle |
|---|---|---|
| image 1 | `out/A-v1.png` | le héros + le rendu (jouet vinyle, cubique) |
| image 2 | `refs/brown-idle-x16.png` | le pote, même personnage en brun |
| image 3 | `refs/game-screenshot.png` | l'île, la palette |

Le titre **RABBIT ROYALE** et les cartes texte se posent au montage : Seedance
écrit mal, et les textes changent sans refaire la vidéo.

## Découpage (6 s générées, ~5 s utilisées)

| Temps | Plan | Ce qui se passe | Texte (montage) |
|---|---|---|---|
| 0.0 → 1.5 | **A** plan poitrine, face | Carotte géante brandie à deux mains, yeux fermés de bonheur. Quasi immobile. | `found a carrot 🥕` |
| 1.5 → 2.5 | **B** même cadre | Flash orange venu de droite, yeux qui s'ouvrent, oreilles dressées, la tête amorce un quart de tour → **cut** en plein mouvement. | — |
| 2.5 → 5.0 | **C** plan large, dans son dos | Même lapin, de dos, bas-gauche, carotte levée, **immobile**. Au fond à droite, le pote brun saute sur une bombe : boule de feu, vol en arc bas, deux tours, retombe. | `his friend found a bomb 💣` puis `rekt.` |
| 5.0 → 6.0 | marge | Fumée qui retombe, le nôtre ne bouge toujours pas. On coupe ici pour le titre. | **RABBIT ROYALE** |

Puis 10 s de gameplay capturé (voir `script.md`).

## Prompt

```text
One continuous 6-second clip, square format, with two hard cuts. Same character, same island, same daylight in every shot.

Image 1 is the hero and the exact render style: a chunky boxy white rabbit toy with a thick charcoal outline, tall straight rectangular ears with pink insides, small black dot eyes, pink nose, pale grey-beige lower body, holding a gigantic orange carrot with a round bushy green top. Stylized vinyl-toy 3D render, voxel-like carrot leaves. Image 2 is a second rabbit: the exact same character design, but BROWN. Image 3 is the world: an isometric island of square grass tiles, dark teal pine trees, round bushes, small red mushrooms, turquoise sea. Bright sunny daytime, blue sky, shadows deep navy blue.

SHOT 1 (0s to 1.5s): medium close-up, chest up, facing camera, static camera. The white rabbit holds the giant carrot high above its head with both arms, eyes closed in pure happiness, ears straight up. Almost still: one small proud breath, ears twitch once.

SHOT 2 (1.5s to 2.5s): exact same framing, continuous with shot 1. A sudden hard orange flash lights the right side of its face from off-screen right. Its eyes snap open, ears jolt upright, head starts turning to the right. Hard cut in the middle of the head turn. No fire visible in this shot.

SHOT 3 (2.5s to 6s): wide shot of the island, camera behind the white rabbit. The white rabbit is small in the bottom-left foreground, seen from behind, carrot still held high above its head, completely frozen, it does not react at all. In the background on the right, the brown rabbit steps on a tile that explodes: orange fireball, ground shockwave ring, dirt and grass chunks. The brown rabbit is launched backwards in a low arc, spins twice, lands flat further away and bounces once. Black smoke drifts up. Short camera shake at the explosion that fades quickly.

No text, no letters, no logo, no UI. No capes, crowns or clothes. No morphing, the characters keep their shape and colours in every shot.
```

## Si ça dérive

- Le lapin du plan C bouge → ajouter en tête : `The white rabbit in shot 3 is a still statue.`
- Les deux lapins se mélangent → écrire « dark brown » partout où il y a « brown ».
- Les plans ne coupent pas → baisser à 2 plans : fusionner 1 et 2 (flash à 1 s).

---

## V2 — trois styles, une vidéo chacun (`examples/higgsfield/episode-video.ts <style>`)

Découpage 8 s : plan large, l'herbe est vide, il arrache la carotte → zoom lent
vers la pose trophée → flash, cut → plan large dans son dos, le pote saute.
Le prompt vit dans le script.

**Clay (`hq2-clay.mp4`) — super.** Pour une v2 (`episode-video.ts clay v2`) :
- l'anneau jaune doit **tourner** autour du pote (il était posé, fixe) ;
- les arbres du plan 4 ont basculé en design du jeu : tout reste **stop-motion**.
  La capture du jeu est retirée des références clay pour ça.
