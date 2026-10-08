class_name PixelSwitch
extends Control
## UN INTERRUPTEUR A GLISSIERE, celui de tous les jeux mobiles, dans la peau
## du terrier : une gouttiere en pilule, verte feuille quand c'est ON, terre
## quand c'est OFF, et un bouton creme cerne d'encre qui glisse de l'un a
## l'autre avec un petit rebond. Le mot (ON/OFF) se lit du cote libre.
##
## Ne pose aucune planche : il se range dans une rangee (SettingsPane), et
## c'est la RANGEE entiere qui le bascule au doigt (`toggle`).

signal toggled(on: bool)

const W := 66.0
const H := 30.0
const KNOB := 22.0
const LEAF_TOP := Color("#a6d84a")
const LEAF_FACE := Color("#6fa82c")
const LEAF_DEEP := Color("#3f6b17")

var camp := false
var on := false
var disabled := false:
	set(v):
		disabled = v
		_reflect()
## 0 = a gauche (OFF), 1 = a droite (ON) ; anime.
var _t := 0.0
var _tween: Tween
var _word: Label
var _lock: TextureRect


func _init(dark: bool = false) -> void:
	camp = dark
	custom_minimum_size = Vector2(W, H)
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mouse_filter = Control.MOUSE_FILTER_PASS
	_word = Kit.label("", Kit.pixel_size(1.25), Palette.CREAM, true)
	_word.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_word)
	_lock = TextureRect.new()
	_lock.texture = preload("res://assets/ui/icons/settings/lock.png")
	_lock.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_lock.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_lock.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_lock.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lock.modulate = Palette.INK
	_lock.visible = false
	add_child(_lock)
	resized.connect(_layout)


## Pose l'etat sans animation (lecture des reglages).
func set_on(v: bool, words: Array = ["ON", "OFF"]) -> void:
	on = v
	_t = 1.0 if v else 0.0
	_word.text = String(words[0] if v else words[1])
	_reflect()


## Le doigt : bascule, glisse, et le dit.
func toggle(words: Array = ["ON", "OFF"]) -> void:
	if disabled:
		Sound.deny()
		return
	on = not on
	_word.text = String(words[0] if on else words[1])
	if _tween != null and _tween.is_valid():
		_tween.kill()
	_tween = create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_tween.tween_method(_slide, _t, 1.0 if on else 0.0, 0.22)
	_reflect()
	toggled.emit(on)


func _slide(v: float) -> void:
	_t = v
	_layout()
	queue_redraw()


func _reflect() -> void:
	if _word == null:
		return
	_lock.visible = disabled
	_word.add_theme_color_override("font_color", Palette.CREAM if on else Palette.CHALK_DIM)
	modulate.a = 0.6 if disabled else 1.0
	_layout()
	queue_redraw()


func _knob_x() -> float:
	var pad := (H - KNOB) * 0.5
	return lerpf(pad, size.x - pad - KNOB, clampf(_t, -0.1, 1.1))


func _layout() -> void:
	if _word == null:
		return
	var pad := (H - KNOB) * 0.5
	# Le mot occupe le cote que le bouton a quitte.
	var free_w := size.x - KNOB - pad * 3.0
	_word.size = Vector2(free_w, size.y)
	_word.position = Vector2(pad if on else pad * 2.0 + KNOB, 0.0)
	_word.visible = not disabled
	var kx := _knob_x()
	_lock.size = Vector2(KNOB - 6.0, KNOB - 6.0)
	_lock.position = Vector2(kx + 3.0, (size.y - KNOB) * 0.5 + 3.0)


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var rad := int(size.y * 0.5)
	# La levre sous la gouttiere, puis la gouttiere.
	var lip := StyleBoxFlat.new()
	lip.bg_color = CampStyle.NIGHT if camp else Palette.WELL_RIM
	lip.set_corner_radius_all(rad)
	lip.anti_aliasing = false
	draw_style_box(lip, Rect2(r.position + Vector2(0, 2), r.size))
	var track := StyleBoxFlat.new()
	track.bg_color = LEAF_FACE if on else (CampStyle.NIGHT if camp else Palette.TRACK_FACE)
	track.set_border_width_all(2)
	track.border_color = Palette.INK
	track.set_corner_radius_all(rad)
	track.anti_aliasing = false
	draw_style_box(track, r)
	# Un reflet en haut de la gouttiere verte : le vernis des jeux mobiles.
	if on:
		var shine := StyleBoxFlat.new()
		shine.bg_color = LEAF_TOP
		shine.set_corner_radius_all(int(rad * 0.6))
		shine.anti_aliasing = false
		draw_style_box(shine, Rect2(Vector2(rad * 0.6, 4), Vector2(size.x - rad * 1.2, 4)))
	else:
		# Le creux : une ombre interieure en haut.
		draw_rect(Rect2(Vector2(rad * 0.5, 2), Vector2(size.x - rad, 2)), Color(0, 0, 0, 0.25))

	# Le bouton : creme, cerne d'encre, son biseau dessous.
	var kx := _knob_x()
	var ky := (size.y - KNOB) * 0.5
	var knob := StyleBoxFlat.new()
	knob.bg_color = Palette.CREAM
	knob.set_border_width_all(2)
	knob.border_color = Palette.INK
	knob.set_corner_radius_all(6)
	knob.anti_aliasing = false
	knob.shadow_color = Color(0, 0, 0, 0.35)
	knob.shadow_offset = Vector2(0, 2)
	knob.shadow_size = 0
	draw_style_box(knob, Rect2(kx, ky, KNOB, KNOB))
	draw_rect(Rect2(kx + 2, ky + KNOB - 6, KNOB - 4, 4), Palette.WELL_LIP)
	draw_rect(Rect2(kx + 4, ky + 4, KNOB - 8, 2), Color.WHITE)
