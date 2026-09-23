extends RefCounted
class_name Electrocute
## L'ELECTROCUTION DE STREET FIGHTER, sur un lapin — porte de
## src/game/fx/Electrocute.ts.
##
## La victime ne joue pas une animation, elle est TENUE dedans : un eclair
## tombe sur elle, son art est remplace par un squelette a deux images qui
## gresille et tremble tant que le courant passe, puis le courant coupe et
## elle tombe. Dans l'ordre ou on le sent :
##
##   • L'ECLAIR, la grande frappe de l'ile (195x220, 27 images a 24 i/s),
##     ancre au PIED sur la case : l'eclaboussure tombe aux pattes.
##   • LA POSE, posee quelques images plus tard (l'image 5, ou l'eclair
##     touche) : un lapin qui s'allume avant d'etre frappe se lit comme deux
##     effets qui se sont rates.
##   • LE TREMBLEMENT, deux pixels de chaque cote.
##   • LA CHUTE. Fatal : le rang `death`, puis le corps laisse un temps.
##     Survivable : le sursaut, et debout.

const BOLT := preload("res://assets/fx/lightning-bolt.webp")
const BOLT_FRAME := Vector2i(195, 220)
const BOLT_COLS := 6
const BOLT_FRAMES := 27
const BOLT_FPS := 24.0
const BOLT_LANDS_FRAME := 5
## Moitie de son art : a 1:1 la frappe fait trois lapins de haut.
const BOLT_SCALE := 0.5

## La pose : deux images de 32 dans une planche Aseprite a bordure d'un pixel
## (rectangles de 34 pour de l'art de 32) — decoupees sur le JSON, pas sur
## `i * 32`, qui glisserait d'un pixel par image.
const POSE := preload("res://assets/bunnies/electrocuted.png")
const POSE_RECTS := [Rect2(2, 2, 32, 32), Rect2(37, 2, 32, 32)]
const POSE_FPS := 16.0

## Le corps reste a terre apres le rang `death`, en secondes.
const DEATH_HOLD := 0.9

static var _bolt_frames: SpriteFrames
static var _pose_frames: SpriteFrames


## FRAPPE `rabbit`. `host` porte l'eclair (le meme parent que le lapin, pour
## qu'il se trie avec lui) ; rend la main quand le corps est tombe (ou que le
## lapin s'est releve).
static func strike(rabbit: HomeRabbit, host: Node2D, hold: float = 1.4,
		fatal: bool = true) -> void:
	if rabbit == null or not is_instance_valid(rabbit):
		return
	var tree := rabbit.get_tree()
	while is_instance_valid(rabbit) and rabbit.hopping():
		await tree.process_frame
	if not is_instance_valid(rabbit):
		return

	var bolt := AnimatedSprite2D.new()
	bolt.sprite_frames = _bolts()
	bolt.centered = false
	bolt.offset = Vector2(-BOLT_FRAME.x * 0.5, -BOLT_FRAME.y)
	bolt.scale = Vector2(BOLT_SCALE, BOLT_SCALE)
	bolt.position = rabbit.position
	bolt.z_index = rabbit.z_index + 2
	host.add_child(bolt)
	bolt.animation_finished.connect(bolt.queue_free)
	bolt.play("strike")
	Sound.play("explosion")

	await tree.create_timer(BOLT_LANDS_FRAME / BOLT_FPS).timeout
	if not is_instance_valid(rabbit):
		return

	# Ancree comme le lapin (pieds a l'origine, echelle du lapin).
	var shock := AnimatedSprite2D.new()
	shock.sprite_frames = _poses()
	shock.centered = false
	shock.offset = Vector2(-16, -32)
	shock.scale = Vector2(HomeRabbit.RABBIT_SCALE, HomeRabbit.RABBIT_SCALE)
	rabbit.hide_sprite(true)
	rabbit.add_child(shock)
	shock.play("shock")
	var rattle := shock.create_tween().set_loops()
	rattle.tween_property(shock, "position:x", 2.0, 0.04)
	rattle.tween_property(shock, "position:x", 0.0, 0.04)

	await tree.create_timer(hold).timeout
	if not is_instance_valid(rabbit):
		return
	rattle.kill()
	shock.queue_free()
	rabbit.hide_sprite(false)

	if not fatal:
		rabbit.take_hit(rabbit.position + Vector2(0, 10))
		return
	var fell := [false]
	rabbit.die(func() -> void: fell[0] = true)
	# Un plancher sous le rappel du rang : six images a 8 i/s.
	var waited := 0.0
	while not fell[0] and waited < 1.2 and is_instance_valid(rabbit):
		await tree.process_frame
		waited += rabbit.get_process_delta_time()
	await tree.create_timer(DEATH_HOLD).timeout


static func _bolts() -> SpriteFrames:
	if _bolt_frames != null:
		return _bolt_frames
	_bolt_frames = SpriteFrames.new()
	_bolt_frames.remove_animation("default")
	_bolt_frames.add_animation("strike")
	_bolt_frames.set_animation_speed("strike", BOLT_FPS)
	_bolt_frames.set_animation_loop("strike", false)
	for i in range(BOLT_FRAMES):
		var f := AtlasTexture.new()
		f.atlas = BOLT
		f.region = Rect2((i % BOLT_COLS) * BOLT_FRAME.x, (i / BOLT_COLS) * BOLT_FRAME.y,
			BOLT_FRAME.x, BOLT_FRAME.y)
		_bolt_frames.add_frame("strike", f)
	return _bolt_frames


static func _poses() -> SpriteFrames:
	if _pose_frames != null:
		return _pose_frames
	_pose_frames = SpriteFrames.new()
	_pose_frames.remove_animation("default")
	_pose_frames.add_animation("shock")
	_pose_frames.set_animation_speed("shock", POSE_FPS)
	_pose_frames.set_animation_loop("shock", true)
	for r in POSE_RECTS:
		var f := AtlasTexture.new()
		f.atlas = POSE
		f.region = r
		_pose_frames.add_frame("shock", f)
	return _pose_frames
