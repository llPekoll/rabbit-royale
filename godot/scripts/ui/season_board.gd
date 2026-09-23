class_name SeasonBoard
extends Dialog
## LE TABLEAU DE SAISON — les cinquante premiers, le podium dessine, et votre
## propre ligne encadree.
##
## Porte de src/components/leaderboard-drawer.tsx, podium-rabbit.tsx et
## lib/game/podium.ts, en gardant ce qu'ils ont decide :
##
##   • LA TETE DE LISTE EST DESSINEE, LA QUEUE RESTE DU TEXTE. Les trois
##     premiers ont leur lapin — le meneur une fois et demie plus grand,
##     couronne — parce qu'« une face sur chaque ligne serait une face sur
##     aucune ». Ici chaque lapin du podium est pose dans un anneau de pierre
##     (Kit.RING_1..3, les trois anneaux du chrome) : c'est le podium.
##   • LA COLONNE DU RANG GARDE LE CHIFFRE, meme pour le #1 : la couronne est
##     portee sur la tete du meneur, et « 1, 2, 3 » reste une suite lisible.
##   • LA SOUS-LIGNE N'EXISTE QUE POUR UNE RUN EN COURS. Elle portait
##     « burrow 4 · 7313 lifetime » sur chaque ligne, deux faits sur un inconnu
##     qui ne changent rien ; ce qui survit est « digging now · tap to
##     watch », la seule ligne qui vaille un tap.
##   • UNE LIGNE SE TAPE POUR REGARDER. Elle ne navigue pas : elle REMONTE
##     l'id (`spectate`), et c'est la page qui traverse. Inerte pour soi-meme
##     et pour qui n'est pas sur une ile — un spectate qui atterrit sur un
##     plateau vide est l'erreur `not_playing` deguisee en fonction.
##   • LA LIGNE DU JOUEUR EST UN PETIT CADRE A ELLE, dans la chaleur qu'elle a
##     toujours eue — trouvee d'un coup d'oeil dans une liste de cinquante.
##   • LE TABLEAU RAPPORTE VOTRE RANG (`me_changed`) : la pastille affiche le
##     rang et l'ecart, et ce tableau interroge deja la route qui porte les
##     deux. Une seconde requete depuis la page demanderait deux fois la meme
##     chose sur le meme rythme.
##   • L'OUVRIR POSE LA MARQUE « Look up » (config/quests.ts) — le seul fait
##     sur le tableau que le serveur ne peut pas voir lui-meme.
##
## CE QUI CHANGE ICI. Le web pose le tableau en panneau flottant a droite, a
## cote du terrier sur un grand ecran et par-dessus l'ile sur un telephone.
## Le client n'a qu'une mise en page de dialogue (dialog.gd) : le tableau est
## un Dialog ouvert par `Chrome.current.open`, centre sur un voile — comme le
## profil l'est deja sur le web. Un tap sur une ligne ferme donc le tableau
## (ce que le telephone fait aussi), puisque rien ne reste a cote.

## Regarder la run de ce joueur — le chrome decide ce que ca veut dire.
signal spectate(player_id: String)

## Votre rang et l'ecart au rang au-dessus, tels que /api/leaderboard les
## rend. -1 quand il n'y a rien : pas classe, ou #1 sans personne a rattraper.
signal me_changed(rank: int, to_pass: int)

## `limit=50` du web : de quoi voir loin sans charger tout le top 100.
const LIMIT := 50
## Le tableau ouvert relit toutes les 20 s : « qui est en train de creuser »
## change a la minute, et un bouton « regarder » qui pointe sur quelqu'un
## parti il y a dix minutes est pire que pas de bouton.
const POLL_SECONDS := 20.0

## lib/game/podium.ts : trois lignes portent une face, les runners-up a 2x la
## planche. Le web fait le meneur 2.5 fois plus grand ; ici il ne l'est que
## 1.5 fois, parce que l'ANNEAU porte le reste de l'accent — a 2.5 son anneau
## de pierre mangeait un tiers d'un tableau de 360 de haut.
const PODIUM := 3
const PODIUM_SIZE := 2.0
const LEAD_RATIO := 1.5
const LEAD_SIZE := PODIUM_SIZE * LEAD_RATIO
## Les anneaux de pierre autour d'un lapin du podium : l'anneau fait une fois
## et demie son lapin, ce qui pose le corps dans le trou de l'art (voir
## ring-1.webp, 128x128 dont ~96 de trou) sans l'ecraser.
const RING_OVER := 1.5
## La colonne des faces : celle du PLUS GRAND anneau, une seule largeur pour
## toutes les lignes du podium — sinon les noms ne partent plus du meme bord.
const FACE_COL := 14.0 * LEAD_SIZE * RING_OVER
## La couronne, podium.ts : sa largeur sur la tete (11/14 du cadre, un peu
## plus large pour deborder du crane), sa morsure et son inclinaison.
const CROWN_W_RATIO := (11.0 / 14.0) * 1.1
const CROWN_BITE_RATIO := 0.45
const CROWN_TILT := -14.0
const HEAD_DX := 1.0

## La largeur du dialogue. Le web vise ~333 pour le panneau ; le podium veut
## PODIUM_MIN_PANEL = 260 de liste au moins, et 360 les laisse a l'aise.
const WIDTH := 360.0
const HEIGHT := 360.0
## La colonne du rang, `clamp(18px, 2.6svh, 30px)`.
const RANK_COL := 30.0
## La taille des lignes. Le web descend jusqu'a 8px sur un ecran de 400 ;
## 12 reste lisible sur un Seeker et dix lignes tiennent quand meme.
const ROW_FONT := 12
const SUB_FONT := 9
## La note du vide. Le web l'ecrit en dur, hors dictionnaire
## (leaderboard-drawer.tsx) : elle est reprise telle quelle, pas traduite.
const EMPTY_NOTE := "Nobody has scored yet. Be the first."
## L'OR SUR LE PARCHEMIN. RANK_GOLD est l'or de la pastille, sur du bois
## sombre ; sur le papier creme du dialogue il disparaissait — le « 1 » du
## meneur et le nom de qui creuse ne se lisaient plus (2026-09-23). Le meme
## or, descendu jusqu'a tenir sur le creme.
const GOLD_ON_PAPER := Color("#9a6400")
## Le titre descend jusque-la pour tenir entre la couronne et le compte a
## rebours ; en dessous il s'abrege.
const TITLE_MIN := 10

var _list: VBoxContainer
var _scroll: ScrollContainer
var _days: Label
var _empty: Label
var _timer: Timer
## Les lignes telles que le serveur les a rendues, pour se relire dans une
## autre langue sans refaire l'appel.
var _entries: Array = []
var _me: Dictionary = {}
var _season: Dictionary = {}
## Un banc, ou une page sans session : pas de reseau.
var _offline := false
## La liste a-t-elle la place du podium (260px) ? Vrai tant qu'on ne sait pas.
var _roomy := true


func _init() -> void:
	super(I18N.t("chrome.season"), WIDTH, HEIGHT)


func _ready() -> void:
	# Le web met « 👑 » devant SEASON ; ici la couronne est l'art de l'ile.
	var header := title_label.get_parent()
	# Le panneau du coin est etroit : le titre a la taille du web (PixelTitle
	# a l'echelle 2, 16px), sinon « SEASON » sortait « SE ».
	# Et il RETRECIT pour tenir : « TEMPORADA » a 16 exigeait 263px d'un
	# panneau de 231, et le tableau sortait de l'ecran par la droite.
	title_label.add_theme_font_size_override("font_size", 16)
	title_label.clip_text = true
	title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title_label.resized.connect(_fit_title)
	var crown := Kit.icon(Kit.CROWN, 16)
	header.add_child(crown)
	header.move_child(crown, 0)
	# Le compte a rebours, entre le titre et le [x], dans l'encre secondaire.
	_days = Kit.label("", 12, Palette.BARK)
	header.add_child(_days)
	header.move_child(_days, header.get_child_count() - 2)
	# L'EN-TETE SERRE, SANS RESERVE POUR LE [x] : sur le web le [x] chevauche
	# le coin du cadre et ne prend rien a l'en-tete (leaderboard-drawer.tsx,
	# « the [x] landed on the title » tant que les coins mangeaient la place).
	# Avec 10px entre chaque piece et 30 de reserve, l'en-tete exigeait 275px
	# d'un panneau de 231 au Seeker : le tableau sortait de l'ecran par la
	# droite, son [x] avec.
	header.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	(header.get_child(header.get_child_count() - 1) as Control).custom_minimum_size.x = 0.0

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	set_body(_scroll)
	_list = Kit.vbox(0)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	ScrollFade.attach(_scroll)
	# LE PODIUM SUIT LA LARGEUR DE LA LISTE (PODIUM_MIN_PANEL, 260) : le
	# panneau du coin fait 231px sur le Seeker, et les faces n'y tiennent pas.
	# Mesuree a l'arrivee, pas supposee : on reconstruit quand elle change.
	_scroll.resized.connect(func() -> void:
		var roomy_now := _scroll.size.x >= 260.0
		if roomy_now != _roomy:
			_roomy = roomy_now
			_rebuild())

	# La note du vide est le seul contenu de la liste, et prend son air.
	_empty = Kit.note(EMPTY_NOTE, Palette.BARK)
	_empty.visible = false
	_list.add_child(_empty)

	I18N.locale_changed.connect(_on_locale_changed)
	_timer = Timer.new()
	_timer.wait_time = POLL_SECONDS
	_timer.timeout.connect(refresh)
	add_child(_timer)

	# Des lignes posees avant l'arbre (un banc) s'affichent maintenant.
	_paint_days()
	_rebuild()

	if Session.signed_in() and not _offline:
		# « Look up » est fait la premiere fois qu'on ouvre le tableau.
		Home.mark_quest(Content.MARK_LEADERBOARD)
		refresh()
		_timer.start()


## RELIRE LE TABLEAU. Silencieux sur un echec : ce qu'on a a l'ecran reste
## vrai a vingt secondes pres, et le prochain tick reessaiera.
func refresh() -> void:
	if _offline or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/leaderboard?limit=%d" % LIMIT, Session.token)
	if not answer.ok or not is_inside_tree():
		return
	var body := answer.body
	var me: Variant = body.get("me", null)
	var season: Variant = body.get("season", null)
	show_rows(body.get("entries", []), me if me is Dictionary else {}, season if season is Dictionary else {})


## POSER LES LIGNES — la porte du banc comme celle du reseau. `entries` a la
## forme des `Entry` du web (rank, playerId, name, score, avatar, crowned,
## digging), `me` celle de `Me` (rank, score, toPass), `season` {endsAt}.
func show_rows(entries: Array, me: Dictionary = {}, season: Dictionary = {}) -> void:
	_offline = _offline or not Session.signed_in()
	_entries = entries
	_me = me
	_season = season
	_report_me()
	if _list != null:
		_paint_days()
		_rebuild()


## Ce que la pastille attend : le rang et l'ecart, -1 pour « rien ».
func _report_me() -> void:
	var rank: Variant = _me.get("rank", null)
	var to_pass: Variant = _me.get("toPass", null)
	me_changed.emit(
		int(rank) if (rank is int or rank is float) else -1,
		int(to_pass) if (to_pass is int or to_pass is float) else -1)


## « 12d » : les jours qui restent, a l'arrondi superieur, jamais negatifs.
func _paint_days() -> void:
	var ends := String(_season.get("endsAt", ""))
	if ends.is_empty():
		_days.text = ""
		return
	# Le serveur ecrit « 2026-10-22T10:00:00.000Z » ; Godot ne lit ni les
	# millisecondes ni le Z, et les deux horloges sont en UTC.
	var end_unix := Time.get_unix_time_from_datetime_string(ends.substr(0, 19))
	var left := maxi(0, int(ceil((end_unix - Time.get_unix_time_from_system()) / 86400.0)))
	_days.text = "%d%s" % [left, I18N.t("units.d")]


func _rebuild() -> void:
	for child in _list.get_children():
		if child != _empty:
			child.queue_free()
	_empty.visible = _entries.is_empty()
	var mine := String(Session.player.get("id", ""))
	var roomy := _roomy
	var i := 0
	for entry in _entries:
		if not entry is Dictionary:
			continue
		_list.add_child(_make_row(entry, i, mine, roomy))
		i += 1


## UNE LIGNE : rang · [face] · nom (+ sous-ligne) · score. Un panneau qui
## porte la bande, et un Button transparent pose PAR-DESSUS qui prend le tap
## — un Button ne mesure pas ses enfants, et une ligne construite dedans
## n'avait pas de hauteur. Inerte quand il n'y a rien a regarder.
func _make_row(e: Dictionary, index: int, mine: String, roomy: bool) -> Control:
	var id := String(e.get("playerId", ""))
	var rank := int(e.get("rank", index + 1))
	var crowned := bool(e.get("crowned", false))
	var digging := bool(e.get("digging", false))
	var me := id == mine and not mine.is_empty()
	var on_podium := roomy and rank <= PODIUM

	var panel := Kit.panel(_row_style(me, index % 2 == 0))
	# L'AIR D'UNE LIGNE SUIT L'ECRAN (`.rr-lb-row` : clamp(4px, 1.1svh, 10px)
	# sur clamp(6px, 1.6svh, 12px)) : a 4px fixes, le bureau entassait dix-huit
	# lignes de 14px la ou le web en pose neuf qui respirent.
	var view_h := get_viewport_rect().size.y if is_inside_tree() else 400.0
	var pad_y := clampf(view_h * 0.011, 4.0, 10.0)
	var pad_x := clampf(view_h * 0.016, 6.0, 12.0) if roomy else 2.0
	var pad_top := pad_y
	if on_podium and crowned:
		# La couronne deborde par le haut : la premiere ligne n'a personne
		# au-dessus d'elle pour la recevoir, elle se reserve la place.
		pad_top = _crown_box(LEAD_SIZE)["rise"] + pad_y
	# SERRE quand la liste est etroite (le coin du Seeker, 231px) : le web y
	# tient le nom entier parce que ses lettres sont plus petites.
	var font := ROW_FONT if roomy else 10
	var box := Kit.margin(int(pad_x), int(pad_top), int(pad_x), int(pad_y))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)
	var row := Kit.hbox(8 if roomy else 4)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(row)

	var rank_label := Kit.label(str(rank), font, GOLD_ON_PAPER if crowned else Color(Palette.BARK, 0.62))
	rank_label.custom_minimum_size = Vector2(RANK_COL if roomy else 16.0, 0.0)
	rank_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	rank_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(rank_label)

	if on_podium:
		row.add_child(_podium(e.get("avatar", null), rank, crowned))

	var names := Kit.vbox(0)
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(names)
	var name_line := Kit.hbox(6)
	name_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	names.add_child(name_line)
	var name_label := Kit.label(String(e.get("name", "")), font, GOLD_ON_PAPER if digging else Palette.INK)
	name_label.clip_text = true
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_line.add_child(name_label)
	if digging:
		# Le point vert vit sur le NOM, pas dans la colonne du rang : c'est un
		# fait sur le joueur, et la colonne du rang est une case fixe.
		name_line.add_child(_live_dot())
		var sub := Kit.label(I18N.t("board.diggingNow"), SUB_FONT, Color(GOLD_ON_PAPER, 0.8))
		sub.clip_text = true
		sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		names.add_child(sub)

	var score := Kit.label(I18N.group_digits(float(e.get("score", 0))), font, Palette.CARROT)
	score.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(score)

	# Le Button vient EN DERNIER, sur tout le panneau : c'est lui qui recoit
	# le tap, les labels le laissent passer.
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.disabled = me or not digging
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if not b.disabled else Control.CURSOR_ARROW
	b.tooltip_text = I18N.f("board.watch", [e.get("name", "")]) if digging \
		else I18N.f("board.notOut", [e.get("name", "")])
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, Kit.style_empty())
	b.pressed.connect(func() -> void:
		spectate.emit(id)
		# Le tableau couvre le monde : rester ouvert cacherait la run qu'il
		# vient d'ouvrir. C'est ce que fait le telephone sur le web.
		closed.emit())
	# Une ligne qu'on ne peut pas taper s'efface un peu — sauf la votre, et
	# sauf celle qui creuse (`.rr-lb-row:disabled:not(.me):not(.digging)`).
	if b.disabled and not me and not digging:
		panel.modulate.a = 0.62
	panel.add_child(b)
	Kit.fill(b)
	return panel


## LE ZEBRA ET LA LIGNE DU JOUEUR. Une bande sur deux est un lavis d'ecorce
## (`rgba(122,88,48,.10)`) : « un trait entre les lignes ne suffit pas a en
## suivre une sur toute sa largeur, une bande si ». La votre est CHAUDE
## plutot que plus sombre, et cadree d'un lisere d'or (le PxPanel du web).
func _row_style(me: bool, odd: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.set_corner_radius_all(8)
	s.set_content_margin_all(0)
	if me:
		s.bg_color = Color(Palette.GOLD, 0.22)
		s.set_border_width_all(2)
		s.border_color = Palette.TAB_ON_RIM
	elif odd:
		s.bg_color = Color(Palette.BARK, 0.10)
	else:
		s.bg_color = Color(0, 0, 0, 0)
	return s


## Le point vert de « out on an island right now » (`.rr-live`).
func _live_dot() -> Control:
	var dot := Kit.panel(_dot_style())
	dot.custom_minimum_size = Vector2(6, 6)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return dot


func _dot_style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.LEAF
	s.set_corner_radius_all(3)
	s.shadow_color = Color(Palette.LEAF, 0.9)
	s.shadow_size = 3
	return s


## LE PODIUM : l'anneau de pierre du rang, le lapin debout dedans, et la
## couronne sur la tete du meneur. Les lapins sont de hauteurs differentes et
## doivent tenir sur le meme sol : la cellule est alignee en bas.
func _podium(avatar: Variant, rank: int, crowned: bool) -> Control:
	var size := LEAD_SIZE if crowned else PODIUM_SIZE
	var art := AvatarFace.ART.size * size
	var ring_px := art.x * RING_OVER
	var cell := Control.new()
	cell.custom_minimum_size = Vector2(FACE_COL, ring_px)
	cell.size_flags_vertical = Control.SIZE_SHRINK_END
	cell.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var ring := Kit.icon([Kit.RING_1, Kit.RING_2, Kit.RING_3][clampi(rank - 1, 0, 2)], ring_px)
	ring.position = Vector2((FACE_COL - ring_px) * 0.5, 0.0)
	ring.size = Vector2(ring_px, ring_px)
	cell.add_child(ring)

	var face := AvatarFace.portrait(avatar, size)
	face.position = ((Vector2(FACE_COL, ring_px) - art) * 0.5).floor()
	face.size = art
	cell.add_child(face)

	if crowned:
		var crown := _crown_box(size)
		var worn := Kit.icon(Kit.CROWN, crown["h"])
		worn.size = Vector2(crown["w"], crown["h"])
		# Centree sur la TETE, pas sur la cellule (HEAD_DX) ; la bande mord
		# dans le crane de `bite`, et la couronne penche (CROWN_TILT).
		worn.pivot_offset = Vector2(crown["w"] * 0.5, crown["h"])
		worn.position = Vector2(
			FACE_COL * 0.5 + HEAD_DX * size - crown["w"] * 0.5,
			face.position.y + crown["bite"] - crown["h"])
		worn.rotation = deg_to_rad(CROWN_TILT)
		cell.add_child(worn)
	return cell


## `crownBox(size)` de podium.ts : la boite dessinee de la couronne sur un
## lapin a `size`, et la hauteur que la ligne doit reserver au-dessus —
## mesuree sur la forme INCLINEE, sinon la pointe ressort par le haut.
func _crown_box(size: float) -> Dictionary:
	var w := AvatarFace.ART.size.x * size * CROWN_W_RATIO
	var h := w / float(Kit.CROWN.get_width()) * float(Kit.CROWN.get_height())
	var bite := h * CROWN_BITE_RATIO
	var rad := deg_to_rad(CROWN_TILT)
	var tilted := absf(h * cos(rad)) + absf(w * sin(rad))
	return {"w": w, "h": h, "bite": bite, "rise": ceilf(tilted - bite)}


## Le titre a la plus grande taille qui tient dans sa case, de 16 a
## TITLE_MIN ; l'ellipse prend le reste.
func _fit_title() -> void:
	var room := title_label.size.x
	if room <= 0.0:
		return
	var font := title_label.get_theme_font("font")
	var chosen := 16
	while chosen > TITLE_MIN and font.get_string_size(title_label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, chosen).x > room:
		chosen -= 1
	if title_label.get_theme_font_size("font_size") != chosen:
		title_label.add_theme_font_size_override("font_size", chosen)


func _on_locale_changed(_code: String) -> void:
	set_title(I18N.t("chrome.season"))
	_paint_days()
	_rebuild()


## Construit le tableau et le pose sur le chrome. Rend le dialogue, pour que
## l'appelant branche `spectate` et `me_changed`. Par `new()` et non par la
## scene : Dialog construit tout dans `_init`, et un script qui precharge la
## scene qui le porte est une boucle que le chargeur refuse.
static func open() -> SeasonBoard:
	var dialog := SeasonBoard.new()
	Chrome.current.open(dialog, true, "board")
	return dialog
