extends Control
## LE BANC DE SNACK TIME (boite surprise + bonus du jour + cadeaux) — voir
## scripts/ui/snack_box_dialog.gd. Etat factice a la forme de /api/snack, et
## tirage local avec ses cotes : sans compte ni reseau.
##
##   godot --path godot scenes/bench/snack_box_bench.tscn                 (a jouer)
##   godot --path godot scenes/bench/snack_box_bench.tscn -- --grid --shot=x.png --size=1920x1080
##
## Sans `--grid` : une seule fenetre, plein ecran ; OUVRIR tire au sort. R
## remet la boite, G bascule boite doree, 1-4 force le rang du prochain
## tirage (commun, rare, epique, jackpot), 0 rend le hasard. `--tier=rare`,
## `--days=13`, `--open` depuis la ligne de commande.

const COLS := 3
const GAP := 10.0
const CAPTION := 18.0
const GIFT_KINDS := ["mushroom", "pumpkin", "carrot", "scarecrow"]

var _live: SnackBoxDialog
var _days := 12
var _force := ""


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)
	var args := OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--tier="):
			_force = arg.trim_prefix("--tier=")
		elif arg.begins_with("--days="):
			_days = int(arg.trim_prefix("--days="))
	if "--grid" in args:
		_grid()
	else:
		_play()
		if "--open" in args:
			(func() -> void: _live._open()).call_deferred()
	DevShot.arm(self)


## L'etat que /api/snack rendrait pour `days` jours pris (`ready` : la boite
## du jour attend). Les memes chiffres que SNACK dans config/tuning.ts.
static func fake_state(days: int, ready := true, level := 4, buff := "idle") -> Dictionary:
	var step := days % 7
	var weeks := days / 7
	var gifts := []
	for i in GIFT_KINDS.size():
		gifts.append({"day": 7 * (i + 1), "kind": GIFT_KINDS[i], "got": weeks > i})
	var later := Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 9 * 3600 + 12 * 60) + ".000Z"
	return {
		"day": days + 1, "days": days, "ready": ready, "readyAt": null if ready else later,
		"golden": step == 6, "goldenIn": 6 - step,
		"odds": {"common": 80, "rare": 15, "epic": 4, "jackpot": 1},
		"goldenOdds": {"common": 0, "rare": 65, "epic": 30, "jackpot": 5},
		"box": {
			"common": [{"kind": "carrots", "qty": 40 * level}, {"kind": "water", "qty": 2}, {"kind": "fertiliser", "qty": 1}],
			"rare": [{"kind": "lightning", "qty": 1}, {"kind": "shield", "qty": 1}, {"kind": "energy", "qty": 1}],
			"epic": [{"kind": "magic_hat", "qty": 1}, {"kind": "lucky_foot", "qty": 1}],
			"jackpot": [{"kind": "skin_solana", "qty": 1}, {"kind": "skin_carrot", "qty": 1}],
		},
		"jackpotCarrots": 1500, "gifts": gifts,
		"buff": {"state": buff, "bonus": 312 if buff == "used" else 0, "max": 75 * level, "mult": 2},
		"taken": step, "weeks": weeks,
	}


func _dialog(state: Dictionary, result := {}) -> SnackBoxDialog:
	var s := SnackState.new()
	s.fake(state)
	add_child(s)
	var dialog := SnackBoxDialog.new()
	dialog._state = s
	dialog.result = result
	return dialog


func _play() -> void:
	if is_instance_valid(_live):
		_live.queue_free()
	_live = _dialog(fake_state(_days))
	_live.force_tier = _force
	add_child(_live)
	Kit.fill(_live)
	_live.close_button.hide()


func _unhandled_key_input(event: InputEvent) -> void:
	if _live == null or not (event is InputEventKey) or not event.pressed:
		return
	match (event as InputEventKey).keycode:
		KEY_R:
			_play()
		KEY_G:
			_days = 13 if _days != 13 else 12
			_play()
		KEY_1, KEY_2, KEY_3, KEY_4:
			_force = ["common", "rare", "epic", "jackpot"][(event as InputEventKey).keycode - KEY_1]
			_play()
		KEY_0:
			_force = ""
			_play()


## Toutes les etapes d'un coup d'oeil.
func _grid() -> void:
	var steps := [
		["Ready - day 13", fake_state(12), {}],
		["Ready - GOLDEN box (day 14)", fake_state(13), {}],
		["Opened - common (carrots scale with level)", fake_state(13, false, 4, "active"), {"tier": "common", "kind": "carrots", "qty": 160}],
		["Opened - rare", fake_state(13, false, 4, "active"), {"tier": "rare", "kind": "lightning", "qty": 1}],
		["Opened - epic + gift unlocked", fake_state(14, false, 4, "active"), {"tier": "epic", "kind": "magic_hat", "qty": 1}],
		["Opened - jackpot skin", fake_state(14, false, 4, "active"), {"tier": "jackpot", "kind": "skin_carrot", "qty": 1}],
		["Tomorrow - bonus used, waiting", fake_state(15, false, 4, "used"), {}],
		["Day 1 of a new player", fake_state(0, true, 1), {}],
		["Late game - day 28 next, Lv 10", fake_state(27, true, 10), {}],
	]
	var grid := GridContainer.new()
	grid.columns = COLS
	grid.add_theme_constant_override("h_separation", int(GAP))
	grid.add_theme_constant_override("v_separation", int(GAP))
	grid.position = Vector2(GAP, GAP)
	add_child(grid)
	for step in steps:
		grid.add_child(_tile(step[0], step[1], step[2]))
	resized.connect(func() -> void: _fit.call_deferred(grid, steps.size()))
	_fit.call_deferred(grid, steps.size())


func _fit(grid: GridContainer, count: int) -> void:
	var rows := ceili(float(count) / COLS)
	var w := (size.x - GAP * (COLS + 1)) / COLS
	var h := (size.y - GAP * (rows + 1)) / rows - CAPTION
	var k := minf(w / SnackDialog.DESIGN.x, h / SnackDialog.DESIGN.y)
	for tile in grid.get_children():
		var t := tile as Control
		t.custom_minimum_size = Vector2(SnackDialog.DESIGN.x * k, SnackDialog.DESIGN.y * k + CAPTION)
		var holder := t.get_node("Holder") as Control
		holder.position = Vector2(0, CAPTION)
		holder.size = SnackDialog.DESIGN
		holder.scale = Vector2.ONE * k
		var dialog := holder.get_child(0) as SnackBoxDialog
		dialog.custom_minimum_size = Vector2.ZERO
		dialog.size = SnackDialog.DESIGN
		dialog._layout()


func _tile(caption_text: String, state: Dictionary, result: Dictionary) -> Control:
	var tile := Control.new()
	var caption := Kit.label(caption_text, 10, Palette.CREAM, true)
	caption.position = Vector2(4, 0)
	tile.add_child(caption)
	var holder := Control.new()
	holder.name = "Holder"
	holder.clip_contents = true
	tile.add_child(holder)
	var dialog := _dialog(state, result)
	holder.add_child(dialog)
	dialog.close_button.hide()
	return tile
