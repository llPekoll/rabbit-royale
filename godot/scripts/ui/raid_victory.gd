class_name RaidVictory
extends Control
## LA CEREMONIE DU RAID — le plein ecran que le raider recoit pour avoir
## atteint la case rouge du defenseur et etre ressorti avec ses carottes.
##
## Porte de src/components/raid-victory.tsx. Atteindre cette case EST le
## raid ; il se resolvait comme un formulaire — le plateau s'arretait, un
## chiffre changeait, le joueur etait rendu a son terrier. L'arcade avait
## deja la bonne reponse : le coffre du kit leve un soleil qui tourne, un
## blanc total, et la lumiere qui se retire sur le prix, precisement parce
## qu'une victoire rare merite plus qu'une note de bas de page.
##
## POURQUOI SA PROPRE SCENE, ET PAS LE COFFRE DU KIT : les rayons du kit sont
## la couleur d'une RARETE, et un raid n'a pas de tirage — il a reussi.
## Ce qu'il porte a la place, c'est LA MER : les bleus du RR pris sur la roue
## de couleurs de la borne, l'eau de l'ile relue au joueur.
##
## La choregraphie est portee, la couleur est la notre :
##   1. BURST  — un disque blanc explose du centre. Rien a deballer, donc
##               pas de coffre a faire trembler d'abord.
##   2. HOLD   — blanc total.
##   3. DRAIN  — la lumiere est aspiree vers le milieu et le lapin monte
##               dessous, en plein saut sur sa rangee heureuse : le meme
##               sprite que le joueur vient de regarder traverser le plateau.
##   4. SHOWN  — RAID WON! claque, les confettis tombent deja, la planche
##               monte. Un tap n'importe ou (ou Echap) congedie.
##
## Le plateau est intact dessous, et congedier y ramene — c'est RaidState
## qui, sur `dismissed`, fait le DELETE et rentre.

## Tape, Echap, ou la planche : la scene a fini son travail.
signal dismissed

## Les encres de la scene (raid-victory.tsx) : l'encre de l'ocean, la carotte
## et son ombre, le blanc du pelage, et LA MER — l'accent, ce que le tampon
## et la ligne des pieges portent.
const OCEAN_INK := Color("#0a2a3a")
const CARROT_ORANGE := Color("#ff8c2e")
const CARROT_DEEP := Color("#9c4a0c")
const FLUFF := Color("#f6f7f2")
const SEA := Color("#46b8d8")
const BACKDROP := Color(5.0 / 255.0, 18.0 / 255.0, 26.0 / 255.0, 0.94)
## Les trois arrets des rayons, cycles autour du soleil : le cyan de mer
## ombre, le cyan de mer, l'eau plus profonde entre eux — la roue de la
## borne, pour que la scene et le decor de l'arcade soient LE MEME bleu.
const RAY_PALETTE := [Color("#2e98c0"), Color("#46b8d8"), Color("#1d6a92")]
const RAYS := 36
## Le fondu radial des rayons : opaque au centre, rien au bord.
const RAY_STOPS := [0.0, 0.35, 0.7, 1.0]
const RAY_ALPHA := [1.0, 0.85, 0.3, 0.0]
## La couleur du papier : la palette du jeu en chips plats.
const CONFETTI_COLORS := [Color("#ff8c2e"), Color("#46b8d8"), Color("#6ec43c"), Color("#f5c518"), Color("#f6f7f2"), Color("#c98cff")]
const CONFETTI_COUNT := 64

## Les temps de la ceremonie, en secondes.
const BURST := 0.23
const HOLD := 0.11
const DRAIN := 0.62
const STAMP_DELAY := 0.38

## La rangee heureuse (BUNNY_ANIM_DEFS, la meme que home_rabbit.gd) : les
## images 40-47 a 10 i/s, celle que le plateau joue quand un raid est gagne.
const HAPPY_FROM := 40
const HAPPY_TO := 47
const HAPPY_FPS := 10.0
const SHEET_COLS := 8
const FRAME := 32

## Le lapin en multiples ENTIERS de sa frame — la seule regle que cet art ne
## peut pas plier. Le web dit 6x ; sur les 400 pixels de reference du Seeker
## la colonne (lapin, butin, planche) ne tient pas a 6, donc l'echelle suit
## la hauteur, entre 3 et 6.
const RABBIT_MAX_SCALE := 6
const RABBIT_MIN_SCALE := 3
const RABBIT_SHARE := 0.32

## Ce que le web ecrit en dur, hors dictionnaire (raid-victory.tsx) :
## repris tel quel, pas invente en quatre langues.
const WEB_TAP := "TAP TO CONTINUE"

## `defender`, `carrots`, `avatar`, `trapsSprung`, `refunded`.
var outcome: Dictionary = {}

var _shown := false
var _backdrop: ColorRect
var _rays: Rays
var _flash: TextureRect
var _glow: TextureRect
var _centre: CenterContainer
var _item: Control
var _spoils: VBoxContainer
var _stamp: Label
var _rabbit: TextureRect
var _rabbit_slot: Control
var _shadow: Shadow
var _button_slot: Control
var _button: PlankButton
var _caption: Label
var _confetti: Confetti
var _haul_count: Label
var _looted_from: Label
var _steps_back: Label
var _traps: Label
var _frame := HAPPY_FROM
var _frame_clock := 0.0
var _rabbit_px := FRAME * RABBIT_MIN_SCALE


## POSER LA SCENE sur l'etage des tampons du chrome. Sans chrome (un banc),
## la scene est rendue et l'appelant la pose lui-meme.
static func show(state: Dictionary) -> RaidVictory:
	var stage := RaidVictory.new()
	stage.outcome = state
	if Chrome.current != null:
		Chrome.current.stamp(stage)
	return stage


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	var box := size if size.y > 0.0 else get_viewport_rect().size
	_rabbit_px = FRAME * clampi(int(box.y * RABBIT_SHARE / FRAME), RABBIT_MIN_SCALE, RABBIT_MAX_SCALE)
	_build()
	resized.connect(_measure)
	_measure()
	I18N.locale_changed.connect(_on_locale_changed)
	gui_input.connect(_on_gui_input)
	_run()


func _build() -> void:
	_backdrop = ColorRect.new()
	_backdrop.color = BACKDROP
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(Kit.fill(_backdrop))
	# `rr-victory-backdrop-in`, 260 ms.
	_backdrop.modulate.a = 0.0
	create_tween().tween_property(_backdrop, "modulate:a", 1.0, 0.26)

	# Le soleil, sur sa propre couche pour que sa pulsation ne touche jamais
	# l'art.
	_rays = Rays.new()
	_rays.modulate.a = 0.85
	add_child(_rays)

	# La lueur derriere le lapin, pendant que la lumiere se retire.
	_glow = TextureRect.new()
	_glow.texture = _radial([0.0, 0.18, 0.38, 0.62], [Color(SEA, 0.667), Color(SEA, 0.667), Color(SEA, 0.2), Color(SEA, 0.0)])
	_glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glow.visible = false
	add_child(_glow)

	# La colonne du prix : le lapin, le butin, la planche.
	_centre = CenterContainer.new()
	_centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(Kit.fill(_centre))
	var column := Kit.vbox(22)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	_centre.add_child(column)

	_item = Control.new()
	_item.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_item)
	_spoils = Kit.vbox(14)
	_spoils.alignment = BoxContainer.ALIGNMENT_CENTER
	_item.add_child(_spoils)
	_build_spoils()
	var spoils_size := _spoils.get_combined_minimum_size()
	_item.custom_minimum_size = spoils_size
	_spoils.size = spoils_size
	_item.visible = false

	# Le tampon, juste au-dessus des oreilles : pose SUR le sprite il cache
	# le visage que tout le battement designe ; flottant loin au-dessus il se
	# lit comme un titre de page. -46 est l'entre-deux.
	_stamp = Kit.title(I18N.t("raid.won"), 36, Palette.GOLD)
	_stamp.add_theme_color_override("font_outline_color", OCEAN_INK)
	_stamp.add_theme_constant_override("outline_size", 6)
	_stamp.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_stamp.add_theme_constant_override("shadow_offset_y", 4)
	_stamp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stamp.visible = false
	_item.add_child(_stamp)

	_button = Kit.button(I18N.shout(I18N.t("raid.backToBurrow")), "gold", 280, 44)
	_button.pressed.connect(_done)
	_button_slot = Control.new()
	_button_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_button_slot.custom_minimum_size = Vector2(280, 44)
	_button_slot.add_child(_button)
	_button_slot.visible = false
	column.add_child(_button_slot)

	# Le papier, par-dessus tout, qui n'intercepte jamais un tap.
	_confetti = Confetti.new()
	_confetti.visible = false
	add_child(Kit.fill(_confetti))

	# L'eclair : UN element sur ses trois battements — il jaillit du centre,
	# tient plein ecran, puis se retire. Un seul noeud, pour qu'il ne
	# recommence pas son expansion a chaque phase.
	_flash = TextureRect.new()
	_flash.texture = _radial([0.0, 0.4, 0.7, 0.995, 1.0], [Color.WHITE, Color.WHITE, Color("#eafaff"), Color("#d6f2ff"), Color("#d6f2ff", 0.0)])
	_flash.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.scale = Vector2.ZERO
	add_child(_flash)

	_caption = Kit.label(WEB_TAP, 12, Color("#fef3c7"))
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption.visible = false
	add_child(_caption)


## Le lapin, le butin, et qui l'a paye (raid-victory.tsx `Spoils`).
func _build_spoils() -> void:
	# Le lapin dans sa case, avec l'ombre qui reste au sol pendant qu'il la
	# quitte — c'est elle qui vend le saut : un sprite qui monte seul flotte.
	_rabbit_slot = Control.new()
	_rabbit_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rabbit_slot.custom_minimum_size = Vector2(_rabbit_px, _rabbit_px + 4 + 9)
	_spoils.add_child(_rabbit_slot)
	_rabbit = TextureRect.new()
	_rabbit.texture = _frame_texture()
	_rabbit.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_rabbit.stretch_mode = TextureRect.STRETCH_SCALE
	_rabbit.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_rabbit.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rabbit.size = Vector2(_rabbit_px, _rabbit_px)
	_rabbit_slot.add_child(_rabbit)
	_shadow = Shadow.new()
	_shadow.size = Vector2(_rabbit_px * 0.34, 9)
	_shadow.position = Vector2((_rabbit_px - _shadow.size.x) * 0.5, _rabbit_px + 4)
	_rabbit_slot.add_child(_shadow)

	var haul := Kit.hbox(Kit.PAD)
	haul.alignment = BoxContainer.ALIGNMENT_CENTER
	haul.add_child(Kit.icon(Kit.ICONS["carrot"], 32))
	# Le compte est CAROTTE : c'est la recompense, et la couleur est la
	# moitie de ce qui le dit.
	_haul_count = Kit.label("", 32, CARROT_ORANGE)
	_haul_count.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	_haul_count.add_theme_constant_override("shadow_offset_y", 4)
	haul.add_child(_haul_count)
	_spoils.add_child(haul)

	_looted_from = Kit.label("", 13, FLUFF)
	_looted_from.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_spoils.add_child(_looted_from)
	_steps_back = Kit.label("", 13, FLUFF)
	_steps_back.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_spoils.add_child(_steps_back)
	_traps = Kit.label("", 11, SEA)
	_traps.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_spoils.add_child(_traps)
	_relabel()


## Les mots, dans la langue affichee.
func _relabel() -> void:
	var carrots := int(outcome.get("carrots", 0))
	var who := _display_name(String(outcome.get("defender", "")))
	var haul: Control = _haul_count.get_parent()
	# UN TERRIER VIDE compte quand meme comme une victoire : « +0 pris chez
	# Thistle » se lit comme un bug, et pire, comme si la traversee avait
	# echoue. Le joueur a gagne et le placard etait vide, donc on le dit.
	haul.visible = carrots > 0
	_haul_count.text = "+%s" % I18N.group_digits(carrots)
	_looted_from.text = I18N.f("raid.lootedFrom", [who]) if carrots > 0 else I18N.f("raid.wasEmpty", [who])
	# LA MARCHE REVIENT : atteindre le champ rend les pas a la jauge, et la
	# ceremonie est la ou le joueur l'apprend. Muet sur un raid qui a pris le
	# long chemin pour rien.
	var refunded := int(outcome.get("refunded", 0))
	_steps_back.visible = refunded > 0
	_steps_back.text = I18N.f("raid.stepsBack", [I18N.group_digits(refunded)])
	var sprung := int(outcome.get("trapsSprung", 0))
	_traps.visible = sprung > 0
	_traps.text = I18N.f("raid.trapsSprung", [sprung])
	if _stamp != null:
		_stamp.text = I18N.shout(I18N.t("raid.won"))
	if _button != null:
		_button.relabel(I18N.shout(I18N.t("raid.backToBurrow")))


func _on_locale_changed(_code: String) -> void:
	_relabel()
	var spoils_size := _spoils.get_combined_minimum_size()
	_item.custom_minimum_size = spoils_size
	_spoils.size = spoils_size
	_place_stamp()


## Le nom du defenseur tel que cet ecran sait le dessiner. NETTOYE SEULEMENT
## SUR LA FACE PIXEL : elle couvre l'ASCII imprimable, donc tout le reste
## sortirait en blancs ; dans les trois autres langues, retirer les
## non-ASCII effacerait le nom entier d'un joueur chinois et le remplacerait
## par « UN RIVAL » — sur l'ecran de victoire de celui qui vient de le
## piller. Les 20 signes tiennent dans les deux cas : c'est la largeur de
## la ligne, pas l'atlas.
func _display_name(name: String) -> String:
	var cleaned := name
	if I18N.pixel_face():
		var kept := ""
		for ch in name.to_upper():
			var code := ch.unicode_at(0)
			if code >= 32 and code <= 126:
				kept += ch
		cleaned = kept
	cleaned = cleaned.strip_edges().left(20)
	return cleaned if not cleaned.is_empty() else I18N.t("raid.aRival")


func _measure() -> void:
	var vmax := maxf(size.x, size.y)
	var vmin := minf(size.x, size.y)
	var centre := size * 0.5
	# 200vmax de rayons, 250vmax d'eclair, 120vmin de lueur — tous centres.
	_rays.size = Vector2(2.0 * vmax, 2.0 * vmax)
	_rays.position = centre - _rays.size * 0.5
	_rays.pivot_offset = _rays.size * 0.5
	_flash.size = Vector2(2.5 * vmax, 2.5 * vmax)
	_flash.position = centre - _flash.size * 0.5
	_flash.pivot_offset = _flash.size * 0.5
	_glow.size = Vector2(1.2 * vmin, 1.2 * vmin)
	_glow.position = centre - _glow.size * 0.5
	_caption.size = Vector2(size.x, 20)
	_caption.position = Vector2(0, size.y - Kit.EDGE - 20)
	_place_stamp()


func _place_stamp() -> void:
	var w := _stamp.get_combined_minimum_size()
	_stamp.size = w
	_stamp.position = Vector2((_item.custom_minimum_size.x - w.x) * 0.5, -46.0 - w.y * 0.5)
	_stamp.pivot_offset = w * 0.5


# ── La chaine ────────────────────────────────────────────────────────────────

## Chaque battement programme le suivant.
func _run() -> void:
	# 1. BURST : le disque jaillit (`rr-victory-flash-in`).
	var burst := create_tween()
	burst.tween_property(_flash, "scale", Vector2.ONE, BURST).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	await get_tree().create_timer(BURST).timeout
	if not is_inside_tree():
		return
	# 2. HOLD : blanc total.
	await get_tree().create_timer(HOLD).timeout
	if not is_inside_tree():
		return
	# 3. DRAIN : la lumiere est aspiree (`rr-victory-flash-suck`, lent, lent,
	# puis d'un coup), le prix monte dessous (`rr-victory-item`), la lueur
	# s'eteint, les rayons pulsent une fois, le papier tombe.
	var suck := create_tween()
	suck.tween_property(_flash, "scale", Vector2(0.32, 0.32), DRAIN * 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	suck.parallel().tween_property(_flash, "modulate:a", 0.95, DRAIN * 0.55)
	suck.tween_property(_flash, "scale", Vector2.ZERO, DRAIN * 0.45).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	suck.parallel().tween_property(_flash, "modulate:a", 0.35, DRAIN * 0.45)
	suck.tween_callback(_flash.hide)

	_glow.visible = true
	_glow.modulate.a = 1.0
	create_tween().tween_property(_glow, "modulate:a", 0.0, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	var pulse := create_tween()
	pulse.tween_property(_rays, "modulate", Color(1.8, 1.8, 1.8, 0.85), 0.27)
	pulse.tween_property(_rays, "modulate", Color(1.0, 1.0, 1.0, 0.85), 0.63)

	_item.visible = true
	_item.pivot_offset = _item.custom_minimum_size * 0.5
	_item.scale = Vector2(0.55, 0.55)
	_item.modulate.a = 0.0
	var rise := create_tween()
	rise.tween_interval(0.12)
	rise.tween_property(_item, "scale", Vector2(1.06, 1.06), DRAIN * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	rise.parallel().tween_property(_item, "modulate:a", 1.0, DRAIN * 0.6)
	rise.tween_property(_item, "scale", Vector2.ONE, DRAIN * 0.4)
	_confetti.visible = true
	_hop()

	await get_tree().create_timer(DRAIN).timeout
	if not is_inside_tree():
		return
	# 4. SHOWN : le tampon claque, la planche et la legende montent.
	_shown = true
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_stamp.visible = true
	_stamp.modulate.a = 0.0
	_stamp.scale = Vector2(2.6, 2.6)
	_stamp.rotation = deg_to_rad(-8.0)
	var stamp := create_tween()
	stamp.tween_interval(STAMP_DELAY)
	stamp.tween_property(_stamp, "modulate:a", 1.0, 0.52 * 0.6)
	stamp.parallel().tween_property(_stamp, "scale", Vector2(0.94, 0.94), 0.52 * 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	stamp.parallel().tween_property(_stamp, "rotation", deg_to_rad(2.0), 0.52 * 0.6)
	stamp.tween_property(_stamp, "scale", Vector2(1.04, 1.04), 0.52 * 0.2)
	stamp.parallel().tween_property(_stamp, "rotation", deg_to_rad(-1.0), 0.52 * 0.2)
	stamp.tween_property(_stamp, "scale", Vector2.ONE, 0.52 * 0.2)
	stamp.parallel().tween_property(_stamp, "rotation", 0.0, 0.52 * 0.2)

	_rise_in(_button_slot, _button, STAMP_DELAY + 0.26)
	_rise_in(_caption, _caption, STAMP_DELAY + 0.5)
	# `rr-victory-blink` : 1,1 s, en deux marches.
	var blink := create_tween().set_loops()
	blink.tween_interval(0.55)
	blink.tween_callback(func() -> void: _caption.modulate.a = 0.35)
	blink.tween_interval(0.55)
	blink.tween_callback(func() -> void: _caption.modulate.a = 1.0)


## `rr-victory-rise` : 14 px plus bas et invisible, puis a sa place.
func _rise_in(slot: Control, node: Control, delay: float) -> void:
	slot.visible = true
	node.modulate.a = 0.0
	var from := node.position.y
	node.position.y = from + 14.0
	var t := create_tween()
	t.tween_interval(delay)
	t.tween_property(node, "position:y", from, 0.36).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(node, "modulate:a", 1.0, 0.36)


## LE SAUT : une periode de rangee par bond, pour que le lapin soit en haut
## de son arc au milieu de la joie et retombe quand la rangee reprend. Un
## temps au sol, pour que ca se lise comme sauter et non comme flotter.
func _hop() -> void:
	var period := (HAPPY_TO - HAPPY_FROM + 1) / HAPPY_FPS
	var lift := -float(_rabbit_px) / FRAME * 7.0
	var hop := create_tween().set_loops()
	hop.tween_property(_rabbit, "position:y", lift, period * 0.42).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	hop.tween_property(_rabbit, "position:y", 0.0, period * 0.34).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	hop.tween_interval(period * 0.24)


func _process(delta: float) -> void:
	if _rays != null:
		# `rr-victory-rays-spin` : un tour en 60 s.
		_rays.rotation += delta * TAU / 60.0
	if _item != null and _item.visible:
		_frame_clock += delta
		if _frame_clock >= 1.0 / HAPPY_FPS:
			_frame_clock -= 1.0 / HAPPY_FPS
			_frame = HAPPY_FROM if _frame >= HAPPY_TO else _frame + 1
			_rabbit.texture = _frame_texture()


## Une image de la planche du lapin choisi (Kit.AVATARS ; le brun a defaut).
func _frame_texture() -> AtlasTexture:
	var key := String(outcome.get("avatar", ""))
	var sheet: Texture2D = Kit.AVATARS.get(key, Kit.AVATARS["brown"])
	var atlas := AtlasTexture.new()
	atlas.atlas = sheet
	atlas.region = Rect2((_frame % SHEET_COLS) * FRAME, floori(_frame / float(SHEET_COLS)) * FRAME, FRAME, FRAME)
	return atlas


func _radial(offsets: Array, colors: Array) -> GradientTexture2D:
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array(offsets)
	ramp.colors = PackedColorArray(colors)
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 256
	tex.height = 256
	return tex


# ── Congedier ────────────────────────────────────────────────────────────────

## Un tap n'importe ou, une fois qu'il y a quelque chose a traverser. Le
## clic est toujours avale : la scene peut etre levee dans le voile
## tap-pour-fermer de quelqu'un d'autre, et l'ecran dessous ne doit pas se
## fermer d'abord.
func _on_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		accept_event()
		if _shown:
			_done()


func _unhandled_input(event: InputEvent) -> void:
	if not _shown:
		return
	if event.is_action_pressed("ui_cancel") or event.is_action_pressed("ui_accept"):
		get_viewport().set_input_as_handled()
		_done()


func _done() -> void:
	if not _shown:
		return
	_shown = false
	dismissed.emit()
	queue_free()


# ── Les pieces dessinees ─────────────────────────────────────────────────────

## LE SOLEIL : N coins de tarte des trois bleus, fondus vers rien au bord.
## Peint UNE fois — la palette ne change pas ici, un raid n'a pas de tirage
## a reveler — et tourne par `rotation`.
class Rays:
	extends Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		var radius := size.x * 0.5
		var wedge := TAU / RaidVictory.RAYS
		for i in RaidVictory.RAYS:
			var tint: Color = RaidVictory.RAY_PALETTE[i % RaidVictory.RAY_PALETTE.size()]
			var a0 := i * wedge
			# Chaque coin deborde sur son voisin : c'est ce qui evite qu'une
			# couture de fond se voie entre eux.
			var a1 := a0 + wedge * 1.12
			var d0 := Vector2(cos(a0), sin(a0))
			var d1 := Vector2(cos(a1), sin(a1))
			for ring in RaidVictory.RAY_STOPS.size() - 1:
				var r0: float = RaidVictory.RAY_STOPS[ring] * radius
				var r1: float = RaidVictory.RAY_STOPS[ring + 1] * radius
				var in_tint := Color(tint, RaidVictory.RAY_ALPHA[ring])
				var out_tint := Color(tint, RaidVictory.RAY_ALPHA[ring + 1])
				var points: PackedVector2Array
				var colors: PackedColorArray
				if r0 <= 0.0:
					points = PackedVector2Array([c, c + d0 * r1, c + d1 * r1])
					colors = PackedColorArray([in_tint, out_tint, out_tint])
				else:
					points = PackedVector2Array([c + d0 * r0, c + d0 * r1, c + d1 * r1, c + d1 * r0])
					colors = PackedColorArray([in_tint, out_tint, out_tint, in_tint])
				draw_polygon(points, colors)


## LE SOL que le lapin quitte et retrouve : une ellipse sombre, un peu
## floue, assez large pour se lire a 6x.
class Shadow:
	extends Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		for i in 3:
			var k := 1.0 + i * 0.18
			draw_set_transform(c, 0.0, Vector2(size.x * 0.5 * k, size.y * 0.5 * k))
			draw_circle(Vector2.ZERO, 1.0, Color(0, 0, 0, 0.22))


## DU PAPIER QUI TOMBE sur toute la scene : des chips plats dans la palette
## du jeu, chacun sur sa voie, sa vitesse, sa rotation, sa derive. UNE PIECE
## SUR QUATRE EST DU BUTIN — une carotte — parce qu'un raid est un casse, et
## le papier seul disait fete. Chaque chip est sur sa propre horloge et
## commence a mi-chute : le champ ne pleut pas depuis une ligne nette en haut.
class Confetti:
	extends Control

	const CARROT := preload("res://assets/ui/icons/carrot.webp")

	var _x: PackedFloat32Array
	var _y: PackedFloat32Array
	var _speed: PackedFloat32Array
	var _drift: PackedFloat32Array
	var _rot: PackedFloat32Array
	var _spin: PackedFloat32Array
	var _w: PackedFloat32Array
	var _h: PackedFloat32Array
	var _tint: PackedColorArray
	var _loot: Array[bool] = []
	var _seeded := false

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _seed() -> void:
		_seeded = true
		var n := RaidVictory.CONFETTI_COUNT
		_x.resize(n)
		_y.resize(n)
		_speed.resize(n)
		_drift.resize(n)
		_rot.resize(n)
		_spin.resize(n)
		_w.resize(n)
		_h.resize(n)
		_tint.resize(n)
		_loot.resize(n)
		for i in n:
			var loot := i % 4 == 0
			var s := randf_range(5.0, 11.0)
			_loot[i] = loot
			_w[i] = (randf_range(2.0, 3.0) * 8.0) if loot else s
			_h[i] = _w[i] if loot else (s * 2.0 if randf() < 0.35 else s)
			_tint[i] = RaidVictory.CONFETTI_COLORS[i % RaidVictory.CONFETTI_COLORS.size()]
			var fall := randf_range(2.4, 4.6)
			_speed[i] = size.y * 1.16 / fall
			_drift[i] = randf_range(-90.0, 90.0) / fall
			_spin[i] = deg_to_rad(randf_range(180.0, 900.0)) / fall * (-1.0 if randf() < 0.5 else 1.0)
			_x[i] = randf_range(0.0, size.x)
			_y[i] = randf_range(-0.08 * size.y, size.y * 1.08)
			_rot[i] = 0.0

	func _process(delta: float) -> void:
		if not visible:
			return
		if not _seeded and size.y > 0.0:
			_seed()
		for i in _x.size():
			_y[i] += _speed[i] * delta
			_x[i] += _drift[i] * delta
			_rot[i] += _spin[i] * delta
			if _y[i] > size.y * 1.08:
				# Une nouvelle voie a chaque tour, pour que le champ ne se
				# range jamais en colonnes visibles.
				_y[i] = -0.08 * size.y
				_x[i] = randf_range(0.0, size.x)
		queue_redraw()

	func _draw() -> void:
		for i in _x.size():
			draw_set_transform(Vector2(_x[i], _y[i]), _rot[i])
			var box := Rect2(-_w[i] * 0.5, -_h[i] * 0.5, _w[i], _h[i])
			if _loot[i]:
				draw_texture_rect(CARROT, box, false)
			else:
				draw_rect(box, _tint[i])
