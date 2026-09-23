extends RefCounted
class_name BurrowLayout
## LE TERRIER DU SERVEUR — relief, entree, potager, paillasson, depuis l'id.
##
## Porte de src/game/burrow/generate.ts (`burrowTerrain`), board.ts (les
## regles par case), cells.ts (`CELL_RULES`) et buildings.ts (`buildingCell`).
##
## POURQUOI CE PORT EXISTE. Le terrier Godot etait un relief de demonstration
## (un bruit et une distance au centre, graine 1) : joli, et FAUX pour tout ce
## qui touche au serveur. Poser une bombe, c'est envoyer un INDEX de case que
## le serveur verifie contre SON terrier — celui qu'il fait pousser de l'id du
## joueur. Une grille qui ne tombe pas sur la sienne allume des cases qu'il
## refuse (« tile_blocked ») et en eteint qu'il accepterait. C'est le mensonge
## que cells.ts a ete ecrit pour empecher : « the player is shown a legal move
## and told no ».
##
## L'ORDRE EST LE CONTRAT, comme pour l'ile. L'entree est tiree dans le bloc
## principal DANS L'ORDRE OU LE FLOOD-FILL L'A REMPLI (un Set JS garde l'ordre
## d'insertion), le champ part de la PREMIERE case la plus lointaine dans
## l'ordre du BFS : d'ou des tableaux ordonnes a cote des dictionnaires, et les
## memes pile/file que le web (`pop` pour le bloc, `shift` pour les pas).
## Verifie contre le TS par tools/verify_burrow_layout.gd.

const COLS := 19
const ROWS := 19

## Les reglages de generate.ts, un par un. Voir la-bas pour le pourquoi.
const TIERS := 2
const LAND := 0.72
const RISE := 0.2
const RAGGEDNESS := 0.12
const INHABITED_SHARE := 0.0
const MIN_CROSSING := 6
const FIELD_CELLS := 12
const MAX_ATTEMPTS := 24
const MAX_STEP := 1
const DOOR_CLEARING := 2
const DOOR_CLEARING_TREES := 3
const FIELD_CLEARING := 1
const FIELD_CLEARING_TREES := 3
const MIN_BODY := 110
const ENTRANCE_BAND := 2
const FIELD_INLAND := 3
const BUILDING_INLAND := 2
## generate.ts `MAX_CROSSING` : la plus longue traversee qu'un terrier
## reamenage peut avoir — celle que RAID_RUN.WALK_FLOOR laisse marcher.
const MAX_CROSSING := 13

## Les huit pas, dans l'ordre du web (`STEPS`) — l'ordre compte : il decide
## l'ordre d'insertion du bloc et du BFS.
const STEPS: Array[Vector2i] = [
	Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1),
	Vector2i(-1, 0), Vector2i(1, 0),
	Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1),
]

enum Cell { BLOCKED, GROUND, ENTRANCE, FIELD, DOORSTEP }

## Le relief, tel que le terrain le dessine.
var map: IslandMap
## Ce qui se tient dessus, apres les clairieres : `{kind, x, y, variant}`.
var placements: Array[Dictionary] = []
## Le genre de chaque case, en ligne d'abord (`Cell`).
var cells := PackedByteArray()
var entrance := -1
## Le potager, trie.
var field: Array[int] = []
## Le paillasson, trie — l'entree comprise.
var doorstep: Array[int] = []
var crossing := 0
var seed_text := ""
## La case de la maison (buildings.ts `buildingCell`).
var building := Vector2i(-1, -1)

## Un terrier par graine et par process, comme le cache de board.ts : il est
## redemande a chaque pose, chaque pas de raid, chaque visite.
static var _cache: Dictionary = {}


## LE TERRIER D'UN JOUEUR — son id est la graine (board.ts), et ce que son
## proprietaire y a deplace par-dessus (`edits`, generate.ts `BurrowEdits` :
## {field: [dc, dr], house: tile, moves: [[from, to], ...]}). Un amenagement
## qui ne tient plus est ignore, comme au serveur : le terrier pousse de la
## graine est toujours legal.
static func of(seed_value: String, edits: Dictionary = {}) -> BurrowLayout:
	var base: BurrowLayout = _cache.get(seed_value)
	if base == null:
		base = grow(seed_value)
		_cache[seed_value] = base
	if not has_edits(edits):
		return base
	var key := "%s#%s" % [seed_value, JSON.stringify(edits)]
	var hit: BurrowLayout = _cache.get(key)
	if hit != null:
		return hit
	var out: Variant = edited(base, edits)
	var built: BurrowLayout = out if out is BurrowLayout else base
	_cache[key] = built
	return built


## generate.ts `hasEdits`.
static func has_edits(edits: Dictionary) -> bool:
	var f: Variant = edits.get("field")
	if f is Array and f.size() == 2 and (int(f[0]) != 0 or int(f[1]) != 0):
		return true
	if edits.get("house") != null:
		return true
	var m: Variant = edits.get("moves")
	return m is Array and not m.is_empty()


## generate.ts `editBurrow` : le terrier pousse, avec l'amenagement dessus —
## ou la raison du refus (une String, les memes noms que le serveur, DANS LE
## MEME ORDRE : c'est ce qui fait que l'editeur allume les cases que le
## serveur acceptera). Le relief et l'entree ne bougent jamais ; le sol, la
## traversee et le paillasson sont remesures.
static func edited(base: BurrowLayout, edits: Dictionary) -> Variant:
	var n := COLS * ROWS
	var out := BurrowLayout.new()
	out.map = base.map
	out.seed_text = base.seed_text
	out.entrance = base.entrance

	# Le potager, d'un bloc, sur un seul palier.
	var shift := Vector2i.ZERO
	var f: Variant = edits.get("field")
	if f is Array and f.size() == 2:
		shift = Vector2i(int(f[0]), int(f[1]))
	var tier := -1
	var in_field := {}
	for t in base.field:
		var c := cell_of(t) + shift
		if c.x < 0 or c.x >= COLS or c.y < 0 or c.y >= ROWS:
			return "field_off_ground"
		var lv := base.map.level_at(c.x, c.y)
		if lv <= 0:
			return "field_off_ground"
		if tier < 0:
			tier = lv
		elif lv != tier:
			return "field_split"
		out.field.append(index(c))
		in_field[index(c)] = true
	out.field.sort()
	if in_field.has(out.entrance):
		return "cells_overlap"

	# Chaque chose a sa case finale.
	var moved := {}
	var m: Variant = edits.get("moves")
	if m is Array:
		for pair in m:
			if not (pair is Array) or pair.size() != 2:
				return "bad_edits"
			var a := int(pair[0])
			var b := int(pair[1])
			if a < 0 or a >= n or b < 0 or b >= n or moved.has(a):
				return "bad_edits"
			moved[a] = b
	var taken := {}
	var known := {}
	for p in base.placements:
		var from := index(Vector2i(int(p.x), int(p.y)))
		known[from] = true
		var to: int = moved.get(from, from)
		var tc := cell_of(to)
		if to != from and base.map.level_at(tc.x, tc.y) <= 0:
			return "thing_off_ground"
		if taken.has(to) or in_field.has(to) or to == out.entrance:
			return "cells_overlap"
		taken[to] = true
		var q: Dictionary = p.duplicate()
		q.x = tc.x
		q.y = tc.y
		out.placements.append(q)
	for from in moved:
		if not known.has(from):
			return "bad_edits"

	# Le sol, remesure.
	var homestead := out._main_body(out._solid(out.placements))
	var member := {}
	for t in homestead:
		member[t] = true
	if not member.has(out.entrance):
		return "field_unreachable"
	for t in out.field:
		if not member.has(t):
			return "field_unreachable"
	var steps := out._step_distances(homestead, out.entrance)
	var best := INF
	for t in out.field:
		if steps.has(t):
			best = minf(best, float(steps[t]))
	if best == INF:
		return "field_unreachable"
	if best < MIN_CROSSING:
		return "crossing_too_short"
	if best > MAX_CROSSING:
		return "crossing_too_long"
	out.crossing = int(best)
	out.doorstep = _pick_doorstep(steps, out.crossing, out.field, _tuning_doorstep())
	out._paint(homestead)

	# La maison : du sol nu, rien dessus. Pas une regle du serveur au-dela de
	# ca (elle n'en a jamais ete une) — deplacee, elle est ou on l'a mise ;
	# sinon elle reste ou elle etait tant que sa case tient, et se rechoisit
	# a cote du potager sinon.
	var h: Variant = edits.get("house")
	if h != null:
		var ht := int(h)
		if ht < 0 or ht >= n:
			return "bad_edits"
		if not out._roomy(cell_of(ht), taken):
			return "house_off_ground"
		out.building = cell_of(ht)
	elif base.building.x >= 0 and out._roomy(base.building, taken):
		out.building = base.building
	else:
		out._place_building()
	return out


## `burrowTerrain`. Ne rend jamais null en pratique ; si les 24 essais
## echouent, le web jette une erreur — ici on rend le dernier essai brut, pour
## qu'un terrier se dessine quand meme (et le serveur refusera tout).
static func grow(seed_value: String, doorstep_steps: int = -1) -> BurrowLayout:
	if doorstep_steps < 0:
		doorstep_steps = _tuning_doorstep()
	for attempt in range(MAX_ATTEMPTS):
		var built := BurrowLayout.new()
		if built._try_build(seed_value, attempt, doorstep_steps):
			built._place_building()
			return built
	push_error("burrow layout: no layout for seed \"%s\"" % seed_value)
	var fallback := BurrowLayout.new()
	fallback.seed_text = seed_value
	fallback.map = IslandMap.new(COLS, ROWS, Iso.BURROW_ORIGIN)
	fallback.cells.resize(COLS * ROWS)
	return fallback


## `TRAPS.DOORSTEP`, lu dans le meme tuning.json que l'autoload Tuning — lu
## ici directement parce qu'une sonde `--script` n'a pas les autoloads.
static func _tuning_doorstep() -> int:
	var data: Variant = (load("res://assets/tuning.json") as JSON).data
	if data is Dictionary and data.get("TRAPS") is Dictionary:
		return int(data.TRAPS.get("DOORSTEP", 2))
	return 2


# ---------------------------------------------------------------- les regles

static func index(c: Vector2i) -> int:
	return c.y * COLS + c.x


static func cell_of(tile: int) -> Vector2i:
	return Vector2i(tile % COLS, tile / COLS)


func kind(tile: int) -> int:
	if tile < 0 or tile >= COLS * ROWS or cells.size() != COLS * ROWS:
		return Cell.BLOCKED
	return cells[tile]


## cells.ts : on marche partout sauf sur BLOCKED.
func is_walkable(tile: int) -> bool:
	return kind(tile) != Cell.BLOCKED


## cells.ts `minable` : le sol et le potager, jamais l'entree ni le
## paillasson.
func is_trappable(tile: int) -> bool:
	var k := kind(tile)
	return k == Cell.GROUND or k == Cell.FIELD


## board.ts `isDoorstep` : le paillasson ET l'entree.
func is_doorstep(tile: int) -> bool:
	var k := kind(tile)
	return k == Cell.DOORSTEP or k == Cell.ENTRANCE


## board.ts `walkableTiles`.
func walkable_tiles() -> Array[int]:
	var out: Array[int] = []
	for t in range(cells.size()):
		if cells[t] != Cell.BLOCKED:
			out.append(t)
	return out


func field_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for t in field:
		out.append(cell_of(t))
	return out


# ---------------------------------------------------------------- la pousse

## `tryBuild` : un candidat, jete s'il ne tient pas ses promesses.
func _try_build(seed_value: String, attempt: int, doorstep_steps: int) -> bool:
	seed_text = seed_value
	var terrain_seed := "%s:burrow" % seed_value if attempt == 0 \
		else "%s:burrow:%d" % [seed_value, attempt]
	map = IslandMap.new(COLS, ROWS, Iso.BURROW_ORIGIN)
	map.seed_text = terrain_seed
	map.shape(terrain_seed, LAND, RISE, RAGGEDNESS, TIERS)
	var ground := IslandGround.new(map, terrain_seed, true, INHABITED_SHARE)
	var scattered: Array[Dictionary] = ground.placements

	var first := _main_body(_solid(scattered))
	if first.size() < MIN_BODY:
		return false

	var rng := Rng.from_seed("%s:layout" % terrain_seed)
	entrance = _pick_entrance(first, rng)
	if entrance < 0:
		return false

	var cleared := _clear_around(scattered, [entrance], DOOR_CLEARING, DOOR_CLEARING_TREES)
	var main := _main_body(_solid(cleared))

	field = _pick_field(main, entrance)
	if field.size() < FIELD_CELLS / 2:
		return false

	var tidied := _clear_around(cleared, field, FIELD_CLEARING, FIELD_CLEARING_TREES)
	var homestead := _main_body(_solid(tidied))

	var steps := _step_distances(homestead, entrance)
	var best := INF
	for t in field:
		if steps.has(t):
			best = minf(best, float(steps[t]))
	if best == INF or best < MIN_CROSSING:
		return false
	crossing = int(best)

	doorstep = _pick_doorstep(steps, crossing, field, doorstep_steps)
	_paint(homestead)
	placements = _on_the_homestead(tidied, homestead)
	return true


## Les cases qu'un objet solide occupe (`walkableWith`).
func _solid(list: Array[Dictionary]) -> Dictionary:
	var out := {}
	for p in list:
		if bool(IslandGround.BLOCKS.get(p.kind, false)):
			out[Vector2i(p.x, p.y)] = true
	return out


func _walkable_with(solid: Dictionary, c: Vector2i) -> bool:
	return map.level_at(c.x, c.y) > 0 and not solid.has(c)


## `mainBody` : le plus grand bloc, EN TABLEAU dans l'ordre d'insertion du
## web (depart, puis chaque voisin ajoute a son tour, la pile depilee par la
## fin). Le premier bloc strictement plus grand gagne.
func _main_body(solid: Dictionary) -> Array[int]:
	var seen := {}
	var best: Array[int] = []
	for row in range(ROWS):
		for col in range(COLS):
			var start := Vector2i(col, row)
			var i0 := index(start)
			if not _walkable_with(solid, start) or seen.has(i0):
				continue
			var group: Array[int] = [i0]
			var in_group := {i0: true}
			var stack: Array[Vector2i] = [start]
			seen[i0] = true
			while not stack.is_empty():
				var c: Vector2i = stack.pop_back()
				for s in STEPS:
					var n := c + s
					if n.x < 0 or n.x >= COLS or n.y < 0 or n.y >= ROWS:
						continue
					var i := index(n)
					if in_group.has(i) or not _walkable_with(solid, n):
						continue
					if absi(map.level_at(n.x, n.y) - map.level_at(c.x, c.y)) > MAX_STEP:
						continue
					group.append(i)
					in_group[i] = true
					seen[i] = true
					stack.append(n)
			if group.size() > best.size():
				best = group
	return best


static func _edge_distance(c: Vector2i) -> int:
	return mini(mini(c.x, c.y), mini(COLS - 1 - c.x, ROWS - 1 - c.y))


func _pick_entrance(main: Array[int], rng: Rng) -> int:
	var rim: Array[int] = []
	for t in main:
		var c := cell_of(t)
		if map.level_at(c.x, c.y) != 1:
			continue
		if _edge_distance(c) <= ENTRANCE_BAND:
			rim.append(t)
	if rim.is_empty():
		return -1
	return rim[int(floor(rng.next() * rim.size()))]


## `clearAround` : rien a `bare` cases, pas d'arbre a `trees` (Chebyshev).
static func _clear_around(list: Array[Dictionary], around: Array, bare: int,
		trees: int) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for p in list:
		var d := 1 << 30
		for t in around:
			var c := cell_of(int(t))
			d = mini(d, maxi(absi(int(p.x) - c.x), absi(int(p.y) - c.y)))
		if d <= bare:
			continue
		if p.kind == "tree" and d <= trees:
			continue
		out.append(p)
	return out


## `stepDistances` : un BFS (file, `shift`), les distances dans l'ordre ou le
## web les insere — `_pick_field` lit cet ordre.
func _step_distances(main: Array[int], start: int) -> Dictionary:
	var member := {}
	for t in main:
		member[t] = true
	var dist := {start: 0}
	var queue: Array[int] = [start]
	var head := 0
	while head < queue.size():
		var tile := queue[head]
		head += 1
		var c := cell_of(tile)
		for s in STEPS:
			var n := c + s
			if n.x < 0 or n.x >= COLS or n.y < 0 or n.y >= ROWS:
				continue
			var i := index(n)
			if dist.has(i) or not member.has(i):
				continue
			if absi(map.level_at(n.x, n.y) - map.level_at(c.x, c.y)) > MAX_STEP:
				continue
			dist[i] = int(dist[tile]) + 1
			queue.append(i)
	return dist


## generate.ts `seaDistance` : Chebyshev jusqu'a la mer, plafonne.
func sea_distance(c: Vector2i, cap: int = 4) -> int:
	for d in range(cap):
		for dc in range(-d, d + 1):
			for dr in range(-d, d + 1):
				if maxi(absi(dc), absi(dr)) != d:
					continue
				if map.level_at(c.x + dc, c.y + dr) == 0:
					return d
	return cap


func _pick_field(main: Array[int], start: int) -> Array[int]:
	var dist := _step_distances(main, start)
	var member := {}
	for t in main:
		member[t] = true

	var farthest := -1
	var inland := FIELD_INLAND
	while inland >= 0 and farthest < 0:
		var best := -1
		# Les Dictionary de Godot gardent l'ordre d'insertion, comme la Map.
		for tile in dist:
			if sea_distance(cell_of(tile)) < inland:
				continue
			if int(dist[tile]) > best:
				best = int(dist[tile])
				farthest = tile
		inland -= 1
	if farthest < 0:
		return []

	var fc := cell_of(farthest)
	var tier := map.level_at(fc.x, fc.y)
	var patch := {farthest: true}
	var queue: Array[int] = [farthest]
	var head := 0
	while head < queue.size() and patch.size() < FIELD_CELLS:
		var c := cell_of(queue[head])
		head += 1
		for s in STEPS:
			if patch.size() >= FIELD_CELLS:
				break
			var n := c + s
			# Pas de garde de bord chez le web : le palier hors grille vaut 0 et
			# refuse la case de toute facon. On la garde, sans effet.
			if n.x < 0 or n.x >= COLS or n.y < 0 or n.y >= ROWS:
				continue
			var i := index(n)
			if patch.has(i) or not member.has(i):
				continue
			if map.level_at(n.x, n.y) != tier:
				continue
			if i == start:
				continue
			patch[i] = true
			queue.append(i)
	var out: Array[int] = []
	for t in patch:
		out.append(t)
	out.sort()
	return out


static func _pick_doorstep(steps: Dictionary, cross: int, the_field: Array[int],
		reach_steps: int) -> Array[int]:
	var reach := mini(reach_steps, cross - 2)
	var in_field := {}
	for t in the_field:
		in_field[t] = true
	var out: Array[int] = []
	for tile in steps:
		if int(steps[tile]) <= reach and not in_field.has(tile):
			out.append(tile)
	out.sort()
	return out


func _paint(main: Array[int]) -> void:
	var member := {}
	for t in main:
		member[t] = true
	var in_field := {}
	for t in field:
		in_field[t] = true
	var on_step := {}
	for t in doorstep:
		on_step[t] = true
	cells = PackedByteArray()
	cells.resize(COLS * ROWS)
	for tile in range(COLS * ROWS):
		if tile == entrance:
			cells[tile] = Cell.ENTRANCE
		elif in_field.has(tile):
			cells[tile] = Cell.FIELD
		elif on_step.has(tile):
			cells[tile] = Cell.DOORSTEP
		elif member.has(tile):
			cells[tile] = Cell.GROUND
		else:
			cells[tile] = Cell.BLOCKED


func _on_the_homestead(list: Array[Dictionary], main: Array[int]) -> Array[Dictionary]:
	var member := {}
	for t in main:
		member[t] = true
	var in_field := {}
	for t in field:
		in_field[t] = true
	var out: Array[Dictionary] = []
	for p in list:
		var c := Vector2i(int(p.x), int(p.y))
		var tile := index(c)
		if in_field.has(tile) or tile == entrance:
			continue
		var touches := member.has(tile)
		if not touches:
			for s in STEPS:
				var n := c + s
				if n.x < 0 or n.x >= COLS or n.y < 0 or n.y >= ROWS:
					continue
				if member.has(index(n)):
					touches = true
					break
		if touches:
			out.append(p)
	return out


## buildings.ts `buildingCell` : a cote du potager, loin de la porte, dans
## les terres. Deux passes, la seconde tolere la mer une case plus pres.
func _place_building() -> void:
	var door := cell_of(entrance)
	var best := Vector2i(-1, -1)
	var best_score := -INF
	var standing := {}
	for p in placements:
		standing[index(Vector2i(int(p.x), int(p.y)))] = true
	# QUATRE CASES de sol libre d'abord (la maison est peinte sur 2x2), puis
	# une seule : un terrier etroit a quand meme sa maison.
	for pass_ in [[BUILDING_INLAND, true], [BUILDING_INLAND - 1, true],
			[BUILDING_INLAND, false], [BUILDING_INLAND - 1, false]]:
		var inland: int = pass_[0]
		var square: bool = pass_[1]
		for tile in range(COLS * ROWS):
			if cells[tile] != Cell.GROUND:
				continue
			var c := cell_of(tile)
			if square and not _roomy(c, standing):
				continue
			var to_sea := sea_distance(c)
			if to_sea < inland:
				continue
			var to_field := 1 << 30
			for f in field:
				var fc := cell_of(f)
				to_field = mini(to_field, maxi(absi(fc.x - c.x), absi(fc.y - c.y)))
			if to_field < 1 or to_field > 2:
				continue
			var to_door := maxi(absi(door.x - c.x), absi(door.y - c.y))
			var score := -to_field * 8.0 + mini(to_sea, 3) * 2.0 + to_door * 0.5
			if score > best_score:
				best_score = score
				best = c
		if best.x >= 0:
			break
	if best.x < 0 and not field.is_empty():
		best = cell_of(field[0])
	building = best


## LES QUATRE CASES DE LA MAISON — la sienne et les trois devant elle
## (generate.ts `houseFootprint`). Vide si le carre sort du plateau.
static func house_cells(c: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	if c.x < 0 or c.y < 0 or c.x + 1 >= COLS or c.y + 1 >= ROWS:
		return out
	for d in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
		out.append(c + d)
	return out


## Les quatre cases sont-elles du sol nu, sans rien dessus ?
func _roomy(c: Vector2i, standing: Dictionary) -> bool:
	var square := house_cells(c)
	if square.is_empty():
		return false
	# A PLAT : la maison est peinte sur un sol plat, ses quatre cases sur un
	# meme palier.
	var tier := map.level_at(c.x, c.y)
	for q in square:
		var t := index(q)
		if cells[t] != Cell.GROUND or standing.has(t) or map.level_at(q.x, q.y) != tier:
			return false
	return true
