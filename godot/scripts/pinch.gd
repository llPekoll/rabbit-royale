extends RefCounted
class_name Pinch
## LE PINCEMENT — deux doigts qui rapprochent ou eloignent le plateau.
##
## Le web l'a (`islandCamera.ts`) ; Godot ne le donne pas tout fait sur
## Android, donc on suit les doigts bruts (`InputEventScreenTouch` /
## `ScreenDrag`, chacun avec son `index`) et on en tire, a chaque mouvement,
## un facteur de zoom et un glissement du milieu.
##
## LE PARTAGE AVEC LE GLISSEMENT A UN DOIGT, qui passe par la souris emulee :
## tant que deux doigts sont poses, la souris doit se taire — sinon le plateau
## suit le premier doigt ET le pincement, et saute entre les deux. D'ou
## `active()`, que l'appelant lit avant de glisser, et `ended`, qui lui dit de
## reprendre son ancrage : le doigt qui reste n'est plus la ou le glissement
## avait commence.

var _touches := {}
var _dist := 0.0
var _mid := Vector2.ZERO

## Vrai une fois apres la fin d'un pincement : l'appelant re-ancre son
## glissement sur le doigt restant, puis le remet a faux.
var ended := false


func active() -> bool:
	return _touches.size() >= 2


## Donne un evenement brut. Rend `{factor, mid, delta}` quand deux doigts ont
## bouge, un dictionnaire vide sinon.
func feed(event: InputEvent) -> Dictionary:
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		var was := active()
		if t.pressed:
			_touches[t.index] = t.position
		else:
			_touches.erase(t.index)
		if active():
			_measure()
		elif was:
			ended = true
		return {}
	if event is InputEventScreenDrag:
		var d := event as InputEventScreenDrag
		if not _touches.has(d.index):
			return {}
		_touches[d.index] = d.position
		if not active():
			return {}
		var old_dist := _dist
		var old_mid := _mid
		_measure()
		if old_dist <= 0.0:
			return {}
		return {"factor": _dist / old_dist, "mid": _mid, "delta": _mid - old_mid}
	return {}


## La distance et le milieu des deux premiers doigts.
func _measure() -> void:
	var keys := _touches.keys()
	keys.sort()
	var a: Vector2 = _touches[keys[0]]
	var b: Vector2 = _touches[keys[1]]
	_dist = a.distance_to(b)
	_mid = (a + b) * 0.5


## Le cadrage apres ce pas de pincement : zoom autour du milieu, puis le
## milieu suit les doigts.
static func apply(step: Dictionary, shot: BurrowCamera.Shot, map: BurrowMap,
		view: Vector2) -> BurrowCamera.Shot:
	var zoomed := BurrowCamera.zoom_at(shot, step["factor"], step["mid"], map, view.x, view.y)
	return BurrowCamera.Shot.new(zoomed.scale, zoomed.at + step["delta"])
