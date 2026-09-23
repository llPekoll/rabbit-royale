extends Node2D
class_name Ocean
## LA MER ET TOUT CE QUI VIT DEDANS, en un seul noeud a poser sous n'importe
## quel lieu : le degrade (SeaGradient), l'ecume (PackWater), les rochers
## (SeaRocks) et les canards (Ducks).
##
## L'ile et le terrier du web passent tous les deux par IsoIslandView et ont
## donc la meme mer. Ici chaque lieu recopiait ses quatre noeuds a la main, et
## le terrier en avait oublie la moitie. Une scene, un appel : `build`.
##
## CE NOEUD NE DESSINE RIEN, et c'est ce qui permet de le glisser dans un lieu
## sans rien deranger : ses enfants gardent leur `z_index` (relatif, et lui
## reste a 0), donc l'ecume, les rochers et les canards se trient toujours sur
## `Iso.depth` CONTRE les blocs du terrain, comme s'ils en etaient freres.
## La mer, elle, est un CanvasLayer — fixe a l'ecran, voir sea_gradient.gd ; et
## screens.gd eteint les CanvasLayer d'un lieu en profondeur, donc aussi celui-ci.
##
## A PLACER APRES LE TERRAIN dans l'arbre : a profondeur egale, un canard ou un
## rocher au sud d'une case de terre doit passer DEVANT elle, et c'est l'ordre
## de l'arbre qui tranche les egalites.

@onready var foam: PackWater = $Foam
@onready var rocks: SeaRocks = $Rocks
@onready var ducks: Ducks = $Ducks


## POSE LA MER AUTOUR DE `map`, qui doit etre deja taillee : l'ecume borde la
## terre, les rochers ne vont que dans l'eau qu'elle laisse.
##
## L'ORDRE COMPTE : les rochers avant les canards, qui doivent savoir ou ils
## sont pour ne pas nager dedans.
##
## `seed_text` nourrit les memes flux que le web (`:sea-rocks`, `:ducks`) : la
## meme graine pose toujours les memes rochers et la meme mare.
func build(map: BurrowMap, seed_text: String) -> void:
	foam.map = map
	foam.build()
	rocks.map = map
	rocks.seed_text = seed_text
	rocks.build()
	ducks.map = map
	ducks.seed_text = seed_text
	ducks.rocks = rocks
	ducks.build()


func clear() -> void:
	foam.clear()
	rocks.clear()
	ducks.clear()
