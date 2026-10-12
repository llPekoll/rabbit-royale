extends Node
## LE BANC DU CLAVIER (key_steer.gd) : fleches / WASD et 1 2 3, sur trois
## plateaux jouables sans compte ni serveur, avec ce que chaque touche a fait.
##
##   godot --path godot scenes/bench/keys_bench.tscn
##   ... -- --mode=raid | --mode=defend
##
##   ILE     le bac a sable (dig_sandbox), ile de combat : 1 eclair, 2 bloop,
##           3 (ou X) arme le mode bombe, les fleches deplacent la case
##           visee, 3 ou Entree y pose le X. Echap desarme.
##   RAID    le raid contre le mur d'arbres (raid_axe_bench) : les fleches
##           avancent sur l'anneau, 1 arme la hache.
##   DEFENSE Kuro pille le terrier (defend_buy_bench) : 1 foudroie.
##
## F1 F2 F3 (ou les boutons) changent de plateau : la scene se recharge, pour
## que les faux etats d'un banc ne fuient pas dans l'autre.
##
## Pas un ecran du jeu — un outil, comme ui_bench.tscn.

const SCENES := {
	"island": "res://scenes/dig_sandbox.tscn",
	"raid": "res://scenes/bench/raid_axe_bench.tscn",
	"defend": "res://scenes/bench/defend_buy_bench.tscn",
}
const LABELS := {"island": "F1 ILE", "raid": "F2 RAID", "defend": "F3 DEFENSE"}
const HELP := {
	"island": "Fleches/WASD un pas, 2 touches = diagonale\n1 eclair  2 bloop  Echap desarme\n3 ou X : mode bombe, fleches = viser, 3/Entree = poser",
	"raid": "Fleches/WASD un pas sur l'anneau dore\n1 hache (puis clic sur l'arbre)  Echap desarme",
	"defend": "1 foudroyer Kuro (achete si poche vide)\nles fleches ne font rien chez soi",
}
const LOG_LINES := 6

static var mode := ""

var _log: Array[String] = []
var _log_label: Label
var _state_label: Label


func _ready() -> void:
	if mode.is_empty():
		mode = "island"
		for arg in OS.get_cmdline_user_args():
			if arg.begins_with("--mode="):
				mode = arg.trim_prefix("--mode=")
	if mode == "island":
		# UNE ILE OU L'ON SE BAT : niveau 7, quatre places — sinon la puce de
		# l'eclair et du bloop reste cachee (RunState.may_fight_here).
		RunState.current.island = {"level": 7}
		RunState.current.bag_changed.connect(_fill_bag)
	add_child(load(SCENES[mode]).instantiate())
	if mode == "island":
		_fill_bag()
	_build_overlay()


## Le bac a sable reecrit le sac a chaque pas (sans bloop) : on le remplit.
func _fill_bag() -> void:
	var bag := RunState.current.bag
	if int(bag.get("lightning", 0)) < 3 or int(bag.get("bloop", 0)) < 3:
		RunState.current.set_bag({"lightning": 3, "bloop": 3})


func _switch(to: String) -> void:
	if to == mode:
		return
	mode = to
	RunState.current.set_aiming("")
	RunState.current.island = {}
	RaidState.current.axe_armed = false
	RaidState.current.fake({"raid": {}, "incoming": {}, "outcome": {}})
	get_tree().reload_current_scene()


func _build_overlay() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 100
	add_child(layer)
	# EN BAS AU MILIEU : le seul coin libre sur les trois plateaux (le bac a
	# sable tient la gauche, MARK A BOMB et la hache la droite, les barres le haut).
	var panel := Kit.panel(Kit.style_glass())
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	panel.offset_bottom = -Kit.EDGE
	if mode == "island":
		# Sur l'ile, le panneau du bac a sable deborde au milieu : a droite,
		# au-dessus de MARK A BOMB.
		panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
		panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN
		panel.offset_right = -Kit.EDGE
		panel.offset_bottom = -(Kit.EDGE + MarkBombButton.H_MAX + Kit.PAD)
	layer.add_child(panel)
	var col := Kit.vbox(Kit.PAD_TIGHT)
	panel.add_child(col)

	var tabs := Kit.hbox(Kit.PAD_TIGHT)
	col.add_child(tabs)
	for key in SCENES:
		var b := Button.new()
		b.text = LABELS[key]
		b.focus_mode = Control.FOCUS_NONE
		b.disabled = key == mode
		b.pressed.connect(_switch.bind(key))
		tabs.add_child(b)

	var help := Kit.label(HELP[mode], 11, Palette.CHALK)
	col.add_child(help)
	_state_label = Kit.label("", 11, Palette.LAMP)
	col.add_child(_state_label)
	_log_label = Kit.label("", 11, Palette.CHALK_DIM)
	col.add_child(_log_label)


## Chaque touche, AVANT que le jeu la prenne : ce qu'on a presse.
func _input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	match key.keycode:
		KEY_F1: _switch("island"); return
		KEY_F2: _switch("raid"); return
		KEY_F3: _switch("defend"); return
	_log.append(OS.get_keycode_string(key.physical_keycode if key.physical_keycode != 0 else key.keycode))
	if _log.size() > LOG_LINES:
		_log.pop_front()
	_log_label.text = "touches : " + " ".join(_log)


## CE QUE LE JEU EN A FAIT, relu a chaque image.
func _process(_delta: float) -> void:
	if _state_label == null:
		return
	var run := RunState.current
	var raid := RaidState.current
	var parts: Array[String] = []
	match mode:
		"island":
			var isl := _find("local_run")
			if isl != null and isl.get("local_run") != null:
				parts.append("lapin %s" % str(isl.get("local_run").at))
			parts.append("visee : %s" % (run.aiming if not run.aiming.is_empty() else "-"))
			parts.append("X arme : %s" % ("oui" if isl != null and bool(isl.get("_armed")) else "non"))
			if isl != null and (isl.get("_key_target") as Vector2i).x >= 0:
				parts.append("vise %s" % str(isl.get("_key_target")))
		"raid":
			var burrow := _find("_walker_at")
			if burrow != null:
				parts.append("lapin %s" % str(BurrowLayout.cell_of(int(burrow.get("_walker_at")))))
			parts.append("hache armee : %s" % ("oui" if raid.axe_armed else "non"))
		"defend":
			parts.append("eclairs : %d" % raid.lightning_held)
			parts.append("foudroye : %s" % ("oui" if bool(raid.incoming.get("struck", false)) else "non"))
	_state_label.text = "  ·  ".join(parts)


func _find(prop: String) -> Node:
	for n in find_children("*", "Node2D", true, false):
		if prop in n:
			return n
	return null
