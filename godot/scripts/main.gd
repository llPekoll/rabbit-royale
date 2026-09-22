extends Control
## LA RACINE — la seule scene qui ne meurt jamais.
##
## Elle ne dessine rien. Son travail est de tenir les etages et de dire a
## `Screens` ou poser les choses. Tout le reste — la session, la socket, la
## langue, le wallet — vit dans les autoloads, hors de l'arbre par
## construction, donc hors d'atteinte de tout changement d'ecran.
##
## POURQUOI LE MONDE NE SE CONSTRUIT PAS ICI. Les deux lieux veulent le terrier
## du joueur et sa graine, qui n'existent pas tant que personne n'est connecte.
## `build_world()` est donc appele a la connexion, pas au demarrage.
##
## LE CHROME, LUI, EST MONTE ICI ET UNE FOIS : il n'a besoin de personne pour
## exister, et il se cache tout seul tant qu'on est sur le doorstep.

@onready var _world: Node2D = %World
@onready var _screen: Control = %Screen
@onready var _chrome: Control = %Chrome
@onready var _wipe_host: CanvasLayer = %Wipe


func _ready() -> void:
	# LA RACINE NE PREND PAS LE DOIGT, et c'est la ligne qui a coute le tutoriel.
	#
	# Cette racine est un Control plein ecran ; le filtre par defaut d'un
	# Control est STOP, et Godot 4 marque un appui « traite » des qu'un Control
	# non IGNORE est dessous — le monde (des Node2D) ne compte pas dans ce
	# choix. Donc chaque tape que le chrome ne prenait pas mourait ici, et
	# `_unhandled_input` de l'ile ne voyait RIEN : les boutons repondaient, les
	# cases jamais. Mesure sur le Seeker le 2026-09-23 avec
	# `gui_get_hovered_control()` : « Control dessous : /root/Main ».
	if self is Control:
		(self as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	Screens.host(_world, _screen)
	var chrome: Control = preload("res://scenes/chrome.tscn").instantiate()
	_chrome.add_child(chrome)
	# LE RIDEAU SE MONTE ICI, dans l'etage qui l'attendait depuis le debut.
	#
	# Cree par le code et pas pose dans la scene : la variante se tirera au sort
	# le jour ou il y en aura plusieurs (voir wipe.gd — le web en a cinq, « un
	# effet vu cent fois n'est plus un effet »). En figer une dans main.tscn
	# interdirait ce tirage.
	var wipe := IrisWipe.new()
	_wipe_host.add_child(wipe)
	Screens.host_wipe(wipe)
	_desk_scale()
	get_window().size_changed.connect(_desk_scale)
	Screens.show_doorstep()
	DevShot.arm(self)


## LE BUREAU A L'ECHELLE 1, comme le web (Paul, 2026-09-23).
##
## Le canevas de 890x400 est la taille du Seeker couche ; `canvas_items` +
## `expand` l'agrandit a la fenetre. Sur un telephone c'est le but. Sur un
## bureau, le chrome sortait 1,55 fois plus gros que le web a 1376x768, et
## les cartes restaient aussi courtes qu'au Seeker (sans leurs lignes fines).
##
## Ici la base SUIT la fenetre, divisee par l'echelle de l'ecran (2 sur un
## Retina) : un pixel de design vaut un pixel CSS, comme dans le navigateur.
## Jamais sous 890x400 : une petite fenetre retombe sur le cadrage du
## telephone plutot que d'ecraser le chrome. Le cout de rendu ne bouge pas —
## `canvas_items` rasterise deja a la resolution de l'ecran (project.godot).
##
## `-- --ui-scale=1` force l'echelle de l'ecran : une capture a 1376x768 est
## alors le 1376x768 CSS du web, quel que soit l'ecran de la machine.
func _desk_scale() -> void:
	if OS.has_feature("mobile"):
		return
	var win := get_window()
	var scale := DisplayServer.screen_get_scale(win.current_screen)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--ui-scale="):
			scale = float(arg.trim_prefix("--ui-scale="))
	scale = maxf(scale, 1.0)
	var logical := Vector2(win.size) / scale
	var base := Vector2i(int(maxf(logical.x, 890.0)), int(maxf(logical.y, 400.0)))
	if win.content_scale_size != base:
		win.content_scale_size = base
