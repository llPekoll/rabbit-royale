extends Node
## LE GESTIONNAIRE DE SCENES — une seule scene vivante a la fois.
##
## LA REGLE, et elle n'a pas d'exception : changer d'endroit, c'est DETRUIRE ce
## qui etait la et CONSTRUIRE ce qui vient. Rien n'est garde cache, rien n'est
## « adapte ».
##
## POURQUOI (2026-09-23). La premiere version gardait le terrier et l'ile
## construits une fois et basculait leur visibilite, comme le SceneManager du
## web. Sur Godot ca fuyait de partout : un CanvasLayer ne suit pas la
## visibilite de son parent, donc chaque lieu cache devait eteindre ses calques
## a la main ; la deconnexion ne cachait rien du tout, et l'ile se voyait
## derriere l'accueil ; un drapeau `crossing` leve au milieu du rideau faisait
## disparaitre la barre DIG · DEFEND · RAID pour de bon au retour du terrier.
## Trois bugs, une seule cause : deux mondes dans l'arbre, et du code pour
## faire semblant qu'il n'y en a qu'un.
##
## Maintenant il n'y en a qu'un. Un noeud RETIRE de l'arbre emporte tout avec
## lui — ses Node2D, ses CanvasLayer, ses boutons, son `_process` — dans la
## meme image. Il n'y a plus rien a cacher.
##
## LE PRIX, et pourquoi il est petit. Reconstruire l'ile a chaque DIG refait
## son terrain. Les textures, elles, ne se relisent pas : les PackedScene sont
## gardees chargees ici (`_packed`), et une PackedScene tient ses ressources —
## le cache de Godot les rend sans aller au disque.
##
## LE CHROME SUIT LA MEME REGLE. Il est construit en entrant dans le monde et
## detruit en revenant a l'accueil ; et ses panneaux propres a un lieu (la
## colonne, le sol du terrier) sont reconstruits a chaque traversee, voir
## chrome.gd `_mount_place`.
##
## CE QUI N'EST PAS UNE SCENE. Le raid est le terrier avec le sol d'un autre
## (`set_raid`) ; le tutoriel est l'ile avec une graine prefixee `first:`.

## Les lieux du monde.
enum Place {
	BURROW,
	ISLAND,
}

## Des `var` et non des `const` : une sonde peut y mettre des scenes vides
## (tools/verify_crossing.gd) pour tester le gestionnaire sans le jeu.
var places := {
	Place.BURROW: "res://scenes/burrow.tscn",
	Place.ISLAND: "res://scenes/island.tscn",
}

var doorstep_path := "res://scenes/title.tscn"
var chrome_path := "res://scenes/chrome.tscn"

## Fire quand le lieu a change, la scene neuve deja dans l'arbre.
signal moved(place: Place)

## Fire quand on quitte le doorstep pour le monde, et inversement.
signal world_shown(shown: bool)

## Fire apres CHAQUE changement d'etat — lieu, monde, fin de rideau. Ce qu'un
## panneau ecoute pour recalculer sa visibilite : un seul signal, donc pas de
## transition oubliee.
signal changed

## Le lieu a l'affiche. N'a de sens que si `in_world()`.
var place: Place = Place.BURROW

## LA FRONTIERE ECRAN/JEU. Etre connecte et etre dans le monde sont deux
## choses (web `showCanvas`) : la seconde n'arrive qu'au noir du rideau.
var _in_world := false

## Vrai tant qu'un rideau est en vol. Garde une seconde tape d'en lancer un
## autre pendant le geste.
var crossing := false

var _world_host: Node = null
var _screen_host: Node = null
var _chrome_host: Node = null

## LA scene vivante : le doorstep ou un lieu. Jamais deux.
var _current: Node = null
var _chrome: Node = null
var _packed: Dictionary = {}


func in_world() -> bool:
	return _in_world


## Appele une fois par la racine, qui declare ses points d'accroche.
func host(world: Node, screen: Node, chrome: Node = null) -> void:
	_world_host = world
	_screen_host = screen
	_chrome_host = chrome


## L'ACCUEIL. Detruit le lieu ET le chrome : rien du monde ne survit.
func show_doorstep() -> void:
	var was_in_world := _in_world
	_in_world = false
	crossing = false
	_drop_chrome()
	_set_screen_host_shown(true)
	_mount(doorstep_path, _screen_host)
	if was_in_world:
		world_shown.emit(false)
	changed.emit()


## CHARGE les scenes du monde sans les construire — pour que le premier DIG ne
## paie pas la lecture du disque. Facultatif : `show_place` charge a la
## demande.
func build_world() -> void:
	for id in places:
		_scene(places[id])
	_scene(chrome_path)


## LA BASCULE NUE, sans rideau : detruit la scene courante et construit `id`.
##
## Le rideau est la responsabilite de l'appelant (`cross`) : c'est lui qui sait
## ou se situe le noir, et c'est la que cette fonction doit etre appelee.
func show_place(id: Place) -> void:
	var entering := not _in_world
	if entering:
		# Le chrome nait AVANT que le monde soit declare : il se construit cache
		# (`in_world()` faux) et `world_shown` l'ouvre, comme avant.
		_spawn_chrome()
		_set_screen_host_shown(false)
	place = id
	_mount(places[id], _world_host)
	if entering:
		_in_world = true
		world_shown.emit(true)
	moved.emit(id)
	changed.emit()


## LE RIDEAU, pose par la racine s'il y en a un. Facultatif : « The change
## always happens; the flourish is what is optional. »
var _wipe: Wipe = null


func host_wipe(wipe: Wipe) -> void:
	_wipe = wipe


## TRAVERSER AVEC LE GESTE — ce que le jeu appelle.
func cross(id: Place) -> void:
	if id == place and _in_world:
		return
	if _wipe == null:
		show_place(id)
		return
	if crossing:
		return
	crossing = true
	_wipe.finished.connect(func() -> void:
		crossing = false
		changed.emit(), CONNECT_ONE_SHOT)
	_wipe.play(func() -> void: show_place(id))


## LE RIDEAU SANS CHANGER DE LIEU — entrer dans un raid, en revenir. Le
## terrier reste la meme scene, mais son sol devient celui d'un autre : c'est
## un changement d'endroit pour l'oeil, et il se fait sous le noir comme les
## autres (page.tsx, `wipeOver(draw)` sur les deux bouts d'un raid).
##
## `swap` est garde : le lieu qui l'a demande peut mourir pendant le geste.
## Sans rideau, ou pendant une traversee, la bascule a lieu tout de suite.
func curtain(swap: Callable) -> void:
	if _wipe == null or crossing:
		swap.call()
		return
	crossing = true
	_wipe.finished.connect(func() -> void:
		crossing = false
		changed.emit(), CONNECT_ONE_SHOT)
	_wipe.play(func() -> void:
		if swap.is_valid():
			swap.call())


## Le lieu vivant, pour qui doit lui parler (`burrow.set_raid(...)`).
func here() -> Node:
	return _current if _in_world else null


## Le lieu `id` s'il est a l'affiche, null sinon — il n'existe pas ailleurs.
func at(id: Place) -> Node:
	return _current if _in_world and place == id else null


func _scene(path: String) -> PackedScene:
	if not _packed.has(path):
		_packed[path] = load(path) as PackedScene
	return _packed[path]


## DETRUIT LA SCENE COURANTE, puis construit la suivante dans `into`.
##
## `remove_child` d'abord, `queue_free` ensuite : retire de l'arbre, le noeud
## cesse de dessiner, de tourner et de prendre le doigt DES CETTE IMAGE, avec
## tous ses CanvasLayer. `queue_free` et non `free` : on est souvent appele du
## fond d'un signal de cette scene (le bouton qui deconnecte, le rideau), et la
## liberer sous ses propres pieds planterait.
##
## LES DEUX HOTES SONT VIDES, pas seulement `_current` : tout ce qu'on y
## trouve est un reste, et un reste est exactement le bug qu'on chasse.
func _mount(path: String, into: Node) -> void:
	if into == null:
		push_error("[screens] aucune racine : appelez Screens.host() d'abord")
		return
	_clear(_world_host)
	_clear(_screen_host)
	_current = _scene(path).instantiate()
	into.add_child(_current)


func _spawn_chrome() -> void:
	_drop_chrome()
	if _chrome_host == null:
		return
	_chrome = _scene(chrome_path).instantiate()
	_chrome_host.add_child(_chrome)


func _drop_chrome() -> void:
	_clear(_chrome_host)
	_chrome = null


static func _clear(host: Node) -> void:
	if host == null:
		return
	for child in host.get_children():
		host.remove_child(child)
		child.queue_free()


## L'HOTE DU doorstep_path SE CACHE HORS DE L'ACCUEIL. `%Screen` est un Control
## plein ecran en PASS : meme vide, il reste sous le doigt et Godot marque
## l'appui « traite » — aucune tape n'arrivait au plateau (Seeker, 2026-09-22).
func _set_screen_host_shown(shown: bool) -> void:
	if _screen_host is CanvasItem:
		(_screen_host as CanvasItem).visible = shown
