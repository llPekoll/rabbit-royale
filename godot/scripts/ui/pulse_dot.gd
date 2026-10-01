class_name PulseDot
extends Control
## UN POINT ROUGE QUI BAT : il y a quelque chose a faire derriere ce bouton
## (le terrier replie, quand l'amelioration est payable — 2026-10-01). Le
## coeur grossit un instant, et un anneau s'en echappe en s'effacant, une
## fois par BEAT.

const BEAT := 1.1
const RED := Color("#e8402c")
const RIM := Color("#fff0cb")

var _t := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_t = fmod(_t + delta, BEAT)
	queue_redraw()


func _draw() -> void:
	var c := size * 0.5
	var r := minf(size.x, size.y) * 0.32
	var p := _t / BEAT
	# L'anneau : de la taille du point a pres du double, en s'effacant.
	draw_arc(c, r * (1.0 + p * 1.1), 0.0, TAU, 24, Color(RED, 0.6 * (1.0 - p)), 2.0)
	# Le coeur : un battement rapide au debut du temps, puis repos.
	var beat := 1.0 + 0.22 * maxf(0.0, sin(minf(p / 0.25, 1.0) * PI))
	draw_circle(c, r * beat + 1.5, RIM)
	draw_circle(c, r * beat, RED)
