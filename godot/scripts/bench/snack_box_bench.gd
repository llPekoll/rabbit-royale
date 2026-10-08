extends Control
## LE BANC DU BROUILLON DE SNACK TIME (boite surprise + bonus du jour +
## collection) — voir scripts/ui/snack_box_dialog.gd. Donnees factices.
##
##   godot --path godot scenes/bench/snack_box_bench.tscn                 (a jouer)
##   godot --path godot scenes/bench/snack_box_bench.tscn -- --grid --shot=x.png --size=1920x1080
##
## Sans `--grid` : une seule fenetre, plein ecran ; OUVRIR tire au sort pour
## de vrai. R remet la boite, G bascule boite doree, 1-4 force le rang du
## prochain tirage (commun, rare, epique, jackpot), 0 rend le hasard.
## `--tier=rare` force aussi depuis la ligne de commande.

const COLS := 3
const GAP := 10.0
const CAPTION := 18.0

var _live: SnackBoxDialog
var _view := {"count": 12, "level": 4, "ready": true, "wait": "9h 12m", "buff": "idle"}
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
		elif arg.begins_with("--count="):
			_view["count"] = int(arg.trim_prefix("--count="))
	if "--grid" in args:
		_grid()
	else:
		_play()
		if "--open" in args:
			(func() -> void: _live._open()).call_deferred()
	DevShot.arm(self)


func _play() -> void:
	if is_instance_valid(_live):
		_live.queue_free()
	_live = SnackBoxDialog.new()
	_live.view = _view.duplicate()
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
			_view["count"] = 13 if int(_view["count"]) != 13 else 12
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
		["Ready — snack #13", {"count": 12}, {}],
		["Ready — GOLDEN box (#14)", {"count": 13}, {}],
		["Opened — common (carrots scale with level)", {"count": 13, "buff": "active"}, {"tier": "common", "kind": "carrots", "qty": 160}],
		["Opened — rare", {"count": 13, "buff": "active"}, {"tier": "rare", "kind": "lightning", "qty": 1}],
		["Opened — epic", {"count": 14, "buff": "active"}, {"tier": "epic", "kind": "magic_hat", "qty": 1}],
		["Opened — jackpot", {"count": 14, "buff": "active"}, {"tier": "jackpot", "kind": "coat", "qty": 1}],
		["Tomorrow — buff used, waiting", {"count": 15, "ready": false, "buff": "used"}, {}],
		["Day 1 of a new player", {"count": 0, "level": 1}, {}],
		["Late game — 29 snacks, Lv 10", {"count": 29, "level": 10}, {}],
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


func _tile(caption_text: String, patch: Dictionary, result: Dictionary) -> Control:
	var tile := Control.new()
	var caption := Kit.label(caption_text, 10, Palette.CREAM, true)
	caption.position = Vector2(4, 0)
	tile.add_child(caption)
	var holder := Control.new()
	holder.name = "Holder"
	holder.clip_contents = true
	tile.add_child(holder)
	var dialog := SnackBoxDialog.new()
	var v := _view.duplicate()
	v.merge(patch, true)
	dialog.view = v
	dialog.result = result
	holder.add_child(dialog)
	dialog.close_button.hide()
	return tile
