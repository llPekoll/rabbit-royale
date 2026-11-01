extends Control
## Decoration study 05: carrot growth and wind, alongside approved decor.
## Production terrain and gameplay are unchanged by this preview.
const TREE := preload("res://assets/deco/identity/feuillu-v2-sheet.png")
const PINES := preload("res://assets/deco/identity/sapins-sheet.png")
const HOMES := BurrowProps.HOME_SHEET
const ACCENTS := preload("res://assets/deco/identity/petits-decors.png")
const REEDS := preload("res://assets/deco/identity/roseaux-sheet.png")
const FOAM := preload("res://assets/deco/identity/feuilles-ecume.png")
const TREE_CELL := Vector2(128, 224)
const PINE_CELL := Vector2(128, 256)
const TREE_SECONDS := 0.18
const FONT := preload("res://assets/fonts/fusion-pixel-10-rr-latin.ttf")
const SEA_SCALES := [1.0, 1.25, 1.5, 2.0, 3.0, 4.0]
var world: Node2D
var terrain: GrassTerrain
var props: BurrowProps
var scenery: IslandScenery
var layout: BurrowLayout
var tree_nodes: Array[Dictionary] = []
var proposed := true
var view_mode := 0
var home_level := 3
var look_button: Button
var view_button: Button
var level_button: Button
var status: Label
var wind_button: Button
var wind_enabled := true
var capture_time := -1.0
var _elapsed := 0.0
var _shown_frame := -1
var _dragging := false
var _map_hash := 0
var accents: Array[Dictionary] = []
var accents_enabled := true
var accents_button: Button
var gallery_button: Button
var gallery: PanelContainer
var level_cards: Array[Button] = []
var _accent_focus := Vector2.ZERO
var _wave_speed := 2.0
var crops: CarrotGrowthStudy
var crop_mode_button: Button
var crop_replay_button: Button
var crop_view_button: Button
var sea_scale_button: Button
var sea_scale_index := 1
var sea_speed_percent := 105.0
var sea_speed_slider: HSlider
var sea_speed_label: Label

func _ready() -> void:
	get_window().title = "Rabbit Royale — Décor · carottes pousse et vent 05"
	get_window().content_scale_size = Vector2i(1000, 620)
	proposed = not "--original" in OS.get_cmdline_user_args()
	world = Node2D.new()
	add_child(world)
	layout = BurrowLayout.of("terrain-study")
	_map_hash = hash(layout.map.level)
	terrain = GrassTerrain.new()
	terrain.map = layout.map
	world.add_child(terrain)
	var field := layout.field_cells()
	var yard := BurrowLayout.house_cells(layout.building)
	var sods: Array[Vector2i] = []
	for tile in layout.walkable_tiles():
		var cell := BurrowLayout.cell_of(tile)
		if not field.has(cell): sods.append(cell)
	# The smaller homes reveal real grass inside the reserved house area.
	for cell in yard:
		if not sods.has(cell): sods.append(cell)
	terrain.lay_sods(sods)
	terrain.paint_field(field)
	terrain.dress_shore()
	terrain.water().set_art_scale(SEA_SCALES[sea_scale_index])
	terrain.water().set_surface_speed(2.0 * sea_speed_percent / 100.0, 0.0)
	props = BurrowProps.new()
	props.map = layout.map
	props.terrain = terrain
	props.fill = func() -> float: return 0.7
	world.add_child(props)
	props.build(layout)
	props.set_level(home_level)
	crops = CarrotGrowthStudy.new()
	crops.setup(props)
	var ground := IslandGround.new(layout.map, "terrain-study", false)
	ground.placements = layout.placements
	scenery = IslandScenery.new()
	scenery.terrain = terrain
	world.add_child(scenery)
	scenery.build(ground, {}, true)
	# Freeze the original pack for the comparison. Candidate foliage reads
	# eight frames baked in Aseprite; the lower trunk and roots remain fixed.
	scenery.set_process(false)
	for p: Dictionary in layout.placements:
		if p.kind != "tree": continue
		var cell := Vector2i(int(p.x), int(p.y))
		for node: Sprite2D in scenery.get("_at").get(cell, []):
			if scenery.get("_kind_of").get(node) != "tree": continue
			tree_nodes.append({"node": node, "texture": node.texture, "pine": int(p.variant) % 4 < 2,
				"row": int(p.variant) % 2,
				"region": node.region_rect, "offset": node.offset, "scale": node.scale})
	_build_accents()
	_ui()
	apply_look()
	var show_homes := "--homes" in OS.get_cmdline_user_args()
	view_mode = 0 if show_homes or "--sea" in OS.get_cmdline_user_args() else 5
	fit_view()
	gallery.visible = show_homes
	if show_homes: get_window().title = "Rabbit Royale — Les 5 terriers · centrage et terre"
	# Automated comparison captures keep all five cards visible until the shot.
	for arg in OS.get_cmdline_user_args():
		if show_homes and arg.begins_with("--shot="):
			get_viewport().gui_disable_input = true
			set_process_unhandled_input(false)
	get_viewport().size_changed.connect(fit_view)
	DevShot.arm(self)
	print("[decor-identity] trees=%d; accents=%d; house anchor=%s; map unchanged=%s; playable=%d" % [
		tree_nodes.size(), accents.size(), props.home.position, hash(layout.map.level) == _map_hash, layout.walkable_tiles().size()])

func home_art(level: int, trimmed: bool = false) -> AtlasTexture:
	var texture := AtlasTexture.new()
	texture.atlas = HOMES
	texture.region = Rect2((level - 1) * 192, 0, 192, 224)
	# Identical crop for every level: never scale a small house up to fill a card.
	if trimmed: texture.region = Rect2((level - 1) * 192, 84, 192, 124)
	return texture

func _accent(kind: int) -> Sprite2D:
	var node := Sprite2D.new()
	node.texture = ACCENTS
	node.region_enabled = true
	node.region_rect = Rect2(kind * 128, 0, 128, 128)
	if kind == 1:
		node.texture = REEDS
		node.region_rect = Rect2(0, 0, 128, 128)
	node.centered = false
	node.offset = Vector2(-64, -112)
	node.scale = Vector2.ONE * 0.5
	return node

func _build_accents() -> void:
	# This is an art arrangement only: nothing writes to the playable map.
	var occupied: Dictionary = {}
	for p: Dictionary in layout.placements:
		occupied[Vector2i(int(p.x), int(p.y))] = true
	for cell in layout.field_cells() + BurrowLayout.house_cells(layout.building):
		occupied[cell] = true
	var cells: Array[Vector2i] = []
	for tile in layout.walkable_tiles():
		var cell := BurrowLayout.cell_of(tile)
		if not occupied.has(cell) and not layout.is_doorstep(tile): cells.append(cell)
	cells.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return posmod(a.x * 71 + a.y * 137, 229) < posmod(b.x * 71 + b.y * 137, 229))
	for spec in [[1, 3], [0, 5], [4, 2], [3, 8], [5, 9]]:
		var placed := 0
		for cell in cells:
			if occupied.has(cell): continue
			var shoreline := false
			for d in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				if not layout.map.is_land(cell.x + d.x, cell.y + d.y): shoreline = true
			if int(spec[0]) in [0, 1] and not shoreline: continue
			var node := _accent(int(spec[0]))
			if not terrain.mount_veil(cell, node, IslandScenery.Z_PROP):
				node.queue_free()
				continue
			node.position += Vector2(posmod(cell.x * 7 + cell.y, 9) - 4, -2)
			accents.append({"node": node, "kind": int(spec[0]), "cell": cell, "water": false,
				"phase": posmod(cell.x * 3 + cell.y * 5, 8)})
			occupied[cell] = true
			if int(spec[0]) == 1: _accent_focus = world.to_local(node.global_position)
			placed += 1
			if placed >= int(spec[1]): break
	# Floating leaves sit beyond the actual rendered coastline. Read the
	# existing shore distance image once, never add a water shader per prop.
	var water := terrain.water()
	_wave_speed = float(water.water_material.get_shader_parameter("wave_speed"))
	var mask := water.distance_image
	var floating: Array[Vector2] = []
	var centre := BurrowCamera.board_bounds(layout.map).get_center()
	for y in range(8, mask.get_height() - 8, 13):
		for x in range(8, mask.get_width() - 8, 17):
			var pixel := mask.get_pixel(x, y)
			var distance := pixel.r * ShoreWater.RANGE
			var point := water.shore_origin + Vector2(x, y)
			if pixel.g > 0.1 or pixel.b > 0.01 or distance < 18 or distance > 30 or point.y < centre.y: continue
			var clear := true
			for other in floating:
				if other.distance_to(point) < 140: clear = false
			if not clear: continue
			var node := _accent(2)
			world.add_child(node)
			node.position = point
			node.z_index = -1000
			var foam := Sprite2D.new()
			foam.texture = FOAM
			foam.region_enabled = true
			foam.region_rect = Rect2(0, 0, 128, 128)
			foam.centered = false
			foam.offset = Vector2(-64, -112)
			foam.z_index = -1
			node.add_child(foam)
			floating.append(point)
			accents.append({"node": node, "kind": 2, "water": true, "base": point,
				"foam": foam, "wave_phase": _shore_noise(point.floor() / Vector2(12, 7)) * 7.0})
			if floating.size() == 4: break
		if floating.size() == 4: break

func _update_accents() -> void:
	for item in accents: (item.node as Sprite2D).visible = proposed and accents_enabled
	accents_button.text = "Petits décors : oui" if accents_enabled else "Petits décors : non"

func _shore_hash(point: Vector2) -> float:
	return fposmod(sin(point.dot(Vector2(127.1, 311.7))) * 43758.5453, 1.0)

func _shore_noise(point: Vector2) -> float:
	# Same local phase field as shore_water_common.gdshaderinc, computed once
	# per floater. Runtime only moves four sprites and chooses baked frames.
	var cell := point.floor()
	var f := point - cell
	f = f * f * (Vector2(3, 3) - 2.0 * f)
	return lerpf(lerpf(_shore_hash(cell), _shore_hash(cell + Vector2.RIGHT), f.x),
		lerpf(_shore_hash(cell + Vector2.DOWN), _shore_hash(cell + Vector2.ONE), f.x), f.y)

func _animate_accents(time: float) -> void:
	if not accents_enabled: return
	for item in accents:
		var node: Sprite2D = item.node
		if item.water:
			var phase: float = time * _wave_speed + item.wave_phase
			# Half-world-pixel steps retain the authored pixel grid. Position is
			# always based on the initial point, so there is no accumulating drift.
			var position: Vector2 = item.base + Vector2(0, snappedf(-sin(phase) * 1.5, 0.5))
			if node.position != position: node.position = position
			var f := posmod(int(floor(phase / TAU * 8.0)), 8)
			var foam: Sprite2D = item.foam
			if foam.region_rect.position.x != f * 128: foam.region_rect.position.x = f * 128
		elif int(item.kind) == 1:
			var f := posmod(int(floor(time / TREE_SECONDS)) + int(item.phase), 8) if wind_enabled else 0
			if node.region_rect.position.x != f * 128: node.region_rect.position.x = f * 128

func _build_gallery(canvas: CanvasLayer) -> void:
	gallery = PanelContainer.new()
	gallery.visible = false
	gallery.custom_minimum_size = Vector2(900, 230)
	gallery.add_theme_stylebox_override("panel", _panel(Color("12363f")))
	canvas.add_child(gallery)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	gallery.add_child(column)
	var header := HBoxContainer.new()
	column.add_child(header)
	var title := Label.new()
	title.text = "Cinq tailles · même échelle · clique pour voir sur l'île"
	title.add_theme_font_override("font", FONT)
	title.add_theme_font_size_override("font_size", 20)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(_button("Fermer", func() -> void: gallery.hide()))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	column.add_child(row)
	for level in range(1, 6):
		var card := _button("", func() -> void:
			home_level = level
			proposed = true
			apply_look()
			view_mode = 1
			fit_view()
			gallery.hide())
		card.custom_minimum_size = Vector2(166, 156)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(card)
		var art := TextureRect.new()
		art.texture = home_art(level, true)
		art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art.position = Vector2(3, 4)
		art.size = Vector2(160, 112)
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(art)
		var label := Label.new()
		label.text = "Niveau %d" % level
		label.position = Vector2(0, 120)
		label.size.x = 166
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_override("font", FONT)
		label.add_theme_font_size_override("font_size", 16)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(label)
		level_cards.append(card)

func apply_look() -> void:
	crops.use_proposed(proposed)
	for item in tree_nodes:
		var node: Sprite2D = item.node
		node.texture = (PINES if item.pine else TREE) if proposed else item.texture
		node.region_enabled = true
		node.region_rect = Rect2(Vector2(0, item.row * PINE_CELL.y) if item.pine else Vector2.ZERO,
			PINE_CELL if item.pine else TREE_CELL) if proposed else item.region
		node.offset = (Vector2(-64, -244) if item.pine else Vector2(-64, -212)) if proposed else item.offset
		node.scale = Vector2.ONE * 0.4 if proposed else item.scale
		assert(node.material == null)
	props.set_level(home_level)
	props.home.scale = Vector2.ONE * BurrowProps.HOME_SCALE
	if proposed:
		props.home.texture = home_art(home_level)
		props.home.offset = -BurrowProps.HOME_CENTRE * 2.0
	assert(props.home.offset * props.home.scale == -BurrowProps.HOME_CENTRE)
	assert(props.home.material == null)
	assert(hash(layout.map.level) == _map_hash)
	look_button.text = "Décor : nouveau" if proposed else "Décor : actuel"
	level_button.text = "Terrier : N%d / 5" % home_level
	status.text = "Terrier niveau %d · ombres de contact · roseaux au vent · feuilles et écume avec la houle" % home_level if proposed else \
		"Actuel : mêmes cases, même caméra · arbres du pack et terrier niveau %d" % home_level
	_update_accents()
	_shown_frame = -1
	_animate()

func _process(delta: float) -> void:
	_elapsed += delta
	# One clock for the sea and its floating props, including recorded previews.
	terrain.water().set_capture_time(capture_time if capture_time >= 0.0 else _elapsed)
	_animate()

func _animate() -> void:
	var time := capture_time if capture_time >= 0.0 else _elapsed
	crops.update(time, wind_enabled)
	if view_mode == 5:
		status.text = "Carottes : %s · potager %d %% · 12 étapes de pousse · 8 images de vent · pied fixe" % [
			CarrotGrowthStudy.NAMES[crops.mode], roundi(crops.progress * 100.0)]
	if not proposed: return
	_animate_accents(time)
	var frame := posmod(int(floor(time / TREE_SECONDS)), 8) if wind_enabled else 0
	if frame == _shown_frame: return
	_shown_frame = frame
	for i in tree_nodes.size():
		var item := tree_nodes[i]
		var node: Sprite2D = item.node
		var shifted := posmod(frame + i * 3, 8) if wind_enabled else 0
		var size := PINE_CELL if item.pine else TREE_CELL
		node.region_rect = Rect2(Vector2(shifted * size.x, item.row * size.y if item.pine else 0), size)

func set_capture_time(time: float) -> void:
	capture_time = time
	terrain.water().set_capture_time(time)
	_shown_frame = -1
	_animate()

func fit_view() -> void:
	if not is_instance_valid(world): return
	var room := Rect2(Vector2(28, 170), get_viewport_rect().size - Vector2(56, 232))
	var bounds := BurrowCamera.board_bounds(layout.map)
	if terrain.coast() != null: bounds = bounds.merge(terrain.coast().extra_bounds())
	var focus := bounds.get_center()
	var zoom := minf(room.size.x / bounds.size.x, room.size.y / bounds.size.y)
	if view_mode == 1:
		focus = world.to_local(props.home.global_position) + Vector2(0, -14)
		zoom = 4.0
	elif view_mode in [2, 3]:
		for item in tree_nodes:
			if bool(item.pine) == (view_mode == 3):
				focus = world.to_local((item.node as Sprite2D).global_position) + Vector2(0, -38)
				break
		zoom = 3.0
	elif view_mode == 4:
		focus = _accent_focus + Vector2(0, -12)
		zoom = 3.5
	elif view_mode == 5:
		focus = Vector2.ZERO
		for cell in layout.field_cells(): focus += layout.map.screen_of(cell.x, cell.y)
		focus /= layout.field_cells().size()
		focus += Vector2(0, -4)
		zoom = 4.5
	world.scale = Vector2.ONE * zoom
	world.position = (room.get_center() - focus * zoom).round()
	view_button.text = ["Vue : île", "Vue : terrier", "Vue : feuillu", "Vue : sapin", "Vue : rivage", "Vue : potager"][view_mode]
	if gallery != null: gallery.position = Vector2((get_viewport_rect().size.x - 900) * 0.5, 190)
	if terrain.water() != null: terrain.water().set_capture_time(capture_time if capture_time >= 0.0 else _elapsed)

func _ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 20
	add_child(canvas)
	var bar := PanelContainer.new()
	bar.position = Vector2(18, 16)
	bar.add_theme_stylebox_override("panel", _panel(Color("183e42")))
	canvas.add_child(bar)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	bar.add_child(column)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	column.add_child(row)
	var title := Label.new()
	title.text = "Décor · 05"
	title.add_theme_font_override("font", FONT)
	title.add_theme_font_size_override("font_size", 24)
	row.add_child(title)
	look_button = _button("", func() -> void:
		proposed = not proposed
		apply_look())
	row.add_child(look_button)
	view_button = _button("", func() -> void:
		view_mode = (view_mode + 1) % 6
		fit_view())
	row.add_child(view_button)
	level_button = _button("", func() -> void:
		home_level = home_level % 5 + 1
		apply_look())
	row.add_child(level_button)
	wind_button = _button("Vent : oui", func() -> void:
		wind_enabled = not wind_enabled
		wind_button.text = "Vent : oui" if wind_enabled else "Vent : arrêt"
		_shown_frame = -1
		_animate())
	row.add_child(wind_button)
	var second := HBoxContainer.new()
	second.add_theme_constant_override("separation", 12)
	column.add_child(second)
	accents_button = _button("Petits décors : oui", func() -> void:
		accents_enabled = not accents_enabled
		_update_accents())
	second.add_child(accents_button)
	gallery_button = _button("Voir les 5 terriers", func() -> void: gallery.visible = not gallery.visible)
	second.add_child(gallery_button)
	crop_view_button = _button("Potager", func() -> void:
		view_mode = 5
		fit_view())
	second.add_child(crop_view_button)
	crop_mode_button = _button("Mode : pousse", func() -> void:
		crops.advance_mode(capture_time if capture_time >= 0.0 else _elapsed)
		crop_mode_button.text = "Mode : " + CarrotGrowthStudy.NAMES[crops.mode]
		_animate())
	second.add_child(crop_mode_button)
	crop_replay_button = _button("Rejouer", func() -> void:
		crops.reset(capture_time if capture_time >= 0.0 else _elapsed)
		_animate())
	second.add_child(crop_replay_button)
	# Keep the longer combined-mode label and Replay fully inside the window.
	for control: Control in second.get_children():
		control.add_theme_font_size_override("font_size", 14)
	status = Label.new()
	status.add_theme_font_override("font", FONT)
	status.add_theme_font_size_override("font_size", 14)
	status.add_theme_color_override("font_outline_color", Color("143c42"))
	status.add_theme_constant_override("outline_size", 4)
	status.position = Vector2(28, 126)
	canvas.add_child(status)
	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 14)
	canvas.add_child(footer)
	sea_scale_button = _button("Mer : ×%s" % str(SEA_SCALES[sea_scale_index]).trim_suffix(".0"), func() -> void:
		sea_scale_index = (sea_scale_index + 1) % SEA_SCALES.size()
		terrain.water().set_art_scale(SEA_SCALES[sea_scale_index])
		sea_scale_button.text = "Mer : ×%s" % str(SEA_SCALES[sea_scale_index]).trim_suffix(".0"))
	sea_scale_button.tooltip_text = "Taille des motifs de la mer : ×1, ×1.25, ×1.5, ×2, ×3, ×4. Puis retour à ×1."
	sea_scale_button.custom_minimum_size.x = 170
	footer.add_child(sea_scale_button)
	sea_speed_label = Label.new()
	sea_speed_label.text = "Vitesse : %d %%" % roundi(sea_speed_percent)
	sea_speed_label.custom_minimum_size.x = 170
	sea_speed_label.add_theme_font_override("font", FONT)
	sea_speed_label.add_theme_font_size_override("font_size", 16)
	sea_speed_label.add_theme_color_override("font_outline_color", Color("143c42"))
	sea_speed_label.add_theme_constant_override("outline_size", 4)
	footer.add_child(sea_speed_label)
	sea_speed_slider = HSlider.new()
	sea_speed_slider.custom_minimum_size = Vector2(220, 36)
	sea_speed_slider.min_value = 0
	sea_speed_slider.max_value = 150
	sea_speed_slider.step = 5
	sea_speed_slider.value = sea_speed_percent
	sea_speed_slider.tooltip_text = "Vitesse des motifs de l'eau. 100 % = vitesse précédente ; 0 % = motifs figés."
	sea_speed_slider.value_changed.connect(func(value: float) -> void:
		sea_speed_percent = value
		terrain.water().set_surface_speed(2.0 * value / 100.0, capture_time if capture_time >= 0.0 else _elapsed)
		sea_speed_label.text = "Vitesse : %d %%" % roundi(value))
	footer.add_child(sea_speed_slider)
	footer.add_child(_button("100 %", func() -> void: sea_speed_slider.value = 100))
	var note := Label.new()
	note.text = "Motifs de la mer"
	note.add_theme_font_override("font", FONT)
	note.add_theme_font_size_override("font_size", 12)
	note.add_theme_color_override("font_outline_color", Color("143c42"))
	note.add_theme_constant_override("outline_size", 4)
	footer.add_child(note)
	get_viewport().size_changed.connect(func() -> void: footer.position = Vector2(28, get_viewport_rect().size.y - 54))
	footer.position = Vector2(28, get_viewport_rect().size.y - 54)
	_build_gallery(canvas)

func _panel(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(5)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style

func _button(text_value: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text_value
	button.add_theme_font_override("font", FONT)
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_stylebox_override("normal", _panel(Color("2b5352")))
	button.add_theme_stylebox_override("hover", _panel(Color("426a5a")))
	button.pressed.connect(callback)
	return button

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT: _dragging = event.pressed
		elif event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			view_mode = (view_mode + 1) % 6
			fit_view()
	elif event is InputEventMouseMotion and _dragging: world.position += event.relative
	elif event is InputEventScreenDrag: world.position += event.relative
	elif event is InputEventKey and event.pressed and event.keycode == KEY_SPACE:
		proposed = not proposed
		apply_look()
