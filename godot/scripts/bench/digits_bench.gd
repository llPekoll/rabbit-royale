extends "res://scripts/dig_sandbox.gd"
## LES CHIFFRES DU PLATEAU, quatre facons de les peindre sur la vraie ile.
##
##   godot --path godot scenes/bench/digits_bench.tscn
##   godot --path godot scenes/bench/digits_bench.tscn -- --style=4 --size=890x400 --shot=d.png --after=8
##
## « the board seems hard to read to me. I have to pay a lot of attention to
## make out what number is on the tile » — un joueur, 2026-10-13. Le banc est
## le bac a sable (`dig_sandbox.gd`) : meme ile, meme lapin, un pilote qui
## creuse tout seul pour semer des chiffres ; seul le dessin du chiffre change.
##
##   1 ACTUEL   — `TileView._digit_texture` : 3x5 x2, multiply, couche sur le losange
##   2 CONTOUR  — memes teintes, opaques, cernees de brun
##   3 PALETTE  — + des teintes qui ne se perdent pas dans l'herbe (le 2 n'est plus vert)
##   4 DEBOUT   — + plus gros (x3) et debout face a l'ecran, plus couche
##
## Clavier : 1 2 3 4, et ceux du bac a sable (N, R, T, X).

const NAMES := ["ACTUEL", "CONTOUR", "PALETTE", "DEBOUT"]

## Le brun du contour : celui des planches du kit, pas un noir qui troue.
const OUTLINE := Color("#2b1a0e")

## Des teintes qui tiennent sur l'herbe, le sable et la terre : aucune ne
## tombe dans le vert du gazon.
const BRIGHT := [
	Color("#ffffff"), Color("#5ab0ff"), Color("#ffd23a"), Color("#ff5a5a"),
	Color("#d08cff"), Color("#ff9a3a"), Color("#4fe3e3"), Color("#ffffff"),
	Color("#c8c8c8"),
]

var _style := 0
var _cache := {}
var _buttons: Array = []
var _caption: Label
## Vrai des qu'une capture (`--shot`) a fixe le style.
var _locked := false


func _ready() -> void:
	super._ready()
	var args := _args()
	_style = clampi(int(args.get("style", "1")) - 1, 0, NAMES.size() - 1)
	# LE PILOTE PART TOUT SEUL : sans chiffres, rien a comparer.
	if not args.has("auto"):
		_auto_left = 90
		var tick := Timer.new()
		tick.wait_time = 0.06
		tick.autostart = true
		tick.timeout.connect(_auto_step)
		add_child(tick)
	_build_switch()
	_select(_style)
	_locked = args.has("shot")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var k: int = event.keycode - KEY_1
		if k >= 0 and k < NAMES.size():
			_select(k)
			return
	super._unhandled_input(event)


## LE PLATEAU REPEINT SES CHIFFRES a chaque pas (`TileView._paint`) : le banc
## repasse derriere lui a chaque image. Quelques centaines de sprites, rien.
func _process(_delta: float) -> void:
	if _style == 0 or _island == null:
		return
	var tiles: TileView = _island.get("_tiles")
	var board := _island.local_run.board if _island.local_run != null else null
	if tiles == null or board == null:
		return
	var hints: Dictionary = tiles.get("_hints")
	for cell in hints:
		var glyph: Sprite2D = hints[cell]
		if not glyph.visible:
			continue
		var tex := _texture(int(board.adjacent[cell]))
		if glyph.texture != tex:
			glyph.texture = tex
			glyph.material = null
			_stand(glyph)


func _select(k: int) -> void:
	# UNE CAPTURE GARDE SON STYLE : la fenetre prend le focus pendant qu'on
	# tape ailleurs, et un chiffre tape ou un clic perdu changeait de style.
	if _locked:
		return
	_style = k
	for i in _buttons.size():
		(_buttons[i] as Control).modulate = Color.WHITE if i == k else Color(1, 1, 1, 0.55)
	_caption.text = "%d  %s" % [k + 1, NAMES[k]]
	var tiles: TileView = _island.get("_tiles")
	var hints: Dictionary = tiles.get("_hints")
	var board := _island.local_run.board
	for cell in hints:
		var glyph: Sprite2D = hints[cell]
		glyph.transform = Transform2D.IDENTITY
		if k == 0:
			glyph.material = TileView._mul_material()
			if glyph.visible:
				glyph.texture = TileView._digit_texture(int(board.adjacent[cell]))
		else:
			# Force le repassage de `_process`.
			glyph.texture = null if glyph.visible else glyph.texture


## DEBOUT : le parent est incline sur les diagonales du losange ; on lui rend
## son inverse, le chiffre se tient droit face a l'ecran, toujours centre.
func _stand(glyph: Sprite2D) -> void:
	if _style < 3:
		glyph.transform = Transform2D.IDENTITY
		return
	var skew: Transform2D = (glyph.get_parent() as Node2D).transform
	var inv := Transform2D(skew.x, skew.y, Vector2.ZERO).affine_inverse()
	glyph.transform = inv


func _texture(n: int) -> ImageTexture:
	var key := "%d:%d" % [_style, n]
	if _cache.has(key):
		return _cache[key]
	var px := 3 if _style >= 3 else 2
	var tints: Array = BRIGHT if _style >= 2 else TileView.TINTS
	var tex := _bake(clampi(n, 1, 8), px, tints[mini(n, tints.size() - 1)])
	_cache[key] = tex
	return tex


## Le glyphe 3x5 du jeu (`TileView.DIGITS`), face pleine et contour d'un pixel
## tout autour — les huit voisins, comme l'anneau du jeu, mais SOMBRE et opaque.
static func _bake(n: int, px: int, face: Color) -> ImageTexture:
	var rows: Array = TileView.DIGITS[n]
	var w := 3 * px + 2
	var h := rows.size() * px + 2
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for pass_face in [false, true]:
		for y in rows.size():
			var row: String = rows[y]
			for x in 3:
				if row[x] != "1":
					continue
				var grow := 0 if pass_face else 1
				for dy in range(-grow, px + grow):
					for dx in range(-grow, px + grow):
						img.set_pixel(1 + x * px + dx, 1 + y * px + dy, face if pass_face else OUTLINE)
	return ImageTexture.create_from_image(img)


# ---------------------------------------------------------------- l'aiguillage

func _build_switch() -> void:
	var root: Control = _panel.get_parent()
	var bar := Kit.panel(Kit.style_glass())
	# A DROITE, sous les boutons du haut : le centre est au lapin.
	bar.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	bar.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	bar.offset_right = -Kit.EDGE
	bar.offset_top = Kit.TOPBAR_H + Kit.EDGE
	root.add_child(bar)
	var box := Kit.vbox(4.0)
	bar.add_child(box)
	_caption = Kit.label("", 13, Palette.CREAM)
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_caption)
	for i in NAMES.size():
		var b := Kit.button("%d %s" % [i + 1, NAMES[i]], "gold" if i == 0 else "green", 132.0, 28.0)
		var at := i
		b.pressed.connect(func() -> void: _select(at))
		box.add_child(b)
		_buttons.append(b)
