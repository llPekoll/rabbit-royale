# Propositions de menu joueur — 8 octobre 2026

Quatre maquettes visuelles, chacune montrant Profil et Historique, générées avec l’outil image_gen intégré. La proposition 02 a ensuite été choisie et intégrée au menu Godot (Profil, Historique et Réglages).

| Proposition | Direction |
| --- | --- |
| [01 — Terrier cosy](01-terrier-cosy.png) | Évolution chaleureuse du style actuel, onglets horizontaux, personnage et collection bien regroupés. |
| [02 — Camp de raid](02-camp-de-raid.png) | Interface sombre bleu pétrole, navigation latérale et accents cuivre. |
| [03 — Carnet d’aventure](03-carnet-aventure.png) | Livre ouvert : identité et collection sur deux pages, navigation par marque-pages. |
| [04 — Arcade épurée](04-arcade-epuree.png) | Interface graphique claire, bleu et jaune, texte plus lisible et peu d’ornements. |

Prompts : [prompts.json](prompts.json). Le prompt initial de la proposition 01 a été interrompu par un redémarrage ; l’image a été récupérée et son brief est consigné. Les autres prompts sont sauvegardés intégralement.

Les quatre planches initiales sont des concepts. Les captures de l’interface implémentée sont dans [implemented](implemented/) : [profil bureau](implemented/desktop-profile.png), [historique bureau](implemented/desktop-history.png), [réglages bureau](implemented/desktop-settings.png), ainsi que les trois écrans en 890 × 400.

Le fond du portrait est enregistré dans `godot/assets/ui/profile-camp.png`, généré avec image_gen intégré ; [prompt](camp-background-prompt.txt). Les lapins, icônes et coffres utilisent les assets du jeu. Les nombres de l’historique proviennent des données, y compris les proportions des barres.

Vérification native : `scenes/bench/profile_camp_bench.tscn` exerce les clics, les trois onglets, le changement de lapin, la validation du nom, les notifications, les dettes de revanche, le son, l’ouverture des skins, le retour, les confirmations d’abandon/suppression et la fermeture. Il capture aussi les historiques peu remplis, longs, vides, en chargement et en erreur. PASS en français et anglais au format téléphone (890 × 400), et en français au format bureau (1280 × 720). Le banc est hors ligne : il ne teste pas les services Google, e-mail, wallet ou les paiements réels.

```sh
/Applications/Godot.app/Contents/MacOS/Godot --path godot --resolution 890x400 scenes/bench/profile_camp_bench.tscn -- --size=890x400 --ui-scale=1 --lang=fr --out=/private/tmp/rr-camp-check
```

Le moteur émet à la fermeture des avertissements de libération de trois textures. Ils sont également présents dans le banc du dialogue de langue existant ; aucun échec des contrôles du menu n’est associé à ces messages.

## Intégration un pour un (Claude, 8 octobre)

La première intégration posait des rectangles plats ; elle est remplacée par les maquettes elles-mêmes, découpées par `tools/slice-camp-ui.py` (`python3 tools/slice-camp-ui.py`) dans `godot/assets/ui/camp/` : le cadre de cuivre et ses feuilles, les panneaux en 9-slice, les onglets, les icônes détourées, les illustrations (portrait sans son lapin, gramophone, aperçus Fluide/Beau, sieste du solo, caisse de carottes, coffre), interrupteurs, glissière et jauges.

- Profil et historique : `godot/scripts/ui/profile.gd` pose chaque pièce à ses coordonnées de `02-camp-de-raid.png` (cadre de (47, 105) à (1292, 644)), multipliées par une seule échelle. L'historique est l'écran du bas de 02, remonté de 560 px.
- Réglages : `godot/scripts/ui/settings_pane.gd`, coordonnées de `05-reglages-camp-de-raid.png` resserrées en hauteur.
- La nuit autour du cadre : les seules marges de 05, chacune cadrée à sa bande.
- La police du jeu (d8) est plus large que celle des maquettes : les tailles sont celles de la maquette × `CampStyle.TEXT_SCALE`.

`godot/assets/ui/profile-camp.png` (fond généré pour la première intégration) n'est plus utilisé.
