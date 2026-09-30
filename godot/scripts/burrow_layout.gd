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

## generate.ts `BURROW_GROUND` (2026-09-30) : LE sol de tous les terriers. Le
## relief, l'entree, le potager et la maison en sortent ; le decor sort de
## l'id du joueur. Change des DEUX cotes, et avec un remboursement des bombes,
## planches et amenagements (scripts/reset-burrows.ts).
const BURROW_GROUND := "burrow-g285"
## Un autre sol, pour les bancs qui montrent des candidats (`--ground=`). Le
## jeu ne le touche jamais : le serveur, lui, ne connait que BURROW_GROUND.
static var ground_override := ""

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
		base = grow(seed_value, -1, ground_override if ground_override != "" else BURROW_GROUND)
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
## LE FOUILLIS AU SOL (`givesWay`, generate.ts) : un buisson, un objet pose.
## Un pillard le traverse ; ce qu'on pose dessus le couvre, et il s'efface.
static func gives_way(kind: String) -> bool:
	return kind == "bush" or kind == "prop"


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

	# La maison, ou le joueur l'a posee ou la ou elle etait : quatre cases de
	# terre sur un palier, hors du potager et de la porte. Solide, donc jugee
	# avant les choses — une chose posee dessus la chevauche, comme un arbre.
	var hv: Variant = edits.get("house")
	if hv != null and (int(hv) < 0 or int(hv) >= n):
		return "bad_edits"
	var house := -1
	if hv != null:
		house = int(hv)
	elif base.building.x >= 0:
		house = index(base.building)
	var square: Array[Vector2i] = []
	var under_house := {}
	if house >= 0:
		square = house_cells(cell_of(house))
		if square.is_empty():
			return "house_off_ground"
		var tier0 := base.map.level_at(square[0].x, square[0].y)
		for q in square:
			var lv := base.map.level_at(q.x, q.y)
			if lv <= 0 or lv != tier0:
				return "house_off_ground"
		for q in square:
			if in_field.has(index(q)) or index(q) == out.entrance:
				return "cells_overlap"
			under_house[index(q)] = true

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
	# DEUX PASSES, comme le serveur (`givesWay`) : ce qui tient sa case
	# d'abord (le solide, et le fouillis que le joueur a deplace), puis le
	# fouillis reste ou il a pousse, qui S'EFFACE sous ce qui le couvre
	# maintenant. L'ordre du generateur est garde.
	var taken := {}
	var known := {}
	var at := {}
	for i in range(base.placements.size()):
		var p: Dictionary = base.placements[i]
		var from := index(Vector2i(int(p.x), int(p.y)))
		known[from] = true
		if gives_way(String(p.kind)) and not moved.has(from):
			continue
		var to: int = moved.get(from, from)
		var tc := cell_of(to)
		if to != from and base.map.level_at(tc.x, tc.y) <= 0:
			return "thing_off_ground"
		if taken.has(to) or in_field.has(to) or to == out.entrance or under_house.has(to):
			return "cells_overlap"
		taken[to] = true
		at[i] = to
	for from in moved:
		if not known.has(from):
			return "bad_edits"
	# La maison couvre le fouillis comme le reste.
	for i in range(base.placements.size()):
		var p: Dictionary = base.placements[i]
		var from := index(Vector2i(int(p.x), int(p.y)))
		if not gives_way(String(p.kind)) or moved.has(from):
			continue
		if taken.has(from) or in_field.has(from) or from == out.entrance or under_house.has(from):
			continue
		taken[from] = true
		at[i] = from
	for i in range(base.placements.size()):
		if not at.has(i):
			continue
		var tc := cell_of(int(at[i]))
		var q: Dictionary = base.placements[i].duplicate()
		q.x = tc.x
		q.y = tc.y
		out.placements.append(q)

	# Le sol, remesure — autour de la maison.
	var why := out._settle(out.placements, square, MAX_CROSSING, _tuning_doorstep())
	if why != "":
		return why
	if house >= 0:
		out.building = cell_of(house)
	return out


## `burrowTerrain` : le sol commun, et le decor du joueur par-dessus. Si
## aucun des 24 tirages de decor ne tient, le terrier est le sol nu — qui
## tient toujours, `_build_ground` l'a verifie.
static func grow(seed_value: String, doorstep_steps: int = -1, ground: String = BURROW_GROUND) -> BurrowLayout:
	if doorstep_steps < 0:
		doorstep_steps = _tuning_doorstep()
	var shared := shared_ground(ground, doorstep_steps)
	for attempt in range(MAX_ATTEMPTS):
		var deco_seed := "%s:burrow" % seed_value if attempt == 0 \
			else "%s:burrow:%d" % [seed_value, attempt]
		var built := BurrowLayout.new()
		var scattered: Array[Dictionary] = IslandGround.new(shared.map, deco_seed, true, INHABITED_SHARE).placements
		if built._dress(shared, seed_value, scattered, doorstep_steps):
			return built
	var bare := BurrowLayout.new()
	bare._dress(shared, seed_value, [] as Array[Dictionary], doorstep_steps)
	return bare


static var _grounds: Dictionary = {}


## generate.ts `sharedGround` : le sol, son entree, son potager, sa maison,
## mesures nus, une fois par sol. Un sol qui ne tient pas est une erreur de la
## constante : on le dit, et on rend ce qu'on a.
static func shared_ground(ground: String, doorstep_steps: int) -> BurrowLayout:
	var key := "%s#%d" % [ground, doorstep_steps]
	var cached: BurrowLayout = _grounds.get(key)
	if cached != null:
		return cached
	var built := BurrowLayout.new()
	var why := built._build_ground(ground, doorstep_steps)
	if why != "":
		push_error("burrow ground \"%s\": %s" % [ground, why])
	_grounds[key] = built
	return built


## generate.ts `buildGround`.
func _build_ground(ground: String, doorstep_steps: int) -> String:
	var ground_seed := "%s:burrow" % ground
	seed_text = ground
	map = IslandMap.new(COLS, ROWS, Iso.BURROW_ORIGIN)
	map.seed_text = ground_seed
	map.shape(ground_seed, LAND, RISE, RAGGEDNESS, TIERS)
	# UNE SEULE HAUTEUR, CELLE DU POTAGER (2026-09-30) : les plateaux du bruit
	# sont aplanis — ceux pres de la porte montaient vers rien.
	_flatten()
	var body := _main_body({})
	if body.size() < MIN_BODY:
		return "body_too_small"
	entrance = _pick_entrance(body)
	if entrance < 0:
		return "no_entrance"
	field = _pick_field(body, entrance)
	if field.size() < FIELD_CELLS / 2:
		return "field_too_small"
	# LA COLLINE (2026-09-30) : le potager reste au palier 1, le relief est
	# une colline dans le coin le plus a droite de l'ecran, loin de la porte
	# et du potager. Un palier = un pas (MAX_STEP) : on la grimpe. Le sol est
	# remesure sur la carte levee.
	_raise_hill()
	var lifted := _main_body({})
	var in_lifted := {}
	for t in lifted:
		in_lifted[t] = true
	if not in_lifted.has(entrance):
		return "field_cut_off"
	for t in field:
		if not in_lifted.has(t):
			return "field_cut_off"
	body = lifted
	var steps := _step_distances(body, entrance)
	var best := INF
	for t in field:
		if steps.has(t):
			best = minf(best, float(steps[t]))
	if best == INF or best < MIN_CROSSING:
		return "crossing_too_short"
	crossing = int(best)
	doorstep = _pick_doorstep(steps, crossing, field, doorstep_steps)
	_paint(body)
	placements = []
	var cap := maxi(MAX_CROSSING, crossing)
	for c in _house_candidates():
		if _settle([] as Array[Dictionary], house_cells(c), cap, doorstep_steps) == "":
			building = c
			return ""
	return "no_house"


## generate.ts `HILL_*`, `flatten` et `raiseHill`.
const HILL_TIER := 3
const HILL_TOP := 1
const HILL_SLOPE := 2
const HILL_INLAND := 2


## Toute la terre au palier 1 : les plateaux du bruit disparaissent.
func _flatten() -> void:
	for i in range(map.level.size()):
		if map.level[i] > 1:
			map.level[i] = 1
	map.tiers = 1


## generate.ts `raiseHill` : la colline dans le coin le plus a droite de
## l'ecran, pres de l'epouvantail (le user, 2026-09-30). Le coin = la case de
## terre au plus grand `col - row` (la plus petite a egalite) ; le centre = la
## case a HILL_INLAND de la mer au moins la plus proche du coin (a egalite :
## plus a droite, puis la plus petite). LA MER PLAFONNE LA HAUTEUR : une case
## a `d` de l'eau monte au palier `d` au plus — il reste toujours une plage.
func _raise_hill() -> void:
	var corner := -1
	var corner_key := -(1 << 30)
	for tile in range(map.level.size()):
		if map.level[tile] == 0:
			continue
		var c := cell_of(tile)
		if c.x - c.y > corner_key:
			corner = tile
			corner_key = c.x - c.y
	if corner < 0:
		return
	var k := cell_of(corner)
	var centre := -1
	var best := Vector2i.ZERO
	for tile in range(map.level.size()):
		if map.level[tile] == 0:
			continue
		var c := cell_of(tile)
		if sea_distance(c) < HILL_INLAND:
			continue
		var key := Vector2i(maxi(absi(c.x - k.x), absi(c.y - k.y)), -(c.x - c.y))
		if centre < 0 or key.x < best.x or (key.x == best.x and key.y < best.y):
			centre = tile
			best = key
	if centre < 0:
		return
	var ce := cell_of(centre)
	var raised: Array = []
	for row in range(ROWS):
		for col in range(COLS):
			var i := index(Vector2i(col, row))
			if map.level[i] == 0:
				continue
			var d := maxi(absi(ce.x - col), absi(ce.y - row))
			var want := HILL_TIER if d <= HILL_TOP else (HILL_TIER - 1 if d <= HILL_SLOPE else 1)
			var tier := mini(want, sea_distance(Vector2i(col, row)))
			if tier > map.level[i]:
				raised.append([i, tier])
	for r in raised:
		map.level[int(r[0])] = int(r[1])
	map.tiers = HILL_TIER


## generate.ts `dress` : le decor du joueur sur le sol commun, degage de la
## porte, du potager et de la maison, puis mesure. Faux si ce tirage coupe le
## potager ou etire la traversee au-dela de MAX_CROSSING.
func _dress(shared: BurrowLayout, seed_value: String, scattered: Array[Dictionary],
		doorstep_steps: int) -> bool:
	seed_text = seed_value
	map = shared.map
	entrance = shared.entrance
	field = shared.field.duplicate()
	building = shared.building
	var square := house_cells(building)
	var under := {}
	for q in square:
		under[index(q)] = true
	var cleared := _clear_around(scattered, [entrance], DOOR_CLEARING, DOOR_CLEARING_TREES)
	var tidied: Array[Dictionary] = []
	for p in _clear_around(cleared, field, FIELD_CLEARING, FIELD_CLEARING_TREES):
		if not under.has(index(Vector2i(int(p.x), int(p.y)))):
			tidied.append(p)
	if _settle(tidied, square, MAX_CROSSING, doorstep_steps) != "":
		return false
	var solid := _solid(tidied)
	for q in square:
		solid[q] = true
	placements = _on_the_homestead(tidied, _main_body(solid))
	return true


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


## cells.ts `minable` : le sol nu seulement — ni l'entree, ni le paillasson,
## ni le potager, ni sous la maison (2026-09-23). Le serveur refuse pareil.
func is_trappable(tile: int) -> bool:
	if kind(tile) != Cell.GROUND:
		return false
	return building.x < 0 or not house_cells(building).has(cell_of(tile))


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

## generate.ts `settle` : le sol mesure avec la maison posee dessus — le
## terrier, la traversee, le paillasson — ou pourquoi le potager est hors
## d'atteinte. Ne touche a rien quand il refuse.
func _settle(list: Array[Dictionary], square: Array[Vector2i], cap: int,
		doorstep_steps: int) -> String:
	var solid := _solid(list)
	for q in square:
		solid[q] = true
	var homestead := _main_body(solid)
	var member := {}
	for t in homestead:
		member[t] = true
	if not member.has(entrance):
		return "field_unreachable"
	for t in field:
		if not member.has(t):
			return "field_unreachable"
	var steps := _step_distances(homestead, entrance)
	var best := INF
	for t in field:
		if steps.has(t):
			best = minf(best, float(steps[t]))
	if best == INF:
		return "field_unreachable"
	if best < MIN_CROSSING:
		return "crossing_too_short"
	if best > cap:
		return "crossing_too_long"
	crossing = int(best)
	doorstep = _pick_doorstep(steps, crossing, field, doorstep_steps)
	_paint(homestead)
	return ""


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


## generate.ts `pickEntrance` : la case du bord LA PLUS BASSE A L'ECRAN
## (col + row le plus grand), puis la plus au milieu (|col - row| le plus
## petit), puis la plus petite case. Le pillard monte du bas, le potager pousse
## en haut (2026-09-30). Plus de tirage : il ne servait qu'a varier le cote
## d'un terrier a l'autre, du temps ou chacun avait son sol.
func _pick_entrance(main: Array[int]) -> int:
	var best := -1
	var best_key := Vector3i.ZERO
	for t in main:
		var c := cell_of(t)
		if map.level_at(c.x, c.y) != 1:
			continue
		if _edge_distance(c) > ENTRANCE_BAND:
			continue
		var key := Vector3i(-(c.x + c.y), absi(c.x - c.y), t)
		if best < 0 or key < best_key:
			best = t
			best_key = key
	return best


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


## generate.ts `houseCandidates` : ou la maison peut se poser, la meilleure
## d'abord — quatre cases de sol nu et plat, a cote du potager, dans les
## terres, loin de la porte. Deux anneaux de mer, puis un ; a score egal, la
## plus petite case.
func _house_candidates() -> Array[Vector2i]:
	var door := cell_of(entrance)
	var standing := {}
	for p in placements:
		standing[index(Vector2i(int(p.x), int(p.y)))] = true
	var out: Array[Vector2i] = []
	for inland in [BUILDING_INLAND, BUILDING_INLAND - 1]:
		var pass_: Array = []
		for tile in range(COLS * ROWS):
			var c := cell_of(tile)
			if not _roomy(c, standing):
				continue
			var to_sea := sea_distance(c)
			if to_sea < inland or (inland < BUILDING_INLAND and to_sea >= BUILDING_INLAND):
				continue
			var to_field := 1 << 30
			for f in field:
				var fc := cell_of(f)
				to_field = mini(to_field, maxi(absi(fc.x - c.x), absi(fc.y - c.y)))
			if to_field < 1 or to_field > 2:
				continue
			var to_door := maxi(absi(door.x - c.x), absi(door.y - c.y))
			pass_.append([-to_field * 8.0 + mini(to_sea, 3) * 2.0 + to_door * 0.5, tile])
		pass_.sort_custom(func(a, b): return a[0] > b[0] or (a[0] == b[0] and a[1] < b[1]))
		for e in pass_:
			out.append(cell_of(int(e[1])))
	return out


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
