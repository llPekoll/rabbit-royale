class_name RunHud
extends Control
## LE HUD DE L'ILE — la barre fine au-dessus du plateau, et ce qui parle
## pendant la run.
##
## Porte de src/components/run-hud.tsx, energy-bar.tsx, watcher-strip.tsx,
## energy-coach.tsx, run-cost-note.tsx, first-run-caption.tsx et
## shove-toast.tsx, sur l'etat de run_state.gd. Il embarque le bouton MARK A
## BOMB (mark_bomb_button.tscn) et le ciel de l'eruption
## (eruption_overlay.tscn), et ouvre le recap (run_recap.tscn) par
## `Chrome.current.open` quand il tombe : monter CETTE scene, c'est monter
## tout le chrome de l'ile. Il ne se montre que sur l'ile
## (`Screens.place == ISLAND`).
##
## Ce que le web a decide, et qu'on garde :
##
##   • LE HUD PARLE DE CELUI A QUI EST LA RUN, qui n'est pas toujours celui
##     qui lit. Un spectateur n'a pas de lapin sur l'ile : le HUD montre les
##     chiffres du lapin REGARDE et dit a qui ils sont — en mots, pas par une
##     icone d'oeil, parce qu'un spectateur qui oublie qu'il regarde lit
##     chaque nombre comme le sien.
##   • L'ENERGIE EST LA LECTURE : jaune batterie tant que ca va, ambre quand
##     deux bombes finiraient la run, rouge — et battant — quand la prochaine
##     le fait. Le cran est une bombe, pour que la zone de danger se voie
##     avant qu'on y entre. UNE VRAIE PERTE EST UN EVENEMENT : la barre
##     clignote rouge et les bords de l'ecran rougissent (Paul, 2026-09-17) —
##     « vraie » = un X faux ou pire, pas un pas.
##   • LE SILLAGE : la ou la barre ETAIT, tenu un instant derriere la ou elle
##     est. Un remplissage seul bouge trop vite pour etre vu ; c'est le
##     MOUVEMENT qu'on dessine.
##   • LES PLAQUES N'EXISTENT QUE QUAND ELLES ONT QUELQUE CHOSE A DIRE
##     (Paul, 2026-09-20 : « ya un container vide qui traine au milieu ... faut
##     le virer ») : la maree et « whose run », et l'eclair et la bombe — ces
##     deux-la seulement en regardant, puisque c'est le spectateur qui sabote.
##   • QUI REGARDE est un NIVEAU DE MENACE, pas un compteur de vanite : un
##     rival qui regarde choisit une case pour un eclair. Il vit AU-DESSUS DE
##     MARK A BOMB, dont il est la raison, et le zero est imprime : une ligne
##     qui n'apparait qu'a l'arrivee de quelqu'un fait sursauter et deplace
##     le bouton sous elle.
##   • LES LEGENDES fondent a l'horloge, sauf la premiere du tutoriel qui
##     tient jusqu'au premier pas ; une bande qui se remplit de tout ce que
##     l'ile a dit n'est plus lue.

signal open_shop
signal go_home

## Sur le banc : visible quel que soit le lieu.
@export var always := false

## La jauge (globals.css `--rr-gauge-px`) : 51 pixels source rendus a 0,55 —
## une fraction, mais pas au hasard : c'est ce qui ramene la barre a la
## hauteur qu'elle a toujours eue (~28px) dans une bande dessinee pour un
## telephone.
const GAUGE_PX := 0.55
const GAUGE_W := 180.0
## L'encre du chiffre (`.rr-energy-value`) et son lisere.
const ENERGY_INK := Color("#fff3a6")
const ENERGY_RIM := Color("#1d1608")
## Les couleurs du web hors Palette (globals.css) — `--crown`, `--danger`,
## `.rr-watchers`, `.rr-watchers.hit`, `.rr-shove-toast`.
const CROWN := Color("#ffd45c")
const DANGER_INK := Color("#ff6b6b")
const WATCH_DIM := Color("#9aa6b2")
const WATCH_HIT := Color("#ff5a4a")
const SHOVE_INK := Color("#ff6b5e")
## Combien de temps chaque ligne reste.
const LOW_MS := 5000
const COST_MS := 6000
const SHOVE_MS := 2600
const HIT_MS := 4000
## Le rougissement des bords (`.rr-hurt`) : 560 ms, 90px de degrade.
const HURT_SECONDS := 0.56
const HURT_DEPTH := 90.0
const HURT_INK := Color(230.0 / 255.0, 33.0 / 255.0, 50.0 / 255.0, 0.55)

## Une legende ne touche pas les bords, et au bureau ne court pas sur tout
## l'ecran : au-dela de 420 px, une phrase se lit mal d'un coup d'oeil.
const CAPTION_MARGIN := 24.0
const CAPTION_MAX_W := 420.0

const RECAP_SCENE := preload("res://scenes/ui/run_recap.tscn")

@onready var mark_button: MarkBombButton = %MarkButton
@onready var eruption: EruptionOverlay = %Eruption

var _strip: VBoxContainer
var _energy_row: HBoxContainer
var _gauge: Gauge
var _value: Label
var _plates: HBoxContainer
var _arm_plate: PanelContainer
var _strike: Button
var _plant: Button
var _aim: Label
var _info_plate: PanelContainer
var _warn: Label
var _watch: Label
var _captions: VBoxContainer
## Les quatre lignes : tutoriel, cout, coach, poussee — dans cet ordre.
var _slots: Array[PanelContainer] = []
var _slot_timers: Array[Timer] = []
var _watchers: Label
var _hit_timer: Timer
var _hurt: HurtFlash
var _card: RunRecap = null
var _prev_energy := -1
var _prev_subject := ""


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	var state := RunState.current
	state.me_changed.connect(_on_me)
	state.rabbits_changed.connect(_on_me)
	state.island_changed.connect(func(_snap: Dictionary) -> void: _on_island())
	state.volcano_changed.connect(_refresh_plates)
	state.caption_changed.connect(func(_id: String) -> void: _refresh_caption())
	state.bank_changed.connect(_on_bank)
	state.shoved_changed.connect(_on_shoved)
	state.watchers_changed.connect(func(_n: int) -> void: _refresh_watchers())
	state.hit_changed.connect(_on_hit)
	state.aiming_changed.connect(func(_m: String) -> void: _refresh_plates())
	state.bag_changed.connect(_refresh_plates)
	state.recap_changed.connect(_on_recap)
	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	Screens.changed.connect(_refresh_visible)
	get_viewport().size_changed.connect(_measure)
	_refresh_visible()
	_measure()
	_on_me()
	_relabel()


func _build() -> void:
	# LA BANDE, centree sous la barre du haut, derriere le bouton et
	# l'eruption que la scene porte deja.
	_strip = Kit.vbox(Kit.PAD_TIGHT)
	_strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_strip.alignment = BoxContainer.ALIGNMENT_BEGIN
	_strip.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_strip.grow_horizontal = Control.GROW_DIRECTION_BOTH
	add_child(_strip)
	move_child(_strip, 0)

	_energy_row = Kit.hbox(Kit.PAD_TIGHT)
	_energy_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_energy_row.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_strip.add_child(_energy_row)
	_energy_row.add_child(Kit.icon(Kit.ICONS["bolt"], 25.0))
	_gauge = Gauge.new()
	_gauge.custom_minimum_size = Vector2(GAUGE_W, 51.0 * GAUGE_PX)
	_gauge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_energy_row.add_child(_gauge)
	_value = Kit.label("", 18, ENERGY_INK)
	_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_value.custom_minimum_size = Vector2(40.0, 0.0)
	_value.add_theme_color_override("font_outline_color", ENERGY_RIM)
	_value.add_theme_constant_override("outline_size", 2)
	_energy_row.add_child(_value)

	_plates = Kit.hbox(Kit.PAD)
	_plates.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_plates.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_strip.add_child(_plates)
	_arm_plate = Kit.panel(Kit.style_glass())
	var arm_row := Kit.hbox(Kit.PAD_TIGHT)
	_arm_plate.add_child(arm_row)
	_strike = _arm_button(Kit.ICONS["bolt"], "strike")
	_plant = _arm_button(Kit.ICONS["bomb"], "plant")
	arm_row.add_child(_strike)
	arm_row.add_child(_plant)
	_aim = Kit.label("", 13, CROWN)
	arm_row.add_child(_aim)
	_plates.add_child(_arm_plate)
	_info_plate = Kit.panel(Kit.style_glass())
	_info_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var info_row := Kit.hbox(Kit.PAD)
	_info_plate.add_child(info_row)
	_warn = Kit.label("", 14, DANGER_INK)
	info_row.add_child(_warn)
	_watch = Kit.label("", 12, CROWN)
	info_row.add_child(_watch)
	_plates.add_child(_info_plate)

	_captions = Kit.vbox(Kit.PAD_TIGHT)
	_captions.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_strip.add_child(_captions)
	for i in 4:
		var slot := Kit.caption("")
		slot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		slot.visible = false
		_captions.add_child(slot)
		_slots.append(slot)
		var t := Timer.new()
		t.one_shot = true
		t.timeout.connect(func() -> void: slot.visible = false)
		add_child(t)
		_slot_timers.append(t)

	# QUI REGARDE, au-dessus du bouton, aligne a droite.
	_watchers = Kit.label("", 12, WATCH_DIM)
	_watchers.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_watchers.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_watchers.add_theme_color_override("font_outline_color", Palette.NIGHT)
	_watchers.add_theme_constant_override("outline_size", 2)
	_watchers.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_watchers.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_watchers.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_watchers)
	move_child(_watchers, 1)
	_hit_timer = Timer.new()
	_hit_timer.one_shot = true
	_hit_timer.timeout.connect(_refresh_watchers)
	add_child(_hit_timer)

	# Le rougissement des bords, au-dessus de la bande, sous l'eruption.
	_hurt = HurtFlash.new()
	Kit.fill(_hurt)
	add_child(_hurt)
	move_child(_hurt, eruption.get_index())


## UN OBJET ARMABLE : le compte, et s'il est celui qui est arme. Arme, il se
## lit comme un MODE — le prochain tap frappe ou enterre au lieu de creuser —
## d'ou une couleur et pas un simple enfoncement. Montre meme a zero, pour que
## le joueur apprenne que l'objet existe sur l'ecran ou il sert.
func _arm_button(icon: Texture2D, mode: String) -> Button:
	var b := Button.new()
	b.icon = icon
	b.add_theme_constant_override("icon_max_width", 16)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(func() -> void: RunState.current.set_aiming(mode))
	return b


func _style_arm(b: Button, held: int, armed: bool) -> void:
	b.text = str(held)
	b.disabled = held <= 0
	var s := StyleBoxFlat.new()
	s.bg_color = Color(CROWN, 0.18) if armed else Color(0, 0, 0, 0)
	s.set_border_width_all(1)
	s.border_color = CROWN if armed else Color(1, 1, 1, 0.25)
	s.set_corner_radius_all(4)
	s.content_margin_left = 6
	s.content_margin_right = 6
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, s)
	var ink := CROWN if armed else (Palette.CAPTION_INK if held > 0 else Palette.MUTED_ON_NIGHT)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_disabled_color"]:
		b.add_theme_color_override(key, ink)


## LA MISE EN PAGE : la bande a Kit.PAD_TIGHT sous la barre du haut (comme les
## pastilles du chrome), la ligne des spectateurs a 6px au-dessus de MARK A
## BOMB — le compte est l'avertissement, le bouton dessous la reponse.
func _measure() -> void:
	var view := get_viewport_rect().size
	_strip.offset_top = Kit.TOPBAR_H + Kit.PAD_TIGHT
	var w := minf(560.0, view.x - 2.0 * Kit.EDGE)
	_strip.offset_left = -w * 0.5
	_strip.offset_right = w * 0.5
	var mark_h := MarkBombButton.height_for(view.y)
	var watch_w := minf(280.0, view.x * 0.46)
	_watchers.offset_right = -Kit.EDGE
	_watchers.offset_left = -Kit.EDGE - watch_w
	_watchers.offset_bottom = -(Kit.EDGE + mark_h + 6.0)
	_watchers.offset_top = _watchers.offset_bottom


func _refresh_visible() -> void:
	visible = always or (Screens.in_world() and Screens.place == Screens.Place.ISLAND)


func _relabel() -> void:
	_refresh_plates()
	_refresh_caption()
	_refresh_watchers()
	_on_me()


# ── L'energie ────────────────────────────────────────────────────────────────

func _on_me() -> void:
	var state := RunState.current
	var subject := state.subject()
	# LA BARRE N'EST PLUS ICI : l'energie de la manche est sur le cadran de la
	# pastille, le meme qu'au terrier (carrot_pill `set_run_energy`, et le
	# web : « THE ENERGY BAR IS NOT HERE ANY MORE »). La rangee reste, cachee,
	# pour la perte qu'elle mesure — le rougissement des bords et la ligne
	# « low energy » en dependent.
	_energy_row.visible = false
	if subject.is_empty():
		_prev_energy = -1
		return
	var energy := int(subject.get("energy", 0))
	var who := String(subject.get("playerId", ""))
	var same := who == _prev_subject and _prev_energy >= 0
	_prev_subject = who
	_gauge.set_energy(energy, same)
	_value.text = str(energy)
	_value.tooltip_text = I18N.f("run.energy", [energy, Tuning.i("ENERGY.MAX")])
	if same:
		# Une VRAIE perte : un X faux ou pire. Un pas coute un point et arrive
		# a chaque pas — une alarme sur chacun est une alarme que personne
		# n'entend quand la bombe vient.
		var hurt_drop := mini(Tuning.i("FLAG.LOSS"), Tuning.i("ENERGY.BOMB_LOSS"))
		if _prev_energy - energy >= hurt_drop:
			_gauge.hurt()
			_hurt.flash()
		_coach(_prev_energy, energy)
	_prev_energy = energy
	_refresh_plates()


## « LOW ENERGY » — dit une fois, quand il est encore temps d'y faire quelque
## chose (energy-coach.tsx). Le moment qui compte n'est pas la fin mais
## l'approche : sous une bombe de marge, une ligne nomme la pompe ; sous le
## plancher d'un raid, le choix « creuser ou rentrer raider » devient reel.
## Rien sur la premiere ile : ses legendes tiennent la bande.
func _coach(was: int, now: int) -> void:
	if RunState.current.first_run:
		return
	var bomb := Tuning.i("ENERGY.BOMB_LOSS")
	var raid := Tuning.raid_floor()
	if was > bomb and now <= bomb and now > 0:
		_say(2, I18N.t("run.energyLow"), Palette.CAPTION_INK, LOW_MS)
	elif was > raid and now <= raid and now > bomb:
		_say(2, I18N.t("run.energyRaidLeft"), Palette.CAPTION_INK, LOW_MS)


# ── Les plaques ──────────────────────────────────────────────────────────────

func _refresh_plates() -> void:
	var state := RunState.current
	var watching := not state.spectating.is_empty()
	# Le sabotage se fait en regardant : l'eclair et la bombe ne sont offerts
	# qu'au spectateur, et jamais sur la premiere ile (page.tsx).
	_arm_plate.visible = watching and not state.first_run
	if _arm_plate.visible:
		_style_arm(_strike, int(state.bag.get("lightning", 0)), state.aiming == "strike")
		_style_arm(_plant, int(state.bag.get("bombs", 0)), state.aiming == "plant")
		_strike.tooltip_text = I18N.t("run.strike")
		_plant.tooltip_text = I18N.t("run.plant")
		_aim.visible = not state.aiming.is_empty()
		_aim.text = I18N.t("run.aiming" if state.aiming == "strike" else "run.aimingPlant")
	_info_plate.visible = state.warn_stage > 0 or watching
	_warn.visible = state.warn_stage > 0
	_warn.text = "🌊 " + "!".repeat(state.warn_stage)
	_watch.visible = watching
	if watching:
		# La cible n'est peut-etre pas encore sur le plateau, ou vient de
		# finir : son nom reste l'etiquette honnete dans les deux cas.
		var name := state.name_of(state.spectating)
		_watch.text = I18N.f("run.watching", [name if not name.is_empty() else I18N.t("run.theirRun")])


# ── Les legendes ─────────────────────────────────────────────────────────────

func _say(slot: int, text: String, ink: Color, ms: int) -> void:
	var panel := _slots[slot]
	var label := panel.get_child(0) as Label
	label.text = text
	label.add_theme_color_override("font_color", ink)
	# UNE LARGEUR, SINON UNE LETTRE PAR LIGNE : un label qui revient a la ligne
	# n'a pour minimum que son plus large caractere, et le panneau centre le
	# prend au mot — la phrase tombait en colonne. La phrase entiere si elle
	# tient, sinon ce que l'ecran laisse, et la elle revient a la ligne.
	var font := label.get_theme_font("font")
	var px := label.get_theme_font_size("font_size")
	var wide := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x + 2.0
	var room := maxf(160.0, get_viewport_rect().size.x - 2.0 * CAPTION_MARGIN)
	label.custom_minimum_size.x = minf(wide, minf(room, CAPTION_MAX_W))
	panel.visible = not text.is_empty()
	_slot_timers[slot].stop()
	if ms > 0 and panel.visible and is_inside_tree():
		_slot_timers[slot].start(ms / 1000.0)


## La legende du premier voyage : l'ID est tenu par RunState, les mots sont
## relus ici, pour que la ligne suive la langue au moment ou on la lit.
func _refresh_caption() -> void:
	var id := RunState.current.caption()
	_say(0, I18N.t("firstRun." + id) if not id.is_empty() else "", Palette.CAPTION_INK, 0)


## CE QUE LA RUN A COUTE — dit une fois, a l'arrivee (run-cost-note.tsx). La
## traversee prend ENERGY.CROSSING_COST a la barre du terrier pendant que le
## joueur regarde ailleurs ; pas une jauge, un EVENEMENT qui s'efface. Sur
## le web la phrase est en dur ; ici c'est `recap.bank`, la meme lecture,
## traduite, que le recap redit au moment de decider.
func _on_bank(bank: Dictionary) -> void:
	if bank.is_empty() or RunState.current.seed.is_empty():
		_say(1, "", Palette.RANK_GOLD, 0)
		return
	_say(1, I18N.f("recap.bank", [int(bank.get("energy", 0)), int(bank.get("max", 0)), int(bank.get("cost", 0))]),
		Palette.RANK_GOLD, COST_MS)


## QUI VIENT DE VOUS POUSSER, pendant qu'il est encore la (shove-toast.tsx).
## Seulement une poussee SURVECUE : la fatale est l'affaire du recap.
func _on_shoved(note: Dictionary) -> void:
	if note.is_empty() or bool(note.get("fatal", false)):
		_say(3, "", SHOVE_INK, 0)
		return
	var who := String(note.get("byName", ""))
	_say(3, I18N.f("shove.by", [who]) if not who.is_empty() else I18N.t("shove.anon"), SHOVE_INK, SHOVE_MS)


func _on_island() -> void:
	_prev_energy = -1
	for i in 4:
		_say(i, "", Palette.CAPTION_INK, 0)
	_hit_timer.stop()
	_relabel()


# ── Qui regarde ──────────────────────────────────────────────────────────────

func _on_hit(_hit: Dictionary) -> void:
	_refresh_watchers()


func _refresh_watchers() -> void:
	var state := RunState.current
	var hit := state.hit
	var fresh := not hit.is_empty() and Time.get_ticks_msec() - int(hit.get("at", 0)) < HIT_MS
	if fresh:
		var who := state.name_of(String(hit.get("by", "")))
		if who.is_empty():
			who = I18N.t("raid.aRival")
		_watchers.text = I18N.shout(I18N.f("run.hitBolt" if String(hit.get("kind", "")) == "bolt" else "run.hitBomb", [who]))
		_watchers.add_theme_color_override("font_color", WATCH_HIT)
		if is_inside_tree():
			_hit_timer.start((HIT_MS - (Time.get_ticks_msec() - int(hit.get("at", 0)))) / 1000.0)
		return
	_watchers.text = I18N.shout(I18N.f("run.watchers", [state.watchers]))
	_watchers.add_theme_color_override("font_color", CROWN if state.watchers > 0 else WATCH_DIM)


# ── Le recap ─────────────────────────────────────────────────────────────────

## Le recap tombe : la carte s'ouvre sur le voile du chrome, sans fermeture
## au clic (elle attend une reponse). Vide : la carte se retire.
func _on_recap(recap: Dictionary) -> void:
	if recap.is_empty():
		if _card != null and is_instance_valid(_card):
			_card.closed.emit()
		_card = null
		return
	if Chrome.current == null:
		return
	var state := RunState.current
	_card = RECAP_SCENE.instantiate() as RunRecap
	_card.show_recap(recap, state.first_run, state.bank, state.record)
	_card.open_shop.connect(func() -> void: open_shop.emit())
	_card.go_home.connect(func() -> void: go_home.emit())
	Chrome.current.open(_card, false)


## LA JAUGE : la coquille en trois morceaux de Tiny Swords (tools/
## gen_energy_bar.py), le remplissage dans son canal, le cran d'une bombe,
## le sillage, et le clignotement.
class Gauge extends Control:
	## Le canal dans la coquille, mesure sur l'art : y=11..34 de 51, x a 11
	## de chaque bout (`--rr-gauge-wall*`).
	const WALL_X := 11.0
	const WALL_TOP := 11.0
	const CAP_W := 24.0
	const SHELL_H := 51.0
	const FILL_H := 24.0
	const CREST_W := 3.0
	## Le glissement (340 ms, en decelerant), le retard du sillage (90 ms),
	## le clignotement (3 coups en 720 ms), le battement critique (0,9 s).
	const SLIDE := 0.34
	const LAG := 0.09
	const HIT := 0.72
	const PULSE := 0.9
	## Les sillages (`.rr-energy-wake`), par ton et par sens.
	const WAKE := {
		"carrot": [Color("#6b5a12"), Color("#8a7418")],
		"warn": [Color("#6d3d06"), Color("#8c5209")],
		"danger": [Color("#6b1a14"), Color("#8c241c")],
	}
	const HIT_INK := Color("#ff2d2d")
	const MARK_INK := Color("#0a0814")

	var _from := 0.0
	var _to := 0.0
	var _t0 := -10.0
	var _hit_at := -10.0
	var _clock := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_energy(value: int, animate: bool) -> void:
		var shown := _shown(_clock)
		_from = shown if animate else float(value)
		_to = float(value)
		_t0 = _clock if animate else -10.0
		queue_redraw()

	func hurt() -> void:
		_hit_at = _clock
		queue_redraw()

	func _process(delta: float) -> void:
		_clock += delta
		if _clock - _t0 < SLIDE + LAG or _clock - _hit_at < HIT or _tone() == "danger":
			queue_redraw()

	func _ease(p: float) -> float:
		return 1.0 - pow(1.0 - clampf(p, 0.0, 1.0), 3.0)

	func _shown(t: float) -> float:
		return lerpf(_from, _to, _ease((t - _t0) / SLIDE))

	func _wake(t: float) -> float:
		return lerpf(_from, _to, _ease((t - _t0 - LAG) / SLIDE))

	## Sous une bombe, la prochaine finit la run ; sous deux, elle fait mal.
	func _tone() -> String:
		var bomb := float(Tuning.i("ENERGY.BOMB_LOSS"))
		if _to <= bomb:
			return "danger"
		return "warn" if _to <= bomb * 2.0 else "carrot"

	func _draw() -> void:
		var k := size.y / SHELL_H
		var cap := CAP_W * k
		var w := size.x
		var h := size.y
		draw_texture_rect(Kit.GAUGE_SHELL_BASE, Rect2(0.0, 0.0, cap, h), false)
		draw_texture_rect(Kit.GAUGE_SHELL_MID, Rect2(cap, 0.0, w - 2.0 * cap, h), false)
		draw_texture_rect(Kit.GAUGE_SHELL_CAP, Rect2(w - cap, 0.0, cap, h), false)

		var scale_max := maxf(1.0, float(Tuning.i("ENERGY.MAX")))
		var cx := WALL_X * k
		var cy := WALL_TOP * k
		var cw := w - 2.0 * WALL_X * k
		var ch := FILL_H * k
		var pct := clampf(_shown(_clock) / scale_max, 0.0, 1.0)
		var wake_pct := clampf(_wake(_clock) / scale_max, 0.0, 1.0)
		var tone := _tone()

		# Le sillage, derriere, et seulement tant que les deux ne sont pas
		# d'accord : braise sombre en descendant, lave pale en montant.
		if absf(wake_pct - pct) > 0.0005:
			var wake: Color = WAKE[tone][0] if wake_pct > pct else WAKE[tone][1]
			draw_rect(Rect2(cx, cy, maxf(pct, wake_pct) * cw, ch), wake)

		# Le remplissage : le milieu etire, puis la crete claire en tete. Vide,
		# rien n'est dessine — a zero la crete montrerait encore une lame.
		var fw := pct * cw
		if fw > 0.5:
			var crest := minf(CREST_W * k, fw)
			var fill: Array = Kit.GAUGE_FILL[tone]
			var tint := Color.WHITE
			if tone == "danger" and fmod(_clock, PULSE) >= PULSE * 0.5:
				tint.a = 0.35
			if fw - crest > 0.0:
				draw_texture_rect(fill[0], Rect2(cx, cy, fw - crest, ch), false, tint)
			draw_texture_rect(fill[1], Rect2(cx + fw - crest, cy, crest, ch), false, tint)

		# La ligne de mort : une bombe, PAR-DESSUS le remplissage, pour qu'une
		# barre pleine ne cache pas la chose que le joueur doit le plus voir.
		var mark_x := cx + (float(Tuning.i("ENERGY.BOMB_LOSS")) / scale_max) * cw
		draw_rect(Rect2(mark_x, cy, 2.0, ch), MARK_INK)
		draw_rect(Rect2(mark_x + 2.0, cy, 2.0, ch), Color(1, 1, 1, 0.55))

		# Le coup : un voile rouge sur TOUT le canal, plein ou vide, par pas
		# — trois coups durs, jamais un fondu.
		var since := _clock - _hit_at
		if since < HIT:
			var phase := fmod(since / HIT * 3.0, 1.0)
			if phase < 0.5:
				draw_rect(Rect2(cx, cy, cw, ch), Color(HIT_INK, 0.9))


## LES BORDS DE L'ECRAN ROUGISSENT au coup, et lachent (`.rr-hurt`).
class HurtFlash extends Control:
	var _at := -10.0
	var _clock := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func flash() -> void:
		_at = _clock
		queue_redraw()

	func _process(delta: float) -> void:
		_clock += delta
		if _clock - _at < RunHud.HURT_SECONDS:
			queue_redraw()

	func _draw() -> void:
		var p := (_clock - _at) / RunHud.HURT_SECONDS
		if p < 0.0 or p >= 1.0:
			return
		var ink := Color(RunHud.HURT_INK, RunHud.HURT_INK.a * (1.0 - p) * (1.0 - p))
		var clear := Color(ink, 0.0)
		var d := RunHud.HURT_DEPTH
		var w := size.x
		var h := size.y
		# Quatre bandes, chacune un degrade du bord vers rien.
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, d), Vector2(0, d)]),
			PackedColorArray([ink, ink, clear, clear]))
		draw_polygon(PackedVector2Array([Vector2(0, h - d), Vector2(w, h - d), Vector2(w, h), Vector2(0, h)]),
			PackedColorArray([clear, clear, ink, ink]))
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(d, 0), Vector2(d, h), Vector2(0, h)]),
			PackedColorArray([ink, clear, clear, ink]))
		draw_polygon(PackedVector2Array([Vector2(w - d, 0), Vector2(w, 0), Vector2(w, h), Vector2(w - d, h)]),
			PackedColorArray([clear, ink, ink, clear]))
