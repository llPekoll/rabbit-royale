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
##   • LE RESERVOIR SOUS LA PILE, en encre SOMBRE (« plus fonce ») : une
##     lecture SUR le bois, pas une valeur allumee au-dessus — le chiffre
##     possede la creme, et un second nombre pale se lirait comme deux totaux
##     de meme poids. Hors du flux, centre sur le CHIFFRE et non sur le bois
##     (« centre le au milieu du 258 »), a 21 du bas (« un peu plus haut »,
##     puis « un peu plus bas »). La lecture seule, sans le plein (« vire le
##     300 ») : l'anneau dessine deja la fraction.
##   • LA LIGNE DU CLASSEMENT N'EST PLUS DESSINEE. Son code est encore dans
##     le fichier web mais plus dans son rendu ; le rang vit sur le trophee
##     du rail (« #59 »). `set_rank` garde donc les nombres pour qui les
##     demande, et ne peint rien.
##   • LES COFFRES SOUS LA PILE, sur l'ile seulement (« met une icone de chest
##     juste en dessous du nombre de carrote ») ; le butin porte (« +18 » avec
##     sa carotte, « c'est quoi le plus 18 je comprends pas ») en puce de
##     verre a droite de la plaque.
##   • LE REFUS SECOUE : -6, 5, -3, 0 en 360 ms, sur le DESSIN et non la
##     boite — c'est la barre qui pose la pastille, et une secousse qui ecrit
##     dans `position` se bat avec elle.

## Un tap sur l'anneau ouvre le panneau d'energie ; un tap sur le chiffre
## ouvre la boutique (« the [+] is where you go when the number beside it is
## too small for what you wanted to buy »).
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
## La ligne du reservoir : 11 px, l'eclair a 11 de haut, a 21 du bas.
const ENERGY_FONT := 11
const ENERGY_BOLT_H := 11.0
const ENERGY_BOTTOM := 21.0
## La ligne des coffres : le sprite du coffre (23x14) a 26 de large, 6 sous
## la pile.
const CHEST_W := 26.0
const CHEST_GAP := 6.0
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
var _chest_line: HBoxContainer
var _chest_figure: Label
var _energy_line: HBoxContainer
var _energy_figure: Label
var _carry: PanelContainer
var _carry_figure: Label
var _add: Button

var _stock := -1
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

	_chest_line = Kit.hbox(4.0)
	_chest_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_chest_line.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_chest_line.visible = false
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
	_stack.add_child(_chest_line)

	# LE RESERVOIR, hors du flux, sous le chiffre.
	_energy_line = Kit.hbox(2.0)
	_energy_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_energy_figure = Kit.label("0", ENERGY_FONT, Palette.INK)
	_energy_figure.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_energy_line.add_child(_energy_figure)
	var bolt := Kit.icon(Kit.ICONS["bolt"], ENERGY_BOLT_H)
	bolt.material = Stencil.material(Palette.INK)
	bolt.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_energy_line.add_child(bolt)
	_energy_line.visible = false
	_plate.add_child(_energy_line)

	# LE BUTIN PORTE : une puce de verre a droite de la plaque, « +18 » et
	# sa carotte.
	_carry = Kit.panel(Kit.style_glass())
	_carry.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var carry_row := Kit.hbox(3.0)
	carry_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_carry_figure = Kit.label("+0", Kit.pixel_size(1.5), Palette.CARROT)
	_carry_figure.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	carry_row.add_child(_carry_figure)
	var mark := Kit.icon(Kit.ICONS["carrot"], MARK)
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	carry_row.add_child(mark)
	_carry.add_child(carry_row)
	_carry.visible = false
	_plate.add_child(_carry)

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
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())


## LA MISE EN PAGE, dans les mesures de l'art (energy-dial.tsx) : la pile
## est le bois propre, de `inset` sur `room` ; la ligne du reservoir est
## centree sur la pile, a 21 du bas ; le butin pend a droite de la plaque.
func _place() -> void:
	var k := dial.scale_factor()
	var x := dial.inset()
	var w := dial.room()
	_stack.position = Vector2(x, 0.0)
	_stack.size = Vector2(w, size.y)
	_add.position = _stack.position
	_add.size = _stack.size
	_fit_figure()
	_energy_line.reset_size()
	var ew := _energy_line.get_combined_minimum_size()
	_energy_line.size = ew
	_energy_line.position = Vector2(round(x + w * 0.5 - ew.x * 0.5), round(size.y - ENERGY_BOTTOM * k - ew.y))
	_carry.reset_size()
	var cw := _carry.get_combined_minimum_size()
	_carry.size = cw
	_carry.position = Vector2(size.x + 8.0, round((size.y - cw.y) * 0.5))


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
func refresh() -> void:
	var stock := int(Home.burrow.get("stock", 0))
	if stock != _stock:
		_stock = stock
		_figure.text = I18N.group_digits(stock)
		_fit_figure()
	tooltip_text = I18N.f("pill.banked", [stock])
	# LE RESERVOIR N'EXISTE QUE SUR LE TERRIER : ailleurs `bank` est null,
	# et un cadran a zero avec une alarme serait le chrome inventant une
	# urgence sur un ecran qui n'a pas d'energie a depenser.
	_has_bank = Screens.place == Screens.Place.BURROW and not Home.burrow.is_empty()
	dial.hub = _has_bank
	dial.beat = _has_bank
	dial.tappable = _has_bank
	_energy_line.visible = _has_bank
	_tick_energy()


func _process(_delta: float) -> void:
	_tick_energy()


## L'ENERGIE MAINTENANT, relue a chaque image (Home.live_energy) : ce que
## le serveur a dit plus ce qui est remonte depuis.
func _tick_energy() -> void:
	if not _has_bank:
		dial.value = 0.0
		return
	var live := Home.live_energy()
	var energy := int(live.get("energy", 0))
	var max_energy := int(live.get("max", 1))
	dial.max_value = float(max_energy)
	dial.value = float(energy)
	if energy != _energy_shown:
		_energy_shown = energy
		_energy_figure.text = I18N.group_digits(energy)
		_energy_line.tooltip_text = I18N.f("loop.energyOf", [energy, max_energy])
		_energy_line.reset_size()
		var ew := _energy_line.get_combined_minimum_size()
		_energy_line.size = ew
		_energy_line.position.x = round(dial.inset() + dial.room() * 0.5 - ew.x * 0.5)


## LE RANG ET L'ECART, tels que le tableau les donne (`me`). Gardes pour
## qui les demande ; le web ne les peint plus sur la pastille.
func set_rank(rank: int, to_pass: int = -1) -> void:
	_rank = rank
	_to_pass = to_pass


func rank() -> int:
	return _rank


func to_pass() -> int:
	return _to_pass


## LA COURSE : le butin porte et les coffres de l'ile. `chests` est
## {taken, total, warnStage} ou vide hors course ; `carrying` 0 cache la puce.
func set_run(carrying: int, chests: Dictionary = {}) -> void:
	_carry.visible = carrying > 0
	if carrying > 0:
		_carry_figure.text = "+" + I18N.group_digits(carrying)
		_carry.tooltip_text = I18N.t("pill.carryNote")
		# Chaque creusement fait sauter la puce (re-keyed per gain).
		_carry.pivot_offset = _carry.size * 0.5
		_carry.scale = Vector2(0.7, 0.7)
		create_tween().tween_property(_carry, "scale", Vector2.ONE, 0.2).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	_chest_line.visible = not chests.is_empty()
	if not chests.is_empty():
		var taken := int(chests.get("taken", 0))
		var total := int(chests.get("total", 0))
		_chest_figure.text = "%d/%d" % [taken, total]
		_chest_line.tooltip_text = I18N.t("run.chestsTitle")
		# Passe zero, le compte devient rouge : a ce point le compte EST
		# l'avertissement, dit precisement.
		var warn := int(chests.get("warnStage", 0)) > 0
		_chest_figure.add_theme_color_override("font_color", Palette.DANGER if warn else Palette.PILL_INK)
		_stack.add_theme_constant_override("separation", int(CHEST_GAP))
	else:
		_stack.add_theme_constant_override("separation", 0)
	_place()


## DES CAROTTES ARRIVENT : la rafale derriere le chiffre, et le chiffre
## sursaute (rr-banked).
func _on_burst(amount: int) -> void:
	burst.position = Vector2(dial.inset() + dial.room() * 0.5, size.y * 0.5)
	burst.fire(amount)
	_figure.pivot_offset = _figure.size * 0.5
	var pop := create_tween()
	pop.tween_property(_figure, "scale", Vector2.ONE * BANK_POP, BANK_SECONDS * 0.35).set_ease(Tween.EASE_OUT)
	pop.tween_property(_figure, "scale", Vector2.ONE, BANK_SECONDS * 0.65).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)


## LE REFUS : la pastille secoue et son bord rougit — le nombre qui a dit
## non, le disant.
func deny() -> void:
	var shake := create_tween()
	for dx in [-6.0, 5.0, -3.0, 0.0]:
		shake.tween_property(_plate, "position:x", dx, 0.09).set_ease(Tween.EASE_OUT)
	var flush := create_tween()
	flush.tween_property(_plate, "modulate", Color(1.0, 0.72, 0.66), 0.12)
	flush.tween_property(_plate, "modulate", Color.WHITE, 0.24)


## L'ARRIVEE (rr-toon-in-down) : la plaque tombe du haut et rebondit en
## place, en 380 ms. Sur le DESSIN, pas la boite.
func drop_in(delay: float = 0.0) -> void:
	_plate.position.y = -16.0
	_plate.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_interval(delay)
	tw.set_parallel(true)
	tw.tween_property(_plate, "position:y", 0.0, 0.38).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tw.tween_property(_plate, "modulate:a", 1.0, 0.2)
