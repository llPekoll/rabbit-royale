extends SceneTree
## LA NOYADE, EN IMAGES : Blackpaw pousse Thistle au large, et on prend la
## scene a quelques instants cles. En fenetre (pas --headless : rien ne se
## rend sans GPU).
##
##   /Applications/Godot.app/Contents/MacOS/Godot --path godot \
##       --script res://tools/shoot_drown.gd -- --out=/tmp/drown
##
## Ecrit <out>-0.png ... <out>-N.png.

const SEED := "room-probe-7"
## Les instants, en secondes apres la poussee.
const AT := [0.0, 0.25, 0.5, 0.66, 0.8, 1.1, 1.6, 2.15, 2.6]
const ZOOM := 2.2

var _main: Node
var _out := "/tmp/drown"


func _init() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			_out = arg.trim_prefix("--out=")
	_run.call_deferred()


func _wait(seconds: float) -> void:
	await create_timer(seconds).timeout


func _ev(name: String, data: Variant) -> void:
	get_root().get_node("RunState")._on_event(name, data)


func _run() -> void:
	get_root().size = Vector2i(1280, 720)
	var screens: Node = get_root().get_node("Screens")
	_main = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	get_root().add_child(_main)
	await _wait(0.5)
	screens.show_place(screens.Place.ISLAND)
	await _wait(1.0)
	var island: Node2D = _main.get_node("%World").get_child(0)
	island.show_ground(SEED)
	var board = island._board
	var map = island._terrain.map
	var shore := _find_shore(board, map)
	var pusher: Vector2i = shore[0]
	var victim: Vector2i = shore[1]
	var spawn: Vector2i = island._ground.spawn()
	var state = get_root().get_node("RunState")
	state._fake_me = "me"
	var near := _free_beside(board, pusher, [pusher, victim])
	var back := _free_beside(board, spawn, [near, pusher, victim])
	var rabbits := [
		{"playerId": "me", "name": "Moi", "tile": board.index_of(near), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0},
		{"playerId": "bully", "name": "Blackpaw", "tile": board.index_of(pusher), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0},
		{"playerId": "vic", "name": "Thistle", "tile": board.index_of(victim), "energy": 300, "carrots": 0, "alive": true, "stunMs": 0},
	]
	var revealed := []
	for c in [near, pusher, victim, back]:
		revealed.append({"tile": board.index_of(c), "content": "empty", "adjacent": 1})
	_ev("island", {"seed": SEED, "tier": "meadow", "revealed": revealed, "chests": [], "hinted": [],
		"flagged": [], "warnStage": 0, "dugFraction": 0.0, "chestsTaken": 0, "chestsTotal": 3,
		"rabbits": rabbits, "sheep": []})
	await _wait(1.5)
	island = _main.get_node("%World").get_child(0)
	_frame(island, map, victim)
	await _wait(0.6)

	_ev("rabbit_pushed", {"playerId": "vic", "from": board.index_of(victim), "to": board.index_of(back),
		"sea": board.index_of(shore[2]), "drowned": true, "pushedBy": "bully", "energy": 270,
		"runOver": false, "stunMs": 2000})
	_ev("rabbit_moved", {"playerId": "bully", "tile": board.index_of(victim), "energy": 299, "carrots": 0, "alive": true})
	var t0 := Time.get_ticks_msec()
	for i in AT.size():
		var due: float = AT[i]
		var wait := due - float(Time.get_ticks_msec() - t0) / 1000.0
		if wait > 0.0:
			await _wait(wait)
		_frame(island, map, victim)
		await process_frame
		var img := get_root().get_texture().get_image()
		img.save_png("%s-%d.png" % [_out, i])
		var r = island._rivals.get("vic")
		print("shot %d at %.2fs vis=%s a=%.2f z=%d pos=%s spr=%s/%s/%s rot=%.2f" % [i, float(Time.get_ticks_msec() - t0) / 1000.0,
			r.visible, r.modulate.a, r.z_index, r.position, r._sprite.visible, r._sprite.position, r._sprite.offset, r._sprite.rotation])
	quit()


## La camera sur le rivage, serree : la scene se joue sur trois cases.
func _frame(island: Node2D, map, cell: Vector2i) -> void:
	if island._cam_tween != null and island._cam_tween.is_valid():
		island._cam_tween.kill()
	var view := Vector2(get_root().size)
	var focus: Vector2 = map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	island.scale = Vector2(ZOOM, ZOOM)
	island.position = view * 0.5 - focus * ZOOM + Vector2(-40, 40) * ZOOM


func _find_shore(board, map) -> Array:
	var land: Dictionary = {}
	for c in board.playable():
		land[c] = true
	for b in land:
		for d in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(-1, 0), Vector2i(0, -1)]:
			var a: Vector2i = b - d
			var sea: Vector2i = b + d
			if land.has(a) and not map.is_land(sea.x, sea.y) and not map.is_land(sea.x + d.x, sea.y + d.y) \
					and not map.is_land(sea.x + 2 * d.x, sea.y + 2 * d.y):
				return [a, b, sea]
	return []


func _free_beside(board, around: Vector2i, taken: Array) -> Vector2i:
	var best := around
	var best_d := 1 << 30
	for c in board.playable():
		if taken.has(c):
			continue
		var d: int = absi(c.x - around.x) + absi(c.y - around.y)
		if d > 0 and d < best_d:
			best_d = d
			best = c
	return best
