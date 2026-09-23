extends Node
## LES POINTEURS DU KIT, sur PC.
##
## Les memes PNG que le web (public/assets/ui/cursors, --cur-* dans
## globals.css), a leur taille native et avec les memes points chauds : la
## fleche pointe de sa pointe, la main du bout du doigt, l'interdit de son
## centre. Taille native pour la meme raison que sur le web : l'OS pose le
## curseur sans filtrage, et seul un multiple entier garde les pixels carres.
##
## Les Control qui demandent CURSOR_POINTING_HAND (plank_button, back_button…)
## recoivent la main sans rien changer chez eux. Sans souris (Android), rien.

const DIR := "res://assets/ui/cursors/"


func _ready() -> void:
	if OS.has_feature("mobile"):
		return
	Input.set_custom_mouse_cursor(load(DIR + "arrow.png"), Input.CURSOR_ARROW, Vector2(0, 0))
	Input.set_custom_mouse_cursor(load(DIR + "hand.png"), Input.CURSOR_POINTING_HAND, Vector2(5, 0))
	Input.set_custom_mouse_cursor(load(DIR + "denied.png"), Input.CURSOR_FORBIDDEN, Vector2(16, 18))
