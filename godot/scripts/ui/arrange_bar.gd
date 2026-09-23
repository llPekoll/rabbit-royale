class_name ArrangeBar
extends Control
## LA BARRE D'AMENAGEMENT — au pied de l'ecran pendant qu'on deplace ses
## arbres, sa maison, son potager (burrow.gd `set_arranging`).
##
## UNE LIGNE QUI DIT QUOI FAIRE, TROIS BOUTONS. La ligne change avec le geste
## (« touche un arbre… » les mains vides, « touche une case allumee… » quand
## on tient quelque chose) : c'est tout le mode d'emploi, et il n'y a rien
## d'autre a apprendre. Les boutons sont les planches du jeu, a la hauteur
## d'un pouce (MIN_H), et la rangee se partage la largeur de l'ecran : sur un
## telephone debout, trois planches tiennent cote a cote sans deborder.
##
## La barre ne capte que ses boutons : le reste de sa boite laisse passer les
## tapes au plateau, qui en a besoin jusqu'au bas de l'ecran.

signal save_pressed
signal cancel_pressed
signal reset_pressed

const MIN_H := 48.0
const MAX_W := 560.0
const GAP := 8.0
const EDGE := 10.0
const HINT_SIZE := 12
const LABEL_SIZE := 14

var _hint: Label
var _note: PanelContainer
var _save: PlankButton
var _cancel: PlankButton
var _reset: PlankButton
var _column: VBoxContainer


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_column = Kit.vbox(GAP)
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_column)

	_note = Kit.plank_note("", HINT_SIZE)
	_note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hint = _note.get_child(0)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_column.add_child(_note)

	var row := Kit.hbox(GAP)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_child(row)
	_cancel = _plank(row, cancel_pressed)
	_reset = _plank(row, reset_pressed)
	_save = _plank(row, save_pressed)
	_save.board = PlankButton.Board.GOLD

	_relabel()
	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	get_viewport().size_changed.connect(_measure)
	_measure()


func _plank(row: HBoxContainer, sig: Signal) -> PlankButton:
	var b: PlankButton = preload("res://scenes/plank_button.tscn").instantiate()
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.custom_minimum_size = Vector2(0, MIN_H)
	b.label_size = LABEL_SIZE
	b.pressed.connect(func() -> void: sig.emit())
	row.add_child(b)
	return b


## Ce que le terrier dit de l'amenagement (`Burrow.arrange_state`).
func show_state(state: Dictionary) -> void:
	var held := bool(state.get("held", false))
	var saving := bool(state.get("saving", false))
	_hint.text = I18N.t("arrange.place") if held else I18N.t("arrange.pick")
	_save.disabled = saving
	_cancel.disabled = saving
	_reset.disabled = saving
	_measure()


func _relabel() -> void:
	_save.relabel(I18N.shout(I18N.t("arrange.save")))
	_cancel.relabel(I18N.shout(I18N.t("arrange.cancel")))
	_reset.relabel(I18N.shout(I18N.t("arrange.reset")))
	if _hint.text.is_empty():
		_hint.text = I18N.t("arrange.pick")


## Au pied de l'ecran, centree, jamais plus large que MAX_W ni que l'ecran
## moins ses bords.
func _measure() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var w := minf(MAX_W, view.x - EDGE * 2.0)
	_column.size = Vector2(w, 0)
	_column.reset_size()
	_column.size.x = w
	var h := _column.get_combined_minimum_size().y
	_column.position = Vector2((view.x - w) * 0.5, view.y - h - EDGE) - global_position
