extends Node2D
## LE BANC DES ILES DE L'ECHELLE — une ile entiere au cadre, telle que le jeu
## la taille : sol, paliers, decor et mer, depuis sa seule graine.
##
##   godot --path godot scenes/bench/island_shapes_bench.tscn -- --level=9 --seed=fx2 --shot=/tmp/s.png
##
## `--level=` et `--seed=` font la graine `lv<level>:<seed>` du serveur. Des
## le niveau 7 l'ile est GRANDE (BIG_ISLANDS, big_island.gd) : sa propre cote,
## parfois une silhouette, dans une boite taillee a son nombre de cases. Le
## bandeau dit la grille, la forme et les cases.
##
## APERCU AU-DELA DU NIVEAU 10 (l'echelle s'y arrete) : `--level=40` coupe une
## grande ile de niveau 10 a `--target=` cases (+30 par niveau au-dela de 10
## par defaut), dans une boite qui peut monter a `--max-side=` (160). Rien de
## ce chemin n'existe en jeu.

var _world := Node2D.new()
var _terrain := BurrowTerrain.new()
var _scenery := IslandScenery.new()


func _ready() -> void:
	var level := 7
	var seed_value := "bench"
	var target := 0
	var max_side := 160
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--level="):
			level = int(arg.trim_prefix("--level="))
		elif arg.begins_with("--seed="):
			seed_value = arg.trim_prefix("--seed=")
		elif arg.begins_with("--target="):
			target = int(arg.trim_prefix("--target="))
		elif arg.begins_with("--max-side="):
			max_side = int(arg.trim_prefix("--max-side="))

	var seed_text := "lv%d:%s" % [mini(maxi(1, level), 10), seed_value]
	var map := IslandMap.new()
	if level > 10:
		_preview(map, seed_text, target if target > 0 else 1275 + 30 * (level - 10), max_side)
	else:
		map.grow(seed_text)
	var ground_key := FirstIsland.ground_seed(seed_text)

	_terrain.map = map
	add_child(_world)
	_world.add_child(_terrain)
	var ocean: Ocean = (load("res://scenes/ocean.tscn") as PackedScene).instantiate()
	_world.add_child(ocean)
	ocean.build(map, ground_key)
	var ground := IslandGround.new(map, ground_key)
	_scenery.terrain = _terrain
	_world.add_child(_scenery)
	_scenery.build(ground)

	var label := Label.new()
	label.text = "NIVEAU %d  %s   %dx%d   %d cases" % [level,
		(map.shape_name if map.shape_name != "" else "cote libre") if map.is_big else "sol commun",
		map.width, map.height, ground.farmable_cells().size()]
	label.add_theme_font_size_override("font_size", 28)
	label.add_theme_color_override("font_outline_color", Color.BLACK)
	label.add_theme_constant_override("outline_size", 8)
	label.position = Vector2(20, 12)
	var hud := CanvasLayer.new()
	hud.layer = 100
	hud.add_child(label)
	add_child(hud)
	print("[shapes] ", label.text)

	await get_tree().process_frame
	await get_tree().process_frame
	_fit(map)
	get_viewport().size_changed.connect(_fit.bind(map))
	DevShot.arm(self)


## Une grande ile de niveau 10 coupee a `cells` cases : le chemin de `grow`,
## avec le plan et le plafond de boite forces.
func _preview(map: IslandMap, seed_text: String, cells: int, max_side: int) -> void:
	var table: Dictionary = (load("res://assets/tuning.json") as JSON).data.BIG_ISLANDS
	table.MAX_SIDE = max_side
	table.MAX_TRIES = 8
	var plan := BigIsland.plan(seed_text, 10)
	plan.target = cells
	var cut := BigIsland.size(seed_text, plan, IslandMap.ISLAND_RISE)
	map.seed_text = seed_text
	map.width = int(cut.width)
	map.height = int(cut.height)
	map.silhouette = cut.silhouette
	map.is_big = true
	map.shape_name = String(plan.shape)
	map.shape(seed_text, float(cut.land), IslandMap.ISLAND_RISE, float(cut.ragged), IslandMap.TIERS_WANTED)


func _fit(map: IslandMap) -> void:
	var view := get_viewport_rect().size
	var shot := BurrowCamera.board(map, view.x, view.y, 40.0)
	_world.scale = Vector2(shot.scale, shot.scale)
	_world.position = shot.at
