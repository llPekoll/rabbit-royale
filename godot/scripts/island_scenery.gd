extends Node2D
class_name IslandScenery
## CE QUI SE TIENT DEBOUT SUR L'ILE — arbres, objets, reperes, moutons, soldats.
##
## Porte de src/game/island/IsoIslandView.ts (`drawPlacements`, `windPhase`,
## `freePhase`, `update`, `clearDecoOver`, `clearCell`) et des chiffres de
## src/game/island/tileset.ts, tous MESURES sur l'art la-bas et recopies ici
## sans retouche.
##
## CE NOEUD NE TIRE RIEN AU SORT. Il dessine `IslandGround.placements`, et rien
## d'autre — le web a appris la lecon a ses depens : sa vue continuait de
## semer ses propres arbres pendant que le serveur avait les siens, « un pin sur
## une case que le serveur disait libre, un carre d'herbe nue la ou le serveur
## avait un arbre ». Ce qu'on voit bloquer une case est ce que le serveur
## refuse de fouler, parce que c'est la meme liste.
##
## LES BUISSONS NE SONT PAS ICI : TileView les pose deja (ils sont sur le
## plateau de la lecon aussi). Les dessiner deux fois donnerait deux buissons
## qui se balancent a contretemps sur la meme case.
##
## TOUT EST MONTE DANS LE BLOC DE SA CASE, par `BurrowTerrain.mount_veil`,
## exactement comme les buissons et le coffre de TileView — au meme `Z_PROP`.
## Le web posait son decor en freres du plateau, tries sur `isoDepth + 1` ;
## ici le bloc porte deja cette profondeur (`Iso.depth + palier`), et un arbre
## monte dedans se trie AVEC le sol qu'il foule : la case de devant le couvre,
## celle de derriere passe dessous, sur un plateau en terrasses comme a plat.
## Un z_index litteral pose en frere libre, c'est le piege de l'eclair a 60
## (voir la memoire « fx depth ruler ») : partout ailleurs, le decor passe
## devant.
##
## `mount_veil` ECRASE LA POSITION avec le centre de la case — et c'est ce
## qu'on veut ici : tout ce qui se tient debout a son pied AU CENTRE de sa case
## (« un arbre, un buisson, un mouton se tient au milieu de sa case parce que
## la case est ce qu'il revendique »). Le pied est donc porte par `offset`,
## jamais par `position`. Sur une rampe, le centre est deja leve de la moyenne
## des coins : `screen_of` l'inclut, comme le `meanLift` de `stamp` du web.
##
## CE QUI N'EST PAS PORTE, et pourquoi :
##   • les OMBRES DE CONTACT — `decoShadows: false` dans TerrainBackground.ts,
##     le jeu du web ne les dessine pas ;
##   • les SOUCHES — rien ne coupe d'arbre sur l'ile aujourd'hui ;
##   • le clignotement d'un decor souffle par une bombe (`blastDeco`) : on
##     l'enleve d'un coup, `clear_cell(cell, true)` ;
##   • les touffes d'herbe (`buildGrass`) — de la texture, pas des occupants.

## LES ARBRES — un atlas Aseprite (trees.png + trees.json), mais parfaitement
## regulier : 36 images de 121x244 sur une grille de 10, au pas de 123x246,
## decalees de 2. Huit images de balancement puis une souche, quatre fois.
## Les images sont ROGNEES : 244 est la hauteur de la fenetre, pas de la cel
## de 256, et les pieds se mesurent contre 244.
const TREES := preload("res://assets/deco/trees.png")
const TREE_FRAME := Vector2i(121, 244)
const TREE_SHEET_COLS := 10
const TREE_PAD := 2
const TREE_PITCH := Vector2i(123, 246)
const TREE_SWAY_FRAMES := 8
const TREE_VARIANT_STRIDE := TREE_SWAY_FRAMES + 1
## Ou chaque arbre touche le sol, dans ses 244 pixels. Quatre arbres, quatre
## chiffres : « le deuxieme remplit son cadre jusqu'a la derniere rangee quand
## le quatrieme s'arrete 17 px avant — un seul ancrage en planterait un et
## laisserait l'autre en l'air ».
const TREE_FOOT_PX := [236.0, 244.0, 229.0, 227.0]

## LES DIX-HUIT OBJETS : quinze « naturels » (champignons, pierres, os...) pour
## `prop`, puis trois reperes (un panneau, un epouvantail...) pour `landmark` —
## le `slice(NATURAL_PROPS)` du web.
const PROPS: Array[Texture2D] = [
	preload("res://assets/deco/props/prop-01.png"),
	preload("res://assets/deco/props/prop-02.png"),
	preload("res://assets/deco/props/prop-03.png"),
	preload("res://assets/deco/props/prop-04.png"),
	preload("res://assets/deco/props/prop-05.png"),
	preload("res://assets/deco/props/prop-06.png"),
	preload("res://assets/deco/props/prop-07.png"),
	preload("res://assets/deco/props/prop-08.png"),
	preload("res://assets/deco/props/prop-09.png"),
	preload("res://assets/deco/props/prop-10.png"),
	preload("res://assets/deco/props/prop-11.png"),
	preload("res://assets/deco/props/prop-12.png"),
	preload("res://assets/deco/props/prop-13.png"),
	preload("res://assets/deco/props/prop-14.png"),
	preload("res://assets/deco/props/prop-15.png"),
	preload("res://assets/deco/props/prop-16.png"),
	preload("res://assets/deco/props/prop-17.png"),
	preload("res://assets/deco/props/prop-18.png"),
]
const NATURAL_PROPS := 15
## Jusqu'ou descend l'art de chaque objet dans sa boite. Ils sont cadres
## differemment — un champignon s'arrete a y=43 dans 64, un panneau a y=104
## dans 128 — donc un ancrage partage a 0,5 en ferait flotter certains et en
## enterrerait d'autres.
const PROP_FOOT_PX := [43.0, 47.0, 49.0, 37.0, 40.0, 49.0, 43.0, 49.0, 53.0,
	46.0, 50.0, 51.0, 55.0, 47.0, 44.0, 104.0, 105.0, 169.0]

## LES VIVANTS : une bande d'images par feuille, la rangee 0 (le repos).
##
## LES FEUILLES SONT ROGNEES A LEUR PREMIERE RANGEE a la copie : le web charge
## les planches completes (jusqu'a 1536x1344) et n'en joue que la rangee 0.
## Tout le reste serait du poids mort dans l'APK.
##
## `foot` est mesure sur l'art, comme `PROP_FOOT_PX` : un personnage ancre au
## bas de sa boite flotte, ancre a son pied il se tient debout. L'archer n'a
## que SIX images dessinees sur huit cases — joue a huit, « il disparaissait un
## quart de chaque boucle ».
const UNITS := {
	"sheepIdle": {"sheet": preload("res://assets/units/sheep-idle.png"), "cell": 128, "cols": 8, "foot": 86.0},
	"pawnBlue": {"sheet": preload("res://assets/units/pawn-blue.png"), "cell": 192, "cols": 6, "foot": 128.0},
	"warriorBlue": {"sheet": preload("res://assets/units/warrior-blue.png"), "cell": 192, "cols": 6, "foot": 136.0},
	"archerBlue": {"sheet": preload("res://assets/units/archer-blue.png"), "cell": 192, "cols": 6, "foot": 134.0},
	"warriorRed": {"sheet": preload("res://assets/units/warrior-red.png"), "cell": 192, "cols": 6, "foot": 136.0},
	"torchRed": {"sheet": preload("res://assets/units/torch-red.png"), "cell": 192, "cols": 7, "foot": 133.0},
	"pawnRed": {"sheet": preload("res://assets/units/pawn-red.png"), "cell": 192, "cols": 8, "foot": 135.0},
}
## `drawPlacements` : `kinds[p.variant % kinds.length]`. Le mouton n'a que sa
## feuille calme — le rebond est le GALOP d'un mouton qui fuit, pas une
## seconde race. Le tirage de `IslandGround` rend une variante de 0 a 2, donc
## seuls les trois premiers soldats sortent aujourd'hui ; la liste reste celle
## du web pour que la regle ne change pas le jour ou le tirage s'elargit.
const SHEEP_KINDS := ["sheepIdle"]
## LE GALOP (`GAIT_SHEET.bolt`) : la feuille qui rebondit, six images. Joue
## seulement pendant une fuite, puis le mouton revient a sa feuille calme.
const SHEEP_BOUNCE := {"sheet": preload("res://assets/units/sheep-bounce.png"), "cell": 128, "cols": 6, "foot": 86.0}

## LE TEMPS POUR TRAVERSER UNE CASE (`GRAZE_MS_PER_CELL`, `SPRINT_MS_PER_CELL`)
## — par case et non par ordre, sinon un sprint de quatre cases serait aussi
## court qu'un pas et se lirait comme une teleportation. Les deux tiennent dans
## le tour du troupeau (500 ms) : une marche finit avant l'ordre suivant.
const GRAZE_SECONDS_PER_CELL := 0.32
const SPRINT_SECONDS_PER_CELL := 0.11
const SOLDIER_KINDS := ["pawnBlue", "warriorBlue", "archerBlue", "warriorRed", "torchRed", "pawnRed"]

## LES ECHELLES — celles du web, et c'est la meme regle que les buissons de
## TileView (`BUSH_SCALE`).
##
## `DECO_SCALE = 0.4` (services/TerrainBackground.ts) pour l'art du pack, taille
## pour des cases de 64 : un pin de 244 px fait ~98 px, trois cases de haut.
## Les VIVANTS n'y passent PAS — `drawPlacements` saute le `scale.set(scale)`
## pour eux et ne garde que leur propre facteur : 0,62 pour un mouton, 0,5 pour
## un soldat. Ce n'est pas un oubli du portage, c'est la ligne du web.
const DECO_SCALE := 0.4
const SHEEP_SCALE := 0.62
const SOLDIER_SCALE := 0.5

## Une image de balancement, en ms (`DEFAULT_FRAME_MS`) — le meme tempo que
## les buissons de TileView.
const FRAME_MS := 130.0

## LE VENT. Chaque arbre porte une phase FRACTIONNAIRE — sa distance le long du
## vent — pour que le balancement arrive a un arbre apres l'autre et traverse
## l'ile comme une rafale. Avec une horloge commune et des decalages entiers,
## « quarante arbres, huit phases possibles, cinq d'entre eux toujours a
## l'unisson : ca se lit comme une horloge, pas comme du temps qu'il fait ».
## Sud-est, comme la lumiere.
const WIND := Vector2(1.0, 0.6)
const WIND_TILES_PER_FRAME := 1.7

## Combien de rangees PLUS PRES de la camera un decor peut encore recouvrir :
## un pin fait trois cases de haut, celui plante trois rangees devant un
## coffre couvre encore la boite.
const COVER_REACH := 3

## Au meme etage que les buissons et le coffre : ce qui SE TIENT sur la case,
## au-dessus du voile, du X et de l'anneau.
const Z_PROP := TileView.Z_PROP

var terrain: BurrowTerrain

## case -> Array des noeuds poses dessus. Un TABLEAU, pas un noeud : un soldat
## peut etre pose sur la case d'un objet (`scatterLivestock` ne bloque que ce
## qui n'est pas un `prop`), et le web les dessine tous les deux.
var _at: Dictionary = {}
## Ce qui s'anime : `{node, kind, variant, count, phase, shown}`.
var _animated: Array[Dictionary] = []
## Le genre de chaque noeud, pour `clear_cell(…, keep_wanderers)`.
var _kind_of: Dictionary = {}
## LE TROUPEAU, par id : `{node, anim, cell, walk, bolting}`. `cell` est la
## case que le PLATEAU lui donne — la destination des l'ordre recu, comme le
## web : le sprite rattrape, la regle n'attend pas.
var _sheep: Dictionary = {}
var _elapsed_ms := 0.0


## Dessine chaque placement de `ground`, SAUF les buissons (TileView) et les
## cases de `skip` (cles Vector2i). Rappelable : tout est jete avant.
func build(ground: IslandGround, skip: Dictionary = {}) -> void:
	clear()
	if ground == null or terrain == null:
		return

	# LES PHASES DES VIVANTS : au hasard, mais d'un flux a part tire de la
	# graine (`<graine>:frames`), comme le web — « une patrouille n'est pas
	# poussee par le vent, et une phase par position mettrait des voisins au
	# pas ». On tire POUR CHAQUE vivant, meme ceux qu'on saute : une case
	# sautee ne doit pas decaler la phase de tous les suivants.
	var rng := Rng.from_seed("%s:frames" % ground.seed_text)

	for p: Dictionary in ground.placements:
		var kind: String = p.kind
		if kind == "bush":
			continue
		var cell := Vector2i(int(p.x), int(p.y))
		# UN MOUTON SE DESSINE LA OU IL EST, pas la ou la graine l'a pose.
		if kind == "sheep":
			cell = ground.sheep.get(p.get("id", ""), cell)
		var variant: int = int(p.variant)
		var living := kind == "sheep" or kind == "soldier"
		var node: Sprite2D
		var phase := 0.0
		var unit := ""

		match kind:
			"tree":
				node = _tree(variant)
				phase = _wind_phase(cell)
			"sheep", "soldier":
				var kinds: Array = SHEEP_KINDS if kind == "sheep" else SOLDIER_KINDS
				unit = kinds[variant % kinds.size()]
				node = _unit(unit, SHEEP_SCALE if kind == "sheep" else SOLDIER_SCALE)
				phase = rng.next() * float(UNITS[unit].cols)
			_:
				# Objets et reperes : du fouillis pose, une image fixe chacun.
				var first := NATURAL_PROPS if kind == "landmark" else 0
				var count := PROPS.size() - NATURAL_PROPS if kind == "landmark" else NATURAL_PROPS
				node = _prop(first + variant % count)

		if skip.has(cell) or not terrain.mount_veil(cell, node, Z_PROP):
			# Pas de bloc (la mer) ou case ecartee par l'appelant : rien a
			# poser. Le tirage de phase a deja eu lieu, c'est voulu.
			node.free()
			continue

		if not _at.has(cell):
			_at[cell] = []
		_at[cell].append(node)
		_kind_of[node] = kind
		if kind == "tree":
			_animated.append({"node": node, "tree": variant % TREE_FOOT_PX.size(),
				"count": TREE_SWAY_FRAMES, "phase": phase, "shown": -1})
		elif living:
			var anim := {"node": node, "tree": -1,
				"count": int(UNITS[unit].cols), "phase": phase, "shown": -1}
			_animated.append(anim)
			if kind == "sheep":
				_sheep[String(p.get("id", ""))] = {"node": node, "anim": anim,
					"cell": cell, "walk": {}, "bolting": false}

	_advance()


## ENLEVE LE DECOR DEVANT UN COFFRE (`clearDecoOver`).
##
## Les coffres sont distribues par la graine PRIVEE, les arbres par la graine
## publique : les deux ne peuvent pas etre reconcilies a la generation sans
## trahir le plateau. Une fois que le serveur a dit ou est le coffre, ce qui
## se tient devant s'en va.
##
## DEVANT, sur la regle de l'ile : `dx + dy` rangees plus pres de la camera,
## entre 1 et `COVER_REACH`. Et VRAIMENT par-dessus la boite : a `|dx - dy| = 2`
## la case est une case entiere a cote, et ne couvre rien quelle que soit sa
## hauteur. La case du coffre elle-meme n'est jamais videe.
##
## Les buissons de TileView ne sont pas touches ici : ils ne sont pas a ce
## noeud. Le web les enlevait aussi — a l'appelant de le faire s'il le veut.
##
## SAUF LES MOUTONS : ils s'en vont d'eux-memes, et un mouton efface ici
## resterait au troupeau — invisible, et bloquant sa case.
func clear_over(cell: Vector2i) -> void:
	for c in cells_in_front(cell):
		clear_cell(c, true)


## LES CASES QUI CACHENT `cell` A LA CAMERA : devant elle (dx, dy >= 0), a
## trois pas au plus, dans le cone de la diagonale. Statique parce que les
## buissons, dessines par `TileView`, doivent s'effacer des memes cases.
static func cells_in_front(cell: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for dx in range(COVER_REACH + 1):
		for dy in range(COVER_REACH + 1):
			var nearer := dx + dy
			if nearer == 0 or nearer > COVER_REACH:
				continue
			if absi(dx - dy) > 1:
				continue
			out.append(cell + Vector2i(dx, dy))
	return out


## ENLEVE TOUT CE QUI SE TIENT SUR UNE CASE (`clearCell`) — le noeud et sa
## place dans le balancement ensemble, pour que rien ne reste a s'animer sur
## une case dont l'arbre est parti.
##
## `keep_wanderers` : le cas de la bombe (`blastDeco`). Un mouton laisse sa
## case cultivable, donc une bombe peut sauter sous lui ; mais c'est le
## SERVEUR qui possede le troupeau, et l'effacer ici laisserait ce client court
## d'une bete pour le reste de la manche.
func clear_cell(cell: Vector2i, keep_wanderers: bool = false) -> void:
	if not _at.has(cell):
		return
	var kept: Array = []
	for node in _at[cell]:
		if keep_wanderers and IslandGround.WANDERS.has(_kind_of.get(node, "")):
			kept.append(node)
			continue
		_drop(node)
	if kept.is_empty():
		_at.erase(cell)
	else:
		_at[cell] = kept


## Ce qui est pose sur une case — pour les verifications.
func nodes_at(cell: Vector2i) -> Array:
	return _at.get(cell, [])


func clear() -> void:
	for cell in _at:
		for node in _at[cell]:
			# Le terrain a pu etre reconstruit entre-temps : ses blocs sont
			# partis, et nos noeuds avec eux.
			if is_instance_valid(node):
				node.queue_free()
	_at.clear()
	_kind_of.clear()
	_animated.clear()
	_sheep.clear()


func _process(delta: float) -> void:
	_elapsed_ms += delta * 1000.0
	_advance_walks(delta)
	_advance()


# ---------------------------------------------------------------- le troupeau
#
# Porte de `placeOccupant`, `walkOccupant`, `advanceWalks` et `setGait`
# (IsoIslandView.ts). Au repos, un mouton est monte dans le bloc de sa case,
# comme tout le decor. EN MARCHE, il sort du bloc — il est entre deux cases,
# et un bloc n'en tient qu'une — et se trie lui-meme sur la regle des blocs.

## POSE UN MOUTON SUR UNE CASE, d'un coup : un instantane dit ou il EST, pas
## comment il y est venu. Annule la marche en cours.
func place_sheep(id: String, cell: Vector2i) -> bool:
	var s: Dictionary = _sheep.get(id, {})
	if s.is_empty() or not is_instance_valid(s.node):
		return false
	s.walk = {}
	_rehome(s, cell)
	_set_gait(s, false)
	_mount_sheep(s)
	return true


## ENVOIE UN MOUTON LE LONG DES CASES QU'IL TRAVERSE (`path` du serveur).
##
## Part de la ou il est DESSINE, pas de sa case : un ordre qui interrompt une
## marche repartirait sinon d'un bond en avant. La marche en cours est jetee,
## pas mise en file : le serveur ordonne au rythme du troupeau, un second
## ordre rend le premier perime.
func walk_sheep(id: String, cells: Array[Vector2i], sprinting: bool) -> bool:
	var s: Dictionary = _sheep.get(id, {})
	if s.is_empty() or cells.is_empty() or not is_instance_valid(s.node):
		return false
	var node: Node2D = s.node
	var from_cell: Vector2i = s.cell
	var from_px := _cell_px(from_cell)
	if node.get_parent() == self:
		from_px = node.position
		if not (s.walk as Dictionary).is_empty():
			from_cell = s.walk.from_cell
	if node.get_parent() != null and node.get_parent() != self:
		node.get_parent().remove_child(node)
	if node.get_parent() == null:
		add_child(node)
	s.walk = {"from_px": from_px, "from_cell": from_cell, "cells": cells.duplicate(),
		"elapsed": 0.0, "leg": SPRINT_SECONDS_PER_CELL if sprinting else GRAZE_SECONDS_PER_CELL}
	_rehome(s, cells[-1])
	_set_gait(s, sprinting)
	_draw_walk(s)
	return true


func _advance_walks(delta: float) -> void:
	for id in _sheep:
		var s: Dictionary = _sheep[id]
		var walk: Dictionary = s.walk
		if walk.is_empty():
			continue
		if not is_instance_valid(s.node):
			s.walk = {}
			continue
		walk.elapsed += delta
		# Une longue image peut depasser une foulee entiere : on consomme les
		# pas en boucle, sinon un telephone lent laisserait le mouton derriere
		# le serveur d'autant plus que l'image est lente.
		while not (walk.cells as Array).is_empty() and walk.elapsed >= walk.leg:
			walk.elapsed -= walk.leg
			walk.from_cell = walk.cells[0]
			walk.from_px = _cell_px(walk.cells[0])
			(walk.cells as Array).pop_front()
		if (walk.cells as Array).is_empty():
			# ARRIVE : il rentre dans le bloc de sa case, et broute.
			s.walk = {}
			_set_gait(s, false)
			_mount_sheep(s)
		else:
			_draw_walk(s)


## Ou dessiner un mouton en marche, et a quelle profondeur. La profondeur est
## celle de la PLUS PROCHE des deux cases qu'il enjambe : en remontant vers le
## nord, prendre la case d'arrivee le glisserait sous le sol qu'il quitte.
func _draw_walk(s: Dictionary) -> void:
	var walk: Dictionary = s.walk
	var node: Node2D = s.node
	var next: Vector2i = walk.cells[0]
	var from: Vector2i = walk.from_cell
	var t := clampf(float(walk.elapsed) / float(walk.leg), 0.0, 1.0)
	var to_px := _cell_px(next)
	node.position = (walk.from_px as Vector2).lerp(to_px, t)
	var map := terrain.map
	node.z_index = maxi(Iso.depth(from.x, from.y) + map.level_at(from.x, from.y),
		Iso.depth(next.x, next.y) + map.level_at(next.x, next.y)) + Z_PROP
	# IL REGARDE OU IL VA : un miroir en x, comme le lapin.
	var dx := to_px.x - (walk.from_px as Vector2).x
	if absf(dx) > 0.5:
		(node as Sprite2D).flip_h = dx < 0.0


## Le pied d'une case, dans le repere du terrain — la ou `mount_veil` pose.
func _cell_px(c: Vector2i) -> Vector2:
	return terrain.map.screen_of(c.x, c.y) + Vector2(0, Iso.half_h())


## Rentre le mouton dans le bloc de sa case.
func _mount_sheep(s: Dictionary) -> void:
	var node: Node2D = s.node
	if node.get_parent() != null:
		node.get_parent().remove_child(node)
	if not terrain.mount_veil(s.cell, node, Z_PROP):
		# Pas de bloc (ne devrait pas arriver sur une case praticable) : on le
		# garde ici, a sa place, plutot que de le perdre.
		add_child(node)
		node.position = _cell_px(s.cell)
		node.z_index = Iso.depth(s.cell.x, s.cell.y) + terrain.map.level_at(s.cell.x, s.cell.y) + Z_PROP


## Deplace le mouton d'une case a l'autre dans `_at` — ce que `nodes_at` et
## `clear_cell` lisent.
func _rehome(s: Dictionary, cell: Vector2i) -> void:
	var old: Vector2i = s.cell
	if _at.has(old):
		(_at[old] as Array).erase(s.node)
		if (_at[old] as Array).is_empty():
			_at.erase(old)
	if not _at.has(cell):
		_at[cell] = []
	_at[cell].append(s.node)
	s.cell = cell


## `setGait` : la feuille dit ce que fait le mouton — il broute, ou il detale.
## Le cycle repart a zero : les deux feuilles n'ont pas la meme longueur, et un
## index garde tomberait en plein bond.
func _set_gait(s: Dictionary, bolting: bool) -> void:
	if bool(s.bolting) == bolting:
		return
	s.bolting = bolting
	var g: Dictionary = SHEEP_BOUNCE if bolting else UNITS[SHEEP_KINDS[0]]
	var node: Sprite2D = s.node
	node.texture = g.sheet
	node.hframes = int(g.cols)
	node.frame = 0
	node.offset = Vector2(-float(g.cell) * 0.5, -float(g.foot))
	var anim: Dictionary = s.anim
	anim.count = int(g.cols)
	anim.phase = -_elapsed_ms / FRAME_MS
	anim.shown = -1


## `update` du web : chaque sprite divise le MEME temps ecoule, et la phase est
## ajoutee AVANT l'arrondi — sinon une phase fractionnaire ne survit pas et
## tout le monde retombe sur le meme tic.
func _advance() -> void:
	var t := _elapsed_ms / FRAME_MS
	for a in _animated:
		var n: int = a.count
		var i := posmod(int(floor(t + float(a.phase))), n)
		if i == int(a.shown):
			continue
		a.shown = i
		var node: Sprite2D = a.node
		if not is_instance_valid(node):
			continue
		if int(a.tree) >= 0:
			node.region_rect = _tree_rect(int(a.tree) * TREE_VARIANT_STRIDE + i)
		else:
			node.frame = i


func _drop(node: Node) -> void:
	for k in range(_animated.size() - 1, -1, -1):
		if _animated[k].node == node:
			_animated.remove_at(k)
	for id in _sheep.keys():
		if _sheep[id].node == node:
			_sheep.erase(id)
	_kind_of.erase(node)
	if is_instance_valid(node):
		node.queue_free()


## `windPhase` : combien sa case est sous le vent. Deux arbres sur la meme
## ligne de rafale se balancent ensemble — c'est ce qu'EST une rafale.
func _wind_phase(cell: Vector2i) -> float:
	return (float(cell.x) * WIND.x + float(cell.y) * WIND.y) / WIND_TILES_PER_FRAME


# ---------------------------------------------------------------- les sprites
#
# Tous ancres de la meme facon : `centered = false`, et un `offset` qui met le
# milieu de l'art en x et son PIED en y sur l'origine du noeud — que
# `mount_veil` pose au centre du losange. L'`anchor(0.5, pied / hauteur)` du
# web, en pixels de texture.

func _tree(variant: int) -> Sprite2D:
	var v := variant % TREE_FOOT_PX.size()
	var s := Sprite2D.new()
	s.texture = TREES
	s.region_enabled = true
	s.region_rect = _tree_rect(v * TREE_VARIANT_STRIDE)
	s.centered = false
	s.offset = Vector2(-TREE_FRAME.x * 0.5, -float(TREE_FOOT_PX[v]))
	s.scale = Vector2(DECO_SCALE, DECO_SCALE)
	return s


func _tree_rect(i: int) -> Rect2:
	return Rect2(
		TREE_PAD + (i % TREE_SHEET_COLS) * TREE_PITCH.x,
		TREE_PAD + (i / TREE_SHEET_COLS) * TREE_PITCH.y,
		TREE_FRAME.x, TREE_FRAME.y)


func _prop(index: int) -> Sprite2D:
	var tex := PROPS[index]
	var s := Sprite2D.new()
	s.texture = tex
	s.centered = false
	s.offset = Vector2(-tex.get_width() * 0.5, -float(PROP_FOOT_PX[index]))
	s.scale = Vector2(DECO_SCALE, DECO_SCALE)
	return s


func _unit(unit: String, size: float) -> Sprite2D:
	var g: Dictionary = UNITS[unit]
	var s := Sprite2D.new()
	s.texture = g.sheet
	s.hframes = int(g.cols)
	s.centered = false
	s.offset = Vector2(-float(g.cell) * 0.5, -float(g.foot))
	s.scale = Vector2(size, size)
	return s
