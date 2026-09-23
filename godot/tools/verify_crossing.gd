extends SceneTree
## LE GESTIONNAIRE DE SCENES : une seule scene vivante, jamais de reste.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_crossing.gd
##
## ATTENDU : chaque ligne finit par « ok ».
##
## CE QU'IL GARDE. Les bugs que ce gestionnaire remplace (2026-09-23) : l'ile
## vue derriere l'accueil, un plateau de dig a la place du terrier, des boutons
## qui disparaissent. Tous venaient de scenes qui restaient dans l'arbre. On
## mesure donc ce qui RESTE dans l'arbre apres chaque bascule — noeuds, calques,
## chrome — et on compte les CanvasLayer vivants, le piege qui passait a
## travers `visible = false`.
const ScreensS := preload("res://scripts/screens.gd")
var Screens
var _f := 0
var _world: Node2D
var _screen: Control
var _chrome: Control
var _fails := 0


func _init() -> void:
	# L'autoload n'existe pas dans un script SceneTree : on le monte a la main.
	# Les scenes, elles, parlent a l'autoload `/root/Screens` — on lui donne
	# ce nom-la pour qu'elles le trouvent.
	Screens = ScreensS.new()
	Screens.name = "ScreensProbe"
	get_root().add_child(Screens)

	_world = Node2D.new()
	get_root().add_child(_world)
	_screen = Control.new()
	get_root().add_child(_screen)
	_chrome = Control.new()
	get_root().add_child(_chrome)
	Screens.host(_world, _screen, _chrome)


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("%s %s" % [label, "ok" if ok else "ECHEC"])


func _alive() -> int:
	return _world.get_child_count() + _screen.get_child_count()


func _process(_d: float) -> bool:
	_f += 1
	if _f < 2:
		return false

	# Les lieux seuls, sans chrome : le chrome veut toute la session.
	Screens.host(_world, _screen, null)
	# Les calques des autoloads (le marqueur de cadence...) : la ligne de base.
	var base := _layers(get_root())
	Screens.show_place(Screens.Place.BURROW)
	var burrow: Node = Screens.at(Screens.Place.BURROW)
	_check("terrier construit", burrow != null and _alive() == 1)
	_check("ile absente", Screens.at(Screens.Place.ISLAND) == null)

	var ids := {}
	for i in range(5):
		Screens.show_place(Screens.Place.ISLAND)
		ids[Screens.here().get_instance_id()] = true
		_check("sur l'ile : une seule scene", _alive() == 1 and _world.get_child(0) == Screens.here())
		Screens.show_place(Screens.Place.BURROW)
		ids[Screens.here().get_instance_id()] = true
		_check("au terrier : une seule scene", _alive() == 1 and _world.get_child(0) == Screens.here())
	_check("chaque arrivee est neuve (10 noeuds distincts)", ids.size() == 10)
	_check("l'ancien terrier est hors de l'arbre", not burrow.is_inside_tree())

	# LES CALQUES : ceux d'un lieu parti ne doivent plus exister nulle part.
	Screens.show_place(Screens.Place.ISLAND)
	var layers := _layers(get_root())
	var island_layers := _layers(Screens.here())
	_check("seuls les calques de l'ile sont vivants (%d = %d + %d)" % [layers, base, island_layers],
		layers == base + island_layers)

	# L'ACCUEIL vide le monde.
	Screens.show_doorstep()
	_check("accueil : le monde est vide", _world.get_child_count() == 0)
	_check("accueil : une seule scene", _screen.get_child_count() == 1)
	_check("accueil : hors du monde", not Screens.in_world() and Screens.here() == null)

	_walk_empty()
	print("%d echec(s)" % _fails)
	quit(1 if _fails > 0 else 0)
	return true


func _layers(node: Node) -> int:
	var n := 1 if node is CanvasLayer else 0
	for child in node.get_children():
		n += _layers(child)
	return n


## LA PROMENADE, sur des scenes VIDES (tools/empty/) : le gestionnaire seul,
## sans le jeu. 200 pas tires au sort entre l'accueil, le terrier et l'ile,
## chrome compris ; apres chaque pas, UNE scene vivante, la bonne, et les seuls
## calques de l'arbre sont les siens et ceux du chrome.
func _walk_empty() -> void:
	Screens.places = {
		Screens.Place.BURROW: "res://tools/empty/burrow.tscn",
		Screens.Place.ISLAND: "res://tools/empty/island.tscn",
	}
	Screens.doorstep_path = "res://tools/empty/doorstep.tscn"
	Screens.chrome_path = "res://tools/empty/doorstep.tscn"
	Screens.host(_world, _screen, _chrome)
	Screens.show_doorstep()
	var base := _layers(get_root()) - 1
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var bad := 0
	var names := ["accueil", "terrier", "ile"]
	var walk := []
	for i in 200:
		var to := rng.randi_range(0, 2)
		walk.append(names[to])
		var want := ""
		if to == 0:
			Screens.show_doorstep()
			want = "Empty_doorstep"
		else:
			Screens.show_place(Screens.Place.BURROW if to == 1 else Screens.Place.ISLAND)
			want = "Empty_burrow" if to == 1 else "Empty_island"
		var alive := _alive()
		var who: String = (_world.get_child(0) if _world.get_child_count() > 0 else _screen.get_child(0)).name
		var chrome_ok := _chrome.get_child_count() == (0 if to == 0 else 1)
		# Le calque de la scene, plus celui du chrome dans le monde.
		var layers_ok := _layers(get_root()) == base + (1 if to == 0 else 2)
		if alive != 1 or who != want or not chrome_ok or not layers_ok:
			bad += 1
			print("  pas %d (%s) : %d scene(s), %s, chrome=%d, calques=%d"
				% [i, names[to], alive, who, _chrome.get_child_count(), _layers(get_root())])
	print("  promenade : %s ..." % " > ".join(walk.slice(0, 14)))
	_check("promenade de 200 pas sur scenes vides", bad == 0)
