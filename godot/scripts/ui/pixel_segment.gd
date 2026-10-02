class_name PixelSegment
extends Control
## DEUX PARTIS COTE A COTE, et un curseur dore qui glisse sur le choisi —
## le « Low | High » des reglages graphiques des jeux mobiles. La gouttiere
## est celle de l'energie (terre cernee d'encre), le curseur est l'or des
## onglets choisis (Palette.TAB_ON_*).

signal picked(index: int)

const H := 30.0

var index := 0
var _t := 0.0
var _tween: Tween
var _labels: Array[Label] = []


func _init(width: float = 150.0) -> void:
	custom_minimum_size = Vector2(width, H)
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for i in 2:
		var l := Kit.label("", Kit.pixel_size(1.25), Palette.CREAM)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		l.clip_text = true
		add_child(l)
		_labels.append(l)
	resized.connect(_layout)


func set_words(a: String, b: String) -> void:
	_labels[0].text = a
	_labels[1].text = b


func set_index(i: int) -> void:
	index = i
	_t = float(i)
	_reflect()


func pick(i: int) -> void:
	if i == index:
		return
	index = i
	if _tween != null and _tween.is_valid():
		_tween.kill()
	_tween = create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_tween.tween_method(func(v: float) -> void:
		_t = v
		queue_redraw(), _t, float(i), 0.22)
	_reflect()
	picked.emit(i)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		pick(0 if (event as InputEventMouseButton).position.x < size.x * 0.5 else 1)
		accept_event()


func _reflect() -> void:
	for i in 2:
		var chosen := i == index
		_labels[i].add_theme_color_override("font_color", Palette.INK if chosen else Palette.CHALK_DIM)
		if chosen:
			_labels[i].add_theme_color_override("font_shadow_color", Color(1, 1, 1, 0.45))
			_labels[i].add_theme_constant_override("shadow_offset_y", 1)
		else:
			_labels[i].add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
	queue_redraw()


func _layout() -> void:
	var half := size.x * 0.5
	for i in 2:
		_labels[i].position = Vector2(half * i + 4.0, 0.0)
		_labels[i].size = Vector2(half - 8.0, size.y)


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var lip := StyleBoxFlat.new()
	lip.bg_color = Palette.WELL_RIM
	lip.set_corner_radius_all(8)
	lip.anti_aliasing = false
	draw_style_box(lip, Rect2(r.position + Vector2(0, 2), r.size))
	var track := StyleBoxFlat.new()
	track.bg_color = Palette.TRACK_FACE
	track.set_border_width_all(2)
	track.border_color = Palette.INK
	track.set_corner_radius_all(8)
	track.anti_aliasing = false
	draw_style_box(track, r)
	draw_rect(Rect2(Vector2(6, 2), Vector2(size.x - 12, 2)), Color(0, 0, 0, 0.25))

	# Le curseur dore, en relief : sa face, son reflet, son biseau.
	var half := size.x * 0.5
	var thumb := Rect2(Vector2(3.0 + (half - 3.0) * _t, 3.0), Vector2(half - 3.0, size.y - 6.0))
	var face := StyleBoxFlat.new()
	face.bg_color = Palette.TAB_ON_BOTTOM
	face.set_border_width_all(2)
	face.border_color = Palette.INK
	face.set_corner_radius_all(6)
	face.anti_aliasing = false
	draw_style_box(face, thumb)
	draw_rect(Rect2(thumb.position + Vector2(2, 2), Vector2(thumb.size.x - 4, (thumb.size.y - 4) * 0.5)), Palette.TAB_ON_TOP)
	draw_rect(Rect2(thumb.position + Vector2(5, 3), Vector2(thumb.size.x - 10, 2)), Color(1, 1, 1, 0.55))
