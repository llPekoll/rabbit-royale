extends Node2D
class_name RaidBoard
## LE PLATEAU DU RAID — le terrier d'un autre, lu depuis la porte.
##
## Porte de src/game/scenes/BurrowScene.ts (`setRaid`, `buildRaidCells`,
## `setClue`, `lightSteps`, `hangArrow`). Le terrier (burrow.gd) pose le sol
## du DEFENSEUR ; ce noeud dessine par-dessus ce que le serveur a dit, et
## RIEN d'autre : quelles cases le pillard a vues, leurs chiffres, ou il peut
## poser le pied. C'est tout le modele de securite d'un raid — un client qui
## calculerait sa propre vue calculerait aussi les bombes.
##
## LE DOMAINE EST A VUE, LES CHIFFRES SONT LE SECRET. Le web a d'abord cache
## le terrain case par case ; un pillard regardait trois tuiles perdues dans
## l'eau et lisait l'ecran comme casse. Le sol est donc montre entier, et ce
## qu'on gagne en marchant, ce sont les chiffres.
##
## DESSINE COMME L'ILE, expres : le meme couvercle, le meme anneau d'or qui
## tourne autour du lapin (MoveRing), les memes chiffres (TileView). Une
## seconde grammaire sur les memes tuiles, le joueur ne la lisait pas.
##
## TOUT EST MONTE DANS LES BLOCS DU TERRAIN (`mount_veil`) et trie avec eux ;
## tout meurt donc avec le terrain. `build` vient APRES `show_ground`.

## LE CHAMP, en rouge des la premiere image : « pose le pied ici et tu as
## gagne ». Pas le brouillard — les deux ne doivent pas avoir la meme couleur.
##
## 0,7 ET PAS LE 0,5 DU WEB : ici le potager est de la TERRE BRUNE, et le
## rouge a moitie sur du brun sortait brun — mesure sur le banc, le champ ne
## se distinguait plus. L'intention du web (« le but se lit rouge »), le
## chiffre re-mesure sur l'ecran reel, comme FOG_ALPHA.
const GOAL_TINT := Color("#ff3b3b")
const GOAL_ALPHA := 0.7
## LE PAILLASSON, en orange : les pas donnes au pillard. Un voile plein, donc
## bien moins que le contour de pose (0,55) — sinon il crierait plus fort que
## le but.
const DOOR_TINT := Color("#ff8a3d")
const DOORSTEP_ALPHA := 0.22

## Le fondu d'une case revelee — l'ile fond un creusage de meme.
const REVEAL_SECONDS := 0.25
## Le chiffre qui arrive : il saute a sa taille (`back.out(2)`).
const CLUE_POP_SECONDS := 0.22

## LA PROFONDEUR DANS LE BLOC : sol 1, voile 2, ombre de fleche 3, chiffre 4,
## puis l'anneau (MoveRing : 5 et 6).
const Z_FOG := 2
const Z_SHADOW := 3
const Z_CLUE := 4

## LES FLECHES : le chevron du kit, en or sur le potager (« ce qui est a
## prendre »), en orange sur la porte (« ou il entre »). Mesurees en
## demi-cases, pas en pixels : le plateau est mis a l'echelle par la camera.
const ARROW := preload("res://assets/ui/d8-arrow-down.png")
const GOAL_ARROW_TINT := Color("#ffd45c")
const ARROW_SCALE := 0.7
const ARROW_LIFT := 2.4
const ARROW_BOB := 5.0
const ARROW_BOB_SECONDS := 0.9
## AU-DESSUS DE TOUT le plateau — la seule marque exemptee de la regle de
## profondeur. Un pin de 280 px avalait la fleche sur deux graines sur cinq ;
## un panneau qu'on ne voit pas n'est pas un panneau. Sous la borne de Godot
## (±4096), loin au-dessus de toute case ((18+18)*16 + le lapin).
const Z_ARROW := 4000
## L'OMBRE sur la case : elle dit QUELLE case, la fleche qui flotte ne designe
## qu'une region. Plus petite et plus pale quand la fleche monte.
const SHADOW_ALPHA := 0.45
const SHADOW_LIFTED := 0.7

var terrain: BurrowTerrain
var layout: BurrowLayout

## tile -> {veil: "fog"|"goal"|"doorstep", fog: Sprite2D, glyph: Sprite2D, count: int}
var _cells: Dictionary = {}
var _ring: MoveRing
var _goal: Array[Node2D] = []
var _door: Array[Node2D] = []
var _door_shown := false


func _ready() -> void:
	_ring = MoveRing.new()
	_ring.name = "Ring"
	add_child(_ring)


## UN VOILE PAR CASE PRATICABLE du defenseur, et la fleche du potager.
## Rappele a chaque changement de sol : les blocs d'avant sont morts.
func build() -> void:
	clear()
	if terrain == null or layout == null:
		return
	var field := {}
	for t in layout.field:
		field[t] = true
	var cells: Array[Vector2i] = []
	for tile in layout.walkable_tiles():
		var cell := BurrowLayout.cell_of(tile)
		if not terrain.has_block(cell):
			continue
		cells.append(cell)
		# Les deux bouts de la marche portent leur couleur des la premiere
		# image : rouge sur le champ, orange sur le paillasson. Entre les
		# deux, le brouillard.
		var veil := "goal" if field.has(tile) else ("doorstep" if layout.is_doorstep(tile) else "fog")
		var fog := Sprite2D.new()
		fog.texture = TileView._diamond_texture()
		fog.centered = true
		fog.modulate = _tint(veil)
		fog.modulate.a = _alpha(veil, false)
		terrain.mount_veil(cell, fog, Z_FOG)

		# LE CHIFFRE, le glyphe de l'ile : couche sur le losange, multiplie.
		var glyph := Sprite2D.new()
		glyph.centered = true
		glyph.material = TileView._mul_material()
		glyph.visible = false
		var holder := Node2D.new()
		holder.add_child(glyph)
		terrain.mount_veil(cell, holder, Z_CLUE)
		# APRES `mount_veil`, qui ecrase la position : voir tile_view.gd.
		holder.transform = Transform2D(
			Vector2(Iso.half_w(), Iso.half_h()) / Iso.half_w(),
			Vector2(-Iso.half_w(), Iso.half_h()) / Iso.half_w(),
			holder.position)
		_cells[tile] = {"veil": veil, "fog": fog, "glyph": glyph, "count": 0}
	_ring.terrain = terrain
	_ring.build(cells)
	_goal = _hang(_goal_cell(), GOAL_ARROW_TINT)


func clear() -> void:
	if _ring != null:
		_ring.clear()
	for cell in _cells.values():
		for key in ["fog", "glyph"]:
			var node: Node = cell[key]
			if is_instance_valid(node):
				# Le chiffre vit dans un porteur : c'est lui qui part.
				(node.get_parent() if key == "glyph" else node).queue_free()
	_cells.clear()
	_drop(_goal)
	_goal = []


## CE QUE LE SERVEUR A ENVOYE : `view` = [{tile, clue}], `clue` nul sous la
## fumee. Le brouillard se leve sur chaque case vue, en fondu — sauf a la
## premiere image : un plateau qui fond toute sa zone de depart se lit comme
## un chargement, pas comme un regard.
func show_view(view: Array, fresh: bool) -> void:
	var seen := {}
	for v in view:
		if v is Dictionary:
			seen[int(v.get("tile", -1))] = v.get("clue")
	for tile in _cells:
		var cell: Dictionary = _cells[tile]
		var fog: Sprite2D = cell["fog"]
		var target := _alpha(String(cell["veil"]), seen.has(tile))
		if fresh or is_equal_approx(fog.modulate.a, target):
			fog.modulate.a = target
		else:
			fog.create_tween().tween_property(fog, "modulate:a", target, REVEAL_SECONDS) \
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		var clue: Variant = seen.get(tile)
		_set_clue(cell, int(clue) if clue != null else 0, not fresh)


## LES CASES OU UNE TAPE SERA ACCEPTEE, allumees et balayees comme l'ile
## allume les huit autour de son lapin. Un raid fini n'en envoie aucune.
func light(steps: Array, at: int) -> void:
	var cells: Array[Vector2i] = []
	for t in steps:
		cells.append(BurrowLayout.cell_of(int(t)))
	_ring.set_lit(cells, BurrowLayout.cell_of(at))


## Zero se dessine vide, comme au demineur, et la fumee aussi : l'oeil va aux
## cases qui portent un danger.
func _set_clue(cell: Dictionary, count: int, animate: bool) -> void:
	if int(cell["count"]) == count:
		return
	cell["count"] = count
	var glyph: Sprite2D = cell["glyph"]
	if count <= 0:
		glyph.visible = false
		return
	glyph.texture = TileView._digit_texture(count)
	glyph.visible = true
	if animate:
		glyph.scale = Vector2.ZERO
		glyph.create_tween().tween_property(glyph, "scale", Vector2.ONE, CLUE_POP_SECONDS) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		glyph.scale = Vector2.ONE


static func _tint(veil: String) -> Color:
	match veil:
		"goal": return GOAL_TINT
		"doorstep": return DOOR_TINT
	return TileView.FOG_COLOR


## Vu ou pas, le paillasson reste orange : la regle est publique (le client
## du pillard coupe le meme paillasson de la meme graine), et le cacher
## effacerait la seule chose du plateau faite pour se lire depuis la porte.
static func _alpha(veil: String, seen: bool) -> float:
	match veil:
		"goal": return GOAL_ALPHA
		"doorstep": return DOORSTEP_ALPHA
	return 0.0 if seen else TileView.FOG_ALPHA


# ── Les fleches ──────────────────────────────────────────────────────────────

## LA FLECHE ORANGE SUR LA PORTE — l'autre bout de la marche. Pour le
## defenseur, la reponse a « par ou entre-t-il ? » ; pour le pillard, d'ou il
## est parti. Montree pendant la pose et pendant un raid, des deux cotes :
## au repos cet ecran est l'image d'une maison, qui n'a pas besoin qu'on lui
## montre sa porte.
func build_door() -> void:
	_drop(_door)
	_door = []
	if terrain == null or layout == null or layout.entrance < 0:
		return
	_door = _hang(BurrowLayout.cell_of(layout.entrance), DOOR_TINT)
	show_door(_door_shown)


func show_door(on: bool) -> void:
	_door_shown = on
	for node in _door:
		if is_instance_valid(node):
			node.visible = on


## UNE fleche sur le potager, pas douze : la case la plus proche du CENTRE du
## champ, a l'ecran — le premier du tableau est un coin arbitraire, et le
## centre d'un champ en L n'est pas forcement une case du champ.
func _goal_cell() -> Vector2i:
	if layout.field.is_empty():
		return Vector2i(-1, -1)
	var map := terrain.map
	var sum := Vector2.ZERO
	for t in layout.field:
		var c := BurrowLayout.cell_of(t)
		sum += map.screen_of(c.x, c.y)
	var centre := sum / float(layout.field.size())
	var best := BurrowLayout.cell_of(layout.field[0])
	var best_d := INF
	for t in layout.field:
		var c := BurrowLayout.cell_of(t)
		var d := map.screen_of(c.x, c.y).distance_squared_to(centre)
		if d < best_d:
			best_d = d
			best = c
	return best


## UN CHEVRON QUI FLOTTE sur une case, au-dessus de tout, et son OMBRE sur la
## case, triee avec le sol : un arbre devant la case couvre l'ombre, jamais la
## fleche. Rend [fleche, ombre] (vide si la case n'a pas de bloc).
func _hang(cell: Vector2i, tint: Color) -> Array[Node2D]:
	var out: Array[Node2D] = []
	if cell.x < 0 or not terrain.has_block(cell):
		return out
	var shadow := Sprite2D.new()
	shadow.texture = TileView._diamond_texture()
	shadow.centered = true
	shadow.modulate = Color(0, 0, 0, SHADOW_ALPHA)
	terrain.mount_veil(cell, shadow, Z_SHADOW)
	var breath := shadow.create_tween().set_loops().set_parallel(true)
	breath.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	breath.tween_property(shadow, "scale", Vector2.ONE * SHADOW_LIFTED, ARROW_BOB_SECONDS)
	breath.tween_property(shadow, "modulate:a", SHADOW_ALPHA * SHADOW_LIFTED, ARROW_BOB_SECONDS)
	breath.chain().tween_property(shadow, "scale", Vector2.ONE, ARROW_BOB_SECONDS)
	breath.tween_property(shadow, "modulate:a", SHADOW_ALPHA, ARROW_BOB_SECONDS)

	# Le groupe epingle a la case ; seul le chevron monte et descend. Ancre a
	# sa POINTE, qui est ce avec quoi une fleche pointe.
	var group := Node2D.new()
	group.position = terrain.map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	group.z_index = Z_ARROW
	group.z_as_relative = false
	add_child(group)
	var arrow := Sprite2D.new()
	arrow.texture = ARROW
	arrow.centered = false
	arrow.offset = Vector2(-ARROW.get_width() * 0.5, -ARROW.get_height())
	arrow.scale = Vector2.ONE * (Iso.half_w() * ARROW_SCALE / ARROW.get_width())
	arrow.modulate = tint
	arrow.position.y = -Iso.half_h() * ARROW_LIFT
	group.add_child(arrow)
	var bob := arrow.create_tween().set_loops()
	bob.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	bob.tween_property(arrow, "position:y", arrow.position.y - ARROW_BOB, ARROW_BOB_SECONDS)
	bob.tween_property(arrow, "position:y", arrow.position.y, ARROW_BOB_SECONDS)
	out.append(group)
	out.append(shadow)
	return out


func _drop(nodes: Array[Node2D]) -> void:
	for node in nodes:
		if is_instance_valid(node):
			node.queue_free()
