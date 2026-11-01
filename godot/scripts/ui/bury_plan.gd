class_name BuryPlan
extends Control
## Deux lignes sur bois : trajet + verdict, puis consigne de l'outil choisi.
## Pendant le test, l'energie et le parcours reel remplacent la preparation.
## Le bouton Tester vit dans le dock ; les bancs peuvent encore l'inclure ici.
## `room_changed` reserve la hauteur du bandeau dans le cadrage du terrier.

signal room_changed
## TESTER commence (vrai) ou finit : le chrome suspend la pose le temps du
## parcours, une tape ne doit rien enterrer sous ses pas.
signal testing(on: bool)
signal test_available(on: bool)
var external_test := false

const PATH_COLOR := Color("#ffb03a")
const HOLDS_COLOR := Color("#8ee26f")
const PASSES_COLOR := Color("#ff8a5a")
## Le chemin se relit a ce rythme : une bombe posee, une planche, un decor.
const REFRESH_S := 0.3
const STEP_S := 0.5
const PANEL_W := 520.0
const TEST_W := 96.0
const TEST_H := 28.0
const KURO := preload("res://assets/bunnies/bunny-black.png")

var burrow: Node2D
var _mode := "placing"
var _route := {}
var _testing := false
var _clock := 0.0
var _panel: PanelContainer
var _hint: Label
var _score: Label
var _verdict: Label
var _test: PlankButton
var _key := ""


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var wood := Kit.style_plank(0, 22, 6)
	wood.modulate_color = Color(0.78, 0.71, 0.64)
	_panel = Kit.panel(wood)
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_panel)
	var box := Kit.vbox(3.0)
	_panel.add_child(box)
	var row := Kit.hbox(8)
	box.add_child(row)
	var portrait := AtlasTexture.new()
	portrait.atlas = KURO
	portrait.region = Rect2(7, 10, 18, 22)
	portrait.filter_clip = true
	var icon := Kit.icon(portrait, 34)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var copy := Kit.vbox(1)
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(copy)
	var headline := Kit.hbox(10)
	copy.add_child(headline)
	_score = Kit.label("", 11, PATH_COLOR, true)
	_score.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_score.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	headline.add_child(_score)
	_verdict = Kit.label("", 11, Palette.CREAM, true)
	_verdict.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	headline.add_child(_verdict)
	_hint = Kit.label("", 10, Palette.CREAM, true)
	_hint.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	copy.add_child(_hint)
	_test = Kit.button(I18N.t("defend.test"), "gold", TEST_W, TEST_H)
	_test.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_test.pressed.connect(_run_test)
	box.add_child(_test)
	_panel.minimum_size_changed.connect(_place.call_deferred)
	get_viewport().size_changed.connect(_place)
	I18N.locale_changed.connect(func(_c: String) -> void:
		_test.relabel(I18N.t("defend.test"))
		if not _testing: _refresh()
		_place.call_deferred())
	_refresh()
	_place.call_deferred()


func _exit_tree() -> void:
	if burrow != null and is_instance_valid(burrow):
		burrow.call("show_route", {})
		burrow.call("ghost_clear")


## La case choisie dans la rangee : "placing", "walling" ou "inspect".
func set_mode(mode: String) -> void:
	_mode = mode
	_refresh()


## Le bas du panneau, en pixels d'ecran : le terrier se cadre dessous.
func bottom() -> float:
	return _panel.get_global_rect().end.y if is_instance_valid(_panel) else 0.0


func _process(delta: float) -> void:
	if _testing:
		return
	_clock -= delta
	if _clock <= 0.0:
		_clock = REFRESH_S
		_refresh()


func _layout() -> BurrowLayout:
	return burrow.get("_layout") if burrow != null and is_instance_valid(burrow) else null


func _refresh() -> void:
	if _hint == null:
		return
	match _mode:
		"placing":
			_hint.text = I18N.t("defend.planBriefBombs")
			_hint.tooltip_text = I18N.f("defend.planBombs", [Tuning.i("TRAPS.DRAIN")])
		"walling":
			_hint.text = I18N.t("defend.planBriefFences")
			_hint.tooltip_text = I18N.t("defend.planFences")
		"decor":
			_hint.text = I18N.t("defend.planBriefDecor")
			_hint.tooltip_text = I18N.t("arrange.tip")
		_:
			_hint.text = I18N.t("defend.planBriefPick")
			_hint.tooltip_text = I18N.t("defend.planPick")
	var layout := _layout()
	if layout == null:
		return
	var shop := ShopState.shared()
	var bombs: Array = shop.traps.get("placed", [])
	var planks: Array = shop.fences.get("placed", [])
	# Rien n'a bouge : ni chemin a refaire, ni terrier a redessiner.
	# Le terrier refait son plan quand le decor bouge : son id suffit.
	var key := "%d|%s|%s" % [layout.get_instance_id(), str(bombs), str(planks)]
	if key != _key:
		_key = key
		_route = RaidRoute.cheapest(layout, bombs, planks)
		burrow.call("show_route", _route)
	_show_verdict()


func _show_verdict() -> void:
	if _route.is_empty():
		_score.text = I18N.t("defend.planClosed")
		_panel.tooltip_text = _score.text
		_verdict.text = ""
		_test.visible = false
	else:
		var budget := RaidRoute.budget()
		var steps: int = (_route.path as Array).size() - 1
		var hits: int = (_route.hits as Array).size()
		var cost: int = _route.cost
		_score.text = I18N.f("defend.planTrail", [steps, hits])
		_panel.tooltip_text = I18N.f("defend.planRoute", [steps, hits, cost, budget])
		if cost >= budget:
			_verdict.text = I18N.t("defend.planSafe")
			_panel.tooltip_text += "\n" + I18N.t("defend.planHolds")
			_verdict.add_theme_color_override("font_color", HOLDS_COLOR)
		else:
			_verdict.text = I18N.f("defend.planOpen", [budget - cost])
			_panel.tooltip_text += "\n" + I18N.f("defend.planPasses", [budget - cost])
			_verdict.add_theme_color_override("font_color", PASSES_COLOR)
		_test.visible = not external_test
	_panel.tooltip_text += "\n" + _hint.tooltip_text
	test_available.emit(not _route.is_empty() and not _testing)


## EN HAUT AU CENTRE, sous la marge du telephone : la ou se tenait le haut du
## terrier, qui s'efface le temps du mode.
func _place() -> void:
	if not is_instance_valid(_panel):
		return
	var view := get_viewport_rect().size
	position = Vector2.ZERO
	size = view
	var w := minf(PANEL_W, view.x - 2.0 * Kit.EDGE)
	_panel.size = Vector2(w, 0.0)
	_panel.reset_size()
	var sz := _panel.get_combined_minimum_size()
	_panel.size = Vector2(w, sz.y)
	_panel.position = Vector2(roundf((view.x - w) * 0.5), Kit.screen_inset().y)
	room_changed.emit()


# ── TESTER ───────────────────────────────────────────────────────────────────

## UN PILLARD SUR LE MEILLEUR CHEMIN : chaque pas coute, chaque bombe draine,
## et il s'arrete a sec. Le compte se lit sur la ligne du chemin.
func _run_test() -> void:
	if _testing or _route.is_empty() or burrow == null:
		return
	_testing = true
	testing.emit(true)
	_test.disabled = true
	Analytics.track("bury_test")
	var path: Array = _route.path
	var hits: Array = _route.hits
	var budget := RaidRoute.budget()
	var energy := budget
	var step_cost := Tuning.i("RAID_RUN.STEP_COST")
	var drain := Tuning.i("TRAPS.DRAIN")
	var walked := 0
	var sprung := 0
	var reached := false
	_verdict.text = I18N.t("defend.planTesting")
	_verdict.add_theme_color_override("font_color", Palette.CREAM)
	_show_test_progress(energy, budget, walked, sprung)
	burrow.call("ghost_start", int(path[0]))
	for i in range(1, path.size()):
		await get_tree().create_timer(STEP_S).timeout
		if not _still_testing():
			return
		energy -= step_cost
		walked += 1
		var hit := hits.has(path[i])
		if hit:
			energy -= drain
			sprung += 1
		burrow.call("ghost_step", int(path[i]), hit)
		_show_test_progress(energy, budget, walked, sprung)
		if energy <= 0:
			break
		if i == path.size() - 1:
			reached = true
	await get_tree().create_timer(STEP_S).timeout
	if not _still_testing():
		return
	burrow.call("ghost_end", reached)
	_verdict.text = I18N.f("defend.planOpen", [maxi(0, energy)]) if reached else I18N.t("defend.planSafe")
	_verdict.add_theme_color_override("font_color", PASSES_COLOR if reached else HOLDS_COLOR)
	var say := I18N.f("defend.testReached", [maxi(0, energy)]) if reached \
		else I18N.f("defend.testHeld", [walked, sprung])
	if Chrome.current != null:
		Chrome.current.toast(say)
	await get_tree().create_timer(2.5).timeout
	if not _still_testing():
		return
	burrow.call("ghost_clear")
	_end_test()


func _show_test_progress(energy: int, budget: int, walked: int, sprung: int) -> void:
	_score.text = I18N.f("defend.planEnergy", [maxi(0, energy), budget])
	_hint.text = I18N.f("defend.planTrail", [walked, sprung])
	_panel.tooltip_text = _score.text + "\n" + _hint.text
	_hint.tooltip_text = ""


## Le mode a pu se refermer, ou un vrai raid arriver, pendant le parcours.
func _still_testing() -> bool:
	if is_inside_tree() and burrow != null and is_instance_valid(burrow) \
			and burrow.get("_ghost") != null:
		return true
	if is_inside_tree():
		_end_test()
	return false


func _end_test() -> void:
	_testing = false
	_test.disabled = false
	_key = ""
	testing.emit(false)
	_refresh()
