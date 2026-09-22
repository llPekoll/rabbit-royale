extends CanvasLayer
## LE MARQUEUR DE CADENCE — pour savoir si ca rame, partout et tout le temps.
##
## Un autoload et pas un noeud de scene : il doit survivre aux traversees et
## etre la sur le doorstep comme sur l'ile, sans que chaque scene ait a le
## poser. Sa couche est au-dessus du rideau (100) pour qu'une traversee lente —
## precisement le moment qu'on veut mesurer — ne le cache pas.
##
## CE QU'IL AFFICHE, et pourquoi deux chiffres.
##
## Le fps seul ne repond pas a la question. `fx_bench.gd` le dit deja : il est
## borne par le vsync, donc il marque 60 que l'image coute 4 ms ou 16 ms, et ne
## bouge qu'une fois qu'il est trop tard. Pire, c'est une MOYENNE sur la
## seconde : trois images a 40 ms au milieu de cinquante-sept images propres se
## lisent « 57 fps », et le a-coup qu'on a senti dans la main a disparu du
## chiffre.
##
## Alors on montre aussi le PIRE temps d'image de la fenetre. C'est lui qui dit
## le a-coup, parce qu'un a-coup EST une image longue isolee. Quand la ligne
## affiche « 60 · 31ms », tout va bien en moyenne et pourtant quelque chose a
## saute — c'est exactement l'information qu'on cherche.
##
## LES COULEURS disent l'etat sans qu'on lise les chiffres : vert tant que le
## pire tient dans le budget, ambre quand il le depasse, rouge quand il le
## double. On regarde ailleurs, on voit du rouge apparaitre du coin de l'oeil.
##
## CACHE PAR DEFAUT (Paul, 2026-09-23) : a 890x400 il s'imprimait sur les
## icones du son et du menu, et il etait dans chaque capture qu'on juge. Il
## reste un outil qu'on allume quand on mesure :
##
##   godot --path godot -- --fps      allume au lancement
##   Cmd+Maj+F (Ctrl+Maj+F ailleurs)  allume ou eteint en cours de partie

## Le budget d'une image a 60 images par seconde. 16.67 ms, arrondi.
const BUDGET_MS := 16.7

## Sur combien d'images on cherche le pire. Une demi-seconde a 60 fps : assez
## long pour attraper un a-coup, assez court pour que l'affichage redevienne
## vert quand c'est passe. Une fenetre de plusieurs secondes garderait un pic
## affiche longtemps apres qu'on a cesse de le provoquer.
const WINDOW := 30

## A quelle cadence on redessine le texte. Rafraichir a chaque image rend le
## chiffre illisible — il papillonne — et fait du travail pour rien.
const REFRESH_SECONDS := 0.25

## LES SEUILS DE COULEUR, en multiples du budget.
const AMBER := Color(1.0, 0.78, 0.25)
const GREEN := Color(0.45, 0.92, 0.5)
const RED := Color(1.0, 0.42, 0.42)

var _label: Label
var _worst_ms := 0.0
var _ring: Array[float] = []
var _since_refresh := 0.0


func _ready() -> void:
	# AU-DESSUS DU RIDEAU. main.tscn met le wipe sur la couche 100 ; une
	# traversee qui saute est justement ce qu'on veut voir sauter.
	layer = 200
	# Le marqueur ne se met jamais en pause avec le jeu : un ecran de pause qui
	# rame doit se voir aussi.
	process_mode = Node.PROCESS_MODE_ALWAYS

	_label = Label.new()
	# EN HAUT A DROITE, et pas a gauche : la barre du haut porte deja l'or et
	# l'energie a gauche, et le coin droit est le seul qui ne recouvre rien sur
	# aucun des deux lieux.
	_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_label.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_label.offset_left = -140.0
	_label.offset_top = 4.0
	_label.offset_right = -6.0
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	# IGNORE : un marqueur qui avale un clic est un bug qu'on mettra une heure a
	# relier a lui.
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Un contour plutot qu'un fond : le fond ferait un rectangle opaque en
	# permanence au-dessus de l'ile, le contour se lit sur le ciel comme sur
	# l'herbe sans rien cacher.
	_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_label.add_theme_constant_override("outline_size", 4)
	add_child(_label)

	_show("--fps" in OS.get_cmdline_user_args())


func _unhandled_key_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key != null and key.pressed and not key.echo and key.keycode == KEY_F \
			and key.shift_pressed and key.is_command_or_control_pressed():
		_show(not visible)
		get_viewport().set_input_as_handled()


## Eteint, il ne mesure rien non plus : le travail de chaque image s'arrete
## avec l'affichage, et la fenetre repart propre quand on le rallume.
func _show(on: bool) -> void:
	visible = on
	set_process(on)
	_ring.clear()
	_since_refresh = REFRESH_SECONDS


func _process(delta: float) -> void:
	# LE TEMPS DE L'IMAGE QUI VIENT DE PASSER. `delta` le donne directement et
	# sans lissage, la ou `TIME_FPS` est deja une moyenne sur la seconde — donc
	# incapable de montrer une image longue isolee.
	var frame_ms := delta * 1000.0
	_ring.append(frame_ms)
	if _ring.size() > WINDOW:
		_ring.pop_front()

	_since_refresh += delta
	if _since_refresh < REFRESH_SECONDS:
		return
	_since_refresh = 0.0

	_worst_ms = 0.0
	for ms in _ring:
		_worst_ms = maxf(_worst_ms, ms)

	_label.text = "%d · %dms" % [Engine.get_frames_per_second(), roundi(_worst_ms)]

	var tint := GREEN
	if _worst_ms > BUDGET_MS * 2.0:
		tint = RED
	elif _worst_ms > BUDGET_MS:
		tint = AMBER
	_label.add_theme_color_override("font_color", tint)
