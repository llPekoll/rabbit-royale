class_name MarkBombButton
extends Control
## MARK A BOMB — armer, puis taper la case qu'on croit minee.
##
## Porte de src/components/mark-bomb-button.tsx et teach-spotlight.tsx, en
## gardant ce qu'ils ont decide :
##
##   • UN BOUTON, PAS UN APPUI LONG. Sur ce plateau un doigt tenu est deja le
##     debut d'un glissement de camera, et un geste qui veut dire deux choses
##     est un pari place par accident — qui coute ici de l'energie. Le mode
##     est donc explicite, il dit ce qu'il va faire tant qu'il est arme, et il
##     tombe apres UN X (run_state.gd `move`).
##   • IL DIT CE QU'IL EST. Sa premiere version etait une croix rouge nue sur
##     un carre sombre au bord de l'ecran, et se lisait comme ce qu'une croix
##     rouge veut toujours dire : FERMER (Paul, 2026-09-17 : « il n'y a pas
##     de bouton pour se mettre en mode X rouge » — il etait a l'ecran). Donc
##     la croix qu'il pose, et le verbe, sur la planche rouge du kit, dans
##     le coin ou repose le pouce droit.
##   • ARME, C'EST LA MEME PLANCHE (Paul, 2026-09-20 : « pour ca utilise la
##     rouge ») : le bois s'assombrit et le libelle devient CANCEL. Une
##     seconde couleur dirait « autre bouton », et c'est le meme qui tient un
##     autre mode.
##   • LE PROJECTEUR (teach-spotlight.tsx) : pendant que le tutoriel demande
##     son X, tout l'ecran s'assombrit sauf ce bouton, sa fleche et la
##     legende qui dit quoi presser. Un pas refuse est un buzz et une case
##     rouge, et un joueur qui n'a pas encore vu le bouton dans le coin lit
##     le buzz comme un jeu casse. Le plateau sombre, il ne reste que ca.
##
## Le bouton lit RunState lui-meme : arme/desarme sur `flag_mode_changed`,
## « rien a marquer » sur `flag_nothing_changed`, la lecon sur
## `teach_changed`, et l'urgence (une bombe de marge) sur `me_changed`.

## La hauteur du bouton : `--rr-back-h: clamp(50px, 9svh, 64px)`.
const H_MIN := 50.0
const H_MAX := 64.0
const H_VH := 0.09
## La legende au-dessus : `max-width: min(280px, 46vw)`, a 20px de la planche.
const HINT_MAX_W := 280.0
const HINT_VW := 0.46
const HINT_GAP := 20.0
## La croix : 9x9 cellules, dessinee a 27 (3 par cellule), en blanc sur le
## bois (Paul, 22 septembre 2026 : « set the X icon color white »).
const CROSS_CELLS := 9
const CROSS_PX := 27.0
## Le bois arme : `brightness(0.72) saturate(1.15)`.
const ARMED_TINT := Color(0.72, 0.66, 0.66)
## L'urgence bat a 700 ms par pas ; la lecon a 0,9 s, la cadence de la case
## qui pulse sur le plateau (TEACH_BEAT_SECONDS) — c'est ce qui lie les deux.
const URGE_SECONDS := 0.7
const TEACH_BEAT_SECONDS := 0.9
## Le projecteur : l'air autour de ce qui reste allume, et son noir.
const SPOT_PAD := 8.0
const SPOT_DARK := Color(0.0, 0.0, 0.0, 0.66)
## La fleche : le chevron dore du coffre, 72 de haut, qui monte et descend.
const ARROW_SIZE := 72.0
const ARROW_INK := Color("#ffd45c")

## Le bouton a ete presse : ce qu'il demande (le RunState decide).
signal toggled(armed: bool)

var _button: Button
var _plank: NineSlice
var _cross: Control
var _label: Label
var _hint: PanelContainer
var _hint_label: Label
var _arrow: Control
var _spot: Control
var _armed := false
var _nothing := false
var _urge := false
var _teach := false
var _clock := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Le projecteur SOUS le bouton et sa legende : ce sont eux qui restent
	# allumes, et ils sont dessines apres.
	_spot = Control.new()
	_spot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spot.draw.connect(_draw_spot)
	_spot.visible = false
	Kit.fill(_spot)
	add_child(_spot)

	_hint = Kit.caption("", true)
	_hint_label = _hint.get_child(0) as Label
	_hint.visible = false
	_hint.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_hint.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_hint.grow_vertical = Control.GROW_DIRECTION_BEGIN
	add_child(_hint)

	_button = Button.new()
	_button.focus_mode = Control.FOCUS_NONE
	_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_button.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_button.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_button.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_button.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_button.pressed.connect(_on_pressed)
	add_child(_button)

	_plank = Kit.plank("danger")
	Kit.fill(_plank)
	_button.add_child(_plank)

	# La croix et le verbe sur une ligne, centres sur la planche. Le web a
	# regle a la main que les deux s'alignent (Paul, 2026-09-20 : « remonte la
	# bomb et baisse le text ») ; ici une ligne centree suffit, la croix
	# n'ayant pas de meche.
	var row := Kit.hbox(Kit.PAD)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	Kit.fill(row)
	_button.add_child(row)
	_cross = Control.new()
	_cross.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cross.custom_minimum_size = Vector2(CROSS_PX, CROSS_PX)
	_cross.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_cross.draw.connect(_draw_cross)
	row.add_child(_cross)
	_label = Kit.label("", 14, Palette.CREAM, true)
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.uppercase = true
	row.add_child(_label)

	_arrow = Control.new()
	_arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_arrow.draw.connect(_draw_arrow)
	_arrow.visible = false
	add_child(_arrow)

	var state := RunState.current
	state.flag_mode_changed.connect(_on_flag_mode)
	state.flag_nothing_changed.connect(_on_flag_nothing)
	state.teach_changed.connect(_on_teach)
	state.me_changed.connect(_on_me)
	_armed = state.flag_mode
	_nothing = state.flag_nothing
	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	get_viewport().size_changed.connect(_measure)
	_on_teach()
	_on_me()
	_relabel()
	_measure()


## LA MISE EN PAGE : la planche au coin bas-droit, a Kit.EDGE du bord ; la
## legende 20px au-dessus, alignee a droite ; la fleche centree sur la planche
## — dessinee comme SON enfant sur le web, parce que la largeur du bouton
## suit son libelle et change avec la langue (Paul, 2026-09-20 : « trop petit
## et pas centre »).
func _measure() -> void:
	var view := get_viewport_rect().size
	var h := height_for(view.y)
	var font := _label.get_theme_font("font")
	var text_w := font.get_string_size(_label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	var w := ceilf(2.0 * (Kit.NOTICE_CAP + 8.0) + CROSS_PX + Kit.PAD + text_w)
	_button.offset_right = -Kit.EDGE
	_button.offset_left = -Kit.EDGE - w
	_button.offset_bottom = -Kit.EDGE
	_button.offset_top = -Kit.EDGE - h

	var hint_w := minf(HINT_MAX_W, view.x * HINT_VW)
	_hint.offset_right = -Kit.EDGE
	_hint.offset_left = -Kit.EDGE - hint_w
	_hint.offset_bottom = -(Kit.EDGE + h + HINT_GAP)
	_hint.offset_top = _hint.offset_bottom

	_arrow.size = Vector2(ARROW_SIZE, ARROW_SIZE)
	_arrow.position = Vector2(view.x - Kit.EDGE - w * 0.5 - ARROW_SIZE * 0.5, view.y - Kit.EDGE - h - ARROW_SIZE - 4.0)
	_spot.queue_redraw()


static func height_for(view_h: float) -> float:
	return clampf(view_h * H_VH, H_MIN, H_MAX)


func _relabel() -> void:
	_label.text = I18N.shout(I18N.t("run.markCancel" if _armed else "run.markBomb"))
	_hint_label.text = I18N.t("run.markHint") if _armed else (I18N.t("run.markNothing") if _nothing else "")
	_hint.visible = not _hint_label.text.is_empty()
	_plank.tint = ARMED_TINT if _armed else Color.WHITE
	_arrow.visible = _teach and not _armed
	_spot.visible = _teach and not _armed
	_measure()


func _on_pressed() -> void:
	toggled.emit(not _armed)
	RunState.current.set_flag_mode(not _armed)


func _on_flag_mode(armed: bool) -> void:
	_armed = armed
	_relabel()


func _on_flag_nothing(nothing: bool) -> void:
	_nothing = nothing
	_relabel()


## La lecon est ouverte ET le lapin est a cote de la bombe : c'est le moment
## ou le X peut vraiment etre pose, et ce que la fleche attend.
func _on_teach() -> void:
	var state := RunState.current
	_teach = state.taught_bomb >= 0 and state.teach_ready
	_relabel()


## L'URGENCE : sous une bombe de marge, ce bouton est la sortie, et il le dit
## en battant (energy-coach.tsx). Jamais sur le tutoriel, ou la lecon prime.
func _on_me() -> void:
	var subject := RunState.current.subject()
	var energy := int(subject.get("energy", 0))
	_urge = not subject.is_empty() and energy > 0 and energy <= Tuning.i("ENERGY.BOMB_LOSS")


## LE CLAVIER : X arme, Echap desarme — sans repetition, sans modificateur.
func _unhandled_input(event: InputEvent) -> void:
	if not visible or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo or key.ctrl_pressed or key.meta_pressed or key.alt_pressed:
		return
	if key.keycode == KEY_X:
		RunState.current.set_flag_mode(not _armed)
		get_viewport().set_input_as_handled()
	elif key.keycode == KEY_ESCAPE and _armed:
		RunState.current.set_flag_mode(false)
		get_viewport().set_input_as_handled()


## Desarme quand le bouton quitte l'ecran (recap, eruption, regard) : un mode
## laisse arme d'une ile a l'autre ferait du premier pas de la suivante un
## pari que personne n'a place.
func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree() and _armed and _current_exists():
		RunState.current.set_flag_mode(false)


func _current_exists() -> bool:
	return RunState._current != null


func _process(delta: float) -> void:
	_clock += delta
	var tint := Color.WHITE
	if _armed:
		tint = ARMED_TINT
	elif _teach:
		# La fleche monte et descend sur la cadence de la case qui pulse, et
		# le bois bat avec elle — par pas, jamais en fondu.
		var beat := fmod(_clock, TEACH_BEAT_SECONDS) / TEACH_BEAT_SECONDS
		var view := get_viewport_rect().size
		_arrow.position.y = view.y - Kit.EDGE - height_for(view.y) - ARROW_SIZE - 4.0 + sin(beat * TAU) * 6.0
		tint = Color(1.15, 1.15, 1.15) if beat < 0.5 else Color.WHITE
	elif _urge:
		tint = Color(1.15, 1.15, 1.15) if fmod(_clock, URGE_SECONDS) < URGE_SECONDS * 0.5 else Color.WHITE
	if _plank.tint != tint:
		_plank.tint = tint


## LA CROIX, cellule par cellule : deux diagonales epaisses de deux cellules
## sur une grille de 9, avec une cellule de marge — le chemin SVG du web,
## rasterise.
func _draw_cross() -> void:
	var cell := CROSS_PX / CROSS_CELLS
	for y in range(1, CROSS_CELLS - 1):
		for x in range(1, CROSS_CELLS - 1):
			if absi(x - y) <= 1 or absi(x + y - (CROSS_CELLS - 1)) <= 1:
				_cross.draw_rect(Rect2(x * cell, y * cell, cell, cell), Color.WHITE)


## LE CHEVRON vers le bas, en cellules de 6 sur une grille de 12 : la meme
## fleche dorée que le coffre porte, pour que les deux moities du geste soient
## marquees dans un seul langage.
func _draw_arrow() -> void:
	var cell := ARROW_SIZE / 12.0
	for i in 6:
		# Deux branches qui descendent vers le centre, epaisses de deux cellules.
		for t in 2:
			_arrow.draw_rect(Rect2((i) * cell, (i + t + 2) * cell, cell, cell), ARROW_INK)
			_arrow.draw_rect(Rect2((11 - i) * cell, (i + t + 2) * cell, cell, cell), ARROW_INK)


## LE PROJECTEUR : le noir partout, sauf les boites de la planche, de la
## fleche et de la legende. Sans masque en canvas, le noir est decoupe en
## bandes : pour chaque bande horizontale entre deux bords de trous, on peint
## ce qu'aucun trou ne couvre.
func _draw_spot() -> void:
	var view := _spot.size
	var holes: Array[Rect2] = []
	for node in [_button, _arrow, _hint]:
		if node.visible:
			holes.append(Rect2(node.global_position - _spot.global_position, node.size).grow(SPOT_PAD))
	var ys: Array[float] = [0.0, view.y]
	for h in holes:
		ys.append(clampf(h.position.y, 0.0, view.y))
		ys.append(clampf(h.end.y, 0.0, view.y))
	ys.sort()
	for i in ys.size() - 1:
		var y0: float = ys[i]
		var y1: float = ys[i + 1]
		if y1 - y0 <= 0.0:
			continue
		var mid := (y0 + y1) * 0.5
		var spans: Array[Vector2] = []
		for h in holes:
			if h.position.y <= mid and h.end.y >= mid:
				spans.append(Vector2(maxf(0.0, h.position.x), minf(view.x, h.end.x)))
		spans.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
		var x := 0.0
		for s in spans:
			if s.x > x:
				_spot.draw_rect(Rect2(x, y0, s.x - x, y1 - y0), SPOT_DARK)
			x = maxf(x, s.y)
		if x < view.x:
			_spot.draw_rect(Rect2(x, y0, view.x - x, y1 - y0), SPOT_DARK)
