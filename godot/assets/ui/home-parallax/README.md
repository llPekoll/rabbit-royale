# Fond d'accueil en six couches

## Intégration dans le jeu

`title.tscn` utilise maintenant `home_background.tscn` comme illustration animée. `home_background.gd` applique la boucle aux sprites uniquement, sans Camera2D ni raccourcis de démo : le menu reste fixe et cliquable. La trajectoire de 72 secondes est partagée avec la démo via `home_idle_motion.gd`. Le flare est enfant du dernier layer et reste sous l'interface. Le fond et ses ressources sont libérés avec l'écran titre lors de l'entrée dans le jeu.

## Démonstrations Godot

Le lens flare existant (`sun_glare.gdshader`) est un enfant du dernier plan `Layers/foreground` dans les quatre scènes. Son rectangle utilise les coordonnées de l'image : il hérite du déplacement du plan et du zoom de la caméra. Il est dessiné au-dessus du décor et du lapin, sous l'aide, sans intercepter les clics.

Version combinée : `res://scenes/home_idle.tscn` (touche 4). Boucle automatique de 72 secondes combinant panoramique, dérive verticale, parallaxe et approche/recul de caméra. Les cycles partagent la même période pour raccorder position et vitesse sans saut. La propriété `loop_duration` règle la durée. Le lapin est dessiné au-dessus de la végétation dans toutes les scènes, en conservant le mouvement de son terrain.

- `res://scenes/home_pan.tscn` : panoramique avec aller-retour de 28 secondes.
- `res://scenes/home_natural.tscn` : dérive douce sur plusieurs cycles et respiration légère du zoom.
- `res://scenes/home_parallax.tscn` : parallaxe à la souris, dérive automatique et zoom progressif sur 24 secondes.

Ouvrir une scène puis F6. Touches 1/2/3 pour comparer, Espace pour pause, R pour recommencer, H pour masquer l'aide, molette pour zoomer. Les propriétés `motion_strength` et `motion_speed` du nœud racine règlent l'amplitude et la vitesse. Chaque scène contient ses six Sprite2D et une Camera2D ; le comportement commun est dans `res://scripts/home_camera_demo.gd`. Le cadrage s'adapte à la fenêtre en couvrant l'écran avec une marge. Le lapin garde la même profondeur que le terrain.

Six PNG de 1672 × 940, à superposer dans l'ordre numérique. Le fond ciel/mer est opaque ; les cinq autres images possèdent un canal alpha. L'image source reste dans ../home-bg.webp.

1. 01-sky-sea.png — ciel et mer reconstruits.
2. 02-distant-islands.png — château et îles lointaines.
3. 03-main-island.png — île principale.
4. 04-near-terrain.png — terrain proche et barrière, sans lapin.
5. 05-rabbit.png — lapin indépendant.
6. 06-foreground.png — arbre, bannière, feu et végétation au bord de l'image.

Ouvrir preview.html dans un navigateur pour essayer les couches, le mouvement à la souris et le zoom.

Dans Godot, utiliser six Sprite2D avec la même position, le même centrage et la même échelle, dans cet ordre de dessin. Prévoir un agrandissement de base de 1.04 pour masquer les bords. Facteurs de déplacement suggérés : 0.08, 0.18, 0.38, 0.65, 0.69, 1.0 ; déplacement maximal du premier plan d'environ ±16 px horizontalement et ±9 px verticalement à la résolution source. Garder terrain et lapin proches en déplacement pour conserver le contact des pieds.

Ces couches ont été extraites/reconstruites avec l'outil intégré image_gen, puis leurs dimensions harmonisées. Les prompts sont conservés dans prompts.txt. Certains détails et contours diffèrent de l'original ; il ne s'agit pas d'une séparation exacte au pixel près. Prévu pour un parallaxe doux et un zoom modéré, pas pour une traversée 3D jusqu'au château. L'aperçu propose jusqu'à 20 % de zoom pour évaluer le rendu. L'accueil du jeu n'a pas été modifié.
