class_name PassBanner
extends Control
## LA BANNIERE DU GOLDEN CARROT PASS, sous la quete dans la colonne du
## terrier — la ou l'oeil va deja. Le cadre est la notification doree du web
## (public/assets/ui/notification-quest.png : etoile a gauche, chevron a
## droite), recadree et etiree au centre seulement.
##
## Toujours la. Pass ferme : un peu eteinte, « BIENTOT », un tap ne fait
## rien (on la deverrouille avec `scripts/season-pass.ts open`). Pass ouvert :
## le prix et la cagnotte, puis pour qui l'a les jours qui restent, ou « le
## coffre du jour t'attend » quand il attend. Un tap ouvre la fenetre du pass.

const FRAME := preload("res://assets/ui/notification-quest.webp")
## La texture fait 476x140 : l'etoile tient dans les 110 premiers pixels, le
## chevron dans les 64 derniers, les coins dores dans 32 en haut et en bas.
const SLICE := Vector4i(110, 32, 64, 32)
const TEX_H := 140.0
const INK := Color("#3a2617")
const SUB := Color("#6c3e22")
const READY := Color("#2f5d1e")
const SOON_BG := Color("#6c3e22")

var _frame: NineSlice
var _title: Label
var _sub: Label
var _tag: PanelContainer
var _tag_label: Label
var _hit: Button
var _pulse: Tween


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame = NineSlice.make(FRAME, SLICE, Vector4.ZERO, true)
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame)

	var text := Kit.vbox(0)
	text.name = "Text"
	text.alignment = BoxContainer.ALIGNMENT_CENTER
	text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(text)
	_title = Kit.label("", 13, INK)
	_title.clip_text = true
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	text.add_child(_title)
	var line := Kit.hbox(Kit.PAD_TIGHT)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text.add_child(line)
	# « BIENTOT » en pastille d'encre : se lit comme a venir, pas comme casse.
	var style := StyleBoxFlat.new()
	style.bg_color = SOON_BG
	style.set_corner_radius_all(3)
	style.content_margin_left = 4
	style.content_margin_right = 4
	_tag = Kit.panel(style)
	_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tag.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_tag_label = Kit.label("", 10, Palette.CREAM)
	_tag.add_child(_tag_label)
	line.add_child(_tag)
	_sub = Kit.label("", 11, SUB)
	_sub.clip_text = true
	_sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_sub.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(_sub)

	# Le tap, par-dessus tout (un Button ne mesure pas ses enfants).
	_hit = Button.new()
	_hit.focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_hit.add_theme_stylebox_override(state, Kit.style_empty())
	_hit.pressed.connect(func() -> void:
		if PassState.shared().on():
			PassDialog.open())
	add_child(_hit)

	PassState.shared().changed.connect(refresh)
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())
	get_viewport().size_changed.connect(_measure)
	resized.connect(_place)
	_measure()
	refresh()


## LA HAUTEUR SUIT L'ECRAN, comme les cartes : 48 sur le Seeker couche,
## jusqu'a 66 sur un grand bureau. La largeur est celle de la colonne.
func _measure() -> void:
	var h := clampf(get_viewport_rect().size.y * 0.13, 52.0, 70.0)
	custom_minimum_size = Vector2(0.0, h)
	update_minimum_size()
	_place()


func _place() -> void:
	if _frame == null:
		return
	var k := size.y / TEX_H
	_frame.edge = Vector4(SLICE.x * k, SLICE.y * k, SLICE.z * k, SLICE.w * k)
	_frame.position = Vector2.ZERO
	_frame.size = size
	var text: Control = get_node("Text")
	var left := SLICE.x * k
	var right := SLICE.z * k
	text.position = Vector2(left, 0.0)
	text.size = Vector2(maxf(0.0, size.x - left - right), size.y)
	_hit.position = Vector2.ZERO
	_hit.size = size


func refresh() -> void:
	if _title == null:
		return
	var st := PassState.shared()
	var open := st.on()
	# La colonne fait ~200px au Seeker : la face pixel (anglais) tient a 13,
	# Fusion (les autres langues) est plus large et descend a 11.
	var pixel := I18N.pixel_face()
	_title.add_theme_font_size_override("font_size", 13 if pixel else 11)
	_sub.add_theme_font_size_override("font_size", 11 if pixel else 10)
	_title.text = I18N.shout(I18N.t("pass.title"))
	_hit.disabled = not open
	_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if open else Control.CURSOR_ARROW
	_hit.tooltip_text = I18N.t("pass.title") if open else "%s · %s" % [I18N.t("pass.title"), I18N.t("pass.soon")]
	# Fermee : a peine eteinte. Elle doit rester VUE (le bouton gris de la
	# barre, a 0.5, ne se trouvait pas — 2026-10-01).
	modulate = Color.WHITE if open else Color(0.86, 0.86, 0.86, 1.0)
	_tag.visible = not open
	_tag_label.text = I18N.t("pass.soonTag")
	_sub.remove_theme_color_override("font_color")
	_sub.add_theme_color_override("font_color", SUB)
	var ready := false
	var s := st.state
	var share := "%d%%" % int(round(float(s.get("potShare", 0.5)) * 100.0))
	# COURT, sans phrase : le prix et ce que le pot donne au top 10.
	var offer := "%s · TOP 10: %s" % [PassState.dollars(float(s.get("priceUsd", 4.99))), share]
	if not open:
		# La pastille BIENTOT prend la place : le prix seul derriere elle.
		_sub.text = PassState.dollars(float(s.get("priceUsd", 4.99)))
	elif st.holder():
		ready = st.can_claim()
		_sub.text = I18N.t("pass.chestReady") if ready else I18N.f("pass.left", [st.days_left()])
		if ready:
			_sub.add_theme_color_override("font_color", READY)
	else:
		_sub.text = offer
	_breathe(ready or (open and not st.holder()))


## UN SOUFFLE quand il y a quelque chose a prendre (pass en vente, coffre
## pret) : la banniere enfle un peu, toutes les deux secondes.
func _breathe(on: bool) -> void:
	if _pulse != null and _pulse.is_valid():
		_pulse.kill()
	pivot_offset = size * 0.5
	scale = Vector2.ONE
	if not on:
		return
	_pulse = create_tween().set_loops()
	_pulse.tween_property(self, "scale", Vector2(1.03, 1.03), 0.5).set_trans(Tween.TRANS_SINE)
	_pulse.tween_property(self, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_SINE)
	_pulse.tween_interval(1.2)
