extends Node2D
## LE BANC DE L'AMENAGEMENT : le vrai terrier (burrow.tscn) en mode
## amenager, avec sa barre, sans compte ni serveur.
##
##   godot --path godot scenes/bench/arrange_bench.tscn -- --shot=a.png --after=2
##   ... -- --grab=tree      # un arbre pris : ses cases possibles en bleu
##   ... -- --grab=field     # le potager pris
##   ... -- --grab=house     # la maison prise
##   ... -- --drop           # et pose sur la premiere case allumee
##   ... -- --seed=paul --size=890x400
##
## Rien ne part au serveur : « valider » repondrait hors ligne.

var _burrow: Node2D


func _ready() -> void:
	var seed_text := "burrow"
	var grab := ""
	var drop := false
	var hold := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			seed_text = arg.trim_prefix("--seed=")
		elif arg.begins_with("--grab="):
			grab = arg.trim_prefix("--grab=")
		elif arg == "--drop":
			drop = true
		elif arg == "--hold":
			hold = true
	Session.player = {"id": seed_text}
	# La maison ne se dresse que sur un terrier lu : un niveau suffit.
	Home.burrow = {"level": 2}
	ShopState.shared().fake([], {"held": 3, "maxPlaced": 8})

	_burrow = preload("res://scenes/burrow.tscn").instantiate()
	add_child(_burrow)
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	var bar := ArrangeBar.new()
	layer.add_child(bar)
	_burrow.connect("arrange_changed", func() -> void:
		bar.show_state(_burrow.call("arrange_state")))
	DevShot.arm(self)

	await get_tree().create_timer(0.3).timeout
	if hold:
		_hold_drag(seed_text)
		return
	_burrow.call("set_arranging", true)
	if grab.is_empty():
		return
	await get_tree().create_timer(0.3).timeout
	var layout: BurrowLayout = BurrowLayout.of(seed_text)
	var cell := Vector2i(-1, -1)
	match grab:
		"field":
			cell = BurrowLayout.cell_of(layout.field[layout.field.size() / 2])
		"house":
			cell = layout.building
		_:
			for p in layout.placements:
				if p.kind == "tree":
					cell = Vector2i(int(p.x), int(p.y))
					break
	_burrow.call("_arrange_tap", cell)
	if not drop:
		return
	await get_tree().create_timer(0.5).timeout
	var arrange: BurrowArrange = _burrow.get("_arrange")
	# La case allumee la plus LOIN : que le deplacement se voie.
	var best := Vector2i(-1, -1)
	for c in arrange.targets:
		if best.x < 0 or c.distance_squared_to(cell) > best.distance_squared_to(cell):
			best = c
	var before := arrange.layout.field.duplicate()
	_burrow.call("_arrange_tap", best)
	print("[arrange] %s %s -> %s, potager %s -> %s, brouillon %s" % [grab, cell, best,
		before.slice(0, 3), arrange.layout.field.slice(0, 3), JSON.stringify(arrange.draft)])


## `--hold` : HORS MODE, un vrai geste de souris — appui sur un arbre, tenu,
## glisse de quatre cases, lache. Le brouillon s'imprime au lacher ; le
## serveur absent, l'enregistrement est refuse et le sol revient.
func _hold_drag(seed_text: String) -> void:
	var layout: BurrowLayout = BurrowLayout.of(seed_text)
	var tree := Vector2i(-1, -1)
	for p in layout.placements:
		if p.kind == "tree":
			tree = Vector2i(int(p.x), int(p.y))
			break
	_burrow.connect("arrange_changed", func() -> void:
		var a: BurrowArrange = _burrow.get("_arrange")
		if a != null:
			print("[hold] held=%d brouillon=%s" % [a.held, JSON.stringify(a.draft)]))
	var map: BurrowMap = _burrow.get("_terrain").map
	var to_screen := func(c: Vector2i) -> Vector2:
		var board := map.screen_of(c.x, c.y) + Vector2(0, Iso.half_h())
		return board * _burrow.scale.x + _burrow.position
	var vp := get_viewport()
	var start: Vector2 = to_screen.call(tree)
	print("[hold] appui sur ", tree, " -> case lue ", _burrow.call("_cell_at", start))
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.pressed = true
	e.position = start
	vp.push_input(e)
	# Un pas de 12 px tout de suite : le clic-glisser, sans maintien.
	var nudge := InputEventMouseMotion.new()
	nudge.button_mask = MOUSE_BUTTON_MASK_LEFT
	nudge.position = start + Vector2(12, 0)
	vp.push_input(nudge)
	await get_tree().process_frame
	var a: BurrowArrange = _burrow.get("_arrange")
	var target := tree + Vector2i(0, 4)
	if a == null:
		print("[hold] rien de pris")
		return
	for c in a.targets:
		if absi(c.x - tree.x) + absi(c.y - tree.y) == 4:
			target = c
			break
	for i in range(1, 5):
		var m := InputEventMouseMotion.new()
		m.button_mask = MOUSE_BUTTON_MASK_LEFT
		m.position = start.lerp(to_screen.call(target), i / 4.0)
		vp.push_input(m)
		await get_tree().process_frame
	await get_tree().create_timer(0.3).timeout
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	up.position = to_screen.call(target)
	vp.push_input(up)
	print("[hold] lache sur ", _burrow.call("_cell_at", up.position))
