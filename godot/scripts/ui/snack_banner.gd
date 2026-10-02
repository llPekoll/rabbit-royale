class_name SnackBanner
extends Control
## LA BANNIERE DE SNACK TIME, sous la quete dans la colonne du terrier — la
## ou l'oeil va deja, dans le meme cadre dore que le Crown Race Ticket
## (pass_banner.gd) : le user veut ce qui compte « bien plus visible » qu'une
## icone de barre.
##
## Elle dit les trois choses qui font revenir : OU on en est (sept pastilles,
## les prises cochees, la septieme doree), si un snack ATTEND (elle respire,
## « touche pour le prendre »), sinon DANS COMBIEN de temps vient le suivant.
## Un tap ouvre toujours la fenetre (snack_dialog.gd).

const INK := PassBanner.INK
const SUB := PassBanner.SUB
const READY := Color("#3d7a1f")

var _frame: NineSlice
var _title: Label
var _sub: Label
var _pips: SnackPips
var _hit: Button
var _pulse: Tween
var _tick: Timer


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame = NineSlice.make(PassBanner.FRAME, PassBanner.SLICE, Vector4.ZERO, true)
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame)

	var text := Kit.vbox(0)
	text.name = "Text"
	text.alignment = BoxContainer.ALIGNMENT_CENTER
	text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(text)
	var top := Kit.hbox(Kit.PAD_TIGHT)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text.add_child(top)
	_title = Kit.label("", 13, INK)
	_title.clip_text = true
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_title)
	_pips = SnackPips.new()
	_pips.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(_pips)
	_sub = Kit.label("", 11, SUB)
	_sub.clip_text = true
	_sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	text.add_child(_sub)

	_hit = Button.new()
	_hit.focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_hit.add_theme_stylebox_override(state, Kit.style_empty())
	_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_hit.pressed.connect(func() -> void: SnackDialog.open())
	add_child(_hit)

	# Le compte a rebours bouge : une relecture du texte par minute suffit.
	_tick = Timer.new()
	_tick.wait_time = 30.0
	_tick.timeout.connect(refresh)
	add_child(_tick)
	_tick.start()

	SnackState.shared().changed.connect(refresh)
	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())
	get_viewport().size_changed.connect(_measure)
	resized.connect(_place)
	_measure()
	refresh()


## La hauteur du Crown Race Ticket a cette vue : les deux cadres ont les
## memes pixels quand ils se suivent dans la colonne.
func _measure() -> void:
	var h := PassBanner.pixel_scale(get_viewport_rect().size.y) * PassBanner.TEX_H
	custom_minimum_size = Vector2(0.0, h)
	update_minimum_size()
	_place()


func _place() -> void:
	if _frame == null:
		return
	var slice := PassBanner.SLICE
	var k := size.y / PassBanner.TEX_H
	_frame.edge = Vector4(slice.x * k, slice.y * k, slice.z * k, slice.w * k)
	_frame.position = Vector2.ZERO
	_frame.size = size
	var text: Control = get_node("Text")
	var left := slice.x * k
	var right := slice.z * k
	text.position = Vector2(left, 0.0)
	text.size = Vector2(maxf(0.0, size.x - left - right), size.y)
	_hit.position = Vector2.ZERO
	_hit.size = size
	pivot_offset = size * 0.5


func refresh() -> void:
	if _title == null:
		return
	var st := SnackState.shared()
	# APRES LA LECON, et une fois la semaine lue : avant, rien a montrer.
	visible = st.known() and SnackState.runs_played() >= 1
	if not visible:
		_breathe(false)
		return
	var pixel := I18N.pixel_face()
	_title.add_theme_font_size_override("font_size", 13 if pixel else 11)
	_sub.add_theme_font_size_override("font_size", 11 if pixel else 10)
	# La colonne fait ~200 px au Seeker : le titre a cote des pastilles (qui
	# disent deja le jour), et UNE chose dessous — pret, ou dans combien.
	_title.text = I18N.shout(I18N.t("snack.title"))
	_pips.show_week(st.taken(), st.ready())
	_sub.remove_theme_color_override("font_color")
	if st.ready():
		_sub.add_theme_color_override("font_color", READY)
		_sub.text = I18N.t("snack.ready")
	else:
		_sub.add_theme_color_override("font_color", SUB)
		_sub.text = I18N.f("snack.nextIn", [I18N.short_wait(st.wait_ms())])
	_hit.tooltip_text = "%s · %s" % [I18N.t("snack.title"), I18N.f("snack.dayOf", [st.day()])]
	_breathe(st.ready())


## UN SOUFFLE tant qu'un snack attend, comme la banniere du ticket.
func _breathe(on: bool) -> void:
	if _pulse != null and _pulse.is_valid():
		if on:
			return
		_pulse.kill()
	scale = Vector2.ONE
	if not on:
		return
	_pulse = create_tween().set_loops()
	_pulse.tween_property(self, "scale", Vector2(1.04, 1.04), 0.45).set_trans(Tween.TRANS_SINE)
	_pulse.tween_property(self, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_SINE)
	_pulse.tween_interval(1.0)
