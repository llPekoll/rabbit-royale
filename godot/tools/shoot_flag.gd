extends SceneTree
## LE X ET LES CHIFFRES, en images : un X juste (tampon + energie/carottes),
## un X faux (tremble, chiffre rouge), une carotte creusee. En fenetre.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --path godot \
##       --script res://tools/shoot_flag.gd -- --out=/tmp/flag

var _out := "/tmp/flag"


func _init() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			_out = arg.trim_prefix("--out=")
	_run.call_deferred()


func _wait(s: float) -> void:
	await create_timer(s).timeout


func _shots(tag: String, at: Array) -> void:
	var t0 := Time.get_ticks_msec()
	for i in at.size():
		var w: float = at[i] - float(Time.get_ticks_msec() - t0) / 1000.0
		if w > 0.0:
			await _wait(w)
		await process_frame
		get_root().get_texture().get_image().save_png("%s-%s-%d.png" % [_out, tag, i])


func _run() -> void:
	get_root().size = Vector2i(900, 700)
	var sb: Node = (load("res://scenes/dig_sandbox.tscn") as PackedScene).instantiate()
	get_root().add_child(sb)
	await _wait(2.0)
	var island = sb._island
	var run = island.local_run
	var board = run.board
	var here: Vector2i = run.at
	var bomb := Vector2i(-1, -1)
	var safe := Vector2i(-1, -1)
	# Marche jusqu'a trouver une bombe et une case sure voisines, non connues.
	for step in 60:
		here = run.at
		bomb = Vector2i(-1, -1)
		safe = Vector2i(-1, -1)
		for dx in [-1, 0, 1]:
			for dy in [-1, 0, 1]:
				var c: Vector2i = here + Vector2i(dx, dy)
				if c == here or not board.content.has(c) or board.is_dug(c) or board.is_flagged(c):
					continue
				if board.state.get(c) == IslandBoard.State.HINTED:
					continue
				if board.content[c] == IslandBoard.Content.BOMB:
					bomb = c
				elif board.content[c] != IslandBoard.Content.CHEST:
					safe = c
		if bomb.x >= 0 and safe.x >= 0:
			break
		# un pas sur une case sure deja creusee ou indicee
		var moved := false
		for dx in [-1, 0, 1]:
			for dy in [-1, 0, 1]:
				var c: Vector2i = here + Vector2i(dx, dy)
				if moved or c == here or not board.content.has(c):
					continue
				if board.content[c] != IslandBoard.Content.BOMB and board.may_step(here, c) and randf() < 0.5:
					island._local_tap(c)
					moved = true
		await _wait(0.3)
	print("here=", here, " bomb=", bomb, " safe=", safe)
	await _wait(1.0)
	island.set_armed(true)
	island._local_tap(bomb)
	await _shots("right", [0.03, 0.1, 0.2, 0.45, 0.9])
	await _wait(1.0)
	island.set_armed(true)
	island._local_tap(safe)
	await _shots("wrong", [0.05, 0.15, 0.3, 0.6])
	quit()
