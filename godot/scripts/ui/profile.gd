class_name Profile
extends Dialog
## LE PANNEAU DU JOUEUR — sa tete, son nom, ce qu'il a creuse, et qui l'a
## vole.
##
## Porte de src/components/profile-menu.tsx (et de wallet-button.tsx, qui
## l'ouvre), en gardant ce qu'ils ont decide :
##
##   • TROIS ONGLETS : le profil, le journal des raids et les reglages du jeu.
##     Le camp de raid (decoupe un pour un, voir plus bas) remplace le
##     parchemin, en gardant ces comportements.
##   • UN MODAL CENTRE SUR UN PLATEAU ASSOMBRI. Il glissait depuis la droite,
##     sur le rail du tableau de saison — « le panneau sur VOUS lisait comme
##     une variante de celui sur tout le monde ». Ici c'est un Dialog du
##     chrome, exactement ce que le web a fini par faire.
##   • LE CHIP NE DECONNECTE PLUS AU CLIC : la deconnexion vit ici, ou elle
##     demande une pression deliberee. Et pour un INVITE elle n'est pas une
##     deconnexion : le jeton EST le compte, le lacher laisse une ligne
##     fantome — donc son depart s'appelle ABANDON, se fait en DEUX pressions
##     dont la seconde dit ce qu'elle fait, et supprime la ligne
##     (/api/auth/abandon). Pas de garde pour un joueur a wallet : « rendre
##     dangereuse l'action reversible est la facon dont un avertissement cesse
##     d'etre lu ».
##   • ON NE SE PLAINT DU NOM QU'UNE FOIS TAPE QUELQUE CHOSE DE FAUX, pas en
##     chemin vers quelque chose de juste (`renamed && problem`).
##   • CHOISIR SON LAPIN SAUVE AUSSITOT : c'est une petite fete, pas un
##     reglage.
##   • OUVRIR L'HISTORIQUE MARQUE LES RAIDS LUS — lire le profil ne doit pas
##     effacer une pastille que le joueur n'a jamais regardee. Les lignes
##     encore non lues portent NEW : la pastille rouge promettait des
##     nouvelles, la liste doit dire lesquelles.
##   • CHAQUE RAID SUBI EST UNE DETTE jusqu'a ce qu'on reprenne quelque chose
##     au voleur (`avengedAt`) ; une ligne reglee est barree et perd son
##     bouton, une ligne ouverte porte REVENGE NOW et le point de presence.
##
## CE QUI CHANGE ICI. Le wallet n'existe que dans un build Android : sur le
## bureau CONNECT WALLET est grise, comme la porte du doorstep (title.gd).
## Le web a aussi une sortie « Play as "<owner>" » quand le wallet appartient
## deja a un autre terrier ; la session Godot ne remonte pas `takenBy`, donc
## cette branche n'est pas portee — le refus est montre, c'est tout.

## Aller rendre un raid a ce joueur — le chrome ouvre les cibles.
signal revenge(player_id: String)

## Le nom ou l'avatar viennent d'etre sauves ; Session.player est deja a jour.
signal updated(patch: Dictionary)

enum Tab { PROFILE, HISTORY, SETTINGS }

## lib/game/player-name.ts : les limites d'un nom, et sa forme — des lettres
## ou des chiffres, avec des espaces, des « - » ou des « _ » a l'INTERIEUR
## seulement. Ce sont des regles de validation, pas des nombres de design :
## tuning.ts ne les porte pas, on les reprend en regard de leur source.
const NAME_MIN := 3
const NAME_MAX := 16
const NAME_ALLOWED := "^[\\p{L}\\p{N}]([\\p{L}\\p{N} _-]*[\\p{L}\\p{N}])?$"
## `nameProblemMessage` : des phrases en anglais dans le TypeScript, hors
## dictionnaire — reprises telles quelles, comme le web les montre.
const NAME_PROBLEMS := {
	"too_short": "At least %d characters." % NAME_MIN,
	"too_long": "At most %d characters." % NAME_MAX,
	"bad_chars": "Letters and numbers, with spaces, - or _ inside.",
}

## LE CAMP DE RAID, UN POUR UN (2026-10-08). Tout se pose aux coordonnees
## de art-source/profile-ui-proposals-20261008/02-camp-de-raid.png : le
## filet de cuivre du cadre y va de (47, 105) a (1292, 644), et chaque piece
## (tools/slice-camp-ui.py) a sa boite de maquette, multipliee par `_k`.
## L'historique est l'ecran du bas de la meme planche, remonte de 560 px et
## etire jusqu'au pied du profil ; les reglages viennent de la maquette 05.
const OX := 47.0
const OY := 105.0
const BOARD := Vector2(1245.0, 539.0)
## Les onglets, de haut en bas : y de la maquette.
const TAB_Y := [226.0, 299.0, 372.0]

const LOCK_ICON := preload("res://assets/ui/icons/settings/lock.png")

var _tabs: Array[Button] = []
var _tab_labels: Array[Label] = []
var _tab_row: Control
var _skin_detail := false
var _rabbit_grid: Control
var _portrait: TextureRect
var _tab_badge: PanelContainer
var _tab_badge_label: Label
## La liste qui defile dans l'onglet (l'historique, le detail d'un skin).
var _scroll: ScrollContainer
var _page: Control
var _board: Control
var _night: Control
var _k := 0.7
var _tab: Tab = Tab.PROFILE
var _page_title: Label
var _rail_name: Label
var _rail_status: Label
var _rail_face: TextureRect
var _save_error := ""

## Le joueur : Session.player, ou ce qu'un banc pose par `show_player`.
var _player: Dictionary = {}
var _avatar: Variant = null
var _picked: Variant = null
var _name_edit: LineEdit
var _warn: Label
var _guest_pill: Control
var _save_button: Button
var _error: Label
var _connect_button: Button
var _connect_hint: Label
var _connect_error: Label
var _leave_button: Button
var _leave_label: Label
var _saving := false
var _confirming_abandon := false
var _connecting := false

## L'historique tel que /api/player/history le rend, ou vide ; `_history_failed`
## distingue « pas encore la » de « n'a pas pu venir ».
var _history: Dictionary = {}
var _history_failed := false
var _history_asked := false
## Combien de raids etaient NON LUS quand l'historique est arrive.
var _new_raids := 0
## Ou sont les voleurs, par id — pousse par la socket tant que l'onglet est la.
var _presence: Dictionary = {}
var _name_re := RegEx.new()
## Un banc : pas de reseau.
var _offline := false


func _init() -> void:
	super("")
	_name_re.compile(NAME_ALLOWED)
	go_fullscreen()
	# Le parchemin et sa colonne de Dialog ne servent pas : le camp pose ses
	# propres pieces. Seuls restent le [x] et la fermeture (Echap, voile).
	_frame.hide()
	_inset.hide()
	# Les pieces de la maquette sont peintes, pas des pixels d'art : reduites,
	# elles veulent le filtre lineaire. Les lapins le reprennent au pixel.
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	# LA NUIT AUTOUR : les seules marges de la maquette 05 (le ciel et la
	# lune en haut, les torches sur les cotes), chacune cadree a sa bande
	# sans deformation. Le panneau peint au milieu ne se montre jamais : la
	# planche le couvre (`_fit_board` regle l'epaisseur des bandes).
	_night = Control.new()
	_night.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_night.clip_contents = true
	Kit.fill(_night)
	add_child(_night)
	move_child(_night, 0)
	var t := CampStyle.BACKDROP
	var cut := CampStyle.BACKDROP_SLICE
	var w := float(t.get_width())
	var h := float(t.get_height())
	for region in [Rect2(0, 0, w, cut.y), Rect2(0, h - cut.w, w, cut.w), Rect2(0, cut.y, cut.x, h - cut.y - cut.w), Rect2(w - cut.z, cut.y, cut.z, h - cut.y - cut.w)]:
		var band := AtlasTexture.new()
		band.atlas = t
		band.region = region
		var r := CampStyle.picture(band, true)
		r.clip_contents = true
		_night.add_child(r)
	_board = Control.new()
	_board.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_board)
	var x := CampStyle.tex("close")
	close_button.texture_normal = x
	close_button.texture_hover = x
	close_button.texture_pressed = x
	close_button.texture_focused = null
	close_button.texture_disabled = x
	close_button.stretch_mode = TextureButton.STRETCH_SCALE
	close_button.mouse_entered.connect(func() -> void: close_button.modulate = Color(1.15, 1.15, 1.15))
	close_button.mouse_exited.connect(func() -> void: close_button.modulate = Color.WHITE)


func _ready() -> void:
	I18N.locale_changed.connect(_on_locale_changed)
	Session.failed.connect(_on_session_failed)
	GameSocket.event.connect(_on_socket_event)
	SkinState.shared().changed.connect(_refresh_rabbits)
	if _player.is_empty() and Session.signed_in():
		show_player(Session.player)
	if Session.signed_in() and not _offline:
		_fetch_history()
	resized.connect(_on_camp_resize)
	_show_tab(_tab)
	if not _offline:
		_load_skins()


## LE [x] de la maquette, a sa place : le coin haut-droit du panneau.
func _place_close() -> void:
	if close_button == null or _board == null:
		return
	close_button.custom_minimum_size = Vector2(46, 44) * _k
	close_button.size = close_button.custom_minimum_size
	close_button.position = _board.position + (Vector2(1232, 120) - Vector2(OX, OY)) * _k


func set_title(words: String) -> void:
	if is_instance_valid(_page_title):
		_page_title.text = I18N.shout(words)


## LA TAILLE DE LA PLANCHE, cadre compris : au-dela, il n'y aurait que de la
## nuit autour.
func hug_size() -> Vector2:
	return BOARD + Vector2(8, 8)


## L'echelle et la place de la planche dans le dialogue : la plus grande qui
## tienne, centree, la nuit autour.
func _fit_board() -> bool:
	var room := size
	if room.x < 1.0 or room.y < 1.0:
		room = Dialog.screen_rect(get_viewport_rect().size, hug_size()).size
	var k := clampf(minf((room.x - 8.0) / BOARD.x, (room.y - 8.0) / BOARD.y), 0.25, 1.0)
	var changed := absf(k - _k) > 0.001
	_k = k
	_board.size = BOARD * k
	_board.position = ((room - _board.size) * 0.5).floor()
	# Les bords de la nuit passent sous le cadre, jusqu'a ses feuilles.
	var under := 40.0 * k
	var far := room - _board.position - _board.size
	var top := _board.position.y + under
	var bottom := far.y + under
	var bands := [Rect2(0, 0, room.x, top), Rect2(0, room.y - bottom, room.x, bottom), Rect2(0, top, _board.position.x + under, room.y - top - bottom), Rect2(room.x - far.x - under, top, far.x + under, room.y - top - bottom)]
	for i in 4:
		var band: Control = _night.get_child(i)
		band.position = bands[i].position
		band.size = bands[i].size
	return changed


func _on_camp_resize() -> void:
	if _fit_board():
		_show_tab(_tab)
	_place_close()


## POSE `node` a sa boite de maquette (x, y, w, h), dans `parent` dont le coin
## haut-gauche est `origin` en coordonnees de maquette (le cadre par defaut).
func _put(node: Control, x: float, y: float, w: float, h: float, parent: Control = null, origin := Vector2(OX, OY)) -> Control:
	node.position = (Vector2(x, y) - origin) * _k
	node.size = Vector2(w, h) * _k
	(parent if parent != null else _page).add_child(node)
	return node


## Un texte a sa boite, la taille de police en pixels de maquette.
func _say(words: String, x: float, y: float, w: float, h: float, px: float, color: Color = CampStyle.TEXT, heading: bool = false, parent: Control = null, origin := Vector2(OX, OY)) -> Label:
	var l := CampStyle.text(words, px * _k, color, heading)
	_put(l, x, y, w, h, parent, origin)
	return l


func _icon(name: String, x: float, y: float, w: float, h: float, parent: Control = null, origin := Vector2(OX, OY)) -> TextureRect:
	var r := CampStyle.picture(CampStyle.tex(name))
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_put(r, x, y, w, h, parent, origin)
	return r


func _panel(which: String, x: float, y: float, w: float, h: float, parent: Control = null, origin := Vector2(OX, OY)) -> NineSlice:
	var n := CampStyle.nine(which, _k)
	_put(n, x, y, w, h, parent, origin)
	return n


## Un lapin au pixel pres, `px` pixels de maquette par pixel d'art.
func _rabbit(key: Variant, px: float) -> TextureRect:
	var r := AvatarFace.portrait(key, px * _k)
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	return r


## UNE LISTE QUI DEFILE a sa boite, au doigt comme a la souris.
func _list(x: float, y: float, w: float, h: float, gap: float = 6.0) -> VBoxContainer:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	# La maquette n'a pas de barre : le doigt et la molette suffisent.
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_put(scroll, x, y, w, h)
	TouchScroll.attach(scroll)
	_scroll = scroll
	var col := Kit.vbox(gap * _k)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(col)
	return col


# ── Les onglets ──────────────────────────────────────────────────────────────

func _show_tab(which: Tab) -> void:
	_tab = which
	_skin_detail = false
	if not _offline and Session.signed_in():
		_player = Session.player
		_avatar = _player.get("avatar", null)
	_fit_board()
	# Les commandes de l'ancienne page sont libres ; une requete qui finit
	# apres ne doit pas les toucher.
	for v in ["_name_edit", "_save_button", "_connect_button", "_connect_hint", "_connect_error", "_leave_button", "_leave_label", "_error", "_warn", "_guest_pill", "_rabbit_grid", "_portrait", "_scroll", "_page_title"]:
		set(v, null)
	for child in _board.get_children():
		_board.remove_child(child)
		child.queue_free()
	var frame := NineSlice.make(CampStyle.FRAME, Vector4i(CampStyle.FRAME_C, CampStyle.FRAME_C, CampStyle.FRAME_C, CampStyle.FRAME_C), Vector4.ONE * CampStyle.FRAME_C * _k)
	frame.position = -Vector2.ONE * CampStyle.FRAME_LINE * _k
	frame.size = _board.size + Vector2.ONE * CampStyle.FRAME_LINE * 2.0 * _k
	_board.add_child(frame)
	_page = Control.new()
	_page.name = "Page"
	_page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_page.size = _board.size
	_board.add_child(_page)
	_panel("content", 294, 123, 982, 508)
	_build_rail()
	match which:
		Tab.PROFILE:
			_page_header("icon-leaf", Rect2(316, 133, 44, 37), I18N.t("profile.tabProfile"), I18N.t("profile.subtitle"))
			_build_profile()
			GameSocket.unwatch_presence()
		Tab.SETTINGS:
			_page_header("icon-gear", Rect2(314, 128, 48, 48), I18N.t("sound.settings"), "")
			var pane := SettingsPane.new(_k)
			pane.name = "Settings"
			_put(pane, 294, 123, 982, 508)
			GameSocket.unwatch_presence()
		_:
			_page_header("icon-scroll", Rect2(316, 128, 42, 44), I18N.t("profile.tabHistory"), I18N.t("profile.historySubtitle"))
			_build_history()
			_mark_seen()
			_follow_raiders()
	_place_close()


## L'EN-TETE DE LA PAGE : son icone, le titre crie, la phrase dessous.
func _page_header(icon: String, at: Rect2, words: String, sub: String) -> void:
	_icon(icon, at.position.x, at.position.y, at.size.x, at.size.y)
	_page_title = _say(I18N.shout(words), 372, 129, 700, 38, 38, CampStyle.TEXT, true)
	if not sub.is_empty():
		_say(sub, 372, 163, 860, 22, 17, Color("#c9dade"))


## LA COLONNE DE GAUCHE : qui je suis, les trois onglets, le coin du camp.
func _build_rail() -> void:
	_tab_row = Control.new()
	_tab_row.name = "Rail"
	_tab_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tab_row.size = _board.size
	_board.add_child(_tab_row)
	var rail := _tab_row
	# La vignette deborde sur le cadre, comme la fougere de la maquette.
	_icon("vignette-side", 52, 470, 237, 162, rail)
	_panel("plate", 65, 124, 212, 89, rail)
	_panel("face", 68, 130, 68, 72, rail)
	var look := String(_picked) if _picked != null else Look.of(_player)
	_rail_face = _rabbit(look, 3.4)
	_put(_rail_face, 78, 143, 48, 48, rail)
	_rail_name = _say(String(_player.get("name", "")), 140, 140, 142, 26, 18, CampStyle.TEXT, false, rail)
	_rail_name.tooltip_text = _rail_name.text
	_rail_status = _say(I18N.t("profile.guestLabel" if bool(_player.get("guest", false)) else "profile.accountLabel"), 140, 167, 134, 22, 16, CampStyle.MUTED, false, rail)
	_tabs.clear()
	_tab_labels.clear()
	var words := _tab_words()
	for which in [Tab.PROFILE, Tab.HISTORY, Tab.SETTINGS]:
		var on: bool = which == _tab
		var y: float = TAB_Y[which]
		var at := Rect2(64, y, 223, 66) if on else Rect2(65, y + 1, 212, 63)
		var b := CampStyle.hit(["ProfileTab", "HistoryTab", "SettingsTab"][which])
		_put(b, at.position.x, at.position.y, at.size.x, at.size.y, rail)
		b.pressed.connect(_show_tab.bind(which))
		var bg := CampStyle.band("tab-on" if on else "tab-off", _k, at.size.y * _k)
		bg.size = b.size
		b.add_child(bg)
		var icon: TextureRect
		if which == Tab.PROFILE:
			icon = _rabbit(look, 3.0)
			icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			_put(icon, 82, y + 11, 44, 44, b, at.position)
		else:
			_icon("icon-scroll-tab" if which == Tab.HISTORY else "icon-gear-tab", 81, y + 9, 46, 48, b, at.position)
		var label := _say(words[which], 140, y, 135, at.size.y, 21, CampStyle.TEXT, false, b, at.position)
		_tabs.append(b)
		_tab_labels.append(label)
		if which == Tab.HISTORY:
			_tab_badge = Kit.panel(_news_style())
			_tab_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_tab_badge_label = Kit.label("", maxi(8, roundi(15 * _k)), CampStyle.NIGHT)
			_tab_badge.add_child(_tab_badge_label)
			_tab_badge.position = (Vector2(258, y - 7) - at.position) * _k
			b.add_child(_tab_badge)
			_paint_badge()


func _tab_words() -> Array:
	return [I18N.t("profile.tabProfile"), I18N.t("profile.tabHistory"), I18N.t("sound.settings")]


func _relabel_tabs() -> void:
	var words := _tab_words()
	set_title(words[int(_tab)])
	for i in _tab_labels.size():
		if is_instance_valid(_tab_labels[i]):
			_tab_labels[i].text = words[i]


# ── L'onglet Profil ──────────────────────────────────────────────────────────

func _build_profile() -> void:
	var guest := bool(_player.get("guest", false))
	# Le portrait : la scene de la maquette, son lapin efface, le vrai a sa
	# place ; le cadre du nom se pose sur celui qui y est peint.
	var stage := CampStyle.picture(CampStyle.tex("portrait-scene"))
	stage.name = "RabbitStage"
	_put(stage, 305, 186, 439, 434)
	var wearing := String(_picked) if _picked != null else Look.of(_player)
	_portrait = _rabbit(wearing, 11.0)
	_portrait.name = "PlayerPortrait"
	_put(_portrait, 445, 273, 154, 154)

	# Un peu plus grand que celui qui est peint dans la scene, pour le couvrir.
	_panel("name", 316, 484, 419, 119)
	_say(I18N.t("profile.playerName"), 337, 488, 380, 22, 17, CampStyle.TEXT)
	_panel("inset", 336, 512, 317, 43)
	_name_edit = LineEdit.new()
	_name_edit.name = "PlayerName"
	_name_edit.text = String(_player.get("name", ""))
	_name_edit.max_length = NAME_MAX
	var bare := StyleBoxEmpty.new()
	bare.content_margin_left = 12 * _k
	bare.content_margin_right = 8 * _k
	for state in ["normal", "focus", "read_only"]:
		_name_edit.add_theme_stylebox_override(state, bare)
	_name_edit.add_theme_color_override("font_color", CampStyle.TEXT)
	_name_edit.add_theme_color_override("caret_color", CampStyle.COPPER)
	_name_edit.add_theme_font_size_override("font_size", roundi(21 * _k))
	_name_edit.text_changed.connect(func(_t: String) -> void: _refresh_name())
	_name_edit.text_submitted.connect(func(_t: String) -> void:
		if not _save_button.disabled:
			_on_save_name())
	_put(_name_edit, 336, 512, 317, 43)
	# LE CRAYON : il donne le champ quand rien n'a change, il enregistre quand
	# un nom valable est tape ; eteint, le nom tape ne passe pas.
	_save_button = CampStyle.hit("SaveName")
	_put(_save_button, 662, 511, 55, 45)
	var pencil := CampStyle.picture(CampStyle.tex("pencil"))
	Kit.fill(pencil)
	_save_button.add_child(pencil)
	_save_button.pressed.connect(func() -> void:
		if _name_edit.text.strip_edges() == String(_player.get("name", "")):
			_name_edit.grab_focus()
			_name_edit.select_all()
		else:
			_on_save_name())
	_guest_pill = Control.new()
	_guest_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_put(_guest_pill, 444, 563, 134, 27)
	var pill_bg := CampStyle.band("pill", _k, 27 * _k)
	pill_bg.size = _guest_pill.size
	_guest_pill.add_child(pill_bg)
	_put(_rabbit(wearing, 1.6), 466, 565, 23, 23, _guest_pill, Vector2(444, 563))
	_say(I18N.t("profile.guestLabel" if guest else "profile.accountLabel"), 494, 563, 80, 27, 17, CampStyle.TEXT, false, _guest_pill, Vector2(444, 563))
	_warn = _say("", 337, 560, 395, 32, 14, CampStyle.BAD)
	_warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_warn.visible = false
	_refresh_name()

	# Choisir mon lapin : deux rangees de cinq cases.
	_panel("section", 756, 187, 507, 244)
	_icon("icon-rabbit", 773, 200, 30, 30)
	_say(I18N.t("profile.chooseRabbit"), 810, 202, 430, 28, 22, CampStyle.TEXT, true)
	_rabbit_grid = Control.new()
	_rabbit_grid.name = "Rabbits"
	_rabbit_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_put(_rabbit_grid, 756, 187, 507, 244)
	_error = _say("", 1050, 336, 200, 78, 14, CampStyle.BAD)
	_error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error.clip_text = false
	_error.visible = false
	_refresh_rabbits()

	# Sauvegarder mon terrier — ou, lie, le compte.
	_panel("section", 756, 443, 507, 147)
	_icon("icon-shield", 773, 449, 35, 35)
	_say(I18N.t("profile.saveBurrowTitle" if guest else "profile.accountLabel"), 822, 452, 420, 28, 22, CampStyle.TEXT, true)
	_connect_hint = _say("", 772, 476, 480, 40, 15, Color("#c9dade"))
	_connect_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_connect_hint.clip_text = false
	_connect_hint.text_overrun_behavior = TextServer.OVERRUN_NO_TRIMMING
	# WEB3 SEULEMENT pour l'instant (2026-10-08) : la maquette montre
	# Google, E-mail et Wallet ; seul le wallet est branche, au milieu.
	var wallet := String(_player["wallet"]) if _player.get("wallet") != null else ""
	if guest:
		_connect_hint.text = I18N.t("profile.saveBurrowHint")
	elif not wallet.is_empty():
		_connect_hint.text = wallet.substr(0, 4) + "…" + wallet.right(4)
	if wallet.is_empty():
		_connect_button = _provider("wallet", 880.0, 517.0, 260.0)
		_connect_button.pressed.connect(_on_connect_wallet)
	_connect_error = _say("", 772, 482, 480, 24, 15, CampStyle.BAD)
	_connect_error.visible = false
	_refresh_connect()

	# Le depart, au pied : abandonner (invite) ou se deconnecter.
	_leave_button = _link("LeaveBurrow", 772, 597, 476, 28, true)
	_leave_label = _leave_button.get_node("Words")
	_leave_button.pressed.connect(_on_leave)
	_refresh_leave()


## UN BOUTON DE COMPTE : le cadre cuivre, son logo, son nom.
func _provider(kind: String, x: float, y: float, w: float = 149.0) -> Button:
	var b := CampStyle.hit("Link" + kind.capitalize())
	_put(b, x, y, w, 56)
	var bg := CampStyle.nine("outline", _k)
	bg.size = b.size
	b.add_child(bg)
	var o := Vector2(x, y)
	_icon({"google": "icon-google", "email": "icon-mail", "wallet": "icon-wallet"}[kind], x + 22, y + 10, 37, 37, b, o)
	_say(I18N.t("profile.walletShort" if kind == "wallet" else "auth." + kind), x + 66, y, w - 70, 56, 20, CampStyle.TEXT, false, b, o)
	return b


## UN LIEN DE DEPART : l'icone de sortie et le mot, en rouge, sans cadre,
## centres dans leur boite ; `rules` tire les deux filets de la maquette de
## part et d'autre.
func _link(name: String, x: float, y: float, w: float, h: float, rules: bool = false) -> Button:
	var b := CampStyle.hit(name)
	_put(b, x, y, w, h)
	var icon := CampStyle.picture(CampStyle.tex("icon-exit"))
	icon.name = "Icon"
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.size = Vector2(26, 24) * _k
	b.add_child(icon)
	var l := CampStyle.text("", 17 * _k, CampStyle.DANGER)
	l.name = "Words"
	l.clip_text = false
	b.add_child(l)
	if rules:
		for side in ["RuleL", "RuleR"]:
			var r := ColorRect.new()
			r.name = side
			r.color = Color("#2b6170")
			r.mouse_filter = Control.MOUSE_FILTER_IGNORE
			b.add_child(r)
	return b


## Le mot change (« Vraiment abandonner ? ») : l'icone et le mot se
## recentrent, les filets prennent ce qui reste, ou s'effacent.
func _center_link(b: Button) -> void:
	var l: Label = b.get_node("Words")
	var font := l.get_theme_font("font")
	var tw := font.get_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, -1, l.get_theme_font_size("font_size")).x
	tw = minf(tw, b.size.x - 34 * _k)
	var icon: Control = b.get_node("Icon")
	var whole := icon.size.x + 8 * _k + tw
	var x0 := (b.size.x - whole) * 0.5
	icon.position = Vector2(x0, (b.size.y - icon.size.y) * 0.5)
	l.position = Vector2(x0 + icon.size.x + 8 * _k, 0)
	l.size = Vector2(tw + 2, b.size.y)
	if b.has_node("RuleL"):
		var room := x0 - 14 * _k
		for side in ["RuleL", "RuleR"]:
			var r: ColorRect = b.get_node(side)
			r.visible = room > 20 * _k
			r.size = Vector2(minf(room, 90 * _k), 2 * _k)
			r.position = Vector2(x0 - 10 * _k - r.size.x if side == "RuleL" else x0 + whole + 10 * _k, b.size.y * 0.5)


func _refresh_rabbits() -> void:
	if _skin_detail or _tab != Tab.PROFILE or not is_instance_valid(_rabbit_grid):
		return
	var skins := SkinState.shared()
	if not skins.catalog.is_empty():
		_player["equippedSkin"] = skins.catalog.get("equipped", null)
		_player["look"] = skins.catalog.get("look", Look.of(_player))
	for child in _rabbit_grid.get_children():
		_rabbit_grid.remove_child(child)
		child.queue_free()
	var wearing := String(_picked) if _picked != null else Look.of(_player)
	if is_instance_valid(_portrait):
		_portrait.texture = AvatarFace.texture(wearing)
	var keys: Array = AvatarFace.KEYS + SkinState.SALE_NAMES.keys() + ["kuro-violet"]
	for i in keys.size():
		var key := String(keys[i])
		var premium: bool = Kit.SKINS.has(key)
		var locked: bool = premium and not skins.owns(key)
		var on := wearing == key
		# Les cases de la maquette : 85 x 78, au pas de 93,5 et de 92.
		var at := Vector2(777.0 + float(i % 5) * 93.5, 243.0 + float(i / 5) * 92.0)
		var cell := CampStyle.hit("Rabbit_" + key)
		_put(cell, at.x, at.y, 85, 78, _rabbit_grid, Vector2(756, 187))
		if SkinState.SALE_NAMES.has(key):
			var item := skins.item(key)
			cell.tooltip_text = SkinState.SALE_NAMES[key]
			if item.has("usdCents") and locked:
				cell.tooltip_text += " · $%.2f" % (float(item["usdCents"]) / 100.0)
		else:
			cell.tooltip_text = I18N.t("pass.skin") + " · " + I18N.t("pass.title") if premium else I18N.t("avatars." + key)
		cell.disabled = _saving or skins.busy
		var bg := CampStyle.nine("cell-on" if on else "cell-off", _k)
		bg.size = cell.size
		cell.add_child(bg)
		var face := _rabbit(key, 4.0)
		face.modulate.a = 0.45 if locked else 1.0
		_put(face, at.x + 14, at.y + 11, 56, 56, cell, at)
		if locked:
			var lock := CampStyle.picture(LOCK_ICON)
			lock.name = "Lock"
			lock.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			lock.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			_put(lock, at.x + 28, at.y + 32, 30, 30, cell, at)
		if on:
			_icon("check", at.x + 58, at.y - 6, 32, 32, cell, at)
		cell.pressed.connect(_on_skin_pick.bind(key) if premium else _on_pick.bind(key))
	if is_instance_valid(_error):
		_error.text = skins.note if skins.failed else _save_error
		_error.visible = not _error.text.is_empty()
	if is_instance_valid(_rail_face):
		_rail_face.texture = AvatarFace.texture(wearing)


## Detail d'achat accessible uniquement depuis le lapin verrouille : il prend
## la place des deux colonnes, l'en-tete et les onglets restent.
func _show_skin_offer(key: String = "solana") -> void:
	_show_tab(Tab.PROFILE)
	_skin_detail = true
	for child in _page.get_children():
		_page.remove_child(child)
		child.queue_free()
	_panel("content", 294, 123, 982, 508)
	_rabbit_grid = null
	_portrait = null
	var content := _list(312, 140, 950, 476, 8)
	var back := CampStyle.button(I18N.t("skins.back"))
	back.name = "BackToRabbits"
	back.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	back.pressed.connect(_show_tab.bind(Tab.PROFILE))
	content.add_child(back)
	var offer := SkinWardrobe.new()
	offer.camp = true
	offer.skin_key = key
	offer.connect_wallet.connect(func() -> void: _show_tab(Tab.PROFILE))
	content.add_child(offer)


func _refresh_name() -> void:
	if not is_instance_valid(_name_edit):
		return
	var renamed := _name_edit.text.strip_edges() != String(_player.get("name", ""))
	var problem := _name_problem(_name_edit.text)
	_warn.visible = renamed and not problem.is_empty()
	_warn.text = NAME_PROBLEMS.get(problem, "")
	_guest_pill.visible = not _warn.visible
	_save_button.disabled = _saving or (renamed and not problem.is_empty())
	_save_button.modulate.a = 0.5 if _save_button.disabled else 1.0
	_save_button.tooltip_text = I18N.t("profile.saving" if _saving else ("profile.save" if renamed else "profile.name"))


func _refresh_connect() -> void:
	if not is_instance_valid(_connect_button):
		return
	_connect_button.disabled = _connecting or not Wallet.available()
	_connect_button.modulate.a = 0.45 if _connect_button.disabled and not _connecting else 1.0
	var label: Label = _connect_button.get_child(2)
	label.text = I18N.t("auth.waiting" if _connecting else "profile.walletShort")
	_connect_button.tooltip_text = I18N.t("profile.waitingWallet" if _connecting else "auth.connect")


func _refresh_leave() -> void:
	if not is_instance_valid(_leave_button):
		return
	var guest := bool(_player.get("guest", false))
	var words := I18N.t("profile.disconnect")
	if guest:
		words = I18N.t("profile.abandonConfirm" if _confirming_abandon else "profile.abandon")
	_leave_label.text = words
	_leave_label.add_theme_color_override("font_color", CampStyle.COPPER if _confirming_abandon else CampStyle.DANGER)
	_center_link(_leave_button)


# ── L'onglet Historique ──────────────────────────────────────────────────────
# L'ecran du bas de 02, remonte de 560 px ; ses sections descendent jusqu'au
# pied du panneau (619), la place gagnee va aux listes.

func _build_history() -> void:
	if _history_failed or _history.is_empty():
		_say(I18N.t("profile.historyFailed" if _history_failed else "profile.loading"), 320, 200, 930, 40, 18, CampStyle.BAD if _history_failed else CampStyle.MUTED)
		return

	var days: Array = _history.get("days", []) if _history.get("days") is Array else []
	var raids_dict: Dictionary = _history.get("raids", {}) if _history.get("raids") is Dictionary else {}
	var against: Array = raids_dict.get("against", []) if raids_dict.get("against") is Array else []
	var by: Array = raids_dict.get("by", []) if raids_dict.get("by") is Array else []
	var bought: Array = _history.get("purchases", []) if _history.get("purchases") is Array else []

	# Carottes recoltees, a gauche.
	_panel("section", 305, 189, 414, 430)
	_icon("icon-carrot", 320, 197, 40, 41)
	_say(I18N.t("profile.harvests"), 366, 202, 340, 30, 22, CampStyle.TEXT, true)
	# Peu de jours : la caisse du camp tient le bas, sans rien inventer.
	var sparse := days.size() <= 3
	if sparse:
		_icon("vignette-harvest", 306, 436, 412, 182)
	var rows := maxi(days.size(), 1)
	var list_h := minf(16.0 + 58.0 * rows, (430.0 if sparse else 612.0) - 240.0)
	_panel("list", 316, 240, 389, list_h)
	var col := _list(318, 244, 385, list_h - 6, 0)
	if days.is_empty():
		col.add_child(_line(I18N.t("profile.noRuns"), 385, 50, 16, CampStyle.MUTED))
	else:
		var best := 1.0
		for d in days:
			best = maxf(best, float(d.get("carrots", 0)))
		for d in days:
			col.add_child(_day_row(d, best))

	# Les deux sens sur une seule ligne du temps : une querelle se lit comme
	# une querelle, pas comme deux listes.
	var raids: Array = against + by
	raids.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _unix(String(a.get("createdAt", ""))) > _unix(String(b.get("createdAt", ""))))
	# Les non lus sont les plus recents contre ce joueur (l'API les rend du
	# plus recent au plus ancien).
	var fresh := {}
	for i in mini(_new_raids, against.size()):
		fresh[String(against[i].get("id", ""))] = true
	var settled := _avenged_at(raids)
	_panel("section", 730, 189, 533, 212)
	_icon("icon-swords", 743, 199, 38, 36)
	_say(I18N.t("profile.raidsHeading"), 790, 202, 440, 30, 22, CampStyle.TEXT, true)
	var fights := _list(743, 238, 507, 155)
	if raids.is_empty():
		fights.add_child(_line(I18N.t("profile.noRaids"), 503, 48, 16, CampStyle.MUTED))
	for r in raids:
		var owed := String(r.get("direction", "")) == "against"
		var other := String(r.get("otherId", ""))
		var paid := owed and _unix(String(r.get("createdAt", ""))) < float(settled.get(other, 0))
		fights.add_child(_raid_row(r, owed, paid, fresh.has(String(r.get("id", "")))))

	# Ou les carottes SONT ALLEES : creuser n'est que la moitie du livre.
	_panel("section", 730, 413, 533, 206)
	_icon("icon-shop", 743, 421, 39, 41)
	_say(I18N.t("profile.purchasesHeading"), 790, 426, 440, 30, 22, CampStyle.TEXT, true)
	if bought.is_empty():
		_icon("vignette-chest", 925, 462, 143, 77)
		var none := _say(I18N.t("profile.noPurchases"), 745, 548, 505, 30, 18, CampStyle.TEXT)
		none.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	else:
		var spent := _list(743, 466, 507, 145, 2)
		for p in bought:
			spent.add_child(_purchase_row(p))


## Une ligne de texte seule dans une liste.
func _line(words: String, w: float, h: float, px: float, color: Color) -> Label:
	var l := CampStyle.text(words, px * _k, color)
	l.custom_minimum_size = Vector2(w, h) * _k
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.clip_text = false
	return l


## Une rangee de liste : un Control a la hauteur de maquette, ses enfants
## poses en coordonnees locales.
func _row(w: float, h: float) -> Control:
	var row := Control.new()
	row.custom_minimum_size = Vector2(w, h) * _k
	row.mouse_filter = Control.MOUSE_FILTER_PASS
	return row


## Un jour : la barre est la comparaison, le chiffre est le fait. A l'echelle
## du meilleur jour du joueur, sinon tout ressemble a rien au debut.
func _day_row(d: Dictionary, best: float) -> Control:
	var row := _row(385, 58)
	var o := Vector2.ZERO
	_say(_short_day(String(d.get("day", ""))), 19, 6, 280, 24, 18, CampStyle.TEXT, false, row, o)
	var track := ProgressBar.new()
	track.name = "HarvestBar"
	track.show_percentage = false
	track.max_value = best
	track.value = float(d.get("carrots", 0))
	track.add_theme_stylebox_override("background", StyleBoxEmpty.new())
	track.add_theme_stylebox_override("fill", StyleBoxEmpty.new())
	_put(track, 20, 31, 296, 20, row, o)
	var groove := CampStyle.band("bar-track", _k, 20 * _k)
	groove.size = track.size
	track.add_child(groove)
	var share := clampf(track.value / maxf(track.max_value, 1.0), 0.0, 1.0)
	if share > 0.0:
		var fill := CampStyle.band("bar-fill", _k, 20 * _k)
		fill.size = Vector2(maxf(track.size.x * share, 20 * _k), track.size.y)
		track.add_child(fill)
	var n := _say(I18N.group_digits(float(d.get("carrots", 0))), 318, 22, 66, 36, 25, CampStyle.COPPER, false, row, o)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	return row


func _raid_row(r: Dictionary, owed: bool, paid: bool, fresh: bool) -> Control:
	var row := _row(503, 48)
	var o := Vector2.ZERO
	var bg := CampStyle.nine("row", _k)
	bg.size = row.custom_minimum_size
	row.add_child(bg)
	_icon("icon-swords-small", 12, 7, 34, 34, row, o)
	var who := _say(_who_line(r), 55, 0, 240, 48, 18, CampStyle.TEXT, false, row, o)
	var action := String(r.get("kind", "burrow"))
	var looted := int(r.get("carrotsLooted", 0))
	var loot := action == "burrow" and String(r.get("result", "")) != "blocked" and looted > 0
	# Une dette ouverte laisse la place de l'heure a son bouton : le
	# montant recule d'autant.
	var debt := owed and not paid
	var shift := 105.0 if debt else 0.0
	var what := _say(("%s%d" % ["-" if owed else "+", looted]) if loot else _what_line(r), (290 if loot else 240) - shift + (30 if debt and loot else 0), 0, 105 if loot else 155, 48, 20 if loot else 15, CampStyle.BAD if owed else CampStyle.GOOD, false, row, o)
	what.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	if loot:
		_icon("icon-carrot-small", 398 - shift + (30 if debt else 0), 9, 26, 30, row, o)
	var when := _say(_ago(String(r.get("createdAt", ""))), 425, 0, 70, 48, 16, CampStyle.MUTED, false, row, o)
	when.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	if paid:
		# Barree sur le nom ET l'heure, qui ensemble sont la chose rayee :
		# « ce joueur, cette nuit-la, rendu ».
		who.text = "%s · %s" % [who.text, I18N.t("profile.avenged")]
		who.modulate.a = 0.55
		when.modulate.a = 0.55
	elif owed:
		# Ou ils sont MAINTENANT — le fait qui decide si riposter ce soir est
		# une promenade ou un combat.
		var where := String(_presence.get(String(r.get("otherId", "")), "away"))
		var dot := Kit.panel(_dot_style(where))
		dot.tooltip_text = I18N.t("raid.presence." + where)
		_put(dot, 40, 6, 9, 9, row, o)
	if fresh:
		var tag := Kit.panel(_news_style())
		tag.add_child(Kit.label("NEW", maxi(8, roundi(12 * _k)), Palette.SOIL_DEEP))
		_put(tag, 4, -2, 30, 16, row, o)
	if owed and not paid:
		# La dette : le bouton prend la place de l'heure.
		when.hide()
		var b := CampStyle.hit("Revenge")
		_put(b, 357, 7, 141, 34, row, o)
		var frame := CampStyle.nine("outline", _k)
		frame.size = b.size
		b.add_child(frame)
		var words := _say(I18N.t("profile.revenge"), 357, 7, 141, 34, 14, CampStyle.COPPER, false, b, Vector2(357, 7))
		words.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var other := String(r.get("otherId", ""))
		b.tooltip_text = _ago(String(r.get("createdAt", "")))
		b.pressed.connect(func() -> void:
			# Le raid se joue sur le plateau derriere : le panneau s'ecarte.
			closed.emit()
			revenge.emit(other))
	return row


func _purchase_row(p: Dictionary) -> Control:
	var row := _row(503, 32)
	var o := Vector2.ZERO
	var kind := String(p.get("kind", ""))
	var qty := int(p.get("qty", 1))
	var name := I18N.t("items.%s.name" % kind)
	var skin_names := {"skin_solana": "Solana", "skin_carrot": "Carrot"}
	if skin_names.has(kind):
		name = skin_names[kind]
	if name == "items.%s.name" % kind:
		name = kind
	_say(name + (" x%d" % qty if qty > 1 else ""), 10, 0, 280, 32, 17, CampStyle.TEXT, false, row, o)
	var price := _say(_price_of(p), 290, 0, 120, 32, 17, CampStyle.GOOD, false, row, o)
	price.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var when := _say(_ago(String(p.get("createdAt", ""))), 420, 0, 75, 32, 16, CampStyle.MUTED, false, row, o)
	when.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	return row


# ── Le reseau et les donnees ────────────────────────────────────────────────

func show_player(player: Dictionary) -> void:
	_player = player
	_avatar = player.get("avatar", Home.player.get("avatar", null))
	_picked = null
	_confirming_abandon = false
	if is_inside_tree():
		_show_tab(_tab)


## L'HISTORIQUE A MONTRER — la porte du banc comme celle du reseau, a la forme
## de /api/player/history : days, runs, purchases, raids {against, by, unseen}.
func show_history(history: Dictionary) -> void:
	_offline = _offline or not Session.signed_in()
	_history = history
	_history_failed = false
	_history_asked = true
	var raids: Dictionary = history.get("raids", {}) if history.get("raids") is Dictionary else {}
	_new_raids = int(raids.get("unseen", 0))
	_paint_badge()
	if is_inside_tree() and _tab == Tab.HISTORY:
		_show_tab(_tab)


func _fetch_history() -> void:
	_history_asked = true
	_history_failed = false
	var answer: Answer = await Net.get_json("/api/player/history", Session.token)
	if not is_inside_tree():
		return
	if not answer.ok:
		_history_failed = true
		if _tab == Tab.HISTORY:
			_show_tab(_tab)
		return
	show_history(answer.body)


func _load_skins() -> void:
	var skins := SkinState.shared()
	await skins.refresh()
	for item in skins.catalog.get("skins", []):
		var key := String(item.get("key", ""))
		if bool(item.get("pending", false)) and not skins.owns(key):
			skins.recover(key)
			break


func _paint_badge() -> void:
	if not is_instance_valid(_tab_badge):
		return
	var unseen := _unseen()
	_tab_badge.visible = unseen > 0
	_tab_badge_label.text = str(unseen)


func _unseen() -> int:
	var raids: Variant = _history.get("raids", null)
	return int(raids.get("unseen", 0)) if raids is Dictionary else 0


## La pastille rouge des nouvelles (`.rr-badge`).
func _news_style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.ALERT
	s.set_corner_radius_all(8)
	s.content_margin_left = 5
	s.content_margin_right = 5
	s.content_margin_top = 1
	s.content_margin_bottom = 1
	return s


func _on_skin_pick(key: String) -> void:
	if SkinState.shared().owns(key):
		_picked = null
		SkinState.shared().equip(key)
	else:
		# Le lapin dore aussi : sa page dit qu'il ne s'achete pas.
		_show_skin_offer(key)



func _name_problem(raw: String) -> String:
	var name := _normalize(raw)
	if name.length() < NAME_MIN:
		return "too_short"
	if name.length() > NAME_MAX:
		return "too_long"
	if _name_re.search(name) == null:
		return "bad_chars"
	return ""


## `normalizeName` : les blancs repetes fondus, les bouts coupes.
func _normalize(raw: String) -> String:
	var out := raw.strip_edges()
	while out.contains("  "):
		out = out.replace("  ", " ")
	return out


func _on_save_name() -> void:
	_save({"name": _name_edit.text.strip_edges()})


func _on_pick(key: String) -> void:
	_picked = key
	if _offline:
		_player["avatar"] = key
		_player["equippedSkin"] = null
		_player["look"] = key
		var skins := SkinState.shared()
		skins.catalog["equipped"] = null
		skins.catalog["look"] = key
	_save({"avatar": key})
	_show_tab(_tab)


## PATCH /api/player — les deux choses qu'un joueur possede sur lui-meme.
## Un renommage REEMET le jeton (le nom est une de ses revendications) : la
## session le reprend, sinon la socket presente l'ancien nom pendant trente
## jours.
func _save(patch: Dictionary) -> void:
	if _saving or _offline:
		return
	_saving = true
	_save_error = ""
	if is_instance_valid(_error):
		_error.visible = false
	_refresh_name()
	var answer := await _patch_player(patch)
	if not is_inside_tree():
		return
	_saving = false
	if answer.ok:
		var fresh: Dictionary = answer.body.get("player", {}) if answer.body.get("player") is Dictionary else {}
		# Le joueur de la reponse est la ligne complete SANS `guest`, que /me
		# ajoute a cote : on fond la reponse dans la session plutot que de la
		# remplacer, pour ne pas perdre ce que seule la session sait.
		var merged := Session.player.duplicate()
		merged.merge(fresh, true)
		merged.merge(patch, true)
		Session._adopt({"player": merged, "token": String(answer.body.get("token", ""))})
		_player = Session.player
		_picked = null
		if patch.has("avatar"):
			_avatar = patch["avatar"]
		updated.emit(patch)
	else:
		_save_error = answer.error()
	_show_tab(_tab)


## Net ne parle que GET et POST ; le profil est la seule route en PATCH, donc
## l'appel est construit ici a l'image de Net._send — un HTTPRequest a usage
## unique, le jeton en Bearer.
func _patch_player(patch: Dictionary) -> Answer:
	var request := HTTPRequest.new()
	request.timeout = Net.TIMEOUT_SECONDS
	add_child(request)
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"Authorization: Bearer %s" % Session.token,
	])
	var ticket := Net.begin()
	var started := request.request(Net.HOST + "/api/player", headers, HTTPClient.METHOD_PATCH, JSON.stringify(patch))
	if started != OK:
		request.queue_free()
		Net.end(ticket)
		return Answer.new(0, {})
	var result: Array = await request.request_completed
	request.queue_free()
	Net.end(ticket)
	var parsed: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	return Answer.new(int(result[1]), parsed if parsed is Dictionary else {})


## UN INVITE LIE SON WALLET : la meme danse que la porte du doorstep, mais par
## `link_wallet`, pour que le terrier creuse en attendant survive. Fermer sur
## le succes EST l'accuse de reception : le chip derriere vient de perdre son
## etat d'invite.
func _on_connect_wallet() -> void:
	if _connecting or not Wallet.available():
		return
	_connecting = true
	_connect_error.visible = false
	_refresh_connect()
	var address := await Wallet.address()
	if not is_inside_tree():
		return
	if address.is_empty():
		_connecting = false
		_refresh_connect()
		_say_connect(Wallet.last_error)
		return
	var signer := func(message: String) -> String: return await Wallet.sign(message)
	var ok := await Session.link_wallet(address, signer)
	if not is_inside_tree():
		return
	_connecting = false
	_refresh_connect()
	if ok:
		closed.emit()








## Le refus, la ou la pression a eu lieu : le silence ici se lit comme un
## bouton mort.
func _on_session_failed(message: String) -> void:
	_say_connect(message)


func _say_connect(message: String) -> void:
	if not is_instance_valid(_connect_error):
		return
	_connect_error.text = message
	_connect_error.visible = not message.is_empty()


## DECONNECTER, ou ABANDONNER en deux pressions. Le DELETE est attendu AVANT
## d'oublier la session : il a besoin du jeton. Un appel qui echoue finit
## quand meme la session ici — le joueur a demande a partir, et le janitor
## trouvera la ligne quand son jeton aura expire.
func _on_leave() -> void:
	var guest := bool(_player.get("guest", false))
	if guest and not _confirming_abandon:
		_confirming_abandon = true
		_refresh_leave()
		return
	if guest and not _offline:
		await Net.post_json("/api/auth/abandon", {}, Session.token)
	closed.emit()
	Session.sign_out()
	Screens.show_doorstep()

## `.rr-dot` : gris parti, rouge chez lui, vert dehors — les couleurs de la
## liste des raids, pour que le vert dise la meme chose aux deux endroits.
func _dot_style(where: String) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	match where:
		"digging":
			s.bg_color = Palette.LEAF
		"home":
			s.bg_color = Palette.BAD_ON_WOOD
		_:
			s.bg_color = Color(Palette.MUTED_ON_NIGHT, 0.75)
	s.set_corner_radius_all(4)
	return s


## `avengedAt` : quand chaque voleur a ete paye pour la derniere fois. Une
## dette se regle en lui prenant quelque chose — ses carottes ou sa run ; un
## passage revenu bredouille ne compte pas.
func _avenged_at(raids: Array) -> Dictionary:
	var last := {}
	for r in raids:
		if String(r.get("direction", "")) != "by":
			continue
		var kind := String(r.get("kind", "burrow"))
		if kind.is_empty():
			kind = "burrow"
		var got := kind == "shove" or kind == "lightning" or int(r.get("carrotsLooted", 0)) > 0
		if not got:
			continue
		var at := _unix(String(r.get("createdAt", "")))
		var other := String(r.get("otherId", ""))
		if at > float(last.get(other, 0)):
			last[other] = at
	return last


## QUI, sur une ligne : un passage de terrier nomme l'autre et laisse la
## colonne de droite dire ce qu'il a coute ; une mort sur l'ile n'a pas de
## chiffre, le verbe vient ici avec le nom.
func _who_line(r: Dictionary) -> String:
	var kind := String(r.get("kind", "burrow"))
	if kind.is_empty():
		kind = "burrow"
	var other := String(r.get("otherName", ""))
	var against := String(r.get("direction", "")) == "against"
	if kind == "burrow":
		return other if against else I18N.f("profile.youHit", [other])
	if not against:
		return I18N.f("profile.youShoved" if kind == "shove" else "profile.youStruck", [other])
	return other


## QUOI, a droite : une mort sur l'ile prend une RUN, pas des carottes, et
## « 0 dmg » se lirait comme rien — ces lignes disent ce qui a ete fait.
func _what_line(r: Dictionary) -> String:
	var kind := String(r.get("kind", "burrow"))
	if kind == "shove":
		return I18N.t("profile.shovedIn")
	if kind == "lightning":
		return I18N.t("profile.struckDown")
	if String(r.get("result", "")) == "blocked":
		return "blocked"
	var looted := int(r.get("carrotsLooted", 0))
	if looted > 0:
		return "%s%d 🥕" % ["-" if String(r.get("direction", "")) == "against" else "+", looted]
	return I18N.f("profile.damage", [int(r.get("damage", 0))])


## Ce qu'un achat a coute, dans la monnaie ou il a ete PAYE. Le serveur rend
## `token` (usdc, sol, skr) et `amount` en jetons entiers : un achat SOL se lit
## « 0.0008 SOL », jamais « $0.84 » (son `cost` est en lamports). Memes
## decimales que les prix de l'etal (Shop.RAIL_PLACES).
func _price_of(p: Dictionary) -> String:
	if String(p.get("currency", "")) != "usdc":
		return I18N.f("profile.spent", [I18N.group_digits(float(p.get("cost", 0)))])
	var token := String(p.get("token", "usdc"))
	var amount := float(p.get("amount", float(p.get("cost", 0)) / 1000000.0))
	if token == "usdc":
		return I18N.f("profile.usd", ["%.2f" % amount])
	return String.num(amount, int(Shop.RAIL_PLACES.get(token, 2))) + " " + String(Shop.RAILS.get(token, token.to_upper()))


## « Today », ou le jour. Le web ecrit « Mon 14 » par Intl ; Godot n'a pas de
## noms de jours dans la langue affichee, donc le jour reste sa date.
func _short_day(iso: String) -> String:
	var today := Time.get_date_string_from_system()
	if iso == today:
		return I18N.t("profile.today")
	return iso.substr(5) if iso.length() >= 10 else iso


## Grossier expres : « 3d » est la reponse, la minute exacte jamais.
func _ago(iso: String) -> String:
	var mins := int(floor((Time.get_unix_time_from_system() - _unix(iso)) / 60.0))
	if mins < 1:
		return I18N.t("profile.now")
	if mins < 60:
		return "%d%s" % [mins, I18N.t("units.m")]
	var hrs := mins / 60
	if hrs < 24:
		return "%d%s" % [hrs, I18N.t("units.h")]
	return "%d%s" % [hrs / 24, I18N.t("units.d")]


## Le serveur ecrit « 2026-09-22T10:00:00.000Z » ; Godot ne lit ni les
## millisecondes ni le Z, et les deux horloges sont en UTC.
func _unix(iso: String) -> float:
	if iso.length() < 19:
		return 0.0
	return float(Time.get_unix_time_from_datetime_string(iso.substr(0, 19)))


## OUVRIR L'HISTORIQUE MARQUE LES RAIDS LUS : le POST part, la pastille
## tombe, mais `_new_raids` garde le compte pour que les lignes disent NEW.
func _mark_seen() -> void:
	if _unseen() <= 0:
		return
	_history["raids"]["unseen"] = 0
	_paint_badge()
	if not _offline:
		Net.post_json("/api/player/history", {}, Session.token)


## SUIVRE LES VOLEURS du journal, tant qu'il est a l'ecran — les points sont
## la seule chose qui lit ca, et un abonnement derriere l'onglet Profil est
## une poussee que personne ne regarde.
func _follow_raiders() -> void:
	if _offline:
		return
	var raids: Variant = _history.get("raids", null)
	if not raids is Dictionary:
		return
	var ids := {}
	for r in raids.get("against", []):
		ids[String(r.get("otherId", ""))] = true
	if ids.is_empty():
		return
	GameSocket.watch_presence(ids.keys())


## `presence {id, where}` et `presence_all [{id, where}]` de server/index.ts.
func _on_socket_event(name: String, data: Variant) -> void:
	if name == "presence" and data is Dictionary:
		_presence[String(data.get("id", ""))] = String(data.get("where", "away"))
	elif name == "presence_all" and data is Array:
		for entry in data:
			if entry is Dictionary:
				_presence[String(entry.get("id", ""))] = String(entry.get("where", "away"))
	else:
		return
	if _tab == Tab.HISTORY:
		_show_tab(_tab)


func _exit_tree() -> void:
	# L'abonnement est celui du serveur ; il ne survit pas au panneau.
	if not _offline and _tab == Tab.HISTORY:
		GameSocket.unwatch_presence()


func _on_locale_changed(_code: String) -> void:
	set_title(I18N.t("profile.title"))
	_relabel_tabs()
	_show_tab(_tab)


## Construit le panneau et le pose sur le chrome. Rend le dialogue, pour que
## l'appelant branche `revenge` et `updated`. Par `new()` et non par la
## scene : Dialog construit tout dans `_init`, et un script qui precharge la
## scene qui le porte est une boucle que le chargeur refuse.
static func open(tab: Tab = Tab.PROFILE) -> Profile:
	var dialog := Profile.new()
	dialog._tab = tab
	Chrome.current.open(dialog)
	return dialog
