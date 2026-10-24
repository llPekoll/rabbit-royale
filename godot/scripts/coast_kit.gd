extends Node2D
class_name CoastKit
## LES COTES EN RELIEF de GrassTerrain : une paroi de terre sous chaque bord
## que la camera voit, une levre d'herbe sur chaque motte du rivage, et
## quelques avancees peintes (caps, langues, ilots) posees dans la mer.
##
## RIEN DE JOUABLE : la carte et la liste des cases ne bougent pas (`assert`
## en fin de `build`). Une avancee est du decor — on ne s'y pose pas, on n'y
## creuse pas, et `pick_shoulder` le dit au banc.

const FACES := preload("res://assets/terrain/coast/faces.png")
const FRINGE := preload("res://assets/terrain/coast/fringe.png")
const LANDFORMS := preload("res://assets/terrain/coast/landforms.png")
const LAND_MASK := preload("res://assets/terrain/coast/landform-mask.png")
const FORMS := preload("res://assets/terrain/coast/landforms.json")
const DIRS := [Vector2i(0, 1), Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, 0)]
## La hauteur de la paroi sous le bord, en pixels peints.
const DEPTH := 16.0
const PIXEL_SCALE := float(Iso.BURROW_TILE_W) / BurrowTerrain.GROUND_PAINTED_W
const FRAME := Vector2i(192, 128)
const ANCHOR := Vector2(96, 32)

var terrain: BurrowTerrain
## Une entree par avancee : son polygone en cases, son sprite, son masque.
var extensions: Array[Dictionary] = []
var face_count := 0
var _forms: Array = []
var _covered_edges: Dictionary = {}
var _extra_bounds := Rect2()
var _hints: Array[Sprite2D] = []
## Les levres de chaque case : elles suivent la motte qui monte ou s'enfonce.
var _lips: Dictionary = {}
## CE QUI PREND LE VOILE D'UNE MOTTE : [sprite, case, teinte propre]. Sans lui,
## levres et avancees restaient claires a cote d'une ile inexploree, et se
## lisaient comme des plaques posees dessus.
var _veiled: Array = []


func build(surface: BurrowTerrain) -> void:
	terrain = surface
	_forms = (FORMS.data as Dictionary).forms
	var map := terrain.map
	var original := hash(map.level)
	_choose_extensions()
	for cell: Vector2i in terrain._block_at:
		var rng := Rng.from_seed("coast:%d:%d" % [cell.x, cell.y])
		var variant := int(rng.next() * 8)
		for side in 4:
			var adjacent: Vector2i = cell + DIRS[side]
			if map.is_land(adjacent.x, adjacent.y) or _covered_edges.has(Vector3i(cell.x, cell.y, side)):
				continue
			if side < 2:
				var face := _mount(cell, _frame(FACES, variant, side, cell), BurrowTerrain.Z_RIM)
				face.name = "CoastEarth"
				face.set_meta("shore_cell", cell)
				face.set_meta("shore_side", side)
				face_count += 1
			# Les autotiles nus ont deja un bord arrondi : une levre droite y
			# laisserait de l'herbe flotter au-dessus de la mer.
			if terrain.has_sod(cell):
				var lip := _mount(cell, _frame(FRINGE, variant, side, cell), BurrowTerrain.Z_BED)
				lip.position.y += 3.0 * PIXEL_SCALE - terrain.rise_at(cell)
				lip.set_meta("rest_y", lip.position.y + terrain.rise_at(cell))
				# La famille de vert de la case, la terre garde sa teinte.
				var group := (terrain as GrassTerrain).grass_group(cell) if terrain is GrassTerrain else 1
				if group == 0: lip.modulate = Color(0.85, 0.91, 0.87)
				elif group == 2: lip.modulate = Color(1.1, 1.06, 1.05)
				_veiled.append([lip, cell, lip.modulate])
				if not _lips.has(cell):
					_lips[cell] = []
				(_lips[cell] as Array).append(lip)
	for info in extensions:
		var block := Node2D.new()
		var anchor: Vector2 = info.anchor
		# DEVANT (sud, est), l'avancee passe devant ce qu'elle depasse ; DERRIERE
		# (nord, ouest), sa pointe la plus proche de la camera depassait les
		# cases de terre d'a cote, et sa falaise pendait sur leur herbe : elle
		# se range alors juste devant sa case (la couture reste couverte), et
		# derriere tout ce qui est devant elle.
		var front := anchor.x + anchor.y
		for point: Vector2 in info.polygon:
			front = maxf(front, point.x + point.y)
		var parent: Vector2i = info.parent
		if int(info.side) >= 2:
			front = minf(front, float(parent.x + parent.y) + 0.0625)
		block.z_index = floori(front * 16.0) + info.tier
		block.position = _project(anchor) - Vector2(0, info.tier * map.lift_px + 3.0) + Vector2(0, info.lower)
		add_child(block)
		var sprite := Sprite2D.new()
		sprite.texture = _land_frame(LANDFORMS, info.variant, info.side)
		sprite.centered = false
		sprite.position = -ANCHOR
		block.add_child(sprite)
		info.sprite = sprite
		_veiled.append([sprite, parent, Color.WHITE])
		info.alpha = _frame_image(LANDFORMS, info.variant, info.side)
		var used := (info.alpha as Image).get_used_rect()
		var bounds := Rect2(block.position + sprite.position + Vector2(used.position), Vector2(used.size))
		_extra_bounds = bounds if _extra_bounds == Rect2() else _extra_bounds.merge(bounds)
		var hint := Sprite2D.new()
		hint.texture = _land_frame(LAND_MASK, info.variant, info.side)
		hint.centered = false
		hint.position = -ANCHOR
		hint.modulate = Color(0.96, 0.67, 0.24, 0.55)
		hint.visible = false
		block.add_child(hint)
		info.mask_image = _frame_image(LAND_MASK, info.variant, info.side)
		_hints.append(hint)
	terrain.rise_changed.connect(_follow_rise)
	assert(hash(map.level) == original, "La cote a modifie la carte jouable")


## LE VOILE DE LA MOTTE, recopie a chaque image : TileView le fond en douceur.
func _process(_delta: float) -> void:
	if not terrain is GrassTerrain:
		return
	for entry: Array in _veiled:
		var sod := (terrain as GrassTerrain).sod_at(entry[1])
		if sod == null:
			continue
		var veil := sod.modulate
		var tint: Color = entry[2]
		(entry[0] as Sprite2D).modulate = Color(tint.r * veil.r, tint.g * veil.g, tint.b * veil.b, tint.a)


## LA LEVRE SUIT SA MOTTE : levee, enfoncee, creusee.
func _follow_rise(cell: Vector2i) -> void:
	for lip: Sprite2D in _lips.get(cell, []):
		if is_instance_valid(lip):
			lip.position.y = float(lip.get_meta("rest_y")) - terrain.rise_at(cell)


func _choose_extensions() -> void:
	var map := terrain.map
	var plan := [0, 1, 2, 5, 4, 6, 8, 9] if map.width > 8 else [4, 2, 8]
	for form_index: int in plan:
		var candidates: Array[Dictionary] = []
		for cell: Vector2i in terrain._block_at:
			if map.surface_lift(cell.x, cell.y) != 0: continue
			for side in 4:
				if map.is_land(cell.x + DIRS[side].x, cell.y + DIRS[side].y): continue
				if form_index == 0 and side > 1: continue
				if form_index == 1 and side < 2: continue
				var rng := Rng.from_seed("coast-landform-v2:%d:%d:%d:%d" % [form_index, cell.x, cell.y, side])
				var offset := snappedf(rng.next() * 0.7 - 0.25, 0.05)
				var tangent := Vector2(1, 0) if side in [0, 2] else Vector2(0, 1)
				var anchor := Vector2(cell) + tangent * offset
				if side == 0: anchor.y += 1.0
				elif side == 1: anchor.x += 1.0
				var poly := _polygon(form_index, side, anchor)
				var tier := map.level_at(cell.x, cell.y)
				if not _fits(poly, form_index, side, anchor, tier): continue
				var at: Vector2i = cell + DIRS[side]
				candidates.append({"cell": at, "parent": cell, "anchor": anchor, "polygon": poly,
					"tier": tier, "side": side, "variant": form_index, "name": _forms[form_index].name,
					"lower": 19.0 - float(_forms[form_index].depth), "score": rng.next()})
		candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.score < b.score)
		if candidates.is_empty(): continue
		var chosen: Dictionary = candidates[0]
		extensions.append(chosen)
		if _forms[form_index].attached and is_zero_approx(chosen.lower): _cover_attached_edges(chosen)


func _orient(depth: float, along: float, side: int) -> Vector2:
	match side:
		0: return Vector2(along, depth)
		1: return Vector2(depth, along)
		2: return Vector2(along, -depth)
		_: return Vector2(-depth, along)


func _polygon(form: int, side: int, anchor: Vector2) -> PackedVector2Array:
	var poly := PackedVector2Array()
	for point: Array in _forms[form].polygon:
		poly.append(anchor + _orient(point[0], point[1], side))
	return poly


func _bounds(poly: PackedVector2Array) -> Rect2:
	var out := Rect2(poly[0], Vector2.ZERO)
	for point in poly: out = out.expand(point)
	return out


func _fits(poly: PackedVector2Array, form: int, side: int, anchor: Vector2, tier: int) -> bool:
	var map := terrain.map
	var bounds := _bounds(poly)
	for previous in extensions:
		if bounds.grow(0.25).intersects(_bounds(previous.polygon).grow(0.1)): return false
	if _forms[form].attached:
		var lo := INF
		var hi := -INF
		for p: Array in _forms[form].polygon:
			if is_zero_approx(p[0]):
				lo = minf(lo, p[1]); hi = maxf(hi, p[1])
		var t := lo + 0.04
		while t < hi:
			var back := anchor + _orient(-0.08, t, side)
			var x := floori(back.x)
			var y := floori(back.y)
			if map.level_at(x, y) != tier or map.surface_lift(x, y) != 0: return false
			t += 0.2
	var y := bounds.position.y + 0.06
	while y < bounds.end.y:
		var x := bounds.position.x + 0.06
		while x < bounds.end.x:
			if Geometry2D.is_point_in_polygon(Vector2(x, y), poly) and map.is_land(floori(x), floori(y)): return false
			x += 0.18
		y += 0.18
	return true


func _cover_attached_edges(info: Dictionary) -> void:
	for cell: Vector2i in terrain._block_at:
		var side: int = info.side
		var start := Vector2(cell)
		if side == 0: start.y += 1
		elif side == 1: start.x += 1
		var covered := true
		for t in [0.02, 0.5, 0.98]:
			if not Geometry2D.is_point_in_polygon(start + _orient(0.06, t, side), info.polygon): covered = false
		if covered: _covered_edges[Vector3i(cell.x, cell.y, side)] = true


func _land_frame(sheet: Texture2D, variant: int, side: int) -> AtlasTexture:
	var frame := AtlasTexture.new()
	frame.atlas = sheet
	frame.region = Rect2(variant * FRAME.x, side * FRAME.y, FRAME.x, FRAME.y)
	return frame


func _frame_image(sheet: Texture2D, variant: int, side: int) -> Image:
	return GrassTerrain.sheet_image(sheet).get_region(
		Rect2i(variant * FRAME.x, side * FRAME.y, FRAME.x, FRAME.y))


func _project(grid: Vector2) -> Vector2:
	return terrain.map.origin + Vector2((grid.x - grid.y) * Iso.half_w(), (grid.x + grid.y) * Iso.half_h())


func _frame(sheet: Texture2D, variant: int, side: int, cell: Vector2i) -> Texture2D:
	var frame := AtlasTexture.new()
	frame.atlas = sheet
	frame.region = Rect2(variant * 64, side * 64, 64, 64)
	if terrain._warp_at.has(cell):
		var lifts: Array = (terrain._warp_at[cell][1] as Array)[0]
		return Slopes.ramp_texture(frame, lifts, null, 0, false, false, terrain.slope_shading)
	return frame


func _mount(cell: Vector2i, texture: Texture2D, depth: int) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture = texture
	sprite.centered = false
	sprite.scale = Vector2.ONE * PIXEL_SCALE
	var grown := 64.0 * (PIXEL_SCALE - 1.0) * 0.5
	sprite.position = Vector2(-32.0 - grown, -20.0 - grown)
	sprite.z_index = depth
	(terrain._block_at[cell] as Node2D).add_child(sprite)
	return sprite


## Ce que les avancees ajoutent au cadre du plateau.
func extra_bounds() -> Rect2:
	return _extra_bounds


func set_zones(enabled: bool) -> void:
	for hint in _hints: hint.visible = enabled


## L'AVANCEE SOUS CE POINT, ou (-1,-1). Une case jouable devant passe avant :
## une falaise du fond peut depasser derriere le sol.
func pick_shoulder(world_point: Vector2) -> Vector2i:
	if BurrowPick.at(terrain.map, world_point).x >= 0:
		return Vector2i(-1, -1)
	for info in extensions:
		var sprite: Sprite2D = info.sprite
		var point: Vector2 = (world_point - (sprite.get_parent() as Node2D).position - sprite.position) / sprite.scale
		var x := floori(point.x)
		var y := floori(point.y)
		var alpha: Image = info.alpha
		if x >= 0 and y >= 0 and x < alpha.get_width() and y < alpha.get_height() and alpha.get_pixel(x, y).a > 0.5:
			return info.cell
	return Vector2i(-1, -1)
