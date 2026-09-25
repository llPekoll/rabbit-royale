# Rabbit Royale — la série

Des teasers courts pour X et Instagram. Chaque épisode **se regarde seul** (voir
`README.md` : pas de numéro à l'écran, pas de « à suivre »). Ceux qui suivent la
série reconnaissent les deux personnages, la carotte et la voix de l'île.

## Le fil rouge

L'histoire est déjà dans le jeu : **The Cursed Crown**, les cinq chapitres du
codex (`lore.*` dans `godot/assets/i18n/en.json`). La saison monte comme le
codex : l'île donne → les chiffres ne mentent pas → on ne te prend que ce que tu
as laissé → l'île coule → la couronne.

## Les personnages

| | Qui | Règle |
|---|---|---|
| **Le héros** | Le lapin blanc du jeu (`bunny-white`) | Il ne réagit **jamais** au malheur de Degen. Il réfléchit, il gagne. Il trimballe sa **carotte géante** de l'ep01 dans chaque épisode. |
| **Degen** | Le lapin brun (`bunny-brown`), celui qui a sauté sur la bombe dans l'ep01 | Jaloux, pressé, moqueur. Il veut se venger ou passer devant, et ça se retourne **toujours** contre lui. |

Le gag signature : **Degen se plante, le héros ne le regarde même pas.**

## La voix de l'île

Pas de voix off : 80 % des vues se font sans le son. À la fin de l'intro HQ,
une carte texte porte **une phrase du codex**, en blanc sur noir, en police
normale (Avenir Next). Elle est déjà dans le jeu, donc elle ne ment pas sur
le produit.

## Le style

Un seul style pour toute la série, celui de l'ep01 : **pixel 3D**. Les lapins
sont faits des pixels du sprite, mis en volume, avec une lumière douce et un
flou d'arrière-plan.

| Référence | Fichier |
|---|---|
| Le héros | `ep01-carotte-bombe/shots/cool/pixel3d-clean.png` (ventre uni — sinon il a « des nénés ») |
| Degen | `ep01-carotte-bombe/shots/refs/brown-idle-x16.png` → à remplacer par une planche pixel 3D de Degen (une image Grok) |
| Le monde | l'île du jeu, pas le volcan : **il n'y a plus de volcan**, les îles coulent |

## La fabrication (par épisode)

1. **Intro HQ** : une seule génération Seedance 2.5 reference-to-video, 8 s,
   carrée, sans son (`examples/higgsfield/episode-video.ts`). Une génération
   à la fois : on regarde avant de relancer.
2. **Gameplay** : filmé dans Godot, jamais généré
   (`capture.sh`, `godot/scenes/bench/trailer_bench.tscn`).
3. **Montage** : `montage.sh`, qui ajoute les sons du jeu, le swipe flouté vers
   le jeu, l'iris en crâne RR-Skull et la carte de fin (Follow @RabbitRoyaleX,
   Soon on Seeker, Made with ♥ and Indies on Solana).
4. **Formats** : carré pour X ; 9:16 pour les Reels (intro à générer en 9:16
   dès le départ, un recadrage du carré couperait la scène).

## Les épisodes

| Ep | Gag | Phrase de l'île | Gameplay | État |
|---|---|---|---|---|
| 01 | Il trouve une carotte, Degen trouve une bombe | *It has never stopped giving.* | creuser | ✅ monté |
| 02 | **Le 50/50** : il hésite entre deux cases, Degen se moque, double, et saute sur la bombe | *The island does not kill the unlucky. It kills the hurried.* | une bombe, un coffre | découpage |
| 03 | **L'éclair** : Degen le lui lance, il rebondit sur la carotte et grille Degen | *A thing that never lies to you is a thing that wants something.* | `lightning` | idée |
| 04 | **Le calmar** : encré, il creuse à l'aveugle et trouve quand même un coffre | *The numbers are honest.* | `bloop` | idée |
| 05 | **À l'eau** : Degen veut le pousser, le héros se baisse, Degen file à la mer | *…and the rabbits swim.* | `drown` | idée |
| 06 | **Le raid** : il rentre, la porte est défoncée, Degen est assis sur son tas | *The only thing that can be taken from a rabbit is what it left behind.* | raid (à filmer) | idée |
| 07 | **L'île coule** au dernier coffre, les deux ennemis nagent côte à côte | *An island is a thing that happens once.* | l'île qui coule (à filmer) | idée |
| 08 | **La couronne** : il se réveille couronné, tous les lapins de la carte se tournent vers lui | *It illuminates them, and then it stands back to watch.* | lancement | idée |
