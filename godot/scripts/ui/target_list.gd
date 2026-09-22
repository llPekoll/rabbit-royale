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
const RAID_W := 84.0
const RAID_H := 44.0

var _scroll: ScrollContainer
var _rows: VBoxContainer
var _foot: Label
var _tick: Timer
var _elapsed_ms := 0.0
## Le raid qui etait la a l'ouverture (jamais, dans le jeu : page.tsx ne
## montre la liste que `!shownRaid`) — la liste se ferme sur un raid qui
## COMMENCE, pas sur celui qu'un banc a pose avant elle.
var _raid_at_open := ""


func _init() -> void:
	super(I18N.t("raid.whose"), 440, 0)


func _ready() -> void:
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0, 180)
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	set_body(_scroll)
	_rows = Kit.vbox(Kit.PAD_TIGHT)
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_rows)

	_foot = Kit.note("", Palette.BARK, 12)
	_foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_footer(_foot)

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

	if state.targets.is_empty():
		_rows.add_child(Kit.note(I18N.t("raid.nobodyYet"), Palette.INK, 13))
	else:
		for target in state.targets:
			if target is Dictionary:
				_rows.add_child(_row(target, state))

	if not state.note.is_empty():
		_foot.text = state.note
		_foot.add_theme_color_override("font_color", Palette.BAD_ON_PARCHMENT)
	else:
		_foot.text = "%s\n%s" % [I18N.t("raid.brief"),
			I18N.f("raid.cost", [Tuning.i("RAID_RUN.TOLL"), Tuning.i("RAID_RUN.STAKE")])]
		_foot.add_theme_color_override("font_color", Palette.BARK)


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

	var panel := Kit.panel(Kit.style_well())
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
	var outside := int(target.get("garden", target.get("stock", 0)))
	amount.add_child(Kit.label(I18N.f("raid.unguarded", [I18N.group_digits(outside)]), 11, Palette.LAMP, true))
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
	var button := Kit.button(I18N.shout(words), "wood" if off else "danger", RAID_W, RAID_H)
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.disabled = off
	if off:
		button.modulate.a = 0.75
	var id := String(target.get("id", ""))
	button.pressed.connect(func() -> void: state.enter(id))
	line.add_child(button)
	return panel


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
