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

## LE TROU QU'UNE BOMBE LAISSE — la colonne 10 de la planche plate, celle que
## RR peint lui-meme directement en ISO (tileset.ts `FLAT_CUSTOM_COL`). Rangee
## 0 : le cratere.
const FLAT_SHEET := preload("res://assets/terrain/tilemap-flat.webp")
const FLAT_CUSTOM_COL := 10
## LE SABLE DU POTAGER : le jeu blob couleur sable de la meme planche, en
## colonnes 5 a 8 (tileset.ts `FLAT_ORIGIN.sand`).
const FLAT_SAND_COL := 5
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

## CE QU'ON POSE SUR UNE CASE, au-dessus de son sol.
##
## LE PIEGE QUE CE NOMBRE EVITE : le web a d'abord livre les losanges de
## placement a 0,05 — un chiffre lu sur la regle du PLATEAU, qui n'est PAS
## celle de l'interieur d'un bloc. Dix-huit losanges se sont retrouves dessines
## SOUS l'herbe : « visibles » pour chaque sonde automatique, et invisibles pour
## l'oeil de tout le monde. Paul, le 2026-09-21 : « rien ne se passe comme il
## faut ».
##
## Le sol d'un bloc est a 1. Un voile de case se pose donc a 2, les cibles de
## cloture a 2,5, et une bombe a 3 — au-dessus de tout ce qui est sur sa case.
const Z_VEIL := 2
## Le carre du potager, au rang du voile : au-dessus du sol, sous ce qui s'y
## pose (les losanges du raid a 2 passent apres lui, deja montes).
const Z_BED := 2

## LA NAPPE SOUS LE PLATEAU.
##
## Les tuiles sont des losanges poses cote a cote, et entre deux d'entre eux le
## fond passe : a l'echelle du telephone, ca fait des traits noirs en diagonale
## sur tout le terrain. Elargir les tuiles fermerait les coutures mais
## deformerait l'art.
##
## Une nappe de la couleur de l'herbe, dessinee SOUS tout, suffit : les trous
## laissent voir du vert au lieu du vide, et personne ne les remarque plus. La
## teinte est echantillonnee sur le dessus d'une tuile de palette-1, pas
## choisie a l'oeil.
const UNDERLAY := Color("#9bb94e")

## LA NAPPE S'ARRETE UNE CASE AVANT LE BORD.
##
## Son travail est de boucher les coutures INTERIEURES ; sur le pourtour il n'y
## a rien a boucher, et un aplat qui depasse du bord dentele se voit tout de
## suite — une bande verte plate au-dela de l'herbe texturee, ce qui est pire
## que le trou qu'elle corrige.
##
## On ne la pose donc que sous les cases entourees de terre des quatre cotes.
## Le bord garde ses tuiles seules, et elles n'ont pas de voisine avec qui
## faire une couture.

var map: BurrowMap
var _underlay: Polygon2D
var _blocks: Array[Node2D] = []
## LE BLOC DE CHAQUE CASE, adressable — c'est ce dans quoi on monte un voile.
## Vidé en meme temps que `_blocks` : voir `clear`, et la lecon des bombes
## fantomes qui y est racontee.
var _block_at: Dictionary = {}
## Le sprite de SOL de chaque case plate — ce que `dig_cell` repeint. Une
## rampe n'y est pas : son herbe est deformee, un trou plat s'y poserait de
## travers.
var _ground_at: Dictionary = {}
var _grass: Array = []
var _rock: Array = []
var _sand: Array = []
## Les carres du potager, jetes quand on repeint le champ.
var _beds: Array[Sprite2D] = []
## LA HAUTEUR DU DESSUS DE CHAQUE CASE, et ce qui y est monte (`mount_veil`).
var _rise: Dictionary = {}
var _mounted: Dictionary = {}
## Les mottes du terrier (`lay_sods`) ; celles de l'ile sont a `TileView`.
var _sods: Dictionary = {}

## Une case vient de changer de hauteur.
signal rise_changed(cell: Vector2i)
## Les cases dont le sol est DEFORME (rampe, ou bande raccrochee) : le sprite
## et de quoi refaire la deformation — le potager la rejoue sur son sable.
var _warp_at: Dictionary = {}


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
	_sand = _slice(FLAT_SHEET, FLAT_SAND_COL, 4, 4)
	if map == null:
		map = BurrowMap.new()
		map.generate(1)
	build()


## Dessine le terrain d'apres le relief. Rappelable : tout est jete avant.
func build() -> void:
	clear()
	if map == null:
		return

	_paint_underlay()

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
			_block_at[Vector2i(col, row)] = block

			# LA REGION DE L'AUTOTILEUR EST « CE PALIER OU PLUS HAUT », et
			# surtout pas « de la terre ».
			#
			# C'est `atOrAbove(map, tier)` du web (IsoIslandView.ts:1780), et le
			# port demandait `is_land` — donc N'IMPORTE QUEL palier. La
			# difference ne se voyait pas sur le terrier : deux paliers, un
			# plateau compact, presque aucune case ou les deux reponses
			# divergent.
			#
			# Sur l'ile elle creve les yeux. Une case de palier 2 collee a du
			# palier 1 voyait « de la terre » de ce cote, se croyait donc en
			# PLEIN MILIEU du plateau et se peignait sans bord — d'ou un
			# plateau sans silhouette, et les traits sombres le long de sa
			# limite sur la capture du Seeker. Mesure : 74 coutures entre
			# paliers differents, toutes d'un seul palier d'ecart.
			#
			# La question doit etre posee PAR PALIER, et elle l'est ici parce
			# que `tier` est connu — d'ou la fermeture reconstruite a chaque
			# case plutot qu'une seule hissee hors de la boucle.
			#
			# UNE VOISINE PLUS BASSE QUI RAMPE JUSQU'ICI COMPTE COMME LE MEME
			# SOL, et c'est la clause qui manquait. Le web la pose mot pour
			# mot : « a lower neighbour that ramps up to this cell counts as
			# the same ground: no cut corner, no rim on that side. One that
			# keeps its cliff, or the sea, is an edge as before. »
			#
			# SANS ELLE, L'AUTOTILEUR DECOUPE UN BORD FRANC sur la case que la
			# rampe vient justement de raccorder : la tuile prend sa variante
			# de bordure, sa bande de rocher se pose au bord PLAT, et le warp
			# la souleve ensuite avec le coin leve. Le rocher se lit alors
			# comme une BARRE EN TRAVERS DE LA PENTE au lieu de pendre sous
			# elle — c'est exactement ce que la capture du 2026-09-22 montrait,
			# une fois les trous bleus bouches.
			#
			# Toute case de terre rampe ici : le web laisse l'appelant filtrer
			# par `rampAt`, et sans predicat il repond `true` partout. Le
			# terrier du web fait pareil (`slopes: true` seul), donc la
			# condition s'y reduit AUSSI a « de la terre » — ce n'est pas une
			# simplification de ma part, c'est ce que le web calcule.
			#
			# ET LA SILHOUETTE DU PLATEAU NE SE PERD PAS POUR AUTANT, ce qui
			# est le reflexe a desarmer : ce masque ne choisit que la VARIANTE
			# d'autotile. Ce qui donne au plateau son relief, ce sont la face
			# et le rebord, pilotes par `drop` un peu plus bas et qui, eux,
			# comparent bien les paliers.
			var in_tier := func(x: int, y: int) -> bool:
				return map.level_at(x, y) > 0
			var mask := Autotile.mask_at(in_tier, col, row)
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
					# AGRANDIE COMME LE SOL, meme raison que le rebord.
					face.scale = Vector2(scale_up, scale_up)
					face.position = Vector2(
						-TILE * 0.5 - grown,
						BurrowMap.TIER_LIFT + i * FACE_SOLID_H
							- (TILE - Iso.BURROW_TILE_H) * 0.5 - grown
					)
					block.add_child(face)

			# LE REBORD ROCHEUX, entre les faces et l'herbe.
			#
			# Seulement sur un plateau : au niveau du sol, le bord est la plage
			# et pas la falaise.
			#
			# ET JAMAIS SOUS UNE RAMPE, ce que le portage avait omis. Le web le
			# dit en une ligne — « the rim is flat, and a flat lip under a
			# warped surface would show below its lifted edge ». Une case en
			# rampe a ses coins leves ; une levre PLATE glissee dessous depasse
			# donc de son bord, et c'est ce qui dessinait les liserés sombres
			# dentelés au pourtour du plateau, plus les fragments de rocher
			# isoles en contrebas.
			#
			# MESURE sur la graine « default » : 102 cases de plateau, dont 26
			# en rampe — un quart des rebords etaient poses la ou le web n'en
			# met pas.
			var ramp := false
			for lift in map.corner_lifts(col, row):
				if lift != 0:
					ramp = true
			if tier > 1 and not ramp:
				var rim := Sprite2D.new()
				rim.texture = _rock[Autotile.ELEVATION_SURFACE_ROW[brow]][bcol]
				rim.centered = false
				rim.z_index = Z_RIM
				# LE REBORD EST AGRANDI COMME LE SOL, et c'est ce que le portage
				# avait oublie.
				#
				# Cote web, le rebord passe par le MEME `stampGround` que
				# l'herbe, donc il herite du meme `groundScale` — « the factor
				# that makes the painted diamond exactly as wide as the cell ».
				# Ici le sol etait agrandi de 1,05 et le rebord pose a 1 : il
				# restait donc 5 % de trou tout autour de chaque tuile de
				# rocher, et la MER passait au travers. Les traits bleus au pied
				# des falaises sur la capture du Seeker.
				rim.scale = Vector2(scale_up, scale_up)
				rim.position = Vector2(
					-TILE * 0.5 - grown,
					-(TILE - Iso.BURROW_TILE_H) * 0.5 - grown
				)
				block.add_child(rim)

			# LA RAMPE, ET LA BANDE QU'ELLE RACCROCHE.
			#
			# `hangs` est la ligne du web : une case pend son propre rocher
			# quand elle est une RAMPE (son coin leve ouvre un coin sous son
			# bord bas) ou quand le lift d'un palier DEPASSE les six rangees
			# cuites dans les feuilles. Ce portage leve de dix, donc toute
			# chute est concernee — c'est precisement ce qui laissait passer la
			# mer.
			#
			# `sides` : seulement vers de la TERRE PLUS BASSE. Le rivage reste
			# le rivage, et une voisine de meme niveau couvre elle-meme ce qui
			# pend vers elle. Une rampe, elle, pend vers TOUTE terre, puisque
			# son coin s'ouvre aussi contre une voisine de niveau.
			var ramp_lifts := map.corner_lifts(col, row)
			var is_ramp := false
			for l in ramp_lifts:
				if l != 0:
					is_ramp = true
			var hangs := is_ramp or (drop > 0 and BurrowMap.TIER_LIFT > Slopes.BAKED_LIFT)

			var cell_tier := tier
			var ramping := is_ramp
			var faces := func(nx: int, ny: int) -> bool:
				var there: int = map.level_at(nx, ny)
				return there > 0 and (ramping or there < cell_tier)

			# LE SOL.
			var ground := Sprite2D.new()
			# `tier - 1` : le palier 1 prend la premiere palette. Borne a la
			# derniere pour qu'un relief plus haut que prevu ne sorte pas du
			# tableau.
			var palette: Array = _grass[mini(tier - 1, _grass.size() - 1)]
			var grass: Texture2D = palette[brow][bcol]
			if hangs:
				# Les coins sont en PALIERS ; la deformation les veut en pixels.
				var px: Array = []
				for l in ramp_lifts:
					px.append(int(l) * BurrowMap.TIER_LIFT)
				var warp := [px, _rock[FACE_ROW][bcol],
					faces.call(col, row + 1), faces.call(col + 1, row)]
				grass = Slopes.ramp_texture(
					grass, warp[0], warp[1], BurrowMap.TIER_LIFT, warp[2], warp[3])
				_warp_at[Vector2i(col, row)] = [ground, warp]
			ground.texture = grass
			ground.centered = false
			ground.scale = Vector2(scale_up, scale_up)
			ground.z_index = Z_GROUND
			ground.position = Vector2(
				-TILE * 0.5 - grown,
				-(TILE - Iso.BURROW_TILE_H) * 0.5 - grown
			)
			block.add_child(ground)
			if not hangs:
				_ground_at[Vector2i(col, row)] = ground


## MONTE QUELQUE CHOSE SUR UNE CASE, DANS SON BLOC.
##
## C'est LE moyen de poser un voile — losange de placement, marqueur de piege —
## sur une tuile : dans le bloc de la case, pas en frere libre entre deux
## profondeurs. Une case ne peut pas s'entrelacer avec une case, donc un voile
## monte ici est trie AVEC le sol qu'il recouvre, sur un plateau en terrasses
## comme sur un plat, et sans qu'on ait a y penser.
##
## CE CONTRAT ECRASE LA POSITION du noeud avec le centre du losange, et c'est
## deliberé : cette fonction existe pour les recouvrements EN FORME DE CASE.
## Une planche de cloture n'en est pas un — elle est ancree sur le pied d'un
## poteau, sur une arete — et c'est pourquoi FenceView ne passe pas par ici.
##
## Repond false quand la case n'a pas de bloc (la mer) : a l'appelant de se
## rabattre sur un placement a plat.
##
## POSE SUR LE DESSUS DE LA CASE, pas sur son sol : une case couverte d'une
## motte est plus haute (`rise_at`), et tout ce qu'on y monte — anneau,
## chiffre, X, bombe, losange, coffre — suit sa hauteur, maintenant et quand
## elle change (`set_rise`).
func mount_veil(cell: Vector2i, veil: Node2D, z: int = Z_VEIL) -> bool:
	var block: Node2D = _block_at.get(cell)
	if block == null:
		return false
	veil.position = Vector2(0, Iso.half_h() - rise_at(cell))
	veil.z_index = z
	block.add_child(veil)
	if not _mounted.has(cell):
		_mounted[cell] = []
	(_mounted[cell] as Array).append(veil)
	return true


## DE COMBIEN LE DESSUS D'UNE CASE EST AU-DESSUS DE SON SOL, en pixels
## d'ecran : sa motte levee, enfoncee, ou rien.
func rise_at(cell: Vector2i) -> float:
	return float(_rise.get(cell, 0.0))


## LA CASE CHANGE DE HAUTEUR : tout ce qui y est monte bouge d'AUTANT — un
## ecart, pas une position, pour garder ce que chacun a ajoute a la sienne.
func set_rise(cell: Vector2i, px: float) -> void:
	var was := rise_at(cell)
	if is_equal_approx(was, px):
		return
	_rise[cell] = px
	var alive: Array = []
	for veil in _mounted.get(cell, []):
		if is_instance_valid(veil):
			(veil as Node2D).position.y -= px - was
			alive.append(veil)
	_mounted[cell] = alive
	rise_changed.emit(cell)


## LES MOTTES DU TERRIER, posees sur ces cases : levees, sans brouillard — le
## terrain de chez soi est connu. Le raid les enfonce et les voile case par
## case (`set_sod_look`).
func lay_sods(cells: Array[Vector2i]) -> void:
	for c in cells:
		if _sods.has(c) or not _block_at.has(c):
			continue
		var sod := Sprite2D.new()
		if not mount_tile(c, sod, Z_BED):
			sod.free()
			continue
		_sods[c] = sod
		set_sod_look(c, TileView.Look.COVERED, false)


## UNE MOTTE DU TERRIER : levee ou enfoncee, sous le brouillard ou non.
func set_sod_look(cell: Vector2i, look: int, fogged: bool) -> void:
	var sod: Sprite2D = _sods.get(cell)
	if sod == null or not is_instance_valid(sod):
		return
	var row := clampi(map.level_at(cell.x, cell.y) - 1, 0, TileView.DIG_TILE_TIERS - 1)
	sod.texture = sod_texture(cell, row, look)
	sod.modulate = TileView.sod_tint(cell) * TileView._fog_shade(fogged)
	set_rise(cell, TileView.RAISED_RISE if look == TileView.Look.COVERED else TileView.PRESSED_RISE)


func has_sod(cell: Vector2i) -> bool:
	return _sods.has(cell)


## LE POTAGER EN SABLE (IsoIslandView `groundAt` du web) : chaque case du
## champ troque son herbe pour le jeu sable, AUTOTILE CONTRE LE CHAMP et pas
## contre la terre — la parcelle prend ses bords arrondis la ou elle touche
## le pre. Une case en rampe deforme son sable comme elle deformait l'herbe.
func paint_field(cells: Array[Vector2i]) -> void:
	if _sand.is_empty():
		_sand = _slice(FLAT_SHEET, FLAT_SAND_COL, 4, 4)
	var in_field := {}
	for c in cells:
		in_field[c] = true
	var is_field := func(x: int, y: int) -> bool:
		return in_field.has(Vector2i(x, y))
	for c in _beds:
		if is_instance_valid(c):
			c.queue_free()
	_beds.clear()
	for c in cells:
		var mask := Autotile.mask_at(is_field, c.x, c.y)
		var sand: Texture2D = _sand[Autotile.blob_row(mask)][Autotile.blob_col(mask)]
		var ground: Sprite2D = _ground_at.get(c)
		if ground != null and is_instance_valid(ground):
			ground.texture = sand
		elif _warp_at.has(c):
			# Une rampe du champ : le sable prend la MEME deformation que
			# l'herbe qu'il remplace, coins leves et rocher raccroche compris.
			var warped: Sprite2D = _warp_at[c][0]
			var warp: Array = _warp_at[c][1]
			if is_instance_valid(warped):
				warped.texture = Slopes.ramp_texture(
					sand, warp[0], warp[1], BurrowMap.TIER_LIFT, warp[2], warp[3])
		# LE CARRE DE JARDIN : la motte des cases de l'ile, en terre retournee,
		# posee sur le sable. Le sable reste dessous : c'est lui qui se voit
		# entre deux carres, comme un chemin.
		var bed := Sprite2D.new()
		bed.texture = sod_texture(c, TileView.DIG_TILE_GARDEN_ROW, TileView.Look.COVERED)
		bed.modulate = TileView.sod_tint(c)
		if mount_tile(c, bed, Z_BED):
			_beds.append(bed)
			set_rise(c, TileView.RAISED_RISE)
		else:
			bed.free()


## CREUSE LE SOL D'UNE CASE : son herbe devient le trou peint
## (IsoIslandView `digCell`).
##
## LA TEXTURE EST REMPLACEE, pas recouverte : le milieu du trou EST un trou,
## transparent — pose par-dessus, on verrait l'herbe a travers. Garder le
## sprite garde sa position, son echelle et sa place dans le bloc.
##
## Faux quand la case n'a pas de sol plat (mer, rampe) : l'appelant garde
## alors le cratere peint en losanges.
func dig_cell(cell: Vector2i, row: int = 0) -> bool:
	var ground: Sprite2D = _ground_at.get(cell)
	if ground == null or not is_instance_valid(ground):
		return false
	var pit := AtlasTexture.new()
	pit.atlas = FLAT_SHEET
	pit.region = Rect2(FLAT_CUSTOM_COL * TILE, row * TILE, TILE, TILE)
	ground.texture = pit
	return true


## POSE UNE TUILE DE 64 EXACTEMENT COMME LE SOL de sa case — meme echelle,
## meme coin, dans le meme bloc. C'est la motte des cases non creusees
## (`TileView`) : peinte au format des feuilles, elle doit tomber pixel pour
## pixel sur l'herbe qu'elle couvre.
##
## Faux quand la case n'a pas de bloc.
func mount_tile(cell: Vector2i, sprite: Sprite2D, z: int) -> bool:
	var block: Node2D = _block_at.get(cell)
	if block == null:
		return false
	var scale_up := Iso.BURROW_TILE_W / GROUND_PAINTED_W
	var grown := TILE * (scale_up - 1.0) * 0.5
	sprite.centered = false
	sprite.scale = Vector2(scale_up, scale_up)
	sprite.position = Vector2(
		-TILE * 0.5 - grown,
		-(TILE - Iso.BURROW_TILE_H) * 0.5 - grown
	)
	sprite.z_index = z
	block.add_child(sprite)
	return true


## LA MOTTE D'UNE CASE, prise dans `TileView.DIG_TILE` : rangee `row` (le
## palier, ou le potager), motte `look` (levee, enfoncee), et la FORME de sa
## rampe — les seize formes y sont peintes lisses (`tools/paint_dig_tile.py`),
## colonne `forme*2 + motte`, forme `n*8+e*4+s*2+w` en paliers.
##
## Une rampe de plus d'un palier a un coin n'a pas de forme peinte : la motte
## plate y est deformee comme l'herbe, cassure comprise. Rare, et mieux qu'un
## trou.
func sod_texture(cell: Vector2i, row: int, look: int) -> Texture2D:
	var form := 0
	var lifts: Array = []
	if _warp_at.has(cell):
		lifts = (_warp_at[cell][1] as Array)[0]
		for i in 4:
			var l := int(lifts[i]) / BurrowMap.TIER_LIFT
			if l > 1:
				form = -1
				break
			form = form * 2 + l
	var frame := AtlasTexture.new()
	frame.atlas = TileView.DIG_TILE
	frame.region = Rect2((maxi(form, 0) * 2 + look) * TILE, row * TILE, TILE, TILE)
	if form < 0:
		return Slopes.ramp_texture(frame, lifts, null, 0, false, false)
	return frame


## Le bloc d'une case existe-t-il ? (Pour savoir avant de construire.)
func has_block(cell: Vector2i) -> bool:
	return _block_at.has(cell)


## LA NAPPE, taillee a la forme du plateau.
##
## Un rectangle ferait l'affaire pour les coutures interieures, mais il
## deborderait du losange et mettrait du vert dans le ciel. On suit donc le
## contour : pour chaque case de terre, son losange, fondus en un seul
## polygone par le moteur.
##
## Dessinee TRES en arriere (z_index plancher) pour qu'aucun bloc ne passe
## derriere elle, quelle que soit sa profondeur.
func _paint_underlay() -> void:
	if _underlay != null:
		_underlay.queue_free()
	_underlay = Polygon2D.new()
	_underlay.color = UNDERLAY
	_underlay.z_index = -4096
	add_child(_underlay)

	# Un losange par case, tous dans le meme Polygon2D via ses `polygons`.
	var points := PackedVector2Array()
	var faces := []
	var hw := Iso.half_w()
	var hh := Iso.half_h()
	for row in range(map.height):
		for col in range(map.width):
			if not map.is_land(col, row):
				continue
			# LA NAPPE NE VA QUE SUR LES CASES ENTIEREMENT ENTOUREES DU MEME
			# PALIER — huit voisines, pas quatre, et au meme niveau.
			#
			# Deux erreurs successives ici, toutes deux visibles a l'ecran :
			#
			#   • quatre voisines seulement : un losange a des COINS, et c'est
			#     par la diagonale que la nappe ressortait.
			#   • « de la terre » au lieu de « le meme palier » : une case du
			#     plateau dont la voisine nord est au niveau du sol porte sa
			#     nappe a douze pixels quand la tuile d'a cote n'est qu'a six.
			#     Le losange uni ressortait donc AU-DESSUS d'elle, en plein
			#     ciel — les triangles verts au nord du plateau.
			#
			# Une case bordee par un palier different est deja un bord : elle
			# n'a pas de couture a cacher de ce cote, et la falaise de sa
			# voisine occupe la place.
			if not _flush(col, row):
				continue
			var at := map.screen_of(col, row)
			var base := points.size()
			# Le losange est GROSSI d'un pixel : c'est lui qui recouvre la
			# couture, et un pixel suffit puisque c'est la largeur du trou.
			points.append(at + Vector2(0, -hh - 1))
			points.append(at + Vector2(hw + 1, 0))
			points.append(at + Vector2(0, hh + 1))
			points.append(at + Vector2(-hw - 1, 0))
			faces.append(PackedInt32Array([base, base + 1, base + 2, base + 3]))

	_patch_seams(points, faces)
	_underlay.polygon = points
	_underlay.polygons = faces


## LES COUTURES QUE LA NAPPE PAR CASE NE BOUCHE PAS.
##
## LA NAPPE CI-DESSUS NE SE POSE QUE SUR LES CASES D'INTERIEUR — huit voisines
## au meme palier — et c'est la bonne regle pour elle : un losange plein pose
## sur une case de bord deborderait au-dessus de sa voisine basse, en plein
## ciel. Voir l'appelant.
##
## MAIS SUR L'ILE CETTE REGLE NE COUVRE PRESQUE RIEN. Ses plateaux sont petits
## et decoupes : MESURE sur la graine « default », 70 % des cases du palier 2 et
## 77 % de celles du palier 3 n'ont pas huit voisines de leur palier. Resultat,
## 419 des 974 coutures entre cases de MEME palier restaient a nu — les traits
## noirs en diagonale qu'on voit sur la capture du Seeker, le long du plateau.
## Le terrier ne montrait pas le probleme : sa terre est d'un seul tenant.
##
## ON RECOUD DONC PAR COUTURE, ET NON PAR CASE. Entre deux voisines de MEME
## palier il n'y a, par construction, aucune case basse a surplomber : le
## quadrilatere qui joint leurs deux centres ne peut pas deborder dans le ciel.
## C'est exactement la condition que la regle par case cherchait a garantir, et
## elle se verifie ici sur la PAIRE plutot que sur les huit voisines.
##
## Seulement vers l'est et le sud : chaque couture appartient a une seule paire,
## et la parcourir deux fois doublerait les polygones pour rien.
func _patch_seams(points: PackedVector2Array, faces: Array) -> void:
	var hw := Iso.half_w()
	var hh := Iso.half_h()
	for row in range(map.height):
		for col in range(map.width):
			var tier := map.level_at(col, row)
			if tier == 0:
				continue
			for step: Vector2i in [Vector2i(1, 0), Vector2i(0, 1)]:
				var nx: int = col + step.x
				var ny: int = row + step.y
				if map.level_at(nx, ny) != tier:
					continue
				# LES DEUX CENTRES, et les deux sommets qu'ils partagent : le
				# quadrilatere est le losange de la couture elle-meme, grossi
				# d'un pixel comme celui des cases.
				var a := map.screen_of(col, row) + Vector2(0, hh)
				var b := map.screen_of(nx, ny) + Vector2(0, hh)

				# LE QUADRILATERE EST BATI SUR LES DEUX SOMMETS PARTAGES, et
				# c'est ce qui garantit qu'il ne deborde nulle part.
				#
				# Deux cases voisines partagent une ARETE, donc deux sommets de
				# losange. Ces deux points appartiennent aux DEUX tuiles par
				# construction : un quadrilatere centre-sommet-centre-sommet ne
				# peut donc pas sortir de leur reunion, quelle que soit la
				# direction de la couture.
				#
				# LA PREMIERE VERSION CALCULAIT UNE PERPENDICULAIRE (en mettant
				# la normale a l'echelle par hw/hh), et c'etait faux : la normale
				# d'une arete de losange n'est pas la perpendiculaire mise a
				# l'echelle. Mesure a 5,25 px de vert plat au-dela de la cote —
				# exactement la bande que la regle par case existait pour eviter,
				# « pire que le trou qu'elle corrige ». Les faces par case
				# debordaient, elles, de 0,00 px : c'est ce qui a designe le
				# coupable.
				var mid := (a + b) * 0.5
				var half := (b - a) * 0.5
				# Les deux sommets partages : a angle droit de l'axe des centres
				# DANS LE REPERE DU LOSANGE, ou une demi-largeur vaut une
				# demi-hauteur. On y va par la grille, pas par la trigonometrie.
				var shared_a := mid + Vector2(half.y * hw / hh, half.x * hh / hw)
				var shared_b := mid - Vector2(half.y * hw / hh, half.x * hh / hw)
				var base := points.size()
				points.append(a)
				points.append(shared_a)
				points.append(b)
				points.append(shared_b)
				faces.append(PackedInt32Array([base, base + 1, base + 2, base + 3]))


## Cette case est-elle cernee par huit voisines du MEME palier ?
##
## C'est la condition pour porter la nappe : ailleurs, elle deborderait. Voir
## l'appelant pour les deux facons dont elle depassait avant.
func _flush(col: int, row: int) -> bool:
	var tier := map.level_at(col, row)
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if map.level_at(col + dx, row + dy) != tier:
				return false
	return true


func clear() -> void:
	# LES NOEUDS ET LEUR LISTE MEURENT ENSEMBLE. Le web a paye cette lecon avec
	# des bombes qui disparaissaient : un cache indexe par noeud avait survecu a
	# la destruction du terrain, et sa garde « je l'ai deja » refusait ensuite
	# chaque re-ajout.
	for block in _blocks:
		block.queue_free()
	_blocks.clear()
	_block_at.clear()
	_ground_at.clear()
	_warp_at.clear()
	_beds.clear()
	_rise.clear()
	_mounted.clear()
	_sods.clear()
	if _underlay != null:
		_underlay.queue_free()
		_underlay = null


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
