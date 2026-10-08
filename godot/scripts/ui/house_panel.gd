class_name HousePanel
extends Control
## LE VOLET DU TERRIER (2026-10-01), sous les boutons du haut a droite. Il
## remplace la planche AMELIORER posee sur la maison, qui ne disait que son
## prix, et la carte qu'elle ouvrait au milieu de l'ecran : le niveau, ce que
## le suivant apporte, les carottes a l'abri d'un raid et celles qui ne le
## sont pas, et le bouton AMELIORER.
##
## DEUX ETATS, A LA MEME PLACE : deplie, le panneau ; sa croix le replie en
## un bouton (la maison et son niveau) colle au meme coin, qui le redeplie.
## Sur 890x400 il n'y a pas de place libre : deplie, il couvre la boutique ;
## replie, presque rien. Replie, un point rouge bat quand l'amelioration est
## payable. L'etat survit aux traversees (`_expanded`, statique).
##
## CALE SUR LE RAIL DU HAUT, pas sur une hauteur fixe : ses boutons
## grandissent avec l'ecran (Kit.icon_square), et un volet pose a TOPBAR_H
## passait dessous en plein ecran. Il grandit avec eux (`_k`), bati a la
## taille finale — `canvas_items` garde le texte net.
##
## SOMBRE ET TRANSLUCIDE comme les legendes ; le coffre en barre — l'or a
## l'abri, le rouge expose (choisi parmi trois propositions, 2026-10-01).
##
## LES BOUTEILLES SE VERSENT ICI (2026-10-08). Arrosoir et engrais tombent
## des coffres, mais on ne pouvait les verser nulle part : l'onglet GARDEN de
## la rangee du kit est parti (rien n'y etait branche), et la carte du jardin
## qui devait les reprendre n'est plus dans la colonne (`quest_only`). Pas
## sur le potager, deja charge de HARVEST : sous AMELIORER, ce qui fait
## grandir le terrier. Seulement celles qu'on tient, et allumees meme
## pendant que la precedente agit : le serveur ALLONGE la fenetre
## (inventory.ts `extendGardenBoost`). Eteintes seulement quand une bouteille
## de plus passerait le plafond de 24 h (`boost_capped`) — un gris pendant
## que ca agit se lisait « tu n'en as pas » (le user, 2026-10-08). Replie,
## leurs icones suivent BURROW N : on comprend tout
## de suite qu'il y a de quoi arroser, la ou un point rouge ne disait pas
## quoi (le user, 2026-10-08).

const SAFE_INK := Color("#ffd138")
const EXPOSED_INK := Color("#ff8a7a")
const NEXT_INK := Color("#9be37a")
const BURROW_PANEL := preload("res://scripts/ui/burrow_panel.gd")

## Le rail sur le Seeker (890x400) : a cette taille, `_k` vaut 1.
const RAIL_REF := 44.0
## L'air entre le rail et le volet.
const GAP := 8.0
## La largeur du panneau deplie ; le bouton replie prend la sienne.
const PANEL_W := 196.0
## L'echelle d'ou part le panneau qui se deplie, ou il va en se repliant :
## il pousse depuis son coin haut droit, celui du bouton.
const FOLDED := 0.55
const UNFOLD_SECONDS := 0.24
const FOLD_SECONDS := 0.16
## Le point rouge, sur le coin haut droit du bouton replie.
const DOT_SIZE := 14.0
## LA MAISON DU BOUTON REPLIE, grosse, posee sur le bas du bouton et qui
## deborde du cadre en haut et a gauche : on la reconnait d'un coup d'oeil.
const HOUSE_ART := Vector2(52, 46)
const HOUSE_SPILL := 16.0
const BUTTON_H := 28.0

## Replie ou deplie, d'une visite du terrier a l'autre. Replie au depart.
static var _expanded := false

var _panel: PanelContainer
var _button: Button
var _dot: PulseDot
var _signature := ""
var _anim: Tween
## L'echelle du volet, celle du rail (1 sur le Seeker).
var _k := 1.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func _ready() -> void:
	Home.changed.connect(_rebuild)
	I18N.locale_changed.connect(func(_c: String) -> void:
		_signature = ""
		_rebuild())
	get_viewport().size_changed.connect(_rebuild)
	_rebuild()


func expand() -> void:
	if _expanded:
		return
	_expanded = true
	_morph(true)


func fold() -> void:
	if not _expanded:
		return
	_expanded = false
	_morph(false)


## LE PASSAGE : le panneau pousse depuis le coin du bouton (ou s'y range),
## pendant que le bouton s'efface (ou revient).
func _morph(open: bool) -> void:
	if not is_instance_valid(_panel):
		return
	if _anim != null and _anim.is_valid():
		_anim.kill()
	_place()
	_panel.pivot_offset = Vector2(_panel.size.x, 0.0)
	_button.pivot_offset = Vector2(_button.size.x, 0.0)
	_panel.visible = true
	_button.visible = true
	_anim = create_tween().set_parallel(true)
	if open:
		_panel.scale = Vector2.ONE * FOLDED
		_panel.modulate.a = 0.0
		_anim.tween_property(_panel, "scale", Vector2.ONE, UNFOLD_SECONDS) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		_anim.tween_property(_panel, "modulate:a", 1.0, UNFOLD_SECONDS * 0.6)
		_anim.tween_property(_button, "modulate:a", 0.0, UNFOLD_SECONDS * 0.4)
	else:
		_button.modulate.a = 0.0
		_button.scale = Vector2.ONE * 0.8
		_anim.tween_property(_panel, "scale", Vector2.ONE * FOLDED, FOLD_SECONDS) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		_anim.tween_property(_panel, "modulate:a", 0.0, FOLD_SECONDS)
		_anim.tween_property(_button, "modulate:a", 1.0, FOLD_SECONDS).set_delay(FOLD_SECONDS * 0.5)
		_anim.tween_property(_button, "scale", Vector2.ONE, FOLD_SECONDS) \
			.set_delay(FOLD_SECONDS * 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_anim.chain().tween_callback(_settle)


## L'etat pose, sans animation : un seul des deux se voit et se tape.
func _settle() -> void:
	if not is_instance_valid(_panel):
		return
	_panel.visible = _expanded
	_panel.scale = Vector2.ONE
	_panel.modulate.a = 1.0
	_button.visible = not _expanded
	_button.scale = Vector2.ONE
	_button.modulate.a = 1.0


## Ce que le panneau dit, lu du terrier. `next` est ce que le serveur annonce
## pour le niveau suivant (burrow.ts `next`), null au dernier.
func _data() -> Dictionary:
	var b := Home.burrow
	var stock := int(b.get("stock", 0))
	var safe: int = BURROW_PANEL.safe_stock(stock)
	var next: Variant = b.get("next", null)
	return {
		"level": int(b.get("level", 1)),
		"safe": safe,
		"exposed": maxi(0, stock - safe),
		"yield": int(b.get("yieldPerHour", 0)),
		"regen": int(b.get("regenPerHour", 0)),
		"next_yield": int(next.get("yieldPerHour", 0)) if next is Dictionary else -1,
		"next_regen": int(next.get("regenPerHour", 0)) if next is Dictionary else -1,
		"cost": b.get("upgradeCost", null),
		"can": bool(b.get("canUpgrade", false)) and not Home.pending,
		"bottles": _bottles(b),
	}


## Les bouteilles TENUES : `[kind, combien, plafonnee]`, dans l'ordre du
## jardin (`boosts` de /api/burrow). Plafonnee : la fenetre en cours plus une
## bouteille passe GARDEN_BOOST.MAX_BANKED_MS, et le serveur refuserait
## (inventory.ts `gardenBoostBlocker`).
static func _bottles(b: Dictionary) -> Array:
	var out := []
	var boosts: Variant = b.get("boosts", {})
	for kind in ["water", "fertiliser"]:
		var boost: Variant = (boosts as Dictionary).get(kind) if boosts is Dictionary else null
		if not boost is Dictionary or int(boost.get("held", 0)) <= 0:
			continue
		var active: Variant = boost.get("activeMs", null)
		var left := float(active) if active is float or active is int else 0.0
		var one := float(boost.get("durationMs", Tuning.n("GARDEN_BOOST.%s.DURATION_MS" % kind.to_upper())))
		out.append([kind, int(boost.get("held", 0)), left + one > Tuning.n("GARDEN_BOOST.MAX_BANKED_MS")])
	return out




func _rebuild() -> void:
	if not Home.loaded():
		return
	_k = maxf(1.0, Kit.icon_square(get_viewport_rect().size.y) / RAIL_REF)
	var d := _data()
	# Rien n'a bouge : on ne refait pas l'arbre (Home.changed tombe souvent).
	var sig := var_to_str(d) + str(_k)
	if sig == _signature and is_instance_valid(_panel):
		return
	_signature = sig
	if is_instance_valid(_panel):
		_panel.queue_free()
		_button.queue_free()
	if _anim != null and _anim.is_valid():
		_anim.kill()
	_panel = _build_panel(d)
	add_child(_panel)
	_button = _build_button(d)
	add_child(_button)
	_settle()
	_place()


func _process(_delta: float) -> void:
	_place()


## Une mesure du Seeker a l'echelle du rail.
func _s(v: float) -> float:
	return roundf(v * _k)


func _f(v: float) -> int:
	return roundi(v * _k)


## LE HAUT A DROITE — le lapin du joueur —, la ou il est
## vraiment dessine. C'etait le rail des boutons ; il est passe a gauche
## (2026-10-08) et le volet l'y avait suivi, par-dessus la quete.
func _rail_rect() -> Rect2:
	var bar := TopBar.live
	if bar == null or not is_instance_valid(bar):
		return Rect2()
	return bar.corner_rect()


## SOUS LE RAIL, son bord droit sur le bord droit du rail, le panneau et le
## bouton alignes sur le meme coin haut droit. Hors du terrier, ou pendant
## une pose (la colonne s'efface), ils se cachent.
func _place() -> void:
	if not is_instance_valid(_panel):
		return
	var chrome := Chrome.current
	visible = Screens.in_world() and Screens.place == Screens.Place.BURROW \
		and chrome != null and chrome._column != null and chrome._column.visible
	if not visible:
		return
	var rail := _rail_rect()
	var right := rail.end.x if rail.has_area() else get_viewport_rect().size.x - Kit.EDGE
	var top := (rail.end.y if rail.has_area() else Kit.TOPBAR_H) + _s(GAP)
	var want := _panel.get_combined_minimum_size()
	_panel.size = Vector2(maxf(_s(PANEL_W), want.x), want.y)
	_panel.global_position = Vector2(right - _panel.size.x, top).round()
	_button.size = _button.get_combined_minimum_size()
	_button.global_position = Vector2(right - _button.size.x, top).round()


## L'ACHAT : la fete du niveau se joue sur la maison, que le volet ne couvre
## pas — il reste ouvert.
func _upgrade() -> void:
	Home.act("upgrade")


func _caption(left: float, right: float, top: float, bottom: float) -> StyleBoxFlat:
	var s := Kit.style_caption()
	s.content_margin_left = _s(left)
	s.content_margin_right = _s(right)
	s.content_margin_top = _s(top)
	s.content_margin_bottom = _s(bottom)
	s.set_corner_radius_all(_f(10))
	return s


# ── Le panneau ───────────────────────────────────────────────────────────────

func _build_panel(d: Dictionary) -> PanelContainer:
	var card := Kit.panel(_caption(10, 8, 7, 8))
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var col := Kit.vbox(_s(5))
	card.add_child(col)

	# LA TETE : le niveau, et la croix qui replie.
	var head := Kit.hbox(_s(4))
	col.add_child(head)
	var title := Kit.label(I18N.f("burrow.level", [d.level]), _f(11), Palette.CREAM)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	head.add_child(title)
	head.add_child(_Cross.new(fold, _k))

	# LA BARRE : la part a l'abri, puis la part exposee, au prorata du stock.
	var bar := _VaultBar.new()
	bar.safe = int(d.safe)
	bar.exposed = int(d.exposed)
	bar.custom_minimum_size = Vector2(0, _s(10))
	col.add_child(bar)
	var legend := Kit.hbox(_s(4))
	col.add_child(legend)
	var left := Kit.vbox(0)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_child(_figure(int(d.safe), SAFE_INK, Kit.ICONS["shield"]))
	left.add_child(Kit.label(I18N.t("burrow.safe"), _f(8), Palette.CHALK_DIM))
	legend.add_child(left)
	var right := Kit.vbox(0)
	right.add_child(_figure(int(d.exposed), EXPOSED_INK, Kit.ICONS["swords"]))
	# « EXPOSEES » seul : la cle porte le chiffre (« {0} EXPOSEES »), qu'on
	# pose deja au-dessus.
	var exposed_word := Kit.label(I18N.f("burrow.exposed", [""]).strip_edges(), _f(8), Palette.CHALK_DIM)
	exposed_word.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	right.add_child(exposed_word)
	legend.add_child(right)

	var rule := ColorRect.new()
	rule.color = Color(1, 1, 1, 0.12)
	rule.custom_minimum_size = Vector2(0, 1)
	col.add_child(rule)

	# CE QUE LE NIVEAU SUIVANT AJOUTE, puis le bouton.
	if int(d.next_yield) >= 0:
		var next := Kit.hbox(_s(8))
		col.add_child(next)
		var next_level := Kit.label(I18N.f("energyPanel.levelLabel", [int(d.level) + 1]), _f(9), Palette.CHALK_DIM)
		next_level.uppercase = true
		next.add_child(next_level)
		next.add_child(_gain("+%d" % (int(d.next_yield) - int(d.yield)), Kit.ICONS["carrot"]))
		if int(d.next_regen) > int(d.regen):
			next.add_child(_gain("+%d" % (int(d.next_regen) - int(d.regen)), Kit.ICONS["bolt"]))
	var slab := HubSlab.new("earth", _s(26))
	if d.cost == null:
		slab.add_word(I18N.t("burrow.maxLevel"), _f(10))
		slab.set_lit(false)
	else:
		slab.add_price(I18N.shout(I18N.t("burrow.upgrade")) + " " + I18N.group_digits(float(d.cost)), _f(10),
			Kit.icon(Kit.ICONS["carrot"], _s(10)))
		slab.set_lit(bool(d.can))
		slab.pressed.connect(_upgrade)
	col.add_child(slab)

	# LES BOUTEILLES, sous AMELIORER : arroser, fertiliser.
	if not (d.bottles as Array).is_empty():
		var pour_rule := ColorRect.new()
		pour_rule.color = Color(1, 1, 1, 0.12)
		pour_rule.custom_minimum_size = Vector2(0, 1)
		col.add_child(pour_rule)
		var pour := Kit.hbox(_s(6))
		col.add_child(pour)
		for bottle: Array in d.bottles:
			pour.add_child(_bottle(String(bottle[0]), int(bottle[1]), bool(bottle[2])))
	return card


## UNE BOUTEILLE : son icone et ce qu'on en tient. Le serveur verse
## (`/api/burrow` water / fertilise) ; Home.changed refait le volet.
func _bottle(kind: String, held: int, capped: bool) -> HubSlab:
	var b := HubSlab.new("green", _s(26))
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var row := Kit.hbox(_s(3))
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var icon := Kit.icon(Kit.ICONS[kind], _s(14))
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	row.add_child(Kit.label("x%d" % held, _f(10), b.ink()))
	b.content.add_child(row)
	b.tooltip_text = "%s · %s" % [I18N.t("kit.tools." + ("water" if kind == "water" else "fertilise")),
		I18N.t("kit.tools.%sEffect" % kind)]
	b.set_lit(not capped and not Home.pending)
	b.pressed.connect(func() -> void:
		if capped or Home.pending:
			return
		Home.act("water" if kind == "water" else "fertilise"))
	return b


## LA CROIX : un petit x dessine, pas le carre des dialogues (trop gros
## pour un volet de 196 px). Douze pixels dans la rangee du titre, mais une
## zone de tape plus large que son dessin (`_has_point`) : un pouce, pas une
## pointe de stylet.
class _Cross extends Button:
	var _arm := 3.5
	var _reach := 10.0

	func _init(on_press: Callable, k: float) -> void:
		_arm = 3.5 * k
		_reach = 10.0 * k
		flat = true
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		for state in ["normal", "hover", "pressed", "focus", "hover_pressed"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())
		custom_minimum_size = Vector2.ONE * roundf(12.0 * k)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		pressed.connect(on_press)
		mouse_entered.connect(queue_redraw)
		mouse_exited.connect(queue_redraw)

	func _has_point(point: Vector2) -> bool:
		return Rect2(Vector2.ZERO, size).grow(_reach).has_point(point)

	func _draw() -> void:
		var c := size * 0.5
		var ink := Color(Palette.CREAM, 1.0 if is_hovered() else 0.7)
		draw_line(c + Vector2(-_arm, -_arm), c + Vector2(_arm, _arm), ink, 1.5)
		draw_line(c + Vector2(-_arm, _arm), c + Vector2(_arm, -_arm), ink, 1.5)


class _VaultBar extends Control:
	const GOLD := Color("#ffd138")
	const RED := Color("#ff8a7a")
	var safe := 0
	var exposed := 0

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r, Color(0, 0, 0, 0.45))
		var total := maxi(1, safe + exposed)
		var w := size.x * float(safe) / float(total)
		draw_rect(Rect2(0, 0, w, size.y), GOLD)
		if exposed > 0:
			draw_rect(Rect2(w, 0, size.x - w, size.y), RED)
			# Des hachures sur la part exposee : elle se lit « a prendre ».
			var x := w - size.y
			while x < size.x:
				draw_line(Vector2(maxf(x, w), size.y), Vector2(minf(x + size.y, size.x), 0), Color(0.55, 0.12, 0.08, 0.6), 2.0)
				x += 5.0
		draw_rect(r, Color(1, 1, 1, 0.5), false, 1.0)


# ── Le bouton replie ─────────────────────────────────────────────────────────

## LA MAISON ET SON NIVEAU, sur le meme fond que le panneau ; la maison
## deborde du cadre a gauche, le point rouge bat au coin oppose quand
## l'amelioration est payable.
func _build_button(d: Dictionary) -> Button:
	var button := Button.new()
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	# La place de la maison dans le cadre : ce qui n'en deborde pas.
	var s := _caption(HOUSE_ART.x - HOUSE_SPILL + 2.0, 10, 0, 0)
	var lit := s.duplicate() as StyleBoxFlat
	lit.bg_color = Color(s.bg_color, minf(1.0, s.bg_color.a + 0.15))
	button.add_theme_stylebox_override("normal", s)
	button.add_theme_stylebox_override("hover", lit)
	button.add_theme_stylebox_override("pressed", lit)
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var h := _s(BUTTON_H)
	# « BURROW 1 », pas « LVL 1 » : le lapin porte deja « LVL 10 » en haut a
	# gauche, sur la meme rangee, et deux LVL qui ne comptent pas la meme
	# chose se lisaient comme un seul niveau qui se contredit.
	var level := Kit.label(I18N.f("burrow.levelChip", [d.level]), _f(10), Palette.CREAM)
	level.uppercase = true
	level.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	level.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(level)
	# Le Button ne range pas ses enfants : le mot prend sa place apres la
	# maison, centre sur la hauteur, et le bouton prend la mesure du tout.
	# LES BOUTEILLES TENUES, apres le mot : leur icone et leur nombre. Celle
	# qui ne se verse plus (24 h en reserve) palit, comme son bouton.
	var pour := Kit.hbox(_s(5))
	pour.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for bottle: Array in d.bottles:
		var one := Kit.hbox(_s(1))
		one.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var icon := Kit.icon(Kit.ICONS[String(bottle[0])], _s(16))
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		one.add_child(icon)
		var count := Kit.label("x%d" % int(bottle[1]), _f(9), Palette.CREAM)
		count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		one.add_child(count)
		if bool(bottle[2]):
			one.modulate.a = 0.45
		pour.add_child(one)
	pour.visible = pour.get_child_count() > 0
	button.add_child(pour)
	_dot = PulseDot.new()
	_dot.size = Vector2.ONE * _s(DOT_SIZE)
	_dot.visible = d.cost != null and bool(d.can)
	var fit := func() -> void:
		var word := level.get_combined_minimum_size()
		var tail := pour.get_combined_minimum_size() if pour.visible else Vector2.ZERO
		var gap := _s(8) if pour.visible else 0.0
		button.custom_minimum_size = Vector2(s.content_margin_left + word.x + gap + tail.x + s.content_margin_right, h)
		level.position = Vector2(s.content_margin_left, roundf((h - word.y) * 0.5))
		level.size = word
		pour.position = Vector2(s.content_margin_left + word.x + gap, roundf((h - tail.y) * 0.5))
		pour.size = tail
		# Dans le coin, rentre d'une largeur et demie, a cheval sur le haut :
		# a ras du bord il touchait le bord de l'ecran.
		_dot.position = Vector2(button.custom_minimum_size.x - _dot.size.x * 1.5, -_dot.size.y * 0.45)
	level.minimum_size_changed.connect(fit)
	fit.call()
	var art := TextureRect.new()
	art.texture = BurrowProps.home_art(int(d.level), true)
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.size = HOUSE_ART * _k
	# Le pied de la maison sur le bas du bouton (le dessin a un peu d'air
	# sous lui) : elle monte au-dessus du cadre.
	art.position = Vector2(-_s(HOUSE_SPILL), h - art.size.y - _s(2))
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(art)
	button.add_child(_dot)
	button.pressed.connect(expand)
	return button


# ── Les petites pieces ───────────────────────────────────────────────────────

## « 🛡 989 » — une icone et un chiffre.
func _figure(n: int, ink: Color, tex: Texture2D) -> HBoxContainer:
	var row := Kit.hbox(_s(3))
	row.add_child(Kit.icon(tex, _s(12)))
	row.add_child(Kit.label(I18N.group_digits(float(n)), _f(11), ink))
	return row


## « +8 🥕/h » — ce que le niveau suivant ajoute.
func _gain(text: String, tex: Texture2D) -> HBoxContainer:
	var row := Kit.hbox(_s(2))
	row.add_child(Kit.label(text, _f(10), NEXT_INK))
	row.add_child(Kit.icon(tex, _s(10)))
	row.add_child(Kit.label("/h", _f(10), NEXT_INK))
	return row
