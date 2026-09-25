extends Node2D
## Three standalone studies sharing the same registered image layers.
@export_enum("Pan", "Natural", "Parallax", "Idle loop") var motion_mode: int = 0
@export_range(0.0, 2.0) var motion_strength: float = 1.0
@export_range(0.1, 2.0) var motion_speed: float = 1.0

@export_range(30.0, 180.0) var loop_duration: float = 72.0

const ART_SIZE := Vector2(1672, 940)
const CENTER := ART_SIZE * 0.5
const DEPTH := [0.08, 0.18, 0.38, 0.65, 0.65, 1.0]
const SCENES := ["res://scenes/home_pan.tscn", "res://scenes/home_natural.tscn", "res://scenes/home_parallax.tscn", "res://scenes/home_idle.tscn"]
const TITLES := ["1 · Panoramique lent", "2 · Caméra naturelle", "3 · Parallaxe + zoom", "4 · Boucle vivante · 72 secondes"]
var elapsed := 0.0
var paused := false
var pointer := Vector2.ZERO
var manual_zoom := 0.0
var layers: Array[Node] = []
@onready var camera: Camera2D = $Camera2D
@onready var caption: Label = $HUD/Panel/Caption

func _ready() -> void:
	layers = $Layers.get_children()
	caption.text = TITLES[motion_mode] + "\n1 / 2 / 3 / 4 : comparer · Espace : pause · R : reprendre du début\nMolette : zoom · H : masquer l’aide"
	_update_composition(0.0)

func _process(delta: float) -> void:
	if not paused:
		elapsed += delta * motion_speed
		_update_composition(delta)

func _update_composition(delta: float) -> void:
	var viewport_size := get_viewport_rect().size
	var cover := maxf(viewport_size.x / ART_SIZE.x, viewport_size.y / ART_SIZE.y)
	var target := (get_viewport().get_mouse_position() / viewport_size - Vector2(0.5, 0.5)).clamp(Vector2(-0.5, -0.5), Vector2(0.5, 0.5))
	pointer = pointer.lerp(target, 1.0 - exp(-delta * 3.0))
	var travel := Vector2.ZERO
	var magnification := 1.10
	match motion_mode:
		0:
			# A continuous 28-second pan, easing at each end without a loop cut.
			travel = Vector2(sin(elapsed * TAU / 28.0) * 48.0, sin(elapsed * TAU / 56.0) * 5.0)
			magnification = 1.14
		1:
			# Slow non-identical cycles suggest a floating camera, without roll.
			travel = Vector2(sin(elapsed * 0.19) * 16.0 + sin(elapsed * 0.43) * 3.0, sin(elapsed * 0.23) * 7.0 + sin(elapsed * 0.51) * 2.0)
			magnification = 1.10 + sin(elapsed * 0.16) * 0.009
		2:
			travel = pointer * Vector2(34.0, 20.0) + Vector2(sin(elapsed * 0.18) * 7.0, sin(elapsed * 0.24) * 3.0)
			magnification = 1.10 + (0.5 - 0.5 * cos(elapsed * TAU / 24.0)) * 0.055
		3:
			var pose := preload("res://scripts/home_idle_motion.gd").sample(elapsed, loop_duration)
			travel = Vector2(pose.x, pose.y)
			magnification = pose.z
	travel *= motion_strength
	camera.position = CENTER + travel
	camera.zoom = Vector2.ONE * cover * (magnification + manual_zoom)
	for i in layers.size():
		var sprite := layers[i] as Sprite2D
		# Distant layers partially follow camera, so their apparent travel is smaller.
		sprite.position = CENTER + travel * (1.0 - DEPTH[i])
		# Rabbit and terrain share depth and scale, retaining foot contact.
		sprite.scale = Vector2.ONE

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_1, KEY_2, KEY_3, KEY_4:
				get_tree().change_scene_to_file(SCENES[event.keycode - KEY_1])
			KEY_SPACE:
				paused = not paused
			KEY_H:
				$HUD/Panel.visible = not $HUD/Panel.visible
			KEY_R:
				elapsed = 0.0
				manual_zoom = 0.0
				pointer = Vector2.ZERO
				_update_composition(0.0)
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			manual_zoom = minf(manual_zoom + 0.02, 0.25)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			manual_zoom = maxf(manual_zoom - 0.02, 0.0)
		_update_composition(0.0)
