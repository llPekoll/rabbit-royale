extends Control
## LE BANC DU RIVAGE — le pied des cases au bord de l'eau, avant / apres.
##
##   godot --path godot scenes/bench/shore_bench.tscn
##   godot --path godot scenes/bench/shore_bench.tscn -- --size=890x400 --shot=/tmp/s.png
##
## `--seed=` choisit le terrier, `--zoom=` l'approche, `--at=x,y` la case visee
## (par defaut : la case de rivage la plus au sud-est).
##
## LE PROBLEME (2026-09-23) : au pied des cases du rivage, le trait sombre de
## la tranche de la motte se posait sur l'eau comme un liseré de carrelage.
## Avant / apres `BurrowTerrain.open_shore` : trait retire cote mer, gouttes
## d'ecume qui sautent du pied (ShoreSpray).

const OCEAN := preload("res://scenes/ocean.tscn")
const VARIANTS := [
	{"title": "avant", "open": false},
	{"title": "apres", "open": true},
]

var _panels: Array[Dictionary] = []


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("#1eaac4"))
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var seed_value := "default"
	var at := Vector2i(-1, -1)
	var zoom := 3.0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			seed_value = arg.trim_prefix("--seed=")
		elif arg.begins_with("--zoom="):
			zoom = float(arg.trim_prefix("--zoom="))
		elif arg.begins_with("--at="):
			var xy := arg.trim_prefix("--at=").split(",")
			at = Vector2i(int(xy[0]), int(xy[1]))

	var grid := GridContainer.new()
	grid.columns = 1
	grid.set_anchors_preset(Control.PRESET_FULL_RECT)
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	add_child(grid)
	for v: Dictionary in VARIANTS:
		_panels.append(_panel(grid, v, seed_value, at, zoom))
	DevShot.arm(self)


func _panel(grid: GridContainer, v: Dictionary, seed_value: String, at: Vector2i,
		zoom: float) -> Dictionary:
	var box := SubViewportContainer.new()
	box.stretch = true
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid.add_child(box)
	var vp := SubViewport.new()
	vp.transparent_bg = false
	box.add_child(vp)

	var world := Node2D.new()
	vp.add_child(world)
	var layout := BurrowLayout.of(seed_value)
	var terrain := BurrowTerrain.new()
	terrain.map = layout.map
	terrain.open_shore = v.open
	world.add_child(terrain)
	var sods: Array[Vector2i] = []
	for t in layout.walkable_tiles():
		sods.append(BurrowLayout.cell_of(t))
	terrain.lay_sods(sods)

	var ocean: Ocean = OCEAN.instantiate()
	world.add_child(ocean)
	ocean.build(layout.map, seed_value)

	var cell := at if at.x >= 0 else _pick(layout.map)
	var focus := layout.map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	world.scale = Vector2(zoom, zoom)

	var title := Label.new()
	title.text = v.title
	title.position = Vector2(8, 6)
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_outline_color", Color.BLACK)
	title.add_theme_constant_override("outline_size", 5)
	box.add_child(title)
	return {"vp": vp, "world": world, "focus": focus, "zoom": zoom}


## La case de rivage la plus au sud-est — celle dont on voit les deux faces.
func _pick(map: BurrowMap) -> Vector2i:
	var best := Vector2i(map.width / 2, map.height / 2)
	var best_score := -1
	for row in range(map.height):
		for col in range(map.width):
			if map.level_at(col, row) != 1:
				continue
			if map.level_at(col + 1, row) != 0 or map.level_at(col, row + 1) != 0:
				continue
			if col + row > best_score:
				best_score = col + row
				best = Vector2i(col, row)
	return best


func _process(_delta: float) -> void:
	for p in _panels:
		var vp: SubViewport = p.vp
		var world: Node2D = p.world
		world.position = Vector2(vp.size) * 0.5 - p.focus * float(p.zoom)
