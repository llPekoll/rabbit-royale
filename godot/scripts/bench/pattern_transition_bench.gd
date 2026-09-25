extends Control
## LE BANC DE LA TRANSITION PAR MOTIF — shaders/pattern_transition.gdshader.
##
##   godot --path godot scenes/bench/pattern_transition_bench.tscn
##   godot --path godot scenes/bench/pattern_transition_bench.tscn -- --progress=0.5 --shot=/tmp/t.png --after=1
##
## Un fond (l'ecran d'accueil) recouvert par un ColorRect qui porte le shader.
## Tout se regle en direct : motif, forme du front, couleur, largeur, taille et
## grossissement des tuiles, aller-retour (closing), sans distorsion.
## Espace = jouer, fleches gauche/droite = avancer a la main.

const SHADER := preload("res://shaders/pattern_transition.gdshader")
const BG := preload("res://assets/ui/home-bg.webp")
const TEX := 256

const TILES := ["carre", "rond", "losange", "etoile", "carotte", "coeur", "bombe"]
const ICONS := {
	"carotte": "res://assets/ui/icons/carrot.webp",
	"coeur": "res://assets/ui/heart.png",
	"bombe": "res://assets/ui/icons/bomb.png",
}
const FRONTS := ["gauche → droite", "haut → bas", "diagonale", "centre → bords", "bords → centre", "bruit", "spirale"]
const COLORS := {
	"nuit": Color(0.09, 0.08, 0.16),
	"creme": Color(0.98, 0.93, 0.8),
	"orange": Color(0.95, 0.5, 0.15),
	"blanc (motif brut)": Color(1, 1, 1),
}

var _rect: ColorRect
var _mat: ShaderMaterial
var _progress: HSlider
var _readout: Label
var _tween: Tween
var _duration := 1.2


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := TextureRect.new()
	bg.texture = BG
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_rect = ColorRect.new()
	_rect.material = _mat
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rect)

	_build_ui()
	_set_tile(0)
	_set_front(0)
	_set_color(0)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--progress="):
			_progress.value = float(arg.trim_prefix("--progress="))
	DevShot.arm(self)


func _unhandled_key_input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k == null or not k.pressed:
		return
	match k.keycode:
		KEY_SPACE:
			_play()
		KEY_RIGHT:
			_progress.value += 0.02
		KEY_LEFT:
			_progress.value -= 0.02


# --- UI ---------------------------------------------------------------------

func _build_ui() -> void:
	var ui := CanvasLayer.new()
	ui.layer = 50
	add_child(ui)
	var panel := PanelContainer.new()
	panel.position = Vector2(12, 12)
	ui.add_child(panel)
	var box := VBoxContainer.new()
	box.custom_minimum_size.x = 300
	box.add_theme_constant_override("separation", 4)
	panel.add_child(box)

	var row := HBoxContainer.new()
	box.add_child(row)
	for spec in [["▶ couvrir", _play_to.bind(1.0)], ["◀ decouvrir", _play_to.bind(0.0)], ["aller-retour", _play]]:
		var b := Button.new()
		b.text = spec[0]
		b.pressed.connect(spec[1])
		row.add_child(b)

	_readout = Label.new()
	box.add_child(_readout)
	_progress = _slider(box, "progress", 0.0, 1.0, 0.001, 0.0)

	_option(box, "motif", TILES, _set_tile)
	_option(box, "front", FRONTS, _set_front)
	_option(box, "couleur", COLORS.keys(), _set_color)
	_slider(box, "width", 0.01, 1.0, 0.01, 0.5)
	_slider(box, "tile_pixel_size", 8.0, 128.0, 1.0, 32.0)
	_slider(box, "tile_grown_scale", 0.5, 6.0, 0.05, 2.0)
	_slider(box, "", 0.2, 4.0, 0.05, _duration, func(v: float) -> void: _duration = v, "duree (s)")
	_check(box, "closing")
	_check(box, "remove_distortion")


func _slider(box: Container, param: String, lo: float, hi: float, step: float, value: float,
		on_change: Callable = Callable(), title := "") -> HSlider:
	var label := Label.new()
	box.add_child(label)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	box.add_child(s)
	var name := title if title != "" else param
	s.value_changed.connect(func(v: float) -> void:
		label.text = "%s : %s" % [name, snappedf(v, step)]
		if param != "":
			_mat.set_shader_parameter(param, v)
		if on_change.is_valid():
			on_change.call(v))
	s.value = value
	s.value_changed.emit(value)
	return s


func _option(box: Container, title: String, items: Array, on_pick: Callable) -> void:
	var row := HBoxContainer.new()
	box.add_child(row)
	var label := Label.new()
	label.text = title
	label.custom_minimum_size.x = 70
	row.add_child(label)
	var o := OptionButton.new()
	o.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for item in items:
		o.add_item(item)
	o.item_selected.connect(on_pick)
	row.add_child(o)


func _check(box: Container, param: String) -> void:
	var c := CheckBox.new()
	c.text = param
	c.toggled.connect(func(on: bool) -> void: _mat.set_shader_parameter(param, on))
	box.add_child(c)


# --- Lecture ----------------------------------------------------------------

func _play_to(target: float) -> void:
	if _tween:
		_tween.kill()
	_tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_tween.tween_property(_progress, "value", target, _duration)


## Couvre puis decouvre ; en mode closing, un seul 0 → 1 fait deja les deux.
func _play() -> void:
	if _tween:
		_tween.kill()
	_progress.value = 0.0
	_tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	if _mat.get_shader_parameter("closing"):
		_tween.tween_property(_progress, "value", 1.0, _duration * 2.0)
	else:
		_tween.tween_property(_progress, "value", 1.0, _duration)
		_tween.tween_interval(0.3)
		_tween.tween_property(_progress, "value", 0.0, _duration)


# --- Textures ---------------------------------------------------------------

func _set_color(i: int) -> void:
	_rect.color = COLORS.values()[i]


func _set_tile(i: int) -> void:
	var kind: String = TILES[i]
	var img: Image
	if ICONS.has(kind):
		img = _padded_icon(ICONS[kind])
	else:
		img = Image.create(64, 64, false, Image.FORMAT_RGBA8)
		for y in 64:
			for x in 64:
				var p := (Vector2(x, y) + Vector2(0.5, 0.5)) / 32.0 - Vector2.ONE
				if _inside(kind, p):
					img.set_pixel(x, y, Color.WHITE)
	_mat.set_shader_parameter("tile_texture", ImageTexture.create_from_image(img))


## Une forme dans [-1, 1]², toujours a l'interieur du cercle 0.9 : le bord de
## l'image reste transparent (repeat_disable etire le dernier pixel).
func _inside(kind: String, p: Vector2) -> bool:
	match kind:
		"rond":
			return p.length() < 0.8
		"losange":
			return absf(p.x) + absf(p.y) < 0.85
		"carre":
			return maxf(absf(p.x), absf(p.y)) < 0.6
		"etoile":
			var a := atan2(p.y, p.x) + PI / 2.0
			var r := 0.45 + 0.4 * pow(absf(cos(a * 2.5)), 3.0)
			return p.length() < r
	return false


## L'icone au centre d'une image plus grande, bord transparent.
func _padded_icon(path: String) -> Image:
	var src := (load(path) as Texture2D).get_image()
	if src.is_compressed():
		src.decompress()
	src.convert(Image.FORMAT_RGBA8)
	var side := int(maxi(src.get_width(), src.get_height()) * 1.3) + 2
	var img := Image.create(side, side, false, Image.FORMAT_RGBA8)
	img.blit_rect(src, Rect2i(Vector2i.ZERO, src.get_size()),
		(Vector2i(side, side) - src.get_size()) / 2)
	return img


func _set_front(i: int) -> void:
	var img := Image.create(TEX, TEX, false, Image.FORMAT_L8)
	var noise := FastNoiseLite.new()
	noise.frequency = 0.012
	for y in TEX:
		for x in TEX:
			var u := Vector2(x, y) / float(TEX - 1)
			var c := u - Vector2(0.5, 0.5)
			var v := 0.0
			match i:
				0: v = u.x
				1: v = u.y
				2: v = (u.x + u.y) * 0.5
				3: v = c.length() / 0.7072
				4: v = 1.0 - c.length() / 0.7072
				5: v = noise.get_noise_2d(x, y) * 0.5 + 0.5
				6: v = fposmod(atan2(c.y, c.x) / TAU + c.length() * 1.5, 1.0)
			img.set_pixel(x, y, Color(v, v, v))
	if i == 5:
		_stretch(img)
	_mat.set_shader_parameter("transition_texture", ImageTexture.create_from_image(img))


## Le bruit ne couvre pas 0..1 : on l'etire, sinon le debut et la fin sont morts.
func _stretch(img: Image) -> void:
	var lo := 1.0
	var hi := 0.0
	for y in TEX:
		for x in TEX:
			var v := img.get_pixel(x, y).r
			lo = minf(lo, v)
			hi = maxf(hi, v)
	for y in TEX:
		for x in TEX:
			var v := inverse_lerp(lo, hi, img.get_pixel(x, y).r)
			img.set_pixel(x, y, Color(v, v, v))
