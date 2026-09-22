class_name BackButton
extends Control
## LE CHEMIN DU RETOUR — un bouton, a une place, sur chaque ecran qui en a
## besoin. Et, sur l'ile, la grande fleche HOME du milieu du sol.
##
## Porte de src/components/back-button.tsx, go-button.tsx et
## run-cost-note.tsx, en gardant ce que ces fichiers ont decide :
##
##   • TROIS ECRANS AVAIENT TROIS SORTIES : la planche GO FARM couleur terre
##     au milieu du sol pour la pose, un petit « Retreat » gris dans le HUD
##     du raid, la grande fleche de l'ile renommee « Stop watching ». Trois
##     formes pour une idee, c'est retrouver la sortie a chaque ecran. C'est
##     toujours ceci maintenant : EN BAS A GAUCHE, la planche de terre, la
##     fleche pixel vers la gauche, un verbe.
##   • EN BAS A GAUCHE (Paul, 2026-09-21 : « met tous les boutons back en bas
##     a gauche, ca gene dig / defence / raid »). Le milieu du sol est la
##     barre des trois verbes ; la droite appartient a MARK BOMB pendant une
##     run. Le coin gauche est le seul libre sur les trois ecrans.
##   • PAS LE HOME DE L'ILE. Quitter une run est L'action principale de la
##     run — elle encaisse la recolte — donc elle garde sa grande fleche au
##     milieu du sol (go-button.tsx) : le mot sur une plaque de verre, la
##     fleche dessous qui voyage sur son axe — c'est la seule chose de
##     l'ecran qui demande a etre pressee, et une fleche immobile ne demande
##     rien. Le bouton lui-meme ne bouge pas : sa zone tactile reste sous le
##     pouce.
##   • LA TERRE, PAS UNE SECONDE PLANCHE SATUREE. Le retour est la sortie
##     d'un mode que le joueur a choisi expres — il sait qu'elle est la, et
##     l'allumer aussi fort que DIG mettrait deux « presse-moi » sur un sol.
##     Pas de tressaillement : une sortie n'est pas une action bruyante.
##   • CE QUE LA RUN VIENT DE COUTER, dit une fois a l'arrivee
##     (run-cost-note.tsx) : la traversee prenait son energie en silence, et
##     le joueur decouvrait 35/60 en rentrant. Un EVENEMENT, pas une jauge de
##     plus — le HUD du raid a deja appris que deux barres se lisent comme
##     une barre videe.
##
## Le chrome decide QUAND : `show_for("placing" | "walling" | "raid" |
## "island" | "watching")` et `dismiss()`.

## Le joueur veut sortir.
signal pressed

## La terre du terrier (burrow-chrome PLANK et SOIL), et ses etats.
const FACE := Color("#5a3a24")
const LIP := Color("#8a5f3d")
const SHADOW := Palette.SOIL
const OFF := Color("#4a3526")
const OFF_INK := Color("#a99483")
## `--rr-bevel` : l'epaisseur sous la face ; la pression l'avale.
const BEVEL := 4.0
const LIP_H := 2.0
## `--rr-back-h: clamp(50px, 9svh, 64px)` — un MINIMUM, pas une hauteur : la
## fleche fait 25px de sprite et 24 d'air, un de plus que l'ancien plancher
## de 48 ne tenait sur le Seeker (la fleche etait rognee).
const MIN_H := 50.0
const MAX_H := 64.0
const H_VH := 0.09
## `--rr-btn-pad` : 6 / 10 / 6 + biseau.
const PAD_Y := 6.0
const PAD_X := 10.0
## Le libelle : clamp(13px, 2.8svh, 18px), en capitales.
const LABEL_MIN := 13
const LABEL_MAX := 18
const LABEL_VH := 0.028
## La fleche a un multiple entier de son sprite, ~24px de haut.
const ARROW_H := 24.0
## La fleche de HOME (go-button.tsx) : le sprite a l'echelle 2.
const GO_ARROW := Vector2(32.0, 20.0)
## Son voyage : quelques pixels sur son axe, en boucle.
const GO_TRAVEL := 6.0
const GO_SECONDS := 0.7
## Le mot de HOME sur sa plaque : le verre des legendes de l'ile.
const PLATE := Palette.CARRY_GLASS
## `NOTE_MS = 6000` : la note du cout reste le temps d'etre lue deux fois.
const COST_SECONDS := 6.0

## Le banc force l'affichage.
var bench_mode := false

var _mode := ""
var _btn: Button
var _row: HBoxContainer
var _arrow: Arrow
var _label: Label
var _lip: ColorRect
var _plate: PanelContainer
var _go_inner: VBoxContainer
var _go_tween: Tween
var _cost: PanelContainer
var _cost_timer: Timer


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_BOTTOM_WIDE)

	_btn = Button.new()
	_btn.focus_mode = Control.FOCUS_NONE
	_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_btn.add_theme_font_size_override("font_size", 1)
	_btn.add_theme_color_override("font_color", Color.TRANSPARENT)
	_btn.pressed.connect(func() -> void: pressed.emit())
	_btn.button_down.connect(func() -> void: _sink(true))
	_btn.button_up.connect(func() -> void: _sink(false))
	add_child(_btn)

	_lip = ColorRect.new()
	_lip.color = LIP
	_lip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_btn.add_child(_lip)

	# La planche : la fleche a gauche du verbe.
	_row = Kit.hbox(Kit.PAD)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_btn.add_child(_row)
	_arrow = Arrow.new()
	_arrow.custom_minimum_size = Vector2(ARROW_H * 0.75, ARROW_H)
	_arrow.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_row.add_child(_arrow)
	_label = Kit.label("", LABEL_MIN, Color.WHITE)
	_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_row.add_child(_label)

	# HOME : le mot sur sa plaque, la fleche dessous, les deux flottant
	# ensemble sur `_go_inner`.
	_go_inner = Kit.vbox(Kit.PAD_TIGHT)
	_go_inner.alignment = BoxContainer.ALIGNMENT_CENTER
	_go_inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_btn.add_child(_go_inner)
	var glass := StyleBoxFlat.new()
	glass.bg_color = PLATE
	glass.content_margin_left = Kit.PAD
	glass.content_margin_right = Kit.PAD
	glass.content_margin_top = Kit.PAD_TIGHT
	glass.content_margin_bottom = Kit.PAD_TIGHT
	_plate = Kit.panel(glass)
	_plate.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_go_inner.add_child(_plate)
	var go_arrow := Arrow.new()
	go_arrow.down = true
	go_arrow.custom_minimum_size = GO_ARROW
	go_arrow.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_go_inner.add_child(go_arrow)

	_cost = Kit.caption("")
	# Une ligne, pas un paragraphe : la legende prend la largeur de ses mots.
	(_cost.get_child(0) as Label).autowrap_mode = TextServer.AUTOWRAP_OFF
	_cost.visible = false
	add_child(_cost)
	_cost_timer = Timer.new()
	_cost_timer.one_shot = true
	_cost_timer.wait_time = COST_SECONDS
	_cost_timer.timeout.connect(func() -> void: _cost.visible = false)
	add_child(_cost_timer)

	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	Screens.world_shown.connect(func(_shown: bool) -> void: _update_visible())
	get_viewport().size_changed.connect(_measure)
	visible = false
	_measure()


# ── L'API du chrome ──────────────────────────────────────────────────────────

## Montrer la sortie d'un mode : "placing" et "walling" (Back), "raid"
## (Retreat), "island" (Home, au milieu du sol), "watching" (Stop watching).
func show_for(mode: String) -> void:
	_mode = mode
	_relabel()
	_measure()
	_update_visible()


func dismiss() -> void:
	_mode = ""
	_stop_go()
	visible = false


func set_disabled(on: bool) -> void:
	_btn.disabled = on
	_restyle()


## CE QUE LA RUN A COUTE, sur l'ile : une legende au-dessus de HOME, six
## secondes. Les mots sont ceux de run-cost-note.tsx, qui ne passent pas par
## le dictionnaire.
func note_run_cost(cost: int, energy: int, max_energy: int) -> void:
	var text: Label = _cost.get_child(0)
	text.text = "⚡ -%d for this run · %d/%d left at the burrow" % [cost, energy, max_energy]
	_cost.visible = true
	_cost_timer.start()
	_measure()


# ── La mise en page ──────────────────────────────────────────────────────────

func _is_go() -> bool:
	return _mode == "island"


func _relabel() -> void:
	var words := ""
	match _mode:
		"raid":
			words = I18N.t("run.retreat")
		"island":
			words = I18N.t("run.home")
		"watching":
			words = I18N.t("run.stopWatching")
		_:
			words = I18N.t("chrome.back")
	_label.text = I18N.shout(words)
	if _plate.get_child_count() == 0:
		_plate.add_child(Kit.label("", 13, Palette.CAPTION_INK))
	var plate_label: Label = _plate.get_child(0)
	plate_label.text = I18N.shout(words)


## En bas a gauche, a `--rr-edge` des deux bords ; HOME au milieu du sol.
func _measure() -> void:
	var view := get_viewport_rect().size
	offset_top = -view.y
	offset_bottom = 0.0
	var go := _is_go()
	_row.visible = not go
	_go_inner.visible = go
	_lip.visible = not go
	_restyle()

	var label_size := int(clampf(view.y * LABEL_VH, LABEL_MIN, LABEL_MAX))
	_label.add_theme_font_size_override("font_size", label_size)

	if go:
		var want := _go_inner.get_combined_minimum_size()
		_btn.size = want + Vector2(Kit.PAD * 2.0, Kit.PAD)
		_btn.position = Vector2(floorf((size.x - _btn.size.x) * 0.5), size.y - Kit.EDGE - _btn.size.y)
		_go_inner.size = want
		_go_inner.position = Vector2(Kit.PAD, 0.0)
		_start_go()
	else:
		_stop_go()
		var min_h := clampf(view.y * H_VH, MIN_H, MAX_H)
		var want := _row.get_combined_minimum_size()
		var h := maxf(min_h, want.y + PAD_Y * 2.0 + BEVEL)
		_btn.size = Vector2(want.x + PAD_X * 2.0, h)
		_btn.position = Vector2(Kit.EDGE, size.y - Kit.EDGE - h)
		_row.size = want
		_row.position = Vector2(PAD_X, floorf((h - BEVEL - want.y) * 0.5))
		_lip.position = Vector2.ZERO
		_lip.size = Vector2(_btn.size.x, LIP_H)

	if _cost.visible:
		var cw := _cost.get_combined_minimum_size()
		_cost.size = cw
		_cost.position = Vector2(floorf((size.x - cw.x) * 0.5), _btn.position.y - Kit.PAD_TIGHT - cw.y)


## La face de terre sur son biseau ; le verre de HOME n'a pas de planche.
func _restyle() -> void:
	if _is_go():
		for st in ["normal", "hover", "pressed", "focus", "disabled"]:
			_btn.add_theme_stylebox_override(st, StyleBoxEmpty.new())
		return
	# LA PLANCHE A FEUILLES du web (`.rr-back-btn`, bois de la peau des
	# bois), plus la dalle de terre plate. Pressee, elle descend d'un cran.
	var off := _btn.disabled
	var face := Kit.style_plank(0.0, 14.0, 0.0)
	for st in ["normal", "hover", "pressed", "focus", "disabled"]:
		_btn.add_theme_stylebox_override(st, face)
	_btn.modulate.a = 0.6 if off else 1.0
	_label.add_theme_color_override("font_color", OFF_INK if off else Color.WHITE)
	_arrow.ink = OFF_INK if off else Color.WHITE
	_arrow.queue_redraw()
	_lip.visible = false


func _sink(down: bool) -> void:
	if _is_go() or _btn.disabled:
		return
	var want := _row.get_combined_minimum_size()
	var h := _btn.size.y
	_row.position.y = floorf((h - BEVEL - want.y) * 0.5) + (BEVEL if down else 0.0)
	_lip.visible = not down


func _start_go() -> void:
	if _go_tween != null and _go_tween.is_valid():
		return
	_go_tween = create_tween().set_loops()
	_go_tween.tween_property(_go_inner, "position:y", GO_TRAVEL, GO_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_go_tween.tween_property(_go_inner, "position:y", 0.0, GO_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _stop_go() -> void:
	if _go_tween != null and _go_tween.is_valid():
		_go_tween.kill()
	_go_tween = null


func _update_visible() -> void:
	visible = not _mode.is_empty() and (bench_mode or Screens.in_world())


## LA FLECHE PIXEL du kit, dessinee en cellules : vers la gauche pour le
## retour, vers le bas pour HOME (« going home is settling back into it »).
class Arrow extends Control:
	var down := false
	var ink := Color.WHITE

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		# Une grille de 6 cellules sur l'axe court, un chevron epais de deux.
		var cells := 6.0
		var u := (size.x if down else size.y) / cells
		var shadow := Color(0.0, 0.0, 0.0, 0.35)
		for pass_index in 2:
			var c := shadow if pass_index == 0 else ink
			var dy := 2.0 if pass_index == 0 else 0.0
			for i in 3:
				# Trois marches vers la pointe, deux cellules d'epaisseur.
				var a := Rect2()
				var b := Rect2()
				if down:
					a = Rect2(i * u, (2 + i) * u + dy, u, 2.0 * u)
					b = Rect2((cells - 1 - i) * u, (2 + i) * u + dy, u, 2.0 * u)
				else:
					# La pointe A GAUCHE : les marches avancent vers elle en
					# descendant. `2 + i` la tournait vers la droite — un « > »
					# sur un bouton RETOUR (2026-09-23).
					a = Rect2((4 - i) * u, i * u + dy, 2.0 * u, u)
					b = Rect2((4 - i) * u, (cells - 1 - i) * u + dy, 2.0 * u, u)
				draw_rect(a, c)
				draw_rect(b, c)
