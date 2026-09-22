extends Node2D
class_name BurrowTerrain
## LE SOL DU TERRIER — dix-neuf par dix-neuf losanges, en terrasses.
##
## Porte de src/game/burrow/BurrowTerrain.ts et de island/IsoIslandView.ts,
## dont il garde les decisions qui se voient :
##
##   • LES TUILES SONT DEJA CUITES EN ISOMETRIQUE. On les pose, on ne les
##     deforme pas. Le web a commence par cisailler chaque tuile a chaque
##     image, « ce qui rendait le sol mou, et c'est le reproche qu'on faisait a
##     l'art ». Les cisailler une seconde fois donnerait des confettis.
##
##   • UN CONTENEUR PAR CASE — le « bloc ». En freres libres, une case voisine
##     pouvait se glisser DANS les interstices d'une autre. Un bloc ne peut pas
##     s'entrelacer avec un bloc.
##
##   • UN JEU BLOB, PAS DES VARIANTES. Voir autotile.gd : chaque case de la
##     grille 4x4 a un sens, et y piocher au hasard met des bords de falaise au
##     milieu du champ.

## UNE PALETTE PAR PALIER, et ce n'est pas une coquetterie.
##
## Les feuilles livrees sont INEGALES : les palettes de plateau portent une
## bande de six rangees de rocher sous chaque tuile, la palette au niveau de la
## mer n'en a AUCUNE — son bord est la plage, pas une falaise.
##
## C'est ce qui manquait au premier essai : tout etait peint avec la feuille
## plate, et le plateau flottait dans le vide, sans rien sous son bord.
const TIER_SHEETS := [
	preload("res://assets/terrain/palette-1.webp"),
	preload("res://assets/terrain/palette-2.webp"),
	preload("res://assets/terrain/palette-3.webp"),
	preload("res://assets/terrain/palette-4.webp"),
]
const ELEVATION_SHEET := preload("res://assets/terrain/tilemap-elevation.webp")
const TILE := 64

## Le jeu blob d'herbe commence a la colonne 0 des palettes, qui font 9x6.
const GRASS_ORIGIN := 0

## CE QU'UNE TUILE PEINT VRAIMENT dans sa boite de 64, mesure sur l'alpha. Le
## losange fait 44 : on agrandit de 1.05 pour fermer les coutures en cheveu.
const GROUND_PAINTED_W := 42.0

## LA FACE DE FALAISE haute, rangee 3 de la feuille d'elevation. La rangee 5
## porte la variante courte, pour une etagere profonde d'une seule case.
const FACE_ROW := 3

## La hauteur utile d'une face empilee, en pixels.
const FACE_SOLID_H := 32

## L'ordre de dessin A L'INTERIEUR d'un bloc. Les faces descendent sous zero,
## le rebord rocheux se glisse entre elles et le sol.
const Z_FACE := -10
const Z_RIM := 0
const Z_GROUND := 1

var map: BurrowMap
var _blocks: Array[Node2D] = []
var _grass: Array = []
var _rock: Array = []


func _ready() -> void:
	# PAS DE Y SORT ICI, et c'est un choix.
	#
	# Godot offre deux tris et ils se CONTREDISENT : avec `y_sort_enabled`, le
	# parent classe ses enfants sur leur position verticale et IGNORE leur
	# `z_index`. Poser les deux revient donc a n'en avoir aucun — c'est ce qui
	# faisait que le relief ne se voyait pas, chaque bande de rocher passant
	# derriere la tuile de devant.
	#
	# On garde le z_index parce qu'il porte la VRAIE regle : `Iso.depth`, la
	# diagonale qui s'eloigne de la camera, la meme dont les decors et le lapin
	# se serviront. Un tri sur Y ne saurait pas qu'une tuile haute et une tuile
	# basse a la meme hauteur d'ecran ne sont pas a la meme distance.
	y_sort_enabled = false
	# Un jeu blob par palier, pris dans sa propre palette.
	_grass = []
	for sheet in TIER_SHEETS:
		_grass.append(_slice(sheet, GRASS_ORIGIN, 4, 4))
	_rock = _slice(ELEVATION_SHEET, 0, 4, 8)
	if map == null:
		map = BurrowMap.new()
		map.generate(1)
	build()


## Dessine le terrain d'apres le relief. Rappelable : tout est jete avant.
func build() -> void:
	clear()
	if map == null:
		return

	var land := func(x: int, y: int) -> bool:
		return map.is_land(x, y)
	var scale_up := Iso.BURROW_TILE_W / GROUND_PAINTED_W
	var grown := TILE * (scale_up - 1.0) * 0.5

	for row in range(map.height):
		for col in range(map.width):
			var tier := map.level_at(col, row)
			if tier == 0:
				continue

			# LE BLOC : tout ce que cette case dessine vit dedans, avec des
			# profondeurs LOCALES. C'est ce qui empeche deux cases voisines de
			# s'entrelacer.
			var block := Node2D.new()
			block.y_sort_enabled = false
			# LA PROFONDEUR DU BLOC, et c'est elle qui fait exister le relief.
			#
			# Sans elle les blocs se dessinaient dans l'ordre ou ils sont
			# crees, donc la bande de rocher de chaque tuile passait DERRIERE
			# sa voisine de devant : le plateau se lisait a sa teinte mais
			# n'avait aucun volume.
			#
			# `Iso.depth` est la diagonale qui s'eloigne de la camera,
			# multipliee par 16 pour laisser de la place au palier — les
			# decors poses dessus se trieront sur la meme regle.
			block.z_index = Iso.depth(col, row) + tier
			block.position = map.screen_of(col, row)
			add_child(block)
			_blocks.append(block)

			var mask := Autotile.mask_at(land, col, row)
			var bcol := Autotile.blob_col(mask)
			var brow := Autotile.blob_row(mask)

			# LES FACES DE FALAISE, sous le sol.
			#
			# LA TUILE CUITE PORTE DEJA UN PALIER DE COTE : la pile ne couvre
			# que ce qui reste en dessous. Une chute d'un seul palier — le cas
			# courant de loin — n'empile donc RIEN. Sans ca chaque bloc
			# dessinait son cote deux fois et chaque etagere sortait d'un
			# palier trop haute.
			var drop := map.drop_at(col, row)
			var remaining := drop * BurrowMap.TIER_LIFT - BurrowMap.TIER_LIFT
			if remaining > 0:
				var count := maxi(1, ceili(float(remaining) / float(FACE_SOLID_H)))
				# Empilees DU BAS VERS LE HAUT, pour que la face la plus proche
				# de la camera soit dessinee en dernier.
				for i in range(count - 1, -1, -1):
					var face := Sprite2D.new()
					face.texture = _rock[FACE_ROW][bcol]
					face.centered = false
					face.z_index = Z_FACE - i
					face.position = Vector2(
						-TILE * 0.5,
						BurrowMap.TIER_LIFT + i * FACE_SOLID_H - (TILE - Iso.BURROW_TILE_H) * 0.5
					)
					block.add_child(face)

			# LE REBORD ROCHEUX, entre les faces et l'herbe. Seulement sur un
			# plateau : au niveau du sol, le bord est la plage, pas la falaise.
			if tier > 1:
				var rim := Sprite2D.new()
				rim.texture = _rock[Autotile.ELEVATION_SURFACE_ROW[brow]][bcol]
				rim.centered = false
				rim.z_index = Z_RIM
				rim.position = Vector2(-TILE * 0.5, -(TILE - Iso.BURROW_TILE_H) * 0.5)
				block.add_child(rim)

			# LE SOL.
			var ground := Sprite2D.new()
			# `tier - 1` : le palier 1 prend la premiere palette. Borne a la
			# derniere pour qu'un relief plus haut que prevu ne sorte pas du
			# tableau.
			var palette: Array = _grass[mini(tier - 1, _grass.size() - 1)]
			ground.texture = palette[brow][bcol]
			ground.centered = false
			ground.scale = Vector2(scale_up, scale_up)
			ground.z_index = Z_GROUND
			ground.position = Vector2(
				-TILE * 0.5 - grown,
				-(TILE - Iso.BURROW_TILE_H) * 0.5 - grown
			)
			block.add_child(ground)


func clear() -> void:
	# LES NOEUDS ET LEUR LISTE MEURENT ENSEMBLE. Le web a paye cette lecon avec
	# des bombes qui disparaissaient : un cache indexe par noeud avait survecu a
	# la destruction du terrain, et sa garde « je l'ai deja » refusait ensuite
	# chaque re-ajout.
	for block in _blocks:
		block.queue_free()
	_blocks.clear()


## Decoupe une grille de tuiles de 64 a partir d'une colonne d'origine.
func _slice(sheet: Texture2D, origin_col: int, cols: int, rows: int) -> Array:
	var out := []
	for row in range(rows):
		var line: Array[Texture2D] = []
		for col in range(cols):
			var frame := AtlasTexture.new()
			frame.atlas = sheet
			frame.region = Rect2((origin_col + col) * TILE, row * TILE, TILE, TILE)
			line.append(frame)
		out.append(line)
	return out
