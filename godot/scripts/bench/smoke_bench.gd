extends Node2D
## LE BANC DE LA FUMEE : un raid sur le terrier d'un defenseur qui a achete
## l'ecran de fumee, vu du cote du pillard — le plateau, le HUD du raid et sa
## ligne « Smoke », et le lapin qui marche vers le potager en boucle.
##
## La fumee n'a pas de dessin a elle : pas de chiffres (le serveur envoie
## `clue: null`, raid.ts `raiderView`), seules les cases foulees se nettoient,
## pas de « ? » sur les pas (burrow.gd `_raid_sight`, raid_board.gd), et le
## nuage dans le HUD. D'ou la bascule : on la voit en la retirant.
##
##   godot --path godot scenes/bench/smoke_bench.tscn
##   ... -- --clear                     # demarre sans fumee
##   ... -- --shot=smoke.png --after=4
##
##   S ou clic : fumee on / off        R : la marche reprend a la porte
##
## `RaidState.fake` coupe le reseau : aucun pas ne part vers ws.rabbit.rip.

const BOARD := preload("res://scripts/bench/raid_board_bench.gd")
const DEFENDER := "thistle"
const STEP_SECONDS := 0.8
const MAX_STEPS := 9
const PAUSE_AT_END := 1.6

var _smoked := true
var _layout: BurrowLayout
var _walked: Array = []
var _run := 0
var _legend: Label


func _ready() -> void:
	_smoked = not ("--clear" in OS.get_cmdline_user_args())
	Session.player = {"id": "burrow"}
	ShopState.shared().fake([], {"held": 3, "maxPlaced": 8})

	add_child(preload("res://scenes/burrow.tscn").instantiate())

	# Le HUD du raid, pose comme le chrome le pose : dans un sol de hauteur
	# nulle epingle en bas de l'ecran.
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	var floor_host := Control.new()
	floor_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	floor_host.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	layer.add_child(floor_host)
	floor_host.add_child(preload("res://scenes/ui/raid_hud.tscn").instantiate())

	_legend = Kit.label("", 14, Palette.CHALK)
	_legend.add_theme_color_override("font_outline_color", Color.BLACK)
	_legend.add_theme_constant_override("outline_size", 6)
	_legend.position = Vector2(Kit.EDGE, Kit.EDGE)
	layer.add_child(_legend)

	DevShot.arm(self)
	await get_tree().create_timer(0.3).timeout
	_layout = BurrowLayout.of(DEFENDER)
	_walk()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match (event as InputEventKey).keycode:
			KEY_S:
				_toggle()
			KEY_R:
				_walk()
	elif event is InputEventMouseButton and event.pressed \
			and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		_toggle()


func _toggle() -> void:
	_smoked = not _smoked
	_push()


## LA MARCHE, de la porte vers le potager, case voisine par case voisine.
## Un compteur de tour : R relance sans attendre que l'ancienne finisse.
func _walk() -> void:
	_run += 1
	var run := _run
	while run == _run:
		_walked = [_layout.entrance]
		_push()
		var goal := BurrowLayout.cell_of(_layout.field[0])
		for i in MAX_STEPS:
			await get_tree().create_timer(STEP_SECONDS).timeout
			if run != _run:
				return
			var steps: Array = _raid()["steps"]
			if steps.is_empty():
				break
			steps.sort_custom(func(a: int, b: int) -> bool:
				return BurrowLayout.cell_of(a).distance_squared_to(goal) \
					< BurrowLayout.cell_of(b).distance_squared_to(goal))
			_walked.append(steps[0])
			_push()
		await get_tree().create_timer(PAUSE_AT_END).timeout


func _raid() -> Dictionary:
	return BOARD._raid(_layout, _walked, _smoked)


func _push() -> void:
	RaidState.current.fake({"raid": _raid()})
	_legend.text = "FUMEE : %s     [S / clic] basculer   [R] rejouer" % ("ON" if _smoked else "OFF")
