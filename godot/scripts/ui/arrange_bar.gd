class_name ArrangeBar
extends Control
## LE BANDEAU DE CE QU'ON TIENT — au pied de l'ecran, a la place de DIG ·
## DEFEND · RAID, tant qu'un arbre, la maison ou le potager est pris
## (burrow.gd `_tell_arrange`). Il s'en va des qu'on pose ou qu'on repose.
##
## L'AMENAGEMENT RESTE SANS MODE (Peko, 2026-09-23 : « on va faire plus
## simple ») : on n'entre nulle part, on prend. Mais une fois la chose en main
## le joueur ne savait ni quoi faire ni comment lacher — au doigt il n'y a pas
## de survol, et rien ne disait « touche une case ». Le bandeau est donc
## l'etat du geste, pas un mode : CE QU'ON TIENT (en or), CE QU'ON FAIT (ou,
## sur une case refusee, POURQUOI), et REPOSER, la sortie qu'un pouce trouve.
##
## Il ne capte que son bouton : le reste laisse passer les tapes au plateau.

signal put_back

## `--rr-loop-h` : la hauteur des planches du sol, que le bandeau remplace.
const MIN_H := 52.0
const MAX_W := 620.0
## Assez pour REPOSER, DEVOLVER, PUT BACK a 14 px, bouts feuillus compris.
const BACK_W := 124.0
const NAME_SIZE := 15
const HINT_SIZE := 12
## Le refus secoue le bandeau : le non se voit la ou l'on regarde.
const NUDGE_PX := 5.0

var _row: HBoxContainer
var _note: PanelContainer
var _name: Label
var _hint: Label
var _back: PlankButton
var _why := ""
var _touch := false
## Apres une pose : « pose », et le bouton devient ANNULER (burrow.gd
## `_offer_undo`).
var _placed := false


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_row = Kit.hbox(Kit.PAD_TIGHT)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_row)

	# LE TEXTE SUR LA FACE DU BOIS, pas sur ses bords : la face commence a
	# 8 % de la planche et s'arrete a 85 % (la levre sombre, puis l'ombre), et
	# la vrille du bout droit mord ses 18 derniers pixels. Avec 6 en haut et
	# en bas et 12 a droite, le nom s'ecrivait sur l'arete du haut et la fin
	# de la ligne sous la vrille (« conseguir chegar » en portugais). Dix en
	# haut : le lisere clair de l'arete en mange trois.
	var plank := Kit.style_plank(2.0, 20.0, 10.0)
	plank.content_margin_bottom = 11.0
	_note = Kit.panel(plank)
	_note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_note.custom_minimum_size.y = MIN_H
	_row.add_child(_note)
	var words := Kit.vbox(0)
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	words.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_note.add_child(words)
	_name = Kit.label("", NAME_SIZE, Palette.RANK_GOLD, true)
	words.add_child(_name)
	_hint = Kit.label("", HINT_SIZE, Palette.CREAM, true)
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	words.add_child(_hint)

	_back = preload("res://scenes/plank_button.tscn").instantiate()
	# UNE LARGEUR A ELLE : la planche ajuste son libelle a sa taille, et une
	# planche sans largeur dans la rangee le faisait tomber a rien.
	_back.custom_minimum_size = Vector2(BACK_W, MIN_H)
	_back.label_size = 14
	_back.pressed.connect(func() -> void: put_back.emit())
	_row.add_child(_back)

	_relabel()
	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	get_viewport().size_changed.connect(_measure)
	_measure()


## `{what, why}` (burrow.gd `_tell_arrange`) : le nom de ce qu'on tient, et
## le refus de la case visee, vide si elle accepte.
func show_state(state: Dictionary) -> void:
	_name.text = I18N.shout(String(state.get("what", "")))
	_why = String(state.get("why", ""))
	_touch = bool(state.get("touch", false))
	_placed = bool(state.get("placed", false))
	_relabel()


## UN REFUS A LA TAPE : le bandeau tremble « non », comme le X faux de l'ile.
func nudge() -> void:
	var home := _row.position.x
	var tw := create_tween()
	for i in 5:
		var a := NUDGE_PX * (1.0 - i / 5.0) * (1.0 if i % 2 == 0 else -1.0)
		tw.tween_property(_row, "position:x", home + a, 0.045)
	tw.tween_property(_row, "position:x", home, 0.04)


func _relabel() -> void:
	if not _why.is_empty():
		_hint.text = _why
		_hint.add_theme_color_override("font_color", Palette.CAPTION_DANGER_INK)
	else:
		_hint.text = I18N.t("arrange.placed" if _placed else ("arrange.placeTouch" if _touch else "arrange.place"))
		_hint.add_theme_color_override("font_color", Palette.CREAM)
	_back.relabel(I18N.shout(I18N.t("arrange.undo" if _placed else "arrange.putBack")))
	_measure()


## Au pied de l'ecran, centre, a la place de la barre du sol.
func _measure() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var w := minf(MAX_W, view.x - Kit.EDGE * 2.0)
	# LA LIGNE QUI SE REPLIE N'A PAS DE LARGEUR A ELLE : mesuree avant d'avoir
	# ete posee, elle cassait apres chaque lettre et le bandeau montait
	# jusqu'au milieu de l'ecran (Paul, 2026-09-23, fenetre plein ecran). On
	# lui donne donc la place qui lui reviendra : la rangee, moins le bouton,
	# l'ecart et les marges de la planche.
	var pad := _note.get_theme_stylebox("panel").get_minimum_size().x
	_hint.custom_minimum_size.x = maxf(0.0, w - BACK_W - Kit.PAD_TIGHT - pad)
	_row.size = Vector2(w, 0.0)
	_row.reset_size()
	_row.size.x = w
	var h := _row.get_combined_minimum_size().y
	_row.position = Vector2(floorf((view.x - w) * 0.5), view.y - h - Kit.EDGE) - global_position
