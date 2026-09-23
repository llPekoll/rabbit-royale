class_name Island
extends Node2D
## L'ILE — un des deux LIEUX du monde.
##
## Construite neuve a chaque traversee et detruite en repartant (screens.gd) :
## elle n'a aucun etat a remettre a zero, elle nait propre.
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
@onready var _rabbit: IslandRabbit = %Rabbit
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

## L'ILE EN LIGNE : le dernier instantane du serveur (`island`), et si le
## plateau affiche est le sien. Tant qu'il l'est, une tape part au serveur et
## ce sont ses evenements qui creusent — le client ne devine rien.
var _remote := false
var _remote_snap: Dictionary = {}

## LE ZOOM DE JEU : 60 pixels par case au paysage (islandCamera.ts
## `DEFAULT_TILE_PX`), centre sur le lapin. L'ile entiere au cadre se lit comme
## une carte ; on ne creuse pas une carte.
const PLAY_TILE_PX := 60.0
## LE TUTORIEL MONTRE TOUTE L'ILE, et de la mer autour : elle est si petite
## que son fit remplissait l'ecran — quatre cases de large, la lecon coupee.
## Fraction du fit (0,55 = l'ile sur un peu plus de la moitie de l'ecran) ;
## c'est aussi le plancher du zoom tant que la lecon dure.
const TUTORIAL_FIT := 0.55
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
## A sec : le coup, le sommeil, le gris et la ligne ont le temps d'etre lus.
const DRY_SECONDS := 2.6
## Puis l'ile coule, et on rentre quand elle a disparu.
const SINK_MS := 2400
## LA MANCHE EN LIGNE SE TERMINE (`_end_run`) : plus rien ne remet l'ile debout.
var _ending := false

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
	# L'ILE NAIT A CHAQUE TRAVERSEE (screens.gd) : l'instantane du `join` est
	# souvent arrive AVANT elle. On le reprend la ou RunState l'a garde — tant
	# que j'ai un lapin dessus, sinon c'est la manche d'avant.
	#
	# ET ON NE CONSTRUIT QU'UNE ILE. Poser d'abord l'ile d'attente
	# (`_opening_seed`) puis l'instantane coutait deux sols complets au milieu
	# du rideau — la moitie du temps de la traversee, jetee.
	var held := RunState.current.island
	var resume := not held.is_empty() and (not RunState.current.me().is_empty() \
			or not RunState.current.spectating.is_empty())
	if resume and not String(held.get("seed", "")).is_empty():
		_remote_snap = held
		show_ground(String(held.get("seed", "")))
	else:
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
	# L'ILE LIT LA SOCKET : l'instantane pose le plateau, les evenements le
	# creusent, et le mode X du HUD arme l'anneau.
	RunState.current.island_changed.connect(_on_snapshot)
	RunState.current.board.connect(_on_board_event)
	RunState.current.flag_mode_changed.connect(func(on: bool) -> void:
		if _remote:
			_set_armed(on))
	if resume:
		_on_snapshot(held)
	RunState.current.erupting_changed.connect(func(ms: int) -> void:
		if ms > 0:
			play_eruption(ms)
		elif not _ending:
			reset_eruption())
	RunState.current.run_ended.connect(_end_run)
	RunState.current.refused.connect(_on_refused)


## LE SERVEUR A REFUSE LA PLACE (`no_energy`, une ile disparue) : on n'a pas
## de lapin ici, on rentre. Le terrier dit l'attente et vend le plein. Le
## chrome ne traverse deja plus a sec (chrome.gd `_dig`) ; ceci couvre le
## terrier pas encore charge, ou une barre que le serveur lit plus basse.
func _on_refused(r: Dictionary) -> void:
	if _remote or local_run != null or _is_tutorial():
		return
	# Refuse pendant le rideau : la traversee en cours avalerait le retour.
	if Screens.crossing:
		await Screens.changed
	if not is_inside_tree() or Screens.place != Screens.Place.ISLAND:
		return
	RunState.current.go_home()
	Screens.cross(Screens.Place.BURROW)
	if String(r.get("code", "")) == "no_energy":
		Screens.moved.connect(func(_id: Screens.Place) -> void:
			EnergyPopup.open(), CONNECT_ONE_SHOT)


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
	# RIEN A DEFAIRE, RIEN A RECADRER : `RunState` redit « pas d'eruption » a
	# chaque evenement de la manche, et recadrer ici ramenait la camera sur le
	# lapin a CHAQUE PAS — la camera du web, elle, attend qu'il approche du bord.
	var sinking := (_eruption != null and _eruption.is_valid()) or modulate.a < 1.0
	if _eruption != null and _eruption.is_valid():
		_eruption.kill()
	_eruption = null
	if not sinking:
		return
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
	_back.pressed.connect(func() -> void:
		# RENTRER, C'EST ENCAISSER : le serveur banque sur `leave`. Un
		# spectateur, lui, n'a rien a encaisser : il quitte la salle.
		if _watching():
			RunState.current.stop_watching()
			_remote = false
			_remote_snap = {}
		elif _remote:
			RunState.current.leave()
			# Plus de siege : une ile revue sans `join` ne parle plus au
			# serveur, elle montre son sol et attend le prochain instantane.
			_remote = false
			_remote_snap = {}
		Screens.cross(Screens.Place.BURROW))
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
	_ocean.build(map, FirstIsland.ground_seed(seed_value))

	# LE PLATEAU : ce qui est enterre, et ce qu'on en sait deja.
	#
	# APRES le terrain, parce que les voiles se montent dans ses blocs — et
	# avant les losanges, qui partagent les memes blocs.
	_board = IslandBoard.new(map)
	_ground = null
	if FirstIsland.is_first(seed_value):
		# LA LECON SE JOUE TOUJOURS HORS LIGNE, meme connecte et meme quand
		# l'instantane du serveur est deja la. La lecon en ligne n'est pas
		# portee (personne n'appelle `RunState.set_teach_ready` : pres de la
		# bombe, rien ne s'allumait), et chaque pas y payait un aller-retour.
		# Le sol dessine est celui du serveur ; `_on_snapshot` ne le repose
		# jamais par-dessus une partie en cours.
		_remote = false
		_board.deal_tutorial()
	else:
		# LE DECOR DECIDE QUELLES CASES EXISTENT : rien n'est enterre sous un
		# arbre, et un arbre ne se traverse pas.
		_ground = IslandGround.new(map, FirstIsland.ground_seed(seed_value))
		_board.ground = _ground
		_remote = _local_deal.is_empty() and not _remote_snap.is_empty() \
			and String(_remote_snap.get("seed", "")) == seed_value
		if _remote:
			_board.apply_public(_ground, _remote_snap)
			# LE TROUPEAU TEL QU'IL EST, pas tel que la graine l'a pose : un
			# joueur qui arrive en cours de manche voit les moutons de tous.
			for sh in _remote_snap.get("sheep", []):
				if sh is Dictionary:
					_ground.move_sheep(String(sh.get("id", "")),
						Vector2i(int(sh.get("x", 0)), int(sh.get("y", 0))))
		elif _local_deal.size() > 0:
			_board.deal_generated(_ground, seed_value, _local_deal.content_seed,
				_local_deal.lifetime)
	_tiles.board = _board
	_tiles.terrain = _terrain
	# Sur le tutoriel, la fleche se plante sur le coffre et le mot du palier
	# lui laisse la place (ChestPointer.ts / `hideChestTier`).
	_tiles.tutorial = FirstIsland.is_first(seed_value)
	# LES COFFRES TOMBENT A L'ARRIVEE sur une ile neuve, pas a une reprise.
	_tiles.drop_chests = _local_deal.size() > 0 or _remote
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
	# EN LIGNE, le lapin est la ou le serveur le dit.
	var mine := RunState.current.me()
	if _remote and mine.has("tile"):
		start = _board.cell_of(int(mine["tile"]))
	_rabbit.seat = _seat_of(RunState.current.my_id()) if _remote else 0
	_rabbit.build(hash(seed_value), start)
	_sync_rivals()
	local_run = LocalRun.new(_board, start) if _local_deal.size() > 0 else null
	_local_over = false
	_warn_heard = 0

	# L'ANNEAU, dans les memes blocs que les voiles — et rallume tout de suite
	# autour de l'apparition.
	_ring.terrain = _terrain
	_ring.unread = func(c: Vector2i) -> bool:
		return _board.state.get(c) != IslandBoard.State.DUG \
			and _board.state.get(c) != IslandBoard.State.HINTED \
			and _board.content.get(c) != IslandBoard.Content.CHEST
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
	# LA LECON EN JEU n'a pas de `local_run` (seul le bac a sable en fait un) :
	# sans le tutoriel ici, elle tombait sur le fit plein ecran plus bas.
	if (local_run != null or _remote or _is_tutorial()) and not _cam_moved_by_player:
		return _follow_shot(view)
	if _cam_moved_by_player:
		return _clamp_cam(_current_shot())
	return BurrowCamera.board(_terrain.map, view.x, view.y)


## LA CAMERA NE SUIT PAS LE LAPIN, elle le GARDE A L'ECRAN
## (IslandScene `keepInView`). Elle reste immobile pendant qu'il marche au
## milieu, et ne glisse — 0,45 s, sans rebond, au zoom du moment — que quand il
## entre dans le tiers du bord. Recentrer a chaque saut faisait trembler le
## sol sous chaque pas ; un rebond en plus le faisait tanguer.
const FOLLOW_MARGIN := 0.3
const FOLLOW_SECONDS := 0.45


func _keep_in_view() -> void:
	if (local_run == null and not _remote) or _pressing:
		return
	var view := get_viewport_rect().size
	var here := _me_cell()
	var focus := _terrain.map.screen_of(here.x, here.y) + Vector2(0, Iso.half_h())
	var on := position + focus * scale.x
	if on.x > view.x * FOLLOW_MARGIN and on.x < view.x * (1.0 - FOLLOW_MARGIN) \
			and on.y > view.y * FOLLOW_MARGIN and on.y < view.y * (1.0 - FOLLOW_MARGIN):
		return
	var shot := _clamp_cam(BurrowCamera.Shot.new(scale.x, view * 0.5 - focus * scale.x))
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	_cam_tween = create_tween()
	_cam_tween.tween_property(self, "position", shot.at, FOLLOW_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


## LA PRISE DE JEU : le lapin au milieu, a 60 pixels par case, bornee comme
## un glissement du joueur (on ne montre pas la mer au-dela du bord).
func _follow_shot(view: Vector2) -> BurrowCamera.Shot:
	if _is_tutorial():
		var whole := BurrowCamera.board(_terrain.map, view.x, view.y)
		return _clamp_cam(BurrowCamera.Shot.new(whole.scale * TUTORIAL_FIT, whole.at))
	var k := PLAY_TILE_PX / (Iso.half_w() * 2.0)
	var here := _me_cell()
	var focus := _terrain.map.screen_of(here.x, here.y) + Vector2(0, Iso.half_h())
	var shot := BurrowCamera.Shot.new(k, view * 0.5 - focus * k)
	return _clamp_cam(shot)


func _current_shot() -> BurrowCamera.Shot:
	return BurrowCamera.Shot.new(scale.x, position)


## Les bornes de la camera ; le tutoriel descend sous le fit.
func _clamp_cam(shot: BurrowCamera.Shot) -> BurrowCamera.Shot:
	var view := get_viewport_rect().size
	return BurrowCamera.clamp_place(shot, _terrain.map, view.x, view.y,
		TUTORIAL_FIT if _is_tutorial() else 1.0)


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
	_tick_local_flock(delta)
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
## LE CONTOUR N'EST JAMAIS PERCE, en texels de l'art : un arbre fantome a 0,1
## cachait qu'une case voisine etait prise — l'anneau ne l'allumait pas, et
## rien ne disait pourquoi (2026-09-23). Le fil de la silhouette le dit, et le
## lapin se voit au travers. Compare sur scenes/bench/depth_hole_bench.tscn.
const HOLE_EDGE := 2.0
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
		_hole_mat.set_shader_parameter("edge", HOLE_EDGE)
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


## Les deux doigts du pincement (pinch.gd).
var _pinch := Pinch.new()


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
	# LE PINCEMENT, sur les doigts BRUTS — la seule entree tactile lue ici :
	# le glissement et la tape restent sur la souris emulee (voir plus haut).
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		var step := _pinch.feed(event)
		if _pinch.active():
			# Deux doigts : ce n'est plus une tape.
			if _pressing and not _did_drag:
				_did_drag = true
				_hints.set_hovered(Vector2i(-1, -1))
			if not step.is_empty():
				set_place_cam(Pinch.apply(step, _current_shot(), _terrain.map, get_viewport_rect().size))
		return
	# LA MOLETTE ZOOME AUTOUR DU CURSEUR — au bureau.
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
		if _pressing and not _pinch.active():
			_on_move(event.position)


func _on_press(at: Vector2) -> void:
	_pressing = true
	_did_drag = false
	_press_at = at
	_press_cam = position
	_hints.set_hovered(_cell_at(at))


func _on_move(at: Vector2) -> void:
	# APRES UN PINCEMENT, le doigt qui reste reprend le glissement la ou il est.
	if _pinch.ended:
		_pinch.ended = false
		_press_at = at
		_press_cam = position
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
	# UN COUP PASSE PAR LES REGLES : celles du serveur en ligne, ou leur copie
	# hors ligne (`LocalRun`). Sans l'une ni l'autre — l'ile d'attente, avant
	# l'instantane du `join`, ou apres son refus — on ne creuse RIEN : ce sol
	# n'est a personne, et y creuser gratis donnait une carte qui n'existe pas
	# (2026-09-23, « a sec on peut dig quand meme »).
	if local_run != null:
		_local_tap(cell)
	elif _remote and _watching():
		_aimed_tap(cell, at)
	elif _remote:
		_remote_tap(cell)
	else:
		_ring.pulse()
		Sound.deny()
	tile_tapped.emit(cell)


## OU EST MON LAPIN, en cases : la manche locale, sinon le lapin affiche.
func _me_cell() -> Vector2i:
	if local_run != null:
		return local_run.at
	# LE SPECTATEUR n'a pas de lapin : la camera garde celui qu'il regarde.
	var watched: IslandRabbit = _rivals.get(RunState.current.spectating)
	if watched != null:
		return watched.at()
	return _rabbit.at()


# ── L'ile en ligne ───────────────────────────────────────────────────────────

## L'INSTANTANE DU SERVEUR (`island`, a l'arrivee et a chaque reconnexion) :
## le plateau se repose dessus en entier. Le tutoriel n'en passe pas par la —
## son plateau est dessine et joue hors ligne.
func _on_snapshot(snap: Dictionary) -> void:
	if not _local_deal.is_empty():
		return
	var s := String(snap.get("seed", ""))
	if s.is_empty():
		return
	# UN TUTORIEL DEJA EN COURS HORS LIGNE N'EST JAMAIS REPOSE. L'ile nait
	# avant la reponse du `join` (title.gd, chrome.gd `_dig`) et la lecon se
	# joue sur l'appareil : le serveur garde son ile vierge, lapin au depart.
	# Son instantane — la reponse du `join`, ou toute reconnexion — reposait
	# ce sol vierge par-dessus la partie : « le tutorial reset des fois sans
	# raison » (2026-09-23). La lecon en ligne n'est pas portee (personne
	# n'appelle `set_teach_ready`), donc on reste hors ligne jusqu'au bout.
	if _is_tutorial() and FirstIsland.is_first(s):
		_flush_mirror()
		return
	# Deja pose par `_ready` avec ce meme instantane : ne pas refaire le sol.
	var built := is_same(snap, _remote_snap) and s == _seed and _board != null
	_remote_snap = snap
	if not built:
		show_ground(s)
	_back.relabel(I18N.t("run.stopWatching") if _watching() else "← TERRIER")
	RunState.current.markable_probe = func(_on: bool) -> int: return markable_count()
	_cam_moved_by_player = false
	frame_camera(true)


## CE QUE LA SALLE ENTEND (use-game-socket.ts `toScene`) : un evenement, une
## mise a jour du plateau, et ce qu'elle fait voir et entendre.
func _on_board_event(name: String, data: Variant) -> void:
	if not _remote or _board == null:
		return
	var d: Dictionary = data if data is Dictionary else {}
	var mine := RunState.current.my_id()
	match name:
		"tile_revealed":
			var what := String(d.get("content", "empty"))
			var c := _board.reveal_remote(int(d.get("tile", -1)), what, int(d.get("adjacent", 0)))
			_clear_planted(c)
			_tiles.refresh()
			_on_remote_reveal(c, what)
			_refresh_ring()
		"hints_revealed":
			var opened: Array[Vector2i] = []
			for h in d.get("tiles", []):
				opened.append(_board.hint_remote(int(h.get("tile", -1)), int(h.get("adjacent", 0))))
			# LA VAGUE part de la case d'ou la zone s'est ouverte ; sans `from`
			# (un vieux serveur), la zone s'ouvre a plat comme avant.
			if d.has("from"):
				_tiles.ripple(_board.cell_of(int(d["from"])), opened)
			_tiles.refresh()
			_refresh_ring()
		"bomb_flagged":
			_board.flagged[_board.cell_of(int(d.get("tile", -1)))] = true
			_tiles.refresh()
			_refresh_ring()
		"flag_result":
			var right := bool(d.get("correct", false))
			if right:
				Sound.play("chime_quick")
			else:
				Sound.deny()
			_flag_answered(_board.cell_of(int(d.get("tile", -1))), right,
				int(d.get("energyDelta", 0)), int(d.get("carrotDelta", 0)), int(d.get("streak", 0)))
		"rabbit_moved":
			var who := String(d.get("playerId", ""))
			var cell := _board.cell_of(int(d.get("tile", -1)))
			if who == mine:
				# DEJA LA : `bomb_hit` arrive AVANT `rabbit_moved` (server/index.ts)
				# et a deja pose le lapin sur sa case d'arrivee (`blast_back`).
				# Rejouer un saut couperait le renvoi en plein vol.
				if cell != _rabbit.at():
					_rabbit.send_to(cell)
					Sound.play("hop")
				_refresh_ring()
				if _shake == null or not _shake.is_running():
					_keep_in_view()
			else:
				var r: IslandRabbit = _rivals.get(who)
				if r != null and not r.is_under() and cell != r.at():
					r.send_to(cell)
				if who == RunState.current.spectating and (_shake == null or not _shake.is_running()):
					_keep_in_view()
		"bomb_hit":
			# `tile` : ou le souffle le pose (sa case de depart, run.ts
			# `cameFrom`) ; `bomb` : ou elle a saute. Un serveur d'avant `bomb`
			# ne l'envoie pas — la bombe est alors sa case, il y retombe.
			var who := String(d.get("playerId", ""))
			var r := _rabbit_of(who)
			if r != null:
				var back := _board.cell_of(int(d.get("tile", -1)))
				var bomb := _board.cell_of(int(d.get("bomb", d.get("tile", -1))))
				if r.at() != bomb:
					Sound.play("hop")
				r.blast_back(bomb, back)
				if r == _rabbit:
					_refresh_ring()
		"rabbit_joined":
			_add_rival(d, true)
		"rabbit_left":
			if not bool(d.get("grace", false)):
				var who := String(d.get("playerId", ""))
				var r: IslandRabbit = _rivals.get(who)
				if r != null:
					_rivals.erase(who)
					r.vanish()
		"rabbit_pushed":
			_on_pushed(d)
		"rabbit_died":
			# PLUS DE MORT (2026-09-23) : un voisin a sec s'en va d'un saut, il
			# ne s'affaisse plus sur le plateau. Le mien, c'est `_end_run`.
			var who := String(d.get("playerId", ""))
			var r: IslandRabbit = _rivals.get(who)
			if r != null and who != RunState.current.my_id():
				_rivals.erase(who)
				r.celebrate()
				get_tree().create_timer(DONE_SECONDS).timeout.connect(func() -> void:
					if is_instance_valid(r):
						r.vanish())
		"lightning_struck":
			_on_lightning(d)
		"rabbit_struck":
			var r := _rabbit_of(String(d.get("playerId", "")))
			if r != null:
				var stun := int(d.get("stunMs", 0))
				var fatal := bool(d.get("runOver", false))
				r.electrocute(stun, fatal)
				if not fatal:
					r.stun(stun)
		"bomb_planted":
			_mark_planted(_board.cell_of(int(d.get("tile", -1))))
		"hints_changed":
			for h in d.get("tiles", []):
				_board.hint_remote(int(h.get("tile", -1)), int(h.get("adjacent", 0)))
			_tiles.refresh()
		"move_result":
			# LA MOITIE PRIVEE : ce que MON coffre contenait.
			var dig: Dictionary = d.get("dig", {}) if d.get("dig") is Dictionary else {}
			if dig.has("tile"):
				var kind := IslandBoard.Content.GOLDEN if String(dig.get("content", "")) == "golden" \
					else IslandBoard.Content.EMPTY
				if String(dig.get("content", "")) == "bomb":
					kind = IslandBoard.Content.BOMB
				_float_dig(_board.cell_of(int(dig.tile)), int(dig.get("energyDelta", 0)),
					int(dig.get("carrotDelta", 0)), kind)
			if dig.get("loot") is Dictionary:
				var prize: Dictionary = (dig["loot"] as Dictionary).duplicate()
				prize["nft"] = bool(dig.get("nft", false))
				_show_prize(prize)
		"sheep_moved":
			_on_sheep_moved(d.get("sheep", []))
		"move_rejected":
			_ring.pulse()
			Sound.deny()
		"lightning_rejected", "plant_rejected":
			# Rien dans le sac, une case deja ouverte, trois bombes vives : non.
			Sound.deny()


## LES MOUTONS ONT BOUGE, parce que le serveur l'a dit (`sheep_moved`) — ou
## le troupeau hors ligne. Aucune regle ici : la fuite est dans `flee.ts` (et
## `IslandFlock`). La case change TOUT DE SUITE sur le plateau, le sprite
## rattrape : l'anneau doit refuser la case des que le serveur l'a fermee.
func _on_sheep_moved(flights: Array) -> void:
	if _ground == null or _board == null:
		return
	var moved := false
	for f in flights:
		if not (f is Dictionary):
			continue
		var id := String(f.get("id", ""))
		var to: Vector2i = f.to if f.get("to") is Vector2i else _board.cell_of(int(f.get("tile", -1)))
		if not _ground.move_sheep(id, to):
			continue
		moved = true
		var path: Array[Vector2i] = []
		for t in f.get("path", []):
			path.append(t if t is Vector2i else _board.cell_of(int(t)))
		if _scenery != null:
			if path.is_empty():
				_scenery.place_sheep(id, to)
			else:
				_scenery.walk_sheep(id, path, bool(f.get("sprinting", false)))
	if moved:
		_refresh_ring()


## LE TOUR DU TROUPEAU HORS LIGNE, au rythme du serveur (`FLOCK_TICK_MS`).
var _flock_tick := 0.0


func _tick_local_flock(delta: float) -> void:
	if local_run == null or _ground == null or _ground.sheep.is_empty() or _ending or _local_over:
		return
	_flock_tick += delta
	if _flock_tick < IslandFlock.TICK_SECONDS:
		return
	_flock_tick = 0.0
	var rabbits: Array[Vector2i] = []
	if local_run.alive:
		rabbits.append(local_run.at)
	var flights := IslandFlock.plan(_ground, rabbits)
	if not flights.is_empty():
		_on_sheep_moved(flights)


## UNE CASE S'OUVRE, qui que ce soit qui l'ait creusee : le son, et le souffle
## d'une bombe. Le plateau joue deja la carotte, le trou et le coffre.
func _on_remote_reveal(cell: Vector2i, what: String) -> void:
	match what:
		"carrot", "golden":
			Sound.play("coin")
		"bomb":
			_bomb_goes_off(cell)
		"chest":
			pass
		_:
			Sound.play("step")


# ── Les autres lapins, et ce qu'on leur fait ─────────────────────────────────

## LES LAPINS DES AUTRES, par id — le mien est `_rabbit`. Sur une ile regardee,
## TOUS les lapins sont ici, celui qu'on suit compris, et `_rabbit` se cache.
var _rivals: Dictionary = {}
## Mes bombes enterrees (`bomb_planted`) : un repere que moi seul vois.
var _planted: Dictionary = {}

## Le repere d'une bombe plantee : l'icone, petite et a moitie effacee
## (IslandScene.ts `markPlanted` : 0,45 case, alpha 0,55).
const PLANTED_ICON := preload("res://assets/ui/icons/bomb.png")
const PLANTED_ALPHA := 0.55
const PLANTED_TILES := 0.45
## Le doigt du foudroyeur trouve un lapin dans ce rayon (`rivalAt` : 14 px a
## l'echelle du lapin), avant la case sous lui.
const RIVAL_HIT_PX := 21.0


## REGARDE-T-ON au lieu de jouer ?
func _watching() -> bool:
	return _remote and not RunState.current.spectating.is_empty()


## LE SIEGE D'UN JOUEUR : son rang d'arrivee sur l'ile, qui choisit son pelage.
func _seat_of(id: String) -> int:
	var i := 0
	for k in RunState.current.rabbits:
		if String(k) == id:
			return i
		i += 1
	return i


func _rabbit_of(id: String) -> IslandRabbit:
	if not _watching() and id == RunState.current.my_id():
		return _rabbit
	return _rivals.get(id)


## LA SALLE ENTIERE, rebatie depuis RunState : a l'instantane, et a chaque sol.
func _sync_rivals() -> void:
	for r in _rivals.values():
		if is_instance_valid(r):
			r.queue_free()
	_rivals.clear()
	for k in _planted.values():
		if is_instance_valid(k):
			k.queue_free()
	_planted.clear()
	if not _remote:
		_rabbit.visible = true
		return
	var mine := RunState.current.my_id()
	_rabbit.visible = not _watching()
	if not _watching():
		_rabbit.set_plate(RunState.current.name_of(mine), true)
	for id in RunState.current.rabbits:
		if not _watching() and String(id) == mine:
			continue
		_add_rival(RunState.current.rabbits[id], false)


## UN LAPIN DE PLUS : pose sur sa case, et qui tombe du ciel s'il arrive.
func _add_rival(r: Dictionary, arriving: bool) -> void:
	var id := String(r.get("playerId", ""))
	if id.is_empty() or _terrain.map == null or _board == null:
		return
	if not _watching() and id == RunState.current.my_id():
		return
	var old: IslandRabbit = _rivals.get(id)
	if old != null and is_instance_valid(old):
		old.queue_free()
	var rabbit := IslandRabbit.new()
	rabbit.player_id = id
	rabbit.seat = _seat_of(id)
	rabbit.map = _terrain.map
	rabbit.roam = false
	# FRERE du lapin du joueur, pour se trier sur la meme regle.
	add_child(rabbit)
	move_child(rabbit, _rabbit.get_index() + 1)
	rabbit.build(hash(id), _board.cell_of(int(r.get("tile", 0))))
	rabbit.set_plate(String(r.get("name", "")), false)
	_rivals[id] = rabbit
	if arriving:
		rabbit.drop_in()
	if not bool(r.get("alive", true)):
		# Une manche finie n'a plus de lapin sur l'ile (plus de mort a montrer).
		_rivals.erase(id)
		rabbit.queue_free()
		return
	if int(r.get("stunMs", 0)) > 0:
		rabbit.stun(int(r.get("stunMs", 0)))


## POUSSE (docs/bumping.md) : un vol d'une case — ou, vers le large, a l'eau.
##
## Le lapin pousse ne recoit pas de `rabbit_moved` : cet evenement est le seul
## a dire ou il est. Pour le mien, l'anneau et la camera le suivent donc ici.
func _on_pushed(d: Dictionary) -> void:
	var who := String(d.get("playerId", ""))
	var r := _rabbit_of(who)
	if r == null:
		return
	var to := _board.cell_of(int(d.get("to", 0)))
	var stun := int(d.get("stunMs", 0))
	if bool(d.get("drowned", false)):
		var from := _board.cell_of(int(d.get("from", 0)))
		var sea := _board.cell_of(int(d.get("sea", d.get("from", 0))))
		var toward := Vector2i(signi(sea.x - from.x), signi(sea.y - from.y))
		r.drown(toward, to, stun)
		get_tree().create_timer(IslandRabbit.DROWN_FALL).timeout.connect(func() -> void:
			Sound.play("hop", 0.55))
	else:
		r.knock_to(to)
		Sound.play("hop", 0.8)
		if stun > 0:
			r.stun(stun)
	# RULE 7 : le mien sait qui l'a fait — la plaque du pousseur rougit.
	if who == RunState.current.my_id():
		var bully: IslandRabbit = _rivals.get(String(d.get("pushedBy", "")))
		if bully != null:
			bully.blame()
	if r == _rabbit or who == RunState.current.spectating:
		_refresh_ring()
		# La camera suit le vol, ou la remontee au milieu.
		var wait := float(stun) / 1000.0 if bool(d.get("drowned", false)) else IslandRabbit.KNOCK_FLIGHT
		get_tree().create_timer(wait).timeout.connect(func() -> void:
			if is_inside_tree():
				_keep_in_view())


## LA FOUDRE (`playLightning`) : un eclair par case du carre, le son, la
## secousse. Le sol ouvert suit par `tile_revealed`, les lapins par
## `rabbit_struck`.
func _on_lightning(d: Dictionary) -> void:
	var tiles: Array = d.get("tiles", [])
	if tiles.is_empty():
		tiles = [int(d.get("target", 0))]
	var cells: Array[Vector2i] = []
	var indices: Array[int] = []
	for t in tiles:
		indices.append(int(t))
		cells.append(_board.cell_of(int(t)))
	LightningFx.strike(self, _terrain, cells, indices)
	Sound.play("explosion")
	_impact_shake()


func _mark_planted(cell: Vector2i) -> void:
	if _planted.has(cell) or _terrain == null:
		return
	var icon := Sprite2D.new()
	icon.texture = PLANTED_ICON
	var w := Iso.half_w() * 2.0 * PLANTED_TILES
	icon.scale = Vector2.ONE * (w / float(PLANTED_ICON.get_width()))
	icon.offset = Vector2(0, -PLANTED_ICON.get_height() * 0.2)
	icon.modulate.a = PLANTED_ALPHA
	if not _terrain.mount_veil(cell, icon, LightningFx.Z_BOLT - 8):
		icon.free()
		return
	_planted[cell] = icon


func _clear_planted(cell: Vector2i) -> void:
	var icon: Node = _planted.get(cell)
	if icon != null and is_instance_valid(icon):
		icon.queue_free()
	_planted.erase(cell)


## LA TAPE DU SPECTATEUR : rien sans visee. Armee, la foudre part sur le lapin
## le plus proche du doigt (sinon la case), la bombe sur la case — puis la
## visee retombe, comme sur le web (`onStrikeIntent` / `onPlantIntent`).
func _aimed_tap(cell: Vector2i, at: Vector2) -> void:
	var state := RunState.current
	match state.aiming:
		"strike":
			var target := _rival_near(at)
			state.lightning(_board.index_of(target if target.x >= 0 else cell))
		"plant":
			state.plant(_board.index_of(cell))
		_:
			return
	state.set_aiming("")


func _rival_near(at: Vector2) -> Vector2i:
	var local := (at - position) / scale.x
	var best := Vector2i(-1, -1)
	var best_d := RIVAL_HIT_PX
	for r in _rivals.values():
		if not is_instance_valid(r) or not r.visible:
			continue
		# Le milieu du corps, pas les pieds.
		var body: Vector2 = r.position + Vector2(0, -16.0 * HomeRabbit.RABBIT_SCALE * 0.5)
		var dist := body.distance_to(local)
		if dist < best_d:
			best_d = dist
			best = r.at()
	return best


## UNE TAPE SUR UNE ILE EN LIGNE : `move` ou `flag` au serveur (RunState
## decide selon le mode X). Le NON evident se dit ici, sans aller-retour — une
## case trop loin, une falaise —, le reste c'est le serveur qui le dit.
func _remote_tap(cell: Vector2i) -> void:
	var here := _me_cell()
	var index := _board.index_of(cell)
	if RunState.current.flag_mode:
		if not _board.is_beside(here, cell):
			_ring.pulse()
			Sound.deny()
			return
		RunState.current.move(index)
		return
	if not _board.is_beside(here, cell) or not _board.may_step(here, cell):
		_ring.pulse()
		Sound.deny()
		return
	RunState.current.move(index)


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
			if out.ok:
				_tiles.ripple(out.tile, out.flag.get("hinted", []))
		if out.ok:
			_flag_answered(out.flag.tile, bool(out.flag.correct), int(out.flag.energy_delta),
				int(out.flag.carrot_delta), int(out.flag.streak))
	else:
		out = local_run.move(cell, now)
		if not out.ok:
			# LE NON : l'anneau clignote d'un coup pour montrer ou est le oui.
			_ring.pulse()
			Sound.deny()
		else:
			# SUR UNE BOMBE, le souffle le renvoie d'ou il venait : `out.tile`
			# est deja cette case-la (`LocalRun.move`).
			if out.has("dig") and int(out.dig.content) == IslandBoard.Content.BOMB:
				_rabbit.blast_back(out.dig.tile, out.tile)
			else:
				_rabbit.send_to(out.tile)
			Sound.play("hop")
			if out.has("dig"):
				_on_local_dig(out.dig)
				_float_dig(out.dig.tile, int(out.dig.energy_delta), int(out.dig.carrot_delta),
					int(out.dig.content))
				_tiles.ripple(out.dig.tile, out.dig.get("hinted", []))
			else:
				_tiles.ripple(out.tile, out.get("hinted", []))
	_tiles.refresh()
	_refresh_ring()
	if out.ok and (_shake == null or not _shake.is_running()):
		_keep_in_view()
	local_changed.emit(out)
	_check_local_end(out)


## CE QUE MON X A RAPPORTE, dit sur la case (IslandScene `flagAnswered`) :
## l'energie dans le jaune de la barre avec son eclair, les carottes par-dessus,
## et la serie a partir du deuxieme X juste — une serie que personne ne voit est
## une serie que personne ne protege. Faux : ce qu'il a coute, en rouge, et le X
## tremble « non ».
func _flag_answered(cell: Vector2i, correct: bool, energy: int, carrots: int, streak: int) -> void:
	if _tiles == null:
		return
	if correct:
		if energy > 0:
			_tiles.float_text(cell, "+%d" % energy, TileView.ENERGY_YELLOW, 1.6, 0.0, true)
		if carrots > 0:
			var base := Tuning.i("FLAG.CARROTS_BASE", 1)
			var cap_at := ceili(float(Tuning.i("FLAG.CARROTS_MAX", 3) - base)
				/ maxf(1.0, Tuning.i("FLAG.CARROTS_STEP", 1))) + 1
			var gold := streak >= cap_at
			_tiles.float_text(cell, "+%d" % carrots, Color("#ffd138") if gold else Color.WHITE,
				1.6, -16.0)
		if streak >= 2:
			_tiles.float_text(cell, "x%d" % streak, Color("#ffd138"), 1.3, -34.0)
	else:
		_tiles.deny_x(cell)
		if energy != 0:
			_tiles.float_text(cell, "%d" % energy, TileView.X_RED, 1.8, 0.0, true)


## CE QU'UN COUP DE PELLE A RAPPORTE, pour le creuseur seul (`floatGain`) : les
## carottes en blanc, en or et plus grosses pour une doree. Et l'energie quand
## la case a fait plus que coûter son pas — une carotte qui rend, une bombe qui
## prend. Le simple cout d'un pas n'est pas dit : un « -1 » a chaque case serait
## du bruit.
func _float_dig(cell: Vector2i, energy: int, carrots: int, content: int) -> void:
	if _tiles == null:
		return
	var golden := content == IslandBoard.Content.GOLDEN
	if carrots > 0:
		_tiles.float_text(cell, "+%d" % carrots, Color("#ffd138") if golden else Color.WHITE,
			2.2 if golden else 1.6, 0.0)
	var cost := Tuning.i("ENERGY.DIG_COST", 1)
	if energy > 0:
		_tiles.float_text(cell, "+%d" % energy, TileView.ENERGY_YELLOW, 1.4, -16.0 if carrots > 0 else 0.0, true)
	elif energy < -cost or (energy < 0 and content == IslandBoard.Content.BOMB):
		_tiles.float_text(cell, "%d" % energy, TileView.X_RED, 1.8, 0.0, true)


## CE QU'UN COUP DE PELLE A TROUVE, a l'oreille et a l'oeil. Le plateau joue
## deja la carotte, la bombe et l'envol du coffre (`TileView._reveal`) ; ici
## le son, le lapin sonne, et la ceremonie du coffre.
func _on_local_dig(dig: Dictionary) -> void:
	match int(dig.content):
		IslandBoard.Content.CARROT, IslandBoard.Content.GOLDEN:
			Sound.play("coin")
		IslandBoard.Content.BOMB:
			# Le renvoi du lapin : `blast_back`, lance par `_local_tap`.
			_bomb_goes_off(dig.tile)
		IslandBoard.Content.CHEST:
			_show_prize(dig.get("loot", {}))
		_:
			Sound.play("step")


## LA BOMBE SAUTE QUAND LE LAPIN SE POSE DESSUS, pas quand on tape : le son,
## ce qui se tenait sur la case, la secousse — au meme instant que le feu de
## la case et le renvoi du lapin (`IslandRabbit.BLAST_AT`).
func _bomb_goes_off(cell: Vector2i) -> void:
	get_tree().create_timer(IslandRabbit.BLAST_AT).timeout.connect(func() -> void:
		if not is_inside_tree():
			return
		Sound.play("explosion")
		# LE SOUFFLE EMPORTE CE QUI SE TENAIT SUR LA CASE — pas un mouton, qui
		# s'enfuit. (Le trou, le feu et le buisson : `TileView._blast`.)
		if _scenery != null:
			_scenery.clear_cell(cell, true)
		_impact_shake())


## LA SECOUSSE D'UNE BOMBE (Blast.ts `impactShake`) : huit coups qui
## s'amortissent, 45 ms chacun, a 9 pixels d'ECRAN — divises par le zoom, sinon
## le meme coup secouerait plus fort a mesure qu'on zoome. La camera suit
## APRES : une glissade lancee pendant la secousse l'effacerait.
const IMPACT_SHAKE_PX := 9.0
var _shake: Tween


func _impact_shake() -> void:
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	if _shake != null and _shake.is_valid():
		_shake.kill()
		position = _shake_home
	_shake_home = position
	var kick := IMPACT_SHAKE_PX / scale.x
	_shake = create_tween()
	var beats := 8
	for i in beats:
		var a := kick * (1.0 - float(i) / beats)
		var sgn := 1.0 if i % 2 == 0 else -1.0
		_shake.tween_property(self, "position", _shake_home + Vector2(a * sgn, a * 0.6 * sgn), 0.045)
	_shake.tween_property(self, "position", _shake_home, 0.05)
	_shake.tween_callback(_keep_in_view)


var _shake_home := Vector2.ZERO


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
	# LE COFFRE S'OUVRE D'ABORD SUR SA CASE (`TileView._clear_chest`) : la
	# ceremonie posee tout de suite couvrait l'ouverture.
	await get_tree().create_timer(TileView.CHEST_OPEN_SECONDS).timeout
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
		_mirror_act("flag", cell)
		# Le bon X tinte, le mauvais dit non (IslandScene `flagTile`).
		if _board.flag(here, cell):
			_flags += 1
			Sound.play("chime_quick")
		else:
			Sound.deny()
			_tiles.deny_x(cell)
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
	_mirror_act("move", cell)
	# SUR UNE BOMBE, renvoye d'ou il venait — comme le serveur a qui le pas
	# est rejoue (run.ts `cameFrom`) : sinon le miroir perdrait le lapin.
	if fresh and _board.content.get(cell) == IslandBoard.Content.BOMB:
		_rabbit.blast_back(cell, here)
	else:
		_rabbit.send_to(cell)
	Sound.play("hop")
	if fresh:
		_tiles.ripple(cell, _board.dig(cell))
		_digs += 1
		# CE QUE LA CASE CACHAIT S'ENTEND (IslandScene `reveal`) : la carotte
		# tinte, la bombe saute, le vide fait un pas.
		match _board.content.get(cell, IslandBoard.Content.EMPTY):
			IslandBoard.Content.CARROT:
				Sound.play("coin")
			IslandBoard.Content.BOMB:
				_bomb_goes_off(cell)
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
	var here := _me_cell()
	var lit: Array[Vector2i] = []
	if not _done and not _local_over and not _watching():
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


## LA LECON HORS LIGNE — pas la premiere ile du serveur, qui se joue comme
## les autres et dont la lecon est tenue la-bas (RunState `first_run`).
func _is_tutorial() -> bool:
	return FirstIsland.is_first(_seed) and not _remote


## LE SERVEUR SUIT LA LECON EN SOURDINE. Elle se joue hors ligne, mais c'est
## le serveur qui la clot : sans le coffre pris chez lui, `runsPlayed` reste a
## zero et le DIG suivant rassoit le joueur sur le tutoriel. Chaque pas et
## chaque X de la lecon lui sont donc rejoues — memes regles des deux cotes
## (tutorial_map.gd, la retenue de la bombe) — sans rien attendre en retour :
## l'ile hors ligne n'ecoute pas ses evenements (`_on_board_event` exige
## `_remote`). Ce qui est tape avant le siege attend l'instantane.
##
## UN A LA FOIS, ESPACES : le serveur refuse un pas moins de
## MULTIPLAYER.MIN_MOVE_INTERVAL_MS (90) apres le precedent (`too-fast`), et
## une file videe d'un coup a l'arrivee du siege perdait tout sauf le premier.
const MIRROR_GAP_S := 0.15
var _mirror: Array = []
var _mirror_busy := false


func _mirror_act(what: String, cell: Vector2i) -> void:
	if not Session.signed_in():
		return
	_mirror.append([what, _board.index_of(cell)])
	_flush_mirror()


func _flush_mirror() -> void:
	if _mirror_busy:
		return
	_mirror_busy = true
	while not _mirror.is_empty() and is_inside_tree():
		var state := RunState.current
		if not GameSocket.is_live() or state.me().is_empty() or state.seed != _seed:
			break
		var a: Array = _mirror.pop_front()
		GameSocket.act(String(a[0]), int(a[1]))
		await get_tree().create_timer(MIRROR_GAP_S).timeout
	_mirror_busy = false


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
	_standalone = on
	_refresh_back()


var _standalone := false


func _on_screen() -> bool:
	return is_inside_tree() and get_viewport() == get_tree().root


func _exit_tree() -> void:
	if _on_screen() and _mark != null and _mark.visible:
		RunState.current.set_island_owns_mark(false)


## PAS DE RETOUR PENDANT LE TUTORIEL : la lecon se fait d'un bout a l'autre,
## sans sortie qui disperse l'attention (Paul, 2026-09-23 : « qu'on soit
## focus »). Hors ligne comme en ligne — c'est la graine qui le dit.
func _refresh_back() -> void:
	if _back != null:
		_back.visible = not _standalone and not FirstIsland.is_first(_seed)


## COMBIEN DE CASES UN X PEUT VISER depuis le lapin — la sonde du HUD
## (`markable_probe`) : zero, et le bouton refuse de s'armer.
func markable_count() -> int:
	if _board == null:
		return 0
	var here := _me_cell()
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
		# LE HUD A LE SIEN AU MEME COIN : un seul des deux se montre. Sans ca,
		# un tutoriel qui repartait hors ligne empilait les deux planches.
		# L'ile de prechauffage (screens.gd `_warm`) vit dans un SubViewport
		# et ne doit rien dire au HUD.
		if _on_screen():
			RunState.current.set_island_owns_mark(_mark.visible)
	_refresh_back()
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
			if not (_done and is_inside_tree()):
				return
			# RIEN A DEFAIRE : cette ile meurt a la traversee, et la prochaine
			# est construite neuve — sur sa graine ordinaire, la lecon etant
			# notee finie (`_remember_finished`).
			Screens.cross(Screens.Place.BURROW))


## LA MANCHE EN LIGNE EST FINIE — comme le tutoriel, sans mort (2026-09-23).
##
## Ile videe ou energie a zero, meme fin : le lapin saute, l'ile coule, on
## rentre au terrier. Videe, le volcan a deja joue son eruption
## (ERUPTION.SEQUENCE_MS) : on ne rejoue que le saut et la traversee. Le
## niveau gagne se dit au terrier, en tampon, une fois arrive.
##
## Le tutoriel se termine seul (`_finish_tutorial`) : son plateau est local.
func _end_run(result: Dictionary) -> void:
	if not _remote or _ending or not RunState.current.spectating.is_empty():
		return
	_ending = true
	_done = true
	var cleared := bool(result.get("cleared", false))
	var leveled := bool(result.get("leveledUp", false))
	# La premiere ile du serveur finit sur son coffre : la lecon est faite.
	var lesson := bool(result.get("tutorialDone", false))
	if lesson:
		_remember_finished()
	if cleared or lesson:
		Sound.music("victory")
		if _rabbit != null and not _rabbit.is_under():
			_rabbit.celebrate()
		await get_tree().create_timer(DONE_SECONDS).timeout
		if not _still_ending():
			return
		if not cleared:
			play_eruption(SINK_MS, false)
			if _sink_sky != null:
				_sink_sky.play(SINK_MS)
			await get_tree().create_timer(SINK_MS / 1000.0).timeout
			if not _still_ending():
				return
	else:
		# A SEC (`exhaustRabbit`) : l'ile ne coule pas — elle n'est pas finie,
		# c'est le joueur qui n'a plus de quoi y marcher. Il tombe et s'endort
		# ou il se tient, le monde passe au gris, une ligne dit pourquoi — et
		# le plein est offert LA, sur l'ile grise (2026-09-23) : payer et
		# repartir creuser, ou rentrer. Rentrer d'office faisait chercher la
		# recharge au terrier, et le joueur ne la voyait jamais.
		_refresh_ring()
		if _rabbit != null and not _rabbit.is_under():
			_rabbit.exhaust()
		Sound.music("gameover")
		var drain := Drain.start(self, I18N.t("raid.outOfEnergy").to_upper())
		# La barre du terrier relue pendant que le lapin s'endort : le
		# dialogue la montre, et celle d'avant la run mentirait. Il suit
		# `Home.changed`, la reponse peut arriver apres lui.
		Home.refresh()
		await get_tree().create_timer(DRY_SECONDS).timeout
		if not _still_ending():
			return
		drain.fade_line()
		var level := int(result.get("level", 0)) if leveled else 0
		EnergyPopup.open("carrots", _dig_again.bind(level), _go_home.bind(level))
		return
	_go_home(int(result.get("level", 0)) if leveled else 0)


## LA RUN EST FINIE, ON RENTRE. `level` > 0 : le lapin a pris un niveau, et
## le tampon attend le terrier — pose sous l'iris, il ne se verrait pas.
func _go_home(level: int = 0) -> void:
	RunState.current.go_home()
	Screens.cross(Screens.Place.BURROW)
	_stamp_on_arrival(level)


## LE PLEIN PRIS A SEC : une nouvelle run, sans passer par le terrier. Le
## serveur a deja clos celle-ci (le siege est depense) : c'est un `join`
## neuf, et l'ile est reconstruite sous le rideau — `cross` ne fait rien
## vers le lieu ou l'on est deja.
func _dig_again(level: int = 0) -> void:
	await Home.refresh()
	if not is_inside_tree():
		return
	RunState.current.go_home()
	RunState.current.join(null)
	Screens.curtain(Screens.show_place.bind(Screens.Place.ISLAND))
	_stamp_on_arrival(level)


static func _stamp_on_arrival(level: int) -> void:
	if level <= 0:
		return
	Screens.moved.connect(func(_id: Screens.Place) -> void:
		LevelUpStamp.announce_rabbit(level), CONNECT_ONE_SHOT)


func _still_ending() -> bool:
	return _ending and is_inside_tree() and Screens.in_world() \
		and Screens.place == Screens.Place.ISLAND


## LA CASE SOUS UN POINT DE L'ECRAN.
##
## L'ecran vers l'espace du terrain, puis la geometrie. C'est ICI que vit la
## transformation de la camera — `BurrowPick` n'a pas a la connaitre.
func _cell_at(at: Vector2) -> Vector2i:
	return BurrowPick.at(_terrain.map, (at - position) / scale.x)


## LE JOUEUR PREND LE PLATEAU EN MAIN. Applique directement, sans tween : un
## glissement est continu, et une demi-seconde d'ease trainerait derriere lui.
func set_place_cam(shot: BurrowCamera.Shot) -> void:
	var held := _clamp_cam(shot)
	_cam_moved_by_player = true
	if _cam_tween != null and _cam_tween.is_valid():
		_cam_tween.kill()
	scale = Vector2(held.scale, held.scale)
	position = held.at
