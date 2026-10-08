class_name CarrotPill
extends Control
## LA PASTILLE A CAROTTES — le total engrange, et le reservoir a cote. Porte
## de src/components/carrot-pill.tsx, en gardant ce que ce fichier a decide :
##
##   • LA PLAQUE EST LA PLANCHE A CADRAN (energy-dial.tsx), UNE SEULE PIECE
##     D'ART. C'etait une planche a trois tranches avec le cadran decoupe et
##     pendu a son bout ; sur le bois de la planche ce cercle se lisait comme
##     un BOUTON pose dessus (Paul, 2026-09-21). Largeur FIXE, parce que
##     l'art l'est : un cercle ne s'etire pas, la planche garde son 268x102
##     et c'est la taille du chiffre qui repond a un long nombre.
##   • LA CAROTTE VIENT APRES LE CHIFFRE (« met plutot la carotte a la fin ») :
##     « 258 carottes », un chiffre et son unite, la ou un sprite devant se
##     lisait comme une puce de liste — coincee entre la jauge et le nombre.
##   • PAS DE MOT « carottes » : le sprite nomme deja l'unite.
##   • LA PILE EST LE BOIS, a largeur fixe : la pastille est centree sur
##     l'ecran, et tout ce qui change sa largeur la deplace. Un compteur qui
##     marche quand il compte est la seule chose qu'un compteur ne doit pas
##     faire. Le chiffre descend d'un cran (28, 22, 16, 12, 10) quand la pile
##     deborde du bois ; la ligne, jamais.
##   • LE RESERVOIR SOUS LE CADRAN, plus sur le bois (Paul, 2026-09-23 : « la
##     barre d'energie est remplie d'information qui debordent »). Il vivait
##     sous le chiffre, en encre sombre, a 21 du bas — exactement la ou la
##     ligne des coffres tombe en manche : « 0/1 » s'ecrivait par-dessus
##     « 295 ». Le chiffre de l'energie est la VALEUR DE L'ANNEAU : il pend
##     donc sous l'anneau, sur une etiquette de verre comme la puce du butin,
##     et le bois ne porte plus que les carottes (et les coffres en manche).
##     La lecture seule, sans le plein (« vire le 300 ») : l'anneau dessine
##     deja la fraction.
##   • LA LIGNE DU CLASSEMENT N'EST PLUS DESSINEE. Son code est encore dans
##     le fichier web mais plus dans son rendu ; le rang vit sur le trophee
##     du rail (« #59 »). `set_rank` garde donc les nombres pour qui les
##     demande, et ne peint rien.
##   • LES COFFRES SUR LEUR PROPRE PUCE, sous la pastille, sur l'ile
##     seulement (d'abord « juste en dessous du nombre de carrote », sur le
##     bois ; sortis du bois le 2026-10-01) ; le butin porte (« +18 » avec
##     sa carotte, « c'est quoi le plus 18 je comprends pas ») en puce de
##     verre qui PEND SOUS LE BOIS, centree sous le chiffre — le pendant de
##     l'energie sous l'anneau. A droite de la plaque, elle tombait sur la
##     boutique du rail des que l'ecran grandit (2026-09-23).
##   • EN MANCHE, LE CHIFFRE EST CE QUE L'ON PORTE (2026-10-01). Le bois
##     disait « 0 » pendant que « +271 » pendait en petit dessous : on lisait
##     « je n'ai rien », alors que porter sans avoir encore engrange EST la
##     tension de la manche. Sur l'ile le grand chiffre devient le butin
##     porte, en orange carotte ; le stock du terrier descend sur la puce de
##     verre, derriere la pile de carottes. Au retour, le stock reprend le
##     bois et la rafale l'y fait monter.
##   • LE REFUS SECOUE : -6, 5, -3, 0 en 360 ms, sur le DESSIN et non la
##     boite — c'est la barre qui pose la pastille, et une secousse qui ecrit
##     dans `position` se bat avec elle.

## Un tap sur l'anneau, un tap sur le chiffre : la barre (chrome.gd) envoie
## les deux au meme panneau d'energie.
signal energy_tapped
signal add_pressed

## Les crans du chiffre, du plus grand au plus petit — des multiples de la
## cellule du kit lisent le plus net.
const FIGURE_STEPS: Array[int] = [28, 22, 16, 12, 10]
## La boite de la carotte dans la rangee, et ce qu'elle prend au chiffre :
## sa boite (32) et l'ecart (6), moins deux pixels d'air que le sprite laisse.
const CARROT_BOX := 32.0
const CARROT_ART := 30.0
const ROW_CARROT := 32.0 + 6.0 - 2.0
## L'etiquette du reservoir : 16 px, l'eclair a 16 de haut, accrochee sous
## l'epingle du cadran — elle la chevauche de ENERGY_TUCK pixels d'art, pour
## pendre a l'anneau plutot que flotter dessous. Elle etait a 11 : le chiffre
## qui decide si DIG et RAID s'allument se lisait moins bien que les carottes
## (2026-10-01). 16 est un cran de FIGURE_STEPS, net sur la face pixel.
const ENERGY_FONT := 16
const ENERGY_BOLT_H := 16.0
const ENERGY_TUCK := 6.0
## LES COFFRES DE L'ILE, sur leur propre puce de verre SOUS la pastille
## (2026-10-01 : « I'd rather have it in a separate panel below it ») — plus
## sur le bois, ou ils se serraient sous le chiffre. Le sprite du coffre
## (23x14) a 26 de large ; la puce pend CHEST_GAP sous les puces de l'energie
## et du butin.
const CHEST_W := 26.0
const CHEST_GAP := 4.0
const CHEST_FRAME := Rect2(0, 0, 23, 14)
## Le sursaut du chiffre quand il engrange (rr-banked : 1 -> 1.18 -> 1).
const BANK_POP := 1.18
const BANK_SECONDS := 0.42
## La marque de la carotte comme unite, sur une petite ligne.
const MARK := 10.0

var dial: EnergyDial
var burst: CarrotBurst

var _plate: Control
var _stack: VBoxContainer
var _row: HBoxContainer
var _figure: Label
var _chests: PanelContainer
var _chest_line: HBoxContainer
var _chest_figure: Label
var _energy_tag: PanelContainer
var _energy_line: HBoxContainer
var _energy_figure: Label
## Le butin porte sur l'ile, -1 hors manche (le terrier, un raid).
var _carrying := -1
## LE BUTIN DEJA ENCAISSE MAIS PAS ENCORE LU : la manche est au terrier
## (`banked`, ou on a quitte l'ile), mais /api/burrow n'a pas encore rendu le
## nouveau stock. Le chiffre le garde par-dessus `_riding_on`, le stock d'avant,
## jusqu'a ce que le stock bouge — sinon il redescendrait d'autant, puis
## remonterait.
var _riding := 0
var _riding_on := -1
## La manche en cours est encaissee : son butin est dans le stock, plus en sus.
var _run_banked := false
var _ride_seq := 0
var _add: Button

var _stock := -1
## LES CAROTTES ENCORE EN VOL (la recolte, burrow.gd `_on_harvested`) : le
## serveur les a deja comptees, le chiffre les attend et monte a mesure
## qu'elles se posent. `_hold_seq` reconnait la derniere attente.
var _in_flight := 0
var _hold_seq := 0
var _rank := 0
var _to_pass := -1
var _energy_shown := -1
var _has_bank := false


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = EnergyDial.ART
	size = EnergyDial.ART

	# LA PLAQUE porte tout, pour que la secousse et l'arrivee bougent le
	# dessin d'un bloc sans toucher a la boite que la barre a posee.
	_plate = Control.new()
	_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_plate)
	add_child(_plate)

	dial = EnergyDial.new()
	Kit.fill(dial)
	dial.tapped.connect(func() -> void: energy_tapped.emit())
	_plate.add_child(dial)

	# La rafale, SOUS la pile : les carottes passent derriere le chiffre.
	burst = CarrotBurst.new()
	_plate.add_child(burst)

	# LA PILE : le chiffre et sa carotte, puis les coffres, centres dans le
	# bois propre.
	_stack = Kit.vbox(0)
	_stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stack.alignment = BoxContainer.ALIGNMENT_CENTER
	_stack.clip_contents = true
	_plate.add_child(_stack)

	_row = Kit.hbox(Kit.PAD_TIGHT)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_row.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_stack.add_child(_row)

	_figure = Kit.label("0", FIGURE_STEPS[0], Palette.PILL_INK)
	_figure.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_row.add_child(_figure)

	# La carotte, deja couchee : l'icone du kit est le sprite en diagonale.
	# Levee de 2 px (« lifted off the row's centre, but only just ») : sa
	# masse est sous son milieu geometrique.
	var carrot_box := Control.new()
	carrot_box.custom_minimum_size = Vector2(CARROT_BOX, CARROT_BOX)
	carrot_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var carrot := Kit.icon(Kit.ICONS["carrot"], CARROT_ART)
	carrot.position = Vector2((CARROT_BOX - carrot.custom_minimum_size.x) * 0.5, (CARROT_BOX - CARROT_ART) * 0.5 - 2.0)
	carrot.size = carrot.custom_minimum_size
	carrot_box.add_child(carrot)
	_row.add_child(carrot_box)

	_chests = Kit.panel(Kit.style_glass())
	_chests.mouse_filter = Control.MOUSE_FILTER_PASS
	_chests.visible = false
	_chest_line = Kit.hbox(4.0)
	_chest_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var chest := AtlasTexture.new()
	chest.atlas = Kit.ICONS["loot-box"]
	chest.region = CHEST_FRAME
	var chest_icon := TextureRect.new()
	chest_icon.texture = chest
	chest_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	chest_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	chest_icon.custom_minimum_size = Vector2(CHEST_W, round(CHEST_W * CHEST_FRAME.size.y / CHEST_FRAME.size.x))
	chest_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_chest_line.add_child(chest_icon)
	_chest_figure = Kit.label("0/0", Kit.pixel_size(1.5), Palette.PILL_INK)
	_chest_figure.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_chest_line.add_child(_chest_figure)
	_chests.add_child(_chest_line)
	_plate.add_child(_chests)

	# LE RESERVOIR, sous le cadran : la valeur de l'anneau, sur du verre.
	_energy_tag = Kit.panel(Kit.style_glass())
	_energy_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_energy_line = Kit.hbox(2.0)
	_energy_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_energy_figure = Kit.label("0", ENERGY_FONT, Palette.PILL_INK)
	_energy_figure.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_energy_line.add_child(_energy_figure)
	var bolt := Kit.icon(Kit.ICONS["bolt"], ENERGY_BOLT_H)
	bolt.material = Stencil.material(Palette.RANK_GOLD)
	bolt.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_energy_line.add_child(bolt)
	_energy_tag.add_child(_energy_line)
	_energy_tag.visible = false
	_plate.add_child(_energy_tag)

	# LE TAP SUR LE CHIFFRE : la boutique.
	_add = Button.new()
	_add.flat = true
	_add.focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_add.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_add.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_add.pressed.connect(func() -> void: add_pressed.emit())
	_plate.add_child(_add)

	resized.connect(_place)


func _ready() -> void:
	dial.mark = float(Tuning.raid_floor())
	_place()
	refresh()
	Home.changed.connect(refresh)
	Home.burst.connect(_on_burst)
	RunState.current.banked.connect(_on_run_banked)
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())


## LA MISE EN PAGE, dans les mesures de l'art (energy-dial.tsx) : la pile
## est le bois propre, de `inset` sur `room` ; l'etiquette du reservoir pend
## sous l'anneau ; en manche, le stock du terrier sous le chiffre.
func _place() -> void:
	var x := dial.inset()
	var w := dial.room()
	# CENTREE SUR LA PLANCHE, pas sur l'art : le cadran depasse en haut et en
	# bas, la planche pend dans les rangees 31..86. Centree sur la hauteur de
	# l'art, la pile flottait 7 px source trop haut (Paul, 2026-09-24).
	var k := dial.scale_factor()
	var lift := ((EnergyDial.PLANK_TOP + EnergyDial.PLANK_BOTTOM) * 0.5 - EnergyDial.ART.y * 0.5) * k
	_stack.position = Vector2(x, round(lift))
	_stack.size = Vector2(w, size.y)
	_add.position = _stack.position
	_add.size = _stack.size
	_fit_figure()
	_hang_energy()
	# Les coffres sous la puce qui pend deja, centres sur le bois.
	var below := roundf(size.y - ENERGY_TUCK * dial.scale_factor())
	if _energy_tag.visible:
		below = maxf(below, _energy_tag.position.y + _energy_tag.size.y)
	_chests.reset_size()
	var chw := _chests.get_combined_minimum_size()
	_chests.size = chw
	_chests.position = Vector2(round(x + w * 0.5 - chw.x * 0.5), below + CHEST_GAP)


## Le plus grand cran ou le chiffre groupe tient encore dans la pile a cote
## de sa carotte : quand la pile depasse la face, c'est la face qui cede,
## un cran a la fois, jamais la ligne.
func _fit_figure() -> void:
	var room := dial.room() - ROW_CARROT
	var font := _figure.get_theme_font("font")
	var chosen := FIGURE_STEPS[FIGURE_STEPS.size() - 1]
	for step in FIGURE_STEPS:
		if font.get_string_size(_figure.text, HORIZONTAL_ALIGNMENT_LEFT, -1, step).x <= room:
			chosen = step
			break
	_figure.add_theme_font_size_override("font_size", chosen)
	_figure.reset_size()
	_figure.pivot_offset = _figure.size * 0.5


## Relit le terrier : le stock, et si ce lieu a un reservoir.
##
## UN SEUL COMPTEUR, MEME EN MANCHE : le stock plus ce que la manche a creuse.
## Le serveur encaisse la manche a chaque sortie (server/index.ts `bankRun`),
## le butin porte ne peut pas se perdre — un « sac » a part, au-dessus du
## stock, faisait faire l'addition au joueur pour un risque qui n'existe pas
## (Paul, 2026-10-08).
func refresh() -> void:
	var home := int(Home.burrow.get("stock", 0))
	if _riding > 0 and home != _riding_on:
		_riding = 0
	var stock := home - _in_flight + _riding
	if _carrying > 0 and not _run_banked:
		stock += _carrying
	_stock = stock
	var text := I18N.group_digits(stock)
	if text != _figure.text:
		_figure.text = text
		_fit_figure()
	tooltip_text = I18N.f("pill.banked", [stock])
	# LE RESERVOIR N'EXISTE QUE SUR LE TERRIER : ailleurs `bank` est null,
	# et un cadran a zero avec une alarme serait le chrome inventant une
	# urgence sur un ecran qui n'a pas d'energie a depenser.
	_has_bank = Screens.place == Screens.Place.BURROW and not Home.burrow.is_empty()
	var shown := _has_bank or _run_energy >= 0
	dial.hub = shown
	dial.beat = shown
	# Le grand livre du reservoir ne s'ouvre que depuis le terrier : sur l'ile,
	# le cadran lit la manche, pas le reservoir.
	dial.tappable = _has_bank and _run_energy < 0
	_energy_tag.visible = shown
	_tick_energy()


## Le bas de la pastille a l'ecran, reservoir compris quand il se montre.
func hang_bottom() -> float:
	var bottom := _plate.get_global_rect().end.y if _plate != null else get_global_rect().end.y
	for chip in [_energy_tag, _chests]:
		if chip != null and (chip as Control).visible:
			bottom = maxf(bottom, (chip as Control).get_global_rect().end.y)
	return bottom


func _process(_delta: float) -> void:
	_tick_energy()


## L'ENERGIE MAINTENANT, relue a chaque image (Home.live_energy) : ce que
## le serveur a dit plus ce qui est remonte depuis.
func _tick_energy() -> void:
	var energy := 0
	var max_energy := 1
	if _run_energy >= 0:
		energy = _run_energy
		max_energy = Tuning.i("ENERGY.MAX", 300)
	elif _has_bank:
		var live := Home.live_energy()
		energy = _refilled(int(live.get("energy", 0)))
		max_energy = int(live.get("max", 1))
	else:
		dial.value = 0.0
		return
	dial.max_value = float(max_energy)
	dial.value = float(energy)
	if energy != _energy_shown:
		# LE CADRAN TRESSAILLE A CHAQUE CHANGEMENT, d'autant plus fort que le
		# saut est grand (2026-10-01) : +1 de regeneration a peine, une
		# traversee ou un plein franchement. Pas au premier affichage, ni
		# pendant la remontee du retour, qui change a chaque image.
		if _energy_shown >= 0 and not _refill_armed:
			_jolt(absf(energy - _energy_shown) / maxf(1.0, max_energy))
		_energy_shown = energy
		_energy_figure.text = I18N.group_digits(energy)
		_energy_tag.tooltip_text = I18N.f("loop.energyOf", [energy, max_energy])
		_hang_energy()


## LE RETOUR AU TERRIER REMPLIT LE CADRAN. La manche l'a vide ; en rentrant,
## il repart de zero et remonte jusqu'au reservoir, chiffre compris (Peko,
## 2026-10-01 : « qu'elle soit videe et qu'elle se remplisse jusqu'a la
## valeur d'energie que le joueur a »). Tant que le rideau couvre l'ecran, il
## reste a zero : le geste commence quand on le voit.
const REFILL_SECONDS := 0.6
const REFILL_PER_FULL := 0.8
var _refill_armed := false
var _refill_from_ms := -1


func _refilled(energy: int) -> int:
	if not _refill_armed:
		return energy
	if Screens.crossing:
		_refill_from_ms = -1
		return 0
	if _refill_from_ms < 0:
		_refill_from_ms = Time.get_ticks_msec()
	var max_energy := maxf(1.0, float(Home.live_energy().get("max", 1)))
	var seconds := REFILL_SECONDS + REFILL_PER_FULL * minf(1.0, energy / max_energy)
	var t := (Time.get_ticks_msec() - _refill_from_ms) / 1000.0 / seconds
	if t >= 1.0:
		_refill_armed = false
		return energy
	return int(round(energy * ease(t, 0.4)))


## L'etiquette, centree sous l'anneau, qui chevauche un peu son epingle.
func _hang_energy() -> void:
	_energy_tag.reset_size()
	var ew := _energy_tag.get_combined_minimum_size()
	_energy_tag.size = ew
	var c := dial.ring_centre()
	_energy_tag.position = Vector2(round(c.x - ew.x * 0.5), round(size.y - ENERGY_TUCK * dial.scale_factor()))


## LE RANG ET L'ECART, tels que le tableau les donne (`me`). Gardes pour
## qui les demande ; le web ne les peint plus sur la pastille.
func set_rank(rank: int, to_pass: int = -1) -> void:
	# GAGNER UNE PLACE carillonne (page.tsx) ; en perdre une est la nouvelle
	# de quelqu'un d'autre. Pas au premier rang connu : ce n'est pas un gain.
	if _rank > 0 and rank > 0 and rank < _rank:
		Sound.play("chime_quick")
	_rank = rank
	_to_pass = to_pass


func rank() -> int:
	return _rank


func to_pass() -> int:
	return _to_pass


## L'ENERGIE DE LA MANCHE, sur le cadran — LE MEME que celui du terrier.
##
## Une seule jauge d'energie a l'ecran, a la meme place partout : le joueur la
## lit la ou il l'a toujours lue (Peko, 2026-09-23 : « le bar d'energie c'est
## la meme que celle du menu principal »). Le HUD de manche a perdu sa barre a
## part. -1 rend le cadran au reservoir du terrier.
var _run_energy := -1


func set_run_energy(energy: int) -> void:
	if energy == _run_energy:
		return
	# La manche rend la main au reservoir : le cadran repart de zero.
	if _run_energy >= 0 and energy < 0:
		_refill_armed = true
		_refill_from_ms = -1
	_run_energy = energy
	refresh()


## LA COURSE : le butin porte et les coffres de l'ile. `chests` est
## {taken, total, warnStage} sur l'ile, vide ailleurs (le terrier, un raid) :
## c'est lui qui dit si le chiffre est le butin ou le stock.
func set_run(carrying: int, chests: Dictionary = {}) -> void:
	var was := _carrying
	_carrying = carrying if not chests.is_empty() else -1
	# On quitte l'ile avant que `banked` ne revienne : le butin reste au
	# chiffre jusqu'a ce que le stock le contienne.
	if _carrying < 0 and was > 0 and not _run_banked:
		_ride(was)
	# Hors de l'ile, ou un nouveau lapin (le butin repart de zero) : la manche
	# suivante n'est pas encore encaissee.
	if _carrying < 0 or _carrying < was:
		_run_banked = false
	refresh()
	# Chaque gain fait sauter le chiffre (re-keyed per gain).
	if _carrying > 0 and was >= 0 and _carrying > was:
		_figure.pivot_offset = _figure.size * 0.5
		_figure.scale = Vector2(0.8, 0.8)
		create_tween().tween_property(_figure, "scale", Vector2.ONE, 0.2).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	_chests.visible = not chests.is_empty()
	if not chests.is_empty():
		var taken := int(chests.get("taken", 0))
		var total := int(chests.get("total", 0))
		_chest_figure.text = "%d/%d" % [taken, total]
		_chests.tooltip_text = I18N.t("run.chestsTitle")
		# Passe zero, le compte devient rouge : a ce point le compte EST
		# l'avertissement, dit precisement.
		var warn := int(chests.get("warnStage", 0)) > 0
		_chest_figure.add_theme_color_override("font_color", Palette.DANGER if warn else Palette.PILL_INK)
	_place()


## LA MANCHE EST ENCAISSEE : le stock va la contenir, le chiffre ne doit ni
## la compter deux fois ni la perdre en attendant la relecture.
func _on_run_banked(_carrots: int) -> void:
	if _carrying <= 0 or _run_banked:
		return
	_run_banked = true
	_ride(_carrying)
	refresh()


func _ride(amount: int) -> void:
	_riding = amount
	_riding_on = int(Home.burrow.get("stock", 0))
	_ride_seq += 1
	var seq := _ride_seq
	if not is_inside_tree():
		return
	# Si la relecture ne vient pas, on ne garde pas le butin au chiffre
	# indefiniment.
	get_tree().create_timer(HOLD_LIMIT * 2.0).timeout.connect(func() -> void:
		if seq == _ride_seq and _riding > 0:
			_riding = 0
			refresh())


## DES CAROTTES ARRIVENT : la rafale derriere le chiffre, et le chiffre
## sursaute (rr-banked).
func _on_burst(amount: int) -> void:
	burst.position = Vector2(dial.inset() + dial.room() * 0.5, size.y * 0.5)
	burst.fire(amount)
	_figure.pivot_offset = _figure.size * 0.5
	var pop := create_tween()
	pop.tween_property(_figure, "scale", Vector2.ONE * BANK_POP, BANK_SECONDS * 0.35).set_ease(Tween.EASE_OUT)
	pop.tween_property(_figure, "scale", Vector2.ONE, BANK_SECONDS * 0.65).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)


## LE FILET : si les carottes ne se posent jamais (on a quitte le terrier en
## plein vol), le chiffre ne ment pas plus longtemps que ca.
const HOLD_LIMIT := 3.0
const LAND_POP := 1.08


## `amount` carottes partent du potager : le chiffre les retient.
func hold(amount: int) -> void:
	_in_flight += amount
	_hold_seq += 1
	var seq := _hold_seq
	refresh()
	get_tree().create_timer(HOLD_LIMIT).timeout.connect(func() -> void:
		if seq == _hold_seq and _in_flight > 0:
			land(_in_flight))


## `amount` d'entre elles se posent : le chiffre monte d'autant et sursaute
## un peu — le grand sursaut est celui de la rafale, a la derniere.
func land(amount: int) -> void:
	_in_flight = maxi(0, _in_flight - amount)
	refresh()
	_figure.pivot_offset = _figure.size * 0.5
	var pop := create_tween()
	pop.tween_property(_figure, "scale", Vector2.ONE * LAND_POP, 0.05).set_ease(Tween.EASE_OUT)
	pop.tween_property(_figure, "scale", Vector2.ONE, 0.12).set_ease(Tween.EASE_OUT)


## OU VISENT LES CAROTTES QUI VOLENT VERS LA PILE (la recolte du potager,
## burrow_props.gd `harvest`) : le milieu du chiffre, en pixels d'ecran.
func carrot_target() -> Vector2:
	return _figure.get_global_transform_with_canvas() * (_figure.size * 0.5)


## LE REFUS : la pastille secoue et son bord rougit — le nombre qui a dit
## non, le disant.
## LE TRESSAILLEMENT DU CADRAN, pour une part `share` (0..1) du reservoir :
## de JOLT_MIN a JOLT_MAX pixels, atteint vers un quart du reservoir.
const JOLT_MIN := 1.5
const JOLT_MAX := 7.0
var _jolt_tween: Tween


func _jolt(share: float) -> void:
	if _jolt_tween != null and _jolt_tween.is_valid():
		_jolt_tween.kill()
	var amp := lerpf(JOLT_MIN, JOLT_MAX, clampf(share * 4.0, 0.0, 1.0))
	_jolt_tween = create_tween()
	for k in [-1.0, 0.8, -0.5, 0.25, 0.0]:
		_jolt_tween.tween_property(dial, "position:x", amp * k, 0.06).set_ease(Tween.EASE_OUT)


func deny() -> void:
	var shake := create_tween()
	for dx in [-6.0, 5.0, -3.0, 0.0]:
		shake.tween_property(_plate, "position:x", dx, 0.09).set_ease(Tween.EASE_OUT)
	var flush := create_tween()
	flush.tween_property(_plate, "modulate", Color(1.0, 0.72, 0.66), 0.12)
	flush.tween_property(_plate, "modulate", Color.WHITE, 0.24)


## La premiere image de `drop_in`, posee seule quand l'arrivee attend.
func drop_pose() -> void:
	UiEntrance.pose([_plate])


## L'ARRIVEE (rr-toon-in-down) : la plaque tombe du haut et se pose, au rang
## `rank` de la file (UiEntrance). Sur le DESSIN, pas la boite.
func drop_in(rank: int = 0) -> void:
	UiEntrance.play(_plate, UiEntrance.FROM_TOP, rank)
