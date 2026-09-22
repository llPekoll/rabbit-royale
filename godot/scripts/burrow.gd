extends Node2D
## LE TERRIER — l'un des deux LIEUX residents.
##
## Il n'est pas monte et demonte comme un ecran : construit une fois, il reste
## dans l'arbre et se contente d'apparaitre et de disparaitre (voir
## screens.gd). Le joueur fait l'aller-retour avec l'ile sans arret, et
## reconstruire a chaque passage rechargerait les atlas a chaque DIG.
##
## POUR L'INSTANT il porte son sol, ses decors et ses clotures. Les pieges et
## le lapin viendront s'y poser — tous freres du terrain dans le meme tri, ce
## qui laisse un caillou proche passer devant une falaise lointaine sans qu'on
## arbitre a la main.

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

var _seed := 1
var _quit: PlankButton
## Provisoire, avec le bouton de cadrage — voir `_add_quit`.
var _cycle: PlankButton
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
	_add_quit()
	show_ground(_seed)
	get_viewport().size_changed.connect(_reframe)
	frame_camera(true)


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
	# ET LES CLOTURES BORDENT LE CHAMP QUI VIENT D'ETRE SEME, celui-la meme et
	# pas un second tirage de la graine : elles viennent donc APRES le potager,
	# et lisent les cases qu'il a gardees.
	_fences.map = _terrain.map
	_fences.build(_props.field)

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
	_quit.relabel(I18N.t("sign_out"))
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


## Fait tourner les quatre prises, pour les voir sur l'appareil.
func _on_cycle() -> void:
	_cam_mode = (_cam_mode + 1) % 4
	set_raiding(_cam_mode == 1)
	set_placing(_cam_mode == 2)
	set_walling(_cam_mode == 3)
	_cycle.relabel("CAM: " + ["HOME", "BOARD", "PLACE", "WALL"][_cam_mode])


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
	frame_camera()


func set_walling(on: bool) -> void:
	if _walling == on:
		return
	_walling = on
	_cam_moved_by_player = false
	frame_camera()


func set_raiding(on: bool) -> void:
	if _raiding == on:
		return
	_raiding = on
	_cam_moved_by_player = false
	frame_camera()


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
