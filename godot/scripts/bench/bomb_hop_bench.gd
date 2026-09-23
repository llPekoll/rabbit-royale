extends Node2D
## LE BANC DU SAUT SUR UNE BOMBE : la vraie ile hors ligne, et le lapin qui
## saute sur une bombe dans chaque cas possible, l'un apres l'autre, en boucle —
## les huit voisines a plat, puis un pas qui monte et un pas qui descend.
##
##   godot --path godot scenes/bench/bomb_hop_bench.tscn
##   ... -- --slow=0.3             # au ralenti (Engine.time_scale)
##   ... -- --only=5               # un seul cas, rejoue en boucle
##   ... -- --online               # les evenements de la socket, dans l'ordre
##                                 # du serveur : tile_revealed, bomb_hit, rabbit_moved
##   ... -- --trace                # la position VUE du lapin, image par image
##   ... -- --shot=/tmp/hop.png --after=2
##
## Le chemin est celui du jeu : `Island._local_tap` -> `LocalRun.move` ->
## `blast_back` (le saut, le renvoi, les etoiles, le releve). Entre deux cas,
## le banc remet la case en terre, y enterre une bombe, et repose le lapin a
## cote.
##
## Clavier : espace pause, fleches cas precedent / suivant.

const ISLAND := preload("res://scenes/island.tscn")
const SEED := "bomb-hop"
const BEAT := 3.2

const DIRS := {
	Vector2i(1, 0): "E", Vector2i(-1, 0): "O", Vector2i(0, 1): "S", Vector2i(0, -1): "N",
	Vector2i(1, 1): "SE", Vector2i(-1, -1): "NO", Vector2i(1, -1): "NE", Vector2i(-1, 1): "SO",
}

var _island: Island
var _label: Label
var _cases: Array = []
var _at := 0
var _paused := false
var _only := -1
var _online := false


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--slow="):
			Engine.time_scale = float(a.trim_prefix("--slow="))
		elif a.begins_with("--only="):
			_only = int(a.trim_prefix("--only="))
		elif a == "--online":
			_online = true
		elif a.begins_with("--shot="):
			# Une capture n'ecoute pas le clavier (voir dig_sandbox.gd).
			set_process_unhandled_input(false)

	_island = ISLAND.instantiate()
	_island.own_mark = false
	add_child(_island)
	_island.set_standalone(true)
	_island.play_local(SEED, "c1", 0.0)

	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	_label = Kit.label("", 16, Palette.CREAM)
	_label.position = Vector2(Kit.EDGE, 140.0)
	layer.add_child(_label)

	await get_tree().process_frame
	_cases = _find_cases()
	print("[bomb-hop] %d cas" % _cases.size())
	DevShot.arm(self)
	if _only >= 0:
		_at = clampi(_only, 0, _cases.size() - 1)
	_loop()


## LES CAS : pour chaque direction, deux cases voisines de meme palier, et un
## pas qui monte, un pas qui descend. Les plus proches de l'apparition, pour que
## la camera ne traverse pas l'ile.
func _find_cases() -> Array:
	var board := _island.local_run.board
	var ground := board.ground
	var map := board.map
	var spawn := _island.local_run.at
	var best := {}
	for from in board.content:
		for d in DIRS:
			var to: Vector2i = from + d
			if not board.content.has(to) or not ground.can_step(from, to):
				continue
			if not ground.is_walkable(from):
				continue
			var rise := map.level_at(to.x, to.y) - map.level_at(from.x, from.y)
			var key: String = DIRS[d] if rise == 0 else ("monte" if rise > 0 else "descend")
			var far := Vector2(from - spawn).length()
			if not best.has(key) or far < best[key].far:
				best[key] = {"from": from, "to": to, "far": far, "name": key, "dir": DIRS[d]}
	var out: Array = []
	for k in ["E", "SE", "S", "SO", "O", "NO", "N", "NE", "monte", "descend"]:
		if best.has(k):
			out.append(best[k])
	return out


func _loop() -> void:
	while is_inside_tree():
		if not _paused and not _cases.is_empty():
			_play(_cases[_at])
			if _only < 0:
				_at = (_at + 1) % _cases.size()
		await get_tree().create_timer(BEAT).timeout


## UN CAS : la case d'arrivee remise en terre avec une bombe dessous, le lapin
## repose sur la case de depart, puis la tape du doigt.
func _play(c: Dictionary) -> void:
	if "--trace" in OS.get_cmdline_user_args():
		_trace.call_deferred()
	var run := _island.local_run
	var board := run.board
	var from: Vector2i = c.from
	var to: Vector2i = c.to
	board.state[from] = IslandBoard.State.DUG
	board.content[from] = IslandBoard.Content.EMPTY
	board.content[to] = IslandBoard.Content.BOMB
	board.state[to] = IslandBoard.State.BURIED
	board.flagged.erase(to)
	# Le plateau se souvient des cases qu'il a vues s'ouvrir : sans ca, une
	# case deja ouverte ne rejoue pas son feu.
	_island._tiles._dug.erase(to)
	board.recompute_adjacent()
	run.at = from
	run.alive = true
	run.energy = 100
	run.stunned_until = 0
	_island._local_over = false
	_island._rabbit.place_at(from)
	_island._tiles.refresh()
	_island._refresh_ring()
	var label := "%d/%d  %s" % [_cases.find(c) + 1, _cases.size(), c.name]
	if c.name != c.dir:
		label += " (%s)" % c.dir
	_label.text = label
	print("[bomb-hop] ", label, "  ", from, " -> ", to)
	await get_tree().create_timer(0.5).timeout
	if not _online:
		_island._local_tap(to)
		return
	# EN LIGNE : ce que server/index.ts emet pour un pas sur une bombe, dans
	# son ordre et dans la meme image, comme la socket les rend.
	var me := RunState.current.my_id()
	var tile := board.index_of(to)
	_island._remote = true
	_island._on_board_event("tile_revealed", {"tile": tile, "content": "bomb",
		"adjacent": board.adjacent.get(to, 0), "dugBy": me})
	var back := board.index_of(from)
	_island._on_board_event("bomb_hit", {"playerId": me, "tile": back, "bomb": tile, "stunMs": 1200})
	_island._on_board_event("rabbit_moved", {"playerId": me, "tile": back})
	_island._remote = false


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match event.keycode:
		KEY_SPACE:
			_paused = not _paused
		KEY_RIGHT:
			_at = (_at + 1) % maxi(1, _cases.size())
		KEY_LEFT:
			_at = (_at - 1 + _cases.size()) % maxi(1, _cases.size())


## OU LE LAPIN EST VU (noeud + sprite), toutes les 40 ms pendant 2,4 s apres
## la tape : compte les mouvements sans se fier a une capture.
func _trace() -> void:
	await get_tree().create_timer(0.5).timeout
	var r: HomeRabbit = _island._rabbit
	var last := Vector2.INF
	var anim := ""
	for i in 60:
		var seen: Vector2 = r.position + r._sprite.position
		var now := "%s:%d" % [r._sprite.animation, r._sprite.frame]
		if last == Vector2.INF or seen.distance_to(last) > 0.5 or now != anim:
			print("[trace] %4d ms  %s  %s  at=%s" % [i * 40, seen.round(), now, r.at()])
		anim = now
		last = seen
		await get_tree().create_timer(0.04).timeout
