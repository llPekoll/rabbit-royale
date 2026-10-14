extends Node2D
## LA LISTE RAID, SIX CADRAGES (2026-10-14, « on voit que 3 personnes sur
## tout un ecran, c'est nul »).
##
##   godot --path godot scenes/bench/target_list_lab.tscn
##   ... -- --variant=3 --size=890x400 --shot=v3.png --after=2
##   touches 1 a 6, ou le bouton en bas a gauche ; L : la langue suivante
##
## Ce qui mange l'ecran aujourd'hui (TargetList) : un dialogue de 720 sur
## 400 de haut, un titre de 50 px, le brief sur sa planche (50 px), et des
## lignes-planches de 58 px — trois lignes et demie. L'ecran est en paysage :
## la largeur est la ressource, la hauteur est rare. Ce que le joueur decide
## ici : QUI piller, d'apres trois choses — ce qu'il y a a prendre, si le
## proprietaire est la (chez lui = defense en direct, il creuse = sans
## garde), et si un bouclier le couvre encore. Et la revanche en tete.
##
##   1 REGISTRE      le meme dialogue, une ligne par terrier (30 px) : 9 a l'ecran
##   2 DEUX COLONNES  les planches gardees, deux de front, plus basses : 12
##   3 PORTRAITS     des cartes debout qui defilent de cote : 6, des visages
##   4 CARNET        un volet a droite, le terrier reste visible : 9
##   5 PAR OCCASION  trois colonnes : sans garde · absents · chez eux : 21
##   6 TROIS PRISES  revanche · le plus riche · il creuse, puis le reste : 3+8
##
## Rien ne part au serveur : une tape sur RAID dit ce qu'elle ferait.

const BURROW := preload("res://scenes/burrow.tscn")
const NAMES := ["REGISTRE", "DEUX COLONNES", "PORTRAITS", "CARNET", "PAR OCCASION", "TROIS PRISES"]
const SEEKER_WINDOW := Vector2i(1335, 600)

## Seize terriers : chaque etat qu'une ligne doit savoir dire.
const TARGETS := [
	{"name": "Kuro", "presence": "away", "stock": 1240, "garden": 80, "revenge": true, "avatar": "gray"},
	{"name": "Thistle", "presence": "digging", "stock": 3420, "garden": 140, "avatar": "brown"},
	{"name": "Bramblewick the Long-Named", "presence": "home", "stock": 2210, "garden": 60, "avatar": "orange"},
	{"name": "Clover", "presence": "digging", "stock": 980, "garden": 20, "shieldedFor": 4 * 3600000, "avatar": "white"},
	{"name": "Navet", "presence": "away", "stock": 8800, "garden": 300, "avatar": "yellow"},
	{"name": "Radis", "presence": "away", "stock": 640, "garden": 12, "asleep": true, "avatar": "brown"},
	{"name": "Poireau", "presence": "home", "stock": 15200, "garden": 480, "shieldedFor": 22 * 3600000, "avatar": "gray"},
	{"name": "Fennel", "presence": "away", "stock": 410, "garden": 30, "avatar": "orange"},
	{"name": "Juniper", "presence": "digging", "stock": 6100, "garden": 210, "avatar": "white"},
	{"name": "Moss", "presence": "away", "stock": 300, "garden": 5, "shieldedFor": 2 * 3600000, "avatar": "yellow"},
	{"name": "Sorrel", "presence": "home", "stock": 1980, "garden": 90, "avatar": "brown"},
	{"name": "Hazel", "presence": "away", "stock": 12040, "garden": 360, "avatar": "gray"},
	{"name": "Pip", "presence": "digging", "stock": 760, "garden": 40, "avatar": "orange"},
	{"name": "Basil", "presence": "away", "stock": 5320, "garden": 150, "avatar": "white"},
	{"name": "Quince", "presence": "away", "stock": 2600, "garden": 70, "shieldedFor": 47 * 3600000, "avatar": "yellow"},
	{"name": "Maple", "presence": "home", "stock": 890, "garden": 25, "avatar": "brown"},
]

const REVENGE_INK := Color("#ff6a4a")
## Le plus petit RAID ou les feuilles laissent lire « Raid », « Watch ».
const DENSE_BUTTON_W := 96.0

var _variant := 0
var _ui: Control
var _page: Control
var _pick: PlankButton
var _toast: Label


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--variant="):
			_variant = clampi(int(arg.trim_prefix("--variant=")) - 1, 0, NAMES.size() - 1)
	Session.token = ""
	Session.player = {"id": "lab"}
	var burrow := BURROW.instantiate()
	add_child(burrow)
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	_ui = Control.new()
	Kit.fill(_ui)
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_ui)
	var top := CanvasLayer.new()
	top.layer = 30
	add_child(top)
	_pick = Kit.button("", "gold", 210.0, 26.0)
	_pick.position = Vector2(Kit.EDGE, 4.0)
	_pick.pressed.connect(func() -> void: _show((_variant + 1) % NAMES.size()))
	top.add_child(_pick)
	_toast = Kit.label("", 12, Palette.CREAM, true)
	_toast.position = Vector2(230.0, 8.0)
	top.add_child(_toast)
	get_viewport().size_changed.connect(func() -> void: _show(_variant))
	_seeker_window()
	DevShot.arm(self)
	_show.call_deferred(_variant)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	if event.keycode >= KEY_1 and event.keycode < KEY_1 + NAMES.size():
		_show(event.keycode - KEY_1)
	elif event.keycode == KEY_L:
		var codes: Array = I18N.LOCALES.map(func(l: Dictionary) -> String: return String(l["code"]))
		I18N.locale = String(codes[(codes.find(I18N.locale) + 1) % codes.size()])
		I18N._apply_theme_face()
		_show(_variant)


func _show(k: int) -> void:
	_variant = k
	_pick.relabel("%d %s ▸" % [k + 1, NAMES[k]])
	if _page != null:
		_page.queue_free()
	_page = Control.new()
	Kit.fill(_page)
	_page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui.add_child(_page)
	match k:
		0: _registre()
		1: _two_columns()
		2: _portraits()
		3: _carnet()
		4: _by_occasion()
		5: _three_picks()


# ── Les six ──────────────────────────────────────────────────────────────────

## 1 REGISTRE. Le meme dialogue, mais une ligne par terrier, sur le
## parchemin, sans planche : le point de presence, le nom, ce qu'il y a a
## prendre, le bouclier, RAID en petit. Le brief tient en une ligne sous le
## titre. On garde tout ce que le joueur connait, on divise la ligne par deux.
func _registre() -> void:
	var d := _dialog(I18N.t("raid.whose"), 720.0)
	var col := Kit.vbox(0)
	col.add_child(_brief_line())
	var rows := Kit.vbox(2)
	for t in TARGETS:
		rows.add_child(_dense_row(t, 30.0, false))
	col.add_child(_scroll(rows))
	d.set_body(col)


## 2 DEUX COLONNES. Les planches a feuilles du jeu, gardees, mais deux de
## front et plus basses (40 px) : le visage du lapin a gauche, le nom et la
## presence empiles, les carottes, RAID. La largeur du paysage sert enfin.
func _two_columns() -> void:
	var d := _dialog(I18N.t("raid.whose"), 860.0)
	var col := Kit.vbox(4)
	col.add_child(_brief_line())
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 4)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for t in TARGETS:
		var row := _plank_row(t)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(row)
	col.add_child(_scroll(grid))
	d.set_body(col)


## 3 PORTRAITS. Ce sont des LAPINS qu'on va voler, pas des lignes de
## tableur : une carte debout par terrier, son visage en grand, son nom, ce
## qu'il cache, OU il est, et RAID sur toute la largeur de la carte. Elles
## defilent de cote, comme un etal — le pouce glisse, il ne vise pas.
func _portraits() -> void:
	var d := _dialog(I18N.t("raid.whose"), 860.0)
	var col := Kit.vbox(4)
	col.add_child(_brief_line())
	# DEUX RANGEES : une seule laissait la moitie basse du parchemin vide.
	var rail := Kit.hbox(8)
	for i in range(0, TARGETS.size(), 2):
		var pair := Kit.vbox(6)
		for t in TARGETS.slice(i, i + 2):
			pair.add_child(_card(t, Vector2(124, 0), true))
		rail.add_child(pair)
	var sc := ScrollContainer.new()
	sc.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.add_child(rail)
	col.add_child(sc)
	d.set_body(col)


## 4 CARNET. Pas de voile : un volet a droite, de toute la hauteur, et le
## terrier reste a l'ecran a gauche. Les lignes sont celles du registre avec
## le visage ; RAID est sous le pouce droit. Choisir une cible n'interrompt
## plus rien — on peut regarder sa defense en meme temps.
func _carnet() -> void:
	var view := _page.get_viewport_rect().size
	var w := clampf(view.x * 0.46, 360.0, 460.0)
	var panel := Control.new()
	panel.position = Vector2(view.x - w - Kit.EDGE, Kit.EDGE)
	panel.size = Vector2(w, view.y - 2.0 * Kit.EDGE)
	_page.add_child(panel)
	var frame := Kit.parchment()
	Kit.fill(frame)
	panel.add_child(frame)
	var edge := frame.inset()
	var inset := Kit.margin(edge.x + 2.0, minf(edge.y, Kit.LEAF_EDGE) + 2.0, edge.z + 2.0, edge.w + 2.0)
	Kit.fill(inset)
	panel.add_child(inset)
	var col := Kit.vbox(4)
	inset.add_child(col)
	var head := Kit.hbox(4)
	var title := Kit.title(I18N.t("raid.whose"), 16, Palette.INK)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	head.add_child(Kit.close_button())
	col.add_child(head)
	col.add_child(_brief_line())
	var rows := Kit.vbox(2)
	for t in TARGETS:
		rows.add_child(_dense_row(t, 32.0, true, true))
	col.add_child(_scroll(rows))


## 5 PAR OCCASION. Le classement par carottes repond a « combien » ; la
## vraie question est « quel raid ». Trois colonnes : SANS GARDE (il creuse,
## personne pour defendre), ABSENTS, CHEZ EUX (defense en direct possible).
## Les boucliers tombent au fond de leur colonne avec leur heure.
func _by_occasion() -> void:
	var d := _dialog(I18N.t("raid.whose"), 860.0)
	var col := Kit.vbox(4)
	col.add_child(_brief_line())
	var cols := Kit.hbox(8)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var groups := [
		["digging", "UNGUARDED — " + I18N.t("raid.presence.digging")],
		["away", I18N.t("raid.presence.away").to_upper()],
		["home", "AT HOME — they can defend"],
	]
	for g in groups:
		var box := Kit.vbox(2)
		box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var head := Kit.label(String(g[1]), 11, TargetList.WHERE_INK[g[0]].darkened(0.35), false)
		head.clip_text = true
		box.add_child(head)
		var list := Kit.vbox(2)
		var open: Array = []
		var shut: Array = []
		for t in TARGETS:
			if String(t["presence"]) == g[0]:
				(shut if _shield_left(t) > 0.0 else open).append(t)
		open.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return _haul(a) > _haul(b))
		for t in open + shut:
			list.add_child(_dense_row(t, 28.0, false, true))
		var sc := _scroll(list)
		box.add_child(sc)
		cols.add_child(box)
	col.add_child(cols)
	d.set_body(col)


## 6 TROIS PRISES. La plupart du temps on prend la meme : celui qui nous a
## pille, le plus riche, ou celui qui creuse en ce moment. Les trois en
## grand, chacune avec SA raison ecrite, puis tout le reste en registre a
## deux colonnes dessous.
func _three_picks() -> void:
	var d := _dialog(I18N.t("raid.whose"), 860.0)
	var col := Kit.vbox(6)
	var picks := Kit.hbox(8)
	var revenge: Dictionary = TARGETS.filter(func(t: Dictionary) -> bool: return t.get("revenge", false))[0]
	var open := TARGETS.filter(func(t: Dictionary) -> bool: return _shield_left(t) <= 0.0 and not t.get("revenge", false))
	open.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return _haul(a) > _haul(b))
	var richest: Dictionary = open[0]
	var digging: Dictionary = open.filter(func(t: Dictionary) -> bool: return String(t["presence"]) == "digging" and t != richest)[0]
	var chosen := [revenge, richest, digging]
	for pair in [[revenge, "REVENGE — they raided you"], [richest, "THE RICHEST"], [digging, "UNGUARDED — out digging"]]:
		picks.add_child(_pick_card(pair[0], String(pair[1])))
	col.add_child(picks)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 2)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for t in TARGETS:
		if not chosen.has(t):
			var row := _dense_row(t, 26.0, false, true)
			row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			grid.add_child(row)
	col.add_child(_scroll(grid))
	d.set_body(col)


# ── Les pieces ───────────────────────────────────────────────────────────────

## Un dialogue du jeu, pose comme Chrome._center_dialog le pose.
func _dialog(title: String, width: float) -> Dialog:
	var scrim := ColorRect.new()
	scrim.color = Palette.SCRIM
	Kit.fill(scrim)
	_page.add_child(scrim)
	var d := Dialog.new(title, width, 0.0)
	_page.add_child(d)
	var view := _page.get_viewport_rect().size
	var w := minf(width, view.x - 2.0 * Kit.EDGE)
	d.size = Vector2(w, view.y - 17.0 - Kit.EDGE)
	d.position = Vector2(floorf((view.x - w) * 0.5), 17.0)
	return d


## Le brief en une ligne, sous le titre : le but, le peage.
func _brief_line() -> Label:
	var l := Kit.note("%s  %s" % [I18N.t("raid.brief"),
		I18N.f("raid.cost", [Tuning.i("RAID_RUN.TOLL"), Tuning.i("RAID_RUN.STAKE")])], Palette.INK, 10)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	l.clip_text = true
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size = Vector2(60, 14)
	return l


func _scroll(content: Control) -> ScrollContainer:
	var sc := ScrollContainer.new()
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(content)
	TouchScroll.attach(sc)
	return sc


## UNE LIGNE DE REGISTRE : un creux du parchemin, une seule rangee.
## `face` : le visage du lapin devant le nom. `short` : la colonne est
## etroite, la presence se dit par le point seul.
func _dense_row(t: Dictionary, h: float, face: bool, short: bool = false) -> Control:
	var shielded := _shield_left(t) > 0.0
	var well := PanelContainer.new()
	var s := Kit.style_well()
	s.set_border_width_all(1)
	s.set_corner_radius_all(5)
	s.content_margin_left = 6
	s.content_margin_right = 3
	s.content_margin_top = 1
	s.content_margin_bottom = 1
	well.add_theme_stylebox_override("panel", s)
	well.custom_minimum_size.y = h
	if shielded:
		well.modulate.a = TargetList.SHIELDED_DIM
	var line := Kit.hbox(6)
	well.add_child(line)
	var where := String(t["presence"])
	line.add_child(_dot(where))
	if face:
		var f := AvatarFace.portrait(t.get("avatar"), 1.6)
		f.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		line.add_child(f)
	var name := Kit.label(String(t["name"]), 12, Palette.CREAM, true)
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	name.custom_minimum_size.x = 40
	line.add_child(name)
	if t.get("revenge", false):
		line.add_child(_tag("REVENGE", REVENGE_INK))
	if not short:
		var w := Kit.label(I18N.t("raid.presence." + where), 10, TargetList.WHERE_INK[where])
		w.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		line.add_child(w)
	line.add_child(_carrots(t, 11))
	line.add_child(_raid_button(t, DENSE_BUTTON_W, h - 4.0))
	return well


## UNE PLANCHE BASSE (2 COLONNES) : visage, nom sur presence, carottes, RAID.
func _plank_row(t: Dictionary) -> Control:
	var shielded := _shield_left(t) > 0.0
	var panel := PanelContainer.new()
	var plank := Kit.style_plank(4.0, 6.0, 3.0)
	plank.content_margin_bottom = 6.0
	panel.add_theme_stylebox_override("panel", plank)
	if shielded:
		panel.modulate.a = TargetList.SHIELDED_DIM
	var line := Kit.hbox(6)
	panel.add_child(line)
	var f := AvatarFace.portrait(t.get("avatar"), 2.0)
	f.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(f)
	var who := Kit.vbox(0)
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var name := Kit.label(String(t["name"]), 12, Palette.CREAM, true)
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	who.add_child(name)
	var where := String(t["presence"])
	var sub := Kit.hbox(4)
	sub.add_child(_dot(where))
	sub.add_child(Kit.label(I18N.t("raid.presence." + where), 10, TargetList.WHERE_INK[where]))
	if t.get("revenge", false):
		sub.add_child(_tag("REVENGE", REVENGE_INK))
	who.add_child(sub)
	line.add_child(who)
	line.add_child(_carrots(t, 12))
	line.add_child(_raid_button(t, DENSE_BUTTON_W, 30.0))
	return panel


## UNE CARTE DEBOUT (PORTRAITS) : le visage en grand sur un creux, le nom,
## la presence, les carottes, RAID sur toute la largeur.
func _card(t: Dictionary, size: Vector2, low := false) -> Control:
	var shielded := _shield_left(t) > 0.0
	var card := PanelContainer.new()
	var s := Kit.style_well()
	s.set_content_margin_all(6)
	card.add_theme_stylebox_override("panel", s)
	card.custom_minimum_size = size
	if shielded:
		card.modulate.a = TargetList.SHIELDED_DIM
	var col := Kit.vbox(1 if low else 3)
	card.add_child(col)
	if t.get("revenge", false):
		col.add_child(_tag("REVENGE", REVENGE_INK))
	elif not low:
		col.add_child(_tag(" ", Color.TRANSPARENT))
	var f := AvatarFace.portrait(t.get("avatar"), 2.5 if low else 4.0)
	f.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(f)
	var name := Kit.label(String(t["name"]), 12, Palette.CREAM, true)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	col.add_child(name)
	var where := String(t["presence"])
	var sub := Kit.hbox(4)
	sub.alignment = BoxContainer.ALIGNMENT_CENTER
	sub.add_child(_dot(where))
	sub.add_child(Kit.label(I18N.t("raid.presence." + where), 10, TargetList.WHERE_INK[where]))
	col.add_child(sub)
	var c := _carrots(t, 14)
	c.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(c)
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(spacer)
	var b := _raid_button(t, size.x - 12.0, 26.0 if low else 32.0)
	col.add_child(b)
	return card


## UNE DES TROIS PRISES : sa raison en tete, le visage, le nom, ce qu'il y a,
## et un grand RAID.
func _pick_card(t: Dictionary, why: String) -> Control:
	var card := PanelContainer.new()
	var s := Kit.style_well(true)
	s.set_content_margin_all(6)
	card.add_theme_stylebox_override("panel", s)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var line := Kit.hbox(8)
	card.add_child(line)
	var f := AvatarFace.portrait(t.get("avatar"), 3.5)
	f.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(f)
	var col := Kit.vbox(2)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var ink := REVENGE_INK if t.get("revenge", false) else (TargetList.WHERE_INK["digging"] if String(t["presence"]) == "digging" else Palette.LAMP)
	col.add_child(Kit.label(why, 10, ink))
	var name := Kit.label(String(t["name"]), 13, Palette.CREAM, true)
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	col.add_child(name)
	col.add_child(_carrots(t, 13))
	col.add_child(_raid_button(t, 0.0, 30.0))
	line.add_child(col)
	return card


func _carrots(t: Dictionary, px: int) -> HBoxContainer:
	var row := Kit.hbox(3)
	row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var left := _shield_left(t)
	if left > 0.0:
		row.add_child(Kit.icon(Kit.ICONS["shield"], px + 2))
		row.add_child(Kit.label(I18N.short_wait(left), px - 1, Palette.LAMP))
		return row
	row.add_child(Kit.label(I18N.group_digits(_haul(t)), px, Palette.CREAM, true))
	row.add_child(Kit.icon(Kit.ICONS["carrot"], px + 2))
	return row


func _raid_button(t: Dictionary, w: float, h: float) -> PlankButton:
	var shielded := _shield_left(t) > 0.0
	var digging := String(t["presence"]) == "digging"
	# Un creuseur protege garde REGARDER : son ile n'a pas de bouclier.
	var word := I18N.t("raid.watchIt") if shielded and digging else (I18N.t("raid.shielded") if shielded else I18N.t("raid.raidIt"))
	var tone := "blue" if shielded and digging else "wood"
	var b := Kit.button(word, tone, w, h)
	b.label_size = 11
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.disabled = shielded and not digging
	if b.disabled:
		b.modulate.a = 0.75
	var who := String(t["name"])
	b.pressed.connect(func() -> void: _say("%s : %s" % [word, who]))
	return b


func _tag(text: String, ink: Color) -> Label:
	var l := Kit.label(text, 9, ink, true)
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


func _dot(where: String) -> Control:
	var dot := TargetList.PresenceDot.new()
	dot.ink = TargetList.WHERE_INK[where]
	dot.custom_minimum_size = Vector2(7, 7)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return dot


## Ce qu'un raid prendrait : la reserve et le potager, comme la liste.
static func _haul(t: Dictionary) -> int:
	return int(t.get("stock", 0)) + int(t.get("garden", 0))


static func _shield_left(t: Dictionary) -> float:
	return float(t.get("shieldedFor", 0))


func _say(text: String) -> void:
	_toast.text = text


func _seeker_window() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--size="):
			return
	var win := get_window()
	(func() -> void:
		win.mode = Window.MODE_WINDOWED
		win.size = SEEKER_WINDOW
		var screen := DisplayServer.screen_get_usable_rect(win.current_screen)
		win.position = screen.position + (screen.size - SEEKER_WINDOW) / 2).call_deferred()
