extends Node
## LE SOL PIECE PAR PIECE, AU TELEPHONE : l'ile du jeu avec un interrupteur par
## effet (mer peinte, houle, pied mouille, cotes, ombres, rais, bloom,
## ciel, decor) et les i/s moyennes a cote. Chaque changement s'ecrit aussi dans
## logcat (`[toggle]`), avec les i/s qui suivent.
##
##   godot --path godot scenes/bench/terrain_toggle_bench.tscn

## Le bac a sable entier, pas l'ile nue : seule, l'ile peignait un quadrillage
## de reperes sur toutes les cases (ce que le HUD de manche eteint).
const SANDBOX := preload("res://scenes/dig_sandbox.tscn")
const CLASSIC := preload("res://scripts/burrow_terrain.gd")

var _sandbox: Node
var _island: Node2D
var _look := "new"
var _wide := false
var _on := {}
## Le decor eteint par « props » : seulement ce qui etait visible, pour ne pas
## rallumer les reperes caches du jeu (croix, surbrillances).
var _hidden: Array[CanvasItem] = []
var _flat := Shader.new()
var _fps: Label
var _grid: GridContainer
var _frames := 0
var _time := 0.0
var _since_change := 0.0
var _logged := false


func _ready() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 60
	add_child(layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(6, 6)
	layer.add_child(panel)
	var box := VBoxContainer.new()
	panel.add_child(box)
	_fps = Label.new()
	_fps.add_theme_font_size_override("font_size", 20)
	box.add_child(_fps)
	_grid = GridContainer.new()
	_grid.columns = 3
	box.add_child(_grid)
	_make()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			await get_tree().create_timer(6.0).timeout
			get_viewport().get_texture().get_image().save_png(arg.trim_prefix("--shot="))
			get_tree().quit()


func _make() -> void:
	if is_instance_valid(_sandbox):
		remove_child(_sandbox)
		_sandbox.free()
	var swap := func(node: Node) -> void:
		if _look == "old" and node.name == "Terrain" and node.get_script() == GrassTerrain:
			node.set_script(CLASSIC)
	get_tree().node_added.connect(swap)
	_sandbox = SANDBOX.instantiate()
	add_child(_sandbox)
	get_tree().node_added.disconnect(swap)
	_island = _sandbox.get("_island")
	_sandbox.set("_content", "c1")
	_sandbox.call("_new_island", "reef")
	_hidden.clear()
	_on = {"painted": true, "foam": true, "sea": true, "flat": false, "gradient": false, "wet": true,
		"coast": true, "shadows": true, "rays": true, "bloom": true, "sky": true, "props": true}
	# Ombres, rais et bloom suivent l'option Qualite (FLUIDE par defaut) : les
	# boutons partent de ce qui est vraiment a l'ecran.
	for sky in SkyLight._live:
		if not sky._views.is_empty():
			_on["shadows"] = sky._views[0].visible
			_on["rays"] = sky._views[1].visible
	var bloom := get_tree().root.get_node_or_null("Bloom") as CanvasLayer
	_on["bloom"] = bloom != null and bloom.visible
	_frame_cam()
	_build_buttons()
	_flat.code = "shader_type canvas_item; render_mode unshaded; void fragment() { COLOR = vec4(0.03, 0.5, 0.62, 1.0); }"
	_changed("build")


func _build_buttons() -> void:
	for child in _grid.get_children():
		child.queue_free()
	_button("sol: " + _look.to_upper(), func() -> void:
		_look = "old" if _look == "new" else "new"
		_make())
	_button("cam: " + ("LARGE" if _wide else "JEU"), func() -> void:
		_wide = not _wide
		_frame_cam()
		_build_buttons()
		_changed("cam"))
	var names := ["painted", "foam", "sea", "flat", "gradient", "wet", "coast"] if _look == "new" else []
	names.append_array(["shadows", "rays", "bloom", "sky", "props"])
	for key: String in names:
		_switch(key)


func _button(text: String, pressed: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(118, 34)
	b.add_theme_font_size_override("font_size", 16)
	b.focus_mode = Control.FOCUS_NONE
	if pressed.is_valid():
		b.pressed.connect(pressed)
	_grid.add_child(b)
	return b


func _switch(key: String) -> void:
	var b := _button("", Callable())
	var paint := func() -> void:
		b.text = "%s %s" % [key, "ON" if _on[key] else "off"]
		b.modulate = Color.WHITE if _on[key] else Color(1, 0.55, 0.55)
	paint.call()
	b.pressed.connect(func() -> void:
		_on[key] = not _on[key]
		_apply(key)
		paint.call()
		_changed(key))


func _apply(key: String) -> void:
	var on: bool = _on[key]
	var terrain: BurrowTerrain = _island.get("_terrain")
	var water: ShoreWater = terrain.call("water") if terrain is GrassTerrain else null
	match key:
		"painted":
			water.water_material.set_shader_parameter("painted_surface", on)
			water.wet_material.set_shader_parameter("painted_surface", on)
		"foam":
			water.water_material.set_shader_parameter("foam_enabled", on)
			water.wet_material.set_shader_parameter("foam_enabled", on)
		"sea":
			water._sea_view.visible = on
			water._sea_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if on else SubViewport.UPDATE_DISABLED
		"flat":
			for child in water._sea_vp.get_children():
				if child is ColorRect:
					var m := ShaderMaterial.new()
					m.shader = _flat
					child.material = m if on else water.water_material
		"gradient":
			_island.get_node("Ocean/Sea").visible = on
		"wet":
			for block: Node2D in terrain._block_at.values():
				for child in block.get_children():
					if child is Sprite2D and child.has_meta("shore_cell"):
						child.material = water.wet_material if on else null
		"coast":
			(terrain.call("coast") as Node2D).visible = on
		"shadows", "rays":
			for sky in SkyLight._live:
				if not sky._views.is_empty():
					var i := 0 if key == "shadows" else 1
					sky._views[i].visible = on
					sky._vps[i].render_target_update_mode = SubViewport.UPDATE_ONCE if on else SubViewport.UPDATE_DISABLED
		"bloom":
			var bloom := get_tree().root.get_node_or_null("Bloom") as CanvasLayer
			if bloom != null:
				bloom.visible = on
		"sky":
			for sky in SkyLight._live:
				if sky._motes != null:
					sky._motes.visible = on
				if sky._birds != null:
					sky._birds.visible = on
		"props":
			if on:
				for item in _hidden:
					if is_instance_valid(item):
						item.visible = true
				_hidden.clear()
				return
			for block: Node2D in terrain._block_at.values():
				for child in block.get_children():
					if child is CanvasItem and child.visible and child.z_index > BurrowTerrain.Z_BED:
						child.visible = false
						_hidden.append(child)


func _frame_cam() -> void:
	var terrain: BurrowTerrain = _island.get("_terrain")
	if _wide:
		var view := get_viewport().get_visible_rect().size
		_island.call("set_place_cam", BurrowCamera.board(terrain.map, view.x, view.y))
	else:
		_island.call("frame_camera", true)


func _changed(what: String) -> void:
	_frames = 0
	_time = 0.0
	_since_change = 0.0
	_logged = false
	print("[toggle] %s -> %s" % [what, _state()])


func _state() -> String:
	var off: Array[String] = []
	for key: String in _on:
		if not _on[key]:
			off.append(key)
	return "sol=%s cam=%s off=[%s]" % [_look, "large" if _wide else "jeu", ",".join(off)]


func _process(delta: float) -> void:
	_since_change += delta
	# La premiere seconde apres un changement ne compte pas (shaders compiles,
	# viewports refaits).
	if _since_change < 1.0:
		_fps.text = "..."
		return
	_frames += 1
	_time += delta
	var fps := _frames / maxf(_time, 0.001)
	_fps.text = "%.1f i/s  (%.1f ms)   %s" % [fps, 1000.0 / maxf(fps, 0.001), _state()]
	if _time > 4.0 and not _logged:
		_logged = true
		print("[toggle] fps=%.1f %s" % [fps, _state()])
