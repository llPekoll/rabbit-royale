class_name SettingsPane
extends Control
## LES REGLAGES, en onglet du profil — la maquette 05-reglages-camp-de-raid :
## une console du son en haut (la scene du gramophone, musique, effets,
## volume), la qualite en deux vignettes et le mode solo en bas, et la phrase
## « enregistre tout seul » au pied. C'etait le panneau de l'engrenage
## (sound_cluster.gd) ; il vit derriere le lapin, avec le profil et
## l'historique (2026-10-08).
##
## LES COORDONNEES SONT CELLES DE 05, relatives au coin du panneau (375, 92),
## multipliees par M pour tenir dans le panneau de 02 ; la hauteur est
## resserree (778 -> 620) : les vignettes y sont cadrees plus bas, rien
## d'autre ne bouge.
const M := 0.8175

var _k := 0.7
var _music: CampSwitch
var _effects: CampSwitch
var _volume: CampSlider
var _volume_value: Label
var _cards: Array[Button] = []
var _solo: CampSwitch
var _solo_box: Control
var _solo_note: Label
## Ce que la ligne solo vient de dire (refus, « des ta prochaine ile ») ;
## vide = la phrase par defaut de l'etat.
var _solo_msg := ""
var _solo_busy := false
var _words: Dictionary = {}


func _init(k: float = 0.7) -> void:
	_k = k
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	AudioSettings.restore()
	PlaySettings.restore()

	# La console du son.
	_panel("section", 15, 62, 1168, 228)
	_icon("icon-note", 35, 70, 46, 46)
	_words["ambience"] = _say(28, 103, 70, 500, 46)
	var music := _picture("scene-music", 18, 118, 453, 168)
	music.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_panel("console", 476, 82, 691, 196)
	_icon("icon-note-small", 546, 92, 34, 38)
	_words["music"] = _say(25, 590, 92, 200, 38)
	_icon("icon-speaker", 846, 92, 40, 38)
	_words["effects"] = _say(25, 896, 92, 260, 38)
	_music = _switch(571, 138)
	_music.name = "Music"
	_music.toggled.connect(func(on: bool) -> void: AudioSettings.set_music_muted(not on))
	_effects = _switch(904, 138)
	_effects.name = "Effects"
	_effects.toggled.connect(func(on: bool) -> void: AudioSettings.set_sfx_muted(not on))
	_rule(800, 96, 2, 104)
	_rule(496, 214, 651, 2)
	_icon("icon-speaker-volume", 491, 225, 44, 44)
	_words["volume"] = _say(25, 550, 225, 110, 44)
	_volume = CampSlider.new()
	_volume.name = "Volume"
	_place(_volume, 668, 232, 392, 30)
	_volume_value = _say(27, 1072, 225, 84, 44, CampStyle.COPPER)
	_volume_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_volume.value_changed.connect(func(v: float) -> void:
		AudioSettings.set_volume(v)
		_volume_value.text = "%d %%" % roundi(v * 100))

	# La qualite : deux vignettes de la meme ile, une seule allumee.
	_panel("section", 15, 300, 685, 292)
	_icon("icon-picture", 35, 304, 48, 46)
	_words["quality"] = _say(27, 101, 304, 500, 46)
	for i in 2:
		_cards.append(_card(i, 32.0 + 337.0 * i, 354.0, 319.0 - 3.0 * i, 228.0))

	# Le mode solo.
	_solo_box = Control.new()
	_solo_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(_solo_box, 0, 0, 1200, 620)
	_panel("section", 715, 300, 468, 292, _solo_box)
	_icon("icon-rabbit-solo", 729, 300, 48, 54, _solo_box)
	_words["soloMode"] = _say(27, 801, 304, 360, 46, CampStyle.TEXT, _solo_box)
	var nap := _picture("scene-solo", 729, 354, 439, 146, _solo_box)
	nap.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_words["soloPlay"] = _say(27, 745, 510, 230, 50, CampStyle.TEXT, _solo_box)
	_solo = _switch(984, 507, _solo_box)
	_solo.name = "Solo"
	_solo.toggled.connect(_on_solo_toggled)
	_solo_note = _say(20, 745, 558, 425, 32, Color("#a9c9d6"), _solo_box)
	_solo_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_solo_note.clip_text = false

	# Le pied : rien a valider, tout s'enregistre au changement.
	_rule(35, 611, 250, 2, Color("#2b6170"))
	_icon("icon-check-small", 300, 598, 28, 26)
	_words["autosaved"] = _say(17, 338, 598, 570, 26, Color("#8fb3bd"))
	if Analytics.backend() != "none" or Consent.needed:
		var privacy := CampStyle.hit("Privacy")
		_place(privacy, 915, 596, 250, 30)
		var words := CampStyle.text(I18N.t("consent.settings"), 17 * M * _k, CampStyle.COPPER)
		words.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		Kit.fill(words)
		privacy.add_child(words)
		privacy.pressed.connect(func() -> void: ConsentDialog.open())
	else:
		_rule(935, 611, 230, 2, Color("#2b6170"))


func _ready() -> void:
	_relabel()
	I18N.locale_changed.connect(func(_c: String) -> void: _relabel())
	PassState.shared().changed.connect(_reflect)


# ── Les pieces, en coordonnees de la maquette 05 ─────────────────────────────

func _place(node: Control, x: float, y: float, w: float, h: float, parent: Control = null) -> Control:
	node.position = Vector2(x, y) * M * _k
	node.size = Vector2(w, h) * M * _k
	(parent if parent != null else self).add_child(node)
	return node


func _panel(which: String, x: float, y: float, w: float, h: float, parent: Control = null) -> NineSlice:
	return _place(CampStyle.nine(which, _k), x, y, w, h, parent) as NineSlice


func _picture(name: String, x: float, y: float, w: float, h: float, parent: Control = null) -> TextureRect:
	var r := CampStyle.picture(CampStyle.tex(name))
	r.clip_contents = true
	return _place(r, x, y, w, h, parent) as TextureRect


func _icon(name: String, x: float, y: float, w: float, h: float, parent: Control = null) -> TextureRect:
	var r := CampStyle.picture(CampStyle.tex(name))
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	return _place(r, x, y, w, h, parent) as TextureRect


func _say(px: float, x: float, y: float, w: float, h: float, color: Color = CampStyle.TEXT, parent: Control = null) -> Label:
	return _place(CampStyle.text("", px * M * _k, color), x, y, w, h, parent) as Label


func _rule(x: float, y: float, w: float, h: float, color: Color = Color("#24505c")) -> void:
	var r := ColorRect.new()
	r.color = color
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(r, x, y, w, h)


func _switch(x: float, y: float, parent: Control = null) -> CampSwitch:
	var s := CampSwitch.new(27 * M * _k)
	_place(s, x, y, 176, 62, parent)
	return s


## UNE VIGNETTE DE QUALITE : l'apercu, son nom, ce qu'elle fait ; le cadre
## cuivre et la pastille cochee sur celle qui est choisie.
func _card(i: int, x: float, y: float, w: float, h: float) -> Button:
	var b := CampStyle.hit(["Smooth", "Pretty"][i])
	_place(b, x, y, w, h)
	b.pressed.connect(func() -> void:
		PlaySettings.set_pretty(i == 1)
		_reflect())
	var frame := CampStyle.nine("card-off", _k)
	frame.name = "Frame"
	_place(frame, 0, 0, w, h, b)
	var view := _picture("preview-pretty" if i == 1 else "preview-smooth", 5, 5, w - 10, 148, b)
	view.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var name := _say(27, 0, 156, w, 34, CampStyle.TEXT, b)
	name.name = "Name"
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var hint := _say(20, 0, 188, w, 28, Color("#a9c9d6"), b)
	hint.name = "Hint"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var check := _icon("check", w - 44, -10, 50, 50, b)
	check.name = "Check"
	return b


func _on_words() -> Array:
	return [I18N.t("sound.on"), I18N.t("sound.off")]


func _relabel() -> void:
	_words["ambience"].text = I18N.t("sound.ambience")
	_words["music"].text = I18N.t("sound.music")
	_words["effects"].text = I18N.t("sound.effectsLong")
	_words["volume"].text = I18N.t("sound.volume")
	_words["quality"].text = I18N.t("sound.visualQuality")
	_words["soloMode"].text = I18N.t("sound.soloMode")
	_words["soloPlay"].text = I18N.t("sound.soloPlay")
	_words["autosaved"].text = I18N.t("sound.autosaved")
	for i in _cards.size():
		(_cards[i].get_node("Name") as Label).text = I18N.t(["sound.smooth", "sound.pretty"][i]).capitalize()
		(_cards[i].get_node("Hint") as Label).text = I18N.t(["sound.smoothHint", "sound.prettyHint"][i])
	_reflect()


## L'etat dans chaque controle, sans animation : les interrupteurs, la
## glissiere, la qualite, et le solo ferme par le ticket.
func _reflect() -> void:
	var w := _on_words()
	_music.set_on(not AudioSettings.music_muted, w)
	_effects.set_on(not AudioSettings.sfx_muted, w)
	_volume.set_value_no_signal(AudioSettings.volume)
	_volume_value.text = "%d %%" % roundi(AudioSettings.volume * 100)
	for i in _cards.size():
		var on := (i == 1) == PlaySettings.pretty
		var frame := _cards[i].get_node("Frame") as NineSlice
		var p: Array = CampStyle.PANELS["card-on" if on else "card-off"]
		frame.texture = p[0]
		var c := int(p[1])
		frame.slice = Vector4i(c, c, c, c)
		frame.edge = Vector4.ONE * c * _k
		_cards[i].get_node("Check").visible = on
	_reflect_solo(w)


## LE MODE SOLO. Cache avant RAID_MIN : les iles des niveaux 1-2 sont deja a
## une place et personne ne s'y bat, l'interrupteur n'y changerait rien.
## Dessous, une phrase : le ticket qui le ferme, le dernier refus ou « des ta
## prochaine ile », sinon ce que le solo fait.
func _reflect_solo(w: Array) -> void:
	var level: Variant = Home.player.get("level")
	var shown := level == null or int(level) >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)
	var locked := PlaySettings.solo_locked()
	var on := PlaySettings.solo_on()
	_solo.disabled = locked or _solo_busy
	if not _solo_busy:
		_solo.set_on(on and not locked, w)
	var say := I18N.t("sound.soloHint")
	var warn := false
	if locked:
		say = I18N.t("sound.soloTicket")
		warn = true
	elif not _solo_msg.is_empty():
		say = _solo_msg
		warn = true
	_solo_note.text = say
	_solo_note.add_theme_color_override("font_color", CampStyle.BAD if warn else Color("#a9c9d6"))
	_solo_box.visible = shown


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
