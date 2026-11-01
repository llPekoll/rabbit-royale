extends Node2D
class_name NaturalDetails
## LES PETITS DETAILS DU TERRIER (refonte du 2026-10-26) : ombres cuites,
## roseaux au vent, quatre bouquets de feuilles qui flottent. Purement du
## decor : ni case occupee, ni collision, rien ne change cote serveur.
const ACCENTS := preload("res://assets/deco/identity/petits-decors.png")
const REEDS := preload("res://assets/deco/identity/roseaux-sheet.png")
const FOAM := preload("res://assets/deco/identity/feuilles-ecume.png")
const TREE_SECONDS := 0.18
var terrain: GrassTerrain
var layout: BurrowLayout
var accents: Array[Dictionary] = []
var _wave_speed := 2.0
var _elapsed := 0.0

func build(value: BurrowLayout, ground: GrassTerrain) -> void:
	for item in accents:
		if is_instance_valid(item.node): item.node.queue_free()
	accents.clear()
	layout = value
	terrain = ground
	_build_accents()

func _process(delta: float) -> void:
	if not is_visible_in_tree() or not is_instance_valid(terrain): return
	_elapsed += delta
	# UNE SEULE HORLOGE pour le rivage et les feuilles qui flottent, comme sur
	# la maquette : sinon les feuilles derivent a contretemps de l'ecume.
	# set_capture_time etait l'horloge des captures ; elle pilote maintenant la
	# mer du terrier a chaque image (time_override des deux materiaux).
	terrain.water().set_capture_time(_elapsed)
	_animate_accents(_elapsed)

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
			add_child(node)
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
			var f := posmod(int(floor(time / TREE_SECONDS)) + int(item.phase), 8)
			if node.region_rect.position.x != f * 128: node.region_rect.position.x = f * 128

