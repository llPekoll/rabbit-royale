class_name SnackDialog
extends Dialog
## LA FENETRE DE SNACK TIME : la semaine entiere sous les yeux.
##
## Sept cases en rang. Les six premieres sont des carottes qui montent, la
## septieme — deux fois plus large, doree — porte les deux packs a choisir :
## Magic Hat pour attaquer, Lucky Foot pour defendre. Les prises sont
## cochees et eteintes, celle du jour s'allume. Sous la bande, UNE phrase et
## UN bouton : ce qui attend et « Prendre », ou, une fois pris, ce que demain
## donne et combien de snacks restent avant le septieme — c'est ce qui dit
## au joueur de revenir demain.
##
## S'ouvre seule au retour au terrier quand un snack attend
## (SnackState._try_open), et a chaque tap sur la banniere.

## Ce que le contenu veut (pass_dialog.gd `HUG_W`) : sur le Seeker la
## fenetre prend l'ecran, sur un bureau elle s'arrete la.
const HUG_W := 800.0
const CARD_W := 86.0
const CARD_H := 156.0
const PACK_W := 118.0
const CARROT_PX := 46.0
const ITEM_PX := 36.0
const GREEN := Color("#3d7a1f")
const DIM := 0.45

var _state: SnackState
var _strip: HBoxContainer
var _foot: VBoxContainer
var _day_label: Label
## Ce que le dernier snack pris a donne, pour le dire sous la bande.
var _last: Dictionary = {}


func _init() -> void:
	super(I18N.t("snack.title"), HUG_W, 0.0)
	reframe(PassBanner.plate_texture(), PassBanner.PLATE_SLICE, Vector4(PassBanner.PLATE_SLICE) * PassBanner.pixel_scale(400.0))
	go_fullscreen()


func hug_size() -> Vector2:
	# Pas de defilement ici : le minimum du cadre porte deja la bande et le
	# pied (le pass ajoute ses colonnes parce qu'elles defilent).
	if _strip == null:
		return Vector2(HUG_W, 0.0)
	return Vector2(HUG_W, _inset.get_combined_minimum_size().y)


static func open() -> SnackDialog:
	var dialog := SnackDialog.new()
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	Analytics.track("snack_open")
	var k := PassBanner.pixel_scale(get_viewport_rect().size.y)
	reframe(PassBanner.plate_texture(), PassBanner.PLATE_SLICE, Vector4(PassBanner.PLATE_SLICE) * k)
	_state = SnackState.shared()

	var header := title_label.get_parent()
	title_label.text = I18N.shout(I18N.t("snack.title"))
	var carrot := Kit.icon(Kit.ICONS["carrot"], 20)
	header.add_child(carrot)
	header.move_child(carrot, 0)
	_day_label = Kit.label("", 14, Palette.BARK)
	header.add_child(_day_label)
	header.move_child(_day_label, header.get_child_count() - 2)

	var col := Kit.vbox(Kit.PAD)
	set_body(col)
	var rule := Kit.wrapped(Kit.label(I18N.t("snack.rule"), 12, Palette.BARK))
	rule.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(rule)
	_strip = Kit.hbox(Kit.PAD_TIGHT)
	_strip.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(_strip)
	_foot = Kit.vbox(Kit.PAD_TIGHT)
	_foot.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(_foot)

	_state.changed.connect(_rebuild)
	_state.claimed.connect(_on_claimed)
	I18N.locale_changed.connect(func(_c: String) -> void: _rebuild())
	_rebuild()
	_state.refresh()


func _on_claimed(reward: Dictionary) -> void:
	_last = reward
	Sound.play("match")
	_rebuild()


func _rebuild() -> void:
	if _strip == null:
		return
	for box in [_strip, _foot]:
		for child in box.get_children():
			box.remove_child(child)
			child.queue_free()
	_day_label.text = I18N.f("snack.dayOf", [_state.day()]) if _state.known() else ""
	for d in range(1, 7):
		_strip.add_child(_day_card(d))
	_strip.add_child(_pack_card())
	_build_foot()
	refit.call_deferred()


## LE SNACK D'UN JOUR : jour N, la carotte, le compte.
func _day_card(d: int) -> Control:
	var info := _state.day_info(d)
	var done := d <= _state.taken()
	var today := d == _state.day() and _state.ready()
	var card := Kit.panel(Kit.style_well(today))
	card.custom_minimum_size = Vector2(CARD_W, CARD_H)
	var v := Kit.vbox(Kit.PAD_TIGHT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	card.add_child(v)
	var name := Kit.label(I18N.f("snack.day", [d]), 14, Palette.CREAM, true)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(name)
	var icon := Kit.icon(Kit.ICONS["carrot"], CARROT_PX)
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	v.add_child(icon)
	var n := Kit.label("+%d" % int(info.get("carrots", 0)), 20, Palette.LAMP, true)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(n)
	if done:
		# Eteinte, mais la coche reste vive : elle est ce qu'on a gagne.
		v.modulate = Color(1, 1, 1, DIM)
		card.self_modulate = Color(1, 1, 1, 0.7)
		_tick_on(card)
	if today:
		_glow(card)
	return card


## LE SEPTIEME JOUR : les deux packs cote a cote, dores, plus gros que tout.
func _pack_card() -> Control:
	var pick_now := _state.is_pack_day() and _state.ready()
	var style := Kit.style_well(true)
	style.bg_color = Color("#8a5a1c")
	style.border_color = Palette.GOLD
	var card := Kit.panel(style)
	card.custom_minimum_size = Vector2(PACK_W * 2.0 + Kit.PAD, CARD_H)
	var v := Kit.vbox(Kit.PAD_TIGHT)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	card.add_child(v)
	var name := Kit.label(I18N.f("snack.day", [7]), 14, Palette.GOLD, true)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(name)
	var row := Kit.hbox(Kit.PAD)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(row)
	for pack in SnackState.PACKS:
		row.add_child(_pack_face(pack, pick_now))
	if pick_now:
		_glow(card)
	return card


func _pack_face(pack: String, pick_now: bool) -> Control:
	var v := Kit.vbox(Kit.PAD_TIGHT)
	v.custom_minimum_size = Vector2(PACK_W, 0)
	var title := Kit.label(I18N.shout(SnackState.pack_name(pack)), 14, Palette.CREAM, true)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)
	var what := Kit.label(I18N.t("snack.hatWhat") if pack == "magic_hat" else I18N.t("snack.footWhat"), 11, Palette.PARCHMENT)
	what.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(what)
	var items := Kit.hbox(Kit.PAD_TIGHT)
	items.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(items)
	for it in _state.pack_items(pack):
		if not it is Dictionary:
			continue
		var cell := Kit.hbox(1)
		cell.add_child(ItemSlot.art_for(String(it.get("kind", "")), ITEM_PX))
		var qty := int(it.get("qty", 1))
		if qty > 1:
			var x := Kit.label("x%d" % qty, 13, Palette.CREAM, true)
			x.size_flags_vertical = Control.SIZE_SHRINK_END
			cell.add_child(x)
		items.add_child(cell)
	if pick_now:
		var b := Kit.button(I18N.t("snack.choose"), "gold", PACK_W - 4.0, 34.0)
		b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void: _take(pack))
		v.add_child(b)
	return v


## SOUS LA BANDE : ce qui attend et le bouton, ou ce qui vient.
func _build_foot() -> void:
	if not _state.known():
		return
	if not _last.is_empty():
		var pack := String(_last.get("pack", "")) if _last.get("pack") is String else ""
		var got := I18N.f("snack.gotPack", [SnackState.pack_name(pack)]) if not pack.is_empty() \
			else I18N.f("snack.got", [int(_last.get("carrots", 0))])
		_foot.add_child(_line(got, 20, GREEN))
	if _state.ready():
		if _last.is_empty():
			_foot.add_child(_line(I18N.t("snack.ready"), 18, Palette.INK))
		if _state.is_pack_day():
			_foot.add_child(_line(I18N.t("snack.pick"), 16, Palette.BARK))
		else:
			var b := Kit.button(I18N.t("snack.take"), "gold", 220.0, 48.0)
			b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			b.pressed.connect(func() -> void: _take(""))
			_foot.add_child(b)
		return
	# PRIS : demain, et combien avant le septieme. C'est la ligne qui fait
	# revenir — elle passe avant le compte a rebours.
	var next := _state.day()
	if next >= 7:
		_foot.add_child(_line(I18N.t("snack.tomorrowPack"), 16, Palette.INK))
	else:
		_foot.add_child(_line(I18N.f("snack.tomorrow", [int(_state.day_info(next).get("carrots", 0))]), 16, Palette.INK))
		_foot.add_child(_line(I18N.f("snack.toPack", [7 - next]), 13, Palette.BARK))
	if next == 1 and int(_last.get("day", 0)) == 7:
		_foot.add_child(_line(I18N.t("snack.weekDone"), 13, Palette.BARK))
	_foot.add_child(_line(I18N.f("snack.nextIn", [I18N.wait(_state.wait_ms())]), 12, Palette.BARK))


func _take(pack: String) -> void:
	if _state.pending:
		return
	await _state.claim(pack)


func _line(text: String, px: int, color: Color) -> Label:
	var l := Kit.wrapped(Kit.label(text, px, color))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


## LA CASE DU JOUR RESPIRE : elle est la seule chose a toucher.
func _glow(card: Control) -> void:
	card.resized.connect(func() -> void: card.pivot_offset = card.size * 0.5)
	var t := card.create_tween().set_loops()
	t.tween_property(card, "scale", Vector2(1.06, 1.06), 0.45).set_trans(Tween.TRANS_SINE)
	t.tween_property(card, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_SINE)


## LA COCHE d'un jour pris, par-dessus la case eteinte.
func _tick_on(card: Control) -> void:
	var tick := Tick.new()
	tick.set_anchors_preset(Control.PRESET_FULL_RECT)
	tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(tick)


class Tick extends Control:
	func _draw() -> void:
		var s := minf(size.x, size.y) * 0.42
		var c := size * 0.5
		var pts := PackedVector2Array([c + Vector2(-s * 0.55, 0.0), c + Vector2(-s * 0.1, s * 0.45), c + Vector2(s * 0.6, -s * 0.5)])
		draw_polyline(pts, Color("#1d100a"), 9.0, true)
		draw_polyline(pts, Color("#87bd3a"), 5.0, true)
