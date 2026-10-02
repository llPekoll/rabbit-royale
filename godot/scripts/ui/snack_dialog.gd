class_name SnackDialog
extends Dialog
## LA FENETRE DE SNACK TIME, batie comme l'etal (shop.gd) — le user : « hyper
## laid, et pas clair » (2026-10-02) pour la premiere, une bande de creux
## bruns sur le parchemin avec un bouton seul en dessous.
##
## Ce qui la rend lisible, pris aux calendriers de connexion des jeux mobiles :
##   • UNE CARTE PAR JOUR, comme les cartes de l'etal : une planche « JOUR N »
##     pendue en haut, un corps sombre, l'art dans un creux eclaire, et la
##     planche du bas. Le jeu n'a qu'un langage de carte ; celui-ci.
##   • LA RECOMPENSE GROSSIT A L'OEIL : une carotte le premier jour, un tas
##     le sixieme. Le chiffre le dit aussi, mais c'est le dessin qui fait
##     revenir.
##   • LE JOUR QUI ATTEND est la seule carte qui sautille, avec les rayons de
##     l'etal, et son bouton PRENDRE est SUR elle : on touche ce qu'on prend.
##   • LES JOURS PRIS sont eteints et coches ; ceux qui viennent attendent,
##     leur montant sur la planche.
##   • LE SEPTIEME, deux fois plus large et dore : les deux packs cote a
##     cote, et au septieme jour un bouton CHOISIR sous chacun.
##   • UNE LIGNE dessous : ce qui attend, ou quand vient le suivant et ce
##     qu'il donne.
##
## S'ouvre seule au retour d'une partie quand un snack attend
## (SnackState._try_open), et a chaque tap sur la banniere.

## Les mesures du Seeker (890x400) ; ailleurs, multipliees par `_k`.
const HUG_W := 860.0
const CARD_W := 96.0
const CARD_H := 168.0
const CARD_GAP := 10.0
## La planche du nom deborde en haut du corps, le bouton en bas.
const OVER_TOP := 16.0
const OVER_BOTTOM := 18.0
const SIGN_H := 32.0
const BUTTON_H := 36.0
const ART_ZONE := 84.0
const CARROT_PX := 38.0
const ITEM_PX := 34.0
## Le bouton PRENDRE deborde de la carte de chaque cote.
const BUTTON_SPILL := 10.0
## Les feuilles aux bouts d'une planche : le texte se tient entre elles.
const LEAF_ROOM := 34.0
## Carottes dessinees par jour : la recompense grossit a l'oeil.
const PILE := [1, 2, 3, 3, 4, 5]
## L'enseigne pendue, comme celle de l'etal.
const BANNER_W := 230.0
const BANNER_H := 50.0
const CARROT_TINT := Color("#e07a2f")
const GREEN := Color("#3d7a1f")
const DONE_ALPHA := 0.55

var _state: SnackState
var _k := 1.0
var _row: HBoxContainer
var _rule: Label
var _foot: VBoxContainer
var _banner: NineSlice
var _banner_text: Label
## Ce que le dernier snack pris a donne, pour le dire sous la bande.
var _last: Dictionary = {}


func _init() -> void:
	# Sans titre dans l'en-tete : l'enseigne pend en haut, comme l'etal.
	super("", HUG_W, 0.0)
	go_fullscreen()


func hug_size() -> Vector2:
	# Pas de defilement : le minimum du cadre porte deja tout le contenu.
	if _row == null:
		return Vector2(HUG_W * _k, 0.0)
	return Vector2(HUG_W * _k, _inset.get_combined_minimum_size().y)


static func open() -> SnackDialog:
	var dialog := SnackDialog.new()
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	Analytics.track("snack_open")
	_state = SnackState.shared()
	_k = clampf(get_viewport_rect().size.y / 400.0, 1.0, 1.4)

	# L'ENSEIGNE, sur le dialogue lui-meme, avec son ombre dure.
	var shadow := Kit.plank("wood")
	shadow.tint = Color(0, 0, 0, 0.45)
	shadow.set_meta("banner_shadow", true)
	add_child(shadow)
	_banner = Kit.plank("wood")
	add_child(_banner)
	_banner_text = Kit.label("", int(round(18 * _k)), Palette.CREAM, true)
	_banner_text.uppercase = I18N.pixel_face()
	_banner_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Kit.fill(_banner_text)
	_banner.add_child(_banner_text)
	for n: NineSlice in [shadow, _banner]:
		n.custom_minimum_size = Vector2(BANNER_W, BANNER_H) * _k
		n.size = n.custom_minimum_size
	move_child(close_button, get_child_count() - 1)

	var col := Kit.vbox(floorf(6.0 * _k))
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	set_body(col)
	# La place de l'enseigne, en tete de colonne.
	var room := Control.new()
	room.custom_minimum_size = Vector2(0, BANNER_H * _k - Kit.PAD)
	col.add_child(room)
	_rule = Kit.label("", int(round(12 * _k)), Palette.BARK)
	_rule.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_rule)
	_row = Kit.hbox(floorf(CARD_GAP * _k))
	_row.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(_row)
	_foot = Kit.vbox(2)
	_foot.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(_foot)

	_state.changed.connect(_rebuild)
	_state.claimed.connect(_on_claimed)
	I18N.locale_changed.connect(func(_c: String) -> void: _rebuild())
	resized.connect(_place_banner)
	_rebuild()
	_place_banner.call_deferred()
	_state.refresh()


func _place_banner() -> void:
	if _banner == null:
		return
	var at := Vector2(floorf((size.x - _banner.size.x) * 0.5), Kit.CLOSE_AIR)
	_banner.position = at
	for child in get_children():
		if child is NineSlice and child.has_meta("banner_shadow"):
			child.position = at + Vector2(0, 4)


func _on_claimed(reward: Dictionary) -> void:
	_last = reward
	Sound.play("match")
	_rebuild()


func _rebuild() -> void:
	if _row == null:
		return
	for box in [_row, _foot]:
		for child in box.get_children():
			box.remove_child(child)
			child.queue_free()
	_banner_text.text = I18N.shout(I18N.t("snack.title"))
	_rule.text = I18N.t("snack.ruleShort")
	if not _state.known():
		return
	for d in range(1, 7):
		_row.add_child(_day_card(d))
	_row.add_child(_pack_card())
	_build_foot()
	refit.call_deferred()


# ── Les cartes ───────────────────────────────────────────────────────────────

## Un jour a carottes : pris (eteint, coche), celui qui attend (dore, avec
## son bouton), ou a venir (son montant sur la planche).
func _day_card(d: int) -> Control:
	var done := d <= _state.taken()
	var now := d == _state.day() and _state.ready()
	var carrots := int(_state.day_info(d).get("carrots", 0))
	var w := floorf(CARD_W * _k)
	var card := _card_frame(w, now, CARROT_TINT)
	var body: Control = card.get_meta("body")

	var stage := _stage(body, w, now)
	var pile := _carrot_pile(PILE[clampi(d - 1, 0, PILE.size() - 1)], floorf(CARROT_PX * _k))
	pile.position = ((stage.size - pile.size) * 0.5).floor()
	stage.add_child(pile)
	var amount := Kit.label("+%d" % carrots, int(round(20 * _k)), Palette.LAMP, true)
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amount.position = Vector2(0, stage.position.y + stage.size.y)
	amount.size = Vector2(w, 22.0 * _k)
	body.add_child(amount)

	_sign(card, w, I18N.t("snack.today") if now else I18N.f("snack.day", [d]), "gold" if now else "wood")
	if now:
		var take := _button(card, w, I18N.t("snack.take"), "gold")
		take.pressed.connect(func() -> void: _take(""))
		_bounce(card.get_meta("lift"))
	elif done:
		(card.get_meta("lift") as Control).modulate = Color(1, 1, 1, DONE_ALPHA)
		_tick(card, w)
		_plank(card, w, I18N.t("snack.taken"), "wood")
	# A venir : rien en bas. Le montant est deja sur la carte, et une planche
	# de plus le disait deux fois.
	return card


## LE SEPTIEME : deux packs, dores, deux fois plus large.
func _pack_card() -> Control:
	var now := _state.is_pack_day() and _state.ready()
	var w := floorf(CARD_W * 2.0 * _k + CARD_GAP * _k)
	var card := _card_frame(w, true, Palette.GOLD)
	var body: Control = card.get_meta("body")
	var half := floorf(w * 0.5)
	# Le but de la semaine luit toujours : des rayons derriere les deux packs.
	var rays := Shop._rays(Palette.GOLD, w * 1.1)
	rays.position = Vector2(w, CARD_H * _k) * 0.5 - rays.size * 0.5
	body.add_child(rays)
	var i := 0
	for pack in SnackState.PACKS:
		var face := _pack_face(pack, half)
		face.position = Vector2(half * i, 0)
		body.add_child(face)
		i += 1
	# La couture entre les deux : « ou ».
	var either := Kit.label(I18N.t("snack.or"), int(round(11 * _k)), Palette.PARCHMENT, true)
	either.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	either.position = Vector2(half - 20.0 * _k, floorf(CARD_H * _k * 0.72))
	either.size = Vector2(40.0 * _k, 16.0 * _k)
	body.add_child(either)

	_sign(card, w, I18N.t("snack.today") if now else I18N.f("snack.day", [7]), "gold")
	if now:
		var lift: Control = card.get_meta("lift")
		var j := 0
		for pack in SnackState.PACKS:
			var b := Kit.button(I18N.shout(I18N.t("snack.choose")), "gold", half - 6.0, floorf(BUTTON_H * _k))
			b.label_size = int(round(12 * _k))
			b.position = Vector2(half * j + 3.0, _bottom_y())
			b.set_deferred("size", Vector2(half - 6.0, floorf(BUTTON_H * _k)))
			b.pressed.connect(func() -> void: _take(pack))
			lift.add_child(b)
			j += 1
		_bounce(lift)
	else:
		_plank(card, w, I18N.t("snack.pickOne"), "gold")
	return card


func _pack_face(pack: String, w: float) -> Control:
	var face := Control.new()
	face.size = Vector2(w, CARD_H * _k)
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shout := I18N.shout(SnackState.pack_name(pack))
	var name := Kit.label(shout, Shop._fit(shout, int(round(12 * _k)), w - 8.0), Palette.CREAM, true)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.position = Vector2(0, floorf(22.0 * _k))
	name.size = Vector2(w, 16.0 * _k)
	face.add_child(name)
	var line := I18N.t("snack.hatWhat") if pack == "magic_hat" else I18N.t("snack.footWhat")
	var what := Kit.label(line, Shop._fit(line, int(round(10 * _k)), w - 8.0), Palette.PARCHMENT)
	what.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	what.position = Vector2(0, floorf(38.0 * _k))
	what.size = Vector2(w, 14.0 * _k)
	face.add_child(what)
	var items := Kit.hbox(floorf(4.0 * _k))
	items.alignment = BoxContainer.ALIGNMENT_CENTER
	items.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for it in _state.pack_items(pack):
		if not it is Dictionary:
			continue
		var cell := Kit.vbox(0)
		cell.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var art := ItemSlot.art_for(String(it.get("kind", "")), floorf(ITEM_PX * _k))
		art.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		cell.add_child(art)
		var qty := Kit.label("x%d" % int(it.get("qty", 1)), int(round(11 * _k)), Palette.CREAM, true)
		qty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cell.add_child(qty)
		items.add_child(cell)
	items.position = Vector2(0, floorf(62.0 * _k))
	items.size = Vector2(w, 50.0 * _k)
	face.add_child(items)
	return face


# ── Les pieces d'une carte, comme l'etal ─────────────────────────────────────

## Le cadre : `lift` porte tout (il saute, il s'eteint), le corps sombre a la
## teinte de la recompense, bord dore pour ce qui attend.
func _card_frame(w: float, lit: bool, tint: Color) -> Control:
	var h := floorf(CARD_H * _k)
	var top := floorf(OVER_TOP * _k)
	var card := Control.new()
	card.custom_minimum_size = Vector2(w, top + h + floorf(OVER_BOTTOM * _k))
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var lift := Control.new()
	lift.size = card.custom_minimum_size
	lift.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(lift)
	var style := StyleBoxFlat.new()
	style.bg_color = tint.lerp(Palette.SOIL, 0.65).lerp(tint.lerp(Palette.SOIL_DEEP, 0.8), 0.5)
	style.set_border_width_all(int(3 * _k))
	style.border_color = Palette.GOLD if lit else Palette.WELL_FACE
	style.set_corner_radius_all(int(12 * _k))
	style.shadow_color = Palette.SOIL_DEEP
	style.shadow_size = 2
	style.set_content_margin_all(0)
	var body := Kit.panel(style)
	body.position = Vector2(0, top)
	body.size = Vector2(w, h)
	body.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lift.add_child(body)
	var inside := Control.new()
	inside.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inside.size = body.size
	body.add_child(inside)
	card.set_meta("lift", lift)
	card.set_meta("body", inside)
	return card


## Le creux eclaire de l'art ; les rayons de l'etal tournent derriere ce qui
## attend.
func _stage(body: Control, w: float, lit: bool) -> Control:
	var zone := floorf(ART_ZONE * _k)
	var stage := Control.new()
	stage.size = Vector2(zone, zone)
	stage.position = Vector2(floorf((w - zone) * 0.5), floorf(22.0 * _k))
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(stage)
	var centre := stage.size * 0.5
	if lit:
		var rays := Shop._rays(Palette.GOLD, w * 1.2)
		rays.position = centre - rays.size * 0.5
		stage.add_child(rays)
	var glow := TextureRect.new()
	glow.texture = Shop._glow_texture(CARROT_TINT.lightened(0.35), 0.8 if lit else 0.45)
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.stretch_mode = TextureRect.STRETCH_SCALE
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.size = stage.size * 1.3
	glow.position = centre - glow.size * 0.5
	stage.add_child(glow)
	return stage


## LE TAS : `n` carottes en eventail, la plus haute au milieu.
func _carrot_pile(n: int, px: float) -> Control:
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var step := px * 0.42
	box.size = Vector2(px + step * float(n - 1), px * 1.1)
	var mid := float(n - 1) * 0.5
	for i in n:
		var c := Kit.icon(Kit.ICONS["carrot"], px)
		c.pivot_offset = Vector2(px, px) * 0.5
		c.rotation = deg_to_rad((float(i) - mid) * 12.0)
		c.position = Vector2(step * float(i), absf(float(i) - mid) * px * 0.12).floor()
		box.add_child(c)
	return box


## La planche pendue en haut : JOUR N, ou AUJOURD'HUI en or.
func _sign(card: Control, w: float, text: String, tone: String) -> void:
	var sign := Kit.plank(tone)
	# La planche du jour qui attend deborde comme son bouton : « Aujourd'hui »
	# ne tenait pas dans la largeur d'une carte.
	var spill := floorf(BUTTON_SPILL * _k) if tone == "gold" and w < CARD_W * 1.5 * _k else 0.0
	sign.size = Vector2(w - 4.0 + spill * 2.0, floorf(SIGN_H * _k))
	sign.position = Vector2(2.0 - spill, 0.0)
	(card.get_meta("lift") as Control).add_child(sign)
	var shout := I18N.shout(text)
	var label := Kit.label(shout, Shop._fit(shout, int(round(11 * _k)), sign.size.x - LEAF_ROOM * _k), Kit.plank_ink(tone), tone != "gold")
	label.uppercase = I18N.pixel_face()
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	Kit.fill(label)
	sign.add_child(label)


## Le bouton du bas, sur le bord comme le prix de l'etal.
func _button(card: Control, w: float, text: String, tone: String) -> PlankButton:
	# PLUS LARGE QUE LA CARTE : c'est LE bouton de la fenetre, et a la
	# largeur d'une carte la planche rapetissait « PRENDRE » a 9px.
	var bw := w + floorf(BUTTON_SPILL * 2.0 * _k)
	var b := Kit.button(I18N.shout(text), tone, bw, floorf(BUTTON_H * _k))
	b.label_size = int(round(15 * _k))
	b.position = Vector2(-floorf(BUTTON_SPILL * _k), _bottom_y())
	b.set_deferred("size", Vector2(bw, floorf(BUTTON_H * _k)))
	(card.get_meta("lift") as Control).add_child(b)
	return b


## La planche du bas quand il n'y a rien a toucher : le montant, PRIS.
func _plank(card: Control, w: float, text: String, tone: String) -> void:
	var p := Kit.plank(tone)
	p.size = Vector2(w, floorf(BUTTON_H * _k))
	p.position = Vector2(0.0, _bottom_y())
	(card.get_meta("lift") as Control).add_child(p)
	var shout := I18N.shout(text)
	var label := Kit.label(shout, Shop._fit(shout, int(round(12 * _k)), w - LEAF_ROOM * _k), Kit.plank_ink(tone), tone != "gold")
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	Kit.fill(label)
	p.add_child(label)


func _bottom_y() -> float:
	return floorf(OVER_TOP * _k) + floorf(CARD_H * _k) - floorf(BUTTON_H * _k) + floorf(OVER_BOTTOM * _k)


## LA COCHE d'un jour pris, grosse, au milieu du corps.
func _tick(card: Control, w: float) -> void:
	var tick := Tick.new()
	tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tick.size = Vector2(w, floorf(CARD_H * _k))
	tick.position = Vector2(0, floorf(OVER_TOP * _k) - 8.0 * _k)
	card.add_child(tick)


## CE QUI ATTEND SAUTILLE : la seule chose a toucher.
func _bounce(lift: Control) -> void:
	var t := lift.create_tween().set_loops()
	t.tween_property(lift, "position:y", -5.0 * _k, 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	t.tween_property(lift, "position:y", 0.0, 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.tween_interval(0.6)


# ── Sous la bande ────────────────────────────────────────────────────────────

func _build_foot() -> void:
	if not _last.is_empty():
		var pack: Variant = _last.get("pack")
		var got := I18N.f("snack.gotPack", [SnackState.pack_name(pack)]) if pack is String \
			else I18N.f("snack.got", [int(_last.get("carrots", 0))])
		_foot.add_child(_line(got, 18, GREEN))
	if _state.ready():
		if _last.is_empty():
			_foot.add_child(_line(I18N.t("snack.pick") if _state.is_pack_day() else I18N.t("snack.ready"), 16, Palette.INK))
		return
	# PRIS : quand vient le suivant et ce qu'il donne — la ligne qui fait
	# revenir demain.
	var next := _state.day()
	var tomorrow := I18N.t("snack.tomorrowPack") if next >= 7 \
		else I18N.f("snack.tomorrow", [int(_state.day_info(next).get("carrots", 0))])
	_foot.add_child(_line("%s · %s" % [I18N.f("snack.nextIn", [I18N.wait(_state.wait_ms())]), tomorrow], 14, Palette.INK))
	if next == 1 and int(_last.get("day", 0)) == 7:
		_foot.add_child(_line(I18N.t("snack.weekDone"), 12, Palette.BARK))


func _take(pack: String) -> void:
	if _state.pending:
		return
	await _state.claim(pack)


func _line(text: String, px: int, color: Color) -> Label:
	var l := Kit.label(text, int(round(px * _k)), color)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


class Tick extends Control:
	func _draw() -> void:
		var s := minf(size.x, size.y) * 0.38
		var c := size * 0.5
		var pts := PackedVector2Array([c + Vector2(-s * 0.6, 0.0), c + Vector2(-s * 0.12, s * 0.5), c + Vector2(s * 0.7, -s * 0.55)])
		draw_polyline(pts, Color("#1d100a"), 12.0, true)
		draw_polyline(pts, Color("#87bd3a"), 7.0, true)
