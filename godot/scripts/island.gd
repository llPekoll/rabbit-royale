class_name Island
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
@onready var _rabbit: HomeRabbit = %Rabbit
@onready var _ring: MoveRing = %Ring

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

## LE TUTORIEL, tel que cette scene le joue.
##
## Le mode X est-il arme ? Il tombe apres UN marquage (voir `setFlagMode` du
## web) : la tape suivante est de nouveau un pas.
var _armed := false
## Le compte du joueur — ce que `FirstRun.State` lit. Ses propres coups, pas
## ceux d'un autre : la bombe d'un inconnu n'est jamais la lecon du joueur.
var _digs := 0
var _flags := 0
var _chests := 0
## Le coffre est pris : la manche est finie, et plus aucune tape ne compte.
var _done := false
## MARQUER UNE BOMBE — le bouton, dans le coin ou repose le pouce droit.
var _mark: PlankButton
## Le bandeau qui parle.
var _caption: FirstRunCaption

## Combien de temps le coffre reste a l'ecran avant le retour au terrier.
## Assez pour lire « un coffre » ; pas assez pour qu'on cherche quoi faire.
const DONE_SECONDS := 2.5

## LE JOUEUR A-T-IL PRIS LE PLATEAU EN MAIN ? Meme drapeau que le terrier, et
## pour la meme raison : on ne recadre pas sous quelqu'un qui regarde un coin.
var _cam_moved_by_player := false

var _pressing := false
var _did_drag := false
var _press_at := Vector2.ZERO
var _press_cam := Vector2.ZERO


## OU LE TUTORIEL SE SOUVIENT D'AVOIR ETE FINI, sur cet appareil.
##
## Le web le sait par le serveur (`tutorialDone` ferme la manche, et la
## prochaine ile est distribuee) ; ce portage n'a pas encore de manche cote
## serveur, donc l'appareil tient le drapeau, comme il tient la langue.
const TUTORIAL_PATH := "user://tutorial.cfg"


func _ready() -> void:
	show_ground(_opening_seed())
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

	# MARQUER UNE BOMBE. Un bouton et non un appui long : sur ce plateau un
	# doigt tenu est deja le debut d'un glissement de camera, et un geste qui
	# veut dire deux choses est un pari place par accident. Le mode est donc
	# explicite, il dit ce qu'il s'apprete a faire tant qu'il est arme, et il
	# retombe apres UN marquage.
	#
	# IL DIT CE QU'IL EST. Sa premiere version web etait un X rouge nu sur un
	# carre sombre au bord de l'ecran, et ca se lisait comme ce qu'un X rouge
	# sur un carre sombre veut toujours dire : FERMER. Paul, 2026-09-17 : « il
	# n'y a pas de bouton pour se mettre en mode X rouge » — il etait a l'ecran.
	# Donc : la bombe dont il s'agit, le X qu'il y pose, et le verbe. Arme, la
	# planche passe a l'or.
	_mark = preload("res://scenes/plank_button.tscn").instantiate()
	_mark.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_mark.custom_minimum_size = Vector2(232, 44)
	_mark.offset_right = -12
	_mark.offset_left = -12 - 232
	_mark.offset_bottom = -12
	_mark.offset_top = -12 - 44
	_mark.relabel(I18N.t("mark_bomb"))
	_mark.pressed.connect(func() -> void: _set_armed(not _armed))
	I18N.locale_changed.connect(func(_c: String) -> void: _mark.relabel(I18N.t("mark_bomb")))
	layer.add_child(_mark)

	_caption = FirstRunCaption.new()
	layer.add_child(_caption)

	_refresh_tutorial_chrome()

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

	# LE JOUEUR, pose sur l'apparition du tutoriel — ou au milieu d'une ile
	# ordinaire, en attendant que le serveur dise ou. Il n'erre pas : sur l'ile
	# c'est le doigt qui le mene, et la lecon du X se pose depuis la case ou il
	# est. Le hash de la graine ne sert qu'a nourrir un RNG qui, sans errance,
	# ne tire rien.
	_rabbit.map = map
	_rabbit.roam = false
	var start := TutorialMap.spawn() if FirstIsland.is_first(seed_value) else Vector2i(-1, -1)
	_rabbit.build(hash(seed_value), start)

	# L'ANNEAU, dans les memes blocs que les voiles — et rallume tout de suite
	# autour de l'apparition.
	_ring.terrain = _terrain
	_ring.build(_board.playable())

	# UNE AUTRE ILE, UN AUTRE COMPTE.
	_armed = false
	_digs = 0
	_flags = 0
	_chests = 0
	_done = false
	_refresh_tutorial_chrome()
	_refresh_ring()

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
## SI LES CASES NE REPONDENT PLUS AU DOIGT alors que les boutons repondent :
## un Control non IGNORE est sous le doigt et Godot marque l'appui « traite »
## avant `_unhandled_input`. Ne pas chercher dans le picker. Mesurer avec
## `get_viewport().gui_get_hovered_control().get_path()` dans un `_input`
## provisoire — c'est ce qui a nomme `/root/Main` le 2026-09-23 (main.gd).
## LA SOURIS EMULEE SEULEMENT, jamais le toucher brut — et c'est mesure.
##
## Sur l'appareil, un doigt produit DEUX evenements a la meme milliseconde :
## l'`InputEventScreenTouch` brut et l'`InputEventMouseButton` que Godot en
## emule (`emulate_mouse_from_touch`, au defaut). Les deux arrivaient ici, donc
## chaque tape comptait double une fois la retenue lachee — un pas, puis un
## second sur la foulee. Et le toucher brut PASSE A TRAVERS les boutons : la
## tape sur MARQUER UNE BOMBE tombait aussi sur le plateau (« cell=(17,16) » a
## l'instant du bouton). Le GUI ne consomme que la version souris, donc c'est
## elle, et elle seule, qui vaut une tape. Journal du Seeker, 2026-09-23.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.pressed:
			_on_press(event.position)
		else:
			_on_release(event.position)
	elif event is InputEventMouseMotion:
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
		print("[tap] hors plateau at=%s" % at)
		return
	# LE TUTORIEL SE JOUE ICI : un pas, ou un X, selon le mode.
	if _board != null and _is_tutorial():
		if not _done:
			_tutorial_tap(cell)
		tile_tapped.emit(cell)
		return
	# CREUSER, POUR L'INSTANT SANS RIEN COUTER — sur une ile ordinaire.
	#
	# Provisoire : un vrai coup passe par l'energie, le serveur et le pas du
	# lapin (`payCrossing` — « sans un pas, creuser est gratuit »). Ici on
	# montre le SOCLE : le voile tombe, le chiffre sort, la cascade ouvre le
	# champ.
	if _board != null:
		_board.dig(cell)
		_tiles.refresh()
	tile_tapped.emit(cell)


## UNE TAPE SUR L'ILE DU TUTORIEL.
##
## ARME : la tape POSE un X depuis la case du lapin, et le mode retombe, juste
## ou faux. SINON : c'est un pas, sur une voisine, et seulement si la retenue le
## permet — un pas refuse fait remuer le bouton, parce que c'est lui la sortie.
##
## Ce que le web fait en deux allers-retours serveur (`flagTile`, `resolveMove`)
## se decide ici sur le plateau local : le tutoriel est la seule ile dont le
## client connait le contenu, par construction (voir island_board.gd).
func _tutorial_tap(cell: Vector2i) -> void:
	var here := _rabbit.at()
	# DANS LE LOG, parce qu'un pas refuse ne se voit pas sur une capture :
	# `adb logcat -s godot` dit quelle case le doigt a resolue et pourquoi elle
	# a ete refusee. C'est la sonde qui manquait quand « tap is not working ».
	print("[tap] cell=%s here=%s armed=%s beside=%s step=%s dug=%s" % [
		cell, here, _armed, _board.is_beside(here, cell),
		_board.may_step(here, cell), _board.is_dug(cell)])

	if _armed:
		_set_armed(false)
		if _board.flag(here, cell):
			_flags += 1
		_tiles.refresh()
		_refresh_caption()
		_refresh_ring()
		return

	if not _board.is_beside(here, cell) or not _board.may_step(here, cell):
		# LE NON LOCAL : l'anneau clignote d'un coup pour montrer ou est le oui.
		# Et pendant la lecon, le bouton remue — c'est lui la sortie.
		_ring.pulse()
		if _mark != null and _board.teaching_hold().x >= 0:
			_mark.wiggle()
		return

	var fresh := not _board.is_dug(cell)
	_rabbit.send_to(cell)
	if fresh:
		_board.dig(cell)
		_digs += 1
		# LE COFFRE EST LA FIN de la premiere ile — `tutorialDone` sur le web.
		if _board.content.get(cell) == IslandBoard.Content.CHEST:
			_chests += 1
			_finish_tutorial()
	_tiles.refresh()
	_refresh_caption()
	_refresh_ring()


## RALLUME L'ANNEAU AUTOUR DU LAPIN — les cases qu'un pas atteint, ou, en mode
## X, celles ou un X peut se poser.
##
## Les memes portes que le pas lui-meme (`may_step`) : une case que le plateau
## refuserait n'est pas allumee. En mode X, la porte de `flag` : les huit
## voisines dont on ne sait encore rien.
func _refresh_ring() -> void:
	if _board == null or _ring == null:
		return
	var here := _rabbit.at()
	var lit: Array[Vector2i] = []
	if not _done:
		for n in _board._neighbours(here):
			if not _board.content.has(n):
				continue
			if _armed:
				var st = _board.state.get(n)
				if st == IslandBoard.State.DUG or st == IslandBoard.State.HINTED:
					continue
				if _board.is_flagged(n) or _board.content[n] == IslandBoard.Content.CHEST:
					continue
				lit.append(n)
			elif _board.may_step(here, n) and not _board.is_flagged(n):
				lit.append(n)
	_ring.set_lit(lit, here, _armed)


func _is_tutorial() -> bool:
	return FirstIsland.is_first(_seed)


## LA GRAINE SUR LAQUELLE L'ILE S'OUVRE : le tutoriel pour qui ne l'a pas
## fini, l'ile par defaut pour les autres.
##
## `first:<id du joueur>` — la graine porte TOUJOURS l'identifiant, parce que
## chaque nouveau venu a besoin de SON instance (voir first_island.gd) ; le SOL,
## lui, est le meme pour tous. Un joueur qui a deja des manches au compteur
## (`runsPlayed`, venu du web) n'a pas a refaire la lecon.
func _opening_seed() -> String:
	if _tutorial_finished():
		return DEFAULT_SEED
	if int(Session.player.get("runsPlayed", 0)) > 0:
		return DEFAULT_SEED
	return FirstIsland.seed_for(String(Session.player.get("id", "guest")))


## LE TUTORIEL EST-IL ENCORE DU ? Pour le chrome : DIG traverse droit vers
## la premiere ile tant qu'il l'est, sans passer par la liste (le web fait
## de meme pour un joueur sans manche). Memes deux faits que `_opening_seed`.
static func tutorial_pending() -> bool:
	if int(Session.player.get("runsPlayed", 0)) > 0:
		return false
	var cfg := ConfigFile.new()
	if cfg.load(TUTORIAL_PATH) == OK and bool(cfg.get_value("tutorial", "done", false)):
		return false
	return true


func _tutorial_finished() -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(TUTORIAL_PATH) != OK:
		return false
	return bool(cfg.get_value("tutorial", "done", false))


func _remember_finished() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("tutorial", "done", true)
	cfg.save(TUTORIAL_PATH)


func _set_armed(armed: bool) -> void:
	_armed = armed
	if _mark != null:
		_mark.board = PlankButton.Board.GOLD if armed else PlankButton.Board.WOOD
	_refresh_caption()
	_refresh_ring()


## LE CHROME DU TUTORIEL SE MONTRE SUR L'ILE DU TUTORIEL, et nulle part
## ailleurs. Appele apres `show_ground` ET apres `_add_chrome`, parce que
## l'ordre de `_ready` fait passer le premier avant le second.
func _refresh_tutorial_chrome() -> void:
	if _mark != null:
		_mark.visible = _is_tutorial()
	if _caption == null:
		return
	if _is_tutorial():
		_refresh_caption()
	else:
		_caption.hide_beat()
		_tiles.set_pulse(Vector2i(-1, -1))


## RELIT LE BEAT, et tout ce qui repond au meme etat : le bandeau, le X fantome
## sur la case enseignee, le remuement du bouton.
##
## Le X fantome bat des que le lapin est A COTE de la bombe retenue, arme ou
## pas : « puis touche la case au X rouge » le nomme avant que le mode soit
## arme, et « touche la case qui clignote » apres.
func _refresh_caption() -> void:
	if _caption == null or _board == null or not _is_tutorial():
		return
	var s := FirstRun.State.new()
	s.tiles = _digs
	s.flags = _flags
	s.chests = _chests
	s.armed = _armed
	var held := _board.teaching_hold()
	s.beside = held.x >= 0 and _board.is_beside(_rabbit.at(), held)

	var b := FirstRun.beat(s)
	var id: String = b.get("id", "")
	_caption.show_beat(id, b.get("sticky", false))
	_tiles.set_pulse(held if s.beside else Vector2i(-1, -1))
	if id == "mark" and _mark != null:
		_mark.wiggle()


## LE COFFRE EST PRIS : on laisse lire la phrase, puis on rentre.
##
## Le web finit sur un recapitulatif (« tes carottes sont au terrier ») ; ce
## portage n'a pas encore de bourse a recapituler, donc la manche se termine
## par le seul geste qui existe deja — la traversee vers le terrier.
func _finish_tutorial() -> void:
	_done = true
	_remember_finished()
	_tiles.set_pulse(Vector2i(-1, -1))
	get_tree().create_timer(DONE_SECONDS).timeout.connect(
		func() -> void:
			if not (_done and Screens.in_world()):
				return
			# UNE FOIS AU TERRIER, l'ile se refait sur sa graine ordinaire —
			# cachee, donc sans que personne la voie changer. La prochaine
			# traversee n'est plus une lecon.
			Screens.moved.connect(
				func(id: Screens.Place) -> void:
					if id == Screens.Place.BURROW:
						show_ground(DEFAULT_SEED),
				CONNECT_ONE_SHOT)
			Screens.cross(Screens.Place.BURROW))


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
