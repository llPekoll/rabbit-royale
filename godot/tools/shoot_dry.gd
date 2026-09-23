extends SceneTree
## A SEC, EN IMAGES : le lapin depense son dernier point, tombe, s'endort, et
## le monde passe au gris avec « OUT OF ENERGY » (island.gd `_end_run`,
## drain.gd). En fenetre (pas --headless : rien ne se rend sans GPU).
##
##   /Applications/Godot.app/Contents/MacOS/Godot --path godot \
##       --script res://tools/shoot_dry.gd -- --out=/tmp/dry
##
## Ecrit <out>-0.png ... <out>-N.png.

const SEED := "room-probe-7"
## Les instants, en secondes apres `run_over`.
const AT := [0.0, 0.3, 0.6, 1.0, 1.6, 2.4, 2.9]

var _main: Node
var _out := "/tmp/dry"


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
	var spawn: Vector2i = island._ground.spawn()
	var state = get_root().get_node("RunState")
	state._fake_me = "me"
	var rabbits := [
		{"playerId": "me", "name": "Moi", "tile": board.index_of(spawn), "energy": 1, "carrots": 0, "alive": true, "stunMs": 0},
	]
	_ev("island", {"seed": SEED, "tier": "meadow",
		"revealed": [{"tile": board.index_of(spawn), "content": "empty", "adjacent": 1}],
		"chests": [], "hinted": [], "flagged": [], "warnStage": 0, "dugFraction": 0.0,
		"chestsTaken": 0, "chestsTotal": 3, "rabbits": rabbits, "sheep": []})
	await _wait(2.0)
	island = _main.get_node("%World").get_child(0)
	print("remote=", island._remote)
	state._on_run_over({"carrots": 3, "tilesDug": 12, "bombsHit": 1, "durationMs": 60000, "cleared": false, "level": 2, "leveledUp": false})
	var t0 := Time.get_ticks_msec()
	for i in AT.size():
		var due: float = AT[i]
		var wait := due - float(Time.get_ticks_msec() - t0) / 1000.0
		if wait > 0.0:
			await _wait(wait)
		await process_frame
		get_root().get_texture().get_image().save_png("%s-%d.png" % [_out, i])
		print("shot %d at %.2fs place=%s" % [i, float(Time.get_ticks_msec() - t0) / 1000.0, screens.place])
	quit()
