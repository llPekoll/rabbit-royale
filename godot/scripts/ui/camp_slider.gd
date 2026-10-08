class_name CampSlider
extends Control
## LA GLISSIERE DU CAMP : la gouttiere sombre, le remplissage orange et le
## bouton creme de la maquette 05. Le doigt la prend n'importe ou et la tire.

signal value_changed(value: float)

const KNOB := preload("res://assets/ui/camp/slider-knob.png")

var value := 0.0
var step := 0.05
var _track: NineSlice
var _fill: NineSlice
var _knob: TextureRect
var _held := false


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_track = CampStyle.band("slider-track", 1.0, 1.0)
	add_child(_track)
	_fill = CampStyle.band("slider-fill", 1.0, 1.0)
	add_child(_fill)
	_knob = CampStyle.picture(KNOB)
	add_child(_knob)
	resized.connect(_layout)


func set_value_no_signal(v: float) -> void:
	value = clampf(v, 0.0, 1.0)
	_layout()


func _pad() -> float:
	return size.y * 0.5


func _gui_input(event: InputEvent) -> void:
	var press: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT
	if press or event is InputEventScreenTouch:
		_held = event.pressed
	if _held and (press or event is InputEventScreenTouch or event is InputEventMouseMotion or event is InputEventScreenDrag):
		var span := maxf(1.0, size.x - _pad() * 2.0)
		var v := snappedf(clampf((event.position.x - _pad()) / span, 0.0, 1.0), step)
		if not is_equal_approx(v, value):
			value = v
			_layout()
			value_changed.emit(value)
		accept_event()


func _layout() -> void:
	if _track == null:
		return
	var h := size.y
	# Les bouts des bandes suivent la hauteur de la gouttiere.
	for band in [_track, _fill]:
		var t: Texture2D = band.texture
		var s := h / float(t.get_height())
		band.edge = Vector4(band.slice.x * s, 0, band.slice.z * s, 0)
	_track.size = size
	var x := _pad() + value * (size.x - _pad() * 2.0)
	_fill.size = Vector2(maxf(x, h), h)
	var kn := h * 1.65
	_knob.size = Vector2(kn, kn)
	_knob.position = Vector2(x - kn * 0.5, (h - kn) * 0.5)
