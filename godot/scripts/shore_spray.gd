extends Node2D
class_name ShoreSpray
## LES GOUTTES D'ECUME au pied d'une case de rivage : des pixels de houle qui
## sautent de la terre vers le large, retombent et s'effacent.
##
## Le trait sombre du bas de la motte est retire cote mer
## (`BurrowTerrain._open_shore`) ; ces gouttes sont ce qui dit, a sa place,
## que l'eau touche la terre.
##
## Seulement les deux cotes que la camera voit : le sud (`row + 1`, face gauche)
## et l'est (`col + 1`, face droite). Le nord et l'ouest sont derriere la case.

## Gouttes par seconde et par face.
const RATE := 5.0
const LIFE := 0.9
## Jusqu'ou une goutte s'eloigne du pied, en pixels d'art.
const REACH := 5.0

var cell: Vector2i
## Les cotes qui donnent sur la mer.
var south := false
var east := false
## La largeur d'un pixel d'art, en pixels d'ecran (l'agrandissement du sol).
var px := 1.0

var _drops: Array[Dictionary] = []
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.seed = hash(cell)


func _process(delta: float) -> void:
	var alive: Array[Dictionary] = []
	for d in _drops:
		d.age += delta
		if d.age < d.life:
			alive.append(d)
	_drops = alive
	for face in [0, 1]:
		if (face == 0 and not south) or (face == 1 and not east):
			continue
		if _rng.randf() < RATE * delta:
			_drops.append({
				"face": face, "t": _rng.randf_range(0.05, 0.95), "age": 0.0,
				"life": LIFE * _rng.randf_range(0.6, 1.3),
				"reach": REACH * _rng.randf_range(0.4, 1.0),
				"hop": _rng.randf_range(1.0, 3.0),
			})
	queue_redraw()


func _draw() -> void:
	var hw := Iso.half_w()
	var hh := Iso.half_h()
	var foam: Color = WaterLook.FOAM["color"]
	for d in _drops:
		var k: float = d.age / d.life
		var a: Vector2
		var b: Vector2
		var out: Vector2
		if d.face == 0:
			a = Vector2(-hw, hh)
			b = Vector2(0, 2.0 * hh)
			out = Vector2(-hw, hh).normalized()
		else:
			a = Vector2(0, 2.0 * hh)
			b = Vector2(hw, hh)
			out = Vector2(hw, hh).normalized()
		var at: Vector2 = a.lerp(b, d.t) + out * d.reach * px * k
		# Un petit saut : monte puis retombe dans l'eau.
		at.y -= d.hop * px * 4.0 * k * (1.0 - k)
		var c := foam
		c.a = 1.0 - k * k
		draw_rect(Rect2(_snap(at.x), _snap(at.y), px, px), c)


## En pixels d'art : une goutte ne se pose jamais entre deux.
func _snap(v: float) -> float:
	return round(v / px) * px
