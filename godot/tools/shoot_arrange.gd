extends SceneTree
## L'AMENAGEMENT EN IMAGES, avec le vrai chrome : la legende de decouverte,
## un arbre pris (le bandeau), survole sur une case refusee puis sur une case
## possible, et repose. RIEN N'EST POSE : aucune ecriture ne part au serveur.
##
##   godot --path godot --script res://tools/shoot_arrange.gd -- --out=/tmp/arr
##       [--size=890x400]
##
## Il lit la session enregistree de la machine, comme le jeu. La legende ne
## se montre qu'a qui n'a jamais rien pris : l'outil efface user://arrange.cfg
## en entrant, et le remet comme il l'a trouve en sortant.

var _out := "/tmp/arr"


func _init() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			_out = arg.trim_prefix("--out=")
	_run.call_deferred()


func _wait(s: float) -> void:
	await create_timer(s).timeout


func _shot(tag: String) -> void:
	await process_frame
	await process_frame
	get_root().get_texture().get_image().save_png("%s-%s.png" % [_out, tag])
	print("[shot] ", tag)


func _run() -> void:
	var size := Vector2i(890, 400)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--size="):
			var wh := arg.trim_prefix("--size=").split("x")
			size = Vector2i(int(wh[0]), int(wh[1]))
	# La fenetre du jeu s'ouvre maximisee (project.godot) : on la rend a la
	# taille demandee, sinon la capture est celle de l'ecran.
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_size(size)
	get_root().size = size
	var had := FileAccess.get_file_as_bytes("user://arrange.cfg")
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://arrange.cfg"))

	get_root().add_child((load("res://scenes/main.tscn") as PackedScene).instantiate())
	var screens: Node = get_root().get_node("Screens")
	var burrow: Node = null
	for i in 200:
		await _wait(0.1)
		burrow = screens.call("at", 0)
		if burrow != null and bool(screens.call("in_world")) and get_root().get_node("Home").call("loaded"):
			break
	if burrow == null:
		print("[shot] pas de terrier")
		quit(1)
		return
	await _wait(3.0)
	await _shot("1-tip")

	var layout: BurrowLayout = burrow.get("_layout")
	var tree := Vector2i(-1, -1)
	for p in layout.placements:
		if p.kind == "tree":
			tree = Vector2i(int(p.x), int(p.y))
			break
	burrow.call("_decor_tap", tree)
	await _wait(0.8)
	await _shot("2-held")

	var arrange: BurrowArrange = burrow.get("_arrange")
	# Une case refusee (occupee par une autre chose, ou dans le potager) et la
	# case possible la plus proche de l'arbre.
	var refused := Vector2i(-1, -1)
	var legal := Vector2i(-1, -1)
	for t in range(BurrowLayout.COLS * BurrowLayout.ROWS):
		var c := BurrowLayout.cell_of(t)
		if c == tree or layout.map.level_at(c.x, c.y) <= 0:
			continue
		if not arrange.targets.has(c):
			if refused.x < 0 or c.distance_squared_to(tree) < refused.distance_squared_to(tree):
				refused = c
		elif c.distance_squared_to(tree) >= 4 and (legal.x < 0 \
				or c.distance_squared_to(tree) < legal.distance_squared_to(tree)):
			legal = c
	burrow.call("_arrange_hover", refused)
	await _wait(0.3)
	await _shot("3-refused")
	burrow.call("_arrange_hover", legal)
	await _wait(0.3)
	await _shot("4-legal")
	burrow.call("arrange_cancel")
	await _wait(0.4)
	await _shot("5-back")

	# UNE TAPE DANS LE VIDE : la vague de ce qui se deplace.
	burrow.call("_decor_tap", legal)
	await _wait(0.2)
	await _shot("6-flash")
	await _wait(1.2)

	# AU DOIGT : l'arbre pris, le doigt pose ailleurs et qui glisse — la
	# chose le suit — puis leve SUR l'arbre, ce qui le repose sans rien
	# enregistrer.
	burrow.call("_decor_tap", tree)
	await _wait(0.4)
	var map: BurrowMap = burrow.get("_terrain").map
	var to_screen := func(c: Vector2i) -> Vector2:
		var b := map.screen_of(c.x, c.y) + Vector2(0, Iso.half_h())
		return b * (burrow as Node2D).scale.x + (burrow as Node2D).position
	var vp := get_root()
	var start: Vector2 = to_screen.call(refused)
	var down := InputEventScreenTouch.new()
	down.index = 0
	down.pressed = true
	down.position = start
	vp.push_input(down)
	await process_frame
	for i in range(1, 7):
		var d := InputEventScreenDrag.new()
		d.index = 0
		d.position = start.lerp(to_screen.call(legal), i / 6.0)
		vp.push_input(d)
		await process_frame
	await _wait(0.3)
	await _shot("7-slide")
	var back := InputEventScreenDrag.new()
	back.index = 0
	back.position = to_screen.call(tree)
	vp.push_input(back)
	await process_frame
	var up := InputEventScreenTouch.new()
	up.index = 0
	up.pressed = false
	up.position = to_screen.call(tree)
	vp.push_input(up)
	await _wait(0.3)
	print("[shot] leve sur l'arbre : tient encore = ", burrow.get("_arrange") != null)

	# LE BANDEAU APRES UNE POSE, montre sans poser.
	# Par le noeud, pas par la classe : sous `--script`, nommer Chrome fait
	# compiler ses dependances avant les autoloads.
	var chrome: Node = get_root().find_children("*", "Chrome", true, false)[0]
	chrome.call("arrange_state", {"what": get_root().get_node("I18N").call("t", "arrange.things.tree"), "placed": true})
	await _wait(0.2)
	await _shot("8-placed")
	chrome.call("arrange_state", {})

	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://arrange.cfg"))
	if not had.is_empty():
		var f := FileAccess.open("user://arrange.cfg", FileAccess.WRITE)
		f.store_buffer(had)
	quit()
