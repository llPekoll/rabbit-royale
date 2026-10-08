# Boutique — échoppe forestière

Direction choisie : [02-echoppe-forestiere.png](../shop-directions-20261008/02-echoppe-forestiere.png).

## Construction reprise des settings

Référence vérifiée dans Godot le 8 octobre : `scripts/ui/profile.gd`, `scripts/ui/settings_pane.gd`, `scripts/ui/camp_style.gd`. Le banc `scenes/bench/profile_camp_bench.tscn` passe à 1280 × 720.

Le décor, les panneaux extensibles, les illustrations et les contrôles sont des couches distinctes. Les mots sont de vrais Labels, les boutons de vrais Buttons. Les lapins restent les sprites animés du jeu, comme les aperçus du profil. Les régions de l’atlas sont exposées en AtlasTexture ; aucune maquette avec des prix incrustés ne sert de fond au jeu.

## Direction visuelle

- Noyer sombre `#43291e` : fonds des compartiments, lisibilité des illustrations.
- Chêne miel `#a66735` : structures et reliefs.
- Laiton `#edbd62` : bordures, prix et sélection.
- Vert mousse `#427842` : onglet actif et actions principales.
- Lin `#f3dfb0` : textes et étiquettes.
- Terre profonde `#24180f` : ombres et texte sur parchemin.

Police : faces existantes du jeu, pilotées par I18N. Noms centrés sur les étiquettes, prix alignés dans les boutons, descriptions alignées à gauche. Un décor riche aux bords et des fonds calmes derrière les contrôles.

## Pages

```text
Enseigne                                  Solde   Fermer
Packs | Objets | Skins                     Moyen de paiement

Packs   : quatre compartiments illustrés + aperçu du vestiaire
Objets  : sept produits à l’unité, stock, nom et prix séparés
Skins   : deux portraits + grand aperçu animé + poses + achat
```

Les packs Shiro et Kuro gardent leur mascotte dans l’illustration, mais le contenu vendu est explicitement listé à part. Aucun lapin n’est annoncé comme inclus dans ces packs. Les recharges utilisent le médaillon du jeu ; l’éclair reste réservé à l’objet Lightning.

Les skins Solana et Carrot sont les deux offres actuellement en vente, à 99 cents dans le catalogue actuel. Ils se paient en USDC/SOL/SKR, pas en carottes. Le skin du pass n’est pas transformé en offre unitaire. Tous les montants du shop en production doivent venir des états existants, jamais des illustrations.

## Livrables

- `05-items-forest.png` : maquette de la page Objets.
- `06-skins-forest.png` : maquette de la page Skins.
- `stall-backdrop.png` : décor vide commun aux trois pages.
- `forest-ui-kit.png` : neuf éléments séparés sur transparence.
- `pack-illustrations.png` : quatre illustrations de packs sur transparence.
- `prompts.json` et `pack-prompt.txt` : requêtes exactes de génération, outil intégré imagegen.

Les fichiers de jeu se trouvent dans `godot/assets/ui/shop-forest/`. Le banc `scenes/bench/forest_shop_bench.tscn` permet d’évaluer les assets avec les vrais sprites et les vrais textes du jeu, sans connexion ni achat. Il ne remplace pas encore le shop connecté.
