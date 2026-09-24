class_name CloseButton
extends TextureButton
## LE [x] DE TOUS LES PANNEAUX — une touche de bois carree, biseautee, au
## pixel (tools/draw-close-square.py), dans ses cinq etats : repos, survol,
## enfonce, eteint, et le focus clavier en anneau d'or par-dessus.
##
## TOUJOURS DANS SON PANNEAU, en haut a droite, a la marge du contenu : le
## panneau le pose (Dialog `_place_close`), il ne deborde jamais du cadre.
## Kit.close_button() le fabrique.
##
## Le dessin fait Kit.CLOSE_SIZE (32, deux pixels d'ecran par pixel d'art a
## l'echelle 1) ; le doigt en a Kit.CLOSE_TAP (44). La zone de tap deborde du
## dessin par `_has_point`, pas par la mise en page : un en-tete n'a pas a
## grandir de 12px pour un doigt.

const NORMAL := preload("res://assets/ui/close-normal.png")
const HOVER := preload("res://assets/ui/close-hover.png")
const PRESSED := preload("res://assets/ui/close-pressed.png")
const DISABLED := preload("res://assets/ui/close-disabled.png")
const FOCUS := preload("res://assets/ui/close-focus.png")


func _init() -> void:
	texture_normal = NORMAL
	texture_hover = HOVER
	texture_pressed = PRESSED
	texture_disabled = DISABLED
	texture_focused = FOCUS
	ignore_texture_size = true
	stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	custom_minimum_size = Vector2(Kit.CLOSE_SIZE, Kit.CLOSE_SIZE)
	size = custom_minimum_size
	size_flags_horizontal = Control.SIZE_SHRINK_END
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND


## L'anneau d'or est celui du CLAVIER : un clic prend le focus, et l'anneau
## restait allume sous la souris (une touche kit_row survit a son clic).
func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and not event.pressed:
		release_focus.call_deferred()


func _has_point(point: Vector2) -> bool:
	var grow := (Kit.CLOSE_TAP - Kit.CLOSE_SIZE) * 0.5
	return Rect2(Vector2.ZERO, size).grow(grow).has_point(point)
