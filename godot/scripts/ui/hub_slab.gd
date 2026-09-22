class_name HubSlab
extends Button
## LE BOUTON D'UNE CARTE — CLAIM, HARVEST, UPGRADE (`.rr-hub-btn`).
##
## Porte d'abord comme la dalle plate de globals.css (maquette de Paul du
## 19 septembre : face, contour, levre eclairee). Mais la peau des bois
## (woodland/runtime.tsx) repeint ces boutons au rendu en BANDEAUX a
## feuilles — vert pour la recolte, dore pour le reste —, et c'est ce que le
## web montre aujourd'hui. `_restyle` suit donc le rendu, pas la feuille de
## style (2026-09-23). `tone` garde ses trois noms pour les cartes.
##
## Les tons : face, levre, ombre, encre — et les memes eteints.
const TONES := {
	"carrot": {"face": Color("#d96626"), "lip": Color("#ffa157"), "shadow": Color("#793513"), "ink": Color.WHITE,
		"off_face": Color("#5a3320"), "off_shadow": Color("#2f1a10"), "off_ink": Color("#9a8270")},
	"green": {"face": Color("#417f41"), "lip": Color("#6ac07a"), "shadow": Color("#244220"), "ink": Color.WHITE,
		"off_face": Color("#b9a288"), "off_shadow": Color("#8a745c"), "off_ink": Color("#4a3524")},
	"earth": {"face": Color("#635038"), "lip": Color("#92866e"), "shadow": Color("#37291c"), "ink": Color.WHITE,
		"off_face": Color("#b9a288"), "off_shadow": Color("#8a745c"), "off_ink": Color("#4a3524")},
}

const LINE := 2.0
const RADIUS := 10.0
const LIP := 3.0
const DROP := 2.0
## Le pied d'une dalle sur un ecran court (`.rr-hub-btn { min-height: 30px }`).
const MIN_H := 30.0

var tone := "carrot"
## Ce que la dalle porte : une colonne centree, que l'appelant remplit.
var content: VBoxContainer

var _lit := true


func _init(which: String = "carrot", height: float = 32.0) -> void:
	tone = which
	custom_minimum_size = Vector2(0, maxf(height, MIN_H))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	focus_mode = Control.FOCUS_NONE
	# Le Button ne peint pas de mot : c'est `content` qui les porte, et un
	# label a deux lignes (UPGRADE et son prix) n'entre pas dans `text`.
	text = ""
	content = Kit.vbox(2)
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(content)
	Kit.fill(content)
	button_down.connect(_sink.bind(true))
	button_up.connect(_sink.bind(false))
	_restyle()


## ALLUMER ou eteindre la dalle. Eteinte, elle ne se presse pas.
func set_lit(on: bool) -> void:
	_lit = on
	disabled = not on
	_restyle()


func ink() -> Color:
	return Kit.plank_ink(_board())


## LE BANDEAU DU WEB, pas la dalle plate. La peau des bois (woodland/
## runtime.tsx) repeint `.rr-hub-btn` au rendu : un bandeau VERT pour la
## recolte, DORE pour le reste (la recompense, l'amelioration). La dalle
## peinte que decrit globals.css ne s'affiche plus nulle part — c'est ce
## bandeau que le joueur voit (verifie a 890x400, 2026-09-23). Eteint, il
## garde sa matiere et perd la moitie de sa lumiere, comme `:disabled`.
func _board() -> String:
	return "green" if tone == "green" else "gold"


func _restyle() -> void:
	var s := StyleBoxTexture.new()
	s.texture = Kit.plank_texture(_board())
	s.texture_margin_left = Kit.NOTICE_CAP
	s.texture_margin_right = Kit.NOTICE_CAP
	s.set_content_margin_all(0)
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		add_theme_stylebox_override(state, s)
	modulate.a = 1.0 if _lit else 0.55
	for l in content.find_children("*", "Label", true, false):
		(l as Label).add_theme_color_override("font_color", ink())


func _sink(down: bool) -> void:
	content.position.y = DROP if down else 0.0
	queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()


## Un mot sur la dalle, a la taille de la carte.
func add_word(text: String, size: int) -> Label:
	var l := Kit.label(I18N.shout(text), size, ink())
	l.uppercase = I18N.pixel_face()
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.clip_text = true
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(l)
	return l


## Une ligne de prix : le chiffre, puis la marque de carotte.
func add_price(text: String, size: int, mark: Control) -> HBoxContainer:
	var row := Kit.hbox(Kit.PAD_TIGHT)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(Kit.label(text, size, ink()))
	row.add_child(mark)
	content.add_child(row)
	return row
