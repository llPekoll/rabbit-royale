class_name TargetList
extends Dialog
## QUI VAUT LA PEINE D'ETRE VOLE — la liste des cibles d'un raid.
##
## Porte de raid-panel.tsx `TargetList`, en gardant ce qu'il a decide :
##
##   • UN MOT DE PRESENCE SUR CHAQUE LIGNE, `away` compris. La premiere
##     version ne marquait que les creuseurs, et les lignes vides disaient
##     deux choses opposees a la fois : personne, et chez lui qui regarde.
##     Un raider ne peut rien en faire, donc le silence n'est pas un des
##     trois etats.
##   • LES BOUCLIERS SE DECOMPTENT ICI, sans relire. `shieldedFor` est une
##     duree mesuree a l'arrivee de la liste ; ce qui reste est cela moins
##     le temps que le panneau est ouvert. Une minute est le bon grain — et
##     un bouclier qui tombe pendant que la liste est ouverte deverrouille
##     son bouton tout seul.
##   • QUAND le bouclier tombe, pas seulement qu'il est leve : la vraie
##     question du raider est s'il vaut la peine de revenir ce soir, et ces
##     boucliers courent de 6h a 48h.
##   • LE PEAGE SOUS LE BRIEF. Un raid puise dans la seule jauge, et cette
##     liste est l'endroit ou le joueur decide de la depenser — le nombre
##     n'etait nulle part a l'ecran jusqu'au 22 septembre 2026.
##
##   • TROIS PRISES EN TETE (2026-10-14, « on voit que 3 personnes sur tout
##     un ecran, c'est nul » ; la 6 de scenes/bench/target_list_lab.tscn) :
##     la revanche, le plus riche, celui qui creuse — chacune avec sa raison
##     ecrite. Tout le reste dessous, une ligne par terrier sur deux
##     colonnes : douze a l'ecran au lieu de trois. Le peage tient dans
##     l'en-tete, a droite du titre.
##
## La planche RAID est en rouge — c'est le geste le plus fort de l'ecran,
## la pression qui lance un vol ; une cible protegee garde une planche de
## bois grisee : montree, pas attaquable, parce qu'une liste qui cache ses
## boucliers a l'air vide sans raison.

## Les trois encres de la presence (globals.css `.rr-raid-where`) : gris
## pour l'absent, saumon pour qui est chez lui, vert pour qui creuse. Les
## memes que le journal des raids du profil, pour que le vert veuille dire
## la meme chose aux deux endroits.
const WHERE_INK := {
	"away": Color(139.0 / 255.0, 148.0 / 255.0, 158.0 / 255.0, 0.75),
	"home": Color(1.0, 138.0 / 255.0, 118.0 / 255.0, 0.95),
	"digging": Color(74.0 / 255.0, 222.0 / 255.0, 128.0 / 255.0, 0.95),
}

## Une ligne protegee est assombrie a .68 : assez pour que l'oeil passe,
## assez lisible pour lire l'heure quand on s'y arrete.
const SHIELDED_DIM := 0.68
## Le grain du compte a rebours (raid-panel.tsx : 60 000 ms).
const TICK_SECONDS := 60.0
## La planche RAID : 44 de haut (le plancher tactile), 84 de large au moins.
const RAID_W := 104.0
const RAID_H := 38.0
## REGARDER, sous RAID sur la ligne d'un creuseur : l'action seconde, plus
## basse, pour que la ligne ne double pas de hauteur.
const WATCH_H := 28.0
## Ce que Chrome._center_dialog laisse autour d'un dialogue : 17 en haut (le
## [x] qui deborde), Kit.EDGE en bas.
const DIALOG_AIR := 27.0
## La largeur du paysage : deux colonnes de lignes et trois prises de front.
const WIDTH := 860.0
## Une ligne du registre, et le plus petit RAID ou les feuilles laissent lire
## « Raid », « Watch », « Shielded ».
const ROW_H := 26.0
const ROW_BUTTON_W := 96.0
const WATCH_W := 90.0
const PICK_SCALE := 3.5
const OWED_INK := Color("#ff6a4a")
## Le peage ou le refus, a droite du titre : le titre garde sa place.
const FOOT_MAX_W := 460.0

var _scroll: ScrollContainer
var _picks: HBoxContainer
var _rows: GridContainer
var _foot: Label
## La largeur commune des planches RAID, mesuree sur le plus long des deux
## mots de la langue (`_button_width`).
var _button_w := RAID_W
var _fit_queued := false
var _tick: Timer
var _elapsed_ms := 0.0
## Le raid qui etait la a l'ouverture (jamais, dans le jeu : page.tsx ne
## montre la liste que `!shownRaid`) — la liste se ferme sur un raid qui
## COMMENCE, pas sur celui qu'un banc a pose avant elle.
var _raid_at_open := ""
## La liste se ferme deja : `closed` appelle d'abord `state.clear_note`
## (branche dans `_ready`, avant le `close_dialog` du chrome), qui reemet
## `changed`, qui revenait ici fermer encore — recursion jusqu'au stack
## overflow au premier raid lance depuis la liste (2026-10-01).
var _closing := false
## Quand la liste a defile pour la derniere fois. Les lignes et les boutons
## laissent passer le doigt jusqu'au ScrollContainer (MOUSE_FILTER_PASS) :
## un glisse qui commence sur RAID fait defiler — et ne doit pas lancer un
## raid en se relevant sur le bouton (`_just_scrolled`).
var _scrolled_at := -100000


func _init() -> void:
	# `min(720px, 100%)`, la meme largeur que la liste des iles.
	super(I18N.t("raid.whose"), WIDTH, 0)


func _ready() -> void:
	var column := Kit.vbox(Kit.PAD_TIGHT)
	set_body(column)
	_picks = Kit.hbox(8)
	column.add_child(_picks)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0, 120)  # jusqu'a `_fit_scroll`
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_scroll)
	_rows = GridContainer.new()
	_rows.columns = 2
	_rows.add_theme_constant_override("h_separation", 12)
	_rows.add_theme_constant_override("v_separation", 2)
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_rows)
	ScrollFade.attach(_scroll)
	_scroll.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void:
		_scrolled_at = Time.get_ticks_msec())

	# LE PEAGE DANS L'EN-TETE, a droite du titre — sa planche de pied
	# mangeait deux lignes. Un refus du serveur (`state.note`) y prend sa
	# place, en rouge.
	_foot = Kit.label("", 10, Palette.INK)
	_foot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_foot.clip_text = true
	_foot.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_header.add_child(_foot)
	_header.move_child(_foot, _close_reserve.get_index())
	get_viewport().size_changed.connect(_queue_fit)

	_tick = Timer.new()
	_tick.wait_time = TICK_SECONDS
	_tick.timeout.connect(_on_tick)
	add_child(_tick)
	_tick.start()

	var state := RaidState.current
	_raid_at_open = String(state.raid.get("raidId", ""))
	state.changed.connect(_rebuild)
	state.targets_changed.connect(_on_targets)
	I18N.locale_changed.connect(_on_locale_changed)
	closed.connect(state.clear_note)
	_rebuild()


## LA PORTE : la verification d'energie de page.tsx `openRaid`, puis le
## dialogue. RAID sans une jauge de raid : le dire sur-le-champ, avec
## l'attente, plutot que d'ouvrir une liste dont chaque ligne serait refusee
## (Paul, 21 septembre 2026).
static func open() -> void:
	var live := Home.live_energy()
	var have := int(live.get("energy", 0))
	var floor_needed := Tuning.raid_floor()
	Net.trace("liste RAID : energie=%d, plancher=%d" % [have, floor_needed])
	if have < floor_needed:
		var per_hour := maxf(1.0, float(Home.burrow.get("regenPerHour", 1)))
		var wait_ms := (floor_needed - have) / per_hour * 3600000.0
		RaidState.current.noted.emit(I18N.f("loop.raidNeeds", [floor_needed, have, I18N.wait(wait_ms)]), true)
		return
	if Chrome.current != null:
		Chrome.current.open(TargetList.new())
	RaidState.current.refresh()


func _on_targets() -> void:
	_elapsed_ms = 0.0
	_tick.start()
	_rebuild()


func _on_tick() -> void:
	_elapsed_ms += TICK_SECONDS * 1000.0
	_rebuild()


func _on_locale_changed(_code: String) -> void:
	set_title(I18N.t("raid.whose"))
	_rebuild()


## Tout le corps, reecrit d'apres l'etat : les lignes sont peu nombreuses
## (vingt au plus) et les reconstruire est plus sur que de les raccorder.
func _rebuild() -> void:
	if _closing:
		return
	var state := RaidState.current
	# Un raid a commence : la liste n'a plus lieu d'etre (page.tsx ne la
	# montre que `!shownRaid`).
	if state.has_raid() and String(state.raid.get("raidId", "")) != _raid_at_open:
		_closing = true
		closed.emit()
		return

	for host in [_picks, _rows]:
		for old in (host as Node).get_children():
			host.remove_child(old)
			old.queue_free()

	_button_w = _button_width()
	var targets: Array = state.targets.filter(func(t: Variant) -> bool: return t is Dictionary)
	if targets.is_empty() and state.targets_pending():
		_picks.add_child(LoadingNote.new(13, Palette.INK))
	elif targets.is_empty():
		_picks.add_child(Kit.note(I18N.t("raid.nobodyYet"), Palette.INK, 13))
	else:
		var chosen := _choose(targets)
		# TOUT EST FERME : le dire en tete, plutot qu'une liste grise muette —
		# s'il reste de la place a cote des cartes (chacune dit deja son
		# bouclier).
		if chosen.size() < 3 and not chosen.any(func(p: Dictionary) -> bool: return _open(p["target"])):
			var all_shut := Kit.note(I18N.t("raid.allShielded"), Palette.INK, 12)
			all_shut.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			_picks.add_child(all_shut)
		for pick in chosen:
			_picks.add_child(_pick_card(pick["target"], String(pick["why"]), pick["ink"], state))
		var taken: Array = chosen.map(func(p: Dictionary) -> Dictionary: return p["target"])
		for target in targets:
			if not taken.has(target):
				_rows.add_child(_row(target, state))
	_picks.visible = _picks.get_child_count() > 0
	_scroll.visible = _rows.get_child_count() > 0

	if not state.note.is_empty():
		_foot.text = state.note
		_foot.add_theme_color_override("font_color", Palette.BAD_ON_WOOD)
	else:
		_foot.text = I18N.f("raid.cost", [Tuning.i("RAID_RUN.TOLL"), Tuning.i("RAID_RUN.STAKE")])
		_foot.add_theme_color_override("font_color", Palette.INK)
	# UN LIBELLE COUPE N'A PAS DE LARGEUR A LUI : sans celle de son texte, il
	# tombait a zero a cote du titre.
	var font := _foot.get_theme_font("font")
	var line := font.get_string_size(_foot.text, HORIZONTAL_ALIGNMENT_LEFT, -1, _foot.get_theme_font_size("font_size")).x
	_foot.custom_minimum_size.x = ceilf(minf(line + 2.0, FOOT_MAX_W))
	_queue_fit()


## LES TROIS PRISES, dans cet ordre : celui qui m'a pille (`owed`, le
## serveur le met deja en tete), le plus riche, le plus riche de ceux qui
## creusent (sans garde). Les deux dernieres d'abord parmi les terriers qu'on
## peut piller maintenant ; TOUJOURS LES TROIS (2026-10-18, « je veux voir les
## 3 en meme temps ») : sans terrier ouvert, la carte prend un ferme, grisee
## avec son bouclier, comme la revanche.
func _choose(targets: Array) -> Array[Dictionary]:
	var rich := targets.duplicate()
	# Les ouverts devant, puis chacun par carottes.
	rich.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if _open(a) != _open(b):
			return _open(a)
		return int(a.get("stock", 0)) > int(b.get("stock", 0)))
	var out: Array[Dictionary] = []
	var taken: Array = []
	var take := func(t: Variant, why: String, ink: Color) -> void:
		if t is Dictionary and not taken.has(t):
			taken.append(t)
			out.append({"target": t, "why": why, "ink": ink})
	# LA REVANCHE, MEME FERMEE (2026-10-14, « et celui qui t'a raid en
	# dernier ? ») : le dernier qui nous a pilles a sa carte, son bouclier ou
	# sa raison a la place des carottes, RAID grise. Le serveur les met en
	# tete, du plus recent au plus ancien.
	var owed: Array = targets.filter(func(t: Dictionary) -> bool: return bool(t.get("owed", false)))
	if not owed.is_empty():
		take.call(owed[0], I18N.t("raid.pickRevenge"), OWED_INK)
	for t in rich:
		if not taken.has(t):
			take.call(t, I18N.t("raid.pickRichest"), Palette.LAMP)
			break
	for t in rich:
		if not taken.has(t) and RaidState.current.presence_of(t) == RaidState.DIGGING:
			take.call(t, I18N.t("raid.pickUnguarded"), WHERE_INK["digging"])
			break
	return out


## Ce qui reste de leur bouclier maintenant. Une cible sans `shieldedFor`
## (un vieux serveur) garde le drapeau qu'on lui a envoye, sans heure (-1).
##
## Le verdict du classement (`door`, raid-door.ts) compte aussi : « shield »
## porte l'attente du bouclier OU de mon delai entre deux raids sur lui.
func _shield_left(target: Dictionary) -> float:
	var wait := float(target.get("doorWaitMs", 0.0)) if String(target.get("door", "")) == "shield" else 0.0
	if target.has("shieldedFor"):
		return maxf(0.0, maxf(float(target["shieldedFor"]), wait) - _elapsed_ms)
	return 1.0 if bool(target.get("shielded", false)) else 0.0


## FERME POUR UNE AUTRE RAISON qu'un bouclier : rien a prendre (`bare`), ou
## endormi et deja pille depuis (`asleep`). Ceux-la ne sont listes que parce
## qu'ils nous doivent une revanche ; la ligne dit pourquoi, comme le
## classement. "" : ouvert.
static func _closed(target: Dictionary) -> String:
	var door := String(target.get("door", ""))
	return door if door in ["bare", "asleep"] else ""


func _open(target: Dictionary) -> bool:
	return _shield_left(target) <= 0.0 and _closed(target).is_empty()


## UNE PRISE : sa raison en tete, le visage du lapin, le nom, ce qu'il
## garde, et RAID en grand — REGARDER a cote pour celui qui creuse.
func _pick_card(target: Dictionary, why: String, ink: Color, state: RaidState) -> Control:
	var card := PanelContainer.new()
	var s := Kit.style_well(true)
	s.set_content_margin_all(6)
	card.add_theme_stylebox_override("panel", s)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.mouse_filter = Control.MOUSE_FILTER_PASS
	var line := Kit.hbox(8)
	card.add_child(line)
	var face := AvatarFace.portrait(target.get("avatar"), PICK_SCALE)
	face.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(face)
	var col := Kit.vbox(2)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var reason := Kit.label(why, 10, ink)
	reason.clip_text = true
	reason.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	col.add_child(reason)
	col.add_child(_name(target, 13))
	col.add_child(_carrots(target, 13))
	var buttons := Kit.hbox(4)
	var digging := state.presence_of(target) == RaidState.DIGGING
	# Un creuseur sous bouclier : REGARDER seul, le bouclier est dit au-dessus
	# (« Shielded » ne tenait pas a cote, coupe en « hielde »).
	if not (digging and _shield_left(target) > 0.0):
		var raid := _raid_button(target, state, 0.0, 30.0)
		raid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		buttons.add_child(raid)
	if digging:
		buttons.add_child(_watch_button(target, state, WATCH_W, 30.0))
	col.add_child(buttons)
	line.add_child(col)
	return card


## UNE LIGNE DU REGISTRE : le point de la presence, le nom, REVANCHE s'il
## nous doit, ce qu'il garde (ou l'heure de son bouclier), RAID — et
## REGARDER pour qui creuse. Un creux du parchemin, pas une planche : deux
## fois moins haute.
func _row(target: Dictionary, state: RaidState) -> Control:
	var shielded := _shield_left(target) > 0.0
	var where := state.presence_of(target)
	var well := PanelContainer.new()
	var s := Kit.style_well()
	s.set_border_width_all(1)
	s.set_corner_radius_all(5)
	s.content_margin_left = 6
	s.content_margin_right = 3
	s.content_margin_top = 1
	s.content_margin_bottom = 1
	well.add_theme_stylebox_override("panel", s)
	well.custom_minimum_size.y = ROW_H
	well.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# Un PanelContainer ARRETE le doigt par defaut : au mobile, la liste ne
	# defilait que dans les interstices entre deux planches (2026-10-01).
	well.mouse_filter = Control.MOUSE_FILTER_PASS
	# Une ligne protegee s'assombrit pour que l'oeil passe — sauf celle d'un
	# creuseur, qui garde un geste ouvert (REGARDER).
	if (shielded and where != RaidState.DIGGING) or not _closed(target).is_empty():
		well.modulate.a = SHIELDED_DIM
	var line := Kit.hbox(6)
	well.add_child(line)
	line.add_child(_dot(WHERE_INK.get(where, WHERE_INK["away"]), where == RaidState.DIGGING))
	var name := _name(target, 12)
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.custom_minimum_size.x = 40
	line.add_child(name)
	if bool(target.get("owed", false)):
		var tag := Kit.label(I18N.t("raid.owedTag"), 9, OWED_INK, true)
		tag.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		line.add_child(tag)
	line.add_child(_carrots(target, 11))
	if where == RaidState.DIGGING:
		line.add_child(_watch_button(target, state, WATCH_W, ROW_H - 4.0))
	line.add_child(_raid_button(target, state, ROW_BUTTON_W, ROW_H - 4.0))
	return well


func _name(target: Dictionary, px: int) -> Label:
	var name := Kit.label(String(target.get("name", "")), px, Palette.CREAM, true)
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return name


## LA RESERVE, comme la rangee du web (`groupDigits(t.stock)` 🥕) — ou,
## protege, QUAND le bouclier tombe, en lumiere de lampe.
func _carrots(target: Dictionary, px: int) -> HBoxContainer:
	var row := Kit.hbox(3)
	row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var shut := _closed(target)
	if not shut.is_empty():
		row.add_child(Kit.label(I18N.t("raid.door." + shut), px - 1, Palette.LAMP))
		return row
	var left := _shield_left(target)
	if left > 0.0:
		row.add_child(Kit.icon(Kit.ICONS["shield"], px + 2))
		if target.has("shieldedFor"):
			row.add_child(Kit.label(I18N.short_wait(left), px - 1, Palette.LAMP))
		return row
	row.add_child(Kit.label(I18N.group_digits(int(target.get("stock", 0))), px, Palette.CREAM, true))
	row.add_child(Kit.icon(Kit.ICONS["carrot"], px + 2))
	return row


## « Raid » dans sa casse, sur le bois du web. Protege : la planche grisee
## dit « Shielded ».
func _raid_button(target: Dictionary, state: RaidState, w: float, h: float) -> PlankButton:
	var shielded := _shield_left(target) > 0.0
	var off := state.busy or not _open(target)
	var button := Kit.button(I18N.t("raid.shielded") if shielded else I18N.t("raid.raidIt"), "wood", w, h)
	button.label_size = 11
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.disabled = off
	button.mouse_filter = Control.MOUSE_FILTER_PASS
	if off:
		button.modulate.a = 0.75
	var id := String(target.get("id", ""))
	button.pressed.connect(func() -> void:
		if _just_scrolled():
			return
		Net.trace("bouton Raid sur %s (busy=%s, presence=%s)" % [id, str(state.busy), state.presence_of(target)])
		state.enter(id))
	return button


## IL CREUSE : aller le voir sur son ile, et de la l'electrocuter ou
## l'encrer (le spectateur arme, server/index.ts `lightning`/`bloop`). Le
## bouclier ne protege que le terrier : regarder reste ouvert.
func _watch_button(target: Dictionary, state: RaidState, w: float, h: float) -> PlankButton:
	var watch := Kit.button(I18N.t("raid.watchIt"), "blue", w, h)
	watch.label_size = 11
	watch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	watch.disabled = state.busy
	watch.mouse_filter = Control.MOUSE_FILTER_PASS
	if state.busy:
		watch.modulate.a = 0.75
	var id := String(target.get("id", ""))
	watch.pressed.connect(func() -> void:
		if _just_scrolled():
			return
		Net.trace("bouton Regarder sur %s (busy=%s)" % [id, str(state.busy)])
		if Chrome.current != null:
			Chrome.current.watch(id))
	return watch


## LA LISTE PREND LA HAUTEUR QU'ELLE A, EN LIGNES ENTIERES. Un creux fixe de
## 180 montait trois lignes et un tiers : la quatrieme sortait coupee au ras
## de son nom, comme un bug, et sur un bureau de 768 la liste defilait avec
## la moitie de l'ecran vide sous elle. Elle tient donc toutes ses lignes si
## l'ecran les tient (le chrome la centre a 17 px du haut et Kit.EDGE du bas),
## et sinon autant de lignes ENTIERES qu'il y a de place — la barre dit le
## reste.
## A L'IMAGE SUIVANTE, une fois par image : les lignes viennent d'etre
## posees et ne se sont pas encore mesurees. Pas sur `minimum_size_changed`
## des lignes : la hauteur choisie fait paraitre ou disparaitre la barre, qui
## change la largeur des lignes et donc leur minimum — et la mesure se
## relancait sans fin (le banc restait fige).
func _queue_fit() -> void:
	if not _fit_queued and is_inside_tree():
		_fit_queued = true
		get_tree().process_frame.connect(_fit_scroll, CONNECT_ONE_SHOT)


func _fit_scroll() -> void:
	_fit_queued = false
	if not is_inside_tree() or _rows.get_child_count() == 0:
		_scroll.custom_minimum_size.y = 0.0
		return
	var want := _rows.get_combined_minimum_size().y
	var others := get_combined_minimum_size().y - _scroll.custom_minimum_size.y
	var room := get_viewport_rect().size.y - DIALOG_AIR - others
	var h := want
	# TOUT TIENT : pas de defilement du tout. Laisse en AUTO, un creux de la
	# hauteur exacte de ses lignes faisait paraitre puis disparaitre sa barre
	# (qui retrecit les lignes, qui changent de hauteur…) et Godot tournait
	# sans fin dans son tri — le banc restait fige.
	var fits := want <= room
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED if fits \
		else ScrollContainer.SCROLL_MODE_AUTO
	if not fits:
		var first := _rows.get_child(0) as Control
		var gap := float(_rows.get_theme_constant("v_separation"))
		var pitch := first.get_combined_minimum_size().y + gap
		h = maxf(pitch - gap, floorf((room + gap) / pitch) * pitch - gap)
	# Au pixel pres : un demi-pixel de va-et-vient (la barre qui parait et
	# disparait) ne doit pas relancer la mesure.
	h = floorf(h)
	if absf(_scroll.custom_minimum_size.y - h) >= 1.0:
		_scroll.custom_minimum_size.y = h


## LA MEME LARGEUR POUR TOUTES LES PLANCHES de la colonne, celle qui tient
## le plus long des trois mots (RAID, bouclier, REGARDER) a sa taille pleine. Une largeur fixe de 104
## faisait tenir « Raid » et retrecir « Com escudo » a 9 px ; une largeur au
## mot aurait decale la colonne des chiffres d'une ligne a l'autre.
func _button_width() -> float:
	var font := get_theme_font("font", "Label")
	var widest := 0.0
	for key in ["raid.raidIt", "raid.shielded", "raid.watchIt"]:
		widest = maxf(widest, font.get_string_size(I18N.t(key), HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x)
	return maxf(RAID_W, ceilf(widest + 2.0 * PlankButton.TEXT_PAD + 4.0))


## Le point de la presence, 7 px ; celui du creuseur bat (`rr-live-pulse`).
func _dot(ink: Color, live: bool) -> Control:
	var dot := PresenceDot.new()
	dot.ink = ink
	dot.custom_minimum_size = Vector2(7, 7)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if live:
		var pulse := dot.create_tween().set_loops()
		pulse.tween_property(dot, "modulate:a", 0.45, 0.9).set_trans(Tween.TRANS_SINE)
		pulse.tween_property(dot, "modulate:a", 1.0, 0.9).set_trans(Tween.TRANS_SINE)
	return dot


class PresenceDot:
	extends Control
	var ink := Color.WHITE

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		draw_circle(size * 0.5, minf(size.x, size.y) * 0.5, ink)


## Le doigt vient de faire defiler la liste : le relacher sur un bouton n'est
## pas un clic.
func _just_scrolled() -> bool:
	return Time.get_ticks_msec() - _scrolled_at < 200
