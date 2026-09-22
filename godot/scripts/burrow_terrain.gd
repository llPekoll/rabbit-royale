extends Node2D
class_name BurrowTerrain
## LE SOL DU TERRIER — dix-neuf par dix-neuf losanges.
##
## Porte de src/game/burrow/BurrowTerrain.ts, pendant de celui de l'ile. Les
## deux existent separement pour une raison que leur auteur donne : l'ile est
## une grille 16x16 a ses mesures, le terrier une 19x19 aux siennes. Tout le
## reste est la meme idee, et c'est le meme tileset.
##
## LES TUILES SONT DEJA CUITES EN ISOMETRIQUE, et c'est le point le plus
## important de ce fichier. On les POSE, on ne les deforme pas. Le web a
## commence par cisailler chaque tuile par une matrice a chaque image :
##
##   « Compresser a 69 % de la largeur et 37 % de la hauteur au moment de
##     l'echantillonnage, c'est ce qui rendait le sol mou, et c'est le reproche
##     qu'on faisait a l'art. »
##
## Les feuilles sont desormais cuites projetees, hors-ligne, en supersampling.
## Les cisailler une seconde fois donnerait des confettis : une tuile de 42x24
## apres cuisson sortirait a 14x8 apres un second passage.
##
## UN SEUL CONTENEUR TRIE, UNE SEULE REGLE. Les tuiles, les arbres et le lapin
## seront FRERES ici et se trieront tous sur la meme profondeur. C'est ce qui
## permet a un caillou pose sur une case proche de passer devant une falaise
## lointaine sans qu'on ait a arbitrer a la main.

## Le tileset du sol plat : 11 colonnes sur 4 rangees de tuiles de 64.
const FLAT_SHEET := preload("res://assets/terrain/tilemap-flat.webp")
const TILE := 64

## L'herbe occupe les colonnes 0 a 3, le sable les colonnes 5 a 8. Ce sont des
## jeux BLOB : chaque case y a un sens, voir autotile.gd.
const GRASS_ORIGIN := 0
const SAND_ORIGIN := 5

## CE QU'UNE TUILE PEINT VRAIMENT dans sa boite de 64, mesure sur l'alpha.
##
## Le losange fait 44 de large, l'art 42 : on agrandit donc de 1.05 pour fermer
## les coutures en cheveu entre deux cases. Deux pixels, pas assez pour que le
## reechantillonnage se voie, assez pour qu'il n'y ait plus de jour.
const GROUND_PAINTED_W := 42.0

var _tiles: Array[Sprite2D] = []
var _frames: Array = []


func _ready() -> void:
	# Y SORT : c'est lui qui applique la regle de profondeur aux freres.
	y_sort_enabled = true
	_frames = _slice_blob(GRASS_ORIGIN)
	build()


## Dessine le sol.
##
## `in_region` dit quelles cases sont de la terre — pour l'instant toutes, mais
## c'est ce predicat qui donnera plus tard sa forme au jardin. Chaque tuile
## choisit son dessin d'apres SES VOISINES et non au hasard : piocher au
## hasard dans le jeu blob met des bords de falaise au milieu du champ.
func build(in_region: Callable = Callable()) -> void:
	clear()

	var region := in_region
	if not region.is_valid():
		region = func(x: int, y: int) -> bool:
			return x >= 0 and x < Iso.BURROW_COLS and y >= 0 and y < Iso.BURROW_ROWS

	var scale_up := Iso.BURROW_TILE_W / GROUND_PAINTED_W

	for row in range(Iso.BURROW_ROWS):
		for col in range(Iso.BURROW_COLS):
			if not region.call(col, row):
				continue
			var mask := Autotile.mask_at(region, col, row)
			var frame: Texture2D = _frames[Autotile.blob_row(mask)][Autotile.blob_col(mask)]

			var tile := Sprite2D.new()
			tile.texture = frame
			tile.centered = false
			tile.scale = Vector2(scale_up, scale_up)
			# La tuile est posee par son MILIEU : la texture fait 64x64 alors
			# que la case n'en fait que 44x24, donc le dessin deborde en haut
			# et sur les cotes — c'est le volume du bloc, pas une erreur.
			# L'agrandissement se fait autour du centre, d'ou le demi-ecart.
			var at := Iso.project(col, row)
			var grown := TILE * (scale_up - 1.0) * 0.5
			tile.position = at - Vector2(
				TILE * 0.5 + grown,
				(TILE - Iso.BURROW_TILE_H) * 0.5 + grown
			)
			add_child(tile)
			_tiles.append(tile)


func clear() -> void:
	# LES SPRITES ET LEUR LISTE MEURENT ENSEMBLE.
	#
	# Le web a paye cette lecon : un cache indexe par noeud avait survecu a la
	# destruction du terrain, et sa garde « je l'ai deja » refusait ensuite
	# chaque re-ajout — les bombes posees en defense disparaissaient des qu'on
	# quittait le mode et qu'on revenait. Toute structure qui indexe des noeuds
	# se vide dans le MEME appel que celui qui les detruit.
	for tile in _tiles:
		tile.queue_free()
	_tiles.clear()


## Decoupe un jeu blob de 4x4 a partir d'une colonne d'origine.
func _slice_blob(origin_col: int) -> Array:
	var rows := []
	for row in range(4):
		var line: Array[Texture2D] = []
		for col in range(4):
			var frame := AtlasTexture.new()
			frame.atlas = FLAT_SHEET
			frame.region = Rect2((origin_col + col) * TILE, row * TILE, TILE, TILE)
			line.append(frame)
		rows.append(line)
	return rows
