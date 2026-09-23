extends Node2D
## LE BANC DU DECOR DE L'ILE — une ile generee, son sol, et ce qui s'y tient.
##
##   godot --path godot scenes/bench/island_scenery_bench.tscn -- --shot=/tmp/s.png
##   godot --path godot scenes/bench/island_scenery_bench.tscn -- --zoom=3 --shot=…
##   godot --headless --path godot scenes/bench/island_scenery_bench.tscn -- --verify
##
## `--seed=` choisit l'ile (« default » sinon), `--zoom=` s'approche d'un
## bosquet pour juger les pieds (ou de la case `--at=x,y`), `--verify` mesure puis quitte.
##
## CE QUE `--verify` MESURE, contre le SOL PEINT (`_block_at`), jamais contre
## la formule qu'on vient d'ecrire — la lecon de verify_boards.gd :
##   • chaque placement hors buisson a un noeud, DANS le bloc de sa case ;
##   • son origine est le centre du losange, et son pied y tombe ;
##   • `clear_over` enleve exactement les cases devant un coffre ;
##   • `build` rappele ne double rien, `skip` saute ce qu'on lui dit.

var _world := Node2D.new()
var _terrain := BurrowTerrain.new()
var _scenery := IslandScenery.new()
var _ground: IslandGround


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("#3a8fb7"))
	var seed_value := "default"
	var zoom := 0.0
	var verify := false
	var at := Vector2i(-1, -1)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			seed_value = arg.trim_prefix("--seed=")
		elif arg.begins_with("--zoom="):
			zoom = float(arg.trim_prefix("--zoom="))
		elif arg.begins_with("--at="):
			var xy := arg.trim_prefix("--at=").split(",")
			at = Vector2i(int(xy[0]), int(xy[1]))
		elif arg == "--verify":
			verify = true

	var map := IslandMap.new()
	map.grow(seed_value)
	_terrain.map = map
	add_child(_world)
	_world.add_child(_terrain)
	_ground = IslandGround.new(map, FirstIsland.ground_seed(seed_value))
	_scenery.terrain = _terrain
	_world.add_child(_scenery)
	_scenery.build(_ground)

	var view := get_viewport_rect().size
	var shot := BurrowCamera.board(map, view.x, view.y)
	_world.scale = Vector2(shot.scale, shot.scale)
	_world.position = shot.at
	if zoom > 0.0:
		# Sur le premier arbre qui a des voisins : un bosquet montre le tri.
		var focus := Vector2.ZERO
		for p in _ground.placements:
			if p.kind == "tree":
				focus = map.screen_of(p.x, p.y) + Vector2(0, Iso.half_h())
				break
		if at.x >= 0:
			focus = map.screen_of(at.x, at.y) + Vector2(0, Iso.half_h())
		_world.scale = Vector2(zoom, zoom)
		_world.position = view * 0.5 - focus * zoom

	if verify:
		_verify.call_deferred()
		return
	DevShot.arm(self)


func _verify() -> void:
	var blocks: Dictionary = _terrain._block_at
	var want := 0
	var mounted := 0
	var wrong_block := 0
	var off_centre := 0
	var by_kind := {}
	for p in _ground.placements:
		if p.kind == "bush":
			continue
		want += 1
		var cell := Vector2i(p.x, p.y)
		by_kind[p.kind] = int(by_kind.get(p.kind, 0)) + 1
		var found := false
		for node: Node2D in _scenery.nodes_at(cell):
			if node.get_parent() == blocks.get(cell):
				found = true
				# Le pied : l'origine du noeud, dans l'espace du terrain.
				var foot := _terrain.to_local(node.global_position)
				var centre := _terrain.map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
				if foot.distance_to(centre) > 0.01:
					off_centre += 1
			else:
				wrong_block += 1
		if found:
			mounted += 1
	var total := 0
	for c in _scenery._at:
		total += _scenery._at[c].size()
	print("DECOR  %d/%d montes, %d noeuds, %s" % [mounted, want, total, by_kind])
	print("  hors de leur bloc : %d  (doit etre 0)" % wrong_block)
	print("  pied hors du centre : %d  (doit etre 0)" % off_centre)
	print("  animes : %d (arbres + vivants)" % _scenery._animated.size())

	# CLEAR_OVER : on prend un coffre fictif et on compte ce qui reste devant.
	var chest := Vector2i(-1, -1)
	for c in _scenery._at:
		for d in [Vector2i(1, 0), Vector2i(1, 1), Vector2i(0, 1), Vector2i(2, 1)]:
			if _scenery._at.has(c - d):
				chest = c - d
				break
		if chest.x >= 0:
			break
	var doomed: Array[Vector2i] = []
	for dx in range(4):
		for dy in range(4):
			if dx + dy > 0 and dx + dy <= 3 and absi(dx - dy) <= 1:
				doomed.append(chest + Vector2i(dx, dy))
	var before := 0
	for c in doomed:
		before += _scenery.nodes_at(c).size()
	var kept_behind := _scenery.nodes_at(chest).size()
	_scenery.clear_over(chest)
	var after := 0
	for c in doomed:
		after += _scenery.nodes_at(c).size()
	print("CLEAR_OVER %s : %d devant -> %d  (doit etre 0), case du coffre %d -> %d" % [
		chest, before, after, kept_behind, _scenery.nodes_at(chest).size()])

	# REBUILD + SKIP.
	var skip := {}
	for c in doomed:
		skip[c] = true
	_scenery.build(_ground, skip)
	await get_tree().process_frame
	var again := 0
	for c in _scenery._at:
		again += _scenery._at[c].size()
	var live := 0
	for c in blocks:
		for child in blocks[c].get_children():
			if child is Sprite2D and child.z_index == IslandScenery.Z_PROP:
				live += 1
	print("REBUILD avec skip : %d noeuds (attendu %d), %d sprites Z_PROP vivants dans les blocs" % [
		again, total - before, live])
	get_tree().quit()
