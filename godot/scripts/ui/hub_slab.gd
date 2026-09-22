class_name HubSlab
extends Button
## LA DALLE D'UNE CARTE — CLAIM, HARVEST, UPGRADE (`.rr-hub-btn.nine-btn`,
## globals.css).
##
## Le web a d'abord passe ces boutons par le kit (PxButton, un nine-slice a
## biseau pixel), et les trois cartes offraient trois dalles orange
## identiques : « t'as pas changer les boutton ! ». La couleur ne disait
## rien de l'action. Alors le kit est cache et la face est peinte a plat :
## un contour de 2 px, un rayon de 10, une LEVRE eclairee de 3 px au pied et
## une ombre portee de 2 px qui donne l'epaisseur. La pression enfonce la
## dalle dans son ombre plutot que de l'ecraser.
##
## CHAQUE VERBE A SON TON, echantillonne sur la maquette de Paul
## (2026-09-19) : prendre une recompense est l'orange de la carotte, la plus
## forte des trois parce que c'est celle qui paie ; la recolte est le vert du
## jardin, sa propre pousse et non un cadeau ; l'amelioration est le brun de
## la terre, la plus discrete parce que depenser n'est pas gagner.
##
## ETEINTE, PAS GRISEE. Un jardin vide ne se recolte pas, et la maquette n'a
## pas d'etat pour ca : la dalle garde sa forme et perd sa lumiere, ce qui se
## lit « pas encore » et non « casse ». Une pierre chaude sur le parchemin,
## pas un trou sombre, pour survivre au fondu de 50 %.

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
	var t: Dictionary = TONES[tone]
	return t["ink"] if _lit else t["off_ink"]


func _restyle() -> void:
	var t: Dictionary = TONES[tone]
	var face: Color = t["face"] if _lit else t["off_face"]
	var shadow: Color = t["shadow"] if _lit else t["off_shadow"]
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		var s := StyleBoxFlat.new()
		s.bg_color = face
		s.set_border_width_all(int(LINE))
		s.border_color = shadow
		s.set_corner_radius_all(int(RADIUS))
		# L'ombre portee est DANS la boite du bouton — un temps elle pendait
		# sous lui sur une marge, la seule longueur de la carte qui ne scalait
		# pas, et c'etait les derniers pixels de debordement a chaque taille.
		s.shadow_color = shadow if (_lit and state != "pressed") else Color.TRANSPARENT
		s.shadow_offset = Vector2(0, DROP)
		s.shadow_size = 0
		s.set_content_margin_all(0)
		add_theme_stylebox_override(state, s)
	queue_redraw()


## La levre eclairee au pied, dans le contour ; et la lumiere du haut, la ou
## le degrade du web est plus clair (`color-mix(face 88%, #fff)`).
func _draw() -> void:
	var t: Dictionary = TONES[tone]
	var face: Color = t["face"] if _lit else t["off_face"]
	var lip: Color = t["lip"] if _lit else t["off_shadow"]
	var lip_h := LIP - 1.0 if button_pressed else LIP
	var inner := Rect2(LINE + 2.0, size.y - LINE - lip_h, size.x - 2.0 * (LINE + 2.0), lip_h)
	draw_rect(inner, lip)
	if _lit:
		var light := Rect2(LINE + 3.0, LINE, size.x - 2.0 * (LINE + 3.0), 2.0)
		draw_rect(light, face.lerp(Color.WHITE, 0.12))


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
