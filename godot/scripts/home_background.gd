extends Control
## Animate only the artwork; the title controls stay in screen coordinates.
const Motion = preload("res://scripts/home_idle_motion.gd")
const ART_SIZE := Vector2(1672, 940)
const DEPTH := [0.08, 0.18, 0.38, 0.65, 0.65, 1.0]
@export_range(30.0, 180.0) var loop_duration: float = 72.0
var elapsed := 0.0
@onready var layers: Array[Node] = $Layers.get_children()

func _ready() -> void:
	resized.connect(_compose)
	_compose()

func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	elapsed = fposmod(elapsed + delta, loop_duration)
	_compose()

func _compose() -> void:
	if size.x <= 0.0 or size.y <= 0.0:
		return
	var pose := Motion.sample(elapsed, loop_duration)
	var travel := Vector2(pose.x, pose.y)
	var cover := maxf(size.x / ART_SIZE.x, size.y / ART_SIZE.y) * pose.z
	for i in layers.size():
		var sprite := layers[i] as Sprite2D
		sprite.position = size * 0.5 - travel * DEPTH[i] * cover
		sprite.scale = Vector2.ONE * cover
