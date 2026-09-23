extends Control
## LE BANC DU TROU DE PROFONDEUR — trois facons de ne pas cacher un arbre.
##
##   godot --path godot scenes/bench/depth_hole_bench.tscn
##   godot --path godot scenes/bench/depth_hole_bench.tscn -- --size=890x400 --shot=/tmp/h.png
##
## `--seed=` choisit l'ile, `--at=x,y` la case du lapin, `--zoom=` l'approche.
##
## LE PROBLEME (2026-09-23) : le trou perce tout ce qui est devant le lapin a
## 0,1 d'opacite, pied de l'arbre compris. La case voisine est prise, l'anneau
## ne l'allume pas, et rien ne dit pourquoi. Trois reponses, cote a cote, sur la
## MEME ile et la MEME case :
##   1. le contour de l'arbre n'est jamais perce (`edge` du shader) ;
##   2. une ombre au sol sous chaque arbre, sur le sol et donc jamais percee ;
##   3. le fantome monte de 0,1 a 0,35.
## Le lapin se pose tout seul sur la case praticable la plus cernee d'arbres
## devant lui, sans buisson autour (TileView n'est pas monte ici).

const HOLE_SHADER := preload("res://shaders/depth_hole.gdshader")
const VARIANTS := [
	{"title": "1 · contour garde", "ghost": 0.1, "edge": 2.0, "shadow": false},
	{"title": "2 · ombre au pied", "ghost": 0.1, "edge": 0.0, "shadow": true},
	{"title": "3 · fantome 0,35", "ghost": 0.35, "edge": 0.0, "shadow": false},
]
## L'ombre de contact d'un arbre : une ellipse sombre a la taille du tronc et de
## sa ramure basse, au milieu du losange.
const SHADOW_ALPHA := 0.45
const SHADOW_W := 30.0
const SHADOW_H := 14.0
## Au-dessus du sol (1), sous le chiffre (3) et l'anneau.
const Z_SHADOW := 2

var _panels: Array[Dictionary] = []


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("#3a8fb7"))
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

	var row := HBoxContainer.new()
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.add_theme_constant_override("separation", 4)
	add_child(row)
	for v: Dictionary in VARIANTS:
		_panels.append(_panel(row, v, seed_value, at, zoom))
	DevShot.arm(self)


func _panel(row: HBoxContainer, v: Dictionary, seed_value: String, at: Vector2i,
		zoom: float) -> Dictionary:
	var box := SubViewportContainer.new()
	box.stretch = true
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_child(box)
	var vp := SubViewport.new()
	vp.transparent_bg = false
	box.add_child(vp)

	var world := Node2D.new()
	vp.add_child(world)
	var map := IslandMap.new()
	map.grow(seed_value)
	var terrain := BurrowTerrain.new()
	terrain.map = map
	world.add_child(terrain)
	var ground := IslandGround.new(map, FirstIsland.ground_seed(seed_value))
	var scenery := IslandScenery.new()
	scenery.terrain = terrain
	world.add_child(scenery)
	scenery.build(ground)

	var cell := at if at.x >= 0 else _pick(ground)
	var rabbit := IslandRabbit.new()
	rabbit.map = map
	rabbit.roam = false
	world.add_child(rabbit)
	rabbit.build(hash(seed_value), cell)

	var ring := MoveRing.new()
	ring.terrain = terrain
	world.add_child(ring)
	var around: Array[Vector2i] = []
	for dx in range(-1, 2):
		for dy in range(-1, 2):
			if dx != 0 or dy != 0:
				around.append(cell + Vector2i(dx, dy))
	ring.build(around)
	ring.set_lit(ground.steps_from(cell), cell)

	if v.shadow:
		for p: Dictionary in ground.placements:
			if p.kind == "tree":
				terrain.mount_veil(Vector2i(int(p.x), int(p.y)), _shadow(), Z_SHADOW)

	var mat := ShaderMaterial.new()
	mat.shader = HOLE_SHADER
	mat.set_shader_parameter("ghost", v.ghost)
	mat.set_shader_parameter("edge", v.edge)
	# LE MEME CHOIX QUE island.gd `_select_hole` : devant, a portee de ramure.
	for ahead in range(0, 7):
		for side in range(-3, 4):
			if (ahead + side) % 2 != 0:
				continue
			var c := cell + Vector2i((ahead + side) / 2, (ahead - side) / 2)
			for n in scenery.nodes_at(c):
				if n is CanvasItem:
					(n as CanvasItem).material = mat

	var focus := map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	world.scale = Vector2(zoom, zoom)

	var title := Label.new()
	title.text = v.title
	title.position = Vector2(8, 6)
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_outline_color", Color.BLACK)
	title.add_theme_constant_override("outline_size", 5)
	# SUR le cadre et non dans la SubViewport : le decor y monte a des z de
	# plusieurs milliers et passerait devant.
	box.add_child(title)
	return {"vp": vp, "world": world, "focus": focus, "zoom": zoom,
		"rabbit": rabbit, "mat": mat}


## La case praticable avec le plus d'arbres DEVANT elle — les trois voisines de
## devant comptent triple : c'est la que l'arbre bloque le pas —, et sans
## buisson autour, puisque les buissons ne sont pas dessines ici.
func _pick(ground: IslandGround) -> Vector2i:
	var trees := {}
	var bushes := {}
	for p: Dictionary in ground.placements:
		var c := Vector2i(int(p.x), int(p.y))
		if p.kind == "tree":
			trees[c] = true
		elif p.kind == "bush":
			bushes[c] = true
	var best := ground.spawn()
	var best_score := -1
	for c in ground.farmable_cells():
		var near_bush := false
		for dx in range(-1, 2):
			for dy in range(-1, 2):
				if bushes.has(c + Vector2i(dx, dy)):
					near_bush = true
		if near_bush or ground.steps_from(c).size() < 3:
			continue
		var score := 0
		for d in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
			if trees.has(c + d):
				score += 3
		for d in [Vector2i(2, 1), Vector2i(1, 2), Vector2i(2, 2)]:
			if trees.has(c + d):
				score += 1
		if score > best_score:
			best_score = score
			best = c
	return best


func _shadow() -> Node2D:
	var node := Node2D.new()
	node.draw.connect(func() -> void:
		var pts := PackedVector2Array()
		for i in 20:
			var a := TAU * i / 20.0
			pts.append(Vector2(cos(a) * SHADOW_W * 0.5, sin(a) * SHADOW_H * 0.5))
		node.draw_colored_polygon(pts, Color(0, 0, 0, SHADOW_ALPHA)))
	return node


func _process(_delta: float) -> void:
	for p in _panels:
		var vp: SubViewport = p.vp
		var world: Node2D = p.world
		world.position = Vector2(vp.size) * 0.5 - p.focus * float(p.zoom)
		var rabbit: IslandRabbit = p.rabbit
		if rabbit._sprite == null:
			continue
		# Dans une SubViewport sans etirement, le canvas EST la fenetre du
		# shader : FRAGCOORD s'y lit directement.
		var body: Vector2 = rabbit._sprite.get_global_transform_with_canvas() \
			* Vector2(0, -HomeRabbit.FRAME * 0.15)
		var k := float(p.zoom)
		var mat: ShaderMaterial = p.mat
		mat.set_shader_parameter("centre", body)
		mat.set_shader_parameter("radius", 35.0 * k)
		mat.set_shader_parameter("feather", 11.0 * k)
		mat.set_shader_parameter("dot_px", maxf(1.0, round(k)))
