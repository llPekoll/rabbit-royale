extends "res://scripts/dig_sandbox.gd"
## UN DECOR QUI CACHE UN CHIFFRE SE LAISSE VOIR AU TRAVERS — avant / apres.
##
##   godot --path godot scenes/bench/decor_veil_bench.tscn
##   godot --path godot scenes/bench/decor_veil_bench.tscn -- --veil=1 --size=890x400 --shot=v.png --after=8
##   godot --path godot scenes/bench/decor_veil_bench.tscn -- --size=1335x600 --pair=/tmp/v
##
## « le decor gene pas mal la visibilite » (2026-10-13). Le voile est celui du
## jeu (island.gd `_update_veil`) : le banc ne fait que l'allumer et l'eteindre
## (`Island.veil_on`). Avant lui, seul ce qui couvrait le LAPIN se percait.
##
## Le banc est le bac a sable : un pilote creuse tout seul pour semer des
## chiffres, puis on joue au clic.
##
## Clavier : 1 AVANT, 2 APRES, [ ] la part effacee, D montre en rouge les
## arbres trames, et ceux du bac a sable.

const NAMES := ["AVANT", "APRES"]

var _veil := 1
var _amount := Island.VEIL_AMOUNT
## D : les arbres trames passent au rouge, pour les reperer.
var _spot := false
var _tinted: Array = []
var _buttons: Array = []
var _caption: Label
## Vrai des qu'une capture (`--shot`) a fixe le style.
var _locked := false


func _ready() -> void:
	seed(int(_args().get("walk", "7")))
	super._ready()
	var args := _args()
	_veil = clampi(int(args.get("veil", "1")), 0, 1)
	if not args.has("auto"):
		_auto_left = 90
		var tick := Timer.new()
		tick.wait_time = 0.06
		tick.autostart = true
		tick.timeout.connect(_auto_step)
		add_child(tick)
	_build_switch()
	_select(_veil)
	_locked = args.has("shot")
	# `--pair=chemin` : la MEME image deux fois, voile coupe puis mis —
	# `chemin-avant.png`, `chemin-apres.png`. Le pilote s'arrete avant.
	if args.has("pair"):
		_pair(String(args["pair"]), float(args.get("pair-after", "7")))


func _pair(base: String, after: float) -> void:
	await get_tree().create_timer(after).timeout
	_auto_left = 0
	await get_tree().create_timer(1.0).timeout
	for k in 2:
		_select(k)
		for i in 3:
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var path := "%s-%s.png" % [base, "avant" if k == 0 else "apres"]
		get_viewport().get_texture().get_image().save_png(path)
		print("[shot] ", path, "  voiles : ", _island.veiled().size())
	get_tree().quit()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_D:
				_spot = not _spot
				return
			KEY_1, KEY_2:
				_select(event.keycode - KEY_1)
				return
			KEY_BRACKETLEFT, KEY_BRACKETRIGHT:
				_amount = clampf(_amount + (0.125 if event.keycode == KEY_BRACKETRIGHT else -0.125), 0.0, 1.0)
				return
	super._unhandled_input(event)


func _process(_delta: float) -> void:
	if _island == null:
		return
	var mat: ShaderMaterial = _island.get("_veil_mat")
	if mat != null:
		mat.set_shader_parameter("amount", _amount)
	for n in _tinted:
		if is_instance_valid(n):
			(n as CanvasItem).self_modulate = Color.WHITE
	_tinted = _island.veiled()
	var seen := 0
	var screen := get_viewport_rect()
	for n in _tinted:
		if not is_instance_valid(n):
			continue
		var item := n as CanvasItem
		if _spot:
			item.self_modulate = Color(1.0, 0.45, 0.45)
		if screen.has_point(item.get_global_transform_with_canvas().origin):
			seen += 1
	if _caption != null:
		_caption.text = ("APRES · %d %% · %d arbre%s" % [roundi(_amount * 100.0), seen, "s" if seen > 1 else ""]) \
			if _veil == 1 else NAMES[0]


func _select(k: int) -> void:
	# UNE CAPTURE GARDE SON STYLE : la fenetre prend le focus pendant qu'on
	# tape ailleurs, et un chiffre tape ou un clic perdu changeait de style.
	if _locked:
		return
	_veil = k
	_island.veil_on = k == 1
	for i in _buttons.size():
		(_buttons[i] as Control).modulate = Color.WHITE if i == k else Color(1, 1, 1, 0.55)


# ---------------------------------------------------------------- l'aiguillage

func _build_switch() -> void:
	var root: Control = _panel.get_parent()
	var bar := Kit.panel(Kit.style_glass())
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
