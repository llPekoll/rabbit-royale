class_name KitRow
extends Control
## LA RANGEE DU KIT — ce qu'on porte, pendant qu'on manie le plateau.
##
## Porte de src/components/kit-row.tsx et kit-row.css (la version « toolkit » :
## des enseignes de bois sous des cases d'inventaire compactes), en gardant
## ce que ces fichiers ont decide :
##
##   • ELLE N'EST LA QUE PENDANT LA POSE — pieges OU clotures (`editingKit`).
##     Le reste du temps le terrier est un lieu, pas un chargement. Et le
##     mode cloture la GARDE : la case cloture EST la porte du mode, et une
##     rangee qui ne vivait que sous `placing` se demontait des qu'on la
##     pressait (« qd je click sur la fence dans le menu je repart direct sur
##     le burrow », Paul, 2026-09-21).
##   • INSPECTER NE CONSOMME NI N'ACHETE JAMAIS. Les noms restent sur les
##     outils ; les quantites, les effets et les depenses explicites vivent
##     dans la carte de detail — et une depense est un SIGNAL vers la
##     boutique (`buy_trap_pressed`, `use_shield`, `pour`), jamais un POST
##     d'ici.
##   • TROIS GROUPES, TROIS ENSEIGNES : defense (bouclier, fumee, piege,
##     cloture), attaque (bombe, foudre, mirage), jardin (arrosage, engrais).
##     Le plateau (`tray`) est au-dessus des enseignes (`tabs`), la carte de
##     detail au-dessus des deux sur un ecran de telephone.
##   • LA CASE PIEGE RELANCE LA POSE, LA CASE CLOTURE LE MODE CLOTURE, toute
##     autre case SUSPEND le plateau (`onInspect`) : le chrome ecoute
##     `start_placing`, `start_walling`, `inspect` et parle au terrier.
##
## Les nombres viennent de KitState (/api/shop, /api/fences) et de Home
## (bouclier, arrosoirs, carottes) ; les prix de Tuning.

## Le joueur veut acheter un piege (la boutique poste, puis `refresh()`).
signal buy_trap_pressed
## La case piege : reprendre la pose.
signal start_placing
## La case cloture : le mode cloture.
signal start_walling
## Une case qui n'est ni l'un ni l'autre : le plateau se suspend.
signal inspect
## « Use a shield ».
signal use_shield
## Verser un arrosoir ou un engrais : "water" / "fertiliser".
signal pour(kind: String)

## Les groupes, dans l'ordre du web, avec la case ouverte par defaut.
const GROUPS := [
	{"label": "kit.groupDefence", "kinds": ["shield", "smoke", "trap", "fence"], "first": "trap"},
	{"label": "kit.groupAttack", "kinds": ["bomb", "lightning", "mirage"], "first": "bomb"},
	{"label": "kit.groupGarden", "kinds": ["water", "fertiliser"], "first": "water"},
]

## kit-row.css : les enseignes 100x44 sous 960 de large (124 au-dela), 6 de
## jointure partout, 10px du bas.
const TAB_W := 100.0
const TAB_W_WIDE := 124.0
const TAB_H := 44.0
const GAP := 6.0
const TAB_SIZE := 10
const TAB_INK := Color("#fff3cf")
const TAB_INK_ON := Color("#ffdf7c")
const TAB_LIT := 1.15
## La carte de detail : la face `#48301f`, 14/18 d'air, 360 de large au
## plus sur un telephone, et jamais plus haut que ce que l'ecran laisse.
const DETAIL_FACE := Color("#48301f")
const DETAIL_W := 360.0
## La meme carte sous 520 px de haut (`_fit_detail`).
const DETAIL_W_SHORT := 560.0
const DETAIL_AIR_TOP_SHORT := 24.0
const DETAIL_AIR_BOTTOM_SHORT := 18.0
const DETAIL_PAD_X := 18.0
const DETAIL_PAD_Y := 14.0
const DETAIL_TEXT := 10
const DETAIL_NAME := 11
const DETAIL_STATUS := 9
const WIDE_SCREEN := 960.0

## Le banc force l'affichage.
var bench_mode := false
## L'etat de la boutique et des clotures, a relire apres un achat.
var state := KitState.new()

var _open := false
var _group := 0
var _selected := "trap"
var _expanded := true
var _column: VBoxContainer
var _tray: HBoxContainer
var _tabs: HBoxContainer
var _tab_buttons: Array[Button] = []
var _slots: Dictionary = {}
var _detail: PanelContainer
var _detail_art_seat: Control
var _detail_name: Label
var _detail_status: Label
var _detail_blurb: Label
var _detail_hint: Label
var _detail_action: PlankButton
## Le cadre de la carte, garde pour lui rendre son air sur un ecran court.
var _detail_style: StyleBoxTexture
var _action: Callable = Callable()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_BOTTOM_WIDE)

	_column = Kit.vbox(GAP)
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_column)
	_tray = Kit.hbox(GAP)
	_tray.alignment = BoxContainer.ALIGNMENT_CENTER
	_tray.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_child(_tray)
	_tabs = Kit.hbox(GAP)
	_tabs.alignment = BoxContainer.ALIGNMENT_CENTER
	_tabs.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_child(_tabs)

	for index in GROUPS.size():
		var tab := _build_tab(index)
		_tab_buttons.append(tab)
		_tabs.add_child(tab)

	_detail = _build_detail()
	add_child(_detail)
	# LA CARTE SE MESURE ELLE-MEME. Ses paragraphes vont a la ligne, et un
	# label qui va a la ligne ne connait sa hauteur qu'une fois sa largeur
	# posee : on lui donne la largeur, une hauteur nulle, et on la laisse
	# pousser jusqu'a son minimum — puis on la repose au-dessus des rangees.
	_detail.minimum_size_changed.connect(_fit_detail)
	_detail.resized.connect(_place_detail)

	state.changed.connect(_refresh)
	Home.changed.connect(_refresh)
	I18N.locale_changed.connect(func(_code: String) -> void: _refresh())
	Screens.changed.connect(_update_visible)
	get_viewport().size_changed.connect(_measure)

	_build_tray()
	_refresh()
	_update_visible()


# ── L'API du chrome ──────────────────────────────────────────────────────────

## OUVRIR la rangee pour un mode : "placing" (la case piege), "walling" (la
## case cloture), "inspect" (ce qui etait choisi). Choisit la case SANS
## re-emettre : c'est le chrome qui vient de lancer le mode.
func open(mode: String) -> void:
	_open = true
	match mode:
		"placing":
			_group = 0
			_selected = "trap"
		"walling":
			_group = 0
			_selected = "fence"
	_expanded = true
	_build_tray()
	_refresh()
	_update_visible()
	state.refresh()


func close() -> void:
	_open = false
	_update_visible()


func is_open() -> bool:
	return _open


## Relire la boutique — apres un achat, une pose, un retour de l'ile.
func refresh() -> void:
	state.refresh()


func selected_kind() -> String:
	return _selected


# ── La mise en page ──────────────────────────────────────────────────────────

func _wide() -> bool:
	return get_viewport_rect().size.x > WIDE_SCREEN


## Ancre au bas de l'hote, mais s'etend vers le haut de toute la hauteur de
## l'ecran : la carte de detail monte au-dessus des rangees.
func _measure() -> void:
	var view := get_viewport_rect().size
	offset_top = -view.y
	offset_bottom = 0.0
	var wide := _wide()
	for tab in _tab_buttons:
		tab.custom_minimum_size = Vector2(TAB_W_WIDE if wide else TAB_W, TAB_H)
	for slot in _slots.values():
		(slot as ItemSlot).set_wide(wide)
	var want := _column.get_combined_minimum_size()
	_column.size = want
	_column.position = Vector2(floorf((size.x - want.x) * 0.5), size.y - Kit.EDGE - want.y)

	_fit_detail()


func _fit_detail() -> void:
	var view := get_viewport_rect().size
	var dw := minf(DETAIL_W, view.x - 28.0)
	# SUR UN ECRAN COURT, LA CARTE S'ELARGIT AU LIEU DE MONTER. A 360 de large
	# ses deux paragraphes font quatre lignes, et posee sur les rangees son
	# haut arrivait a 74 px au Seeker (890x400, en francais) : sur la pastille
	# « 300 » que le cadran d'energie pend jusqu'a ~82. Plus large, les memes
	# mots tiennent en deux lignes (haut a 97) ; la largeur reste bornee pour
	# que la ligne se lise d'un regard.
	# Et son cadre y rend l'air qu'il met au-dessus du nom et sous le bouton :
	# les coupes du cadre a feuilles (37 / 28) sont faites pour l'art des
	# coins, pas pour le texte, et le parchemin commence bien avant.
	var short := view.y < HubCard.SHORT_VIEW
	if short:
		dw = minf(DETAIL_W_SHORT, view.x - 2.0 * Kit.EDGE)
	if _detail_style != null:
		_detail_style.content_margin_top = DETAIL_AIR_TOP_SHORT if short else float(Kit.LEAF_SLICE.y)
		_detail_style.content_margin_bottom = DETAIL_AIR_BOTTOM_SHORT if short else float(Kit.LEAF_SLICE.w)
	_detail.size = Vector2(dw, 0.0)
	_place_detail()


func _place_detail() -> void:
	_detail.position = Vector2(floorf((size.x - _detail.size.x) * 0.5),
		_column.position.y - Kit.PAD_TIGHT - _detail.size.y)


## Une enseigne : la planche de bois etiree sur toute la boite (le CSS la
## pose en `100% 100%`, sans coupes), le mot en creme sur son ombre.
func _build_tab(index: int) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for st in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(st, StyleBoxEmpty.new())
	b.add_theme_font_size_override("font_size", 1)
	b.add_theme_color_override("font_color", Color.TRANSPARENT)
	var art := TextureRect.new()
	art.texture = Kit.PLANK
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_SCALE
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art.name = "Art"
	Kit.fill(art)
	b.add_child(art)
	var word := Kit.label("", TAB_SIZE, TAB_INK, true)
	word.name = "Word"
	word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	word.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Kit.wrapped(word)
	word.add_theme_constant_override("shadow_offset_y", 2)
	Kit.fill(word)
	word.offset_left = 7
	word.offset_right = -7
	b.add_child(word)
	b.pressed.connect(func() -> void: _on_tab(index))
	return b


## Le plateau du groupe choisi : une case par sorte.
func _build_tray() -> void:
	for child in _tray.get_children():
		child.queue_free()
	_slots.clear()
	var group: Dictionary = GROUPS[_group]
	for kind in group["kinds"]:
		var slot := ItemSlot.new(kind)
		slot.pressed.connect(func() -> void: _select(kind))
		_tray.add_child(slot)
		_slots[kind] = slot
	_measure()


## La carte de detail : l'art, le nom, l'etat, le [x] ; puis l'effet, le
## conseil et l'action.
func _build_detail() -> PanelContainer:
	# LE PARCHEMIN A FEUILLES, comme le grand livre du reservoir : c'est
	# l'explication d'outil du kit (`.rr-toolkit-detail`), et le web la pose
	# sur le meme cadre. Le bois plat d'avant etait la maquette.
	var s := StyleBoxTexture.new()
	s.texture = Kit.LEAF_FRAME
	s.texture_margin_left = Kit.LEAF_SLICE.x
	s.texture_margin_top = Kit.LEAF_SLICE.y
	s.texture_margin_right = Kit.LEAF_SLICE.z
	s.texture_margin_bottom = Kit.LEAF_SLICE.w
	s.content_margin_left = Kit.LEAF_SLICE.x + DETAIL_PAD_X * 0.5
	s.content_margin_right = Kit.LEAF_SLICE.z + DETAIL_PAD_X * 0.5
	s.content_margin_top = Kit.LEAF_SLICE.y
	s.content_margin_bottom = Kit.LEAF_SLICE.w
	_detail_style = s
	var card := Kit.panel(s)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var column := Kit.vbox(8)
	card.add_child(column)

	var summary := Kit.hbox(8)
	column.add_child(summary)
	_detail_art_seat = Control.new()
	_detail_art_seat.custom_minimum_size = Vector2(ItemSlot.ART, ItemSlot.ART)
	_detail_art_seat.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary.add_child(_detail_art_seat)
	var words := Kit.vbox(4)
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	summary.add_child(words)
	_detail_name = Kit.label("", DETAIL_NAME, Palette.INK)
	words.add_child(_detail_name)
	_detail_status = Kit.note("", Palette.INK, DETAIL_STATUS)
	words.add_child(_detail_status)
	var fold := Kit.label("×", 24, Palette.INK)
	fold.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fold.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var fold_button := Button.new()
	fold_button.custom_minimum_size = Vector2(Kit.CLOSE_TAP, Kit.CLOSE_TAP)
	fold_button.focus_mode = Control.FOCUS_NONE
	for st in ["normal", "hover", "pressed", "focus", "disabled"]:
		fold_button.add_theme_stylebox_override(st, StyleBoxEmpty.new())
	fold_button.add_theme_font_size_override("font_size", 1)
	fold_button.add_theme_color_override("font_color", Color.TRANSPARENT)
	Kit.fill(fold)
	fold_button.add_child(fold)
	fold_button.pressed.connect(func() -> void:
		_expanded = false
		_refresh())
	summary.add_child(fold_button)

	_detail_blurb = Kit.note("", Palette.INK, DETAIL_TEXT)
	column.add_child(_detail_blurb)
	_detail_hint = Kit.note("", Palette.INK, DETAIL_TEXT)
	column.add_child(_detail_hint)
	_detail_action = Kit.button("", "green", 0.0, 44.0)
	_detail_action.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail_action.pressed.connect(func() -> void:
		if _action.is_valid():
			_action.call())
	column.add_child(_detail_action)
	return card


# ── Les gestes ───────────────────────────────────────────────────────────────

func _on_tab(index: int) -> void:
	_group = index
	_build_tray()
	_select(String(GROUPS[index]["first"]))


## Choisir une case : le piege relance la pose, la cloture le mode cloture,
## le reste suspend le plateau.
func _select(kind: String) -> void:
	_selected = kind
	_expanded = true
	match kind:
		"trap":
			start_placing.emit()
		"fence":
			start_walling.emit()
		_:
			inspect.emit()
	_refresh()


# ── Ce que la rangee dit ─────────────────────────────────────────────────────

func _name_of(kind: String) -> String:
	match kind:
		"water":
			return I18N.t("kit.watering")
		"fertiliser":
			return I18N.t("kit.fertiliser")
		_:
			return I18N.t("items.%s.name" % kind)


func _boost(kind: String) -> Dictionary:
	var boosts: Variant = Home.burrow.get("boosts", {})
	if boosts is Dictionary and (boosts as Dictionary).get(kind) is Dictionary:
		return boosts[kind]
	return {}


func _count_of(kind: String) -> int:
	if kind == "water" or kind == "fertiliser":
		return int(_boost(kind).get("held", 0))
	return state.held(kind)


## Les millisecondes d'une fenetre ouverte, ou -1.
func _active_of(kind: String) -> int:
	var ms: Variant = null
	if kind == "shield":
		ms = Home.burrow.get("shieldMs", null)
	elif kind == "water" or kind == "fertiliser":
		ms = _boost(kind).get("activeMs", null)
	return int(ms) if (ms is float or ms is int) else -1


func _refresh() -> void:
	if _column == null:
		return
	var smoke_days := state.held("smoke")
	var pending := Home.pending or state.busy

	for index in _tab_buttons.size():
		var tab := _tab_buttons[index]
		var word: Label = tab.get_node("Word")
		word.text = I18N.shout(I18N.t(String(GROUPS[index]["label"])))
		var on := index == _group
		word.add_theme_color_override("font_color", TAB_INK_ON if on else TAB_INK)
		tab.modulate = Color(TAB_LIT, TAB_LIT, TAB_LIT) if on else Color.WHITE

	for kind in _slots:
		var slot: ItemSlot = _slots[kind]
		var n := _count_of(kind)
		slot.set_count((str(smoke_days) + I18N.t("units.d")) if kind == "smoke" else str(n))
		slot.set_selected(kind == _selected)
		slot.set_dim(n == 0 and _active_of(kind) < 0 and not (kind == "smoke" and smoke_days > 0))

	_detail.visible = _expanded
	if _expanded:
		_refresh_detail(smoke_days, pending)
	_measure()


## La carte : l'etat, le conseil et l'action de la case choisie, dans les
## mots de kit-row.tsx (`status`, `hint`, `action`).
func _refresh_detail(smoke_days: int, pending: bool) -> void:
	var copy := "kit.tools."
	var kind := _selected
	var amount := _count_of(kind)
	var remaining := _active_of(kind)
	var status := I18N.f(copy + "available", [amount])
	var hint := ""
	var label := ""
	var disabled := false
	_action = Callable()

	match kind:
		"trap":
			status += " · " + I18N.f(copy + "placed", [state.traps_placed()])
			hint = I18N.t(copy + "trapHint") if amount > 0 else I18N.t(copy + "trapEmpty")
			# Le prix de l'etal quand il est lu : c'est lui que le serveur
			# debite (SHOP.PRICES, reglable en direct), pas le fichier.
			var shop := ShopState.shared()
			var cost := int(shop.item("trap").get("price", Tuning.i("TRAPS.CARROT_COST")))
			var full := amount >= Tuning.i("TRAPS.MAX_HELD")
			var broke := shop.stock() < cost
			label = I18N.f(copy + "buyTrap", [I18N.group_digits(cost)])
			_action = func() -> void: buy_trap_pressed.emit()
			disabled = full or broke
			if full:
				hint = I18N.f("kit.trapsBuyFull", [amount])
			elif broke:
				hint = I18N.t(copy + "notEnough")
		"fence":
			var placed := state.fences_placed()
			status += " · " + I18N.f(copy + "placed", [placed])
			hint = I18N.t(copy + "fenceHint")
			if amount == 0 and placed == 0:
				hint = I18N.t(copy + "shopHint")
			elif state.fence_offers() == 0 and placed > 0:
				hint = I18N.f("kit.fenceAllWalled", [placed])
		"shield":
			hint = I18N.t(copy + "shieldActive") if remaining >= 0 else (I18N.t(copy + "shopHint") if amount == 0 else "")
			label = I18N.t(copy + "raiseShield")
			_action = func() -> void: use_shield.emit()
			disabled = amount == 0 or remaining >= 0
		"smoke":
			status = I18N.f(copy + "active", [str(smoke_days) + I18N.t("units.d")]) if smoke_days > 0 else I18N.t("shop.heldOff")
			hint = I18N.t(copy + "smokeHint")
		"water", "fertiliser":
			if amount == 0:
				hint = I18N.t(copy + "chestHint")
			label = I18N.t(copy + ("water" if kind == "water" else "fertilise"))
			_action = func() -> void: pour.emit(kind)
			disabled = amount == 0
		_:
			hint = I18N.t(copy + "attackHint")
	if remaining >= 0:
		status += " · " + I18N.f(copy + "active", [I18N.short_wait(remaining)])

	var blurb := I18N.t(copy + "waterEffect") if kind == "water" \
		else I18N.t(copy + "fertiliserEffect") if kind == "fertiliser" \
		else I18N.t("items.%s.blurb" % kind)

	for child in _detail_art_seat.get_children():
		child.queue_free()
	var art := ItemSlot.art_for(kind, ItemSlot.ART)
	_detail_art_seat.add_child(art)
	art.size = art.custom_minimum_size
	art.position = Vector2(floorf((ItemSlot.ART - art.size.x) * 0.5), 0.0)
	_detail_name.text = _name_of(kind)
	_detail_status.text = status
	_detail_blurb.text = blurb
	_detail_hint.text = hint
	_detail_hint.visible = not hint.is_empty()
	_detail_action.visible = not label.is_empty()
	_detail_action.relabel(label)
	_detail_action.disabled = pending or disabled
	# Eteint, le bouton est du bois, comme le web : un vert qui ne se presse
	# pas sous « pas assez de carottes » se contredisait.
	_detail_action.board = PlankButton.tone_board("wood" if _detail_action.disabled else "green")


func _update_visible() -> void:
	var here := bench_mode or (Screens.in_world() and Screens.place == Screens.Place.BURROW)
	visible = _open and here
