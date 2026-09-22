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
	DeskScale.follow(get_window())
	# LE SON VIT ICI pour la meme raison que le rideau : la boucle d'ambiance
	# doit survivre aux traversees (sound.gd).
	Sound.host(self)
	# Fermer la fenetre passe par `_notification` : le son se tait une image
	# avant que le jeu quitte (sound.gd `silence`).
	get_tree().auto_accept_quit = false
	Screens.show_doorstep()
	DevShot.arm(self)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		Sound.silence()
		await get_tree().process_frame
		get_tree().quit()
