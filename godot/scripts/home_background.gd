extends Control
## Animate only the artwork; the title controls stay in screen coordinates.
const Motion = preload("res://scripts/home_idle_motion.gd")
const ART_SIZE := Vector2(1672, 940)
const DEPTH := [0.08, 0.18, 0.38, 0.65, 0.65, 1.0]
## The side of one big pixel, in ART pixels: it grows with the cover scale so
## the painting reads as the same pixel art at every window size.
## The Shiro/Kuro artwork already has crisp pixels. Optional extra mosaic only.
@export_range(1.0, 12.0) var art_pixel: float = 1.0
@export_range(30.0, 180.0) var loop_duration: float = 72.0
## ON A PHONE, THE PHONE IS THE CAMERA: tilting it pans the planes, instead
## of the scripted loop. The rest pose follows the hand slowly, so the scene is
## centred however the phone is held. Without a gravity sensor (desktop, web)
## the loop stays.
const TILT_TRAVEL := Vector2(36.0, 14.0)
## Radians of tilt from the rest pose that reach the full travel.
const TILT_RANGE := 0.35
const TILT_ZOOM := 1.15
const TILT_FOLLOW := 6.0
const REST_FOLLOW := 0.35
var elapsed := 0.0
var _rest := Vector3.ZERO
var _tilt := Vector2.ZERO
@onready var layers: Array[Node] = $Layers.get_children()
@onready var pixelate: ColorRect = $Pixelate

func _ready() -> void:
	resized.connect(_compose)
	_compose()

func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	elapsed = fposmod(elapsed + delta, loop_duration)
	_follow_tilt(delta)
	_compose()

func _follow_tilt(delta: float) -> void:
	var g := Input.get_gravity()
	if g.length_squared() < 1.0:
		return
	g = g.normalized()
	if _rest == Vector3.ZERO:
		_rest = g
	_rest = _rest.slerp(g, 1.0 - exp(-REST_FOLLOW * delta)).normalized()
	var target := Vector2(g.x - _rest.x, _rest.y - g.y) / sin(TILT_RANGE)
	target = target.clamp(-Vector2.ONE, Vector2.ONE)
	_tilt = _tilt.lerp(target, 1.0 - exp(-TILT_FOLLOW * delta))

func _compose() -> void:
	if size.x <= 0.0 or size.y <= 0.0:
		return
	var pose := Motion.sample(elapsed, loop_duration)
	if _rest != Vector3.ZERO:
		pose = Vector3(_tilt.x * TILT_TRAVEL.x, _tilt.y * TILT_TRAVEL.y, TILT_ZOOM)
	var travel := Vector2(pose.x, pose.y)
	var cover := maxf(size.x / ART_SIZE.x, size.y / ART_SIZE.y) * pose.z
	for i in layers.size():
		var sprite := layers[i] as Sprite2D
		sprite.position = size * 0.5 - travel * DEPTH[i] * cover
		sprite.scale = Vector2.ONE * cover
	(pixelate.material as ShaderMaterial).set_shader_parameter("block", maxf(1.0, roundf(art_pixel * cover)))
	pixelate.visible = art_pixel > 1.0
