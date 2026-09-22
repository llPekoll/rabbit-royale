extends SceneTree
## LA TRAVERSEE : les deux lieux survivent-ils a la bascule ?
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_crossing.gd
##
## ATTENDU :
##   construits : terrier=true ile=true
##   blocs au depart : terrier=148 ile=557
##   apres 10 bascules : MEMES noeuds ? terrier=true ile=true
##   blocs apres : terrier=148 ile=557 ... true
##
## CE QU'IL GARDE. Le portage AFFIRME depuis le debut que les deux lieux sont
## construits une fois et ne meurent jamais (voir screens.gd) — « on paie une
## fois, au depart, et plus jamais ». C'est une these, et une these se mesure :
## on compare L'IDENTITE DES NOEUDS et le nombre de blocs de terrain avant et
## apres dix bascules. Si quelque chose reconstruisait en douce, l'identite
## changerait et personne ne le verrait a l'oeil — la scene aurait simplement
## l'air de marcher, en rechargeant ses atlas a chaque passage.
const ScreensS := preload("res://scripts/screens.gd")
var Screens
var _f := 0
var _world: Node2D
var _screen: Control
var _ids := {}

func _init() -> void:
	# L'autoload n'existe pas dans un script SceneTree : on le monte a la main,
	# exactement comme le moteur le ferait.
	Screens = ScreensS.new()
	get_root().add_child(Screens)

	_world = Node2D.new()
	_world.name = "World"
	get_root().add_child(_world)
	_screen = Control.new()
	_screen.name = "Screen"
	get_root().add_child(_screen)
	Screens.host(_world, _screen)

func _process(_d: float) -> bool:
	_f += 1
	if _f < 2:
		return false
	Screens.build_world()
	if _f < 4:
		return false

	var burrow = Screens.at(Screens.Place.BURROW)
	var island = Screens.at(Screens.Place.ISLAND)
	print("construits : terrier=%s ile=%s" % [str(burrow != null), str(island != null)])
	_ids["burrow"] = burrow.get_instance_id()
	_ids["island"] = island.get_instance_id()
	var b0: int = burrow.get_node("%Terrain")._block_at.size()
	var i0: int = island.get_node("%Terrain")._block_at.size()
	print("blocs au depart : terrier=%d ile=%d" % [b0, i0])

	# LA BASCULE, cinq allers-retours.
	for i in range(5):
		Screens.show_place(Screens.Place.ISLAND)
		Screens.show_place(Screens.Place.BURROW)

	var burrow2 = Screens.at(Screens.Place.BURROW)
	var island2 = Screens.at(Screens.Place.ISLAND)
	var same_b: bool = burrow2.get_instance_id() == _ids["burrow"]
	var same_i: bool = island2.get_instance_id() == _ids["island"]
	print("apres 10 bascules : MEMES noeuds ? terrier=%s ile=%s" % [str(same_b), str(same_i)])
	var b1: int = burrow2.get_node("%Terrain")._block_at.size()
	var i1: int = island2.get_node("%Terrain")._block_at.size()
	print("blocs apres : terrier=%d ile=%d (rien n'a ete reconstruit : %s)"
		% [b1, i1, str(b1 == b0 and i1 == i0)])

	# ET L'ETAT DE VISIBILITE / PROCESS
	Screens.show_place(Screens.Place.ISLAND)
	print("sur l'ile : ile.visible=%s terrier.visible=%s" % [str(island2.visible), str(burrow2.visible)])
	print("           ile.process=%s terrier.process=%s"
		% [str(island2.is_processing()), str(burrow2.is_processing())])
	return true
