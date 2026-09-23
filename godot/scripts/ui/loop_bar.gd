class_name LoopBar
extends Control
## LE SOL DU TERRIER — DIG ▸ DEFEND ▸ RAID, trois planches en bas au centre.
##
## Porte de src/components/loop-bar.tsx, de `.rr-loop-bar` (globals.css) et
## des planches peintes de px-top-floor.css, en gardant ce que ces fichiers
## ont decide :
##
##   • TROIS VERBES DANS L'ORDRE DE LA BOUCLE, les fleches dessinees entre
##     eux, et PAS de fleche de retour apres RAID : dans le coin bas-droit
##     d'un telephone elle se lisait comme un bouton RECHARGER et se faisait
##     taper comme tel (Paul, 2026-09-21).
##   • CHAQUE PLANCHE PORTE SON ETAT sur sa seconde ligne — la raison de la
##     presser. DIG dit ce que coute la traversee (ou, a sec, ou en est le
##     reservoir et dans combien de temps) ; DEFEND ce qui est dans le
##     jardin, si le bouclier tient, combien de pieges ; RAID combien de
##     terriers sont ouverts.
##   • UNE PLANCHE PAR MATIERE : DIG sur la planche de bois, DEFEND sur le
##     parchemin au bouclier (scroll-plank), RAID sur la planche au crane
##     (skull-plank). Les coupes et les retraits du texte sont ceux que
##     px-top-floor.css a MESURES sur l'art — le bouclier finit a 0,82 de la
##     hauteur, le crane a 0,817, donc un seul retrait gauche pour les deux.
##   • LA LIGNE D'ETAT NE FAIT QU'UNE RANGEE, ET ELLE VOYAGE quand elle ne
##     tient pas. Deux rangees coutaient a chaque planche une rangee de
##     hauteur sur un ecran de 400 (« on economise de la place sur mobile car
##     on en a cruellement besoin », Paul, 2026-09-16). Une ligne qui tient
##     ne bouge pas : du texte qui glisse sans raison se lit moins bien que
##     du texte immobile.
##   • LE RESERVOIR N'EST PAS LU DEUX FOIS. La pastille du haut porte deja la
##     jauge ; DIG ne redit le chiffre que quand il est la raison d'attendre.
##   • LA RECOLTE RAMENEE se pose SUR DIG : les carottes viennent de la, et
##     c'est la prochaine planche qu'on presse.
##
## Les compteurs qui ne viennent pas du terrier (pieges poses, cibles
## ouvertes, bombes dans le sac) sont POSES par la boutique et le raid via
## `set_defence`, `set_targets`, `set_bombs` : ce panneau ne va pas chercher
## /api/shop lui-meme, la rangee du kit le fait (kit_state.gd).

## Le joueur a presse une planche. Le chrome sait ou elle mene.
signal dig_pressed
signal defend_pressed
signal raid_pressed

## `.rr-loop-bar` : `gap: 8px`, `width: min(94vw, 1040px)`.
const GAP := 8.0
const BAR_VW := 0.94
const BAR_MAX_W := 1040.0
## `--rr-loop-h: clamp(52px, 10.4svh, 80px)`. LE PLANCHER EST 52 : a 48 le
## parchemin et la planche au crane laissaient le verbe sur le bord haut du
## papier, sans air (la photo Safari de Paul, 2026-09-21).
const SLAB_MIN := 52.0
const SLAB_MAX := 80.0
const SLAB_VH := 0.104
## Sous 520 de haut, le parchemin est une boite plus serree qu'une planche
## plate : le verbe descend d'une taille pour tenir DANS le papier.
const SHORT_SCREEN := 520.0
## Le verbe : clamp(13px, 2.2svh, 18px) ; la ligne : clamp(9px, 1.5svh, 11px).
const VERB_MIN := 13
const VERB_MAX := 18
const VERB_VH := 0.022
const VERB_SHORT := 12
const LINE_MIN := 9
const LINE_MAX := 11
const LINE_VH := 0.015
## L'attente compte a rebours ici plutot que figee au dernier mot du
## serveur : un tick toutes les 15 s suffit pour une ligne a la minute, et
## une minuterie tombe pile sur l'instant pour relire le terrier.
const TICK_SECONDS := 15.0
const LAND_SLACK := 0.25
## `BROUGHT_HOME_MS = 4000` (page.tsx).
const HAUL_SECONDS := 4.0
## `.rr-loop-away` : 320 ms, cubic-bezier(0.4, 0, 0.2, 1), 160 % vers le bas.
const AWAY_SECONDS := 0.32
const AWAY_TRAVEL := 1.6
## `--rr-press-y: 2px` : une pression enfonce le contenu de deux pixels.
const PRESS_Y := 2.0
## `.rr-tab-pop` : la planche qui devient pressable saute une fois.
const POP_SECONDS := 0.32

## LES ENCRES, celles de px-top-floor.css par planche. Le verbe de DIG etait
## blanc a ombre sombre pour une face orange ; la planche de bois est brune
## et chargee, donc il prend la creme des surfaces sombres, et la ligne un
## cran plus bas. DEFEND s'ecrit a l'encre sur le parchemin (une creme y
## etait illisible), et l'alarme y est assombrie plutot que retiree. RAID
## garde le blanc et l'ombre du bois : ce bois-la est presque noir.
const DIG_VERB := Palette.PILL_INK
const DIG_VERB_SHADOW := Color("#2a180e")
const DIG_LINE := Color("#e8c9a0")
const DEF_VERB := Color("#4a3524")
const DEF_LINE := Color("#6d5238")
const DEF_LINE_SHADOW := Color(0.0, 0.0, 0.0, 0.5)
const DEF_DANGER := Color("#a8301f")
const RAID_VERB := Color.WHITE
const RAID_VERB_SHADOW := Color("#3d0e14")
const RAID_LINE := Color("#f0c9c9")
## L'or de la lampe, depense seulement sur ce qui VAUT d'etre pris.
const RAID_LAMP := Palette.RANK_GOLD
## Les fleches entre les planches : `#f5e6d3`, 18px, ombre 0 2px a 40 %.
const ARROW_INK := Palette.CHALK
const ARROW_SHADOW := Color(0.0, 0.0, 0.0, 0.4)
const ARROW_SIZE := 18.0
## La puce d'un compte qui dure (les terriers ouverts) : la forme de la
## pastille en sombre et creme, PAS en rouge — un « 20 » rouge se lisait
## comme vingt choses non lues.
const CHIP_FACE := Palette.SOIL
const CHIP_INK := Palette.PILL_INK
const CORNER_H := 20.0

## LES TROIS PLANCHES, dans les mesures de px-top-floor.css : les coupes en
## pixels SOURCE de chaque art, les bords a l'ecran en FRACTIONS de la
## hauteur de la planche (l'art est dessine a l'echelle de la planche, donc
## le bouclier garde sa forme a toutes les tailles), et le retrait du texte
## dans la meme unite.
##
##   DIG    plank.webp, 3 tranches. Les bouts sont les feuilles : le texte
##          commence un bout entier plus un peu d'air apres (1,15 bout), comme
##          celui de DEFEND commence apres son bouclier ; le verbe etait sur
##          la feuille de gauche a 0,6 (Paul, 2026-09-21).
##   DEFEND scroll-plank-blue.webp 354x104, coupes 14 47 14 107 : le bouclier
##          et ses feuilles vont jusqu'a x=107, les feuilles de droite font
##          47. Asymetrique parce que le bouclier vit dans le bout gauche.
##   RAID   skull-plank-red.webp 337x104, coupes 14 40 14 100 : le crane
##          finit a x=85, 100 coupe dans du bois propre.
##
## Le retrait droit est PAR PLANCHE : partager le plus large faisait entrer
## la ligne de RAID dans son cadre (« …left 624 outsi »).
const BOARDS := {
	"dig": {
		"slice": Vector4i(Kit.PLANK_CAP, 0, Kit.PLANK_CAP, 0),
		"edge": Vector4(0.667, 0.0, 0.667, 0.0),
		"inset": Vector4(0.667 * 1.15, 0.12, 0.667 * 0.9, 0.12),
	},
	"defend": {
		"slice": Vector4i(107, 14, 47, 14),
		"edge": Vector4(1.029, 0.135, 0.452, 0.135),
		"inset": Vector4(0.9, 0.15, 0.50, 0.15),
	},
	"raid": {
		"slice": Vector4i(100, 14, 40, 14),
		"edge": Vector4(0.962, 0.135, 0.385, 0.135),
		"inset": Vector4(0.9, 0.15, 0.44, 0.15),
	},
}

## Le banc force l'affichage : il n'y a ni monde ni lieu dans un banc.
var bench_mode := false

var _row: HBoxContainer
var _slabs: Dictionary = {}
var _haul: PanelContainer
var _haul_amount: Label
var _haul_words: Label
var _haul_timer: Timer
var _tick: Timer
var _land: Timer

## Ce que le chrome et la boutique posent.
var _traps_placed := 0
var _traps_held := 0
var _open := 0
var _all_shielded := false
var _bombs := 0
var _away := false
var _busy := false

## L'instant (ticks) ou une run vaudra le coup, et ou le bouclier tombe :
## -1 quand il n'y en a pas. Compte depuis le dernier mot du serveur.
var _run_at_ms := -1
var _shield_at_ms := -1
## Une recolte arrivee pendant qu'on n'etait pas au terrier attend qu'on y
## soit : c'est L'ARRIVEE qui la montre, sur DIG.
var _pending_haul := 0

## Ce que chaque planche VALAIT a la derniere lecture, pour ne sauter que
## sur le changement — jamais au montage, seul le changement est une nouvelle.
var _was_can_dig := false
var _was_garden := false
var _was_can_raid := false
var _primed := false
var _pointed := ""


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_BOTTOM_WIDE)

	_row = Kit.hbox(GAP)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_row)
	# La recolte se pose sur DIG une fois que la rangee a place ses planches.
	_row.sort_children.connect(_place_haul)

	_slabs["dig"] = _add_slab("dig", Kit.PLANK, DIG_VERB, DIG_VERB_SHADOW)
	_row.add_child(_arrow())
	_slabs["defend"] = _add_slab("defend", Kit.SCROLL_PLANK_BLUE, DEF_VERB, Color.TRANSPARENT)
	_row.add_child(_arrow())
	_slabs["raid"] = _add_slab("raid", Kit.SKULL_PLANK_RED, RAID_VERB, RAID_VERB_SHADOW)

	_slabs["dig"].pressed.connect(func() -> void: _press("dig", dig_pressed))
	_slabs["defend"].pressed.connect(func() -> void: _press("defend", defend_pressed))
	_slabs["raid"].pressed.connect(func() -> void: _press("raid", raid_pressed))

	_haul = _build_haul()
	_haul.visible = false
	add_child(_haul)
	_haul_timer = Timer.new()
	_haul_timer.one_shot = true
	_haul_timer.wait_time = HAUL_SECONDS
	_haul_timer.timeout.connect(func() -> void: _haul.visible = false)
	add_child(_haul_timer)

	_tick = Timer.new()
	_tick.wait_time = TICK_SECONDS
	_tick.timeout.connect(_relabel)
	add_child(_tick)
	_tick.start()

	_land = Timer.new()
	_land.one_shot = true
	_land.timeout.connect(_on_run_landed)
	add_child(_land)

	Home.changed.connect(_on_home_changed)
	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	Screens.changed.connect(_update_visible)
	GameSocket.event.connect(_on_socket_event)
	get_viewport().size_changed.connect(_measure)

	_measure()
	_on_home_changed()
	_update_visible()
	# L'ENTREE (UiEntrance) : eteinte sous le noir, jouee a la reouverture,
	# en meme temps que la barre du haut et la colonne. La barre nait a
	# chaque arrivee au terrier (chrome.gd `_mount_place`), donc une entree
	# par arrivee.
	if visible and not bench_mode:
		UiEntrance.pose(_row.get_children())
		Screens.on_reveal(_arrive)


## Les planches et leurs fleches montent du bas, de gauche a droite. Une
## IMAGE PLUS TARD : la barre est construite dans le meme `moved` que ce qui
## l'appelle, et sa rangee n'a pas encore range ses planches.
func _arrive() -> void:
	await get_tree().process_frame
	if not is_inside_tree():
		return
	var rank := UiEntrance.FLOOR_FIRST
	for node in _row.get_children():
		UiEntrance.play(node as Control, UiEntrance.FROM_BOTTOM, rank)
		if (node as Control).visible:
			rank += 1


# ── L'API du chrome ──────────────────────────────────────────────────────────

## Les pieges : poses (la ligne de DEFEND les compte) et en reserve.
func set_defence(traps_placed: int, traps_held: int) -> void:
	_traps_placed = traps_placed
	_traps_held = traps_held
	_relabel()


## Les cibles du raid : combien de terriers sont ouverts, et si tous sont
## sous bouclier (auquel cas `open_count` vaut zero).
func set_targets(open_count: int, all_shielded: bool) -> void:
	_open = open_count
	_all_shielded = all_shielded
	_relabel()


## Les bombes dans le sac — l'objet de sabotage, qui REJOINT la ligne de
## RAID au lieu de prendre une rangee a lui.
func set_bombs(count: int) -> void:
	_bombs = count
	_relabel()


## Un geste est en cours : les planches se grisent (`button:disabled`,
## opacity .5) et ne prennent plus la pression.
func set_busy(on: bool) -> void:
	_busy = on
	for slab in _slabs.values():
		(slab as Button).disabled = on
	modulate.a = 0.5 if on else 1.0


## GLISSE HORS DU SOL pendant la pose — pour les DEUX modes du plateau. Sur
## la meme courbe que le recul de la camera : un controle qui disparait au
## milieu d'un mouvement continu se lit comme un accroc. Inerte une fois
## partie : « clicker sur fence casse tout » (Paul, 2026-09-21) — trois
## planches vivantes sous la rangee du kit.
func set_away(on: bool) -> void:
	if _away == on:
		return
	_away = on
	var travel := _slab_height() * AWAY_TRAVEL
	var tween := create_tween().set_parallel(true)
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(_row, "position:y", travel if on else 0.0, AWAY_SECONDS)
	tween.tween_property(_row, "modulate:a", 0.0 if on else 1.0, AWAY_SECONDS * 0.75)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for slab in _slabs.values():
		(slab as Button).mouse_filter = Control.MOUSE_FILTER_IGNORE if on else Control.MOUSE_FILTER_STOP


# ── La mise en page ──────────────────────────────────────────────────────────

func _slab_height() -> float:
	return clampf(get_viewport_rect().size.y * SLAB_VH, SLAB_MIN, SLAB_MAX)


## `.rr-loop-bar` : centree, a `--rr-edge` du bas, min(94vw, 1040) de large.
## Le panneau s'ancre au BAS de son hote — l'etage du sol du chrome est une
## ligne de hauteur nulle au bas de l'ecran, un banc lui donne un rectangle ;
## dans les deux cas le bas est le bas.
func _measure() -> void:
	var view := get_viewport_rect().size
	var h := _slab_height()
	var w := minf(view.x * BAR_VW, BAR_MAX_W)
	offset_top = -(Kit.EDGE + h)
	offset_bottom = -Kit.EDGE
	_row.position = Vector2(floorf((view.x - w) * 0.5), _row.position.y)
	_row.size = Vector2(w, h)
	var short := view.y < SHORT_SCREEN
	var verb_size := int(clampf(view.y * VERB_VH, VERB_MIN, VERB_MAX))
	var line_size := int(clampf(view.y * LINE_VH, LINE_MIN, LINE_MAX))
	for kind in _slabs:
		var slab: Slab = _slabs[kind]
		slab.custom_minimum_size = Vector2(0.0, h)
		# Sous le pli, le verbe de DEFEND et de RAID descend a 12 et la ligne
		# a 9, interligne 1 : chaque pixel du bloc est un pixel d'air en
		# moins contre le cadre.
		var on_art: bool = kind != "dig"
		slab.relayout(h, BOARDS[kind], VERB_SHORT if (short and on_art) else verb_size,
			LINE_MIN if (short and on_art) else line_size)
	_place_haul()


func _add_slab(kind: String, tex: Texture2D, ink: Color, ink_shadow: Color) -> Slab:
	var slab := Slab.new(kind, tex, BOARDS[kind]["slice"], ink, ink_shadow)
	slab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slab.size_flags_vertical = Control.SIZE_FILL
	_row.add_child(slab)
	return slab


## Le chevron entre deux planches. Dessine plutot qu'ecrit : la face pixel
## n'a pas forcement le glyphe, et le web le pose deja en `aria-hidden`.
func _arrow() -> Control:
	var a := Chevron.new()
	a.custom_minimum_size = Vector2(ARROW_SIZE * 0.6, ARROW_SIZE)
	a.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	a.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return a


## LA RECOLTE, debout sur la planche d'ou elle vient. Hors de la boite de la
## planche et transparente au pointeur : elle ne prend jamais une pression
## destinee a DIG.
func _build_haul() -> PanelContainer:
	var plate := Kit.panel(Kit.style_glass())
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := Kit.hbox(Kit.PAD_TIGHT)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(row)
	# La carotte tournee de 45° comme celle du compteur : c'est le meme objet,
	# tenu de la meme facon.
	var carrot := Kit.icon(Kit.ICONS["carrot"], CORNER_H)
	carrot.pivot_offset = carrot.custom_minimum_size * 0.5
	carrot.rotation = deg_to_rad(45.0)
	row.add_child(carrot)
	_haul_amount = Kit.label("", 13, Palette.CAPTION_INK)
	row.add_child(_haul_amount)
	_haul_words = Kit.label("", 11, Palette.CHALK_DIM)
	row.add_child(_haul_words)
	return plate


func _place_haul() -> void:
	if _haul == null or not _slabs.has("dig"):
		return
	var dig: Control = _slabs["dig"]
	var want := _haul.get_combined_minimum_size()
	_haul.size = want
	_haul.position = Vector2(
		_row.position.x + dig.position.x + (dig.size.x - want.x) * 0.5,
		_row.position.y - want.y - Kit.PAD_TIGHT)


# ── Ce que les planches disent ───────────────────────────────────────────────

func _on_home_changed() -> void:
	var b := Home.burrow
	var now := Time.get_ticks_msec()
	var next_run: Variant = b.get("nextRunInMs", null)
	_run_at_ms = (now + int(next_run)) if (next_run is float or next_run is int) else -1
	var shield: Variant = b.get("shieldMs", null)
	_shield_at_ms = (now + int(shield)) if (shield is float or shield is int) else -1
	# La minuterie tombe sur l'instant meme, plus un quart de seconde, et
	# demande le terrier frais.
	_land.stop()
	if _run_at_ms >= 0:
		_land.start(maxf(0.0, (_run_at_ms - now) / 1000.0) + LAND_SLACK)
	_relabel()


func _on_run_landed() -> void:
	_run_at_ms = -1
	_relabel()
	Home.refresh()


func _wait_ms() -> int:
	if _run_at_ms < 0:
		return -1
	return maxi(0, _run_at_ms - Time.get_ticks_msec())


func _shield_ms() -> int:
	if _shield_at_ms < 0:
		return -1
	return maxi(0, _shield_at_ms - Time.get_ticks_msec())


## Chaque ligne est des PARTIES, jointes a l'ecran par un point median.
## Courtes : une planche fait ~270px et la ligne n'a qu'une rangee.
func _relabel() -> void:
	if _slabs.is_empty():
		return
	var b := Home.burrow
	var tank := Home.live_energy()
	var energy: int = tank["energy"]
	var max_energy: int = tank["max"]
	var run_cost := int(b.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")))
	var crossing := int(b.get("crossingCost", Tuning.i("ENERGY.CROSSING_COST")))
	var can_dig := energy >= run_cost
	var garden := Home.live_garden()
	var raid_floor := Tuning.raid_floor()
	var can_raid := energy >= raid_floor and _open > 0

	# DIG : a portee, la ligne est le prix seul. A sec, le chiffre revient a
	# cote de l'attente — la il est la raison de l'attente, pas une repetition.
	var dig_parts: Array[String] = []
	if can_dig:
		dig_parts.append(I18N.f("loop.runCosts", [crossing]))
	else:
		var wait := _wait_ms()
		dig_parts.append(I18N.f("loop.energyOf", [energy, max_energy]))
		dig_parts.append(I18N.f("loop.runIn", [I18N.t("loop.aMoment") if wait <= 0 else I18N.wait(wait)]))

	# DEFEND : le jardin plein est l'alarme — ce qui est dehors est ce qu'un
	# pilleur peut prendre.
	var shield := _shield_ms()
	var home_parts: Array[String] = [
		I18N.f("loop.gardenPlus", [I18N.group_digits(garden)]) if garden > 0 else I18N.t("loop.gardenEmpty"),
		I18N.f("loop.shieldFor", [I18N.wait(shield)]) if shield >= 0 else I18N.t("loop.noShield"),
		I18N.f("loop.traps", [_traps_placed]),
	]

	# RAID : les portes qui s'ouvriront, ou — le reservoir trop bas pour y
	# aller — ce qu'un raid demande et quand on l'aura (le refus que le web
	# dit a la pression, dit ici AVANT, comme DIG dit son attente).
	var raid_parts: Array[String] = []
	var raid_lamp := false
	if _open > 0 and energy < raid_floor:
		var per_hour := maxf(1.0, float(b.get("regenPerHour", Tuning.regen_per_hour(int(b.get("level", 1))))))
		var enough_ms := (raid_floor - energy) / per_hour * 3600000.0
		raid_parts.append(I18N.f("loop.raidNeeds", [raid_floor, energy, I18N.wait(enough_ms)]))
	elif _open > 0:
		raid_parts.append(I18N.f("loop.burrowsOpen", [_open]))
		raid_lamp = true
	else:
		raid_parts.append(I18N.t("loop.allShielded"))
	if _bombs > 0:
		raid_parts.append(I18N.f("loop.bombsInBag", [_bombs]))

	var dig: Slab = _slabs["dig"]
	var defend: Slab = _slabs["defend"]
	var raid: Slab = _slabs["raid"]
	dig.say(I18N.shout(I18N.t("loop.dig")), dig_parts, DIG_LINE, Color.TRANSPARENT)
	defend.say(I18N.shout(I18N.t("loop.defend")), home_parts,
		DEF_DANGER if garden > 0 else DEF_LINE, DEF_LINE_SHADOW)
	raid.say(I18N.shout(I18N.t("loop.raid")), raid_parts, RAID_LAMP if raid_lamp else RAID_LINE, Color.TRANSPARENT)

	# Le « ! » de la quete sur la planche ou elle mene ; sinon, sur RAID, le
	# compte des portes ouvertes dans la puce sombre.
	var pointed := _quest_loop()
	dig.corner_badge(pointed == "dig")
	defend.corner_badge(pointed == "defend")
	if pointed == "raid":
		raid.corner_badge(true)
	elif _open > 0:
		raid.corner_chip(str(_open))
	else:
		raid.corner_badge(false)
	if pointed != _pointed and not pointed.is_empty() and _primed:
		_pop(pointed)
	_pointed = pointed

	# UNE PLANCHE QUI DEVIENT PRESSABLE SAUTE UNE FOIS : DIG quand une run
	# devient payable, DEFEND quand le jardin passe de vide a quelque chose a
	# prendre, RAID quand le reservoir tient un raid et qu'il y a ou aller.
	# Et elle carillonne, une fois pour tout ce qui s'est eveille ensemble.
	if _primed:
		var became := false
		if can_dig and not _was_can_dig:
			_pop("dig")
			became = true
		if garden > 0 and not _was_garden:
			_pop("defend")
			became = true
		if can_raid and not _was_can_raid:
			_pop("raid")
			became = true
		if became:
			Sound.play("chime_quick")
	_was_can_dig = can_dig
	_was_garden = garden > 0
	_was_can_raid = can_raid
	_primed = true

	_haul_words.text = I18N.t("loop.broughtHome")
	_place_haul()


## LA PLANCHE OU VIT LA QUETE (`loopOf`) : farm -> dig, garden/base -> defend,
## raid -> raid. Sans quete active, la ligne « et maintenant » pointe.
func _quest_loop() -> String:
	var door := ""
	var active := Home.active_quest()
	if not active.is_empty():
		door = String(active.get("door", ""))
	elif Home.loaded():
		var b := Home.burrow
		var next := Content.next_action({
			"energy": Home.live_energy()["energy"],
			"runCost": b.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")),
			"nextRunInMs": b.get("nextRunInMs", null),
			"gardenReady": Home.live_garden(),
			"gardenCapacity": b.get("gardenCapacity", 0),
			"shieldMs": b.get("shieldMs", null),
			"trapsLive": _traps_placed,
			"targets": [],
		})
		door = String(next.get("door", ""))
	match door:
		"farm":
			return "dig"
		"garden", "base":
			return "defend"
		"raid":
			return "raid"
		_:
			return ""


func _pop(kind: String) -> void:
	var slab: Slab = _slabs.get(kind)
	if slab == null:
		return
	slab.pivot_offset = slab.size * 0.5
	var tween := create_tween()
	tween.tween_property(slab, "scale", Vector2(1.08, 1.08), POP_SECONDS * 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(slab, "scale", Vector2.ONE, POP_SECONDS * 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _press(kind: String, sig: Signal) -> void:
	if _busy or _away:
		return
	# Ces trois-la sont LES actions, donc elles tressaillent (`wiggle`) — sauf
	# DIG, qui ne fait que s'enfoncer : il part en traversee, et un tressaillement
	# par-dessus l'iris qui se ferme faisait un geste de trop (2026-09-23).
	if kind != "dig":
		var slab: Slab = _slabs[kind]
		slab.wiggle()
	sig.emit()


# ── L'arrivee, et la recolte ramenee ────────────────────────────────────────

## CONSTRUITE AU TERRIER ET DETRUITE EN PARTANT (chrome.gd `_mount_place`) :
## pas de calcul d'arrivee ici. Une recolte encaissee sur l'ile est gardee par
## le chrome et rendue par `show_haul` une fois le rideau rouvert.
func _update_visible() -> void:
	var here := bench_mode or (Screens.in_world() and Screens.place == Screens.Place.BURROW)
	visible = here


## `banked` porte {carrots, loot, nfts} : la run vient d'encaisser. Montre a
## L'ARRIVEE au terrier, pas a l'instant du signal — on est encore sur l'ile.
func _on_socket_event(name: String, data: Variant) -> void:
	if name != "banked" or not (data is Dictionary):
		return
	var carrots := int((data as Dictionary).get("carrots", 0))
	if carrots <= 0:
		return
	_pending_haul = carrots
	_show_pending_haul()


func _show_pending_haul() -> void:
	if _pending_haul <= 0 or not visible:
		return
	show_haul(_pending_haul)
	_pending_haul = 0


## La recolte sur DIG, pour HAUL_SECONDS. Public pour le banc et le rideau.
func show_haul(amount: int) -> void:
	_haul_amount.text = "+%s" % I18N.group_digits(amount)
	_haul_words.text = I18N.t("loop.broughtHome")
	_haul.visible = true
	_haul_timer.start()
	_place_haul()
	# `.rr-home-haul` monte en place : un petit saut depuis la planche.
	_haul.modulate.a = 0.0
	var from := _haul.position.y + 6.0
	var to := _haul.position.y
	_haul.position.y = from
	var tween := create_tween().set_parallel(true)
	tween.tween_property(_haul, "modulate:a", 1.0, 0.18)
	tween.tween_property(_haul, "position:y", to, 0.24).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


# ── Les pieces ───────────────────────────────────────────────────────────────

## LA LIGNE D'ETAT : UNE rangee, qui VOYAGE quand elle deborde.
##
## Le debordement est MESURE, pas devine, et remesure quand la ligne change
## (le compte a rebours de l'energie) ou quand la planche est redimensionnee.
## Une seule VITESSE plutot qu'une duree, pour qu'une ligne longue ne coure
## pas apres une courte, et elle se repose aux deux bouts — les pauses sont
## la ou on la lit vraiment (`rr-loop-scroll` : 0-16 % et 84-100 % immobiles,
## `alternate`, ~26px par seconde : 1400 ms + 38 ms par pixel).
class StateLine extends Control:
	const REST := 0.16
	const BASE_MS := 1400.0
	const PER_PX_MS := 38.0

	var label: Label
	var _over := 0.0
	var _phase := 0.0
	var _forward := true

	func _init() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		label = Kit.label("", 9, Palette.CREAM)
		label.autowrap_mode = TextServer.AUTOWRAP_OFF
		add_child(label)
		resized.connect(_measure)

	func say(parts: Array[String], size_px: int, ink: Color, shadow: Color) -> void:
		label.text = " · ".join(parts)
		label.add_theme_font_size_override("font_size", size_px)
		label.add_theme_color_override("font_color", ink)
		label.add_theme_color_override("font_shadow_color", shadow)
		label.add_theme_constant_override("shadow_offset_x", 0)
		label.add_theme_constant_override("shadow_offset_y", 2 if shadow.a > 0.0 else 0)
		custom_minimum_size.y = float(size_px) * 1.25
		_measure()

	func _measure() -> void:
		var want := label.get_combined_minimum_size()
		label.size = Vector2(maxf(want.x, size.x), size.y)
		# Un pixel de jeu : des metriques sous le pixel feraient osciller ceci
		# entre 0 et 1 sans fin.
		var d := maxf(0.0, ceilf(want.x - size.x))
		if absf(d - _over) > 1.0:
			_over = d
			_phase = 0.0
			_forward = true
		if _over <= 0.0:
			label.position.x = 0.0

	func _process(delta: float) -> void:
		if _over <= 0.0:
			return
		var leg := (BASE_MS + _over * PER_PX_MS) / 1000.0
		_phase += delta / leg
		if _phase >= 1.0:
			_phase -= 1.0
			_forward = not _forward
		var t := clampf((_phase - REST) / (1.0 - 2.0 * REST), 0.0, 1.0)
		var eased := t * t * (3.0 - 2.0 * t)
		var progress := eased if _forward else 1.0 - eased
		label.position.x = -_over * progress


## UNE PLANCHE : le bouton, son art en trois ou neuf morceaux, et dessus le
## verbe au-dessus de la ligne d'etat, dans un retrait mesure sur l'art.
class Slab extends Button:
	var kind: String
	var board: NineSlice
	var content: Control
	var verb: Label
	var line: StateLine
	var corner: Control
	var _inset := Vector4.ZERO
	var _content_y := 0.0

	func _init(p_kind: String, tex: Texture2D, slice: Vector4i, ink: Color, ink_shadow: Color) -> void:
		kind = p_kind
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		for state in ["normal", "hover", "pressed", "focus", "disabled"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())
		add_theme_font_size_override("font_size", 1)
		add_theme_color_override("font_color", Color.TRANSPARENT)

		board = NineSlice.make(tex, slice, Vector4.ZERO, true)
		add_child(board)

		content = Control.new()
		content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(content)

		var column := Kit.vbox(3)
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.name = "Column"
		content.add_child(column)

		verb = Kit.label("", 13, ink)
		verb.add_theme_color_override("font_shadow_color", ink_shadow)
		verb.add_theme_constant_override("shadow_offset_x", 0)
		verb.add_theme_constant_override("shadow_offset_y", 2 if ink_shadow.a > 0.0 else 0)
		column.add_child(verb)

		line = StateLine.new()
		line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_child(line)

		button_down.connect(func() -> void: _sink(true))
		button_up.connect(func() -> void: _sink(false))
		resized.connect(_place)

	## L'art suit la hauteur de la planche : bords et retraits sont des
	## fractions de `h`.
	func relayout(h: float, spec: Dictionary, verb_size: int, line_size: int) -> void:
		var edge: Vector4 = spec["edge"]
		board.edge = edge * h
		_inset = (spec["inset"] as Vector4) * h
		verb.add_theme_font_size_override("font_size", verb_size)
		line.custom_minimum_size.y = float(line_size) * 1.25
		line.label.add_theme_font_size_override("font_size", line_size)
		_place()

	func _place() -> void:
		board.position = Vector2.ZERO
		board.size = size
		content.position = Vector2(_inset.x, _inset.y + _content_y)
		content.size = Vector2(maxf(0.0, size.x - _inset.x - _inset.z), maxf(0.0, size.y - _inset.y - _inset.w))
		var column: Control = content.get_node("Column")
		var want := column.get_combined_minimum_size()
		column.size = Vector2(content.size.x, want.y)
		column.position = Vector2(0.0, floorf((content.size.y - want.y) * 0.5))
		if corner != null:
			var cs := corner.get_combined_minimum_size()
			corner.size = cs
			corner.position = Vector2(size.x - 4.0 - cs.x, -8.0 + _content_y)

	func say(word: String, parts: Array[String], ink: Color, shadow: Color) -> void:
		verb.text = word
		line.say(parts, line.label.get_theme_font_size("font_size"), ink, shadow)
		_place()

	## Le « ! » de la quete : la pastille rouge peinte (leaf-badge.tsx), 4px
	## en dedans du bord droit, 8px au-dessus du haut — SUR le coin de la
	## planche, pas pendue a son bout (« encore un peu a gauche »).
	func corner_badge(on: bool) -> void:
		_clear_corner()
		if not on:
			return
		var badge := Kit.badge(LoopBar.CORNER_H)
		badge.custom_minimum_size = Vector2(22.0, LoopBar.CORNER_H)
		var mark := Kit.label("!", 11, Color.WHITE)
		mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		Kit.fill(mark)
		badge.add_child(mark)
		_set_corner(badge)

	## Un compte qui dure, dans la puce sombre.
	func corner_chip(text: String) -> void:
		_clear_corner()
		var s := StyleBoxFlat.new()
		s.bg_color = LoopBar.CHIP_FACE
		s.set_corner_radius_all(3)
		s.content_margin_left = Kit.PAD_TIGHT
		s.content_margin_right = Kit.PAD_TIGHT
		s.content_margin_top = 2
		s.content_margin_bottom = 2
		var chip := Kit.panel(s)
		chip.custom_minimum_size = Vector2(22.0, LoopBar.CORNER_H)
		var n := Kit.label(text, 11, LoopBar.CHIP_INK)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		n.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		chip.add_child(n)
		_set_corner(chip)

	func _set_corner(node: Control) -> void:
		node.mouse_filter = Control.MOUSE_FILTER_IGNORE
		corner = node
		add_child(node)
		_place()

	func _clear_corner() -> void:
		if corner != null:
			corner.queue_free()
			corner = null

	## La pression enfonce le contenu et assombrit l'art ; la boite ne bouge
	## pas, la zone tactile reste sous le pouce.
	func _sink(down: bool) -> void:
		_content_y = LoopBar.PRESS_Y if down else 0.0
		board.tint = Color(0.88, 0.88, 0.88) if down else Color.WHITE
		_place()

	func wiggle() -> void:
		pivot_offset = size * 0.5
		var shake := create_tween()
		shake.tween_property(self, "rotation", deg_to_rad(-3.0), 0.08)
		shake.tween_property(self, "rotation", deg_to_rad(2.5), 0.08)
		shake.tween_property(self, "rotation", deg_to_rad(-1.0), 0.08)
		shake.tween_property(self, "rotation", 0.0, 0.08)


## Le chevron « ▸ » entre deux planches, a l'encre de craie sur son ombre.
class Chevron extends Control:
	func _draw() -> void:
		var w := size.x
		var h := size.y
		var tip := PackedVector2Array([Vector2(0.0, 0.0), Vector2(w, h * 0.5), Vector2(0.0, h)])
		draw_colored_polygon(Transform2D(0.0, Vector2(0.0, 2.0)) * tip, LoopBar.ARROW_SHADOW)
		draw_colored_polygon(tip, LoopBar.ARROW_INK)
