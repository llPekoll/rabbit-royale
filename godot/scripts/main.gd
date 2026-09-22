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

@onready var _world: Node2D = %World
@onready var _screen: Control = %Screen
@onready var _wipe_host: CanvasLayer = %Wipe


func _ready() -> void:
	Screens.host(_world, _screen)
	# LE RIDEAU SE MONTE ICI, dans l'etage qui l'attendait depuis le debut.
	#
	# Cree par le code et pas pose dans la scene : la variante se tirera au sort
	# le jour ou il y en aura plusieurs (voir wipe.gd — le web en a cinq, « un
	# effet vu cent fois n'est plus un effet »). En figer une dans main.tscn
	# interdirait ce tirage.
	var wipe := IrisWipe.new()
	_wipe_host.add_child(wipe)
	Screens.host_wipe(wipe)
	Screens.show_doorstep()
