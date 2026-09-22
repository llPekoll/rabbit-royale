class_name Profile
extends Dialog
## LE PANNEAU DU JOUEUR — sa tete, son nom, ce qu'il a creuse, et qui l'a
## vole.
##
## Porte de src/components/profile-menu.tsx (et de wallet-button.tsx, qui
## l'ouvre), en gardant ce qu'ils ont decide :
##
##   • DEUX ONGLETS, parce que le panneau repond a deux questions. « Profile »
##     est ce qu'on change ; « History » est ce qui vous est arrive — dont les
##     raids tombes pendant votre absence, la seule facon d'apprendre qui a
##     vide le terrier pendant la nuit.
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

enum Tab { PROFILE, HISTORY }

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
## Les titres des sections de l'historique et la note de l'invite, eux aussi
## ecrits en dur sur le web (profile-menu.tsx), hors dictionnaire.
const H_DAYS := "Carrots dug"
const H_RAIDS := "Raids"
const H_BOUGHT := "Bought"
const H_RABBIT := "Rabbit"

## `.rr-profile` : min(380px, 100vw - 32), UNE hauteur pour les deux onglets.
const WIDTH := 380.0
const HEIGHT := 360.0
## Le grand portrait (size 4) et ceux du selecteur (size 2).
const PORTRAIT_SCALE := 4.0
const PICK_SCALE := 2.0
## Une case de lapin : le plancher tactile de 44px.
const PICK_CELL := 44.0

var _tabs: Array[Button] = []
var _tab_badge: PanelContainer
var _tab_badge_label: Label
var _scroll: ScrollContainer
var _page: VBoxContainer
var _tab: Tab = Tab.PROFILE

## Le joueur : Session.player, ou ce qu'un banc pose par `show_player`.
var _player: Dictionary = {}
var _avatar: Variant = null
var _picked: Variant = null
var _name_edit: LineEdit
var _warn: Label
var _save_button: PlankButton
var _error: Label
var _connect_button: PlankButton
var _connect_error: Label
var _leave_button: PlankButton
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
	super(I18N.t("profile.title"), WIDTH, HEIGHT)
	_name_re.compile(NAME_ALLOWED)


func _ready() -> void:
	var tabs := Kit.hbox(Kit.PAD_TIGHT)
	body.add_child(tabs)
	for which in [Tab.PROFILE, Tab.HISTORY]:
		var b := Button.new()
		b.focus_mode = Control.FOCUS_NONE
		# La hauteur d'un pouce, comme les onglets du web (44px) : sans elle
		# l'onglet se reduisait a sa ligne de texte, 16px.
		b.custom_minimum_size = Vector2(0.0, 40.0)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.pressed.connect(_show_tab.bind(which))
		var line := Kit.hbox(6)
		line.alignment = BoxContainer.ALIGNMENT_CENTER
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		Kit.fill(line)
		b.add_child(line)
		line.add_child(Kit.label("", 14))
		if which == Tab.HISTORY:
			# Les raids non lus, sur la chose qu'on presse : un compte qu'il
			# faut aller chercher n'est pas une notification.
			_tab_badge = Kit.panel(_news_style())
			_tab_badge_label = Kit.label("", 10, Palette.SOIL_DEEP)
			_tab_badge.add_child(_tab_badge_label)
			_tab_badge.visible = false
			line.add_child(_tab_badge)
		tabs.add_child(b)
		_tabs.append(b)

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(_scroll)

	I18N.locale_changed.connect(_on_locale_changed)
	Session.failed.connect(_on_session_failed)
	GameSocket.event.connect(_on_socket_event)

	if _player.is_empty() and Session.signed_in():
		show_player(Session.player)
	if Session.signed_in() and not _offline:
		_fetch_history()
	_relabel_tabs()
	_paint_badge()
	_show_tab(_tab)


## LE JOUEUR A MONTRER : id, name, wallet, guest, avatar. `Session.player` en
## jeu ; un dictionnaire factice sur un banc.
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
	if _tab_badge != null:
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


# ── Les onglets ──────────────────────────────────────────────────────────────

func _show_tab(which: Tab) -> void:
	_tab = which
	for i in _tabs.size():
		var on := i == int(which)
		var style := Kit.style_tab(on)
		for state in ["normal", "hover", "pressed", "focus", "disabled"]:
			_tabs[i].add_theme_stylebox_override(state, style)
		var label: Label = _tabs[i].get_child(0).get_child(0)
		label.add_theme_color_override("font_color", Palette.INK if on else Palette.CREAM)
	if _page != null:
		_page.queue_free()
	_page = Kit.vbox(Kit.PAD)
	_page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_page)
	if which == Tab.PROFILE:
		_build_profile()
		GameSocket.unwatch_presence()
	else:
		_build_history()
		_mark_seen()
		_follow_raiders()


func _relabel_tabs() -> void:
	var words := [I18N.t("profile.tabProfile"), I18N.t("profile.tabHistory")]
	for i in _tabs.size():
		var label: Label = _tabs[i].get_child(0).get_child(0)
		label.text = words[i]


func _paint_badge() -> void:
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


# ── L'onglet Profil ──────────────────────────────────────────────────────────

func _build_profile() -> void:
	var guest := bool(_player.get("guest", false))

	var portrait := AvatarFace.portrait(_picked if _picked != null else _avatar, PORTRAIT_SCALE)
	_page.add_child(portrait)

	# Le champ du nom est un CREUX, le puits sombre qu'il a toujours ete.
	_page.add_child(Kit.label(I18N.t("profile.name"), 12, Palette.BARK))
	_name_edit = LineEdit.new()
	_name_edit.text = String(_player.get("name", ""))
	_name_edit.max_length = NAME_MAX
	_name_edit.custom_minimum_size = Vector2(0.0, 44.0)
	_name_edit.add_theme_stylebox_override("normal", Kit.style_well())
	_name_edit.add_theme_stylebox_override("focus", Kit.style_well(true))
	_name_edit.add_theme_color_override("font_color", Palette.CREAM)
	_name_edit.add_theme_color_override("caret_color", Palette.CREAM)
	_name_edit.text_changed.connect(func(_t: String) -> void: _refresh_name())
	_page.add_child(_name_edit)
	_warn = Kit.note("", Palette.BAD_ON_PARCHMENT)
	_warn.visible = false
	_page.add_child(_warn)
	_save_button = Kit.button(I18N.t("profile.save"), "gold", 0.0, 44.0)
	_save_button.pressed.connect(_on_save_name)
	_page.add_child(_save_button)
	_refresh_name()

	_page.add_child(_heading(H_RABBIT))
	var grid := Kit.hbox(8)
	_page.add_child(grid)
	for key in AvatarFace.KEYS:
		var wearing: Variant = _picked if _picked != null else _avatar
		var on: bool = wearing == key
		var cell := Button.new()
		cell.focus_mode = Control.FOCUS_NONE
		cell.custom_minimum_size = Vector2(PICK_CELL, PICK_CELL)
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		cell.tooltip_text = I18N.t("avatars." + key)
		cell.disabled = _saving
		# La case choisie est cerclee d'or, la marque du jeu pour « celle-ci
		# est a toi » (`.rr-avatar-pick.on`).
		var style := Kit.style_well(on)
		for state in ["normal", "hover", "pressed", "focus", "disabled"]:
			cell.add_theme_stylebox_override(state, style)
		var face := AvatarFace.portrait(key, PICK_SCALE)
		face.set_anchors_preset(Control.PRESET_CENTER)
		face.position = -face.custom_minimum_size * 0.5
		cell.add_child(face)
		cell.pressed.connect(_on_pick.bind(key))
		grid.add_child(cell)

	_error = Kit.note("", Palette.BAD_ON_PARCHMENT)
	_error.visible = false
	_page.add_child(_error)

	if guest:
		# La verite plutot qu'une adresse vide : le terrier est reel et il
		# n'est que sur cet appareil, et l'offre est ici, a cote du nom et de
		# la tete, parce que c'est deja la qu'on vient rendre le compte sien.
		var note := Kit.panel(_note_style())
		_page.add_child(note)
		var column := Kit.vbox(8)
		note.add_child(column)
		column.add_child(Kit.note(I18N.t("auth.guestNote"), Palette.BARK, 11))
		_connect_button = Kit.button(I18N.shout(I18N.t("auth.connect")), "gold", 0.0, 44.0)
		_connect_button.pressed.connect(_on_connect_wallet)
		column.add_child(_connect_button)
		_connect_error = Kit.note("", Palette.BAD_ON_PARCHMENT)
		_connect_error.visible = false
		column.add_child(_connect_error)
		_refresh_connect()
	else:
		var wallet := String(_player.get("wallet", ""))
		if wallet.length() > 8:
			wallet = wallet.substr(0, 4) + "..." + wallet.substr(wallet.length() - 4)
		_page.add_child(Kit.label(wallet, 11, Palette.BARK))

	_leave_button = Kit.button("", "wood", 0.0, 44.0)
	_leave_button.pressed.connect(_on_leave)
	_page.add_child(_leave_button)
	_refresh_leave()


## Un titre de section (`.rr-profile-h`) : petit, en capitales, efface.
func _heading(text: String) -> Label:
	var l := Kit.label(text.to_upper(), 11, Palette.BARK)
	return l


## La note de l'invite (`.rr-guest-note`) : un lavis d'ecorce sur le parchemin.
func _note_style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(Palette.BARK, 0.10)
	s.set_border_width_all(1)
	s.border_color = Color(Palette.BARK, 0.35)
	s.set_corner_radius_all(8)
	s.set_content_margin_all(10)
	return s


## `nameProblem` : null quand le nom va, sinon pourquoi.
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


func _refresh_name() -> void:
	if _name_edit == null:
		return
	var renamed := _name_edit.text.strip_edges() != String(_player.get("name", ""))
	var problem := _name_problem(_name_edit.text)
	_warn.visible = renamed and not problem.is_empty()
	_warn.text = NAME_PROBLEMS.get(problem, "")
	_save_button.disabled = _saving or not renamed or not problem.is_empty()
	# Eteint, le bouton est du BOIS, comme le web : l'or qui ne se presse pas
	# se lisait « enregistre ici » avant meme d'avoir rien change.
	_save_button.board = PlankButton.tone_board("wood" if _save_button.disabled else "gold")
	_save_button.relabel(I18N.t("profile.saving" if _saving else "profile.save"))


func _refresh_connect() -> void:
	if _connect_button == null:
		return
	# Grise, pas cachee : sur un bureau la planche dit « pas ici », la ou une
	# planche absente dit « ca n'existe pas » (title.gd _refresh_doors).
	_connect_button.disabled = _connecting or not Wallet.available()
	_connect_button.relabel(I18N.shout(I18N.t("profile.waitingWallet" if _connecting else "auth.connect")))


func _refresh_leave() -> void:
	if _leave_button == null:
		return
	var guest := bool(_player.get("guest", false))
	var words := I18N.t("profile.disconnect")
	if guest:
		words = I18N.t("profile.abandonConfirm" if _confirming_abandon else "profile.abandon")
	_leave_button.relabel(I18N.shout(words))
	# La seconde pression est la dangereuse : elle passe au rouge.
	_leave_button.board = PlankButton.Board.DANGER if _confirming_abandon else PlankButton.Board.WOOD


func _on_save_name() -> void:
	_save({"name": _name_edit.text.strip_edges()})


func _on_pick(key: String) -> void:
	_picked = key
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
		if patch.has("avatar"):
			_avatar = patch["avatar"]
		updated.emit(patch)
	else:
		_error.text = answer.error()
		_error.visible = true
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
	var started := request.request(Net.HOST + "/api/player", headers, HTTPClient.METHOD_PATCH, JSON.stringify(patch))
	if started != OK:
		request.queue_free()
		return Answer.new(0, {})
	var result: Array = await request.request_completed
	request.queue_free()
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
	if _connect_error == null:
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


# ── L'onglet Historique ──────────────────────────────────────────────────────

func _build_history() -> void:
	if _history_failed:
		_page.add_child(Kit.note(I18N.t("profile.historyFailed"), Palette.BAD_ON_PARCHMENT))
		return
	if _history.is_empty():
		_page.add_child(Kit.note(I18N.t("profile.loading"), Palette.BARK))
		return

	var days: Array = _history.get("days", []) if _history.get("days") is Array else []
	var raids_dict: Dictionary = _history.get("raids", {}) if _history.get("raids") is Dictionary else {}
	var against: Array = raids_dict.get("against", []) if raids_dict.get("against") is Array else []
	var by: Array = raids_dict.get("by", []) if raids_dict.get("by") is Array else []
	var bought: Array = _history.get("purchases", []) if _history.get("purchases") is Array else []

	_page.add_child(_heading(H_DAYS))
	if days.is_empty():
		_page.add_child(Kit.note(I18N.t("profile.noRuns"), Palette.BARK))
	else:
		var best := 1.0
		for d in days:
			best = maxf(best, float(d.get("carrots", 0)))
		for d in days:
			_page.add_child(_day_row(d, best))

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

	_page.add_child(_heading(H_RAIDS))
	if raids.is_empty():
		_page.add_child(Kit.note(I18N.t("profile.noRaids"), Palette.BARK))
	else:
		for r in raids:
			var owed := String(r.get("direction", "")) == "against"
			var other := String(r.get("otherId", ""))
			var paid := owed and _unix(String(r.get("createdAt", ""))) < float(settled.get(other, 0))
			_page.add_child(_raid_row(r, owed, paid, fresh.has(String(r.get("id", "")))))

	# Ou les carottes SONT ALLEES : creuser n'est que la moitie du livre.
	_page.add_child(_heading(H_BOUGHT))
	if bought.is_empty():
		_page.add_child(Kit.note(I18N.t("profile.noPurchases"), Palette.BARK))
	else:
		for p in bought:
			_page.add_child(_purchase_row(p))


## Un jour : la barre est la comparaison, le chiffre est le fait. A l'echelle
## du meilleur jour du joueur, sinon tout ressemble a rien au debut.
func _day_row(d: Dictionary, best: float) -> Control:
	var row := Kit.hbox(8)
	var day := Kit.label(_short_day(String(d.get("day", ""))), 12, Palette.BARK)
	day.custom_minimum_size = Vector2(56, 0)
	row.add_child(day)
	var track := Kit.panel(Kit.style_track())
	track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	track.custom_minimum_size = Vector2(0, 10)
	track.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var fill := ColorRect.new()
	fill.color = Palette.CARROT
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	fill.anchor_right = clampf(float(d.get("carrots", 0)) / best, 0.0, 1.0)
	track.add_child(fill)
	row.add_child(track)
	var n := Kit.label(I18N.group_digits(float(d.get("carrots", 0))), 12, Palette.CARROT)
	n.custom_minimum_size = Vector2(40, 0)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(n)
	return row


## Une ligne du journal : qui · quoi · quand, et sous elle le bouton de la
## dette si elle est ouverte. Pris a vous se lit rouge, pris PAR vous or : le
## journal doit se parcourir pour « qui m'a eu » sans en lire un mot.
func _raid_row(r: Dictionary, owed: bool, paid: bool, fresh: bool) -> Control:
	var column := Kit.vbox(4)
	var line := Kit.hbox(8)
	column.add_child(line)
	var who_line := Kit.hbox(6)
	who_line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(who_line)
	# La face pixel est large : le nom et le fait se partagent la ligne et
	# se coupent en « … » plutot que de pousser l'heure hors du cadre.
	who_line.size_flags_stretch_ratio = 1.2
	var who := Kit.label(_who_line(r), 12, Palette.INK)
	who.clip_text = true
	who.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	who_line.add_child(who)
	var when := Kit.label(_ago(String(r.get("createdAt", ""))), 12, Palette.BARK)
	when.custom_minimum_size = Vector2(30, 0)
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
		dot.custom_minimum_size = Vector2(7, 7)
		dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		dot.tooltip_text = I18N.t("raid.presence." + where)
		who_line.add_child(dot)
	if fresh:
		var tag := Kit.panel(_news_style())
		tag.add_child(Kit.label("NEW", 9, Palette.SOIL_DEEP))
		tag.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		who_line.add_child(tag)
	var what := Kit.label(_what_line(r), 12, Palette.DANGER if owed else Palette.RANK_GOLD)
	what.clip_text = true
	what.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	what.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	what.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(what)
	line.add_child(when)
	if owed and not paid:
		# Le bouton de la dette, sur sa propre ligne dessous : une planche
		# assez large pour « REVENGE NOW » ne laisse pas la place d'un nom.
		var b := Kit.button(I18N.shout(I18N.t("profile.revenge")), "wood", 160.0, 30.0)
		b.label_size = 10
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		var other := String(r.get("otherId", ""))
		b.pressed.connect(func() -> void:
			# Le raid se joue sur le plateau derriere : le panneau s'ecarte.
			closed.emit()
			revenge.emit(other))
		column.add_child(b)
	return column


func _purchase_row(p: Dictionary) -> Control:
	var line := Kit.hbox(8)
	var kind := String(p.get("kind", ""))
	var qty := int(p.get("qty", 1))
	var name := I18N.t("items.%s.name" % kind)
	if name == "items.%s.name" % kind:
		name = kind
	var who := Kit.label(name + (" x%d" % qty if qty > 1 else ""), 12, Palette.INK)
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(who)
	line.add_child(Kit.label(_price_of(p), 12, Palette.RANK_GOLD))
	var when := Kit.label(_ago(String(p.get("createdAt", ""))), 12, Palette.BARK)
	when.custom_minimum_size = Vector2(30, 0)
	when.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	line.add_child(when)
	return line


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


## Ce qu'un achat a coute, dans la monnaie ou il a ete paye : un `cost` USDC
## est en unites de base (6 decimales) et doit revenir en dollars ici.
func _price_of(p: Dictionary) -> String:
	if String(p.get("currency", "")) == "usdc":
		return I18N.f("profile.usd", ["%.2f" % (float(p.get("cost", 0)) / 1000000.0)])
	return I18N.f("profile.spent", [I18N.group_digits(float(p.get("cost", 0)))])


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
static func open() -> Profile:
	var dialog := Profile.new()
	Chrome.current.open(dialog)
	return dialog
