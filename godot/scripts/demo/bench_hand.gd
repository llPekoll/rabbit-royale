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
const GLIDE_S := 0.32
const PRESS_S := 0.09

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
func tap(at: Vector2, then: Callable) -> void:
	var glide := create_tween()
	glide.tween_property(_hand, "position", at, GLIDE_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	await glide.finished
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
