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


func _ready() -> void:
	Screens.host(_world, _screen)
	var chrome: Control = preload("res://scenes/chrome.tscn").instantiate()
	_chrome.add_child(chrome)
	Screens.show_doorstep()
	DevShot.arm(self)
