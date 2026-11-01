class_name DefenseDock
extends PanelContainer
## LE DOCK DE DEFENSE (refonte du terrier, 2026-10-26) : trois outils de
## construction (decor, bombe, planche) et un gros TESTER sur une seule
## planche de bois. Les petites cases bouclier et fumee gardent les actions
## du sac.
signal selected(kind: String)
signal test_requested
const WOOD := preload("res://assets/ui/burrow-hud/panel-center.png")
const GOLD := preload("res://assets/ui/burrow-hud/button-orange.png")
const DECOR := preload("res://assets/deco/identity/petits-decors.png")
## L'encre du bouton TESTER, mot et triangle.
const TEST_INK := Color("352011")
## La largeur du triangle de lecture.
const PLAY_W := 11.0
var tabs: Dictionary = {}
var stocks: Dictionary = {}
var extras: Dictionary = {}
var test_button: Button
var _labels: Dictionary = {}
var _placed: Label

func _init() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var tray := Kit.style_plank(0, 25, 9)
	tray.modulate_color = Color(0.78, 0.71, 0.64)
	add_theme_stylebox_override("panel", tray)
	var row := Kit.hbox(6)
	add_child(row)
	for kind in ["decor", "trap", "fence"]:
		var b := Button.new()
		b.custom_minimum_size = Vector2(96, 64)
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.add_theme_stylebox_override("normal", _wood(Color(0.57, 0.52, 0.46)))
		b.add_theme_stylebox_override("hover", _wood(Color(0.72, 0.65, 0.54)))
		b.add_theme_stylebox_override("pressed", _wood(Color(0.48, 0.43, 0.36)))
		b.add_theme_stylebox_override("focus", Kit.style_well(true))
		b.pressed.connect(func() -> void: selected.emit(kind))
		b.draw.connect(func() -> void:
			if not bool(b.get_meta("chosen", false)): return
			var w := b.size.x - 2
			var h := b.size.y - 2
			var edge := PackedVector2Array([Vector2(7, 1), Vector2(w-6, 1), Vector2(w, 7),
				Vector2(w, h-6), Vector2(w-6, h), Vector2(7, h), Vector2(1, h-6), Vector2(1, 7), Vector2(7, 1)])
			b.draw_polyline(edge, Color("ffd45c"), 2.0))
		row.add_child(b)
		tabs[kind] = b
		var column := Kit.vbox(1)
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		b.add_child(column)
		column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		column.offset_left = 5
		column.offset_right = -5
		var icon: Control
		if kind == "decor":
			var art := AtlasTexture.new()
			art.atlas = DECOR
			art.region = Rect2(40, 65, 48, 52)
			icon = Kit.icon(art, 25)
		else:
			icon = ItemSlot.art_for(kind, 25)
		icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(icon)
		var name_label := Kit.label("", 11, Color("fff0cb"))
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		column.add_child(name_label)
		_labels[kind] = name_label
		var stock := Kit.label("", 8, Color("f0c98e"))
		stock.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		stock.clip_text = true
		column.add_child(stock)
		stocks[kind] = stock
		if kind == "trap":
			_placed = Kit.label("", 8, Color("ffd45c"), true)
			_placed.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			b.add_child(_placed)
			_placed.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
			_placed.offset_left = -36
			_placed.offset_right = -6
			_placed.offset_top = 4
			_placed.offset_bottom = 16
	for kind in ["shield", "smoke"]:
		var slot := ItemSlot.new(kind)
		slot.set_wide(false)
		slot.custom_minimum_size = Vector2(44, 44)
		slot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		slot.pressed.connect(func() -> void: selected.emit(kind))
		row.add_child(slot)
		extras[kind] = slot
	test_button = Button.new()
	test_button.custom_minimum_size = Vector2(124, 56)
	test_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	test_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "disabled"]:
		var face := _wood(Color.WHITE if state != "disabled" else Color(0.6, 0.6, 0.6))
		face.texture = GOLD
		# La place du triangle, a gauche du mot.
		face.set_content_margin(SIDE_LEFT, PLAY_W + 10)
		test_button.add_theme_stylebox_override(state, face)
	# LE TRIANGLE DE LECTURE EST DESSINE : « ▶ » n'existe pas dans les polices
	# du jeu, et le web, sans police systeme, l'affichait en carre vide.
	test_button.draw.connect(func() -> void:
		var mid := test_button.size.y * 0.5
		var x := 12.0
		var ink := Color(TEST_INK, 0.45 if test_button.disabled else 1.0)
		test_button.draw_colored_polygon(PackedVector2Array([
			Vector2(x, mid - PLAY_W * 0.6), Vector2(x + PLAY_W, mid), Vector2(x, mid + PLAY_W * 0.6)]), ink))
	test_button.add_theme_font_size_override("font_size", 17)
	test_button.add_theme_color_override("font_color", TEST_INK)
	test_button.add_theme_color_override("font_hover_color", TEST_INK)
	test_button.pressed.connect(func() -> void: test_requested.emit())
	row.add_child(test_button)

static func _wood(tint: Color) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = WOOD
	style.modulate_color = tint
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]:
		style.set_texture_margin(side, 5)
		style.set_content_margin(side, 6)
	return style

func refresh(kind: String, state: KitState) -> void:
	for key in tabs:
		(tabs[key] as Button).set_meta("chosen", key == kind)
		(tabs[key] as Button).queue_redraw()
		(_labels[key] as Label).text = I18N.t("defend.tool" + String(key).capitalize())
	_placed.text = "%d/%d" % [state.traps_placed(), Tuning.i("TRAPS.MAX_PLACED", 8)]
	(stocks.trap as Label).text = I18N.f("kit.tools.inStock", [state.traps_held()])
	(stocks.fence as Label).text = I18N.f("kit.tools.inStock", [state.fences_held()])
	for key in extras:
		(extras[key] as ItemSlot).set_count(str(state.held(key)))
		(extras[key] as ItemSlot).set_selected(key == kind)
	test_button.text = I18N.t("defend.test").capitalize()

func set_testing(on: bool) -> void:
	for button in tabs.values() + extras.values(): button.disabled = on
	test_button.disabled = on
	test_button.queue_redraw()
