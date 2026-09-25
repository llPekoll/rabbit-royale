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

## FIRE QUAND LE RIDEAU SE ROUVRE sur le lieu neuf (`Wipe.opening`). Voir
## `on_reveal`.
signal revealed

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
	_warm(places[Place.ISLAND])


## LE PRECHAUFFAGE : construire un lieu une fois, HORS ECRAN, puis le jeter.
##
## Charger la PackedScene ne suffisait pas. Mesure le 2026-09-23 (Mac, sans
## GPU) : la PREMIERE ile construite coutait 327 ms, les suivantes 88 — tout ce
## que le jeu remplit a la premiere demande (tables, cartes, tuning) tombait
## sur le premier DIG, et sur le Seeker ca debordait du temps noir du rideau.
## Et le GPU ajoute sa part que la mesure ne voit pas : en `gl_compatibility`
## un shader se compile a sa premiere image.
##
## D'ou une vraie construction, dans un SubViewport qui ne s'affiche nulle
## part : le `_ready` du lieu tourne en entier, une image est rendue (les
## shaders se compilent), puis tout part. La regle « une scene vivante » tient :
## ce lieu ne recoit ni le doigt ni l'ecran, et vit une image.
##
## Seulement l'ile : le terrier est la premiere scene construite de toute
## facon, a la connexion.
func _warm(path: String) -> void:
	var vp := SubViewport.new()
	vp.size = get_tree().root.size
	vp.transparent_bg = true
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	vp.gui_disable_input = true
	add_child(vp)
	vp.add_child(_scene(path).instantiate())
	# DEUX images : la premiere dessine (UPDATE_ONCE), la seconde laisse le
	# rendu se terminer avant qu'on libere ce qu'il lisait.
	await get_tree().process_frame
	await get_tree().process_frame
	vp.queue_free()


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


## LE MOTIF, de l'accueil au monde : des carres de nuit poussent de droite a
## gauche et couvrent l'accueil ; sous le plein, l'accueil part et le lieu se
## construit ; puis les carres refluent vers la droite et le lieu apparait.
## (shaders/pattern_transition.gdshader, regle au banc
## scenes/bench/pattern_transition_bench.tscn le 2026-09-25 ; remplace la
## poussee floue.)
##
## La regle « une scene vivante » tient : l'accueil vit sous le voile qui
## monte, le lieu sous le voile qui descend, jamais les deux.
##
## `crossing` est leve pendant le geste : les entrees de l'ui attendent la fin
## (`on_reveal`), l'ile retarde son panoramique, une tape n'en relance pas un.
const PUSH_SECONDS := 1.0
## Le temps plein entre les deux sens : la construction du lieu s'y cache.
const PUSH_HOLD := 0.3
const PUSH_LAYER := 90
const PUSH_COLOR := Color(0.09, 0.08, 0.16)
## La tuile en fraction de la HAUTEUR d'ecran : 20 px reels sur les 929 du
## banc (Mac). En pixels fixes, le Seeker aurait des carres deux fois plus fins.
const PUSH_TILE_FRAC := 20.0 / 929.0
const PUSH_TILE_GROWN := 1.75
const PUSH_WIDTH := 0.5


func push(id: Place) -> void:
	if _in_world or crossing or _world_host == null:
		show_place(id)
		return
	crossing = true
	var view := get_viewport()

	var layer := CanvasLayer.new()
	layer.layer = PUSH_LAYER
	add_child(layer)
	# Il prend le doigt pendant tout le geste.
	var veil := ColorRect.new()
	veil.color = PUSH_COLOR
	veil.size = view.get_visible_rect().size
	veil.mouse_filter = Control.MOUSE_FILTER_STOP
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/pattern_transition.gdshader")
	mat.set_shader_parameter("progress", 0.0)
	mat.set_shader_parameter("width", PUSH_WIDTH)
	mat.set_shader_parameter("tile_pixel_size", PUSH_TILE_FRAC * view.get_texture().get_size().y)
	mat.set_shader_parameter("tile_grown_scale", PUSH_TILE_GROWN)
	mat.set_shader_parameter("tile_texture", _square_tile())
	mat.set_shader_parameter("transition_texture", _right_to_left())
	veil.material = mat
	layer.add_child(veil)

	var cover := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	cover.tween_property(mat, "shader_parameter/progress", 1.0, PUSH_SECONDS)
	await cover.finished

	show_place(id)
	await get_tree().create_timer(PUSH_HOLD).timeout

	var uncover := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	uncover.tween_property(mat, "shader_parameter/progress", 0.0, PUSH_SECONDS)
	await uncover.finished

	layer.queue_free()
	crossing = false
	revealed.emit()
	changed.emit()


## Un carre blanc au bord transparent (repeat_disable etire le dernier pixel).
## Demi-cote 0.6 : grossi de PUSH_TILE_GROWN, il deborde sa case et le plein
## est plein.
static func _square_tile() -> Texture2D:
	var g := Gradient.new()
	g.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CONSTANT
	g.set_color(0, Color.WHITE)
	g.set_offset(1, 0.6)
	g.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.width = 64
	tex.height = 64
	tex.fill = GradientTexture2D.FILL_SQUARE
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	return tex


## Le front : noir a droite (couvert d'abord), blanc a gauche.
static func _right_to_left() -> Texture2D:
	var g := Gradient.new()
	g.set_color(0, Color.WHITE)
	g.set_color(1, Color.BLACK)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.width = 256
	tex.height = 1
	return tex


## LE RIDEAU, pose par la racine s'il y en a un. Facultatif : « The change
## always happens; the flourish is what is optional. »
var _wipe: Wipe = null


func host_wipe(wipe: Wipe) -> void:
	_wipe = wipe
	wipe.opening.connect(revealed.emit)


## APPELLE `fn` QUAND LE LIEU SE VOIT : tout de suite sans rideau en vol, a la
## reouverture sinon. Pour les ENTREES de l'ui : `moved` tombe au milieu du
## noir (le temps noir de 500 ms compris), et une entree de 380 ms jouee la
## finissait avant que l'iris ne rouvre — mesure le 2026-09-23 au sortir du
## tutoriel, la colonne a 1.0 a 913 ms, l'iris qui rouvre a 1200 ms.
func on_reveal(fn: Callable) -> void:
	if not crossing:
		# DIFFERE, meme sans rideau : on est appele du montage, et une entree
		# jouee avant la mise en page lirait des places qui ne sont pas les
		# bonnes. Les tris des conteneurs, differes eux aussi, passent avant.
		fn.call_deferred()
	elif not revealed.is_connected(fn):
		revealed.connect(fn, CONNECT_ONE_SHOT)


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
