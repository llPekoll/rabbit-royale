class_name BurrowHud
extends Control
## LE HAUT DU TERRIER, KIT 04 — peint par Peko avec ChatGPT
## (art-source/burrow-hud-kit-20261013, 2026-10-13). Trois planches : la
## MAISON a gauche (orange, BURROW et son niveau), les CAROTTES au milieu
## (le chiffre, la jauge du coffre, sa legende), le POTAGER a droite (vert,
## HARVEST et ce qui attend). Les cotes passent DERRIERE la planche du
## milieu (18 px de recouvrement), qui leur projette une ombre de contact.
##
## TOUT EST DANS LES PIXELS DU KIT (`preview.gd`, une scene de 1180 de large)
## et pose a l'echelle `K` : le meme dessin, a la taille de l'ecran du jeu.
##
## L'ENTREE (`play_entrance`) : l'ensemble replie descend, puis les cotes
## sortent de sous le milieu, avec un rebond amorti de quelques pixels.
##
## SOUS BOUCLIER, la jauge est toute d'or et la legende dit le bouclier et
## son minuteur : rien n'est a prendre.

signal house_pressed
signal harvest_pressed

const CENTER := preload("res://assets/ui/burrow-hud/panel-center.png")
const WING_LEFT := preload("res://assets/ui/burrow-hud/panel-wing-left-separate.png")
const WING_RIGHT := preload("res://assets/ui/burrow-hud/panel-wing-right-separate.png")
const ORANGE := preload("res://assets/ui/burrow-hud/button-orange.png")
const GREEN := preload("res://assets/ui/burrow-hud/button-green.png")
const SPROUT := preload("res://assets/ui/burrow-hud/icon-sprout.png")
const SHIELD := preload("res://assets/ui/burrow-hud/icon-shield.png")
const BAG := preload("res://assets/ui/burrow-hud/icon-bag.png")
const FRAME := preload("res://assets/ui/burrow-hud/bar-frame.png")
const FILL_SAFE := preload("res://assets/ui/burrow-hud/bar-fill-safe.png")
const FILL_RISK := preload("res://assets/ui/burrow-hud/bar-fill-risk.png")
const BURROW_PANEL := preload("res://scripts/ui/burrow_panel.gd")

## Les pixels du kit vers ceux de l'ecran (890x400 logiques).
const K := 0.32
## Les trois planches, en pixels du kit, depuis le coin haut-gauche de
## l'ensemble : les cotes descendent de 27 et mordent 18 sous le milieu.
const LEFT_AT := Vector2(0, 27)
const CENTER_AT := Vector2(322, 0)
const RIGHT_AT := Vector2(792, 27)
const WING := Vector2(340, 136)
const MIDDLE := Vector2(488, 168)
## Ce que les bouts de la planche du milieu depassent de chaque cote.
const MIDDLE_OVERHANG := 30.0
const SPAN := Vector2(1132, 168)
## Le bouton dans son cote.
const BUTTON_AT := Vector2(39, 23)
const BUTTON := Vector2(265, 92)
## Les textes ne descendent pas sous ces tailles, quelle que soit `K` : a
## 0,32 les tailles du kit tombaient a 6 px.
const MIN_WORD := 10
const MIN_STOCK := 18
const MIN_LEGEND := 9
const CREAM := Color("fff1c6")
const SAFE_INK := Color("#ffd138")
const EXPOSED_INK := Color("#ff8a7a")

var house_button: Button
var harvest_button: Button
## La planche du milieu, pour qui la montre (la visite).
var middle: Control

var _body: Control
var _left: Control
var _right: Control
var _house_icon: TextureRect
var _house_word: Label
var _house_level: Label
var _house_dot: Control
var _harvest_word: Label
var _harvest_amount: Label
var _stock: Label
var _carrot: TextureRect
var _bar: Meter
var _legend: HBoxContainer
var _entrance: Tween
var _pulse := 0.0
var _garden_full := false
## LE POTAGER VIDE RANGE HARVEST (2026-10-13 : « range le harvest quand t'es
## a 0 ») : son cote rentre sous la planche du milieu, et ressort, avec le
## geste de l'entree, des qu'il y a quelque chose a rentrer.
var _harvest_out := true
var _wing: Tween
## EN JEU, le haut lit le terrier lui-meme (`Home`), et se relit chaque
## seconde : le potager pousse, le bouclier compte. Le banc, lui, le nourrit.
var live := false
var _clock := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size = SPAN * K
	custom_minimum_size = size
	_body = Control.new()
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.size = size
	add_child(_body)

	# Les cotes d'abord : le milieu se dessine par-dessus.
	_left = _group(LEFT_AT, WING)
	var lw := NineSlice.make(WING_LEFT, Vector4i(42, 0, 12, 0), Vector4(55, 0, 16, 0) * K)
	_fill(lw, _left)
	house_button = _button(_left, ORANGE)
	house_button.pressed.connect(func() -> void: house_pressed.emit())
	var house_skin: Control = house_button.get_meta("skin")
	_house_icon = _icon_at(house_skin, BurrowProps.home_art(1, true), Vector2(6, 13), 66)
	_house_word = _text(house_skin, 26, Rect2(78, 8, 182, 38))
	_house_level = _text(house_skin, 26, Rect2(78, 46, 182, 38))
	# Le point d'or : AMELIORER est payable.
	_house_dot = Kit.badge(10.0)
	_house_dot.size = Vector2(10, 10)
	_house_dot.position = Vector2(BUTTON.x * K - 7.0, -3.0)
	_house_dot.visible = false
	house_skin.add_child(_house_dot)

	_right = _group(RIGHT_AT, WING)
	var rw := NineSlice.make(WING_RIGHT, Vector4i(12, 0, 42, 0), Vector4(16, 0, 55, 0) * K)
	_fill(rw, _right)
	harvest_button = _button(_right, GREEN)
	harvest_button.pressed.connect(func() -> void: harvest_pressed.emit())
	var garden_skin: Control = harvest_button.get_meta("skin")
	_icon_at(garden_skin, SPROUT, Vector2(12, 18), 48)
	_harvest_word = _text(garden_skin, 26, Rect2(74, 8, 186, 38))
	_harvest_amount = _text(garden_skin, 26, Rect2(74, 46, 186, 38))

	var shadow := ContactShadow.new()
	shadow.hud = self
	_fill(shadow, _body)

	middle = _group(CENTER_AT, MIDDLE)
	# LA PLANCHE DE DIG au milieu (Kit.PLANK, 2026-10-14) : « la planche
	# centrale est trop droite, prends-en une avec des feuilles ». Trois
	# morceaux, sa hauteur suit la boite ; les bouts feuillus debordent un peu
	# sur les cotes (MIDDLE_OVERHANG), comme ceux du sol.
	var h := MIDDLE.y * K
	var cap := Kit.PLANK_CAP * h / float(Kit.PLANK.get_height())
	var mid := NineSlice.make(Kit.PLANK, Vector4i(Kit.PLANK_CAP, 0, Kit.PLANK_CAP, 0), Vector4(cap, 0, cap, 0), true)
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.position = Vector2(-MIDDLE_OVERHANG * K, 0)
	mid.size = Vector2(MIDDLE.x * K + 2.0 * MIDDLE_OVERHANG * K, h)
	middle.add_child(mid)
	var figure := HBoxContainer.new()
	figure.mouse_filter = Control.MOUSE_FILTER_IGNORE
	figure.alignment = BoxContainer.ALIGNMENT_CENTER
	figure.add_theme_constant_override("separation", roundi(14 * K))
	figure.position = Vector2(20, 4) * K
	figure.size = Vector2(448, 68) * K
	middle.add_child(figure)
	_carrot = Kit.icon(Kit.ICONS["carrot"], 60 * K)
	_carrot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	figure.add_child(_carrot)
	_stock = Kit.label("0", maxi(MIN_STOCK, roundi(50 * K)), CREAM, true)
	_stock.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	figure.add_child(_stock)
	_bar = Meter.new()
	_bar.position = Vector2(20, 76) * K
	_bar.size = Vector2(448, 40) * K
	middle.add_child(_bar)
	_legend = HBoxContainer.new()
	_legend.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_legend.alignment = BoxContainer.ALIGNMENT_CENTER
	_legend.add_theme_constant_override("separation", maxi(6, roundi(30 * K)))
	_legend.position = Vector2(20, 124) * K
	_legend.size = Vector2(448, 36) * K
	middle.add_child(_legend)


func _ready() -> void:
	if live:
		Home.changed.connect(read_home)
		I18N.locale_changed.connect(func(_c: String) -> void: read_home())
		read_home()


## LE TERRIER TEL QUE `Home` LE TIENT, dans les mots de `show_data`.
func read_home() -> void:
	var b := Home.burrow
	var stock := int(b.get("stock", 0))
	var shield: Variant = b.get("shieldMs", null)
	var shield_ms := float(shield) if (shield is float or shield is int) and float(shield) > 0.0 else -1.0
	# LE BOUCLIER SE DECOMPTE (2026-10-14) : `shieldMs` est mesure a la
	# lecture de /api/burrow ; la seconde qui tourne (`live`) lui retire le
	# temps passe depuis, sinon « 14h 11m » restait fige jusqu'a la relecture.
	if shield_ms > 0.0:
		shield_ms = maxf(0.0, shield_ms - float(Time.get_ticks_msec() - Home._fetched_ms))
	var safe: int = BURROW_PANEL.safe_stock(stock)
	show_data({
		"stock": stock,
		"safe": stock if shield_ms > 0.0 else safe,
		"exposed": 0 if shield_ms > 0.0 else maxi(0, stock - safe),
		"shield": shield_ms,
		"level": int(b.get("level", 1)),
		"can": bool(b.get("canUpgrade", false)) and not Home.pending,
		"garden": Home.live_garden(),
		"fill": Home.garden_fill(),
		"house_word": I18N.shout(I18N.t("burrow.word")),
	})


## Ce que l'ecran dit : `d` est le dictionnaire du labo (stock, safe,
## exposed, shield, level, can, garden, fill).
func show_data(d: Dictionary) -> void:
	var level := int(d.get("level", 1))
	_house_icon.texture = BurrowProps.home_art(level, true)
	_set_text(_house_word, String(d.get("house_word", "BURROW")))
	_set_text(_house_level, I18N.f("rabbitLevel.badge", [level]))
	_house_dot.visible = bool(d.get("can", false))
	var garden := int(d.get("garden", 0))
	_set_text(_harvest_word, I18N.shout(I18N.t("burrow.harvest")))
	_set_text(_harvest_amount, "+%s" % I18N.group_digits(garden))
	harvest_button.disabled = garden <= 0
	if (garden > 0) != _harvest_out:
		_harvest_out = garden > 0
		_slide_harvest()
	_garden_full = float(d.get("fill", 0.0)) >= 1.0
	_stock.text = I18N.group_digits(float(d.get("stock", 0)))
	var shield := float(d.get("shield", -1.0))
	var stock := int(d.get("stock", 0))
	if shield > 0.0:
		_bar.set_amounts(maxi(1, stock), maxi(1, stock), true)
	else:
		_bar.set_amounts(stock, int(d.get("safe", 0)), false)
	for c in _legend.get_children():
		c.queue_free()
	# HORS LIGNE (voyageur.gd) personne ne pille : tout est a l'abri, et la
	# legende des raids n'a rien a dire.
	if Voyageur.active:
		_bar.set_amounts(stock, stock, false)
		_fit_legend()
		return
	if shield > 0.0:
		_legend.add_child(_part(SHIELD, I18N.f("loop.shieldBadge", [I18N.wait(shield)]), SAFE_INK))
	else:
		_legend.add_child(_part(SHIELD, "%s %s" % [I18N.group_digits(float(d.get("safe", 0))),
			I18N.shout(I18N.t("burrow.safe"))], CREAM))
		var exposed := int(d.get("exposed", 0))
		_legend.add_child(_part(BAG, I18N.f("burrow.exposed", [I18N.group_digits(exposed)]),
			EXPOSED_INK if exposed > 0 else CREAM))
	_fit_legend()


## LA LEGENDE TIENT DANS LA PLANCHE : « 1 099 A L'ABRI · 141 EXPOSEES »
## debordait sur le potager. Ses textes rapetissent ensemble.
func _fit_legend() -> void:
	var labels: Array[Label] = []
	var fixed := float(_legend.get_theme_constant("separation")) * maxf(0.0, _legend.get_child_count() - 1)
	for row: HBoxContainer in _legend.get_children():
		fixed += row.get_child(0).custom_minimum_size.x + float(row.get_theme_constant("separation"))
		labels.append(row.get_child(1) as Label)
	var px := maxi(MIN_LEGEND, roundi(20 * K))
	while px > 7:
		var w := fixed
		for l in labels:
			w += l.get_theme_font("font").get_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		if w <= _legend.size.x:
			break
		px -= 1
	for l in labels:
		l.add_theme_font_size_override("font_size", px)


## Ou une piece sera une fois l'entree finie, dans l'ensemble ("house",
## "harvest", "middle") : la visite et la carte de la maison s'y posent sans
## attendre que les cotes aient fini de sortir.
func rest_rect(part: String) -> Rect2:
	match part:
		"house": return Rect2((LEFT_AT + BUTTON_AT) * K, BUTTON * K)
		"harvest": return Rect2((RIGHT_AT + BUTTON_AT) * K, BUTTON * K) if _harvest_out else Rect2()
	return Rect2(CENTER_AT * K, MIDDLE * K)


## Ou les carottes recoltees volent : la carotte du milieu, a l'ecran.
func carrot_target() -> Vector2:
	return _carrot.get_global_rect().get_center()


## La premiere image, au montage sous le rideau : eteint (UiEntrance).
func pose() -> void:
	modulate.a = 0.0


## L'ENTREE DU KIT : l'ensemble replie descend (les cotes caches sous le
## milieu), puis les cotes sortent, 4 px de trop et 1 de retour. `delay` :
## son rang dans la file des pieces qui arrivent (UiEntrance).
func play_entrance(delay: float = 0.0) -> void:
	modulate.a = 1.0
	if _entrance and _entrance.is_valid():
		_entrance.kill()
	if _wing and _wing.is_valid():
		_wing.kill()
	var tl := LEFT_AT * K
	# Rentre, HARVEST reste sous le milieu : il n'a rien a annoncer.
	var tr := RIGHT_AT * K if _harvest_out else _tucked()
	var bounce := 1.0 if _harvest_out else 0.0
	_left.position = Vector2((CENTER_AT.x + 40) * K, tl.y)
	_right.position = _tucked()
	_body.position = Vector2(0, -(position.y + size.y + UiEntrance.OFFSCREEN))
	_entrance = create_tween().set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	if delay > 0.0:
		_entrance.tween_interval(delay)
	_entrance.tween_property(_body, "position", Vector2(0, 3 * K), 0.44)
	_entrance.tween_property(_body, "position", Vector2.ZERO, 0.16).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_entrance.tween_interval(0.03)
	_entrance.tween_property(_left, "position", tl + Vector2(-4, 0) * K, 0.44)
	_entrance.parallel().tween_property(_right, "position", tr + Vector2(4, 0) * K * bounce, 0.44)
	_entrance.tween_property(_left, "position", tl + Vector2(1, 0) * K, 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_entrance.parallel().tween_property(_right, "position", tr + Vector2(-1, 0) * K * bounce, 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_entrance.tween_property(_left, "position", tl, 0.1).set_trans(Tween.TRANS_SINE)
	_entrance.parallel().tween_property(_right, "position", tr, 0.1).set_trans(Tween.TRANS_SINE)


## Le cote droit range sous le milieu.
func _tucked() -> Vector2:
	return Vector2((CENTER_AT.x + MIDDLE.x - 40 - WING.x) * K, RIGHT_AT.y * K)


## HARVEST SORT OU RENTRE. Pendant l'entree, on attend qu'elle ait fini :
## elle pose deja le cote ou il doit etre.
func _slide_harvest() -> void:
	harvest_button.mouse_filter = Control.MOUSE_FILTER_STOP if _harvest_out else Control.MOUSE_FILTER_IGNORE
	if _entrance and _entrance.is_running():
		return
	if _wing and _wing.is_valid():
		_wing.kill()
	var tr := RIGHT_AT * K
	_wing = create_tween()
	if _harvest_out:
		_wing.tween_property(_right, "position", tr + Vector2(4, 0) * K, 0.44).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
		_wing.tween_property(_right, "position", tr + Vector2(-1, 0) * K, 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_wing.tween_property(_right, "position", tr, 0.1).set_trans(Tween.TRANS_SINE)
	else:
		_wing.tween_property(_right, "position", _tucked(), 0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)


func _process(delta: float) -> void:
	if live and visible:
		_clock -= delta
		if _clock <= 0.0:
			_clock = 1.0
			read_home()
	# LE POTAGER PLEIN RESPIRE : c'est la chose a faire.
	if _garden_full and not harvest_button.disabled:
		_pulse += delta
		var a := 0.5 + 0.5 * sin(_pulse * 4.0)
		harvest_button.modulate = Color(1, 1, 1).lerp(Color(1.25, 1.2, 0.9), a)
	else:
		_pulse = 0.0
		harvest_button.modulate = Color.WHITE


# ── Les pieces ───────────────────────────────────────────────────────────────

func _group(at: Vector2, kit_size: Vector2) -> Control:
	var g := Control.new()
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	g.position = at * K
	g.size = kit_size * K
	_body.add_child(g)
	return g


func _fill(c: Control, parent: Control) -> void:
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(c)
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


## Le bouton peint du kit : sa face s'enfonce de 2 px sous le doigt, se
## grise quand il n'y a rien a faire.
func _button(wing: Control, face_tex: Texture2D) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "focus", "disabled", "hover_pressed"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	b.position = BUTTON_AT * K
	b.size = BUTTON * K
	wing.add_child(b)
	# La peau (la face et ce qu'elle porte) bouge d'un bloc ; le bouton, lui,
	# garde sa place et sa zone de tape.
	var skin := Control.new()
	_fill(skin, b)
	b.set_meta("skin", skin)
	var face := NineSlice.make(face_tex, Vector4i(8, 8, 8, 8), Vector4(8, 8, 8, 8) * K)
	_fill(face, skin)
	b.button_down.connect(func() -> void: skin.position.y = 2.0)
	b.button_up.connect(func() -> void: skin.position.y = 0.0)
	b.draw.connect(func() -> void:
		skin.modulate = Color(0.62, 0.62, 0.62) if b.disabled else Color.WHITE)
	return b


func _icon_at(parent: Control, tex: Texture2D, at: Vector2, h: float) -> TextureRect:
	var i := Kit.icon(tex, h * K)
	i.position = at * K
	i.size = i.custom_minimum_size
	parent.add_child(i)
	return i


func _text(parent: Control, kit_px: int, box: Rect2) -> Label:
	var px := maxi(MIN_WORD, roundi(kit_px * K))
	var l := Kit.label("", px, CREAM, true)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.position = box.position * K
	l.size = box.size * K
	l.set_meta("px", px)
	parent.add_child(l)
	return l


## Le texte, rapetisse jusqu'a tenir dans sa case (les mots des langues
## longues).
func _set_text(l: Label, text: String) -> void:
	l.text = text
	var px: int = l.get_meta("px")
	var font := l.get_theme_font("font")
	while px > 7 and font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x > l.size.x:
		px -= 1
	l.add_theme_font_size_override("font_size", px)


func _part(tex: Texture2D, text: String, ink: Color) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(8 * K))
	var i := Kit.icon(tex, maxf(9.0, 20 * K))
	i.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(i)
	var l := Kit.label(text, maxi(MIN_LEGEND, roundi(20 * K)), ink, true)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(l)
	return row


## LA JAUGE DU COFFRE (balance_bar.gd du kit) : l'or a l'abri, le rouge a
## prendre. Une seule frontiere arrondie au pixel, le rouge prend le reste ;
## le cadre garde son epaisseur a toute largeur. Le bouclier sur l'or, la
## sacoche sur le rouge, quand leur part a la place de les porter.
class Meter extends Control:
	var total := 0
	var safe := 0
	var shielded := false
	var _frame: NineSlice
	var _shield: TextureRect
	var _bag: TextureRect

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var edge := maxf(2.0, 3.0 * BurrowHud.K)
		_frame = NineSlice.make(BurrowHud.FRAME, Vector4i(8, 8, 8, 8), Vector4(edge, edge, edge, edge), false)
		add_child(_frame)
		_frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_shield = Kit.icon(BurrowHud.SHIELD, 0)
		_bag = Kit.icon(BurrowHud.BAG, 0)
		add_child(_shield)
		add_child(_bag)
		resized.connect(_layout)

	func set_amounts(new_total: int, new_safe: int, shield_up: bool) -> void:
		total = maxi(0, new_total)
		safe = maxi(0, new_safe)
		shielded = shield_up
		_layout()

	func _inner() -> Rect2:
		var e := _frame.inset()
		return Rect2(Vector2(e.x, e.y), size - Vector2(e.x + e.z, e.y + e.w))

	func _safe_w() -> float:
		var r := _inner()
		if total <= 0:
			return 0.0
		return clampf(roundf(r.size.x * float(mini(safe, total)) / float(total)), 0.0, r.size.x)

	func _layout() -> void:
		var r := _inner()
		var sw := _safe_w()
		var rw := (r.size.x - sw) if total > 0 else 0.0
		var ih := roundf(r.size.y * 0.72)
		var iw := ih * 16.0 / 20.0
		for pair in [[_shield, sw, r.position.x], [_bag, rw, r.position.x + sw]]:
			var icon: TextureRect = pair[0]
			var w: float = pair[1]
			icon.size = Vector2(iw, ih)
			icon.custom_minimum_size = Vector2.ZERO
			icon.visible = w >= iw + 6.0
			icon.position = Vector2(roundf(float(pair[2]) + (w - iw) * 0.5), roundf(r.position.y + (r.size.y - ih) * 0.5))
		queue_redraw()

	func _draw() -> void:
		var r := _inner()
		if r.size.x <= 0.0 or r.size.y <= 0.0:
			return
		draw_rect(r, Color("38251b"))
		if total <= 0:
			return
		var sw := _safe_w()
		var rw := r.size.x - sw
		if sw > 0.0:
			draw_texture_rect(BurrowHud.FILL_SAFE, Rect2(r.position, Vector2(sw, r.size.y)), false)
		if rw > 0.0:
			draw_texture_rect(BurrowHud.FILL_RISK, Rect2(r.position + Vector2(sw, 0), Vector2(rw, r.size.y)), false)
		if sw > 0.0 and rw > 0.0:
			draw_rect(Rect2(r.position + Vector2(sw, 0), Vector2(1, r.size.y)), Color("67412a"))


## L'OMBRE DE CONTACT du milieu sur le bois des cotes, jamais sur le vide.
class ContactShadow extends Control:
	var hud: BurrowHud

	func _process(_delta: float) -> void:
		queue_redraw()

	func _draw() -> void:
		var band := maxf(1.0, roundf(3.0 * BurrowHud.K))
		for side in 2:
			var wing: Control = hud._left if side == 0 else hud._right
			var surface := Rect2(wing.position + Vector2(0, 10) * BurrowHud.K, wing.size - Vector2(0, 18) * BurrowHud.K)
			var edge := hud.middle.position.x if side == 0 else hud.middle.position.x + hud.middle.size.x
			for i in 6:
				var x := edge - (i + 1) * band if side == 0 else edge + i * band
				var strip := Rect2(x, surface.position.y, band, surface.size.y).intersection(surface)
				if strip.has_area():
					draw_rect(strip, Color(0.09, 0.035, 0.015, 0.44 * pow(1.0 - i / 6.0, 1.4)))
