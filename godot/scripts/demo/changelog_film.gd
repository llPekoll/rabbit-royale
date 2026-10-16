extends Control
## LE FILM DU CHANGELOG, pour X : le vrai banc (changelog_bench, le vrai
## terrier, les vraies donnees), conduit par la main (BenchHand).
##
##   godot --path godot --write-movie out.avi --fixed-fps 30 --quit-after 240 \
##     scenes/demo/changelog_film.tscn -- --size=1280x720
##
##   0,0 s   le terrier, NEW respire sur la version en bas a droite
##   1,6 s   la main tape la version : QUOI DE NEUF s'ouvre
##   5,8 s   la main tape PLAY : la version redevient discrete
##   8,0 s   fin (la boucle du GIF repart sur le terrier)
##
## Les clics passent par l'entree du jeu, comme un doigt.

const BENCH := preload("res://scenes/bench/changelog_bench.tscn")

var _bench: Node
var _hand: BenchHand


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bench = BENCH.instantiate()
	add_child(_bench)
	_hand = BenchHand.new()
	add_child(_hand)
	_run()


func _run() -> void:
	await get_tree().create_timer(1.6).timeout
	var tag: VersionTag = _bench.get("_tag")
	await _hand.tap(tag.get_global_rect().get_center(), Callable(_bench, "_tap_tag"))
	await get_tree().create_timer(3.8).timeout
	var dialog: Control = _bench.get("_dialog")
	if dialog == null:
		push_error("[film] la modale ne s'est pas ouverte")
		return
	var buttons := dialog.find_children("*", "PlankButton", true, false)
	var play: Control = buttons[buttons.size() - 1]
	var at := play.get_global_rect().get_center()
	await _hand.tap(at, _click.bind(at))


func _click(at: Vector2) -> void:
	var window_at := get_viewport().get_final_transform() * at
	for pressed in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = pressed
		e.position = window_at
		e.global_position = window_at
		Input.parse_input_event(e)
