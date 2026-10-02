class_name SoundCluster
extends Control
## LE SON : un carre au bout droit de la barre, et un panneau qui tombe
## dessous. Porte de src/components/sound-button.tsx, sauf sur un point :
##
##   • UN SEUL CARRE, LE HAUT-PARLEUR, ET IL OUVRE LE PANNEAU (Paul,
##     2026-09-23). Il y en avait deux — le haut-parleur coupait la musique
##     d'un tap, une fleche a cote ouvrait les reglages — et deux carres pour
##     le son pesaient autant dans la barre que la boutique. Couper la
##     musique coute maintenant deux taps, le premier rangee « Musique » du
##     panneau a portee du pouce ; le haut-parleur dit toujours si elle est
##     coupee.
##   • EN HAUT A DROITE, DANS LA RANGEE. Il a passe sa vie a tourner autour
##     des coins du bas ; c'est du chrome, comme la boutique et le tableau,
##     donc il est bati comme eux et epingle au bout droit de la barre. C'est
##     la seule piece de la rangee sur CHAQUE ecran, donc il possede le coin
##     et les autres s'alignent a sa gauche. Le panneau descend de lui.
##   • UN ENGRENAGE, PLUS UN HAUT-PARLEUR (2026-10-02) : le panneau porte
##     aussi le solo et la qualite, « l'icone du son ça va plus trop ». Le
##     muet ne se lit donc plus sur le bouton, seulement dans le panneau.
##     Le carre s'enfonce tant que le panneau est ouvert — l'enfoncement dit
##     « ce bouton a ouvert ceci », comme partout dans la barre.
##   • UN PANNEAU SANS AUTRE ISSUE QUE SON BOUTON EST UN PIEGE sur un ecran
##     tactile : un tap dehors le ferme, Echap aussi.
##   • C'EST AUSSI LE PANNEAU DES OPTIONS DE JEU (2026-10-02) : le seul
##     panneau de reglages du jeu, donc le SOLO s'y range sous le volume
##     (PlaySettings). Grise, avec une ligne qui dit pourquoi, pour qui tient
##     le Crown Race Ticket. Puis la QUALITE : BEAU (bloom, ombres, rais) ou
##     FLUIDE.
##   • DANS LA PEAU DES JEUX MOBILES (2026-10-02, « c'est tres moche,
##     regarde ce qu'il y a sur les autres jeux ») : un titre, deux sections
##     (SON, JEU), chaque reglage dans un cartouche brun avec son icone pixel,
##     de vrais interrupteurs a glissiere (PixelSwitch) et un selecteur a deux
##     cases pour la qualite (PixelSegment). Toute la rangee bascule au doigt :
##     le pouce n'a pas a viser les 66 px de l'interrupteur.

const PANEL_W := 360.0
const ROW_GAP := 6.0
const ICON_PX := 24.0
## La largeur de la glissiere et du selecteur : le cadre de feuilles prend
## 36 px de chaque cote, et a 150 il ne restait que 8 px au libelle.
const CONTROL_W := 130.0
const ICON_DIR := "res://assets/ui/icons/settings/"

var sound_button: HubIconButton

var _cluster: HBoxContainer
var _panel: Control
var _title: Label
var _heads: Array[Label] = []
var _music: PixelSwitch
var _effects: PixelSwitch
var _volume: HSlider
var _quality: PixelSegment
var _solo: PixelSwitch
var _solo_note: HBoxContainer
var _solo_note_text: Label
var _labels: Array[Label] = []
var _open := false


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	AudioSettings.restore()
	PlaySettings.restore()

	_cluster = Kit.hbox(Kit.PAD_TIGHT)
	_cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cluster)

	sound_button = HubIconButton.make("Sound settings", Kit.ICONS["gear"])  # la cle choisit l anneau : garder l ancien
	sound_button.pressed.connect(func() -> void: set_open(not _open))
	_cluster.add_child(sound_button)

	_build_panel()
	_cluster.resized.connect(_place)


func _ready() -> void:
	_relabel()
	_reflect()
	I18N.locale_changed.connect(func(_c: String) -> void: _relabel())
	PassState.shared().changed.connect(_reflect)
	_place()


## Le carre du bouton, comme le reste du rail.
func set_square(px: float, view_height: float) -> void:
	sound_button.set_square(px, view_height)
	_place()


func _build_panel() -> void:
	_panel = Control.new()
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.visible = false
	# Au-dessus du reste de la barre : a 360 de large, son coin passait sous
	# le bout de la planche des carottes.
	_panel.z_index = 5
	add_child(_panel)

	var frame := Kit.parchment()
	Kit.fill(frame)
	_panel.add_child(frame)
	var edge := frame.inset()
	var inset := Kit.margin(edge.x + Kit.PAD, minf(edge.y, Kit.LEAF_EDGE) + Kit.PAD, edge.z + Kit.PAD, edge.w + Kit.PAD)
	Kit.fill(inset)
	_panel.add_child(inset)
	var column := Kit.vbox(ROW_GAP)
	inset.add_child(column)
	var inner_w := PANEL_W - edge.x - edge.z - 2.0 * Kit.PAD

	_title = Kit.title("", Kit.pixel_size(2.0), Palette.INK)
	column.add_child(_title)

	# ── SON ──
	column.add_child(_head())
	_music = PixelSwitch.new()
	_music.toggled.connect(func(on: bool) -> void: AudioSettings.set_music_muted(not on))
	column.add_child(_card("note", _music))
	_effects = PixelSwitch.new()
	_effects.toggled.connect(func(on: bool) -> void: AudioSettings.set_sfx_muted(not on))
	column.add_child(_card("burst", _effects))
	_volume = _slider()
	_volume.value_changed.connect(func(v: float) -> void: AudioSettings.set_volume(v))
	column.add_child(_card("", _volume, Kit.ICONS["speaker-on"]))

	# ── JEU ──
	column.add_child(_head())
	_quality = PixelSegment.new(CONTROL_W)
	_quality.picked.connect(func(i: int) -> void: PlaySettings.set_pretty(i == 1))
	column.add_child(_card("sparkle", _quality))
	_solo = PixelSwitch.new()
	_solo.toggled.connect(func(on: bool) -> void: PlaySettings.set_solo(on))
	column.add_child(_card("rabbit", _solo))

	# Le ticket ferme le solo : la couronne et la raison, sous la rangee.
	_solo_note = Kit.hbox(Kit.PAD_TIGHT)
	var crown := Kit.icon(Kit.CROWN, 14.0)
	crown.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_solo_note.add_child(crown)
	_solo_note_text = Kit.label("", Kit.pixel_size(1.0), Palette.BARK)
	_solo_note_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	# Sans largeur, un libelle qui passe a la ligne annonce une lettre par
	# ligne, et le panneau descendait jusqu'au bas de l'ecran.
	_solo_note_text.custom_minimum_size.x = inner_w - 20.0
	_solo_note.add_child(_solo_note_text)
	_solo_note.visible = false
	column.add_child(_solo_note)

	_panel.custom_minimum_size = Vector2(PANEL_W, 0.0)
	_panel.size.x = PANEL_W


## Un intertitre de section : le mot a l'encre secondaire, puis un filet.
func _head() -> HBoxContainer:
	var row := Kit.hbox(Kit.PAD_TIGHT)
	var label := Kit.label("", Kit.pixel_size(1.0), Palette.BARK)
	label.uppercase = I18N.pixel_face()
	row.add_child(label)
	_heads.append(label)
	var rule := ColorRect.new()
	rule.color = Color(Palette.BARK, 0.35)
	rule.custom_minimum_size = Vector2(0.0, 2.0)
	rule.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rule.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(rule)
	row.add_theme_constant_override("separation", 8)
	return row


## UN CARTOUCHE : le creux brun des boutons de langue, son icone, son
## libelle creme, son controle a droite. Un interrupteur se bascule de toute
## la rangee.
func _card(icon_key: String, control: Control, tex: Texture2D = null) -> PanelContainer:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _card_style(false))
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var row := Kit.hbox(Kit.PAD)
	card.add_child(row)

	var icon := TextureRect.new()
	icon.texture = tex if tex != null else load(ICON_DIR + icon_key + ".png")
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(ICON_PX, ICON_PX)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.modulate = Palette.CREAM
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)

	var label := Kit.label("", Kit.pixel_size(1.25), Palette.CREAM, true)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	_labels.append(label)
	row.add_child(label)
	row.add_child(control)

	if control is PixelSwitch:
		var sw := control as PixelSwitch
		card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		card.gui_input.connect(func(e: InputEvent) -> void:
			if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
				sw.toggle(_words())
				card.accept_event())
	# Le survol (bureau) : le cerne passe a l'or, comme un onglet choisi.
	card.mouse_entered.connect(func() -> void: card.add_theme_stylebox_override("panel", _card_style(true)))
	card.mouse_exited.connect(func() -> void: card.add_theme_stylebox_override("panel", _card_style(false)))
	return card


func _card_style(hot: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.WELL_FACE
	s.set_border_width_all(2)
	s.border_color = Palette.TAB_ON_BOTTOM if hot else Palette.INK
	s.set_corner_radius_all(6)
	s.anti_aliasing = false
	s.shadow_color = Color(Palette.INK, 0.45)
	s.shadow_offset = Vector2(0, 3)
	s.shadow_size = 0
	s.content_margin_left = 10
	s.content_margin_right = 8
	s.content_margin_top = 7
	s.content_margin_bottom = 7
	return s


## LE VOLUME : une vraie glissiere (le glisser, les fleches, tout gratuit),
## gouttiere de terre cernee d'encre, remplie de carotte, bouton creme.
func _slider() -> HSlider:
	var v := HSlider.new()
	v.min_value = 0.0
	v.max_value = 1.0
	v.step = 0.05
	v.custom_minimum_size = Vector2(CONTROL_W, 24.0)
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var track := StyleBoxFlat.new()
	track.bg_color = Palette.TRACK_FACE
	track.set_border_width_all(2)
	track.border_color = Palette.INK
	track.set_corner_radius_all(6)
	track.anti_aliasing = false
	track.content_margin_top = 5
	track.content_margin_bottom = 5
	v.add_theme_stylebox_override("slider", track)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Palette.CARROT
	fill.set_border_width_all(2)
	fill.border_color = Palette.INK
	fill.set_corner_radius_all(6)
	fill.anti_aliasing = false
	fill.content_margin_top = 5
	fill.content_margin_bottom = 5
	v.add_theme_stylebox_override("grabber_area", fill)
	v.add_theme_stylebox_override("grabber_area_highlight", fill)
	var knob := _knob()
	v.add_theme_icon_override("grabber", knob)
	v.add_theme_icon_override("grabber_highlight", knob)
	v.add_theme_icon_override("grabber_disabled", knob)
	return v


## Le bouton de la glissiere : un pave creme cerne d'encre, son reflet et
## son biseau, comme celui de l'interrupteur.
func _knob() -> ImageTexture:
	var img := Image.create(16, 22, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	img.fill_rect(Rect2i(1, 0, 14, 22), Palette.INK)
	img.fill_rect(Rect2i(0, 1, 16, 20), Palette.INK)
	img.fill_rect(Rect2i(2, 2, 12, 18), Palette.CREAM)
	img.fill_rect(Rect2i(2, 15, 12, 5), Palette.WELL_LIP)
	img.fill_rect(Rect2i(4, 3, 8, 2), Color.WHITE)
	return ImageTexture.create_from_image(img)


func _words() -> Array:
	return [I18N.t("sound.on"), I18N.t("sound.off")]


func _relabel() -> void:
	_title.text = I18N.shout(I18N.t("sound.settings"))
	_title.uppercase = I18N.pixel_face()
	_heads[0].text = I18N.t("sound.group")
	_heads[1].text = I18N.t("sound.game")
	_labels[0].text = I18N.t("sound.music")
	_labels[1].text = I18N.t("sound.effects")
	_labels[2].text = I18N.t("sound.volume")
	_labels[3].text = I18N.t("sound.quality")
	_labels[4].text = I18N.t("sound.solo")
	_quality.set_words(I18N.t("sound.smooth"), I18N.t("sound.pretty"))
	_solo_note_text.text = I18N.t("sound.soloTicket")
	_reflect()


## L'etat dans chaque controle, sans animation : l'enfoncement du bouton
## tant que le panneau est ouvert, les interrupteurs, la glissiere, la
## qualite, et le solo ferme par le ticket.
func _reflect() -> void:
	sound_button.set_pressed_look(_open)
	sound_button.tooltip_text = I18N.t("sound.settings")
	var w := _words()
	_music.set_on(not AudioSettings.music_muted, w)
	_effects.set_on(not AudioSettings.sfx_muted, w)
	_volume.set_value_no_signal(AudioSettings.volume)
	_quality.set_index(1 if PlaySettings.pretty else 0)
	var locked := PlaySettings.solo_locked()
	_solo.disabled = locked
	_solo.set_on(PlaySettings.solo and not locked, w)
	if _solo_note.visible != locked:
		_solo_note.visible = locked
		_place()


func set_open(on: bool) -> void:
	_open = on
	_panel.visible = on
	_reflect()
	_place()
	if on:
		# L'OUVERTURE : le panneau sort de l'engrenage, un rien plus petit et
		# transparent, et se pose avec un rebond.
		_panel.pivot_offset = Vector2(_panel.size.x - 24.0, 0.0)
		_panel.scale = Vector2(0.92, 0.92)
		_panel.modulate.a = 0.0
		var t := _panel.create_tween().set_parallel(true)
		t.tween_property(_panel, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t.tween_property(_panel, "modulate:a", 1.0, 0.12)


func is_open() -> bool:
	return _open


## Le carre, et le panneau sous lui, aligne a droite pour grandir vers
## l'interieur de l'ecran.
func _place() -> void:
	_cluster.reset_size()
	var cs := _cluster.get_combined_minimum_size()
	_cluster.size = cs
	custom_minimum_size = cs
	size = cs
	_panel.reset_size()
	var ph := maxf(_panel.get_combined_minimum_size().y, _panel_height())
	_panel.size = Vector2(PANEL_W, ph)
	_panel.position = Vector2(cs.x - PANEL_W, cs.y + Kit.PAD_TIGHT)


func _panel_height() -> float:
	var frame := _panel.get_child(0) as NineSlice
	var edge := frame.inset()
	var column := (_panel.get_child(1) as MarginContainer).get_child(0) as Control
	return edge.y + edge.w + 2.0 * Kit.PAD + column.get_combined_minimum_size().y


## Un tap hors du panneau et de ses boutons le ferme ; Echap aussi.
func _input(event: InputEvent) -> void:
	if not _open:
		return
	if event is InputEventMouseButton and event.pressed:
		var p: Vector2 = (event as InputEventMouseButton).position
		if _cluster.get_global_rect().has_point(p) or _panel.get_global_rect().has_point(p):
			return
		set_open(false)
	elif event.is_action_pressed("ui_cancel"):
		set_open(false)
		get_viewport().set_input_as_handled()
