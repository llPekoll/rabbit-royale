extends RefCounted
class_name IslandFlock
## LES MOUTONS S'ECARTENT — porte de src/lib/game/flee.ts, pour l'ile HORS
## LIGNE. En ligne, c'est le serveur qui tient le troupeau (`FLOCK_TICK_MS`,
## server/index.ts) et l'ile ne fait que jouer `sheep_moved`.
##
## Un mouton n'est pas un obstacle : c'est un animal qui broute et qui DETALE
## quand un lapin approche. Les regles du web, dans son ordre :
##
##   1. il panique quand un lapin est a `PANIC_RADIUS` cases ou moins ;
##   2. OU il va est TIRE AU SORT parmi ce qu'il peut atteindre, pas « loin du
##      lapin » : un mouton previsible se rabat dans un coin expres ;
##   3. calme, il derive d'une case, et seulement parfois (`GRAZE_CHANCE`) ;
##   4. affole, il court jusqu'a `SPRINT_STEPS` cases d'un coup, et grimpe un
##      palier s'il le faut — c'est ce qui l'empeche de murer un cul-de-sac.
##
## Rien ici ne touche un noeud : `plan` dit ou chaque mouton IRAIT, et
## l'appelant l'applique (`IslandGround.move_sheep`, puis le decor).

const PANIC_RADIUS := 2
const SPRINT_STEPS := 4
const GRAZE_CHANCE := 0.25
## `FLOCK_TICK_MS` du serveur.
const TICK_SECONDS := 0.5


## Le tour du troupeau. Rend les vols `{id, from, to, path, sprinting}`, dans
## l'ordre ou ils ont ete decides — chacun a reserve sa case avant que le
## suivant ne choisisse, donc deux moutons ne tombent jamais sur la meme.
##
## `rabbits` : les cases des lapins vivants.
static func plan(ground: IslandGround, rabbits: Array[Vector2i]) -> Array[Dictionary]:
	var occupied := {}
	for id in ground.sheep:
		occupied[ground.sheep[id]] = true
	for r in rabbits:
		occupied[r] = true
	var flights: Array[Dictionary] = []
	for id in ground.sheep.keys():
		var at: Vector2i = ground.sheep[id]
		var flight := _flight(id, at, ground, occupied, _spooked(at, rabbits))
		if flight.is_empty():
			continue
		occupied.erase(flight.from)
		occupied[flight.to] = true
		flights.append(flight)
	return flights


## `cellDistance` : Chebyshev, l'ile se marche en diagonale.
static func _spooked(at: Vector2i, rabbits: Array[Vector2i]) -> bool:
	for r in rabbits:
		if maxi(absi(at.x - r.x), absi(at.y - r.y)) <= PANIC_RADIUS:
			return true
	return false


static func _free(ground: IslandGround, occupied: Dictionary, c: Vector2i) -> bool:
	return ground.is_walkable(c) and not occupied.has(c)


static func _flight(id: String, at: Vector2i, ground: IslandGround, occupied: Dictionary,
		spooked: bool) -> Dictionary:
	if not spooked:
		if randf() > GRAZE_CHANCE:
			return {}
		var tier := ground.map.level_at(at.x, at.y)
		var open: Array[Vector2i] = []
		for c in ground.steps_from(at):
			if _free(ground, occupied, c) and ground.map.level_at(c.x, c.y) == tier:
				open.append(c)
		if open.is_empty():
			return {}
		var step: Vector2i = open[randi() % open.size()]
		return {"id": id, "from": at, "to": step, "path": [step], "sprinting": false}

	var route := _sprint_route(at, ground, occupied)
	if route.is_empty():
		return {}
	return {"id": id, "from": at, "to": route[-1], "path": route, "sprinting": true}


## `sprintRoute` : un balayage en largeur jusqu'a `SPRINT_STEPS`, puis une
## destination tiree dans l'anneau le PLUS LOIN qui a quelque chose — sur le
## palier du mouton d'abord. La chaine des parents donne le plus court chemin :
## il court droit, il ne tourne pas en rond.
static func _sprint_route(start: Vector2i, ground: IslandGround, occupied: Dictionary) -> Array[Vector2i]:
	var start_tier := ground.map.level_at(start.x, start.y)
	var came_from := {start: start}
	var rings: Array = []
	var frontier: Array[Vector2i] = [start]
	for depth in SPRINT_STEPS:
		if frontier.is_empty():
			break
		var next: Array[Vector2i] = []
		for cell in frontier:
			for step in ground.steps_from(cell):
				if came_from.has(step) or not _free(ground, occupied, step):
					continue
				came_from[step] = cell
				next.append(step)
		if not next.is_empty():
			rings.append(next)
		frontier = next

	for i in range(rings.size() - 1, -1, -1):
		var ring: Array[Vector2i] = rings[i]
		var level: Array[Vector2i] = []
		for c in ring:
			if ground.map.level_at(c.x, c.y) == start_tier:
				level.append(c)
		var pick := level if not level.is_empty() else ring
		var dest: Vector2i = pick[randi() % pick.size()]
		var route: Array[Vector2i] = []
		var c := dest
		while c != start:
			route.push_front(c)
			c = came_from[c]
		return route
	return []
