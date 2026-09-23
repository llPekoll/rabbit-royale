extends Node2D
## LE TERRIER — un des deux LIEUX du monde.
##
## Construit neuf a chaque arrivee et detruit en partant (screens.gd). Ce qu'il
## montre vient de Home, pas de lui : il n'a rien a garder d'une visite a
## l'autre.
##
## POUR L'INSTANT il porte son sol, ses decors et ses clotures. Les pieges et
## le lapin viendront s'y poser — tous freres du terrain dans le meme tri, ce
## qui laisse un caillou proche passer devant une falaise lointaine sans qu'on
## arbitre a la main.

## UNE CASE A ETE TAPEE — pas glissee, pas effleuree : choisie.
##
## Un signal plutot qu'un appel direct : le terrier ne sait pas ce qu'on fait
## d'une case. Poser une bombe, la relever, choisir ou creuser — c'est au jeu
## de le decider, et le plateau ne doit pas avoir a connaitre la liste.
signal tile_tapped(cell: Vector2i)

## LA DUREE DU MOUVEMENT DE CAMERA, et sa courbe.
##
## Le web tween en 0,55 s avec un `back.out(1.3)` — un leger depassement, qui
## fait que la prise ARRIVE quelque part au lieu de s'y garer. Godot n'a pas
## `back` avec un parametre, mais TRANS_BACK/EASE_OUT est la meme courbe.
const CAM_SECONDS := 0.55

## LE SEUIL D'ANNULATION. En dessous, on ne tween pas du tout : un mouvement
## d'un demi-pixel est invisible et coute une demi-seconde pendant laquelle le
## plateau refuse les gestes.
const CAM_EPSILON_SCALE := 0.001
const CAM_EPSILON_POS := 0.5

@onready var _terrain: BurrowTerrain = %Terrain
@onready var _props: BurrowProps = %Props
@onready var _fences: FenceView = %Fences
@onready var _hints: PlacementHints = %Hints
@onready var _rabbit: HomeRabbit = %Rabbit
@onready var _ocean: Ocean = %Ocean

var _seed := 1
var _quit: PlankButton
## Provisoire, avec le bouton de cadrage — voir `_add_quit`.
var _cycle: PlankButton
## Provisoire aussi : la porte vers l'ile, le temps qu'une manche s'y ouvre.
var _cross: PlankButton
var _cam_mode := 0

## LES TROIS FAITS DONT LA CAMERA SE SERT pour choisir sa prise. Ils viendront
## du serveur et des boutons ; ils sont ici pour que la selection existe deja
## et soit mesurable.
var _placing := false
var _walling := false
var _raiding := false

## LE JOUEUR A-T-IL BOUGE LA CAMERA LUI-MEME ?
##
## LE PIEGE QUE CE DRAPEAU EXISTE POUR EVITER : le mode placement est re-arme a
## CHAQUE piege ajoute ou retire, et le raid a CHAQUE pas. Re-resoudre le fit a
## ces moments-la ARRACHERAIT le plateau au joueur des qu'il se penche pour
## regarder un coin. Une fois qu'il a pris le plateau en main, on ne lui reprend
## plus — on se contente de le ramener dans ses bornes.
var _cam_moved_by_player := false

var _cam_tween: Tween


func _ready() -> void:
	# LA BARRE DE DEBOGAGE ne se monte plus que sur demande (`-- --debug-burrow`)
	# depuis que le chrome est branche (2026-09-23) : DIG traverse, DEFEND
	# arme le cadrage de pose, le profil deconnecte — et elle couvrait la
	# barre du haut. Le cycle des quatre cadrages reste la pour qui les regle.
	if "--debug-burrow" in OS.get_cmdline_user_args():
		_add_quit()
	show_ground(_seed)
	get_viewport().size_changed.connect(_reframe)
	frame_camera(true)
	# PROVISOIRE, comme le bouton de cadrage : sans consequence visible, une
	# tape juste ne se distingue pas d'une tape ignoree. Le lapin va sur la
	# case tapee — ca prouve d'un coup que la case resolue est la BONNE, et pas
	# seulement qu'un signal est parti. Remplace des qu'une bombe se pose.
	tile_tapped.connect(_on_tile_tapped)
	# LA MAISON SUIT LE NIVEAU du terrier ; l'achat d'un niveau la fete
	# (BurrowScene.ts `setLevel`). Ce plateau n'est jamais que le sien — la
	# garde du web (« chez soi seulement ») est vraie par construction.
	Home.changed.connect(_follow_level)
	Home.level_up.connect(func(level: int) -> void:
		_props.set_level(level)
		_props.celebrate())
	_follow_level()


func _follow_level() -> void:
	if Home.loaded():
		_props.set_level(int(Home.burrow.get("level", 1)))


func _on_tile_tapped(cell: Vector2i) -> void:
	_rabbit.send_to(cell)


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
	# La mer borde la terre qu'on vient de poser — meme graine que le web
	# (`${seed}:ducks`) : la mare d'un joueur est toujours la meme.
	_ocean.build(_terrain.map, str(seed_value))
	_follow_level()
	# ET LES CLOTURES BORDENT LE CHAMP QUI VIENT D'ETRE SEME, celui-la meme et
	# pas un second tirage de la graine : elles viennent donc APRES le potager,
	# et lisent les cases qu'il a gardees.
	_fences.map = _terrain.map
	_fences.build(_props.field)

	# LES LOSANGES SE MONTENT DANS LES BLOCS DU TERRAIN : ils viennent donc
	# APRES lui, et ils meurent avec lui. C'est le piege n°31 du web —
	# « teardownPlacementHints() AVANT la destruction du terrain » — evite ici
	# par la construction plutot que par un ordre a retenir : `_terrain.build`
	# jette ses blocs et les losanges avec, et on en refait aussitot.
	_hints.map = _terrain.map
	_hints.terrain = _terrain
	_hints.build()

	# LE LAPIN REVIENT AVEC LE SOL SUR LEQUEL IL SE TIENT. `show_ground` tourne
	# a la premiere image ET a chaque changement de terrain — une montee de
	# niveau, ou le passage chez quelqu'un d'autre — et les cases de l'ancien
	# lapin n'existent plus a ce moment-la. On le refait plutot que de le
	# garder.
	_rabbit.map = _terrain.map
	_rabbit.build(seed_value)

	# LA PRISE DEPEND DU RELIEF : les quatre cadrages sont resolus sur les
	# bornes de la terre, et une autre graine en a d'autres. Un terrier voisin
	# affiche avec le cadrage du precedent sortirait du cadre.
	#
	# Et le drapeau du joueur tombe : c'est un AUTRE plateau, pas celui qu'il
	# tenait.
	_cam_moved_by_player = false
	if is_node_ready():
		frame_camera(true)


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
	_quit.relabel(I18N.shout(I18N.t("profile.disconnect")))
	_quit.pressed.connect(_on_quit)
	layer.add_child(_quit)

	# LE BOUTON DE CADRAGE — provisoire, et pour la meme raison que la porte de
	# sortie : sans lui, trois des quatre prises ne sont atteignables que par un
	# etat de jeu qui n'existe pas encore (un piege qu'on pose, une cloture
	# qu'on achete, un raid). Il disparaitra quand ces etats arriveront.
	_cycle = preload("res://scenes/plank_button.tscn").instantiate()
	_cycle.custom_minimum_size = Vector2(220, 44)
	_cycle.size = Vector2(220, 44)
	_cycle.position = Vector2(244, 12)
	_cycle.relabel("CAM: HOME")
	_cycle.pressed.connect(_on_cycle)
	layer.add_child(_cycle)

	# LA TRAVERSEE VERS L'ILE.
	#
	# Provisoire comme les deux autres : dans le jeu on part sur l'ile en
	# choisissant une manche, pas en appuyant sur un bouton de debogage. Mais
	# sans lui l'ile n'est atteignable que par une scene-sonde, donc rien de ce
	# qui a ete bati depuis trois commits n'est JOUABLE.
	_cross = preload("res://scenes/plank_button.tscn").instantiate()
	_cross.custom_minimum_size = Vector2(220, 44)
	_cross.size = Vector2(220, 44)
	_cross.position = Vector2(476, 12)
	_cross.relabel("→ ILE")
	_cross.pressed.connect(func() -> void: Screens.cross(Screens.Place.ISLAND))
	layer.add_child(_cross)


## Fait tourner les quatre prises, pour les voir sur l'appareil.
func _on_cycle() -> void:
	_cam_mode = (_cam_mode + 1) % 4
	set_raiding(_cam_mode == 1)
	set_placing(_cam_mode == 2)
	set_walling(_cam_mode == 3)
	_relabel_cycle()


## L'ETIQUETTE SE LIT SUR L'ETAT, jamais sur le compteur du bouton.
##
## Ecrite depuis `_on_cycle` seul, elle MENTAIT des qu'un mode etait arme par
## un autre chemin — un test, ou demain un bouton du jeu. Une etiquette de
## debogage qui ment coute plus cher que pas d'etiquette du tout : j'ai
## moi-meme cru a un bug de camera en la lisant.
func _relabel_cycle() -> void:
	if _cycle == null:
		return
	var name := "HOME"
	if _raiding:
		name = "BOARD"
	elif _walling:
		name = "WALL"
	elif _placing:
		name = "PLACE"
	_cycle.relabel("CAM: " + name)


## Deconnexion : on oublie le jeton et on revient a l'accueil.
##
## La session prevenant tout le monde par son signal, la socket se ferme d'elle
## meme — elle ecoute `Session.changed` et sait qu'un joueur parti n'a plus
## rien a ecouter.
func _on_quit() -> void:
	Session.sign_out()
	Screens.show_doorstep()


## LA PRISE QUE CET ETAT APPELLE.
##
## L'ORDRE DES TESTS EST LA REGLE, pas une commodite : un raid l'emporte sur
## tout, puis les deux modes de pose, et la maison est le repli. Voir le web,
## `wantedCam` — et noter que `walling` DOIT figurer a cote de `placing` : il
## avait ete oublie, « et le resultat etait un mode cloture qui fantomait
## correctement les spans HORS ECRAN : la rangee s'allumait et le jardin
## n'entrait jamais dans le cadre ». Paul, 2026-09-21 : « je click sur fence et
## j'ai toujours la bom en surbrillance ».
func _wanted_cam() -> BurrowCamera.Shot:
	var view := get_viewport_rect().size
	var map := _terrain.map
	if _raiding:
		if _cam_moved_by_player:
			return BurrowCamera.clamp_place(_current_shot(), map, view.x, view.y)
		return BurrowCamera.board(map, view.x, view.y)
	if _placing or _walling:
		# LE JOUEUR GARDE LA MAIN : on ne recadre pas sous lui, on borne.
		if _cam_moved_by_player:
			return BurrowCamera.clamp_place(_current_shot(), map, view.x, view.y)
		if _walling:
			return BurrowCamera.wall(map, _props.field, view.x, view.y)
		return BurrowCamera.place(map, view.x, view.y)
	return BurrowCamera.home(map, view.x, view.y)


## Ou la camera se tient en ce moment, dans le vocabulaire des prises.
func _current_shot() -> BurrowCamera.Shot:
	return BurrowCamera.Shot.new(scale.x, position)


## POSE LA PRISE QUE L'ETAT APPELLE.
##
## `immediate` saute l'animation — c'est ce qu'on veut a la construction et sur
## un redimensionnement, ou il n'y a rien a raconter : la camera n'a pas bouge,
## c'est le cadre qui a change de taille.
func frame_camera(immediate: bool = false) -> void:
	var shot := _wanted_cam()

	# EN DESSOUS DU SEUIL, ON NE FAIT RIEN. Un tween d'un demi-pixel est
	# invisible et gele le plateau pendant une demi-seconde.
	if not immediate \
			and absf(shot.scale - scale.x) < CAM_EPSILON_SCALE \
			and absf(shot.at.x - position.x) < CAM_EPSILON_POS \
			and absf(shot.at.y - position.y) < CAM_EPSILON_POS:
		return

	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()

	if immediate:
		scale = Vector2(shot.scale, shot.scale)
		position = shot.at
		return

	# TUER LE TWEEN AVANT D'EN LANCER UN AUTRE — la lecon du web, repetee
	# partout : deux tweens sur la meme propriete se disputent l'objet et le
	# dernier a ecrire gagne une image sur deux.
	_cam_tween = create_tween().set_parallel(true)
	_cam_tween.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_cam_tween.tween_property(self, "scale",
		Vector2(shot.scale, shot.scale), CAM_SECONDS)
	_cam_tween.tween_property(self, "position", shot.at, CAM_SECONDS)


## LE CADRE A CHANGE DE TAILLE : on se repose, sans animation.
##
## Et SANS toucher au drapeau du joueur : une rotation d'ecran n'est pas une
## reprise en main, et lui rendre le controle a ce moment-la lui ferait perdre
## le coin qu'il regardait.
func _reframe() -> void:
	frame_camera(true)


## LES TROIS FAITS, poses de l'exterieur.
##
## Chacun RE-RESOUT la prise — c'est le seul moment ou on a le droit de la
## reprendre au joueur, parce que c'est lui qui vient de changer de mode.
func set_placing(on: bool) -> void:
	if _placing == on:
		return
	_placing = on
	# ENTRER DANS UN MODE REND LA CAMERA : c'est un nouveau sujet, donc une
	# nouvelle prise. En SORTIR aussi, pour revenir a la maison proprement.
	_cam_moved_by_player = false
	# LA GRILLE N'APPARAIT QUE PENDANT LA POSE. Le reste du temps, cet ecran
	# est une image de chez soi — pas un editeur de niveau.
	_hints.show_hints(on)
	_relabel_cycle()
	frame_camera()


func set_walling(on: bool) -> void:
	if _walling == on:
		return
	_walling = on
	_cam_moved_by_player = false
	_relabel_cycle()
	frame_camera()


func set_raiding(on: bool) -> void:
	if _raiding == on:
		return
	_raiding = on
	_cam_moved_by_player = false
	_relabel_cycle()
	frame_camera()


## LE DOIGT SUR LE PLATEAU.
##
## TROIS PIEGES, tous mesures par le web avant nous :
##
##   1. LE GLISSEMENT NE DOIT PAS POSER. Un `pointertap` se declenche a la fin
##      d'un glissement aussi volontiers qu'apres une tape — donc sans le
##      drapeau `_did_drag`, faire glisser le plateau enterrerait un piege sur
##      la case ou le doigt s'est arrete.
##
##   2. L'APPUI MONTRE AVANT DE CHOISIR. Sur un telephone il n'y a pas de
##      survol : sans retour a l'appui, le premier signal arrive APRES le
##      geste, et le joueur decouvre ce qu'il a choisi une fois qu'il ne peut
##      plus changer d'avis. L'appui teint donc la case en or, comme le
##      survol le fait a la souris.
##
##   3. LE PLATEAU SE LAISSE GLISSER, mais seulement quand il y a quelque
##      chose a viser (`can_move_cam`). A la maison, la ferme est un decor de
##      fond : la promener n'aurait aucun sens.
##
## Godot n'a pas d'equivalent des aires de hit de Pixi, donc la case est
## resolue par la geometrie (voir burrow_pick.gd) et non par l'ordre de dessin.
## Les deux raisons qui ont fait choisir l'autre voie sont gardees la-bas.

## DE COMBIEN LE DOIGT DOIT BOUGER pour que ce soit un glissement et non une
## tape, en pixels d'ecran. Un doigt ne se pose jamais parfaitement immobile :
## a zero, chaque tape serait un micro-glissement et ne poserait jamais rien.
const DRAG_SLOP := 8.0

var _pressing := false
var _did_drag := false
var _press_at := Vector2.ZERO
var _press_cam := Vector2.ZERO


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventMouseButton:
		var pressed: bool = event.pressed
		var at: Vector2 = event.position
		if pressed:
			_on_press(at)
		else:
			_on_release(at)
	elif event is InputEventScreenDrag or event is InputEventMouseMotion:
		if _pressing:
			_on_move(event.position)


func _on_press(at: Vector2) -> void:
	_pressing = true
	_did_drag = false
	_press_at = at
	_press_cam = position
	# L'APPUI MONTRE CE QU'IL VA CHOISIR — le retour que le survol donne a la
	# souris, et qu'un doigt n'a pas.
	if _hints_live():
		_hints.set_hovered(_cell_at(at))


func _on_move(at: Vector2) -> void:
	if not _did_drag and at.distance_to(_press_at) > DRAG_SLOP:
		_did_drag = true
		# DES QUE C'EST UN GLISSEMENT, LA CASE N'EST PLUS VISEE : garder l'or
		# sous un doigt qui promene le plateau annoncerait une pose qui
		# n'arrivera pas.
		if _hints_live():
			_hints.set_hovered(Vector2i(-1, -1))
	if not _did_drag:
		# Toujours une tape en puissance : on suit la case sous le doigt.
		if _hints_live():
			_hints.set_hovered(_cell_at(at))
		return
	if not can_move_cam():
		return
	# LE PLATEAU SUIT LE DOIGT. Applique directement, sans tween — une
	# demi-seconde d'ease sur chaque mouvement trainerait derriere lui.
	set_place_cam(BurrowCamera.Shot.new(scale.x, _press_cam + (at - _press_at)))


func _on_release(at: Vector2) -> void:
	if not _pressing:
		return
	_pressing = false
	if _hints_live():
		_hints.set_hovered(Vector2i(-1, -1))
	# PIEGE N°1 : un glissement qui se termine n'est pas une tape.
	if _did_drag:
		return
	var cell := _cell_at(at)
	if cell.x < 0:
		return
	tile_tapped.emit(cell)


## LA CASE SOUS UN POINT DE L'ECRAN.
##
## L'ecran vers l'espace du terrain, puis la geometrie. C'est ICI que vit la
## transformation de la camera — `BurrowPick` n'a pas a la connaitre.
func _cell_at(at: Vector2) -> Vector2i:
	return BurrowPick.at(_terrain.map, (at - position) / scale.x)


## Les losanges sont-ils allumes ? Sans eux, rien a teindre.
func _hints_live() -> bool:
	return _placing and _hints != null


## LE JOUEUR PREND LE PLATEAU EN MAIN — un glissement, un pincement.
##
## APPLIQUE DIRECTEMENT, sans tween : un glissement est continu, et une
## demi-seconde d'ease sur chaque mouvement du doigt trainerait derriere lui.
func set_place_cam(shot: BurrowCamera.Shot) -> void:
	if not can_move_cam():
		return
	var view := get_viewport_rect().size
	var held := BurrowCamera.clamp_place(shot, _terrain.map, view.x, view.y)
	_cam_moved_by_player = true
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	scale = Vector2(held.scale, held.scale)
	position = held.at


## LE PLATEAU SE LAISSE-T-IL BOUGER ? Seulement quand il y a quelque chose a
## viser : a la maison, la ferme est un decor de fond et n'a pas a se promener.
func can_move_cam() -> bool:
	return _raiding or _placing or _walling
