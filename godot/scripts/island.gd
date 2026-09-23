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

## LA MANCHE HORS LIGNE A BOUGE — un pas, un X, un refus. `outcome` est ce
## que `LocalRun` rend, la forme du `move_result` du serveur.
signal local_changed(outcome: Dictionary)
## LA MANCHE HORS LIGNE EST FINIE : l'ile a erupte (`cleared`) ou le lapin n'a
## plus d'energie.
signal local_over(cleared: bool)

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
@onready var _ocean: Ocean = %Ocean
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

## LE SOL D'UNE ILE GENEREE : son decor et ses pas (nul sur le tutoriel).
var _ground: IslandGround
## LA MANCHE HORS LIGNE, quand l'ile se joue sans serveur (le bac a sable).
## Nulle sinon : une ile en ligne attend ses contenus du reseau.
var local_run: LocalRun
## Ce qui a ete joue depuis la derniere lecture du chrome.
var _local_over := false
## CE QUE LA PROCHAINE ILE HORS LIGNE DOIT DONNER : `{content_seed, lifetime}`,
## vide pour une ile en ligne (ou le tutoriel, qui se donne tout seul).
var _local_deal: Dictionary = {}
## LE DECOR DEBOUT (arbres, reperes, moutons, soldats) — `IslandScenery`,
## monte a la demande. Les buissons, eux, sont dessines par `TileView`.
var _scenery: IslandScenery
var _compass: ChestCompass
var _prize_host: Control

## LE ZOOM DE JEU : 60 pixels par case au paysage (islandCamera.ts
## `DEFAULT_TILE_PX`), centre sur le lapin. L'ile entiere au cadre se lit comme
## une carte ; on ne creuse pas une carte.
const PLAY_TILE_PX := 60.0
const WHEEL_ZOOM := 1.12
var _cam_tween: Tween
## Le fondu d'arrivee, a part du tween de camera : un doigt qui prend le
## plateau tue la camera, et l'ile ne doit pas rester a demi eteinte pour ca.
var _fade: Tween
## Le ciel de la fin du tutoriel — le meme que celui de l'eruption, joue a la
## main (voir `follows_run`).
var _sink_sky: EruptionOverlay
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
## La fleche d'or au-dessus du bouton, et le noir autour — voir `_teach`.
var _mark_arrow: TextureRect
var _spotlight: TeachSpotlight
## Le bandeau qui parle.
var _caption: FirstRunCaption

## Combien de temps le coffre reste a l'ecran avant que l'ile coule.
## Assez pour lire « un coffre » ; pas assez pour qu'on cherche quoi faire.
## Deux sauts de joie (`happy`, 0,8 s) — le lapin a gagne, qu'on le voie.
const DONE_SECONDS := 1.8
## Puis l'ile coule, et on rentre quand elle a disparu.
const SINK_MS := 2400

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
	Screens.moved.connect(func(id: Screens.Place) -> void:
		if id == Screens.Place.ISLAND:
			_arrive())
	# LE VOLCAN, tel que la manche le dit : il gronde a chaque palier qui
	# monte, et l'ile coule a l'eruption. La lecon n'a pas de volcan ; ceci
	# attend que les manches en ligne arrivent sur l'ile.
	RunState.current.volcano_changed.connect(_on_volcano)
	RunState.current.erupting_changed.connect(func(ms: int) -> void:
		if ms > 0:
			play_eruption(ms)
		else:
			reset_eruption())


## LE GRONDEMENT, seulement quand le palier MONTE (use-game-socket.ts) : une
## lecture qui repete le meme palier ne gronde pas deux fois.
var _warn_heard := 0


func _on_volcano() -> void:
	var stage := RunState.current.warn_stage
	if stage > _warn_heard:
		Sound.rumble(stage)
	_warn_heard = stage


## L'ILE COULE (IslandScene.ts `playEruption`). Le sol entier tremble sur la
## premiere moitie, puis glisse vers le bas et s'efface ; la mer et le ciel,
## sur leurs propres couches, restent — c'est la terre qui s'en va. Le voile,
## les gouttes et « THE ISLAND SINKS » sont la moitie chrome
## (eruption_overlay.gd).
const SHAKE_PX := 9.0
const ERUPTION_RISE_PX := 260.0
const HEAVE_STEP := 0.05
var _eruption: Tween


func play_eruption(duration_ms: int, heave: bool = true) -> void:
	var s := maxf(1.0, float(duration_ms)) / 1000.0
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	if _fade != null and _fade.is_valid():
		_fade.kill()
	modulate.a = 1.0
	if _eruption != null and _eruption.is_valid():
		_eruption.kill()
	var at := _current_shot().at
	var k := scale.x
	var kick := SHAKE_PX * 2.0 / k

	_eruption = create_tween()
	if not heave:
		# LA FIN DU TUTORIEL : pas de volcan, rien ne tremble. L'ile s'en va
		# vers le bas pendant que la camera garde le ciel, et l'ecume monte.
		_eruption.set_parallel(true)
		# EN PIXELS D'ECRAN, sans diviser par le zoom : le tutoriel est cadre
		# serre (k ~ 2.5), et divise la remontee tombait a 100 px — un
		# glissement que le fondu avalait avant qu'on y lise un pan.
		_eruption.tween_property(self, "position:y", at.y + ERUPTION_RISE_PX, s * 0.8) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		_eruption.tween_callback(_tiles.plain_blend).set_delay(s * 0.1)
		_eruption.tween_property(self, "modulate:a", 0.0, s * 0.7).set_delay(s * 0.15) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		return
	Sound.play("explosion")
	# LE SOULEVEMENT : un aller-retour toutes les 50 ms, sur 55 % de la duree.
	var steps := int(floor(s * 0.55 / HEAVE_STEP))
	for i in steps:
		var to := at + Vector2(kick, kick * 0.6) if i % 2 == 0 else at
		_eruption.tween_property(self, "position", to, HEAVE_STEP)
	_eruption.tween_property(self, "position", at, HEAVE_STEP)
	# LA DESCENTE, puis le fondu qui la rattrape.
	_eruption.set_parallel(true)
	_eruption.tween_property(self, "position:y", at.y + ERUPTION_RISE_PX / k, s * 0.45) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_eruption.tween_callback(_tiles.plain_blend).set_delay(s * 0.05)
	_eruption.tween_property(self, "modulate:a", 0.0, s * 0.4).set_delay(s * 0.05) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)


## L'ILE REVIENT (`resetEruption`) : une nouvelle ile, ou la manche finie.
func reset_eruption() -> void:
	if _eruption != null and _eruption.is_valid():
		_eruption.kill()
	_eruption = null
	if _fade != null and _fade.is_valid():
		_fade.kill()
	modulate.a = 1.0
	_tiles.restore_blend()
	frame_camera(true)


## L'ARRIVEE : la camera DESCEND sur l'ile (IslandScene.ts `establishingPan`).
##
## Elle part `ESTABLISH_DROP_PX` plus HAUT sur le plateau — la mer et les
## hauteurs au nord — et glisse sur la prise de repos, pendant que l'ile monte
## de 0.35 a pleine lumiere. C'est ce qui dit « tu viens d'atterrir » : le
## lapin saute sur l'ile, la camera le suit dans sa chute. L'eruption repond
## dans l'autre sens (`play_eruption`, la camera remonte).
##
## LE SIGNE : `position.y` plus GRAND pousse le sol vers le bas de l'ecran,
## donc on regarde plus haut. On part de la, on revient a la prise.
##
## A CHAQUE TRAVERSEE vers l'ile. Le web ne le fait qu'une fois par ile
## (`islandRun`) pour ne pas jeter le cadrage d'un joueur qui revient d'un
## aller-retour au terrier ; ce portage n'a pas encore de manches qui
## tournent, donc chaque DIG EST une arrivee. Le cadrage du joueur, lui, est
## garde : `_wanted_cam` rend sa prise s'il en avait une.
const ESTABLISH_DROP_PX := 110.0
const ESTABLISH_SECONDS := 1.1
const ESTABLISH_FADE_FROM := 0.35


func _arrive() -> void:
	if _eruption != null and _eruption.is_valid():
		return
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	if _fade != null and _fade.is_valid():
		_fade.kill()
	var shot := _wanted_cam()
	scale = Vector2(shot.scale, shot.scale)
	position = shot.at + Vector2(0.0, ESTABLISH_DROP_PX)
	modulate.a = ESTABLISH_FADE_FROM
	# SOUS L'IRIS, on attend qu'il se rouvre : la bascule a lieu trou ferme,
	# puis vient le temps noir. Un pan lance tout de suite se jouerait dans le
	# noir et l'ile s'ouvrirait deja posee — le bug que le web a eu
	# (« no pan when you start a dig »).
	# Lu par son nom : le temps noir est recent dans `Wipe`, et une ile qui
	# ne compile plus parce qu'un rideau a change serait un prix idiot.
	var hold: float = (Wipe as Script).get_script_constant_map().get("HOLD_SECONDS", 0.0)
	var wait := hold if Screens.crossing else 0.0
	# `power2.out` : presque tout le trajet dans le premier tiers, puis il se
	# pose — une camera qui trouve son cadre, pas un sol qui glisse.
	_cam_tween = create_tween()
	_cam_tween.tween_property(self, "position", shot.at, ESTABLISH_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).set_delay(wait)
	# Le fondu finit au tiers du pan : l'ile est pleine pendant que la camera
	# se pose encore, et la case visee n'est jamais a moitie la.
	_fade = create_tween()
	_fade.tween_property(self, "modulate:a", 1.0, ESTABLISH_SECONDS / 3.0) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT).set_delay(wait)


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

	# LA FLECHE SUR LE BOUTON pendant que la lecon demande le X (le
	# `.rr-mark-arrow` du web) : le meme chevron d'or que celui du coffre, pour
	# que le signe sur une case et le signe sur une commande soient une seule
	# langue. Enfant du bouton, donc centree sur LUI quelle que soit la
	# longueur du mot dans la langue choisie.
	_mark_arrow = TextureRect.new()
	_mark_arrow.texture = preload("res://assets/ui/d8-arrow-down.png")
	_mark_arrow.modulate = Color("#ffd45c")
	_mark_arrow.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_mark_arrow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_mark_arrow.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_mark_arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mark_arrow.size = MARK_ARROW_SIZE
	_mark_arrow.visible = false
	_mark.add_child(_mark_arrow)

	# LE NOIR AUTOUR : tout s'eteint sauf le bouton, sa fleche et le bandeau.
	_spotlight = TeachSpotlight.new()
	add_child(_spotlight)

	_caption = FirstRunCaption.new()
	layer.add_child(_caption)
	_spotlight.lit = [_mark, _mark_arrow, _caption]

	# LA BOUSSOLE : un chevron au bord de l'ecran par coffre hors du cadre.
	# Pas sur le tutoriel — son coffre a sa fleche (`_tiles.tutorial`).
	_compass = ChestCompass.new()
	_compass.tiles = _tiles
	_compass.cam = self
	layer.add_child(_compass)
	_refresh_compass()

	_sink_sky = preload("res://scenes/ui/eruption_overlay.tscn").instantiate()
	_sink_sky.follows_run = false
	layer.add_child(_sink_sky)

	_refresh_tutorial_chrome()

	# L'HOTE DES CEREMONIES quand aucun chrome n'est monte (le bac a sable) :
	# au-dessus de tout, plein ecran, et transparent aux tapes tant qu'il est
	# vide — c'est la ceremonie elle-meme qui les arrete.
	var top := CanvasLayer.new()
	top.layer = 60
	add_child(top)
	_prize_host = Control.new()
	_prize_host.set_anchors_preset(Control.PRESET_FULL_RECT)
	_prize_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(_prize_host)

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


## UNE ILE HORS LIGNE, JOUABLE : generee de `seed_value`, ses contenus donnes
## ici depuis `content_seed` (la graine que le serveur garderait pour lui), au
## palier que `lifetime` carottes ouvrent.
##
## Pour le bac a sable et les bancs. Une manche en ligne ne passe jamais par
## la : ses contenus viennent du serveur, case par case.
func play_local(seed_value: String, content_seed: String = "", lifetime: float = 0.0) -> void:
	_local_deal = {"content_seed": content_seed, "lifetime": lifetime}
	reset_eruption()
	show_ground(seed_value)


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
	_ocean.build(map, seed_value)

	# LE PLATEAU : ce qui est enterre, et ce qu'on en sait deja.
	#
	# APRES le terrain, parce que les voiles se montent dans ses blocs — et
	# avant les losanges, qui partagent les memes blocs.
	_board = IslandBoard.new(map)
	_ground = null
	if FirstIsland.is_first(seed_value):
		_board.deal_tutorial()
	else:
		# LE DECOR DECIDE QUELLES CASES EXISTENT : rien n'est enterre sous un
		# arbre, et un arbre ne se traverse pas.
		_ground = IslandGround.new(map, FirstIsland.ground_seed(seed_value))
		_board.ground = _ground
		if _local_deal.size() > 0:
			_board.deal_generated(_ground, seed_value, _local_deal.content_seed,
				_local_deal.lifetime)
	_tiles.board = _board
	_tiles.terrain = _terrain
	# Sur le tutoriel, la fleche se plante sur le coffre et le mot du palier
	# lui laisse la place (ChestPointer.ts / `hideChestTier`).
	_tiles.tutorial = FirstIsland.is_first(seed_value)
	# LES COFFRES TOMBENT A L'ARRIVEE sur une ile neuve, pas a une reprise.
	_tiles.drop_chests = _local_deal.size() > 0
	# RIEN DEVANT UN COFFRE (`clearDecoOver`) : il doit se voir depuis l'autre
	# bout de l'ile, c'est toute la raison pour laquelle il est dessine avant
	# d'etre creuse. Le decor vient de la graine publique, les coffres de la
	# privee : ils ne se rencontrent qu'ici, au premier instant ou l'on
	# connait les deux. Les buissons sont a `TileView`, le reste au decor.
	for chest in _board.chest_tier:
		for cell in IslandScenery.cells_in_front(chest):
			_board.decor.erase(cell)
	_tiles.build()

	# LE DECOR DEBOUT — arbres, reperes, moutons, soldats. Rebati a chaque sol :
	# le terrain jette ses blocs, et le decor monte dedans meurt avec eux.
	if _scenery == null:
		_scenery = IslandScenery.new()
		add_child(_scenery)
	_scenery.terrain = _terrain
	_scenery.build(_ground if _ground != null else IslandGround.bare(map, seed_value))
	for chest in _board.chest_tier:
		_scenery.clear_over(chest)
	_holed.clear()
	_hole_cell = Vector2i(-99, -99)

	# LE JOUEUR, pose sur l'apparition du tutoriel — ou au milieu d'une ile
	# ordinaire, en attendant que le serveur dise ou. Il n'erre pas : sur l'ile
	# c'est le doigt qui le mene, et la lecon du X se pose depuis la case ou il
	# est. Le hash de la graine ne sert qu'a nourrir un RNG qui, sans errance,
	# ne tire rien.
	_rabbit.map = map
	_rabbit.roam = false
	var start := TutorialMap.spawn() if FirstIsland.is_first(seed_value) else Vector2i(-1, -1)
	if _ground != null:
		start = _ground.spawn()
	_rabbit.build(hash(seed_value), start)
	local_run = LocalRun.new(_board, start) if _local_deal.size() > 0 else null
	_local_over = false
	_warn_heard = 0

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
	_refresh_compass()
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
	if local_run != null and not _cam_moved_by_player:
		return _follow_shot(view)
	if _cam_moved_by_player:
		return BurrowCamera.clamp_place(_current_shot(), _terrain.map, view.x, view.y)
	return BurrowCamera.board(_terrain.map, view.x, view.y)


## LA PRISE DE JEU : le lapin au milieu, a 60 pixels par case, bornee comme
## un glissement du joueur (on ne montre pas la mer au-dela du bord).
func _follow_shot(view: Vector2) -> BurrowCamera.Shot:
	var k := PLAY_TILE_PX / (Iso.half_w() * 2.0)
	var here := local_run.at
	var focus := _terrain.map.screen_of(here.x, here.y) + Vector2(0, Iso.half_h())
	var shot := BurrowCamera.Shot.new(k, view * 0.5 - focus * k)
	return BurrowCamera.clamp_place(shot, _terrain.map, view.x, view.y)


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
	_update_hole()
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


## LE TROU DE PROFONDEUR (fx/DepthHole.ts, config/depthHoleLook.ts) : un
## disque trame perce dans ce qui se tient DEVANT le lapin, pour qu'un sapin
## trois fois plus haut qu'une case ne l'avale pas.
##
## LE CHOIX DE CE QUI EST PERCE se fait ici, sur les cases : tout ce qui est
## plus pres de la camera que le lapin (x + y plus grand) et a portee de sa
## ramure. Le web lit la meme chose sur son `zIndex` (`depthWindow`) ; le
## shader, lui, ne fait que le disque. Les cases derriere ne sont jamais
## percees — elles sont derriere.
const HOLE_SHADER := preload("res://shaders/depth_hole.gdshader")
const HOLE_RADIUS := 35.0
const HOLE_FEATHER := 11.0
const HOLE_DOT := 1.0
const HOLE_GHOST := 0.1
## Jusqu'ou devant le lapin (en rangs de profondeur x + y) et de cote (x - y)
## un decor peut encore le couvrir : un sapin fait trois cases de haut.
const HOLE_AHEAD := 6
const HOLE_SIDE := 3
## Le milieu du corps, au-dessus des pieds, en part de la frame : le lapin a
## le corps dans la moitie basse (`centreOf`, mesure sur le web).
const HOLE_BODY := 0.15

var _hole_mat: ShaderMaterial
var _holed: Array[CanvasItem] = []
var _hole_cell := Vector2i(-99, -99)


func _update_hole() -> void:
	if _scenery == null or _rabbit == null or _rabbit._sprite == null:
		return
	if _hole_mat == null:
		_hole_mat = ShaderMaterial.new()
		_hole_mat.shader = HOLE_SHADER
		_hole_mat.set_shader_parameter("ghost", HOLE_GHOST)
	var cell := _rabbit.at()
	if cell != _hole_cell:
		_hole_cell = cell
		_select_hole(cell)
	var sprite: Node2D = _rabbit._sprite
	var to_window := get_viewport().get_final_transform()
	var body := sprite.get_global_transform_with_canvas() * Vector2(0, -HomeRabbit.FRAME * HOLE_BODY)
	var k := scale.x * to_window.get_scale().x
	_hole_mat.set_shader_parameter("centre", to_window * body)
	_hole_mat.set_shader_parameter("radius", HOLE_RADIUS * k)
	_hole_mat.set_shader_parameter("feather", HOLE_FEATHER * k)
	_hole_mat.set_shader_parameter("dot_px", maxf(1.0, round(HOLE_DOT * k)))


## Pose le materiau sur ce qui couvre `cell`, et le RETIRE du reste — un
## sprite qui cesse d'etre devant n'a pas a garder un shader a vide.
func _select_hole(cell: Vector2i) -> void:
	for n in _holed:
		if is_instance_valid(n):
			n.material = null
	_holed.clear()
	for ahead in range(0, HOLE_AHEAD + 1):
		for side in range(-HOLE_SIDE, HOLE_SIDE + 1):
			# (x + y) = profondeur, (x - y) = cote ; on ne garde que les
			# combinaisons qui tombent sur une case entiere.
			if (ahead + side) % 2 != 0:
				continue
			var c := cell + Vector2i((ahead + side) / 2, (ahead - side) / 2)
			var nodes: Array = _scenery.nodes_at(c).duplicate()
			var bush := _tiles.bush_at(c)
			if bush != null:
				nodes.append(bush)
			for n in nodes:
				if n is CanvasItem and is_instance_valid(n):
					(n as CanvasItem).material = _hole_mat
					_holed.append(n)


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
	# LA MOLETTE ZOOME AUTOUR DU CURSEUR — au bureau seulement ; au doigt, le
	# pincement viendra avec le pan libre du web.
	if event is InputEventMouseButton and event.pressed and \
			(event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN):
		var f := WHEEL_ZOOM if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / WHEEL_ZOOM
		var view := get_viewport_rect().size
		set_place_cam(BurrowCamera.zoom_at(_current_shot(), f, event.position, _terrain.map, view.x, view.y))
		return
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
	if local_run != null:
		_local_tap(cell)
	elif _board != null:
		_board.dig(cell)
		_tiles.refresh()
	tile_tapped.emit(cell)


## UNE TAPE SUR UNE ILE HORS LIGNE — ce que le serveur ferait d'un `move` ou
## d'un `flag`, rejoue par `LocalRun`, puis montre.
##
## ARME : un X depuis la case du lapin, juste ou faux, et le mode retombe.
## SINON : un pas, qui creuse ce qu'il touche (il n'y a pas de « creuser » a
## part, sur le web non plus).
func _local_tap(cell: Vector2i) -> void:
	if _local_over:
		return
	var now := Time.get_ticks_msec()
	var out: Dictionary
	if _armed:
		_set_armed(false)
		out = local_run.flag(cell, now)
		if out.ok and bool(out.flag.correct):
			Sound.play("chime_quick")
		else:
			Sound.deny()
	else:
		out = local_run.move(cell, now)
		if not out.ok:
			# LE NON : l'anneau clignote d'un coup pour montrer ou est le oui.
			_ring.pulse()
			Sound.deny()
		else:
			_rabbit.send_to(out.tile)
			Sound.play("hop")
			if out.has("dig"):
				_on_local_dig(out.dig)
	_tiles.refresh()
	_refresh_ring()
	# LA CAMERA REVIENT AU LAPIN apres chaque pas : le joueur a pu promener le
	# plateau pour regarder, mais un pas dit « je suis ici maintenant ».
	if out.ok and not _armed:
		_cam_moved_by_player = false
		frame_camera()
	local_changed.emit(out)
	_check_local_end(out)


## CE QU'UN COUP DE PELLE A TROUVE, a l'oreille et a l'oeil. Le plateau joue
## deja la carotte, la bombe et l'envol du coffre (`TileView._reveal`) ; ici
## le son, le lapin sonne, et la ceremonie du coffre.
func _on_local_dig(dig: Dictionary) -> void:
	match int(dig.content):
		IslandBoard.Content.CARROT, IslandBoard.Content.GOLDEN:
			Sound.play("coin")
		IslandBoard.Content.BOMB:
			Sound.play("explosion")
			_stun_flash(int(Tuning.i("BOMB.STUN_MS")))
			# LE SOUFFLE EMPORTE CE QUI SE TENAIT SUR LA CASE — pas un mouton,
			# qui s'enfuit.
			if _scenery != null:
				_scenery.clear_cell(dig.tile, true)
		IslandBoard.Content.CHEST:
			_show_prize(dig.get("loot", {}))
		_:
			Sound.play("step")


## LE LAPIN SONNE clignote rouge le temps que le serveur lui refuse un pas :
## sans ca, le refus qui suit une bombe se lit comme une tape perdue.
func _stun_flash(ms: int) -> void:
	var t := create_tween()
	var beats := maxi(1, int(ms / 300.0))
	for i in beats:
		t.tween_property(_rabbit, "modulate", Color(1, 0.45, 0.45), 0.15)
		t.tween_property(_rabbit, "modulate", Color.WHITE, 0.15)


## LE LOT DU COFFRE (chest-prize.tsx) : la ceremonie pour un coffre annonce,
## le vol pour un lot sans palier. Les carottes s'animent deja sur la case et
## n'ont pas de ceremonie — sauf une piece Genesis, qui vaut toujours
## l'interruption.
func _show_prize(prize: Dictionary) -> void:
	if prize.is_empty():
		return
	if String(prize.get("kind", "")) == "carrots" and not bool(prize.get("nft", false)):
		Sound.play("coin")
		return
	var node := ChestPrize.announce(prize)
	if node != null and node.get_parent() == null and _prize_host != null:
		# Pas de chrome au-dessus (le bac a sable) : la ceremonie se pose ici,
		# plein ecran comme `Chrome.stamp` la pose.
		_prize_host.add_child(node)
		Kit.fill(node)


## LA FIN D'UNE MANCHE HORS LIGNE. Le dernier coffre sorti : l'ile erupte,
## comme sur le serveur (`ERUPTION.SEQUENCE_MS`), puis la manche est rendue.
## Plus d'energie : le lapin s'arrete, l'ile reste.
func _check_local_end(out: Dictionary) -> void:
	if _local_over:
		return
	var p := _board.chest_progress()
	# LE VOLCAN GRONDE A CHAQUE PALIER QUI MONTE (`warnStageFor`) : combien des
	# seuils de `ERUPTION.WARN_STAGES` la part de coffres pris a depasses.
	var stage := 0
	for w in Tuning.list("ERUPTION.WARN_STAGES"):
		if float(p.fraction) >= float(w):
			stage += 1
	if stage > _warn_heard:
		Sound.rumble(stage)
	_warn_heard = stage
	if int(p.total) > 0 and int(p.left) == 0:
		_local_over = true
		var ms := Tuning.i("ERUPTION.SEQUENCE_MS", 4000)
		play_eruption(ms)
		if _sink_sky != null:
			_sink_sky.play(ms)
		get_tree().create_timer(ms / 1000.0).timeout.connect(
			func() -> void: local_over.emit(true))
	elif bool(out.get("run_over", false)):
		_local_over = true
		local_over.emit(false)


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
		# Le bon X tinte, le mauvais dit non (IslandScene `flagTile`).
		if _board.flag(here, cell):
			_flags += 1
			Sound.play("chime_quick")
		else:
			Sound.deny()
		_tiles.refresh()
		_refresh_caption()
		_refresh_ring()
		return

	if not _board.is_beside(here, cell) or not _board.may_step(here, cell):
		# LE NON LOCAL : l'anneau clignote d'un coup pour montrer ou est le oui.
		# Et pendant la lecon, le bouton remue — c'est lui la sortie.
		_ring.pulse()
		Sound.deny()
		if _mark != null and _board.teaching_hold().x >= 0:
			_mark.wiggle()
		return

	var fresh := not _board.is_dug(cell)
	_rabbit.send_to(cell)
	Sound.play("hop")
	if fresh:
		_board.dig(cell)
		_digs += 1
		# CE QUE LA CASE CACHAIT S'ENTEND (IslandScene `reveal`) : la carotte
		# tinte, la bombe saute, le vide fait un pas.
		match _board.content.get(cell, IslandBoard.Content.EMPTY):
			IslandBoard.Content.CARROT:
				Sound.play("coin")
			IslandBoard.Content.BOMB:
				Sound.play("explosion")
			IslandBoard.Content.CHEST:
				pass
			_:
				Sound.play("step")
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
	var here := _rabbit.at() if local_run == null else local_run.at
	var lit: Array[Vector2i] = []
	if not _done and not _local_over:
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


func _refresh_compass() -> void:
	if _compass != null:
		_compass.visible = not _is_tutorial()


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
	if not tutorial_pending():
		return DEFAULT_SEED
	return FirstIsland.seed_for(_player_id())


## LE TUTORIEL EST-IL ENCORE DU ? Pour le chrome : DIG traverse droit vers
## la premiere ile tant qu'il l'est, sans passer par la liste (le web fait
## de meme pour un joueur sans manche), et la connexion y atterrit tout droit
## (title.gd). Deux faits : aucune manche au compteur (`runsPlayed`, venu du
## web), et pas de coffre de la lecon pris sur cet appareil PAR CE JOUEUR.
##
## PAR JOUEUR, pas par appareil : un drapeau unique rendait le tuto introuvable
## a tout nouvel invite du meme telephone — c'est-a-dire a quiconque veut le
## retester.
static func tutorial_pending() -> bool:
	if int(Session.player.get("runsPlayed", 0)) > 0:
		return false
	var cfg := ConfigFile.new()
	if cfg.load(TUTORIAL_PATH) != OK:
		return true
	return not bool(cfg.get_value("tutorial", _player_id(), false))


static func _player_id() -> String:
	return String(Session.player.get("id", "guest"))


func _remember_finished() -> void:
	var cfg := ConfigFile.new()
	cfg.load(TUTORIAL_PATH)
	cfg.set_value("tutorial", _player_id(), true)
	cfg.save(TUTORIAL_PATH)


## ARME OU DESARME LE MODE X de l'exterieur — le bouton MARK A BOMB du HUD de
## manche (`RunState.flag_mode`), quand c'est lui qui le porte.
func set_armed(armed: bool) -> void:
	if armed != _armed:
		_set_armed(armed)


## LE BOUTON DE L'ILE ou celui du HUD : un seul a l'ecran. Le bac a sable
## monte le HUD de manche, qui a le sien.
var own_mark := true


## LE RETOUR AU TERRIER, cache quand l'ile n'est pas un lieu du jeu (banc).
func set_standalone(on: bool) -> void:
	if _back != null:
		_back.visible = not on


## COMBIEN DE CASES UN X PEUT VISER depuis le lapin — la sonde du HUD
## (`markable_probe`) : zero, et le bouton refuse de s'armer.
func markable_count() -> int:
	if _board == null:
		return 0
	var here := _rabbit.at() if local_run == null else local_run.at
	var n := 0
	for c in _board._neighbours(here):
		var st = _board.state.get(c)
		if st == IslandBoard.State.DUG or st == IslandBoard.State.HINTED:
			continue
		if _board.is_flagged(c) or _board.content.get(c) == IslandBoard.Content.CHEST:
			continue
		n += 1
	return n


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
		_mark.visible = _is_tutorial() or (local_run != null and own_mark)
	if _caption == null:
		return
	if _is_tutorial():
		_refresh_caption()
	else:
		_caption.hide_beat()
		_tiles.set_pulse(Vector2i(-1, -1))
		_teach(false)


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
	_teach(s.beside and not _armed and not _done)
	if id == "mark" and _mark != null:
		_mark.wiggle()


## LA LECON DEMANDE LE X : le noir tombe, la fleche bat au-dessus du bouton.
## Des que le mode est arme, la demande passe sur le plateau (le X fantome)
## et le noir se leve — `teach && !armed` sur le web.
##
## La fleche : deux secondes de sautillement, deux d'arret
## (`rr-mark-arrow-bob`, Paul : « anime 2sc stop et animation up and down ») —
## un signe qui ne s'arrete jamais devient du decor.
const MARK_ARROW_SIZE := Vector2(40, 46)
const MARK_ARROW_GAP := 10.0
const MARK_ARROW_BOB := 7.0
var _arrow_bob: Tween


func _teach(on: bool) -> void:
	if _spotlight != null:
		_spotlight.set_on(on)
	if _mark_arrow == null or _mark_arrow.visible == on:
		return
	_mark_arrow.visible = on
	if _arrow_bob != null and _arrow_bob.is_valid():
		_arrow_bob.kill()
	if not on:
		return
	var rest := Vector2((_mark.size.x - MARK_ARROW_SIZE.x) * 0.5,
		-MARK_ARROW_SIZE.y - MARK_ARROW_GAP)
	_mark_arrow.position = rest
	var up := rest - Vector2(0, MARK_ARROW_BOB)
	_arrow_bob = create_tween().set_loops()
	for i in 3:
		_arrow_bob.tween_property(_mark_arrow, "position", up, 0.32) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_arrow_bob.tween_property(_mark_arrow, "position", rest, 0.32) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_arrow_bob.tween_interval(2.0)


## LE COFFRE EST PRIS : on laisse lire la phrase, puis on rentre.
##
## Le web finit sur un recapitulatif (« tes carottes sont au terrier ») ; ce
## portage n'a pas encore de bourse a recapituler, donc la manche se termine
## par le seul geste qui existe deja — la traversee vers le terrier.
func _finish_tutorial() -> void:
	_done = true
	# Le coffre de la lecon a sa fanfare, et le lapin saute de joie
	# (IslandScene `celebrateChest` : la musique ET `me.celebrate()`).
	Sound.music("victory")
	_rabbit.celebrate()
	_remember_finished()
	_tiles.set_pulse(Vector2i(-1, -1))
	get_tree().create_timer(DONE_SECONDS).timeout.connect(_sink_tutorial)


## LA LECON FINIE, L'ILE COULE : la camera remonte, l'ecume bleue jaillit du
## bas du cadre, puis la traversee vers le terrier. Le pendant de l'arrivee
## (`_arrive`) — on est descendu sur l'ile en sautant, on la quitte par le
## haut. Le web n'a qu'un recap ici ; c'est la sortie de l'eruption, sans le
## volcan, parce que « l'ile coule » est justement ce que la lecon doit dire.
func _sink_tutorial() -> void:
	if not (_done and Screens.in_world() and Screens.place == Screens.Place.ISLAND):
		return
	play_eruption(SINK_MS, false)
	if _sink_sky != null:
		_sink_sky.play(SINK_MS)
	get_tree().create_timer(SINK_MS / 1000.0).timeout.connect(
		func() -> void:
			if not (_done and Screens.in_world()):
				return
			# UNE FOIS AU TERRIER, l'ile se refait sur sa graine ordinaire —
			# cachee, donc sans que personne la voie changer. La prochaine
			# traversee n'est plus une lecon, et elle retrouve une ile entiere
			# et allumee : le naufrage est defait avant d'etre revu.
			Screens.moved.connect(
				func(id: Screens.Place) -> void:
					if id == Screens.Place.BURROW:
						if _sink_sky != null:
							_sink_sky.stop()
						reset_eruption()
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
