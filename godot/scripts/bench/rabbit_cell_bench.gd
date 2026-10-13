extends "res://scripts/dig_sandbox.gd"
## LE CHIFFRE DE LA CASE OU SE TIENT LE LAPIN, quatre facons de le montrer.
##
##   godot --path godot scenes/bench/rabbit_cell_bench.tscn
##   godot --path godot scenes/bench/rabbit_cell_bench.tscn -- --style=2 --size=890x400 --shot=r.png --after=8
##
## Le lapin s'assoit sur sa case et cache son chiffre — celui qui decide du
## prochain pas (2026-10-13). Le banc est le bac a sable : meme ile, un pilote
## qui creuse tout seul puis s'arrete ; on continue a la main, au clic. Le chiffre du jeu ne change pas : seul ce qui le
## REPETE pour la case du lapin change.
##
##   1 ACTUEL  — rien : le chiffre est sous le lapin
##   2 BULLE   — une pastille au-dessus de la tete, toujours la
##   3 DEVANT  — le chiffre glisse a la pointe avant de la case, par-dessus le
##               lapin. RETENU, c'est celui du jeu (island.gd `_update_front`)
##   4 POP     — la pastille saute a l'atterrissage et s'efface apres 1,5 s
##
## Clavier : 1 2 3 4, et ceux du bac a sable (N, R, T, X).

const NAMES := ["ACTUEL", "BULLE", "DEVANT", "POP"]

## La pastille : le creme et le brun des planches du kit.
const BADGE_FILL := Color("#f6ecd0")
const BADGE_RIM := Color("#2b1a0e")
const BADGE_SIZE := Vector2(14, 18)
## Au-dessus des oreilles, en pixels du monde depuis les pieds.
const BADGE_RISE := 30.0
const POP_HOLD := 1.5
const POP_FADE := 0.3

var _style := 0
var _buttons: Array = []
var _caption: Label
## Vrai des qu'une capture (`--shot`) a fixe le style.
var _locked := false
var _badge: Node2D
var _badge_digit: Sprite2D
var _last_cell := Vector2i(-99, -99)
var _last_n := -1
var _pop: Tween


func _ready() -> void:
	# Le pilote tire au hasard : graine fixe, le lapin finit au meme endroit
	# d'un style a l'autre, et les captures se comparent.
	seed(int(_args().get("walk", "7")))
	super._ready()
	var args := _args()
	_style = clampi(int(args.get("style", "1")) - 1, 0, NAMES.size() - 1)
	# LE PILOTE SEME QUELQUES CHIFFRES puis rend la main.
	if not args.has("auto"):
		_auto_left = 25
		var tick := Timer.new()
		tick.wait_time = 0.12
		tick.autostart = true
		tick.timeout.connect(_auto_step)
		add_child(tick)
	_build_marks()
	_build_switch()
	_select(_style)
	_locked = args.has("shot")


## LE PILOTE S'ARRETE SUR UN CHIFFRE : au-dela de quelques pas, la premiere
## case qui en porte un le retient — sinon la capture tombe sur un zero.
func _auto_step() -> void:
	var run := _island.local_run
	if run != null and _auto_left > 0 and _auto_left < 25 - 10:
		var at: Vector2i = run.at
		if run.board.shows_number(at) and int(run.board.adjacent.get(at, 0)) > 0:
			_auto_left = 0
			return
	super._auto_step()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var k: int = event.keycode - KEY_1
		if k >= 0 and k < NAMES.size():
			_select(k)
			return
	super._unhandled_input(event)


func _build_marks() -> void:
	# LA PASTILLE : un rectangle creme cerne de brun, le chiffre du jeu dedans
	# en melange normal — sa teinte cuite se lit sur le creme.
	_badge = Node2D.new()
	_badge.z_as_relative = false
	_badge.z_index = 4000
	_badge.visible = false
	_badge.draw.connect(func() -> void:
		var r := Rect2(-BADGE_SIZE * 0.5, BADGE_SIZE)
		_badge.draw_rect(r.grow(1.0), BADGE_RIM)
		_badge.draw_rect(r, BADGE_FILL)
		# La pointe, vers le lapin.
		_badge.draw_colored_polygon(PackedVector2Array([
			Vector2(-3, BADGE_SIZE.y * 0.5), Vector2(3, BADGE_SIZE.y * 0.5),
			Vector2(0, BADGE_SIZE.y * 0.5 + 3)]), BADGE_FILL))
	_island.add_child(_badge)
	_badge_digit = Sprite2D.new()
	_badge_digit.centered = true
	_badge.add_child(_badge_digit)


func _process(_delta: float) -> void:
	var run := _island.local_run
	if run == null or _island.get("_rabbit") == null:
		return
	var rabbit: Node2D = _island.get("_rabbit")
	var cell: Vector2i = rabbit.call("at")
	var board := run.board
	var n := int(board.adjacent.get(cell, 0)) if board.shows_number(cell) else 0

	if cell != _last_cell or n != _last_n:
		var landed := cell != _last_cell
		_last_cell = cell
		_last_n = n
		if n > 0:
			_badge_digit.texture = TileView._digit_texture(n)
		if _style == 3 and landed and n > 0:
			_pop_badge()

	# La pastille suit le SPRITE (le saut compris), pas la case.
	var sprite: Node2D = rabbit.get("_sprite")
	var feet: Vector2 = sprite.global_position if sprite != null else rabbit.global_position
	_badge.global_position = feet + Vector2(0, -BADGE_RISE) * _island.scale.y

	match _style:
		1:
			_badge.visible = n > 0
			_badge.modulate.a = 1.0
		3:
			if n == 0:
				_badge.visible = false
		_:
			_badge.visible = false


func _pop_badge() -> void:
	if _pop != null and _pop.is_valid():
		_pop.kill()
	_badge.visible = true
	_badge.modulate.a = 1.0
	_badge_digit.scale = Vector2.ZERO
	_pop = create_tween()
	_pop.tween_property(_badge_digit, "scale", Vector2.ONE, 0.18) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_pop.tween_interval(POP_HOLD)
	_pop.tween_property(_badge, "modulate:a", 0.0, POP_FADE)
	_pop.tween_callback(func() -> void: _badge.visible = false)


func _select(k: int) -> void:
	# UNE CAPTURE GARDE SON STYLE : la fenetre prend le focus pendant qu'on
	# tape ailleurs, et un chiffre tape ou un clic perdu changeait de style.
	if _locked:
		return
	_style = k
	# DEVANT est celui du jeu (island.gd `_update_front`), allume ici seulement.
	_island.front_on = k == 2
	_last_cell = Vector2i(-99, -99)
	_badge_digit.scale = Vector2.ONE
	if _pop != null and _pop.is_valid():
		_pop.kill()
	for i in _buttons.size():
		(_buttons[i] as Control).modulate = Color.WHITE if i == k else Color(1, 1, 1, 0.55)
	_caption.text = "%d  %s" % [k + 1, NAMES[k]]


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
