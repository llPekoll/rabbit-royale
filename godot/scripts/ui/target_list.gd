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
## Ce que Chrome._center_dialog laisse autour d'un dialogue : 17 en haut (le
## [x] qui deborde), Kit.EDGE en bas.
const DIALOG_AIR := 27.0

var _scroll: ScrollContainer
var _rows: VBoxContainer
var _foot: Label
var _foot_inset: MarginContainer
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


func _init() -> void:
	# `min(720px, 100%)`, la meme largeur que la liste des iles.
	super(I18N.t("raid.whose"), 720, 0)


func _ready() -> void:
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0, 180)  # jusqu'a `_fit_scroll`
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	set_body(_scroll)
	_rows = Kit.vbox(Kit.PAD_TIGHT)
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_rows)

	# LE PIED S'ARRETE OU LES LIGNES S'ARRETENT. Quand la liste defile, sa
	# barre prend une bande a droite des lignes ; le pied, lui, allait
	# jusqu'au bord et depassait les planches de toute la barre. Il recule
	# d'autant, mesure sur les lignes elles-memes.
	var foot := Kit.plank_note("", 12)
	_foot = foot.get_child(0) as Label
	_foot_inset = Kit.margin(0, 0, 0, 0)
	_foot_inset.add_child(foot)
	add_footer(_foot_inset)
	_rows.resized.connect(func() -> void:
		_foot_inset.add_theme_constant_override("margin_right",
			int(maxf(0.0, _scroll.size.x - _rows.size.x))))
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
	var state := RaidState.current
	# Un raid a commence : la liste n'a plus lieu d'etre (page.tsx ne la
	# montre que `!shownRaid`).
	if state.has_raid() and String(state.raid.get("raidId", "")) != _raid_at_open:
		closed.emit()
		return

	for old in _rows.get_children():
		_rows.remove_child(old)
		old.queue_free()

	_button_w = _button_width()
	if state.targets.is_empty():
		_rows.add_child(Kit.note(I18N.t("raid.nobodyYet"), Palette.INK, 13))
	else:
		for target in state.targets:
			if target is Dictionary:
				_rows.add_child(_row(target, state))

	if not state.note.is_empty():
		_foot.text = state.note
		_foot.add_theme_color_override("font_color", Color("#ffb3a3"))
	else:
		_foot.text = "%s\n%s" % [I18N.t("raid.brief"),
			I18N.f("raid.cost", [Tuning.i("RAID_RUN.TOLL"), Tuning.i("RAID_RUN.STAKE")])]
		_foot.add_theme_color_override("font_color", Palette.CREAM)
	_queue_fit()


## UNE LIGNE : le nom et la presence dessous, ce qui pousse dehors, la
## planche. Un creux du kit (`wl-runtime-well`) sur le parchemin, la ou le
## web posait une planche en relief sur la terre.
func _row(target: Dictionary, state: RaidState) -> Control:
	# Ce qui reste de leur bouclier maintenant. Une cible sans `shieldedFor`
	# (un vieux serveur) garde le drapeau qu'on lui a envoye, et ne montre
	# pas d'heure.
	var left := -1.0
	if target.has("shieldedFor"):
		left = maxf(0.0, float(target["shieldedFor"]) - _elapsed_ms)
	var shielded := bool(target.get("shielded", false)) if left < 0.0 else left > 0.0
	var off := state.busy or shielded

	# Une planche a feuilles (`.rr-raid-row`, PxPanel PLANK), comme le web.
	# Plus d'air en bas qu'en haut : la face du bois s'arrete a 85 % de la
	# planche (la levre sombre et l'ombre dessous), et la ligne de presence
	# s'y posait dessus.
	var panel := PanelContainer.new()
	var plank := Kit.style_plank()
	plank.content_margin_top = 6.0
	plank.content_margin_bottom = 9.0
	panel.add_theme_stylebox_override("panel", plank)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if shielded:
		panel.modulate.a = SHIELDED_DIM
	var line := Kit.hbox(Kit.PAD)
	line.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(line)

	# Le nom, et OU SE TIENT LE PROPRIETAIRE dessous. La liste classait par
	# reserve, ce qui repond a « combien » et non a « quel raid est-ce » —
	# et ce sont trois raids differents.
	var who := Kit.vbox(2)
	who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	who.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var name := Kit.label(String(target.get("name", "")), 13, Palette.CREAM, true)
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	who.add_child(name)
	var where := state.presence_of(target)
	var ink: Color = WHERE_INK.get(where, WHERE_INK["away"])
	var where_line := Kit.hbox(5)
	where_line.add_child(_dot(ink, where == RaidState.DIGGING))
	where_line.add_child(Kit.label(I18N.t("raid.presence." + where), 11, ink))
	who.add_child(where_line)
	line.add_child(who)

	# CE QUI POUSSE DEHORS : le jardin, la bourse d'un raid — c'est ce qu'un
	# raid prend en premier. La reserve, si le serveur est trop vieux pour
	# le dire.
	var purse := Kit.vbox(2)
	purse.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var amount := Kit.hbox(4)
	amount.alignment = BoxContainer.ALIGNMENT_END
	amount.add_child(Kit.icon(Kit.ICONS["carrot"], 16))
	# LA RESERVE, comme la rangee du web (`groupDigits(t.stock)` 🥕) : le
	# « UNGUARDED » est le sous-titre de la dalle RAID, pas de la ligne.
	amount.add_child(Kit.label(I18N.group_digits(int(target.get("stock", 0))), 12, Palette.CREAM, true))
	amount.move_child(amount.get_child(0), 1)
	purse.add_child(amount)
	if shielded and left > 0.0:
		# L'attente en lumiere de lampe, la meme encre chaude que le reste de
		# ce monde donne a un DELAI — et pas sur la planche : celle-ci ne sait
		# pas empiler deux lignes.
		var wait := Kit.label(I18N.short_wait(left), 11, Palette.LAMP)
		wait.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		purse.add_child(wait)
	line.add_child(purse)

	var words := I18N.t("raid.shielded") if shielded else I18N.t("raid.raidIt")
	# « Raid » dans sa casse, sur le bois du web (DANGER que la peau des bois
	# dessine en planche) : en capitales sur l'or rouge, « RAID » sortait
	# « Al », rogne par les feuilles.
	var button := Kit.button(words, "wood", _button_w, RAID_H)
	button.label_size = 12
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.disabled = off
	if off:
		button.modulate.a = 0.75
	var id := String(target.get("id", ""))
	button.pressed.connect(func() -> void: state.enter(id))
	line.add_child(button)
	return panel


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
		var pitch := first.get_combined_minimum_size().y + Kit.PAD_TIGHT
		h = maxf(pitch - Kit.PAD_TIGHT, floorf((room + Kit.PAD_TIGHT) / pitch) * pitch - Kit.PAD_TIGHT)
	# Au pixel pres : un demi-pixel de va-et-vient (la barre qui parait et
	# disparait) ne doit pas relancer la mesure.
	h = floorf(h)
	if absf(_scroll.custom_minimum_size.y - h) >= 1.0:
		_scroll.custom_minimum_size.y = h


## LA MEME LARGEUR POUR TOUTES LES PLANCHES de la colonne, celle qui tient
## le plus long des deux mots a sa taille pleine. Une largeur fixe de 104
## faisait tenir « Raid » et retrecir « Com escudo » a 9 px ; une largeur au
## mot aurait decale la colonne des chiffres d'une ligne a l'autre.
func _button_width() -> float:
	var font := get_theme_font("font", "Label")
	var widest := 0.0
	for key in ["raid.raidIt", "raid.shielded"]:
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
