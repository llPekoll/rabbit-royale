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
##   • MUET SE LIT DANS LE SPRITE : le haut-parleur perd ses ondes. Le carre
##     s'enfonce, lui, tant que le panneau est ouvert — l'enfoncement dit
##     « ce bouton a ouvert ceci », comme partout dans la barre.
##   • UN PANNEAU SANS AUTRE ISSUE QUE SON BOUTON EST UN PIEGE sur un ecran
##     tactile : un tap dehors le ferme, Echap aussi.
##   • UNE GOUTTIERE POUR TOUS LES CONTROLES : chaque rangee est deux
##     colonnes, le libelle a gauche et le controle a droite sur la meme
##     largeur, pour que l'oeil trouve un bord et non quatre.

## Le panneau (`.rr-sound-panel`) : 244 de large, la gouttiere de 76. Le
## web tient dans 216 / 56 ; ici les planches portent 20 px de feuilles a
## chaque bout, et 56 ne laissait que 16 px de face — « OFF » sortait « FI »,
## et « Effects » touchait la planche.
const PANEL_W := 244.0
const GUTTER := 76.0
const ROW_GAP := 11.0

var sound_button: HubIconButton

var _cluster: HBoxContainer
var _panel: Control
var _music: PlankButton
var _effects: PlankButton
var _volume: HSlider
var _labels: Array[Label] = []
var _open := false


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	AudioSettings.restore()

	_cluster = Kit.hbox(Kit.PAD_TIGHT)
	_cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cluster)

	sound_button = HubIconButton.make("Sound settings")
	sound_button.pressed.connect(func() -> void: set_open(not _open))
	_cluster.add_child(sound_button)

	_build_panel()
	_cluster.resized.connect(_place)


func _ready() -> void:
	_relabel()
	_reflect()
	I18N.locale_changed.connect(func(_c: String) -> void: _relabel())
	_place()


## Le carre du bouton, comme le reste du rail.
func set_square(px: float, view_height: float) -> void:
	sound_button.set_square(px, view_height)
	_place()


func _build_panel() -> void:
	_panel = Control.new()
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.visible = false
	add_child(_panel)

	var frame := Kit.parchment()
	Kit.fill(frame)
	_panel.add_child(frame)
	var edge := frame.inset()
	var inset := Kit.margin(edge.x + Kit.PAD, edge.y + Kit.PAD, edge.z + Kit.PAD, edge.w + Kit.PAD)
	Kit.fill(inset)
	_panel.add_child(inset)
	var column := Kit.vbox(ROW_GAP)
	inset.add_child(column)

	_music = Kit.button("", "green", GUTTER, 30.0)
	_music.label_size = Kit.pixel_size(1.25)
	_music.pressed.connect(_toggle_music)
	column.add_child(_row(_music))

	_effects = Kit.button("", "green", GUTTER, 30.0)
	_effects.label_size = Kit.pixel_size(1.25)
	_effects.pressed.connect(func() -> void:
		AudioSettings.set_sfx_muted(not AudioSettings.sfx_muted)
		_reflect())
	column.add_child(_row(_effects))

	# LE VOLUME est le seul reglage qui n'est pas oui/non : une vraie glissiere
	# (le glisser, les fleches, tout gratuit), reteinte a la palette du
	# terrier pour qu'elle n'arrive pas en bleu systeme.
	_volume = HSlider.new()
	_volume.min_value = 0.0
	_volume.max_value = 1.0
	_volume.step = 0.05
	_volume.custom_minimum_size = Vector2(GUTTER, 20.0)
	_volume.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_volume.add_theme_stylebox_override("slider", Kit.style_track())
	var fill := StyleBoxFlat.new()
	fill.bg_color = Palette.CARROT
	fill.set_corner_radius_all(12)
	_volume.add_theme_stylebox_override("grabber_area", fill)
	_volume.add_theme_stylebox_override("grabber_area_highlight", fill)
	var knob := _knob()
	_volume.add_theme_icon_override("grabber", knob)
	_volume.add_theme_icon_override("grabber_highlight", knob)
	_volume.add_theme_icon_override("grabber_disabled", knob)
	_volume.value_changed.connect(func(v: float) -> void: AudioSettings.set_volume(v))
	column.add_child(_row(_volume))

	_panel.custom_minimum_size = Vector2(PANEL_W, 0.0)
	_panel.size.x = PANEL_W


## Une rangee du panneau : le libelle, puis le controle dans la gouttiere.
func _row(control: Control) -> HBoxContainer:
	var row := Kit.hbox(Kit.PAD)
	var label := Kit.label("", Kit.pixel_size(1.25), Palette.INK)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	_labels.append(label)
	row.add_child(label)
	control.custom_minimum_size.x = GUTTER
	row.add_child(control)
	return row


## Le bouton de la glissiere : un carre creme cerne d'encre, sur la grille
## du pixel.
func _knob() -> ImageTexture:
	var img := Image.create(12, 12, false, Image.FORMAT_RGBA8)
	img.fill(Palette.INK)
	img.fill_rect(Rect2i(2, 2, 8, 8), Palette.CREAM)
	return ImageTexture.create_from_image(img)


func _relabel() -> void:
	if _labels.size() >= 3:
		_labels[0].text = I18N.t("sound.music")
		_labels[1].text = I18N.t("sound.effects")
		_labels[2].text = I18N.t("sound.volume")
	_reflect()


func _toggle_music() -> void:
	AudioSettings.set_music_muted(not AudioSettings.music_muted)
	_reflect()


## L'etat dans chaque controle : le sprite du muet et l'enfoncement du
## panneau ouvert, ON/OFF sur les deux planches, la glissiere au niveau.
func _reflect() -> void:
	var muted := AudioSettings.music_muted
	sound_button.set_glyph(Kit.ICONS["speaker-off"] if muted else Kit.ICONS["speaker-on"])
	sound_button.set_pressed_look(_open)
	sound_button.tooltip_text = I18N.t("sound.settings")
	_set_toggle(_music, not muted)
	_set_toggle(_effects, not AudioSettings.sfx_muted)
	_volume.set_value_no_signal(AudioSettings.volume)


func _set_toggle(b: PlankButton, on: bool) -> void:
	b.board = PlankButton.Board.GREEN if on else PlankButton.Board.WOOD
	b.relabel(I18N.t("sound.on") if on else I18N.t("sound.off"))


func set_open(on: bool) -> void:
	_open = on
	_panel.visible = on
	_reflect()
	_place()


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
