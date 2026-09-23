extends Node2D
class_name WaterSplash
## UN LAPIN QUI TOMBE A L'EAU — la gerbe, et ce qui reste apres elle.
##
## La planche est celle du web (public/assets/fx/water-splash.webp, neuf
## images de 192), reglee dans Drowning.stories.tsx : une couronne d'eau vue
## d'en haut, jetee dans tous les sens par ce qui est passe au milieu. Autour,
## ce que la planche seule ne dit pas :
##
##   0 ms    LA GERBE, 0,5 s sur ses neuf images — la ponctuation de l'entree,
##           pas un evenement a elle : plus longue, elle serait encore la
##           quand le lapin a deja disparu.
##   0 ms    LES GOUTTES, jetees en cloche et retombant sous la gravite : la
##           planche est plate, les gouttes donnent la hauteur.
##   0 ms    LES RONDS, deux ellipses ISO qui s'elargissent et s'eteignent : un
##           cercle se lirait debout dans l'air, pas couche sur la mer.
##   250 ms  LES BULLES, qui montent tout le temps qu'il est dessous : c'est ce
##           qui dit « il est encore la-dessous » pendant `DROWN.STUN_MS`, au
##           lieu d'une mer vide qui se lirait comme une disparition.

const SHEET := preload("res://assets/fx/water-splash.webp")
const FRAME := 192
const FRAMES := 9
const SECONDS := 0.5
## La surface de l'eau dans une image : le MILIEU de la couronne (y 58..140),
## pas le bas — ancree en bas, toute la gerbe flottait au-dessus de l'entree.
const WATERLINE := 99.0 / 192.0
## Une case d'eau deplacee par un lapin (44 px de losange, `splashScale` 1.25).
const SCALE := 44.0 / 192.0 * 1.25 * 4.0

const FOAM := Color("#e8f7fb")
const SPRAY := Color("#cfeaf2")
const DROPS := 26
const RING_SECONDS := 0.9
const RING_TILES := 1.1
const BUBBLE_EVERY := 0.18


## Joue la chute dans `host`, a `at`, triee a `z`. `under_ms` : combien de
## temps les bulles montent.
static func play(host: Node, at: Vector2, z: int, under_ms: int = 0) -> WaterSplash:
	var s := WaterSplash.new()
	s.position = at
	s.z_index = z
	host.add_child(s)
	s._run(under_ms)
	return s


func _run(under_ms: int) -> void:
	# LES RONDS D'ABORD, sous la gerbe.
	for i in 2:
		var ring := _Ring.new()
		ring.delay = float(i) * 0.18
		add_child(ring)

	var plume := Sprite2D.new()
	plume.texture = SHEET
	plume.hframes = FRAMES
	plume.centered = false
	plume.offset = -Vector2(FRAME * 0.5, FRAME * WATERLINE)
	plume.scale = Vector2(SCALE, SCALE)
	add_child(plume)
	# A L'HORLOGE, pas a la cadence d'images : 0,5 s partout.
	var t := create_tween()
	t.tween_method(func(k: float) -> void: plume.frame = mini(FRAMES - 1, int(round(k))),
		0.0, float(FRAMES - 1), SECONDS)
	t.tween_callback(plume.queue_free)

	add_child(_drops())

	var under := float(under_ms) / 1000.0
	if under > 0.4:
		var bubbles := _bubbles()
		bubbles.position = Vector2(0, -2)
		add_child(bubbles)
		var b := create_tween()
		b.tween_callback(func() -> void: bubbles.emitting = true).set_delay(0.25)
		b.tween_callback(func() -> void: bubbles.emitting = false).set_delay(under - 0.25)

	# Tout est parti quand les bulles le sont ; la gerbe se nettoie seule.
	var life := maxf(RING_SECONDS + 0.4, under + 1.2)
	create_tween().tween_callback(queue_free).set_delay(life)


## LES GOUTTES : une seule bouffee, vers le haut en eventail, retombant sous
## la gravite. Des carres d'un ou deux pixels — l'ile est en pixel art, un
## disque lisse jurerait.
func _drops() -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.amount = DROPS
	p.one_shot = true
	p.explosiveness = 0.92
	p.lifetime = 0.75
	p.local_coords = true
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 6.0
	p.direction = Vector2(0, -1)
	p.spread = 62.0
	p.initial_velocity_min = 70.0
	p.initial_velocity_max = 150.0
	p.gravity = Vector2(0, 360)
	p.scale_amount_min = 1.0
	p.scale_amount_max = 2.5
	var ramp := Gradient.new()
	ramp.set_color(0, FOAM)
	ramp.set_color(1, Color(SPRAY, 0.0))
	p.color_ramp = ramp
	p.emitting = true
	return p


## LES BULLES : peu, lentes, qui montent et s'eteignent sur place.
func _bubbles() -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.amount = int(0.7 / BUBBLE_EVERY) + 1
	p.lifetime = 0.7
	p.local_coords = true
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(7, 2)
	p.direction = Vector2(0, -1)
	p.spread = 10.0
	p.initial_velocity_min = 6.0
	p.initial_velocity_max = 14.0
	p.gravity = Vector2.ZERO
	p.scale_amount_min = 1.0
	p.scale_amount_max = 2.0
	var ramp := Gradient.new()
	ramp.set_color(0, Color(FOAM, 0.9))
	ramp.set_color(1, Color(FOAM, 0.0))
	p.color_ramp = ramp
	p.emitting = false
	return p


## UN ROND DANS L'EAU : l'ellipse ISO (2:1) qui s'elargit en s'eteignant.
class _Ring:
	extends Node2D
	var delay := 0.0
	var _t := -1.0

	func _process(delta: float) -> void:
		_t += delta
		if _t - delay > WaterSplash.RING_SECONDS:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k := (_t - delay) / WaterSplash.RING_SECONDS
		if k < 0.0:
			return
		var ease_k := 1.0 - (1.0 - k) * (1.0 - k)
		var rx := lerpf(6.0, Iso.half_w() * WaterSplash.RING_TILES * 2.0, ease_k)
		var pts := PackedVector2Array()
		for i in 33:
			var a := float(i) / 32.0 * TAU
			pts.append(Vector2(cos(a) * rx, sin(a) * rx * 0.5))
		draw_polyline(pts, Color(WaterSplash.FOAM, 0.8 * (1.0 - k)), 1.5)

	func _ready() -> void:
		_t = 0.0
