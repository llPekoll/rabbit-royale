extends Node2D
## L'ILE — le second des deux LIEUX residents.
##
## Construite une fois, elle reste dans l'arbre et se contente d'apparaitre et
## de disparaitre (voir screens.gd). Le joueur fait l'aller-retour avec le
## terrier sans arret, et reconstruire a chaque passage rechargerait les atlas
## a chaque DIG.
##
## CE QU'ELLE PARTAGE AVEC LE TERRIER, et pourquoi c'est voulu : le terrain, le
## picker, les losanges et la camera sont les MEMES fichiers. Le web fait pareil
## — ses deux plateaux passent par `IsoIslandView` — et c'est ce qui fait qu'une
## correction de tri, de rampe ou de tap profite aux deux d'un coup. Ce qui
## change tient dans la carte : 32x32 a trois paliers ici, 19x19 a deux la-bas.
##
## LE TUTORIEL SERA CETTE SCENE avec une graine prefixee `first:`, et le raid
## sera le terrier avec le sol d'un autre. Ni l'un ni l'autre n'aura de scene
## propre : les ajouter dupliquerait deux fois un rendu de terrain pour que les
## copies ne servent jamais ensemble.

## UNE CASE A ETE TAPEE — pas glissee, pas effleuree : choisie.
##
## Un signal plutot qu'un appel direct : l'ile ne sait pas ce qu'on fait d'une
## case. Creuser, planter un drapeau, ouvrir un coffre — c'est au jeu de le
## decider, et le plateau ne doit pas avoir a connaitre la liste.
signal tile_tapped(cell: Vector2i)

## LA DUREE DU MOUVEMENT DE CAMERA, et sa courbe. Les memes que le terrier :
## c'est le meme geste, il doit avoir le meme poids.
const CAM_SECONDS := 0.55
const CAM_EPSILON_SCALE := 0.001
const CAM_EPSILON_POS := 0.5

## DE COMBIEN LE DOIGT DOIT BOUGER pour que ce soit un glissement et non une
## tape, en pixels d'ecran.
const DRAG_SLOP := 8.0

## LA GRAINE PAR DEFAUT — celle des sondes et de la premiere image, avant que le
## serveur en nomme une. Texte et non entier : les graines du jeu sont des
## chaines (« first:… », l'id d'une ile), et c'est ce que `Rng.seed_from` hache.
const DEFAULT_SEED := "default"

@onready var _terrain: BurrowTerrain = %Terrain
@onready var _hints: PlacementHints = %Hints
@onready var _foam: PackWater = %Foam
@onready var _rocks: SeaRocks = %Rocks
@onready var _ducks: Ducks = %Ducks
@onready var _tiles: TileView = %Tiles

## CE QUI EST ENTERRE SUR CETTE ILE.
##
## Calcule ici pour le TUTORIEL SEULEMENT : sa disposition est dessinee a la
## main, donc deterministe. Une ile ordinaire recevra ses contenus du serveur,
## case par case — son `contentSeed` est prive et ne traverse jamais le fil.
var _board: IslandBoard

var _seed := DEFAULT_SEED
var _cam_tween: Tween
## Provisoire : la porte vers le terrier, le temps qu'une manche se termine.
var _back: PlankButton
## Provisoire : le compteur d'images, pour mesurer depuis le moteur.
var _fps: Label

## LE JOUEUR A-T-IL PRIS LE PLATEAU EN MAIN ? Meme drapeau que le terrier, et
## pour la meme raison : on ne recadre pas sous quelqu'un qui regarde un coin.
var _cam_moved_by_player := false

var _pressing := false
var _did_drag := false
var _press_at := Vector2.ZERO
var _press_cam := Vector2.ZERO


func _ready() -> void:
	show_ground(_seed)
	get_viewport().size_changed.connect(_reframe)
	frame_camera(true)
	_add_chrome()


## LA PORTE DE RETOUR VERS LE TERRIER.
##
## Provisoire, comme celle qui mene ici depuis le terrier : dans le jeu on
## quitte l'ile parce qu'une manche se termine ou qu'elle erupte, pas en
## appuyant sur un bouton. Mais sans elle la traversee est a sens unique, et
## une traversee a sens unique ne prouve rien — c'est le RETOUR qui montre que
## le terrier a survecu a la bascule sans etre reconstruit.
##
## DANS UN CanvasLayer, comme au terrier et pour la meme raison : l'ile est un
## Node2D qu'on met a l'echelle pour cadrer le sol, et un bouton accroche
## dedans retrecirait avec lui. Le layer est POSITIF, contrairement a celui de
## la mer (-100) : le chrome est au-dessus du monde, la mer dessous.
func _add_chrome() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_back = preload("res://scenes/plank_button.tscn").instantiate()
	_back.custom_minimum_size = Vector2(220, 44)
	_back.size = Vector2(220, 44)
	_back.position = Vector2(12, 12)
	_back.relabel("← TERRIER")
	_back.pressed.connect(func() -> void: Screens.cross(Screens.Place.BURROW))
	layer.add_child(_back)

	# LE COMPTEUR, PROVISOIRE — et il est la parce que `adb shell dumpsys
	# gfxinfo` MENT sur ce projet : il compte les images qu'ANDROID compose, pas
	# celles que Godot rend. Il annoncait 7 ms par image pendant que le jeu
	# tournait a 21. C'est la lecon des notes de l'app Expo, « le fps JS ment
	# sur expo-gl », sous une autre forme : on lit le moniteur du MOTEUR.
	_fps = Label.new()
	_fps.position = Vector2(12, 62)
	_fps.add_theme_font_size_override("font_size", 22)
	_fps.add_theme_color_override("font_color", Color(1, 0.83, 0.36))
	layer.add_child(_fps)


## LE SOL D'UNE ILE DONNEE.
##
## Rappelable avec une autre graine : c'est ainsi qu'on change d'ile entre deux
## manches, et ainsi que le tutoriel arrivera (`first:…`), sans remonter la
## scene.
func show_ground(seed_value: String) -> void:
	_seed = seed_value

	var map := IslandMap.new()
	map.grow(seed_value)
	# L'ORIGINE SE CALCULE, elle ne se recopie pas du web.
	#
	# `ISO_ORIGIN_X/Y = 515/150` a ete MESURE la-bas contre un fond peint qui
	# n'existe plus (« the island is BUILT now, cell by cell from the seed, so
	# the paintings went with it »). Le reprendre ici serait viser une image
	# absente. On centre donc le plateau sur lui-meme, et c'est la camera qui
	# decide ensuite de ce qu'on regarde.
	map.origin = _centred_origin(map)
	_terrain.map = map
	_terrain.build()

	# LA MER VIENT APRES LE TERRAIN parce qu'elle lit le meme relief : l'ecume
	# borde la terre qui vient d'etre taillee, et les rochers ne vont que dans
	# la mer qu'elle laisse.
	#
	# L'ORDRE ENTRE EUX COMPTE AUSSI : les rochers d'abord, les canards ensuite,
	# parce qu'un canard doit savoir ou sont les rochers pour ne pas nager
	# dedans — il est dessine SOUS le decor.
	_foam.map = map
	_foam.build()
	_rocks.map = map
	_rocks.seed_text = seed_value
	_rocks.build()
	_ducks.map = map
	_ducks.seed_text = seed_value
	_ducks.rocks = _rocks
	_ducks.build()

	# LE PLATEAU : ce qui est enterre, et ce qu'on en sait deja.
	#
	# APRES le terrain, parce que les voiles se montent dans ses blocs — et
	# avant les losanges, qui partagent les memes blocs.
	_board = IslandBoard.new(map)
	if FirstIsland.is_first(seed_value):
		_board.deal_tutorial()
	_tiles.board = _board
	_tiles.terrain = _terrain
	_tiles.build()

	# LES LOSANGES SE MONTENT DANS LES BLOCS DU TERRAIN : ils viennent donc
	# APRES lui, et ils meurent avec lui — `build` jette ses blocs et les
	# losanges avec, et on en refait aussitot.
	_hints.map = map
	_hints.terrain = _terrain
	_hints.build()

	# UNE AUTRE ILE A D'AUTRES BORNES : la prise se re-resout, et le drapeau du
	# joueur tombe puisque c'est un AUTRE plateau, pas celui qu'il tenait.
	_cam_moved_by_player = false
	if is_node_ready():
		frame_camera(true)


## L'ORIGINE QUI POSE LE PLATEAU AUTOUR DE ZERO.
##
## La projection iso etale la grille de `-(rows-1)*hw` a `+(cols-1)*hw` en x et
## de 0 a `(cols+rows-2)*hh` en y. On decale donc de la moitie pour que le
## losange soit centre sur l'origine du noeud — la camera travaille ensuite en
## bornes de terre (`BurrowCamera.board_bounds`), pas en bornes de grille.
func _centred_origin(map: BurrowMap) -> Vector2:
	var span_x := float(map.width + map.height - 2) * Iso.half_w()
	var span_y := float(map.width + map.height - 2) * Iso.half_h()
	return Vector2(
		float(map.height - 1) * Iso.half_w() - span_x * 0.5,
		-span_y * 0.5
	)


## LA PRISE : toute l'ile au cadre.
##
## `BurrowCamera` est de l'arithmetique pure sur une carte — ses prises se
## resolvent sur `board_bounds`, qui parcourt la terre — donc elle sert l'ile
## telle quelle. Le pan/zoom libre du web (`islandCamera.ts`) viendra quand le
## jeu demandera de se deplacer dessus ; `clamp_place` et `zoom_at` sont deja la
## pour le porter.
func _wanted_cam() -> BurrowCamera.Shot:
	var view := get_viewport_rect().size
	if _cam_moved_by_player:
		return BurrowCamera.clamp_place(_current_shot(), _terrain.map, view.x, view.y)
	return BurrowCamera.board(_terrain.map, view.x, view.y)


func _current_shot() -> BurrowCamera.Shot:
	return BurrowCamera.Shot.new(scale.x, position)


func frame_camera(immediate: bool = false) -> void:
	var shot := _wanted_cam()

	if not immediate \
			and absf(shot.scale - scale.x) < CAM_EPSILON_SCALE \
			and absf(shot.at.x - position.x) < CAM_EPSILON_POS \
			and absf(shot.at.y - position.y) < CAM_EPSILON_POS:
		return

	# TUER LE TWEEN AVANT D'EN LANCER UN AUTRE : deux tweens sur la meme
	# propriete se disputent l'objet et le dernier a ecrire gagne une image sur
	# deux.
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()

	if immediate:
		scale = Vector2(shot.scale, shot.scale)
		position = shot.at
		return

	_cam_tween = create_tween().set_parallel(true)
	_cam_tween.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_cam_tween.tween_property(self, "scale",
		Vector2(shot.scale, shot.scale), CAM_SECONDS)
	_cam_tween.tween_property(self, "position", shot.at, CAM_SECONDS)


## LE COMPTEUR, a chaque image.
var _fps_tick := 0.0
var _probe_step := 0


func _process(delta: float) -> void:
	if _fps == null:
		return
	var n := int(Performance.get_monitor(Performance.TIME_FPS))
	var draws := int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	_fps.text = "%d fps | %d draws" % [n, draws]
	# ET DANS LE LOG, parce que le compteur a l'ecran peut finir sous un
	# bouton — c'est arrive du premier coup. `adb logcat -s godot` le lit
	# depuis la machine, sans chercher ou il s'affiche.
	_fps_tick += delta
	if _fps_tick >= 2.0:
		_fps_tick = 0.0
		print("[perf] %d fps, %d draws" % [n, draws])


func _reframe() -> void:
	frame_camera(true)


## LE DOIGT SUR LE PLATEAU. Les trois memes pieges que le terrier, dont la
## raison complete est gardee dans burrow.gd :
##   1. un glissement qui se termine n'est pas une tape ;
##   2. l'appui MONTRE avant de choisir, faute de survol sur un telephone ;
##   3. le plateau se laisse glisser, ici toujours — une ile est faite pour
##      qu'on s'y promene, contrairement a la ferme qui est un decor de fond.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or event is InputEventMouseButton:
		if event.pressed:
			_on_press(event.position)
		else:
			_on_release(event.position)
	elif event is InputEventScreenDrag or event is InputEventMouseMotion:
		if _pressing:
			_on_move(event.position)


func _on_press(at: Vector2) -> void:
	_pressing = true
	_did_drag = false
	_press_at = at
	_press_cam = position
	_hints.set_hovered(_cell_at(at))


func _on_move(at: Vector2) -> void:
	if not _did_drag and at.distance_to(_press_at) > DRAG_SLOP:
		_did_drag = true
		# DES QUE C'EST UN GLISSEMENT, LA CASE N'EST PLUS VISEE : garder l'or
		# sous un doigt qui promene le plateau annoncerait un coup qui n'aura
		# pas lieu.
		_hints.set_hovered(Vector2i(-1, -1))
	if not _did_drag:
		_hints.set_hovered(_cell_at(at))
		return
	set_place_cam(BurrowCamera.Shot.new(scale.x, _press_cam + (at - _press_at)))


func _on_release(at: Vector2) -> void:
	if not _pressing:
		return
	_pressing = false
	_hints.set_hovered(Vector2i(-1, -1))
	if _did_drag:
		return
	var cell := _cell_at(at)
	if cell.x < 0:
		return
	# CREUSER, POUR L'INSTANT SANS RIEN COUTER.
	#
	# Provisoire : un vrai coup passe par l'energie, le serveur et le pas du
	# lapin (`payCrossing` — « sans un pas, creuser est gratuit »). Ici on
	# montre le SOCLE : le voile tombe, le chiffre sort, la cascade ouvre le
	# champ. C'est ce que les douze beats du tutoriel attendent.
	if _board != null:
		_board.dig(cell)
		_tiles.refresh()
	tile_tapped.emit(cell)


## LA CASE SOUS UN POINT DE L'ECRAN.
##
## L'ecran vers l'espace du terrain, puis la geometrie. C'est ICI que vit la
## transformation de la camera — `BurrowPick` n'a pas a la connaitre.
func _cell_at(at: Vector2) -> Vector2i:
	return BurrowPick.at(_terrain.map, (at - position) / scale.x)


## LE JOUEUR PREND LE PLATEAU EN MAIN. Applique directement, sans tween : un
## glissement est continu, et une demi-seconde d'ease trainerait derriere lui.
func set_place_cam(shot: BurrowCamera.Shot) -> void:
	var view := get_viewport_rect().size
	var held := BurrowCamera.clamp_place(shot, _terrain.map, view.x, view.y)
	_cam_moved_by_player = true
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	scale = Vector2(held.scale, held.scale)
	position = held.at
