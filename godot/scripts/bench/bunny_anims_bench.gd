extends Node2D
## LE BANC DES ANIMATIONS DU LAPIN : les sept rangees de la planche, cote a
## cote, telles que le jeu les joue — meme table (HomeRabbit.ANIMS), memes
## vitesses, meme coupe de `damage` (IslandRabbit.LAST_PAINTED).
##
## En haut a x4 pour lire le pixel, en bas a l'echelle du jeu (RABBIT_SCALE)
## pour juger ce qui se voit vraiment sur l'ile. Les animations sans boucle
## (eat, happy, damage, death) se rejouent apres une pause.
##
##   godot --path godot scenes/bench/bunny_anims_bench.tscn
##   ... -- --sheet=res://assets/bunnies/bunny-white.png
##   ... -- --shot=anims.png --after=2
##
##   C : planche d'origine / planche retouchee     B : fond suivant
##   Espace : pause      fleche droite : image suivante (en pause)

const SHEET := preload("res://assets/bunnies/bunny-black-violet.png")
const BEFORE := preload("res://assets/bunnies/bunny-black.png")
const BIG := 4.0
const REPLAY_PAUSE := 0.8
const BACKGROUNDS: Array[Color] = [Color("#78aa6e"), Color("#3d6f8f"), Color("#e8dcc4"), Color("#1b1a22")]

var _sheet: Texture2D = SHEET
var _sprites: Array[AnimatedSprite2D] = []
var _paused := false
var _bg := 0
var _back: ColorRect
var _legend: Label


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--sheet="):
			_sheet = load(arg.trim_prefix("--sheet="))

	var size := get_viewport_rect().size
	_back = ColorRect.new()
	_back.size = size
	_back.color = BACKGROUNDS[_bg]
	add_child(_back)

	var names: Array = HomeRabbit.ANIMS.keys()
	var step := size.x / names.size()
	for i in names.size():
		var x := step * (i + 0.5)
		_add_rabbit(names[i], Vector2(x, 210), BIG)
		_add_rabbit(names[i], Vector2(x, 320), HomeRabbit.RABBIT_SCALE)
		var def: Array = HomeRabbit.ANIMS[names[i]]
		var last := int(IslandRabbit.LAST_PAINTED.get(names[i], def[1]))
		var tag := Kit.label("%s\n%d-%d  %d fps" % [names[i], def[0], last, def[2]], 11, Palette.CHALK)
		tag.add_theme_color_override("font_outline_color", Color.BLACK)
		tag.add_theme_constant_override("outline_size", 5)
		tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tag.size = Vector2(step, 30)
		tag.position = Vector2(x - step / 2, 222)
		add_child(tag)

	_legend = Kit.label("", 12, Palette.CHALK)
	_legend.add_theme_color_override("font_outline_color", Color.BLACK)
	_legend.add_theme_constant_override("outline_size", 5)
	_legend.position = Vector2(Kit.EDGE, Kit.EDGE)
	add_child(_legend)
	_refresh_legend()

	DevShot.arm(self)


func _add_rabbit(anim: String, feet: Vector2, scale_by: float) -> void:
	var sprite := AnimatedSprite2D.new()
	sprite.sprite_frames = _frames(_sheet)
	sprite.centered = false
	# Les pieds au point pose, comme HomeRabbit.ANCHOR.
	sprite.offset = Vector2(-HomeRabbit.FRAME * HomeRabbit.ANCHOR.x, -HomeRabbit.FRAME * HomeRabbit.ANCHOR.y)
	sprite.scale = Vector2.ONE * scale_by
	sprite.position = feet
	sprite.animation = anim
	add_child(sprite)
	_sprites.append(sprite)
	sprite.animation_finished.connect(func() -> void:
		await get_tree().create_timer(REPLAY_PAUSE).timeout
		if is_instance_valid(sprite) and not _paused:
			sprite.play(anim))
	sprite.play(anim)


## La meme construction que IslandRabbit._frames, sur la planche choisie.
func _frames(sheet: Texture2D) -> SpriteFrames:
	var out := SpriteFrames.new()
	out.remove_animation("default")
	for name in HomeRabbit.ANIMS:
		var def: Array = HomeRabbit.ANIMS[name]
		out.add_animation(name)
		out.set_animation_speed(name, def[2])
		out.set_animation_loop(name, def[3])
		for i in range(def[0], int(IslandRabbit.LAST_PAINTED.get(name, def[1])) + 1):
			var frame := AtlasTexture.new()
			frame.atlas = sheet
			frame.region = Rect2(
				(i % HomeRabbit.SHEET_COLS) * HomeRabbit.FRAME,
				(i / HomeRabbit.SHEET_COLS) * HomeRabbit.FRAME,
				HomeRabbit.FRAME, HomeRabbit.FRAME)
			frame.filter_clip = true
			out.add_frame(name, frame)
	return out


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match (event as InputEventKey).keycode:
		KEY_C:
			_sheet = BEFORE if _sheet == SHEET else SHEET
			for sprite in _sprites:
				var at := sprite.frame
				sprite.sprite_frames = _frames(_sheet)
				sprite.frame = at
				if not _paused:
					sprite.play()
		KEY_B:
			_bg = (_bg + 1) % BACKGROUNDS.size()
			_back.color = BACKGROUNDS[_bg]
		KEY_SPACE:
			_paused = not _paused
			for sprite in _sprites:
				if _paused:
					sprite.pause()
				else:
					sprite.play()
		KEY_RIGHT:
			if _paused:
				for sprite in _sprites:
					sprite.frame = (sprite.frame + 1) % sprite.sprite_frames.get_frame_count(sprite.animation)
	_refresh_legend()


func _refresh_legend() -> void:
	_legend.text = "%s%s\nC origine/retouche   B fond   Espace pause   -> image" % [
		_sheet.resource_path.get_file(), "  (pause)" if _paused else ""]
