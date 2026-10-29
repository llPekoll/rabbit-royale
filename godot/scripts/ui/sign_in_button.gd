class_name SignInButton
extends Button
## UNE PORTE DE CONNEXION « COMME SUR UN SITE » (2026-10-20) : le bouton blanc
## arrondi, le logo du service a gauche et son nom — Google, e-mail, Apple
## plus tard. Le user : « mets plutot l'icone Google et Apple, un layout un
## peu comme un site web ». Les planches en bois restent aux portes du jeu
## (JOUER, la langue) ; celles-ci se lisent comme ce qu'elles sont, la porte
## d'un compte.
##
## Parle comme une PlankButton la ou l'accueil s'en sert (`relabel`, `wiggle`,
## `wave_delay`), pour prendre sa place sans rien changer autour.

const INK := Color("#1f1f1f")
const PAPER := Color("#ffffff")
const EDGE := Color("#dadce0")
const HOVER := Color("#f2f2f2")
const PRESS := Color("#e3e3e3")
const ICON_PX := 18.0

const ICONS := {
	# Le G officiel des boutons « Sign in with Google », celui que tout le
	# monde reconnait (art-source/google-g-20261020, rendu du SVG de Google).
	"google": preload("res://assets/ui/google-g.png"),
	"email": preload("res://assets/ui/camp/icon-mail.png"),
	# Le symbole SF apple.logo (art-source : rendu par apple_logo.swift), noir
	# sur blanc : le bouton « logo seul » des regles d'Apple.
	"apple": preload("res://assets/ui/apple-logo.png"),
}

## Ignore : la vague de l'accueil anime les planches, pas ces boutons.
var wave_delay := 0.0
var _label: Label
var _icon: TextureRect


static func make(kind: String, words: String) -> SignInButton:
	var b := SignInButton.new()
	b.name = kind.capitalize()
	b._build(kind, words)
	return b


func _build(kind: String, words: String) -> void:
	focus_mode = Control.FOCUS_NONE
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var fill: Color = {"hover": HOVER, "pressed": PRESS}.get(state, PAPER)
		var box := StyleBoxFlat.new()
		box.bg_color = fill
		box.border_color = EDGE
		box.set_border_width_all(1)
		box.set_corner_radius_all(8)
		box.shadow_color = Color(0, 0, 0, 0.18)
		box.shadow_size = 2
		box.shadow_offset = Vector2(0, 2)
		add_theme_stylebox_override(state, box)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(row)
	add_child(row)
	_icon = TextureRect.new()
	_icon.texture = ICONS.get(kind)
	# Seul dans son bouton, le logo prend la place du mot.
	var px := ICON_PX if not words.is_empty() else ICON_PX * 1.25
	_icon.custom_minimum_size = Vector2(px, px)
	_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Un logo lisse, pas du pixel art : reduit en lineaire.
	_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	row.add_child(_icon)
	_label = Label.new()
	_label.text = words
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.add_theme_font_size_override("font_size", 13)
	_label.add_theme_color_override("font_color", INK)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.visible = not words.is_empty()
	row.add_child(_label)


## Sans mots, le logo seul (Apple) : le mot vide prendrait encore sa place.
func relabel(words: String) -> void:
	_label.text = words
	_label.visible = not words.is_empty()


## Le meme refus que la planche : le bouton tremble.
func wiggle() -> void:
	pivot_offset = size * 0.5
	var shake := create_tween()
	shake.tween_property(self, "rotation", deg_to_rad(-3.0), 0.09)
	shake.tween_property(self, "rotation", deg_to_rad(2.0), 0.09)
	shake.tween_property(self, "rotation", 0.0, 0.09)
