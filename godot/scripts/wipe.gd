extends CanvasLayer
class_name Wipe
## LE RIDEAU DES TRAVERSEES — le contrat, et rien d'autre.
##
## Porte de src/game/fx/RandomWipe.ts.
##
## POURQUOI UN CONTRAT PLUTOT QU'UN EFFET. Le web en a CINQ — trois iris (une
## carotte, un crane, une bombe), un rideau qui balaie, et la scene sortante qui
## s'effrite en sable — tires au sort a chaque traversee. Sa raison est nette :
## « un effet vu cent fois n'est plus un effet, c'est un ecran de chargement ».
## Ce qui varie entre eux n'est PAS un parametre — l'iris decoupe un trou, le
## rideau peint une bande, le sable retire des pixels de la scene elle-meme —
## donc ils ne s'heritent pas, ils se rangent derriere un contrat commun.
##
## Une seule variante est portee pour l'instant. Les quatre autres se
## brancheront ici sans rien deplacer, ce qui est tout l'interet d'avoir pose le
## contrat d'abord.
##
## LE MOMENT DE LA BASCULE EST LA CHOSE A NE PAS SE TROMPER, et il depend de la
## variante :
##
##   • UN OBTURATEUR (un iris qui se ferme) a un MILIEU : un instant ou l'ecran
##     est couvert. La bascule s'y cache, et c'est la seule place ou elle ne se
##     voit pas.
##   • UN FONDU N'EN A PAS. Aucun instant ne couvre tout, donc la scene revelee
##     doit deja etre a l'ecran, DESSOUS, avant que l'opacite ne bouge. La
##     bascule se fait donc EN PREMIER — « `midpoint` runs FIRST, not at a
##     midpoint » (CurtainWipe.ts:251).
##
## D'ou `swap_first` : chaque variante declare quand elle veut la bascule, et
## l'appelant n'a pas a savoir laquelle joue.

## LA DUREE, en secondes. `WIPE_CLOSE_MS + WIPE_OPEN_MS` du web (580 + 680).
##
## Les deux moities d'un meme geste additionnees : un fondu n'a pas de milieu,
## donc pas deux temps — un seul, de cette longueur.
const SWEEP_SECONDS := 1.26

## LE TEMPS NOIR AU MILIEU, en secondes. `WIPE_HOLD_MS` du web (500).
##
## N'A DE SENS QUE POUR UN OBTURATEUR — un fondu n'a pas de milieu, donc rien a
## y tenir. C'est le repit que la bascule s'offre pendant que l'ecran est
## couvert : `show_place` bascule des lieux entiers et leurs CanvasLayer, et ce
## travail doit tomber dans le noir, pas dans la premiere image de la
## reouverture.
const HOLD_SECONDS := 0.5

## LA BASCULE SE FAIT-ELLE AVANT LE GESTE, ou en son milieu ?
##
## Vrai pour un fondu (rien ne couvre l'ecran), faux pour un obturateur. Une
## variante qui se trompe la-dessus ne plante pas : elle montre la couture, ce
## qui est pire — ca se lit comme un bug d'affichage et pas comme un effet.
var swap_first := true

## Fire quand le geste est fini, rideau range.
signal finished

## FIRE QUAND LE LIEU NEUF COMMENCE A SE VOIR — la reouverture, apres le noir.
## Ce qui a une ENTREE (la colonne, la barre du haut) la joue ici : jouee a la
## bascule, elle se finissait sous le noir et l'ui etait deja la en rouvrant.
signal opening


func _ready() -> void:
	# PAR-DESSUS TOUT. L'etage Wipe de main.tscn est a 100 ; un rideau pose
	# ailleurs laisserait passer le chrome par-dessus lui.
	layer = 100
	visible = false


## JOUE LE GESTE, en appelant `swap` au bon moment.
##
## `swap` est la bascule elle-meme — ce que `Screens.show_place` fait. Le
## rideau ne sait pas ce qu'elle change, et c'est voulu : il ne connait qu'un
## instant, pas une destination.
##
## LA BASCULE A TOUJOURS LIEU, meme si le geste echoue. C'est la regle du web :
## « The change always happens; the flourish is what is optional. » Un rideau
## casse doit laisser passer le joueur, pas l'enfermer.
func play(swap: Callable) -> void:
	push_error("[wipe] play() n'est pas implemente par cette variante")
	swap.call()
	opening.emit()
	finished.emit()


## Le cadre a change de taille.
func resize() -> void:
	pass
