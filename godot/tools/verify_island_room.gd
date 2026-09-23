extends SceneTree
## LA SALLE A QUATRE, sans serveur : les evenements d'une ile partagee rejoues
## sur la vraie scene, par la meme porte que la socket (`RunState._on_event`).
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_island_room.gd
##
## ATTENDU : chaque ligne finit par « ok », 0 SCRIPT ERROR.
##
## Ce que ca couvre : les lapins des autres (arrivee, pas, depart), la poussee
## d'une case, la poussee A L'EAU (vol, gerbe, remontee au milieu), la foudre
## (petits eclairs, grand eclair, pose foudroyee), la bombe plantee et son
## repere, `hints_changed`, puis le mode spectateur (mon lapin cache, la
## camera sur celui qu'on regarde, la tape armee qui part au serveur).

const SEED := "room-probe-7"

var _main: Node
var _screens: Node
var _fails := 0


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("%s %s" % [label, "ok" if ok else "ECHEC"])


func _init() -> void:
	_run.call_deferred()


func _wait(seconds: float) -> void:
	await create_timer(seconds).timeout


func _ev(name: String, data: Variant) -> void:
	get_root().get_node("RunState")._on_event(name, data)


func _run() -> void:
	_screens = get_root().get_node("Screens")
	_main = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	get_root().add_child(_main)
	await _wait(0.5)
	_screens.show_place(_screens.Place.BURROW)
	await _wait(0.5)
	_screens.cross(_screens.Place.ISLAND)
	await _wait(3.0)
	var island: Node2D = _main.get_node("%World").get_child(0)

	# LE SOL D'ABORD, hors ligne : pour savoir ou poser les lapins et ou est
	# la mer. Puis l'instantane, qui le repose en ligne.
	island.show_ground(SEED)
	var board = island._board
	var map = island._terrain.map
	var shore := _find_shore(board, map)
	_check("un rivage trouve", shore.size() == 3)
	if shore.size() != 3:
		_finish()
		return
	var pusher: Vector2i = shore[0]
	var victim: Vector2i = shore[1]
	var spawn: Vector2i = island._ground.spawn()
	var me_cell := _free_beside(board, spawn, [pusher, victim])

	var state = get_root().get_node("RunState")
	state._fake_me = "me"
	var rabbits := [
		{"playerId": "me", "name": "Moi", "tile": board.index_of(me_cell), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0},
		{"playerId": "bully", "name": "Blackpaw", "tile": board.index_of(pusher), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0},
		{"playerId": "vic", "name": "Thistle", "tile": board.index_of(victim), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0},
	]
	_ev("island", {"seed": SEED, "tier": "meadow", "revealed": [], "chests": [], "hinted": [],
		"flagged": [], "warnStage": 0, "dugFraction": 0.0, "chestsTaken": 0, "chestsTotal": 3,
		"rabbits": rabbits, "sheep": []})
	await _wait(0.3)
	island = _main.get_node("%World").get_child(0)
	_check("en ligne", island._remote)
	_check("deux autres lapins", island._rivals.size() == 2)
	_check("mon lapin visible", island._rabbit.visible)
	_check("mon pelage : siege 0", island._rabbit.seat == 0)
	_check("Thistle : siege 2", island._rivals["vic"].seat == 2)

	# UN QUATRIEME ARRIVE, et repart.
	var free := _free_beside(board, spawn, [pusher, victim, me_cell])
	_ev("rabbit_joined", {"playerId": "late", "name": "Clover", "tile": board.index_of(free), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0})
	await _wait(0.5)
	_check("arrivee : trois autres", island._rivals.size() == 3)
	_check("arrivee : siege 3", island._rivals["late"].seat == 3)
	_ev("rabbit_left", {"playerId": "late", "grace": true})
	_check("depart en grace : reste", island._rivals.has("late"))
	_ev("rabbit_left", {"playerId": "late", "grace": false})
	await _wait(0.5)
	_check("depart : parti", not island._rivals.has("late"))

	# UN PAS D'UN AUTRE.
	var r_bully = island._rivals["bully"]
	var step := _free_beside(board, pusher, [victim, me_cell])
	_ev("rabbit_moved", {"playerId": "bully", "tile": board.index_of(step), "energy": 299, "carrots": 0, "alive": true})
	await _wait(0.5)
	_check("un autre marche", r_bully.at() == step)
	_ev("rabbit_moved", {"playerId": "bully", "tile": board.index_of(pusher), "energy": 299, "carrots": 0, "alive": true})
	await _wait(0.5)

	# A L'EAU : Blackpaw pousse Thistle au large.
	var r_vic = island._rivals["vic"]
	var back := _free_beside(board, spawn, [me_cell])
	_ev("rabbit_pushed", {"playerId": "vic", "from": board.index_of(victim), "to": board.index_of(back),
		"sea": board.index_of(shore[2]), "drowned": true, "pushedBy": "bully", "energy": 270,
		"runOver": false, "stunMs": 2000})
	_ev("rabbit_moved", {"playerId": "bully", "tile": board.index_of(victim), "energy": 299, "carrots": 0, "alive": true})
	await _wait(0.8)
	var splashes := _count(island, "WaterSplash")
	_check("la gerbe est la", splashes == 1)
	_check("sous l'eau", r_vic.is_under())
	await _wait(1.8)
	_check("remonte au milieu", not r_vic.is_under() and r_vic.visible and r_vic.at() == back)
	_check("remonte pose sur sa case", r_vic.position.distance_to(map.screen_of(back.x, back.y) + Vector2(0, Iso.half_h())) < 1.0)

	# UNE POUSSEE D'UNE CASE, sur moi : le pousseur rougit.
	var land := _free_beside(board, me_cell, [back, victim])
	_ev("rabbit_pushed", {"playerId": "me", "from": board.index_of(me_cell), "to": board.index_of(land),
		"pushedBy": "vic", "energy": 300, "runOver": false, "stunMs": 0})
	await _wait(0.8)
	_check("pousse d'une case", island._rabbit.at() == land)
	_check("pose apres le vol", island._rabbit.position.distance_to(map.screen_of(land.x, land.y) + Vector2(0, Iso.half_h())) < 1.0)

	# LA FOUDRE sur Thistle.
	var strike_cells := [board.index_of(back)]
	for n in board._neighbours(back):
		if board.content.has(n):
			strike_cells.append(board.index_of(n))
	_ev("lightning_struck", {"target": board.index_of(back), "castBy": "bully", "tiles": strike_cells, "bombs": 0})
	_ev("rabbit_struck", {"playerId": "vic", "by": "bully", "tile": board.index_of(back), "energy": 240, "stunMs": 2000, "runOver": false})
	await _wait(0.4)
	_check("pose foudroyee", r_vic._shock != null)
	await _wait(1.6)
	_check("la pose s'en va", r_vic._shock == null and r_vic._sprite.visible)

	# UNE BOMBE PLANTEE, puis creusee.
	var hidden := _undug(board, [back, land, victim])
	_ev("bomb_planted", {"tile": board.index_of(hidden)})
	_check("repere de bombe plantee", island._planted.has(hidden))
	_ev("hints_changed", {"tiles": [{"tile": board.index_of(land), "adjacent": 4}]})
	_check("hints_changed", island._board.adjacent.get(land) == 4)
	_ev("tile_revealed", {"tile": board.index_of(hidden), "content": "bomb", "adjacent": 0, "dugBy": "vic", "plantedBy": "me"})
	_check("le repere tombe a la fouille", not island._planted.has(hidden))

	# LA FIN D'UN LAPIN : plus de mort (2026-09-23) — il saute et s'en va.
	_ev("rabbit_died", {"playerId": "vic"})
	await _wait(0.8)
	_check("pas a plat", r_vic._sprite.animation != "sleep")
	_check("sorti de la salle", not island._rivals.has("vic"))

	# SPECTATEUR : je regarde Blackpaw.
	state.spectating = "bully"
	state._fake_me = "watcher"
	_ev("island", {"seed": SEED, "tier": "meadow", "revealed": [], "chests": [], "hinted": [],
		"flagged": [], "warnStage": 0, "dugFraction": 0.0, "chestsTaken": 0, "chestsTotal": 3,
		"rabbits": rabbits, "sheep": []})
	await _wait(0.3)
	_check("spectateur : mon lapin cache", not island._rabbit.visible)
	_check("spectateur : trois lapins dessines", island._rivals.size() == 3)
	_check("spectateur : camera sur Blackpaw", island._me_cell() == pusher)
	_check("spectateur : aucun anneau", island._watching())
	state.set_aiming("plant")
	island._aimed_tap(hidden, Vector2.ZERO)
	_check("la visee retombe apres la tape", state.aiming == "")

	# LA PREMIERE ILE DU SERVEUR : un compte sans manche y est assis. Elle se
	# pose en ligne — avant, l'instantane etait jete et l'ile restait morte.
	state.spectating = ""
	state._fake_me = "me"
	var spawn_i: int = island._board.index_of(TutorialMap.spawn())
	_ev("island", {"seed": "first:me", "tier": "meadow", "first": true, "revealed": [{"tile": spawn_i, "content": "empty", "adjacent": 0}],
		"chests": [{"tile": island._board.index_of(TutorialMap.chest()), "tier": "bronze"}], "hinted": [],
		"flagged": [], "warnStage": 0, "dugFraction": 0.0, "chestsTaken": 0, "chestsTotal": 1,
		"rabbits": [{"playerId": "me", "name": "Moi", "tile": spawn_i, "energy": 300, "carrots": 0, "alive": true, "stunMs": 0}], "sheep": []})
	await _wait(0.3)
	_check("premiere ile : en ligne", island._remote and island._seed == "first:me")
	_check("premiere ile : pas la lecon hors ligne", not island._is_tutorial())
	_check("premiere ile : le coffre est pose", island._board.content.get(TutorialMap.chest()) == IslandBoard.Content.CHEST)
	_check("premiere ile : lapin sur S", island._rabbit.at() == TutorialMap.spawn())

	# L'ILE VIDEE : plus de carte (2026-09-23). Le lapin saute, on rentre au
	# terrier, le niveau suit dans Home et l'ile finie est oubliee.
	_ev("run_over", {"carrots": 40, "tilesDug": 6, "bombsHit": 0, "durationMs": 14000, "cleared": true,
		"level": 3, "leveledUp": true})
	await _wait(0.2)
	var hud: Node = _find(_main, "RunHud")
	var card = hud._card if hud != null else null
	_check("pas de recap", card == null or not is_instance_valid(card))
	_check("la fin se joue", island._ending)
	_check("le niveau suit", int(root.get_node("Home").player.get("level", 0)) == 3)
	await _wait(5.0)
	_check("fin : au terrier", _screens.place == _screens.Place.BURROW)
	_check("fin : l'ile finie est oubliee", state.island.is_empty())

	await _wait(0.5)
	_finish()


func _find(node: Node, cls: String) -> Node:
	for child in node.get_children():
		if child.get_script() != null and child.get_script().get_global_name() == cls:
			return child
		var deep := _find(child, cls)
		if deep != null:
			return deep
	return null


func _finish() -> void:
	print("%d echec(s)" % _fails)
	quit(1 if _fails > 0 else 0)


## UN RIVAGE : un pousseur sur `a`, une victime sur `b`, et la mer a la case
## d'apres dans le meme sens — puis encore une, le vol va a deux cases.
func _find_shore(board, map) -> Array:
	var land: Dictionary = {}
	for c in board.playable():
		land[c] = true
	for b in land:
		for dy in [-1, 0, 1]:
			for dx in [-1, 0, 1]:
				if dx == 0 and dy == 0:
					continue
				var a: Vector2i = b - Vector2i(dx, dy)
				var sea: Vector2i = b + Vector2i(dx, dy)
				var far: Vector2i = sea + Vector2i(dx, dy)
				if land.has(a) and _is_sea(map, sea) and _is_sea(map, far):
					return [a, b, sea]
	return []


func _is_sea(map, c: Vector2i) -> bool:
	if c.x < 0 or c.y < 0 or c.x >= map.width or c.y >= map.height:
		return true
	return not map.is_land(c.x, c.y)


func _free_beside(board, around: Vector2i, taken: Array) -> Vector2i:
	var best := around
	var best_d := 1 << 30
	for c in board.playable():
		if taken.has(c) or c == around and taken.has(around):
			continue
		var d: int = absi(c.x - around.x) + absi(c.y - around.y)
		if d > 0 and d < best_d and not taken.has(c):
			best_d = d
			best = c
	return best


func _undug(board, taken: Array) -> Vector2i:
	for c in board.playable():
		if not taken.has(c) and board.state.get(c) != IslandBoard.State.DUG:
			return c
	return Vector2i(-1, -1)


func _count(node: Node, cls: String) -> int:
	var n := 0
	for child in node.get_children():
		if child.get_script() != null and child.get_script().get_global_name() == cls:
			n += 1
	return n
