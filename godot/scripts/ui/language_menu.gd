class_name LanguageMenu
extends Control
## LE CHOIX DE LA LANGUE — un menu sous le bouton du coin haut-droit
## (2026-10-20, la proposition 2 sur six : « va pour le 2 »).
##
## La plaque a coins de metal des conseils de l'accueil (hint-plank.webp), en
## menu deroulant : une ligne par langue, le drapeau (flag.gd) et le nom DANS
## sa langue — « Français », jamais « French » —, la courante en or avec un
## liseré a gauche et une coche. Il remplace le dialogue a planches brunes
## (LanguageSelect), « pas tres joli » : celui-la couvrait l'accueil pour un
## choix qu'on fait une fois.
##
## Le menu ne couvre rien : un toucher a cote le ferme, Echap aussi, et
## choisir une langue le ferme dans le meme geste. Il se pose sous `anchor`,
## aligne sur son bord droit ; sans ancre, au coin haut-droit de l'ecran.
##
## LES LIGNES VIENNENT DE `_items()` (2026-10-23) : le choix du serveur
## (ServerMenu) est le meme menu, avec un ping a droite de chaque ligne.

signal closed

const PLATE := preload("res://assets/ui/hint-plank.webp")
const WIDTH := 200.0
const ROW_H := 31.0
const PAD := 12.0
const GAP := 8.0

var _anchor: Control
var _plate: Control
var _width := WIDTH


## Pose le menu sur `host` (plein ecran), sous `anchor`. Rend le menu.
static func open_under(host: Control, anchor: Control = null) -> LanguageMenu:
	var menu := LanguageMenu.new()
	menu._anchor = anchor
	Kit.fill(menu)
	host.add_child(menu)
	return menu


func _ready() -> void:
	z_index = 200
	# Le fond attrape le toucher a cote du menu, et ne montre rien.
	mouse_filter = Control.MOUSE_FILTER_STOP
	gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			close())
	_plate = _build()
	add_child(_plate)
	_place()
	get_viewport().size_changed.connect(_place)
	# L'ouverture : la plaque se deplie depuis le bouton.
	_plate.modulate.a = 0.0
	_plate.scale = Vector2(1.0, 0.9)
	var t := _plate.create_tween().set_parallel(true).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_plate, "modulate:a", 1.0, 0.14)
	t.tween_property(_plate, "scale", Vector2.ONE, 0.22)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


func close() -> void:
	if is_queued_for_deletion():
		return
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var t := create_tween()
	t.tween_property(_plate, "modulate:a", 0.0, 0.1)
	t.tween_callback(func() -> void:
		closed.emit()
		queue_free())


func _build() -> Control:
	var panel := Control.new()
	var plate := NinePatchRect.new()
	plate.texture = PLATE
	plate.patch_margin_left = 48
	plate.patch_margin_right = 46
	plate.patch_margin_top = 10
	plate.patch_margin_bottom = 10
	plate.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(plate)
	panel.add_child(plate)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, int(PAD))
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(margin)
	margin.add_child(col)
	panel.add_child(margin)
	var items := _items()
	for i in items.size():
		col.add_child(_row(items[i]))
		if i < items.size() - 1:
			var rule := ColorRect.new()
			rule.color = Color(1, 1, 1, 0.06)
			rule.custom_minimum_size = Vector2(0, 1)
			rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
			col.add_child(rule)
	panel.size = Vector2(_width, 2.0 * PAD + items.size() * (ROW_H + 1.0) - 1.0)
	return panel


## Les lignes : `key`, `label`, et au choix `lead` (un Control devant le
## nom), `detail` (un mot gris a droite), `on` (la courante), `enabled`.
func _items() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for l in I18N.LOCALES:
		var code := String(l["code"])
		out.append({"key": code, "label": String(l["label"]), "lead": Flag.rect(code, 12.0), "on": code == I18N.locale})
	return out


## Une ligne touchee.
func _choose(key: String) -> void:
	I18N.set_locale(key)
	close()


## La plaque refaite sur place (une mesure arrivee pendant qu'il est ouvert).
func rebuild() -> void:
	if _plate == null or is_queued_for_deletion():
		return
	_plate.queue_free()
	_plate = _build()
	add_child(_plate)
	_place()


## Une ligne : son drapeau, son nom ; l'or, le liseré et la coche pour la
## courante. Eteinte, grisee et sourde.
func _row(item: Dictionary) -> Button:
	var on := bool(item.get("on", false))
	var enabled := bool(item.get("enabled", true))
	var b := Button.new()
	b.name = "Row_" + String(item["key"])
	b.disabled = not enabled
	b.custom_minimum_size = Vector2(0.0, ROW_H)
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if enabled else Control.CURSOR_ARROW
	var idle := _fill(Color(Palette.GOLD, 0.12) if on else Color(0, 0, 0, 0))
	for state in ["normal", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, idle)
	b.add_theme_stylebox_override("hover", idle if on else _fill(Color(1, 1, 1, 0.07)))
	b.add_theme_stylebox_override("pressed", _fill(Color(Palette.GOLD, 0.2)))
	if on:
		var bar := ColorRect.new()
		bar.color = Palette.GOLD
		bar.position = Vector2(0, 7)
		bar.size = Vector2(3, ROW_H - 14.0)
		bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(bar)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 9)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(margin)
	margin.add_child(line)
	b.add_child(margin)
	var lead: Control = item.get("lead")
	if lead != null:
		lead.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		lead.mouse_filter = Control.MOUSE_FILTER_IGNORE
		line.add_child(lead)
	var ink := Palette.GOLD if on else Palette.CREAM
	var word := Kit.label(String(item["label"]), 13, ink if enabled else Color(Palette.CREAM, 0.35))
	word.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	word.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(word)
	var push := Control.new()
	push.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	push.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(push)
	var detail := String(item.get("detail", ""))
	if not detail.is_empty():
		var note := Kit.label(detail, 11, Color(Palette.CREAM, 0.55 if enabled else 0.3))
		note.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		note.mouse_filter = Control.MOUSE_FILTER_IGNORE
		line.add_child(note)
	if on:
		line.add_child(_check())
	var key := String(item["key"])
	b.pressed.connect(func() -> void: _choose(key))
	return b


func _fill(color: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(4)
	return s


## La coche : deux traits, pas un glyphe (la face pixel n'a pas de ✓).
func _check() -> Control:
	var box := Control.new()
	box.custom_minimum_size = Vector2(14, 14)
	box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tick := Line2D.new()
	tick.points = PackedVector2Array([Vector2(1, 7), Vector2(5, 11), Vector2(13, 2)])
	tick.width = 2.5
	tick.default_color = Palette.GOLD
	tick.joint_mode = Line2D.LINE_JOINT_ROUND
	tick.begin_cap_mode = Line2D.LINE_CAP_ROUND
	tick.end_cap_mode = Line2D.LINE_CAP_ROUND
	box.add_child(tick)
	return box


## Sous l'ancre, aligne sur son bord droit, borne a l'ecran.
func _place() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var top := Kit.EDGE
	var right := view.x - Kit.EDGE
	if _anchor != null and is_instance_valid(_anchor) and _anchor.is_visible_in_tree():
		# Par l'ecran : l'ancre peut vivre sur un autre calque (le champ du
		# serveur, dans un dialogue mis a l'echelle).
		var to_me := get_global_transform_with_canvas().affine_inverse() * _anchor.get_global_transform_with_canvas()
		var a := to_me * Rect2(Vector2.ZERO, _anchor.size)
		top = a.end.y + GAP
		right = a.end.x
	var x := clampf(right - _plate.size.x, Kit.EDGE, view.x - _plate.size.x - Kit.EDGE)
	_plate.position = Vector2(x, minf(top, maxf(Kit.EDGE, view.y - _plate.size.y - Kit.EDGE)))
	_plate.pivot_offset = Vector2(_plate.size.x * 0.75, 0.0)
