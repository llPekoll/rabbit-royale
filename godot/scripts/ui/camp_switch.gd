class_name CampSwitch
extends Control
## L'INTERRUPTEUR DU CAMP : les deux pistes de la maquette 05 (verte au
## bouton a droite, ardoise au bouton a gauche), decoupees avec leur bouton,
## le mot efface puis repose ici dans la langue du joueur.
##
## Meme contrat que PixelSwitch : `set_on` lit l'etat sans bruit, `toggle`
## est le doigt, `toggled` le dit.

signal toggled(on: bool)

const ON := preload("res://assets/ui/camp/switch-on.png")
const OFF := preload("res://assets/ui/camp/switch-off.png")
## Ou se lit le mot sur chaque piste (fractions de la largeur) : du cote que
## le bouton a quitte.
const WORD_ON := Vector2(0.14, 0.58)
const WORD_OFF := Vector2(0.46, 0.89)

var on := false
var disabled := false:
	set(v):
		disabled = v
		_reflect()
var _track: TextureRect
var _word: Label
## Les mots du dernier `set_on`, pour le doigt.
var _words: Array = ["ON", "OFF"]


func _init(font_px: float = 14.0) -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_track = CampStyle.picture(ON)
	Kit.fill(_track)
	add_child(_track)
	_word = CampStyle.text("", font_px, CampStyle.TEXT, true)
	_word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_word)
	resized.connect(_layout)


## Pose l'etat sans animation (lecture des reglages).
func set_on(v: bool, words: Array = ["ON", "OFF"]) -> void:
	on = v
	_words = words
	_word.text = String(words[0] if v else words[1])
	_reflect()


## Le doigt : bascule, et le dit.
func toggle(words: Array = ["ON", "OFF"]) -> void:
	if disabled:
		Sound.deny()
		return
	set_on(not on, words)
	# Un petit tassement, le retour du doigt.
	pivot_offset = size * 0.5
	scale = Vector2(0.94, 0.94)
	create_tween().tween_property(self, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	toggled.emit(on)


## UNE TAPE, UNE BASCULE. Au doigt, Godot rejoue chaque toucher en clic
## (`emulate_mouse_from_touch`) : basculer sur le relache du toucher ET sur
## celui du clic remettait l'interrupteur ou il etait (Music et Sound effects
## ne changeaient plus au Seeker, 2026-10-08). Le clic seul suffit, il porte
## aussi le doigt ; au relache, s'il n'a pas glisse (TouchScroll).
func _gui_input(event: InputEvent) -> void:
	if TouchScroll.tapped(self, event):
		toggle([_word_for(true), _word_for(false)])
		accept_event()


func _word_for(v: bool) -> String:
	return String(_words[0] if v else _words[1])


func _reflect() -> void:
	if _track == null:
		return
	_track.texture = ON if on else OFF
	_word.add_theme_color_override("font_color", CampStyle.TEXT if on else Color("#c9d3d8"))
	modulate.a = 0.55 if disabled else 1.0
	_layout()


func _layout() -> void:
	var span := WORD_ON if on else WORD_OFF
	_word.position = Vector2(size.x * span.x, 0)
	_word.size = Vector2(size.x * (span.y - span.x), size.y)
