class_name SnackPips
extends Control
## LES SEPT PASTILLES de Snack Time : la semaine d'un coup d'oeil. Prises =
## pleines ; celle qui attend clignote ; la septieme est plus grosse et doree
## — c'est le but, elle doit se voir de loin.

const DOT := 7.0
const BIG := 11.0
const GAP := 3.0
const TAKEN := Color("#3d7a1f")
const EMPTY := Color(0.21, 0.13, 0.07, 0.28)
const RIM := Color("#352011")
const GOLD := Color("#ffc83d")

var _taken := 0
var _ready := false
var _blink := 1.0
var _tween: Tween


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(6.0 * (DOT + GAP) + BIG, BIG)


func show_week(taken: int, ready: bool) -> void:
	_taken = clampi(taken, 0, 6)
	if ready != _ready:
		_ready = ready
		if _tween != null and _tween.is_valid():
			_tween.kill()
		_blink = 1.0
		if ready:
			_tween = create_tween().set_loops()
			_tween.tween_property(self, "_blink", 0.25, 0.4)
			_tween.tween_property(self, "_blink", 1.0, 0.4)
			_tween.tween_callback(queue_redraw)
	queue_redraw()


func _process(_delta: float) -> void:
	if _ready:
		queue_redraw()


func _draw() -> void:
	var cy := size.y * 0.5
	var x := 0.0
	for i in 7:
		var last := i == 6
		var d := BIG if last else DOT
		var c := Vector2(x + d * 0.5, cy)
		var fill := EMPTY
		if i < _taken:
			fill = TAKEN
		elif last:
			fill = GOLD
		if i == _taken and _ready:
			fill = (GOLD if last else TAKEN)
			fill.a = _blink
		draw_circle(c, d * 0.5, fill)
		draw_arc(c, d * 0.5, 0.0, TAU, 16, RIM, 1.0, true)
		x += d + GAP
