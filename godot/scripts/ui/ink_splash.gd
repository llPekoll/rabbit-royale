class_name InkSplash
extends Control
## L'ENCRE DU BLOOP sur MON ecran (2026-09-24), le calmar de Mario Kart.
##
## De grosses taches qui eclatent l'une apres l'autre, coulent lentement vers
## le bas, et s'effacent sur la fin (BLOOP.FADE_MS). Elles cachent une bonne
## part du plateau sans le cacher tout entier : on joue A TRAVERS, on ne
## s'arrete pas — les tapes passent (MOUSE_FILTER_IGNORE). Ce qui pique, c'est
## qu'on ne peut pas rentrer tant qu'elle tient (le serveur refuse `leave`).
##
## Dessine a la main (`draw_circle`) : pas d'art, et une tache doit changer de
## forme a chaque fois, sinon le joueur apprend ou regarder.

const INK := Color("#160d26")
const INK_EDGE := Color("#2b1a47")
const BLOBS := 6
## Rayon d'une tache, en part du petit cote de l'ecran.
const RADIUS_MIN := 0.11
const RADIUS_MAX := 0.19
const SPLAT_S := 0.14
const STAGGER_S := 0.07
## De combien une tache coule sur toute sa vie, en part de la hauteur.
const SLIDE := 0.06

var _blobs: Array = []
var _life_s := 6.0
var _fade_s := 1.5
var _age := 0.0


static func splash(host: Control, ms: int, fade_ms: int) -> InkSplash:
	var ink := InkSplash.new()
	ink.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ink.set_anchors_preset(Control.PRESET_FULL_RECT)
	ink._life_s = ms / 1000.0
	ink._fade_s = minf(fade_ms / 1000.0, ink._life_s)
	host.add_child(ink)
	return ink


func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for i in BLOBS:
		var drops: Array = []
		for j in rng.randi_range(5, 9):
			var a := rng.randf() * TAU
			drops.append({"dir": Vector2.from_angle(a), "dist": rng.randf_range(0.7, 1.35),
				"r": rng.randf_range(0.12, 0.34)})
		var drips: Array = []
		for j in rng.randi_range(1, 3):
			drips.append({"x": rng.randf_range(-0.6, 0.6), "len": rng.randf_range(0.6, 1.6),
				"w": rng.randf_range(0.08, 0.16)})
		_blobs.append({
			# Vers le centre : c'est la qu'on lit le plateau.
			"at": Vector2(rng.randf_range(0.14, 0.86), rng.randf_range(0.2, 0.8)),
			"r": rng.randf_range(RADIUS_MIN, RADIUS_MAX),
			"born": i * STAGGER_S,
			"drops": drops,
			"drips": drips,
		})


func _process(delta: float) -> void:
	_age += delta
	if _age >= _life_s:
		queue_free()
		return
	var fade_from := _life_s - _fade_s
	modulate.a = 1.0 if _age < fade_from else clampf(1.0 - (_age - fade_from) / _fade_s, 0.0, 1.0)
	queue_redraw()


func _draw() -> void:
	var unit := minf(size.x, size.y)
	var slide := size.y * SLIDE * (_age / maxf(_life_s, 0.001))
	for b in _blobs:
		var t := clampf((_age - float(b["born"])) / SPLAT_S, 0.0, 1.0)
		if t <= 0.0:
			continue
		# L'eclat : un peu trop gros d'abord, puis il se pose.
		var grow := t * (1.0 + 0.18 * sin(t * PI))
		var r := float(b["r"]) * unit * grow
		var c := Vector2(b["at"].x * size.x, b["at"].y * size.y + slide)
		for d in b["drips"]:
			var w := r * float(d["w"]) * 2.0
			var x := c.x + float(d["x"]) * r
			var length := r * float(d["len"]) * t
			draw_rect(Rect2(x - w * 0.5, c.y, w, length + slide), INK)
			draw_circle(Vector2(x, c.y + length + slide), w * 0.6, INK)
		draw_circle(c, r * 1.04, INK_EDGE)
		draw_circle(c, r, INK)
		for d in b["drops"]:
			var p: Vector2 = c + (d["dir"] as Vector2) * r * float(d["dist"])
			draw_circle(p, r * float(d["r"]), INK)
