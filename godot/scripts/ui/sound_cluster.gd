class_name SoundCluster
extends Control
## Le panneau de réglages du terrier, accroché à l'engrenage.
## Deux colonnes sur le bois : son à gauche, jeu à droite. Tous les
## réglages restent visibles sur téléphone paysage, ticket compris.
## Le tap dehors, Echap et la croix ferment le même panneau.

const PANEL_W := 680.0
const ROW_GAP := 6.0
## La marge interieure du parchemin, cote / haut et bas.
const PANEL_PAD := Vector2(22, 18)
const ICON_PX := 24.0
## L'engrenage du rail est dessine droit et montre tourne : une dent de coin en haut.
const GEAR_TURN := 45.0
## La largeur commune du volume et du choix de qualité.
const CONTROL_W := 130.0
const SETTING_ICONS := {
	"note": preload("res://assets/ui/icons/settings/note.png"),
	"burst": preload("res://assets/ui/icons/settings/burst.png"),
	"sparkle": preload("res://assets/ui/icons/settings/sparkle.png"),
	"rabbit": preload("res://assets/ui/icons/settings/rabbit.png"),
}

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
var _solo_card: Control
var _solo_note: HBoxContainer
var _solo_crown: Control
var _solo_note_text: Label
## Ce que la ligne solo vient de dire (refus, « des ta prochaine ile ») ;
## vide = la phrase par defaut de l'etat.
var _solo_msg := ""
var _solo_busy := false
var _labels: Array[Label] = []
var _open := false
var _inset: MarginContainer
var _close: CloseButton
var _volume_value: Label
var _opening: Tween


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	AudioSettings.restore()
	PlaySettings.restore()

	_cluster = Kit.hbox(Kit.PAD_TIGHT)
	_cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cluster)

	sound_button = HubIconButton.make("Sound settings", Kit.ICONS["gear"])  # la cle choisit l anneau : garder l ancien
	sound_button.set_glyph_turn(GEAR_TURN)
	sound_button.pressed.connect(func() -> void: set_open(not _open))
	_cluster.add_child(sound_button)

	_build_panel()
	_cluster.resized.connect(_place)


func _ready() -> void:
	set_notify_transform(true)
	_relabel()
	_reflect()
	I18N.locale_changed.connect(func(_c: String) -> void: _relabel())
	PassState.shared().changed.connect(_reflect)
	get_viewport().size_changed.connect(_place)
	_place()


func _notification(what: int) -> void:
	# Le parent range la barre après _ready et après un redimensionnement.
	# Recaler alors le panneau à partir de sa vraie position écran.
	if what == NOTIFICATION_TRANSFORM_CHANGED and is_inside_tree() and _panel != null:
		_place.call_deferred()


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

	# LE PARCHEMIN, pas la vitrine du Snack Time : l'etagere vide en bas
	# faisait meuble, et le fond sombre etait « moche » (2026-10-02).
	var frame := Kit.parchment()
	Kit.fill(frame)
	_panel.add_child(frame)
	# Serre : le cadre du parchemin ne fait qu'une dizaine de pixels a l'oeil,
	# son inset (36/44) laissait une marge creme trop large (2026-10-02).
	_inset = Kit.margin(PANEL_PAD.x, PANEL_PAD.y, PANEL_PAD.x, PANEL_PAD.y)
	Kit.fill(_inset)
	_panel.add_child(_inset)
	var column := Kit.vbox(12)
	_inset.add_child(column)
	var header := Kit.hbox(10)
	column.add_child(header)
	var gear := Kit.icon(Kit.ICONS["gear"], 24)  # droit ici : seul le bouton du rail est tourne
	gear.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(gear)
	_title = Kit.title("", 21, Palette.INK)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	header.add_child(_title)
	_close = Kit.close_button()
	_close.pressed.connect(func() -> void: set_open(false))
	header.add_child(_close)

	var sections := Kit.hbox(18)
	column.add_child(sections)
	var audio := Kit.vbox(ROW_GAP)
	var game := Kit.vbox(ROW_GAP)
	for section in [audio, game]:
		section.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		section.custom_minimum_size.x = (PANEL_W - 2.0 * PANEL_PAD.x - 18.0) * 0.5
		sections.add_child(section)

	audio.add_child(_head())
	_music = PixelSwitch.new()
	_music.toggled.connect(func(on: bool) -> void: AudioSettings.set_music_muted(not on))
	audio.add_child(_card("note", _music))
	_effects = PixelSwitch.new()
	_effects.toggled.connect(func(on: bool) -> void: AudioSettings.set_sfx_muted(not on))
	audio.add_child(_card("burst", _effects))
	_volume = _slider()
	var volume_column := Kit.vbox(0)
	_volume_value = Kit.label("", 10, Palette.GOLD)
	_volume_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	volume_column.add_child(_volume_value)
	volume_column.add_child(_volume)
	_volume.value_changed.connect(func(v: float) -> void:
		AudioSettings.set_volume(v)
		_volume_value.text = "%d%%" % roundi(v * 100))
	audio.add_child(_card("", volume_column, Kit.ICONS["speaker-on"]))

	game.add_child(_head())
	_quality = PixelSegment.new(CONTROL_W)
	_quality.custom_minimum_size.y = 36
	_quality.picked.connect(func(i: int) -> void: PlaySettings.set_pretty(i == 1))
	game.add_child(_card("sparkle", _quality))
	_solo = PixelSwitch.new()
	_solo.toggled.connect(_on_solo_toggled)
	_solo_card = _card("rabbit", _solo)
	game.add_child(_solo_card)
	_solo_note = Kit.hbox(Kit.PAD_TIGHT)
	var crown := Kit.icon(Kit.CROWN, 16)
	crown.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_solo_crown = crown
	_solo_note.add_child(crown)
	_solo_note_text = Kit.label("", 11, Palette.BARK)
	_solo_note_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_solo_note_text.custom_minimum_size.x = 276
	_solo_note_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_solo_note.add_child(_solo_note_text)
	_solo_note.visible = false
	game.add_child(_solo_note)
	_panel.custom_minimum_size = Vector2(PANEL_W, 0)
	_panel.size.x = PANEL_W


## Un intertitre de section : le mot a l'encre secondaire, puis un filet.
func _head() -> HBoxContainer:
	var row := Kit.hbox(Kit.PAD_TIGHT)
	var label := Kit.label("", 12, Palette.BARK)
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
	card.custom_minimum_size.y = 52
	var row := Kit.hbox(Kit.PAD)
	card.add_child(row)

	var icon := TextureRect.new()
	icon.texture = tex if tex != null else SETTING_ICONS[icon_key]
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(ICON_PX, ICON_PX)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.modulate = Palette.CREAM
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)

	var label := Kit.label("", 12, Palette.CREAM, true)
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
	_volume_value.text = "%d%%" % roundi(AudioSettings.volume * 100)
	_quality.set_index(1 if PlaySettings.pretty else 0)
	_reflect_solo(w)


## LA LIGNE SOLO. Cachee avant RAID_MIN : les iles des niveaux 1-2 sont deja a
## une place et personne ne s'y bat, l'interrupteur n'y changerait rien.
## Dessous, une phrase : le ticket qui la ferme, le dernier refus ou « des ta
## prochaine ile », sinon ce que le solo coute quand il est allume.
func _reflect_solo(w: Array) -> void:
	var level: Variant = Home.player.get("level")
	var shown := level == null or int(level) >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)
	var locked := PlaySettings.solo_locked()
	var on := PlaySettings.solo_on()
	_solo.disabled = locked or _solo_busy
	if not _solo_busy:
		_solo.set_on(on and not locked, w)
	var say := ""
	if locked:
		say = I18N.t("sound.soloTicket")
	elif not _solo_msg.is_empty():
		say = _solo_msg
	elif on:
		say = I18N.t("sound.soloRaids")
	_solo_note_text.text = say
	_solo_crown.visible = locked
	var note := shown and not say.is_empty()
	if _solo_card.visible != shown or _solo_note.visible != note:
		_solo_card.visible = shown
		_solo_note.visible = note
		_place()


## L'INTERRUPTEUR demande au serveur (PlaySettings.set_solo) ; refuse, il
## revient ou il etait et dit pourquoi. Allume en pleine partie, il le dit
## aussi : l'ile sous les pattes reste celle qu'elle est.
func _on_solo_toggled(on: bool) -> void:
	if _solo_busy:
		return
	_solo_busy = true
	_solo_msg = ""
	_reflect()
	var refused: String = await PlaySettings.set_solo(on)
	_solo_busy = false
	if not is_inside_tree():
		return
	match refused:
		"":
			var out_there := not RunState.current.island.is_empty() and RunState.current.spectating.is_empty()
			_solo_msg = I18N.t("sound.soloNext") if on and out_there else ""
		"solo_ticket":
			_solo_msg = I18N.t("sound.soloTicket")
		"raid_in_progress":
			_solo_msg = I18N.t("sound.soloBusy")
		"solo_cooldown":
			_solo_msg = I18N.f("sound.soloCooldown", [I18N.wait(float(PlaySettings.solo_wait_ms))])
		"offline":
			_solo_msg = I18N.t("err_offline")
		_:
			_solo_msg = I18N.t("raidErrors.fallback")
	if not refused.is_empty():
		Sound.deny()
	_reflect()


func set_open(on: bool) -> void:
	if on != _open:
		sound_button.spin_glyph(1.0 if on else -1.0)  # un tour, dans un sens puis dans l'autre
	_open = on
	_panel.visible = on
	if not on:
		_solo_msg = ""
	_reflect()
	_place()
	if _opening != null and _opening.is_valid():
		_opening.kill()
	if on:
		var rest := _panel.position
		_panel.position.y -= 6
		_panel.modulate.a = 0.0
		_opening = _panel.create_tween().set_parallel()
		_opening.tween_property(_panel, "position", rest, 0.18).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_opening.tween_property(_panel, "modulate:a", 1.0, 0.12)


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
	var ph := _panel_height()
	_panel.size = Vector2(PANEL_W, ph)
	var k := 1.0
	var local_x := cs.x - PANEL_W
	var local_y := cs.y + Kit.PAD_TIGHT
	if is_inside_tree():
		var view := get_viewport_rect().size
		k = minf(1.0, minf((view.x - 20) / PANEL_W, (view.y - 20) / ph))
		var global_at := global_position + Vector2(cs.x - PANEL_W * k, local_y)
		global_at.x = clampf(global_at.x, 10, maxf(10, view.x - PANEL_W * k - 10))
		global_at.y = clampf(global_at.y, 10, maxf(10, view.y - ph * k - 10))
		local_x = global_at.x - global_position.x
		local_y = global_at.y - global_position.y
	_panel.scale = Vector2.ONE * k
	_panel.position = Vector2(local_x, local_y)


func _panel_height() -> float:
	return _inset.get_combined_minimum_size().y


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
