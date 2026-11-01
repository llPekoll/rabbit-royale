extends Node2D
class_name ShoreWater
## LA MER PEINTE de GrassTerrain : une seule passe d'eau autour de l'union
## exacte des sprites de terre visibles, et le pied mouille des parois.
## La carte des distances au rivage se cuit une fois par `build`, jamais par
## image ; le shader la lit pour l'ecume, les hauts-fonds et la terre noyee.
const SHADER := preload("res://shaders/shore_water.gdshader")
const WET_SHADER := preload("res://shaders/shore_wet_foot.gdshader")
const SEA_ART := preload("res://assets/terrain/coast/sea-painted.png")
const RANGE := 96.0
var water_material: ShaderMaterial
var wet_material: ShaderMaterial
var distance_image: Image
var shore_origin := Vector2.ZERO
var build_ms := 0
var _images: Dictionary = {}
var water_rise := 10.0
var submerged_pixels := 0
var _terrain: BurrowTerrain
var _field_transform := Transform2D(0.0, Vector2(INF, INF))
## LA MER SE CALCULE AU PIXEL DU MONDE, pas de l'ecran : le shader arrondit
## deja tout au pixel du monde (`floor(world_pixel)`), qui fait ~3x3 pixels
## d'ecran au Seeker. Calculee plein ecran, elle coutait ~9 i/s (40 -> 48 avec
## une mer unie, mesure le 2026-10-24) ; ici une image par pixel du monde, posee
## agrandie derriere tout le monde — la meme image, 9 fois moins de calcul.
var _sea_vp: SubViewport
var _sea_view: Sprite2D
## Camera assez reculee pour qu'un pixel du monde tienne dans moins d'un pixel
## d'ecran : la mer se calcule a l'ecran.
const WORLD_RES_MIN_SCALE := 1.0
## LES CARTES DEJA CUITES, PAR SOL. La cuisson coute une demi-seconde sur un
## Mac (bien plus au telephone), et tout le monde a la meme ile et le meme
## terrier (ISLAND_GROUND, BURROW_GROUND) : elle se fait une fois par appareil,
## gardee en memoire et dans `user://shore/`. Le terrier se rebatit en plus a
## chaque objet deplace.
##
## LA CLE EST LE SOL, pas l'etat des mottes : une motte creusee ou levee au
## rivage ne deplace la ligne d'eau que d'un pixel ou deux.
static var _bakes: Dictionary = {}
const BAKES_KEPT := 4
const DISK := "user://shore"
## A monter quand la cuisson ou l'art des cotes change : les cartes gardees
## sur les appareils sont alors refaites.
const BAKE_VERSION := 1

func build(terrain: BurrowTerrain, coast: CoastKit, raised: float = 10.0) -> void:
	var started := Time.get_ticks_msec()
	_terrain = terrain
	water_rise = raised
	z_index = -1100
	wet_material = ShaderMaterial.new()
	wet_material.shader = WET_SHADER
	var ground: Array = []
	var map := terrain.map
	for cell: Vector2i in terrain._block_at:
		var block: Node2D = terrain._block_at[cell]
		var south := not map.is_land(cell.x, cell.y + 1)
		var east := not map.is_land(cell.x + 1, cell.y)
		for child in block.get_children():
			# The original autotile also contains a small soil rim. It must
			# cross the same water plane as the taller study cliff in front.
			if child is Sprite2D and child.z_index <= BurrowTerrain.Z_BED and child.material == null and (south or east):
				if not child.has_meta("shore_cell"):
					child.set_meta("shore_cell", cell)
					child.set_meta("shore_side", 2 if south and east else (0 if south else 1))
			# Le sol seulement (motte, levre et paroi comprises) : un arbre ou un
			# coffre au rivage ne doit pas tirer d'ecume autour de lui.
			if child is Sprite2D and child.visible and child.z_index <= BurrowTerrain.Z_BED:
				ground.append([child, {}])
			if child is Sprite2D and child.has_meta("shore_cell"): child.material = wet_material
	if is_instance_valid(coast):
		for info: Dictionary in coast.extensions:
			ground.append([info.sprite, info])
			(info.sprite as Sprite2D).material = wet_material
	var key := _bake_key(map, coast)
	if not _bakes.has(key):
		var kept := _load_bake(key)
		if kept.is_empty():
			kept = _bake(ground)
			_save_bake(key, kept)
		_bakes[key] = kept
		while _bakes.size() > BAKES_KEPT:
			_bakes.erase(_bakes.keys()[0])
	var baked: Dictionary = _bakes[key]
	distance_image = baked.image
	shore_origin = baked.origin
	submerged_pixels = baked.submerged
	var size: Vector2i = distance_image.get_size()
	water_material = ShaderMaterial.new()
	water_material.shader = SHADER
	var distance_texture := ImageTexture.create_from_image(distance_image)
	for mat in [water_material, wet_material]:
		mat.set_shader_parameter("wave_speed", 2.0)
		mat.set_shader_parameter("surface_speed", 2.1)
		mat.set_shader_parameter("water_art_scale", 1.25)
		mat.set_shader_parameter("water_art", SEA_ART)
		mat.set_shader_parameter("shore_distance", distance_texture)
		mat.set_shader_parameter("shore_origin", shore_origin)
		mat.set_shader_parameter("shore_size", Vector2(size))
		mat.set_shader_parameter("distance_range", RANGE)
	var sea := ColorRect.new()
	sea.position = Vector2(-4096, -4096)
	sea.size = Vector2(8192, 8192)
	sea.mouse_filter = Control.MOUSE_FILTER_IGNORE
	water_material.set_shader_parameter("draw_origin", sea.position)
	sea.material = water_material
	_sea_vp = SubViewport.new()
	_sea_vp.disable_3d = true
	_sea_vp.transparent_bg = false
	_sea_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_sea_vp.size = Vector2i(8, 8)
	_sea_vp.add_child(sea)
	add_child(_sea_vp)
	# Derriere le monde, devant le degrade de l'Ocean (-100) qu'elle couvre.
	var layer := CanvasLayer.new()
	layer.layer = -99
	add_child(layer)
	_sea_view = Sprite2D.new()
	_sea_view.centered = false
	_sea_view.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_sea_view.texture = _sea_vp.get_texture()
	layer.add_child(_sea_view)
	sync_transform()
	# Juste avant le dessin, une fois la camera de l'image posee : cale dans
	# `_process`, la mer glissait d'une image derriere la terre au panoramique.
	RenderingServer.frame_pre_draw.connect(_frame_sea)
	_frame_sea()
	build_ms = Time.get_ticks_msec() - started
	print("[shore-water] silhouette=%s rise=%.0f submerged=%d sprites=%d baked=%dms" % [size, water_rise, submerged_pixels, ground.size(), build_ms])


## CE QUI DECIDE DE LA CARTE : le relief, sa place, le niveau de la mer et les
## avancees de la cote.
func _bake_key(map: BurrowMap, coast: CoastKit) -> String:
	var parts: Array = [BAKE_VERSION, water_rise, map.width, map.height, map.level, map.origin,
		Iso.BURROW_TILE_W]
	if coast != null:
		for info: Dictionary in coast.extensions:
			parts.append([info.variant, info.side, info.anchor, info.lower, info.tier])
	return "%08x" % (hash(parts) & 0xffffffff)


func _load_bake(key: String) -> Dictionary:
	var cfg := ConfigFile.new()
	if cfg.load("%s/%s.cfg" % [DISK, key]) != OK:
		return {}
	var image := Image.load_from_file("%s/%s.png" % [DISK, key])
	if image == null or image.is_empty():
		return {}
	image.convert(Image.FORMAT_RGBA8)
	return {"image": image, "origin": cfg.get_value("bake", "origin", Vector2.ZERO),
		"submerged": int(cfg.get_value("bake", "submerged", 0))}


func _save_bake(key: String, baked: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(DISK)
	if (baked.image as Image).save_png("%s/%s.png" % [DISK, key]) != OK:
		return
	var cfg := ConfigFile.new()
	cfg.set_value("bake", "origin", baked.origin)
	cfg.set_value("bake", "submerged", baked.submerged)
	cfg.save("%s/%s.cfg" % [DISK, key])


func _bake(ground: Array) -> Dictionary:
	submerged_pixels = 0
	var stamps: Array[Dictionary] = []
	for entry: Array in ground:
		_stamp_info(entry[0], stamps, entry[1])
	var bounds: Rect2 = stamps[0].bounds
	for stamp in stamps: bounds = bounds.merge(stamp.bounds)
	bounds = bounds.grow(RANGE + 2.0)
	shore_origin = bounds.position.floor()
	var size := Vector2i(bounds.end.ceil() - shore_origin)
	var occupied := PackedByteArray()
	occupied.resize(size.x * size.y)
	var underwater := PackedFloat32Array()
	underwater.resize(occupied.size())
	var wet_rim := PackedFloat32Array()
	wet_rim.resize(occupied.size())
	for stamp in stamps:
		var rect := Rect2i(stamp.bounds.position.floor() - shore_origin, stamp.bounds.size.ceil() + Vector2.ONE * 2)
		var inverse: Transform2D = stamp.transform.affine_inverse()
		var img: Image = stamp.image
		for y in range(maxi(0, rect.position.y), mini(size.y, rect.end.y)):
			for x in range(maxi(0, rect.position.x), mini(size.x, rect.end.x)):
				var src := Vector2i((inverse * (shore_origin + Vector2(x + 0.5, y + 0.5))).floor())
				if src.x >= 0 and src.y >= 0 and src.x < img.get_width() and src.y < img.get_height() and img.get_pixelv(src).a > 0.5:
					var i := y * size.x + x
					var below := 0.0
					if stamp.has("waterline"):
						below = shore_origin.y + y + 0.5 - (stamp.waterline as PackedFloat32Array)[src.x]
						if below <= 0.0:
							wet_rim[i] = maxf(wet_rim[i], clampf(1.0 + below / 2.5, 0.0, 1.0))
					if below <= 0.0: occupied[i] = 1
					else: underwater[i] = maxf(underwater[i], below)
	# Chamfer distance to the actual silhouette, including detached islets and
	# concave inlets. All land pixels stay zero, so foam cannot leak across it.
	var distances := PackedFloat32Array()
	distances.resize(occupied.size())
	for i in distances.size(): distances[i] = 0.0 if occupied[i] else RANGE
	for y in range(1, size.y - 1):
		for x in range(1, size.x - 1):
			var i := y * size.x + x
			if occupied[i]: continue
			distances[i] = minf(distances[i], minf(minf(distances[i - 1], distances[i - size.x]) + 1.0,
				minf(distances[i - size.x - 1], distances[i - size.x + 1]) + 1.4142))
	for y in range(size.y - 2, 0, -1):
		for x in range(size.x - 2, 0, -1):
			var i := y * size.x + x
			if occupied[i]: continue
			distances[i] = minf(distances[i], minf(minf(distances[i + 1], distances[i + size.x]) + 1.0,
				minf(distances[i + size.x - 1], distances[i + size.x + 1]) + 1.4142))
	var data := PackedByteArray()
	data.resize(size.x * size.y * 4)
	for i in distances.size():
		data[i * 4] = roundi(minf(distances[i] / RANGE, 1.0) * 255)
		data[i * 4 + 1] = occupied[i] * 255
		if occupied[i] == 0 and underwater[i] > 0.0:
			data[i * 4 + 2] = maxi(1, roundi(minf(underwater[i] / 32.0, 1.0) * 255))
			submerged_pixels += 1
		# Alpha carries wet earth above the current sea plane, independently
		# of submerged depth. The sea itself only reads the RGB channels.
		data[i * 4 + 3] = roundi(wet_rim[i] * 255.0) if occupied[i] else 0
	_images.clear()
	return {"image": Image.create_from_data(size.x, size.y, false, Image.FORMAT_RGBA8, data),
		"origin": shore_origin, "submerged": submerged_pixels}

func _stamp_info(sprite: Sprite2D, stamps: Array[Dictionary], info: Dictionary = {}) -> void:
	if sprite.texture == null: return
	var key := sprite.texture.get_instance_id()
	if not _images.has(key): _images[key] = sprite.texture.get_image()
	var img: Image = _images[key]
	var transform: Transform2D = (get_parent() as Node2D).global_transform.affine_inverse() * sprite.global_transform
	var offset := sprite.offset - (Vector2(img.get_size()) * 0.5 if sprite.centered else Vector2.ZERO)
	transform.origin += transform.basis_xform(offset)
	var stamp := {"image": img, "transform": transform,
		"bounds": transform * Rect2(img.get_used_rect())}
	if sprite.has_meta("shore_cell") or not info.is_empty():
		var line := PackedFloat32Array()
		line.resize(img.get_width())
		line.fill(INF)
		var map := _terrain.map
		# One sea plane for the whole island. The old wall foot was about
		# ten pixels below grid zero. Its height never follows a raised tile.
		var plane_y := 10.0 - water_rise
		if sprite.has_meta("shore_cell"):
			var cell: Vector2i = sprite.get_meta("shore_cell")
			var side: int = sprite.get_meta("shore_side")
			var anchor := Iso.project(cell.x, cell.y, map.origin)
			for x in line.size():
				var world_x := (transform * Vector2(x + 0.5, 0)).x
				var dx := world_x - anchor.x
				var edge_x := -absf(dx) if side == 2 else dx * (1.0 if side == 0 else -1.0)
				line[x] = anchor.y + Iso.half_h() * 2.0 + edge_x * Iso.half_h() / Iso.half_w() + plane_y
		else:
			var top: Image = info.mask_image
			for x in line.size():
				for y in range(top.get_height() - 1, -1, -1):
					if top.get_pixel(x, y).a <= 0.5: continue
					line[x] = (transform * Vector2(x + 0.5, y + 0.5)).y + info.tier * map.lift_px + 3.0 - info.lower + plane_y
					break
		stamp.waterline = line
		# The shared shader uses MODEL_MATRIX and the inverse field transform.
		# No per-sprite instance slots: GLES has a small global allocation pool.
	stamps.append(stamp)

func set_capture_time(seconds: float) -> void:
	sync_transform()
	water_material.set_shader_parameter("time_override", seconds)
	wet_material.set_shader_parameter("time_override", seconds)

## LA COTE QUI SE NOIE : 1 = le rivage dessine, 0 = le large partout, sans
## la trace de l'ile. Le naufrage la descend avec l'ile (island.gd).
func set_shore_presence(value: float) -> void:
	for mat in [water_material, wet_material]:
		mat.set_shader_parameter("shore_presence", clampf(value, 0.0, 1.0))

func get_shore_presence() -> float:
	var v: Variant = water_material.get_shader_parameter("shore_presence") if water_material != null else null
	return float(v) if v != null else 1.0

func set_contact_enabled(enabled: bool) -> void:
	wet_material.set_shader_parameter("enabled", enabled)

func set_foam_enabled(enabled: bool) -> void:
	water_material.set_shader_parameter("foam_enabled", enabled)
	wet_material.set_shader_parameter("foam_enabled", enabled)

func set_painted_surface(enabled: bool) -> void:
	for mat in [water_material, wet_material]:
		mat.set_shader_parameter("painted_surface", enabled)

func set_art_scale(value: float) -> void:
	# The submerged cliff uses the same painting as the open sea.
	for mat in [water_material, wet_material]:
		mat.set_shader_parameter("water_art_scale", clampf(value, 0.5, 4.0))

func set_surface_speed(value: float, clock_seconds: float) -> void:
	# Preserve the current phase when the preview slider changes speed.
	# Foam and sun glints still use the original clock.
	var previous_speed: float = water_material.get_shader_parameter("surface_speed")
	var previous_offset = water_material.get_shader_parameter("surface_time_offset")
	var phase := clock_seconds * previous_speed + (float(previous_offset) if previous_offset != null else 0.0)
	var speed := clampf(value, 0.0, 4.0)
	for mat in [water_material, wet_material]:
		mat.set_shader_parameter("surface_speed", speed)
		mat.set_shader_parameter("surface_time_offset", phase - clock_seconds * speed)

func sync_transform() -> void:
	if wet_material == null: return
	var transform := (get_parent() as Node2D).global_transform
	if transform == _field_transform: return
	_field_transform = transform
	wet_material.set_shader_parameter("field_origin", transform.origin)
	wet_material.set_shader_parameter("field_scale", transform.get_scale())

func _process(_delta: float) -> void:
	sync_transform()


func _exit_tree() -> void:
	if RenderingServer.frame_pre_draw.is_connected(_frame_sea):
		RenderingServer.frame_pre_draw.disconnect(_frame_sea)


## Cale l'image de la mer sur la camera : une case de l'image = un pixel du
## monde, l'image collee a la grille des pixels du monde pour ne pas scintiller
## au panoramique.
func _frame_sea() -> void:
	if _sea_vp == null or not is_inside_tree() or not is_visible_in_tree():
		return
	var vp := get_viewport()
	# Du repere de la mer a l'ecran logique (avant l'etirement de la fenetre).
	var to_screen := vp.canvas_transform * get_global_transform()
	var unit := to_screen.get_scale().x
	var stretch := vp.get_final_transform().get_scale().x
	var screen := vp.get_visible_rect().size
	if unit <= 0.0:
		return
	var vp_size: Vector2i
	if unit * stretch >= WORLD_RES_MIN_SCALE:
		var top_left := (to_screen.affine_inverse() * Vector2.ZERO).floor()
		vp_size = Vector2i((screen / unit).ceil()) + Vector2i(2, 2)
		_sea_vp.canvas_transform = Transform2D(0.0, -top_left)
		_sea_view.position = to_screen * top_left
		_sea_view.scale = Vector2(unit, unit)
	else:
		vp_size = Vector2i((screen * stretch).ceil())
		_sea_vp.canvas_transform = Transform2D.IDENTITY.scaled(Vector2(stretch, stretch)) * to_screen
		_sea_view.position = Vector2.ZERO
		_sea_view.scale = Vector2(1.0 / stretch, 1.0 / stretch)
	if _sea_vp.size != vp_size:
		_sea_vp.size = vp_size
