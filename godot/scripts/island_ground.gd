extends RefCounted
class_name IslandGround
## CE QUI SE TIENT SUR L'ILE, ET OU UN LAPIN PEUT ALLER.
##
## Porte de trois fichiers du web, la partie qui ne tire rien au sort en
## secret :
##
##   • src/game/island/terrain.ts — `scatterScenery` + `scatterLivestock` : les
##     arbres, buissons, objets, reperes, moutons et soldats, tires de la graine
##     PUBLIQUE (`<graine>:deco`, `<graine>:life`).
##   • src/game/island/board.ts — `playableCells`, `canStep`, `stepsFrom` : le
##     plus grand bloc ou l'on marche, et le pas d'une case a l'autre.
##   • src/lib/game/terrainBoard.ts — `farmableTiles`, `spawnTile`.
##
## POURQUOI LE DECOR COMPTE AVANT MEME D'ETRE DESSINE. Le serveur n'enterre
## rien sous un arbre : `farmableTiles` saute toute case qu'un objet FIXE
## occupe. Oublier le decor ici donnerait un plateau plus grand que le sien,
## donc d'autres comptes (bombes = part du TOTAL), donc un autre tirage des
## le premier `rng()`. La cote serait juste et tout ce qui est dessous faux.
##
## ARITHMETIQUE PURE, comme `BurrowMap` et `IslandBoard` : aucun noeud.
##
## LA CONVENTION DES INDEX : ligne d'abord, `y * width + x`, comme `toIndex`.
## L'ordre dans lequel on parcourt la grille EST l'ordre des tirages — un
## balayage colonne d'abord donnerait une autre ile a partir de la meme graine.

## Le plus grand ecart de palier qu'un pas franchit (board.ts `MAX_STEP`).
const MAX_STEP := 1

## LES HUIT PAS, dans l'ordre du web — il compte : `stepsFrom` rend ses cases
## dans cet ordre, et la marche en largeur qui mesure la profondeur des bombes
## en herite.
const STEPS: Array[Vector2i] = [
	Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1),
	Vector2i(-1, 0), Vector2i(1, 0),
	Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1),
]

## terrain.ts — les chances par case, et combien de variantes a chaque art.
const TREE_CHANCE := 0.08
const BUSH_CHANCE := 0.05
const PROP_CHANCE := 0.11
const LANDMARK_CHANCE := 0.08
const INHABITED_SHARE := 0.0075
const INHABITANT_SPACING := 1
const VARIANT_COUNT := {"tree": 4, "bush": 4, "prop": 15, "landmark": 3, "rock": 4}

## Les troupeaux : un mouton broute, un soldat monte la garde.
const LIVESTOCK := [
	{"kind": "sheep", "weight": 10, "min": 1, "max": 2},
	{"kind": "soldier", "weight": 6, "min": 1, "max": 2},
]

## blocking.ts `THING_RULES`. BLOQUE = on ne marche pas dessus ; ERRE = il
## bouge, donc sa case reste cultivable (un mouton s'en va, un arbre non).
const BLOCKS := {
	"tree": true, "stump": true, "rock": true, "bush": false, "prop": false,
	"landmark": true, "sheep": true, "soldier": true,
}
const WANDERS := {"sheep": true}

var map: BurrowMap
## La graine du SOL — `ground_seed` deja applique : toute premiere ile est
## taillee dans le meme.
var seed_text := ""

## Ce qui se tient sur l'ile, dans l'ordre ou le web l'a pose :
## `{kind, x, y, variant}`.
var placements: Array[Dictionary] = []

## case -> placement. Le DERNIER pose gagne, comme le `Map.set` du web : un
## soldat pose sur un objet le remplace dans ce que la case repond.
var _by_cell: Dictionary = {}
## Le plus grand bloc ou l'on marche (`playableCells`).
var _main: Dictionary = {}


func _init(p_map: BurrowMap, p_seed: String, scenery: bool = true) -> void:
	map = p_map
	seed_text = p_seed
	if scenery:
		_scatter_scenery()
		_scatter_livestock()
	for p in placements:
		_by_cell[Vector2i(p.x, p.y)] = p
	_main = _playable_cells()


## LA PREMIERE ILE, sans rien dessus : son couloir fait une case de large, et
## un seul pin le coupait en deux (terrainBoard.ts `carveTutorial`).
static func bare(p_map: BurrowMap, p_seed: String) -> IslandGround:
	return IslandGround.new(p_map, p_seed, false)


# ---------------------------------------------------------------- le plateau

func is_on_board(c: Vector2i) -> bool:
	return _main.has(c)


func occupant_at(c: Vector2i) -> Dictionary:
	return _by_cell.get(c, {})


## Un objet qui bloque ET ne bouge pas : un arbre, un repere, un soldat.
func is_fixed(c: Vector2i) -> bool:
	var o: Dictionary = _by_cell.get(c, {})
	if o.is_empty():
		return false
	return bool(BLOCKS.get(o.kind, false)) and not WANDERS.has(o.kind)


func is_walkable(c: Vector2i) -> bool:
	return is_on_board(c) and not is_fixed(c)


## Les cases ou le serveur enterre quelque chose, ligne d'abord.
func farmable_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(map.height):
		for x in range(map.width):
			var c := Vector2i(x, y)
			if is_walkable(c):
				out.append(c)
	return out


## UN PAS : voisine, praticable, et au plus un palier d'ecart. Une falaise de
## deux paliers se voit, se compte dans les chiffres, et ne se monte pas.
func can_step(from: Vector2i, to: Vector2i) -> bool:
	if not is_on_board(from) or not is_walkable(to):
		return false
	var d := (to - from).abs()
	if d.x > 1 or d.y > 1 or d == Vector2i.ZERO:
		return false
	return absi(map.level_at(to.x, to.y) - map.level_at(from.x, from.y)) <= MAX_STEP


func steps_from(c: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for s in STEPS:
		if can_step(c, c + s):
			out.append(c + s)
	return out


## L'APPARITION : la case praticable et INOCCUPEE la plus proche du milieu de
## la grille, a la distance de Manhattan. Une manche ne commence pas sur un
## mouton, ni sur un buisson.
func spawn() -> Vector2i:
	var mid := Vector2((map.width - 1) / 2.0, (map.height - 1) / 2.0)
	var best := Vector2i(-1, -1)
	var best_d := INF
	for y in range(map.height):
		for x in range(map.width):
			var c := Vector2i(x, y)
			if not is_walkable(c) or _by_cell.has(c):
				continue
			var d := absf(x - mid.x) + absf(y - mid.y)
			if d < best_d:
				best_d = d
				best = c
	return best


## LE PLUS GRAND BLOC DE TERRE ou l'on passe d'une case a l'autre sans sauter
## deux paliers. Le reste est de la terre qu'on voit et ou l'on ne va jamais :
## le serveur n'y met rien. Egalite : le premier trouve, ligne d'abord.
func _playable_cells() -> Dictionary:
	var seen := {}
	var best := {}
	for y0 in range(map.height):
		for x0 in range(map.width):
			var start := Vector2i(x0, y0)
			if map.level_at(x0, y0) <= 0 or seen.has(start):
				continue
			var group := {start: true}
			var stack: Array[Vector2i] = [start]
			seen[start] = true
			while not stack.is_empty():
				var c: Vector2i = stack.pop_back()
				var here := map.level_at(c.x, c.y)
				for s in STEPS:
					var n := c + s
					if group.has(n) or map.level_at(n.x, n.y) <= 0:
						continue
					if absi(map.level_at(n.x, n.y) - here) > MAX_STEP:
						continue
					group[n] = true
					seen[n] = true
					stack.append(n)
			if group.size() > best.size():
				best = group
	return best


# ---------------------------------------------------------------- le decor

func _is_interior(x: int, y: int, tier: int) -> bool:
	return map.level_at(x - 1, y) == tier and map.level_at(x + 1, y) == tier \
		and map.level_at(x, y - 1) == tier and map.level_at(x, y + 1) == tier


func _under_cliff(x: int, y: int, tier: int) -> bool:
	return map.level_at(x, y - 1) > tier


static func _floor_mul(rng: Rng, n: int) -> int:
	return int(floor(rng.next() * n))


## terrain.ts `scatterScenery` — un tirage par case de terre, puis un pour la
## variante. L'arbre veut une case INTERIEURE (ses voisines au meme palier) :
## au bord d'une falaise, sa ramure pendrait dans le vide.
func _scatter_scenery() -> void:
	var rng := Rng.from_seed("%s:deco" % seed_text)
	for y in range(map.height):
		for x in range(map.width):
			var tier := map.level_at(x, y)
			if tier == 0 or _under_cliff(x, y, tier):
				continue
			var roll := rng.next()
			if roll < TREE_CHANCE and _is_interior(x, y, tier):
				placements.append({"kind": "tree", "x": x, "y": y,
					"variant": _floor_mul(rng, VARIANT_COUNT.tree)})
			elif roll < TREE_CHANCE + BUSH_CHANCE:
				placements.append({"kind": "bush", "x": x, "y": y,
					"variant": _floor_mul(rng, VARIANT_COUNT.bush)})
			elif roll < TREE_CHANCE + BUSH_CHANCE + PROP_CHANCE:
				var landmark := rng.next() < LANDMARK_CHANCE
				var kind := "landmark" if landmark else "prop"
				placements.append({"kind": kind, "x": x, "y": y,
					"variant": _floor_mul(rng, VARIANT_COUNT[kind])})


## terrain.ts `scatterLivestock` — moutons et soldats, en petits groupes
## espaces d'une case, sur une part fixe de la terre.
func _scatter_livestock() -> void:
	var rng := Rng.from_seed("%s:life" % seed_text)
	var blocked := {}
	for p in placements:
		if p.kind != "prop":
			blocked[Vector2i(p.x, p.y)] = true
	var inhabited := {}

	var candidates: Array[Vector2i] = []
	var land_cells := 0
	for y in range(map.height):
		for x in range(map.width):
			var tier := map.level_at(x, y)
			if tier == 0:
				continue
			land_cells += 1
			if blocked.has(Vector2i(x, y)) or _under_cliff(x, y, tier):
				continue
			if not _is_interior(x, y, tier):
				continue
			candidates.append(Vector2i(x, y))

	_shuffle(rng, candidates)

	var budget := int(floor(land_cells * INHABITED_SHARE))
	var total_weight := 0
	for e in LIVESTOCK:
		total_weight += int(e.weight)
	var placed := 0

	var clear_of := func(c: Vector2i) -> bool:
		for dy in range(-INHABITANT_SPACING, INHABITANT_SPACING + 1):
			for dx in range(-INHABITANT_SPACING, INHABITANT_SPACING + 1):
				if inhabited.has(c + Vector2i(dx, dy)):
					return false
		return not blocked.has(c)

	for spot in candidates:
		if placed >= budget:
			break
		if not clear_of.call(spot):
			continue
		var roll := rng.next() * total_weight
		var entry: Dictionary = LIVESTOCK[0]
		for e in LIVESTOCK:
			roll -= float(e.weight)
			if roll < 0.0:
				entry = e
				break
		var size: int = int(entry.min) + _floor_mul(rng, int(entry.max) - int(entry.min) + 1)
		for n in range(size):
			if placed >= budget:
				break
			var cell: Vector2i = spot if n == 0 else _nearby_free(spot, rng, clear_of)
			if cell.x < 0:
				break
			placements.append({"kind": entry.kind, "x": cell.x, "y": cell.y,
				"variant": _floor_mul(rng, 3)})
			inhabited[cell] = true
			blocked[cell] = true
			placed += 1


func _nearby_free(at: Vector2i, rng: Rng, clear_of: Callable) -> Vector2i:
	var ring: Array[Vector2i] = STEPS.duplicate()
	_shuffle(rng, ring)
	for s in ring:
		var n := at + s * (INHABITANT_SPACING + 1)
		var tier := map.level_at(n.x, n.y)
		if tier == 0 or _under_cliff(n.x, n.y, tier) or not _is_interior(n.x, n.y, tier):
			continue
		if not clear_of.call(n):
			continue
		return n
	return Vector2i(-1, -1)


## rng.ts `shuffle` — Fisher-Yates de la fin vers le debut, un tirage par pas.
static func _shuffle(rng: Rng, arr: Array) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j := int(floor(rng.next() * (i + 1)))
		var t = arr[i]
		arr[i] = arr[j]
		arr[j] = t
