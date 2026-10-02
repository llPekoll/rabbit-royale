extends Control
## LE BANC DE SNACK TIME : toute la semaine d'un coup d'oeil, chaque etape
## dans sa propre fenetre, avec des donnees factices — sans compte ni reseau.
##
##   godot --path godot scenes/bench/snack_bench.tscn -- --shot=snack.png --size=1920x1080
##
## Le chargement, puis pour chaque jour le snack qui attend son heure (gris)
## et celui qui est pret ; enfin le lendemain du septieme, une semaine neuve.
## Chaque fenetre a son propre SnackState (pas `shared()`), pose a la main.

const COLS := 5
const GAP := 10.0
const CAPTION := 18.0
const CARROTS := [50, 75, 100, 125, 150, 200]


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)
	var steps := _steps()
	var grid := GridContainer.new()
	grid.columns = COLS
	grid.add_theme_constant_override("h_separation", int(GAP))
	grid.add_theme_constant_override("v_separation", int(GAP))
	grid.position = Vector2(GAP, GAP)
	add_child(grid)
	for step in steps:
		grid.add_child(_tile(step))
	# Differe : le plein ecran des dialogues se remesure d'abord sur la vue.
	resized.connect(func() -> void: _fit.call_deferred(grid, steps.size()))
	_fit.call_deferred(grid, steps.size())
	DevShot.arm(self)


## La grille remplit la vue : chaque case garde le 890x400 du comptoir.
func _fit(grid: GridContainer, count: int) -> void:
	var rows := ceili(float(count) / COLS)
	var w := (size.x - GAP * (COLS + 1)) / COLS
	var h := (size.y - GAP * (rows + 1)) / rows - CAPTION
	var k := minf(w / SnackDialog.DESIGN.x, h / SnackDialog.DESIGN.y)
	for tile in grid.get_children():
		var t := tile as Control
		t.custom_minimum_size = Vector2(SnackDialog.DESIGN.x * k, SnackDialog.DESIGN.y * k + CAPTION)
		# Le dialogue reste a la taille du comptoir (son plein ecran se
		# remesure sur la vue : on le defait) ; c'est la case qui reduit.
		var holder := t.get_node("Holder") as Control
		holder.position = Vector2(0, CAPTION)
		holder.size = SnackDialog.DESIGN
		holder.scale = Vector2.ONE * k
		var dialog := holder.get_child(0) as SnackDialog
		dialog.custom_minimum_size = Vector2.ZERO
		dialog.size = SnackDialog.DESIGN
		dialog._layout()


func _tile(step: Dictionary) -> Control:
	var tile := Control.new()
	var caption := Kit.label(String(step["caption"]), 8, Palette.CREAM, true)
	caption.position = Vector2(4, 0)
	tile.add_child(caption)
	var holder := Control.new()
	holder.name = "Holder"
	holder.clip_contents = true
	tile.add_child(holder)
	var state := SnackState.new()
	state.fake(step["state"])
	tile.add_child(state)
	var dialog := SnackDialog.new()
	dialog._state = state
	holder.add_child(dialog)
	dialog.close_button.hide()
	return tile


## Toutes les etapes, dans l'ordre ou un joueur les vit.
func _steps() -> Array:
	var steps := [{"caption": "Loading", "state": {}}]
	for day in range(1, 8):
		if day > 1:
			steps.append({"caption": "Day %d — waiting" % day, "state": _snack(day, day - 1, false)})
		steps.append({"caption": "Day %d — ready" % day, "state": _snack(day, day - 1, true)})
	steps.append({"caption": "New week — day 1", "state": _snack(1, 0, false, 1)})
	return steps


func _snack(day: int, taken: int, ready: bool, weeks := 0) -> Dictionary:
	var week := []
	for i in 6:
		week.append({"day": i + 1, "carrots": CARROTS[i], "packs": null})
	week.append({"day": 7, "carrots": 0, "packs": {
		"magic_hat": [{"kind": "lightning", "qty": 1}, {"kind": "bloop", "qty": 1}],
		"lucky_foot": [{"kind": "trap", "qty": 2}, {"kind": "fence", "qty": 1}]}})
	var later := Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 9 * 3600 + 12 * 60) + ".000Z"
	return {"day": day, "ready": ready, "readyAt": null if ready else later, "taken": taken, "weeks": weeks, "week": week}
