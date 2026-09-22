extends Node2D
## LE TERRIER — l'un des deux LIEUX residents.
##
## Il n'est pas monte et demonte comme un ecran : construit une fois, il reste
## dans l'arbre et se contente d'apparaitre et de disparaitre (voir
## screens.gd). Le joueur fait l'aller-retour avec l'ile sans arret, et
## reconstruire a chaque passage rechargerait les atlas a chaque DIG.
##
## POUR L'INSTANT il ne porte que son sol. Le homestead, le potager, les
## clotures, les pieges et le lapin viendront s'y poser — tous freres du
## terrain dans le meme tri, ce qui laisse un caillou proche passer devant une
## falaise lointaine sans qu'on arbitre a la main.

## Le plateau tient dans 890x400 a cette echelle : il fait 792 de large sur 528
## de haut, donc c'est la HAUTEUR qui commande.
const FIT := 0.62

@onready var _terrain: BurrowTerrain = %Terrain
@onready var _props: BurrowProps = %Props

var _seed := 1
var _quit: PlankButton


func _ready() -> void:
	_add_quit()
	show_ground(_seed)
	get_viewport().size_changed.connect(_frame)
	_frame()


## LE SOL D'UN TERRIER DONNE.
##
## Rappelable avec une autre graine : c'est ainsi qu'on entrera dans le terrier
## de quelqu'un d'autre pour un raid, sans remonter la scene. Le web a un
## raccourci que ce portage reprendra le moment venu — si la graine n'a pas
## change, il ne refait rien et se contente d'ajuster.
func show_ground(seed_value: int) -> void:
	_seed = seed_value
	_terrain.map = BurrowMap.new()
	_terrain.map.generate(seed_value)
	_terrain.build()
	# Les decors lisent LE MEME relief : une maison posee sur un autre terrain
	# que celui qu'on voit flotterait.
	_props.map = _terrain.map
	_props.build(seed_value)


## LA PORTE DE SORTIE.
##
## Elle existe d'abord pour nous : sans elle, une session ouverte envoie droit
## en jeu et il n'y a plus aucun moyen de revoir l'accueil — ni de tester le
## wallet, ni les langues, ni le premier ecran tout court.
##
## Elle vit dans un CanvasLayer parce qu'elle ne doit pas suivre le plateau :
## le terrier est un Node2D qu'on met a l'echelle et qu'on deplace pour cadrer
## le sol, et un bouton accroche dedans retrecirait avec lui.
func _add_quit() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	_quit = preload("res://scenes/plank_button.tscn").instantiate()
	_quit.custom_minimum_size = Vector2(220, 44)
	_quit.size = Vector2(220, 44)
	_quit.position = Vector2(12, 12)
	_quit.relabel(I18N.t("sign_out"))
	_quit.pressed.connect(_on_quit)
	layer.add_child(_quit)


## Deconnexion : on oublie le jeton et on revient a l'accueil.
##
## La session prevenant tout le monde par son signal, la socket se ferme d'elle
## meme — elle ecoute `Session.changed` et sait qu'un joueur parti n'a plus
## rien a ecouter.
func _on_quit() -> void:
	Session.sign_out()
	Screens.show_doorstep()


## Centre le plateau dans le cadre.
##
## Provisoire : la vraie camera aura trois cadrages nommes — la maison de pres,
## le plateau entier pour poser un piege, et le meme pour un raid. Celui-ci
## tient lieu des trois en attendant qu'il y ait quelque chose a cadrer.
func _frame() -> void:
	var view := get_viewport_rect().size
	scale = Vector2(FIT, FIT)
	# Le losange va de x=84 a x=876 et de y=96 a y=528 : son milieu est a
	# (480, 312) dans l'espace du terrain.
	position = view * 0.5 - Vector2(480, 312) * FIT
