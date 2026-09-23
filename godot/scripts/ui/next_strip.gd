extends Button
## LA LIGNE « ET MAINTENANT » — une ligne en tete de la colonne qui dit quoi
## faire (next-strip.tsx).
##
## Tant que l'arc de quetes court, la carte de quete est cette ligne. Quand
## toutes les recompenses sont prises, la ligne vient de `Content.next_action`
## (config/next-action.ts) : le jardin presque plein, le bouclier qui va
## tomber, un terrier qui vaut un raid, ou l'ile. Elle ne disparait jamais :
## un terrier ou rien ne pointe nulle part est une colonne de releves, et la
## boucle est ce pour quoi cette ligne existe.
##
## OR COMME LA CARTE DE QUETE FAITE, parce que ce sont le meme objet a deux
## moments : « voici la prochaine chose ». La face est la terre des cartes
## (FACE_TOP de hub-card.tsx), et l'or qui etait son liseré est le brillant
## du bouton et l'encre de son etiquette.
##
## LA PORTE EST RENDUE, PAS RELUE. La ligne et sa destination sont la MEME
## lecture et voyagent ensemble : le web relisait `next.door` dans le
## handler, et une cible qui s'abritait entre le rendu et le doigt faisait
## passer la porte de 'raid' a 'farm' — la ligne disait « Raid X », le tap
## lancait une fouille. Ce que le joueur a lu est ce qui part.

## Le joueur a presse la ligne ; `door` est celle qu'elle affichait.
signal next_action(door: String)

const FACE := Color("#2d1610")
const BEVEL := Color("#1c0d08")
const GOLD := Color("#ffd138")
const INK := Color("#f5e6d3")
const MIN_H := 44.0
const BEVEL_H := 3.0

var _door := ""
var _row: HBoxContainer
var _label: Label
var _text: Label


func _ready() -> void:
	text = ""
	focus_mode = Control.FOCUS_NONE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(0, MIN_H)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_restyle()

	# L'etiquette a gauche, la phrase a cote, avec le seul ecart d'une
	# etiquette a son texte ; la phrase va a la ligne.
	_row = Kit.hbox(Kit.PAD)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row.alignment = BoxContainer.ALIGNMENT_BEGIN
	add_child(_row)
	_label = Kit.label("", 11, GOLD)
	_label.uppercase = I18N.pixel_face()
	_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_row.add_child(_label)
	_text = Kit.label("", 11, INK)
	Kit.wrapped(_text)
	_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_row.add_child(_text)
	resized.connect(_place)
	pressed.connect(func() -> void: next_action.emit(_door))

	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_code: String) -> void: refresh())
	get_viewport().size_changed.connect(refresh)
	refresh()


## RELIRE le terrier et choisir la ligne. Visible seulement quand il n'y a
## plus de quete a l'affiche et qu'un terrier est charge.
func refresh() -> void:
	visible = Home.loaded() and Home.active_quest().is_empty()
	if not visible:
		return
	var b := Home.burrow
	var live := Home.live_energy()
	var action := Content.next_action({
		"energy": live["energy"],
		"runCost": b.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")),
		"nextRunInMs": b.get("nextRunInMs", null),
		"gardenReady": Home.live_garden(),
		"gardenCapacity": b.get("gardenCapacity", 0),
		"shieldMs": b.get("shieldMs", null),
		# Les pieges et les cibles viennent du sol et de la boutique, pas
		# encore portes : zero et vide, comme un terrier sans defense.
		"trapsLive": 0,
		"targets": [],
	})
	_door = String(action.get("door", "farm"))
	_label.text = I18N.shout(I18N.t("next.label"))
	_text.text = String(action.get("text", ""))
	# `clamp(10px, 1.6svh, 12px)`.
	_text.add_theme_font_size_override("font_size", int(round(clampf(get_viewport_rect().size.y * 0.016, 10.0, 12.0))))
	_place()


## La face de PxButton : une face plate sur une ombre dure, ici la terre sur
## son biseau, et un liseré d'or en haut — le brillant.
func _restyle() -> void:
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		var s := StyleBoxFlat.new()
		s.bg_color = FACE if state != "hover" else FACE.lerp(Color.WHITE, 0.04)
		s.set_border_width_all(2)
		s.border_color = BEVEL
		s.border_width_top = 2
		s.set_corner_radius_all(4)
		s.shadow_color = BEVEL if state != "pressed" else Color.TRANSPARENT
		s.shadow_offset = Vector2(0, BEVEL_H)
		s.shadow_size = 0
		s.content_margin_left = Kit.PAD
		s.content_margin_right = Kit.PAD
		s.content_margin_top = Kit.PAD_TIGHT
		s.content_margin_bottom = Kit.PAD_TIGHT
		add_theme_stylebox_override(state, s)


func _draw() -> void:
	draw_rect(Rect2(4.0, 2.0, size.x - 8.0, 1.0), Color(GOLD, 0.8))


## La ligne prend la place du bouton moins son air, et le bouton grandit si
## la phrase demande deux lignes.
##
## La hauteur voulue se MESURE sur la police, pas sur le minimum du label :
## un label qui va a la ligne a un minimum qui depend de sa largeur, et a
## largeur nulle (avant la premiere mise en page) il empile chaque lettre —
## un minimum enorme, que `custom_minimum_size` ne redescendait jamais.
func _place() -> void:
	if _row == null or size.x <= 0.0:
		return
	var inner_w := maxf(0.0, size.x - 2.0 * Kit.PAD)
	_row.position = Vector2(Kit.PAD, Kit.PAD_TIGHT)
	_row.size = Vector2(inner_w, maxf(0.0, size.y - 2.0 * Kit.PAD_TIGHT))
	var text_w := maxf(1.0, inner_w - _label.get_combined_minimum_size().x - Kit.PAD)
	var font := _text.get_theme_font("font")
	var font_size := _text.get_theme_font_size("font_size")
	var text_h := font.get_multiline_string_size(_text.text, HORIZONTAL_ALIGNMENT_LEFT, text_w, font_size).y
	custom_minimum_size = Vector2(0, maxf(MIN_H, text_h + 2.0 * Kit.PAD_TIGHT))
