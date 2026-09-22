extends Node
## OU L'ON SE TROUVE, et ce qui survit quand ca change.
##
## DEUX REGIMES, ET C'EST TOUTE L'IDEE.
##
## Le doorstep est un ECRAN : on y passe une fois, on n'y revient qu'en se
## deconnectant. Il se monte et se libere comme n'importe quelle scene.
##
## Le terrier et l'ile sont des LIEUX, et le joueur fait l'aller-retour sans
## arret. Ils sont donc construits UNE FOIS au demarrage et ne meurent jamais :
## traverser, c'est basculer une visibilite. Le client web a mis des mois a
## arriver la (src/game/SceneManager.ts) apres avoir fait l'inverse :
##
##   « `start` tears the previous scene down and builds the next from nothing —
##     right for boot, wrong for moving between the burrow and the island,
##     which a player does constantly. Rebuilding there re-decodes the artwork
##     and drops the WebGL state every single time, so the game pauses on a
##     move that should be instant. »
##
## Sur le Seeker, reconstruire l'ile a chaque DIG voudrait dire recharger ses
## atlas a chaque fois. On paie une fois, au depart, et plus jamais.
##
## CE QUI N'EST PAS UN LIEU. Le raid n'a pas sa scene : c'est le terrier avec
## le sol de quelqu'un d'autre (`set_raid`). Le tutoriel non plus : c'est l'ile
## avec une graine prefixee `first:`. Les ajouter comme lieux dupliquerait deux
## fois un rendu de terrain pour que les copies ne servent jamais ensemble.

## Les deux LIEUX residents. L'ordre importe : c'est celui dans lequel ils sont
## construits au demarrage.
enum Place {
	BURROW,
	ISLAND,
}

const PLACES := {
	Place.BURROW: "res://scenes/burrow.tscn",
	Place.ISLAND: "res://scenes/island.tscn",
}

const DOORSTEP := "res://scenes/title.tscn"

## Fire quand le lieu visible change, une fois la bascule faite.
signal moved(place: Place)

## Fire quand on quitte le doorstep pour le monde, et inversement.
signal world_shown(shown: bool)

## Le lieu a l'affiche. N'a de sens que si `in_world()`.
var place: Place = Place.BURROW

## LA FRONTIERE ECRAN/JEU, et elle merite son propre drapeau.
##
## Le web l'appelle `showCanvas` et son commentaire dit pourquoi il ne faut PAS
## deduire cet etat de la presence d'un joueur :
##
##   « Every piece of chrome reads `showCanvas`, never `player` — that was the
##     bug: `player` arrives the instant the wallet answers, so the sign-in
##     column, the lore and the burrow's panels all swapped BEFORE the shutter
##     had closed. »
##
## Autrement dit : etre connecte et etre dans le monde sont deux choses, et la
## seconde n'arrive qu'au noir du rideau.
var _in_world := false

## Vrai tant qu'une traversee est en cours. Pendant ce temps AUCUN des deux
## chromes n'est affiche — trois etats et non deux, sinon le HUD de l'ile
## apparait au-dessus du terrier pendant que l'obturateur se ferme.
var crossing := false

var _world_host: Node = null
var _screen_host: Node = null
var _screen: Node = null
var _built: Dictionary = {}


func in_world() -> bool:
	return _in_world


## Appele une fois par la racine, qui declare ses deux points d'accroche.
func host(world: Node, screen: Node) -> void:
	_world_host = world
	_screen_host = screen


## LE DOORSTEP, monte comme un ecran ordinaire.
func show_doorstep() -> void:
	_in_world = false
	_swap_screen(DOORSTEP)
	world_shown.emit(false)


## CONSTRUIT LES DEUX LIEUX, une fois pour toutes.
##
## A appeler quand le joueur est connu, pas avant : les deux scenes veulent son
## terrier et sa graine. Les construire ENSEMBLE et non l'une puis l'autre —
## elles partagent la plupart de leurs textures, et la seconde profite des
## chargements de la premiere.
func build_world() -> void:
	for id in PLACES:
		var path: String = PLACES[id]
		if path.is_empty():
			continue
		if _built.has(id):
			continue
		var node: Node = (load(path) as PackedScene).instantiate()
		# Construit CACHE et au repos : un lieu qu'on ne regarde pas ne doit ni
		# se dessiner ni consommer une image par seconde.
		node.visible = false
		node.set_process(false)
		node.set_process_input(false)
		_world_host.add_child(node)
		# APRES `add_child`, parce que les CanvasLayer d'un lieu naissent dans
		# son `_ready` : eteints avant, ils n'existent pas encore et le lieu
		# cache repeindrait son chrome des la premiere image. Meme raison qu'en
		# traversee, voir `_show_layers`.
		_show_layers(node, false)
		_built[id] = node


## TRAVERSER — la bascule elle-meme, sans rideau.
##
## Ce n'est pas une destruction : les deux lieux restent dans l'arbre, seule
## leur visibilite change. C'est ce qui rend la traversee instantanee.
##
## Le rideau est la responsabilite de l'appelant : c'est lui qui sait quand se
## situe le noir, et c'est LA que cette fonction doit etre appelee.
func show_place(id: Place) -> void:
	if not _built.has(id):
		push_warning("[screens] lieu %d pas encore construit" % id)
		return

	# Le doorstep cede le cadre au monde.
	if not _in_world:
		_in_world = true
		if _screen != null:
			_screen.queue_free()
			_screen = null
		world_shown.emit(true)

	for other in _built:
		var node: Node = _built[other]
		# `== id` sur une cle de Dictionary ne porte pas de type : il faut le
		# dire, sinon GDScript refuse d'inferer le booleen.
		var here: bool = other == id
		node.visible = here
		# LES CanvasLayer D'UN LIEU NE SUIVENT PAS SA VISIBILITE, et c'est le
		# piege que la premiere traversee sur le Seeker a montre d'un coup :
		# `visible = false` sur un Node2D cache ses enfants Node2D, mais un
		# CanvasLayer n'est PAS dans cet arbre de rendu — il a le sien.
		#
		# Resultat sur l'appareil : le bouton « ← TERRIER » de l'ile restait
		# affiche par-dessus le terrier, et la mer de l'ile (elle aussi dans un
		# CanvasLayer, a -100) se voyait derriere lui. Deux lieux superposes,
		# chacun montrant la moitie de l'autre.
		#
		# On les eteint donc explicitement. Recursif : un lieu peut en porter
		# plusieurs a des profondeurs differentes (l'ile a sa mer sous le monde
		# et son chrome au-dessus).
		_show_layers(node, here)
		# Le lieu qu'on quitte cesse de tourner : sans ca, deux terrains
		# animent leurs nuages et leurs oiseaux en permanence, pour que l'un
		# des deux ne soit jamais regarde.
		node.set_process(here)
		node.set_process_input(here)

	place = id
	moved.emit(id)


## LE RIDEAU, pose par la racine s'il y en a un.
##
## Facultatif : sans lui, `cross` bascule nu. C'est la regle du web — « The
## change always happens; the flourish is what is optional. »
var _wipe: Wipe = null


func host_wipe(wipe: Wipe) -> void:
	_wipe = wipe


## TRAVERSER AVEC LE GESTE — ce que le jeu appelle.
##
## `show_place` reste la bascule NUE, et c'est voulu : le rideau a besoin de
## l'appeler lui-meme, au moment qu'il choisit (au milieu, pour un obturateur).
## Un appelant ordinaire passe par ici.
##
## `crossing` EST LEVE PENDANT TOUT LE GESTE. Ce drapeau est declare depuis le
## premier jour sans avoir servi ; sa raison est dans son commentaire — trois
## etats et non deux. Avec un iris il garde surtout une seconde tape d'entrer
## en collision avec le geste en cours.
func cross(id: Place) -> void:
	if id == place and _in_world:
		return
	if _wipe == null:
		show_place(id)
		return
	if crossing:
		# Un rideau deja en vol : on ne le double pas. Le web re-vise le sien en
		# cours de route (`retarget`) ; ici on laisse finir, ce qui est le
		# comportement sur lequel un joueur ne peut pas se tromper.
		return
	crossing = true
	_wipe.finished.connect(func() -> void: crossing = false, CONNECT_ONE_SHOT)
	_wipe.play(func() -> void: show_place(id))


## Le lieu vivant, pour qui doit lui parler — c'est ainsi qu'on entre en raid
## (`burrow.set_raid(...)`) ou qu'on change d'ile (`island.set_island(seed)`),
## JAMAIS en remontant la scene.
func here() -> Node:
	return _built.get(place, null)


func at(id: Place) -> Node:
	return _built.get(id, null)


## ETEINT OU RALLUME LES CanvasLayer D'UN LIEU, en profondeur.
##
## Un CanvasLayer dessine dans son propre arbre : la visibilite du Node2D qui
## le porte ne l'atteint pas. Sans ce parcours, un lieu cache continue de
## peindre tout ce qu'il a mis dans un layer — son chrome, son ciel, sa mer.
static func _show_layers(node: Node, shown: bool) -> void:
	for child in node.get_children():
		if child is CanvasLayer:
			(child as CanvasLayer).visible = shown
		_show_layers(child, shown)


func _swap_screen(path: String) -> void:
	if _screen_host == null:
		push_error("[screens] aucune racine : appelez Screens.host() d'abord")
		return
	var fresh := (load(path) as PackedScene).instantiate()
	var stale := _screen
	_screen = fresh
	_screen_host.add_child(fresh)
	if stale != null:
		# `queue_free` et non `free` : l'ecran sortant peut etre au milieu d'un
		# appel reseau, et le liberer sur-le-champ planterait au retour.
		stale.queue_free()
