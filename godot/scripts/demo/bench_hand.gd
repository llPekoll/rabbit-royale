class_name BenchHand
extends CanvasLayer
## LA MAIN DU JOUEUR, pour les videos (trailer_bench, raid_film_bench) : le
## curseur main du jeu (ui/cursors/hand.png) glisse jusqu'a un point de
## l'ecran, appuie, et le geste part au moment ou le doigt touche. Un rond
## blanc s'ouvre sous le doigt : la tape se voit, meme petite.
##
## Le user, 2026-09-30 : « fais toutes les videos comme ca, ce sera plus
## clair » — et la main a la moitie de sa premiere taille.

const HAND := preload("res://assets/ui/cursors/hand.png")
## Le bout du doigt dans l'image (cursors.gd : le point chaud de la main).
const TIP := Vector2(5, 0)
const SIZE := 1.0
const GLIDE_S := 0.24
const PRESS_S := 0.09
## La courbe du trajet : le creux, en part de la distance, et son plafond.
const SAG := 0.25
const SAG_MAX := 90.0

var _hand: Sprite2D


func _ready() -> void:
	layer = 40
	_hand = Sprite2D.new()
	_hand.texture = HAND
	_hand.centered = false
	_hand.offset = -TIP
	_hand.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_hand.scale = Vector2.ONE * SIZE
	_hand.position = get_viewport().get_visible_rect().size * Vector2(0.62, 0.8)
	add_child(_hand)


## La main va a `at` (coordonnees de l'ecran), appuie, et `then` part.
## `glide_s` et `hover_s` : plus lent, et un temps pose avant d'appuyer, pour
## un geste qu'on doit suivre des yeux.
##
## LE TRAJET S'INCURVE VERS LE BAS (le user, 2026-10-12 : « une legere courbe
## vers le bas pour un mouvement plus naturel ») : une courbe de Bezier dont
## le milieu pend d'un quart de la distance — un poignet, pas une regle.
func tap(at: Vector2, then: Callable, glide_s := GLIDE_S, hover_s := 0.0) -> void:
	var from := _hand.position
	var sag := clampf(from.distance_to(at) * SAG, 0.0, SAG_MAX)
	var bend := (from + at) * 0.5 + Vector2(0, sag)
	var glide := create_tween()
	glide.tween_method(func(t: float) -> void:
		var u := 1.0 - t
		_hand.position = u * u * from + 2.0 * u * t * bend + t * t * at,
		0.0, 1.0, glide_s).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	await glide.finished
	if hover_s > 0.0:
		await get_tree().create_timer(hover_s).timeout
	var press := create_tween()
	press.tween_property(_hand, "scale", Vector2.ONE * SIZE * 0.84, PRESS_S)
	await press.finished
	_ripple(at)
	then.call()
	var up := create_tween()
	up.tween_property(_hand, "scale", Vector2.ONE * SIZE, PRESS_S * 1.4)
	await up.finished


func _ripple(at: Vector2) -> void:
	var ring := Line2D.new()
	ring.width = 1.5
	ring.default_color = Color(1, 1, 1, 0.9)
	var pts := PackedVector2Array()
	for i in 25:
		pts.append(Vector2.from_angle(TAU * i / 24.0) * 4.0)
	ring.points = pts
	ring.position = at
	add_child(ring)
	move_child(ring, 0)
	var t := ring.create_tween().set_parallel(true)
	t.tween_property(ring, "scale", Vector2(3.2, 3.2), 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(ring, "modulate:a", 0.0, 0.35)
	t.set_parallel(true).chain().tween_callback(ring.queue_free)
