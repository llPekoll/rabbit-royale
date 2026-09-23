extends Node2D
## LE TERRIER — un des deux LIEUX du monde.
##
## Construit neuf a chaque arrivee et detruit en partant (screens.gd). Ce qu'il
## montre vient de Home, pas de lui : il n'a rien a garder d'une visite a
## l'autre.
##
## SON SOL EST CELUI DU SERVEUR (burrow_layout.gd) : pousse de l'id du joueur,
## avec la meme entree, le meme potager et le meme paillasson — une bombe est
## un index que le serveur juge sur SON terrier. Il porte ses decors, ses
## clotures, ses bombes (burrow_traps.gd) et son lapin, tous montes dans les
## blocs du terrain et tries avec lui.

## UNE CASE A ETE TAPEE — pas glissee, pas effleuree : choisie.
##
## Un signal plutot qu'un appel direct : le terrier ne sait pas ce qu'on fait
## d'une case. Poser une bombe, la relever, choisir ou creuser — c'est au jeu
## de le decider, et le plateau ne doit pas avoir a connaitre la liste.
signal tile_tapped(cell: Vector2i)

## L'AMENAGEMENT a change — on tient autre chose, ou le brouillon differe de
## ce qui est enregistre (la barre d'amenagement relit `arrange_state`).
signal arrange_changed

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

var _seed := ""
## Le terrier du serveur pour `_seed`.
var _layout: BurrowLayout
## Les bombes posees, et le decor debout (arbres, reperes) — tous deux montes
## dans les blocs du terrain, donc refaits avec lui.
var _traps: BurrowTraps
var _scenery: IslandScenery
## Une pose ou un retrait en vol : une seconde tape attend la reponse.
var _toggling := false
## Les aretes dont la pose ou le retrait est en vol.
var _fencing := {}

## LA DEFENSE EN DIRECT (page.tsx, « YOUR BURROW UNDER ATTACK »). Un raid sur
## CE terrier est pousse par la socket (RaidState `incoming`) ; tant qu'il
## dure, le plateau est celui du defenseur : l'intrus y est dessine et saute a
## chaque poussee, la grille reste levee pour enterrer une bombe devant lui,
## et une tape sur le lapin appelle l'eclair.
var _defending := false
var _raider: HomeRabbit
var _raider_at := -1
## Les pieges sautes a la derniere lecture : chaque nouveau se joue une fois.
var _sprung_seen := 0
## Le raid dont la fin a ete jouee, pour qu'une relecture ne la rejoue pas.
var _ended_shown := ""
## Le raid dont l'eclair a ete joue.
var _struck_shown := ""
## LE RAID QU'ON MENE (page.tsx, l'effet `setRaid`). Le terrier devient le
## plateau du raid : le sol du DEFENSEUR, pousse de son id, avec le voile,
## les chiffres et l'anneau que le serveur a envoyes (raid_board.gd). Les deux
## bouts du raid passent sous le rideau ; chaque pas entre les deux, non —
## un demi-seconde d'obturateur entre une tape et sa reponse est la seule
## chose qu'un demineur ne doit jamais faire.
var _raid_board: RaidBoard
## Vrai quand le plateau MONTRE un raid — pas quand RaidState en a un : entre
## les deux, il y a le rideau.
var _in_raid := false
## Un rideau demande et pas encore au noir : le milieu lira le dernier etat.
var _raid_curtain := false
## Ce que le plateau a dessine en dernier, pour qu'un `changed` qui ne change
## rien (busy, une note, la liste) ne redessine pas.
var _raid_key := ""
## Les cases ou une tape est acceptee — la liste du serveur, jamais la notre.
var _raid_steps := {}
## Le lapin du joueur, chez l'autre.
var _walker: HomeRabbit
var _walker_at := -1
## Le raid dont la fin a ete jouee sur le plateau.
var _raid_end_shown := ""
## Le niveau du terrier a l'affiche quand ce n'est pas le notre.
var _ground_level := -1
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

## L'AMENAGEMENT EN COURS (burrow_arrange.gd), ou null. Le sol dessine alors
## son brouillon, et une tape prend ou pose au lieu de promener le lapin.
var _arrange: BurrowArrange
## Ce qui est souleve sous le doigt, et d'ou : `[noeud, y d'origine]`.
var _lifted: Array = []
## Un enregistrement en vol.
var _saving := false


func _ready() -> void:
	# LA BARRE DE DEBOGAGE ne se monte plus que sur demande (`-- --debug-burrow`)
	# depuis que le chrome est branche (2026-09-23) : DIG traverse, DEFEND
	# arme le cadrage de pose, le profil deconnecte — et elle couvrait la
	# barre du haut. Le cycle des quatre cadrages reste la pour qui les regle.
	if "--debug-burrow" in OS.get_cmdline_user_args():
		_add_quit()
	_traps = BurrowTraps.new()
	_traps.name = "Traps"
	add_child(_traps)
	_scenery = IslandScenery.new()
	_scenery.name = "Scenery"
	add_child(_scenery)
	_raid_board = RaidBoard.new()
	_raid_board.name = "RaidBoard"
	add_child(_raid_board)
	_hints.is_mined = _traps.has_trap
	show_ground(_own_seed(), _own_edits())
	# LES BOMBES SUIVENT LA LISTE DU SERVEUR, dans les deux sens : ShopState
	# relit `/api/traps` apres chaque pose, retrait ou achat.
	var shop := ShopState.shared()
	shop.changed.connect(_sync_traps)
	if shop.traps.is_empty():
		shop.refresh()
	RaidState.current.incoming_changed.connect(_on_incoming)
	_on_incoming()
	get_viewport().size_changed.connect(_reframe)
	frame_camera(true)
	# La tape d'une case va a ce que le mode en fait : un pas de raid, une
	# bombe, l'amenagement — hors mode, le lapin y va.
	tile_tapped.connect(_on_tile_tapped)
	# LA MAISON SUIT LE NIVEAU du terrier ; l'achat d'un niveau la fete
	# (BurrowScene.ts `setLevel`). Ce plateau n'est jamais que le sien — la
	# garde du web (« chez soi seulement ») est vraie par construction.
	Home.changed.connect(_follow_level)
	Home.edits_changed.connect(_on_edits_changed)
	Home.level_up.connect(func(level: int) -> void:
		if _own_ground():
			_props.set_level(level)
			_props.celebrate())
	_follow_level()
	# LE RAID : on arrive peut-etre en plein raid (une session reprise) — le
	# rideau de la traversee vient de le couvrir, on dessine tout de suite.
	var raids := RaidState.current
	raids.changed.connect(_on_raid_changed)
	raids.sprung.connect(_on_raid_sprung)
	_cross_raid()


func _follow_level() -> void:
	if not _own_ground():
		_props.set_level(maxi(1, _ground_level))
		return
	if Home.loaded():
		_props.set_level(int(Home.burrow.get("level", 1)))


## Le sol a l'affiche est-il le notre ? Faux pendant un raid : c'est celui du
## defenseur, avec sa maison, et sans nos bombes.
func _own_ground() -> bool:
	return _seed == _own_seed()


func _on_tile_tapped(cell: Vector2i) -> void:
	# EN RAID, une tape est un pas — sur une case de l'anneau seulement. Une
	# tape sur un sol eteint n'est rien, pas une requete refusee.
	if _in_raid:
		var tile := BurrowLayout.index(cell)
		var state := RaidState.current
		if _raid_steps.has(tile) and not state.busy:
			# Chaque pas s'entend, comme un saut sur l'ile.
			Sound.play("step")
			state.step(tile)
		return
	_alog("tape %s -> %s" % [cell, "amenager" if _arrange != null else
		("bombe" if _placing and not _walling else "lapin")])
	if _arrange != null:
		_arrange_tap(cell)
		return
	if _placing and not _walling:
		_toggle_trap(BurrowLayout.index(cell))
		return
	# HORS MODE, LE CLIC EST POUR LE LAPIN : il va sur la case. Le decor, lui,
	# se deplace en le TENANT puis en glissant (`_start_decor_drag`) — deux
	# gestes differents, jamais l'un pris pour l'autre.
	_rabbit.send_to(cell)


## L'ID DU JOUEUR : la graine de son terrier, chez le serveur comme ici.
static func _own_seed() -> String:
	return String(Session.player.get("id", "burrow"))


## UNE CASE MINABLE TAPEE : on y enterre une bombe, ou on releve celle qui y
## est (`onToggleTrap`). Le serveur d'abord : la marque se pose, ou part,
## quand ShopState rapporte son nouvel etat — pas avant. Un refus se dit en
## toast (ShopState `noted`), et le plateau ne bouge pas.
func _toggle_trap(tile: int) -> void:
	if _toggling or _layout == null or not _layout.is_trappable(tile):
		return
	_toggling = true
	var shop := ShopState.shared()
	if _traps.has_trap(tile):
		await shop.remove_trap(tile)
	else:
		_traps.expect_fresh(tile)
		# LE FANTOME TIENT LA CASE pendant que le serveur decide, et l'anneau
		# d'or dit que la tape est partie. Ce n'est pas une bombe : pale, elle
		# ne ment pas sur la defense — la vraie la remplace, ou elle s'efface.
		_traps.pin_ghost(tile)
		var placed: bool = await shop.place_trap(tile)
		_traps.unpin_ghost()
		if placed:
			# Le bruit sourd de la bombe qui entre en terre ; la scene jette
			# la poussiere.
			Sound.play("step")
	_toggling = false


func _sync_traps() -> void:
	# NOS bombes ne se posent pas sur le sol d'un autre : un pillard ne voit
	# jamais un piege, et ceux-la ne sont meme pas les siens.
	if _traps == null or not _own_ground():
		return
	_traps.sync(ShopState.shared().traps)
	_hints.restyle()
	_sync_fences()


## LES PLANCHES DEBOUT, d'apres le serveur : les notres (/api/fences), ou, en
## raid, celles du defenseur (`fenced`) — un mur se voit, c'est ce qui le
## distingue d'un piege. Rien n'est dresse d'office : on part avec trois
## planches dans le sac, a poser soi-meme.
func _sync_fences() -> void:
	if _fences == null:
		return
	if _in_raid:
		var r: Dictionary = RaidState.current.raid
		_fences.set_state(r.get("fenced", []) if r.get("fenced") is Array else [], [])
		return
	if not _own_ground():
		_fences.set_state([], [])
		return
	var f: Dictionary = ShopState.shared().fences
	var placed: Array = f.get("placed", []) if f.get("placed") is Array else []
	# EN AMENAGEANT, les planches suivent le potager du brouillon — c'est ce
	# que le serveur fera a l'enregistrement — et rien ne s'offre a poser.
	if _arrange != null:
		var d := _arrange.field_shift()
		var moved: Array = []
		for seg in placed:
			var c := BurrowLayout.cell_of(int(seg["tile"])) + d
			moved.append({"tile": BurrowLayout.index(c), "side": seg["side"]})
		_fences.set_state(moved, [])
		return
	_fences.set_state(placed, f.get("offers", []) if f.get("offers") is Array else [])


## UNE ARETE TAPEE en mode cloture : on dresse la planche, ou on retire celle
## qui s'y tient (page.tsx `onFence`). Le serveur d'abord, jamais a
## l'optimiste : la regle du portail est la sienne, et un refus revient en
## mots (ShopState `noted`) plutot qu'en planche qui clignote.
func _toggle_fence(seg: Dictionary) -> void:
	if seg.is_empty():
		return
	var key := FenceView.key_of(seg)
	if _fencing.has(key):
		return
	_fencing[key] = true
	var shop := ShopState.shared()
	var tile := int(seg["tile"])
	var side := String(seg["side"])
	if _fences.is_built(seg):
		await shop.remove_fence(tile, side)
	elif await shop.place_fence(tile, side):
		Sound.play("step")
	_fencing.erase(key)


## LE RAID SUBI A CHANGE — arrive, avance, saute, finit, disparait.
func _on_incoming() -> void:
	# En raid chez un autre, le plateau n'est pas le notre : rien ou poser
	# l'intrus. La sortie du raid relit le raid subi (`_leave_raid`).
	if _in_raid:
		return
	var inc: Dictionary = RaidState.current.incoming
	if inc.is_empty():
		if _defending:
			_stop_defending()
		return
	var tile := int(inc.get("tile", -1))
	var finished := bool(inc.get("finished", false))
	var raid_id := String(inc.get("raidId", ""))

	if not _defending:
		# UN RAID ARRIVE PENDANT QU'ON AMENAGE : le brouillon tombe, le sol
		# revient a celui que le pillard est en train de lire.
		if _arrange != null:
			set_arranging(false)
		_defending = true
		_sprung_seen = int(inc.get("trapsSprung", 0))
		# LE PLATEAU DEVIENT UN PLATEAU DE RAID : son lapin s'efface (il errerait
		# sous l'attaque), la camera recule sur tout le domaine.
		_rabbit.visible = false
		set_raiding(true)
		if Chrome.current != null:
			Chrome.current.defend(true, finished)
		_raider = _spawn_raider(tile)
		_raider_at = tile
	elif tile != _raider_at and _raider != null:
		_raider_at = tile
		_raider.send_to(BurrowLayout.cell_of(tile))
		Sound.play("step")

	# UNE BOMBE A SAUTE sous lui : le souffle, le sursaut, le bruit — et la
	# bombe repart en recharge, que la boutique relira.
	var sprung := int(inc.get("trapsSprung", 0))
	if sprung > _sprung_seen:
		_sprung_seen = sprung
		_spring_under_raider(tile)
		ShopState.shared().refresh()

	# L'ECLAIR, d'ou qu'il soit parti (la tape, le bouton du HUD, un autre
	# appareil) : la reponse du serveur dit `struck`, le plateau le joue une
	# fois.
	if bool(inc.get("struck", false)) and _struck_shown != raid_id:
		_struck_shown = raid_id
		_ended_shown = raid_id
		if _raider != null:
			Electrocute.strike(_raider, self)
		return

	if finished and _ended_shown != raid_id:
		_ended_shown = raid_id
		# LA FIN, une fois : il danse sur le potager, ou il tombe a bout de
		# forces (`finishRaid`). Le son est celui de RaidState.
		if _raider != null:
			if bool(inc.get("succeeded", false)):
				_raider.celebrate()
			else:
				_raider.exhaust()


## Fini, et la fin a ete vue : le domaine redevient une maison.
func _stop_defending() -> void:
	_defending = false
	_sprung_seen = 0
	_raider_at = -1
	if _raider != null:
		_raider.queue_free()
		_raider = null
	_rabbit.visible = true
	set_raiding(false)
	if Chrome.current != null:
		Chrome.current.defend(false)
	# Le stock a bouge s'il a atteint le potager ; les bombes aussi.
	Home.refresh()
	ShopState.shared().refresh()


## L'INTRUS : le lapin de l'ile, a la meme taille, qui TOMBE sur la case ou
## le serveur le dit (`playSpawnDrop`). Il n'erre pas : il ne bouge que quand
## une poussee le dit.
func _spawn_raider(tile: int) -> HomeRabbit:
	var raider := HomeRabbit.new()
	raider.name = "Raider"
	raider.roam = false
	raider.map = _terrain.map
	raider.only = _rabbit.only
	add_child(raider)
	raider.build(0, BurrowLayout.cell_of(tile))
	var sprite := raider._sprite
	if sprite != null:
		sprite.position.y = -60.0
		sprite.modulate.a = 0.0
		var drop := raider.create_tween().set_parallel(true)
		drop.tween_property(sprite, "position:y", 0.0, 0.35) \
			.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
		drop.tween_property(sprite, "modulate:a", 1.0, 0.12)
	return raider


## UNE BOMBE SAUTE SOUS LE PILLARD (`springTrap`) : le losange rouge qui
## s'ouvre, le sursaut du lapin, et le bruit — c'etait le seul souffle du jeu
## qui partait en silence.
func _spring_under_raider(tile: int) -> void:
	# A L'ATTERRISSAGE : le pas qui l'a amene sur la bombe se voit d'abord —
	# parti avant, le souffle eclatait sur une case encore vide.
	while _raider != null and _raider.hopping():
		await get_tree().process_frame
	_traps.spring(tile)
	Sound.play("explosion")
	if _raider != null:
		_raider.take_hit(_raider.position + Vector2(0, 12))


# ── Le raid qu'on mene ───────────────────────────────────────────────────────

## RaidState a change. Seuls les deux bouts sont un changement d'endroit :
## arriver chez l'autre, en revenir — ceux-la passent sous le rideau. Le reste
## (un pas, une fin) se dessine sur-le-champ.
func _on_raid_changed() -> void:
	if _raid_curtain:
		return
	if RaidState.current.has_raid() == _in_raid:
		_cross_raid()
		return
	_raid_curtain = true
	Screens.curtain(func() -> void:
		_raid_curtain = false
		_cross_raid())


## LE PLATEAU REJOINT L'ETAT, quel qu'il soit maintenant — au milieu du
## rideau, le raid a pu finir, ou le joueur battre en retraite.
func _cross_raid() -> void:
	var state := RaidState.current
	if state.has_raid() and not _in_raid:
		_enter_raid(state.raid)
	elif not state.has_raid() and _in_raid:
		_leave_raid()
	elif _in_raid:
		_draw_raid(state.raid, false)


## CHEZ L'AUTRE : son sol (pousse de son id — la graine contre laquelle le
## serveur juge chaque pas), sa maison, pas nos bombes ; notre lapin qui erre
## s'efface, le notre tombe sur sa porte ; la camera recule sur tout le
## domaine ; le chrome du terrier laisse la place a la barre du raid.
func _enter_raid(r: Dictionary) -> void:
	if _defending:
		_stop_defending()
	var defender: Dictionary = r.get("defender", {}) if r.get("defender") is Dictionary else {}
	_in_raid = true
	_raid_key = ""
	_raid_end_shown = ""
	_ground_level = int(defender.get("level", 1))
	# AVANT le sol : `show_ground` cadre sur-le-champ, et un raid veut la prise
	# du plateau entier — sinon la camera irait a la maison et en repartirait.
	_raiding = true
	show_ground(String(defender.get("id", "")),
		defender.get("edits", {}) if defender.get("edits") is Dictionary else {})
	_rabbit.visible = false
	_walker = _spawn_raider(int(r.get("tile", -1)))
	_walker_at = int(r.get("tile", -1))
	_sync_door()
	if Chrome.current != null:
		Chrome.current.show_raid(true)
	_draw_raid(r, true)


## RETOUR CHEZ SOI : notre sol, nos bombes, notre lapin, et la prise de la
## maison. Un raid subi pendant qu'on etait ailleurs n'a pas ete garde — on le
## relit une fois.
func _leave_raid() -> void:
	# Le gris et la musique de fin appartenaient au raid ; le terrier n'a pas
	# de musique a lui (chrome.gd `_wire_sounds`).
	Drain.clear(self)
	Sound.stop_music()
	_in_raid = false
	_raid_key = ""
	_raid_steps = {}
	_ground_level = -1
	if _walker != null:
		_walker.queue_free()
		_walker = null
	_walker_at = -1
	_raiding = false
	show_ground(_own_seed(), _own_edits())
	_rabbit.visible = true
	_sync_door()
	if Chrome.current != null:
		Chrome.current.show_raid(false)
	RaidState.current.refresh_incoming()


## UN RAID EN COURS, redessine d'un coup : ce qu'on voit, ou l'on peut aller
## et ou l'on se tient changent ensemble a chaque pas, et trois mises a jour
## separees montreraient une image du plateau en desaccord avec elle-meme.
func _draw_raid(r: Dictionary, fresh: bool) -> void:
	var key := "%s|%s|%s|%s|%d|%d|%s" % [r.get("raidId"), r.get("tile"), r.get("finished"),
		r.get("struck", false), (r.get("view", []) as Array).size(),
		(r.get("steps", []) as Array).size(), r.get("smoked")]
	if key == _raid_key:
		return
	_raid_key = key
	var finished := bool(r.get("finished", false))
	var tile := int(r.get("tile", -1))
	# Un raid fini n'offre plus de pas : le plateau reste lisible, mais la
	# marche est finie et une tape ne doit plus rien faire.
	var steps: Array = [] if finished else (r.get("steps", []) as Array)
	_raid_steps = {}
	for t in steps:
		_raid_steps[int(t)] = true
	_raid_board.show_view(r.get("view", []) as Array, fresh)
	if _walker != null and tile != _walker_at:
		_walker.send_to(BurrowLayout.cell_of(tile))
	_walker_at = tile
	_raid_board.light(steps, tile)

	# LA FIN, une fois : il danse sur le potager, ou il s'effondre la ou son
	# energie a lache. FOUDROYE, c'est l'eclair du defenseur qui le dit, et le
	# choc finit sur le corps. Le retour, lui, est a RaidState.
	var id := String(r.get("raidId", ""))
	if finished and _raid_end_shown != id and _walker != null:
		_raid_end_shown = id
		if bool(r.get("struck", false)):
			Electrocute.strike(_walker, self)
		elif bool(r.get("succeeded", false)):
			_walker.celebrate()
		else:
			# A SEC : il tombe et s'endort, le terrier de l'autre passe au gris
			# et la ligne dit pourquoi — comme sur l'ile. Le retour reste a
			# RaidState (RAID_DRY_OVER_SECONDS), le gris part au noir du rideau.
			_walker.exhaust()
			Sound.music("gameover")
			Drain.start(self, I18N.t("raid.outOfEnergy").to_upper())


## UN PIEGE A SAUTE SOUS NOUS. Le signal part AVANT que la reponse soit
## dessinee : on laisse le pas commencer (une image), puis atterrir, et la
## bombe saute sur la case ou il est arrive. Le bruit est au chrome.
func _on_raid_sprung(tile: int) -> void:
	await get_tree().process_frame
	while _walker != null and _walker.hopping():
		await get_tree().process_frame
	if _walker == null or not _in_raid:
		return
	_traps.spring(tile)
	_walker.take_hit(_walker.position + Vector2(0, 12))


## La fleche de la porte : pendant la pose, et pendant un raid des deux cotes.
func _sync_door() -> void:
	if _raid_board != null:
		_raid_board.show_door(_placing or _raiding)


## LA TAPE TOUCHE-T-ELLE L'INTRUS ? Son CORPS seulement — 14x14 de l'art a
## l'echelle du lapin, pose sur ses pieds : une boite d'une case entiere
## avalerait la case sous lui, qui repond elle-meme aux tapes.
func _hits_raider(at: Vector2) -> bool:
	if _raider == null or _raider._sprite == null:
		return false
	var side := 14.0 * HomeRabbit.RABBIT_SCALE
	var local := (at - position) / scale.x - _raider.position
	return absf(local.x) <= side * 0.5 and local.y <= 0.0 and local.y >= -side


## L'ECLAIR, demande au serveur : c'est lui qui juge (un eclair en poche, un
## raid encore en cours). Le choc se joue sur sa reponse (`_on_incoming`), un
## refus se dit en toast (RaidState `noted`).
func _strike() -> void:
	var inc: Dictionary = RaidState.current.incoming
	if inc.is_empty() or bool(inc.get("finished", false)):
		return
	await RaidState.current.strike()


## LE SOL D'UN TERRIER DONNE.
##
## Rappelable avec une autre graine : c'est ainsi qu'on entrera dans le terrier
## de quelqu'un d'autre pour un raid, sans remonter la scene. Le web a un
## raccourci que ce portage reprendra le moment venu — si la graine n'a pas
## change, il ne refait rien et se contente d'ajuster.
##
## `edits` : ce que le proprietaire y a deplace (BurrowLayout.of). `keep_cam`
## garde la prise — l'amenagement repousse le sol a chaque chose posee, et le
## joueur doit rester la ou il regardait.
func show_ground(seed_value: String, edits: Dictionary = {}, keep_cam: bool = false) -> void:
	_seed = seed_value
	_layout = BurrowLayout.of(seed_value, edits)
	_lifted.clear()
	# LES BOMBES VIVENT DANS LES BLOCS de l'ancien terrain, qui va mourir : la
	# liste part avec, et la synchro les repose sur le nouveau.
	_traps.clear()
	_terrain.map = _layout.map
	_terrain.build()
	# Les decors lisent LE MEME relief : une maison posee sur un autre terrain
	# que celui qu'on voit flotterait.
	_props.map = _terrain.map
	_props.build(_layout)
	# LE POTAGER POUSSE AVEC LE JARDIN, le notre : lu a chaque image. Chez
	# l'autre on ne sait pas ce qu'il a en terre — son champ est mur, c'est
	# ce qu'on vient prendre.
	_props.fill = func() -> float:
		return Home.garden_fill() if _own_ground() else 1.0
	# LE CHAMP EST DE LA TERRE RETOURNEE, pas du pre (BurrowTerrain.ts
	# `groundAt` : 'sand') — l'objectif d'un raid se voit de loin, meme vide.
	_terrain.paint_field(_props.field)
	# TOUT LE SOL PRATICABLE EN MOTTES, comme l'ile : le potager a ses carres
	# de terre, le reste son gazon leve. Avant les clotures, les pieges, les
	# losanges et le raid, qui se posent tous sur le dessus des cases.
	var in_field := {}
	for c in _props.field:
		in_field[c] = true
	var sod_cells: Array[Vector2i] = []
	for t in _layout.walkable_tiles():
		var c := BurrowLayout.cell_of(t)
		if not in_field.has(c):
			sod_cells.append(c)
	_terrain.lay_sods(sod_cells)
	# LE DECOR DEBOUT du serveur : un arbre est une case que personne ne
	# traverse et qu'on ne mine pas — sans lui, la grille laisse un trou que
	# rien n'explique.
	var standing := IslandGround.new(_layout.map, _layout.map.seed_text, false)
	standing.placements = _layout.placements
	_scenery.terrain = _terrain
	_scenery.build(standing)
	# La mer borde la terre qu'on vient de poser — meme graine que le web
	# (`${seed}:ducks`) : la mare d'un joueur est toujours la meme.
	_ocean.build(_terrain.map, str(seed_value))
	_follow_level()
	# ET LES CLOTURES BORDENT LE CHAMP QUI VIENT D'ETRE SEME, celui-la meme et
	# pas un second tirage de la graine : elles viennent donc APRES le potager,
	# et lisent les cases qu'il a gardees.
	_fences.map = _terrain.map
	_fences.build(_props.field, _terrain)
	_sync_fences()

	# LES LOSANGES SE MONTENT DANS LES BLOCS DU TERRAIN : ils viennent donc
	# APRES lui, et ils meurent avec lui. C'est le piege n°31 du web —
	# « teardownPlacementHints() AVANT la destruction du terrain » — evite ici
	# par la construction plutot que par un ordre a retenir : `_terrain.build`
	# jette ses blocs et les losanges avec, et on en refait aussitot.
	_hints.map = _terrain.map
	_hints.terrain = _terrain
	_hints.layout = _layout
	_hints.build()
	_traps.terrain = _terrain
	_traps.layout = _layout
	_sync_traps()
	# LE VOILE DU RAID ET LES FLECHES, dans les blocs neufs eux aussi. Le
	# voile n'existe que le temps d'un raid ; la fleche de la porte, sur
	# chaque sol, se montre quand le plateau se lit comme un plateau.
	_raid_board.terrain = _terrain
	_raid_board.layout = _layout
	if _in_raid:
		_raid_board.build()
	else:
		_raid_board.clear()
	_raid_board.build_door()
	_sync_door()

	# LE LAPIN REVIENT AVEC LE SOL SUR LEQUEL IL SE TIENT. `show_ground` tourne
	# a la premiere image ET a chaque changement de terrain — une montee de
	# niveau, ou le passage chez quelqu'un d'autre — et les cases de l'ancien
	# lapin n'existent plus a ce moment-la. On le refait plutot que de le
	# garder.
	_rabbit.map = _terrain.map
	_rabbit.only = {}
	for tile in _layout.walkable_tiles():
		_rabbit.only[BurrowLayout.cell_of(tile)] = true
	_rabbit.build(hash(seed_value))

	# LA PRISE DEPEND DU RELIEF : les quatre cadrages sont resolus sur les
	# bornes de la terre, et une autre graine en a d'autres. Un terrier voisin
	# affiche avec le cadrage du precedent sortirait du cadre.
	#
	# Et le drapeau du joueur tombe : c'est un AUTRE plateau, pas celui qu'il
	# tenait.
	if keep_cam:
		return
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
	# 10 comme le chrome de l'ile : au-dessus du bloom (1), qui est pour le jeu.
	layer.layer = 10
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
	_traps.set_lifted(-1)
	_traps.show_ghost(-1)
	_sync_door()
	_relabel_cycle()
	frame_camera()


func set_walling(on: bool) -> void:
	if _walling == on:
		return
	_walling = on
	_cam_moved_by_player = false
	_fences.set_placing(on and not _in_raid)
	_relabel_cycle()
	frame_camera()


func set_raiding(on: bool) -> void:
	if _raiding == on:
		return
	_raiding = on
	_cam_moved_by_player = false
	_sync_door()
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
var _pinch := Pinch.new()


func _unhandled_input(event: InputEvent) -> void:
	# LE PINCEMENT D'ABORD, et le second doigt n'est jamais un appui : sans ce
	# filtre, chaque evenement du deuxieme doigt tirait le plateau vers lui, et
	# il sautait d'un doigt a l'autre a chaque image.
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		var step := _pinch.feed(event)
		if _pinch.active():
			if _dragging_decor:
				_cancel_decor_drag()
			_hold_armed = false
			if _pressing and not _did_drag:
				_did_drag = true
				if _hints_live():
					_press_over(Vector2i(-1, -1))
			if not step.is_empty():
				set_place_cam(Pinch.apply(step, _current_shot(), _terrain.map, get_viewport_rect().size))
			return
		if event.index != 0:
			return
	elif event is InputEventMouseMotion and _pinch.active():
		return
	if event is InputEventScreenTouch or event is InputEventMouseButton:
		var pressed: bool = event.pressed
		var at: Vector2 = event.position
		if pressed:
			_press_touch = event is InputEventScreenTouch
			_on_press(at)
		else:
			_on_release(at)
	elif event is InputEventScreenDrag or event is InputEventMouseMotion:
		# UN RELACHEMENT PERDU : la souris bouge sans bouton alors qu'on croit
		# l'appui en cours — le bouton a ete lache au-dessus d'un panneau (qui
		# l'a mange) ou hors de la fenetre. Sans ceci le simple survol
		# promenait le plateau et annulait chaque maintien.
		if _pressing and event is InputEventMouseMotion \
				and (event.button_mask & MOUSE_BUTTON_MASK_LEFT) == 0:
			_alog("relachement perdu : l'appui se termine au survol %s" % event.position)
			_on_release(event.position)
			return
		if _pressing:
			_on_move(event.position)
		# LA SOURIS REGARDE AVANT DE CLIQUER : bouton leve, la case sous elle
		# montre deja son fantome. Un doigt n'a pas de survol ; c'est l'appui
		# qui le lui montre (`_on_press`).
		elif event is InputEventMouseMotion and event.button_mask == 0 and _hints_live():
			_press_over(_cell_at(event.position))


func _on_press(at: Vector2) -> void:
	_pressing = true
	_did_drag = false
	_press_at = at
	_press_cam = position
	# UN DECOR SOUS L'APPUI s'arme : tenu assez longtemps sans bouger, il se
	# souleve (`_process`). Bouge avant, c'est un glissement du plateau.
	_press_ms = Time.get_ticks_msec()
	var pc := _cell_at(at)
	_hold_armed = _can_drag_decor() and _pickable_at(pc)
	_alog("appui %s case %s touch=%s arme=%s mode=%s" % [at, pc, _press_touch, _hold_armed,
		"amenager" if _arrange != null else "normal"])
	# L'APPUI MONTRE CE QU'IL VA CHOISIR — le retour que le survol donne a la
	# souris, et qu'un doigt n'a pas.
	if _hints_live():
		_press_over(_cell_at(at))
	elif _fences_live():
		_fences.set_hovered(_fences.pick(_board_at(at)))


## LA CASE SOUS LE DOIGT, avant qu'il se leve : or sur une case libre, la
## bombe qui sort (et sa marque rouge) sur une case minee.
func _press_over(cell: Vector2i) -> void:
	if _arrange != null:
		_arrange_hover(cell)
		return
	_hints.set_hovered(cell)
	var tile := BurrowLayout.index(cell) if cell.x >= 0 else -1
	_traps.set_lifted(tile if _traps.has_trap(tile) else -1)
	# Et sur une case LIBRE, le fantome de la bombe qu'une tape y enterrerait.
	var free := tile >= 0 and _layout != null and _layout.is_trappable(tile) \
		and not _traps.has_trap(tile)
	_traps.show_ghost(tile if free else -1)


func _on_move(at: Vector2) -> void:
	if _dragging_decor:
		_follow_decor(at)
		return
	# APRES UN PINCEMENT, le doigt qui reste reprend le glissement la ou il est.
	if _pinch.ended:
		_pinch.ended = false
		_press_at = at
		_press_cam = position
	# A LA SOURIS, CLIQUER SUR UN DECOR PUIS GLISSER LE DEPLACE, sans attendre :
	# c'est le geste que le joueur fait (journal du 2026-09-23 : il glissait
	# de 10-20 px en 50-80 ms, et le maintien partait en glissement du
	# plateau a chaque fois). Le sol nu, lui, promene toujours la vue. Au
	# doigt le maintien reste : un pouce se pose sur un arbre pour regarder.
	if not _did_drag and _hold_armed and not _press_touch \
			and at.distance_to(_press_at) > DRAG_SLOP:
		_hold_armed = false
		_alog("clic-glisser sur un decor : on le prend")
		_start_decor_drag()
		if _dragging_decor:
			_follow_decor(at)
			return
	if not _did_drag and at.distance_to(_press_at) > DRAG_SLOP:
		if _hold_armed:
			_alog("maintien annule : le pointeur a bouge de %.0f px en %d ms (glissement du plateau)" % [
				at.distance_to(_press_at), Time.get_ticks_msec() - _press_ms])
		_did_drag = true
		_hold_armed = false
		# DES QUE C'EST UN GLISSEMENT, LA CASE N'EST PLUS VISEE : garder l'or
		# sous un doigt qui promene le plateau annoncerait une pose qui
		# n'arrivera pas.
		if _hints_live():
			_press_over(Vector2i(-1, -1))
		elif _fences_live():
			_fences.set_hovered({})
	if not _did_drag:
		# Toujours une tape en puissance : on suit la case sous le doigt.
		if _hints_live():
			_press_over(_cell_at(at))
		elif _fences_live():
			_fences.set_hovered(_fences.pick(_board_at(at)))
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
	_hold_armed = false
	if _dragging_decor:
		_end_decor_drag(at)
		return
	if _hints_live():
		_press_over(Vector2i(-1, -1))
	elif _fences_live():
		_fences.set_hovered({})
	# PIEGE N°1 : un glissement qui se termine n'est pas une tape.
	if _did_drag:
		return
	# LE MODE CLOTURE vise des ARETES, pas des cases : une tape y est une
	# planche, jamais un pas du lapin.
	if _fences_live():
		_toggle_fence(_fences.pick(_board_at(at)))
		return
	# L'INTRUS D'ABORD : il se tient sur une case qui repond elle-meme.
	if _defending and _hits_raider(at):
		_strike()
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
	return BurrowPick.at(_terrain.map, _board_at(at))


## Un point de l'ecran dans le repere du plateau (celui des clotures).
func _board_at(at: Vector2) -> Vector2:
	return (at - position) / scale.x


## Les cibles des clotures sont-elles allumees ? Chez soi, en mode cloture.
func _fences_live() -> bool:
	return _walling and not _in_raid and _own_ground()


## Les losanges sont-ils allumes ? Sans eux, rien a teindre.
func _hints_live() -> bool:
	return (_placing or _arrange != null) and _hints != null


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


# ---------------------------------------------------------------- amenager

## L'amenagement du joueur : le brouillon pendant qu'il amenage, sinon ce que
## le serveur a enregistre.
func _own_edits() -> Dictionary:
	return _arrange.draft if _arrange != null else Home.edits


## Le serveur a un autre amenagement (un autre appareil, ou notre propre
## enregistrement) : le sol se repousse, sans reprendre la camera.
func _on_edits_changed() -> void:
	if _in_raid or _arrange != null or not _own_ground():
		return
	show_ground(_own_seed(), Home.edits, true)


## Peut-on amenager maintenant ? Pas chez un autre, pas pendant un raid sur
## notre terrier : le pillard lit le sol tel qu'il etait en entrant.
func can_arrange() -> bool:
	if _in_raid or not _own_ground():
		return false
	var inc: Dictionary = RaidState.current.incoming
	return inc.is_empty() or bool(inc.get("finished", false))


## ENTRER EN AMENAGEMENT, ou en sortir sans enregistrer (le brouillon est
## jete, le sol revient a ce que le serveur a).
func set_arranging(on: bool) -> void:
	_alog("set_arranging(%s) deja=%s" % [on, _arrange != null])
	if on == (_arrange != null):
		return
	if on:
		_arrange = BurrowArrange.new(_own_seed(), Home.edits)
		_rabbit.visible = false
		_paint_arrange()
		_hints.show_hints(true)
	else:
		var was_dirty := _arrange.dirty()
		_unlift()
		_arrange = null
		_hints.arranging = false
		_hints.show_hints(_placing)
		_hints.restyle()
		_rabbit.visible = not _defending
		if was_dirty and _own_ground() and not _in_raid:
			show_ground(_own_seed(), Home.edits, true)
		_sync_fences()
	arrange_changed.emit()


## Ce que la barre d'amenagement affiche : `{held, dirty, saving}`.
func arrange_state() -> Dictionary:
	if _arrange == null:
		return {}
	return {"held": _arrange.held != BurrowArrange.Held.NONE, "dirty": _arrange.dirty(),
		"saving": _saving}


## Revenir au terrier pousse de la graine — en brouillon, comme le reste.
func arrange_reset() -> void:
	if _arrange == null:
		return
	_unlift()
	_arrange.reset()
	_regrow_draft()


## ENREGISTRER le brouillon. Le serveur juge (la meme regle, et le raid) ;
## a son accord, Home adopte l'amenagement et on sort du mode.
func arrange_save() -> void:
	if _arrange == null or _saving:
		return
	if not _arrange.dirty():
		set_arranging(false)
		return
	_saving = true
	arrange_changed.emit()
	_alog("SAVE %s ..." % JSON.stringify(BurrowArrange._clean(_arrange.draft)))
	var res: Dictionary = await Home.save_edits(BurrowArrange._clean(_arrange.draft))
	_saving = false
	_alog("SAVE reponse %s" % JSON.stringify(res))
	if res.has("error"):
		_note_refusal(String(res["error"]))
		arrange_changed.emit()
		return
	# Enregistre : ce que le sol montre EST l'amenagement, on sort sans le
	# repousser. Les planches et les bombes ont pu bouger au serveur.
	_arrange = null
	_hints.arranging = false
	_hints.show_hints(_placing)
	_hints.restyle()
	_rabbit.visible = not _defending
	ShopState.shared().refresh()
	var parts: Array[String] = [I18N.t("arrange.saved")]
	if int(res.get("planksBack", 0)) > 0:
		parts.append(I18N.f("arrange.planksBack", [int(res["planksBack"])]))
	if int(res.get("bombsBack", 0)) > 0:
		parts.append(I18N.f("arrange.bombsBack", [int(res["bombsBack"])]))
	if Chrome.current != null:
		Chrome.current.toast(" ".join(parts))
	arrange_changed.emit()


## UNE TAPE EN AMENAGEMENT : prendre, poser, ou relacher.
func _arrange_tap(cell: Vector2i) -> void:
	if _saving:
		return
	if _arrange.held == BurrowArrange.Held.NONE:
		if _arrange.grab(cell):
			Sound.play("step")
			_lift()
			_paint_arrange()
			arrange_changed.emit()
		return
	# Sur la chose elle-meme : on la repose ou elle etait.
	if cell == _arrange.held_cell or (_arrange.held != BurrowArrange.Held.FIELD \
			and _arrange.source_cells().has(cell)):
		_unlift()
		_arrange.release()
		_paint_arrange()
		arrange_changed.emit()
		return
	var why := _arrange.drop(cell)
	_alog("tape-pose en %s : %s" % [cell, why if why != "" else "ok " + JSON.stringify(_arrange.draft)])
	if why != "":
		_note_refusal(why)
		_paint_arrange()
		return
	Sound.play("step")
	_regrow_draft()


## Le sol du brouillon, repousse sans bouger la camera.
func _regrow_draft() -> void:
	show_ground(_own_seed(), _arrange.draft, true)
	_paint_arrange()
	_hints.show_hints(true)
	arrange_changed.emit()


## LE SURVOL (souris) OU L'APPUI (doigt) : ou tomberait ce qu'on tient.
func _arrange_hover(cell: Vector2i) -> void:
	var preview := {}
	if _arrange.held != BurrowArrange.Held.NONE and _arrange.targets.has(cell):
		for c in _arrange.footprint(cell):
			preview[c] = true
	if preview.hash() == _hints.arrange_preview.hash():
		return
	_hints.arrange_preview = preview
	_hints.restyle()


## Les losanges de l'amenagement : ce qu'on tient en or franc, ou ca peut
## aller en bleu. Les mains vides, ce qu'on peut prendre s'allume en vert.
const ARRANGE_GRAB := Color("#b6f28a", 0.32)
const ARRANGE_HELD := Color("#ffd45c", 0.9)
const ARRANGE_TARGET := Color("#8fd6ff", 0.42)

func _paint_arrange() -> void:
	if _arrange == null:
		return
	var lit := {}
	if _arrange.held == BurrowArrange.Held.NONE:
		for t in _arrange.layout.field:
			lit[BurrowLayout.cell_of(t)] = ARRANGE_GRAB
		lit[_arrange.layout.building] = ARRANGE_GRAB
		for p in _arrange.layout.placements:
			var c := Vector2i(int(p.x), int(p.y))
			if _arrange.layout.map.level_at(c.x, c.y) > 0:
				lit[c] = ARRANGE_GRAB
	else:
		for c in _arrange.targets:
			lit[c] = ARRANGE_TARGET
		for c in _arrange.source_cells():
			lit[c] = ARRANGE_HELD
	_hints.arranging = true
	_hints.arrange_lit = lit
	_hints.arrange_preview = {}
	_hints.restyle()


## LA CHOSE PRISE SE SOULEVE — le retour qu'un doigt n'a pas autrement.
const LIFT_PX := 16.0
const LIFT_GLOW := Color(1.35, 1.3, 1.05)

func _lift() -> void:
	_unlift()
	var nodes: Array = []
	match _arrange.held:
		BurrowArrange.Held.THING:
			nodes = _scenery.nodes_at(_arrange.held_cell)
		BurrowArrange.Held.HOUSE:
			if _props.home != null:
				nodes = [_props.home]
		BurrowArrange.Held.FIELD:
			nodes = _props._plants.duplicate()
	for n in nodes:
		if n is Node2D and is_instance_valid(n):
			_lifted.append([n, (n as Node2D).position])
			var tw := (n as Node2D).create_tween()
			tw.tween_property(n, "position:y", (n as Node2D).position.y - LIFT_PX, 0.12) \
				.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			(n as Node2D).modulate = LIFT_GLOW


func _unlift() -> void:
	for pair in _lifted:
		var n: Node2D = pair[0]
		if is_instance_valid(n):
			n.position = pair[1]
			n.modulate = Color.WHITE
	_lifted.clear()


## Un refus, dans les mots du joueur.
func _note_refusal(code: String) -> void:
	var text := ""
	match code:
		"crossing_too_short":
			text = I18N.f("arrange.refused.crossing_too_short", [BurrowLayout.MIN_CROSSING])
		"crossing_too_long":
			text = I18N.f("arrange.refused.crossing_too_long", [BurrowLayout.MAX_CROSSING])
		"offline":
			text = I18N.t("err_offline")
		_ when code.begins_with("http_"):
			# Le serveur n'a pas repondu en regle (une route absente, une
			# panne) : ce n'est PAS la regle qui refuse, et le dire comme un
			# refus envoie le joueur chercher ce qu'il a mal fait.
			text = I18N.t("arrange.unsaved")
		_:
			text = I18N.t("arrange.refused.%s" % code)
			if text.begins_with("arrange."):
				text = I18N.t("arrange.refused.bad_edits")
	if Chrome.current != null:
		Chrome.current.toast(text, true)


## La regle entiere juge les cases allumees, quelques ms par image : une case
## qu'elle refuse s'eteint.
func _process(_delta: float) -> void:
	if _arrange != null and _arrange.settling() and _arrange.settle(3000):
		_paint_arrange()
	if _hold_armed and _pressing and not _did_drag and not _dragging_decor:
		var hold := HOLD_TOUCH_MS if _press_touch else HOLD_MOUSE_MS
		if Time.get_ticks_msec() - _press_ms >= hold:
			_hold_armed = false
			_start_decor_drag()


# ---------------------------------------------------------------- tenir, glisser

## TENIR PUIS GLISSER un decor, sans passer par le mode : le clic reste au
## lapin, le glissement nu au plateau. Le maintien est ce qui distingue les
## trois — plus long au doigt, qui pose souvent sur un arbre pour promener
## la vue. Hors mode, le lacher ENREGISTRE ; en mode, il va au brouillon.
const HOLD_MOUSE_MS := 180
const HOLD_TOUCH_MS := 320

var _press_ms := 0
var _press_touch := false
var _hold_armed := false
var _dragging_decor := false
## Vrai quand le glissement a ouvert un amenagement de passage (hors mode).
var _drag_transient := false
var _drag_over := Vector2i(-1, -1)


## Peut-on prendre un decor d'un appui tenu ? Chez soi, hors pose, hors raid.
func _can_drag_decor() -> bool:
	var ok := not _saving and not _placing and not _walling and not _defending \
		and can_arrange()
	if not ok:
		_alog("pas de glisser : saving=%s placing=%s walling=%s defending=%s in_raid=%s own=%s incoming=%s" % [
			_saving, _placing, _walling, _defending, _in_raid, _own_ground(),
			JSON.stringify(RaidState.current.incoming)])
	return ok


## LE JOURNAL DE L'AMENAGEMENT, en build debug seulement (l'editeur) : chaque
## geste et chaque refus, pour lire un bug pendant qu'on joue.
static func _alog(text: String) -> void:
	if OS.is_debug_build():
		print("[arrange %d] %s" % [Time.get_ticks_msec(), text])


func _pickable_at(cell: Vector2i) -> bool:
	if cell.x < 0:
		return false
	var a := _arrange if _arrange != null else BurrowArrange.new(_own_seed(), Home.edits)
	var hit := a.find(cell)
	_alog("sous %s : %s (maison %s)" % [cell, hit if not hit.is_empty() else "rien", a.layout.building])
	return not hit.is_empty()


func _start_decor_drag() -> void:
	if _arrange == null:
		_arrange = BurrowArrange.new(_own_seed(), Home.edits)
		_drag_transient = true
	elif _arrange.held != BurrowArrange.Held.NONE:
		_unlift()
		_arrange.release()
	if not _arrange.grab(_cell_at(_press_at)):
		_alog("maintien : rien a prendre en %s" % _cell_at(_press_at))
		_finish_transient()
		return
	_alog("pris %s en %s : %d cases possibles (en fond : %s)" % [
		["rien", "chose", "maison", "potager"][_arrange.held], _arrange.held_cell,
		_arrange.targets.size(), _arrange.settling()])
	_dragging_decor = true
	_did_drag = true
	_drag_over = _arrange.held_cell
	Sound.play("step")
	_lift()
	_paint_arrange()
	_hints.show_hints(true)
	arrange_changed.emit()


## LA CHOSE SUIT LE POINTEUR, de case en case.
func _follow_decor(at: Vector2) -> void:
	var cell := _cell_at(at)
	if cell.x < 0 or cell == _drag_over:
		return
	_drag_over = cell
	_alog("glisse sur %s (possible : %s)" % [cell, _arrange.targets.has(cell)])
	var map := _terrain.map
	var delta := map.screen_of(cell.x, cell.y) - map.screen_of(_arrange.held_cell.x, _arrange.held_cell.y)
	for pair in _lifted:
		var n: Node2D = pair[0]
		if is_instance_valid(n):
			n.position = (pair[1] as Vector2) + delta - Vector2(0, LIFT_PX)
	_arrange_hover(cell)


func _end_decor_drag(at: Vector2) -> void:
	_dragging_decor = false
	var cell := _cell_at(at)
	_alog("lache en %s (depart %s)" % [cell, _arrange.held_cell])
	if cell.x < 0 or cell == _arrange.held_cell:
		_unlift()
		_arrange.release()
		_paint_arrange()
		_finish_transient()
		return
	var why := _arrange.drop(cell)
	if why != "":
		_alog("pose refusee : %s" % why)
		_note_refusal(why)
		_unlift()
		_arrange.release()
		_paint_arrange()
		_finish_transient()
		return
	_alog("pose : brouillon %s" % JSON.stringify(_arrange.draft))
	Sound.play("step")
	_regrow_draft()
	if not _drag_transient:
		return
	# HORS MODE, LE LACHER EST UN ENREGISTREMENT. Le sol montre deja le
	# nouveau terrier ; un refus du serveur le remet comme il etait.
	var draft := BurrowArrange._clean(_arrange.draft)
	_finish_transient()
	_saving = true
	_alog("enregistre %s ..." % JSON.stringify(draft))
	var res: Dictionary = await Home.save_edits(draft)
	_saving = false
	_alog("reponse %s" % JSON.stringify(res))
	if res.has("error"):
		_note_refusal(String(res["error"]))
		show_ground(_own_seed(), Home.edits, true)
		_sync_fences()
		return
	ShopState.shared().refresh()


func _cancel_decor_drag() -> void:
	_dragging_decor = false
	if _arrange == null:
		return
	_unlift()
	_arrange.release()
	_paint_arrange()
	_finish_transient()


## Ferme l'amenagement de passage ouvert par un glissement hors mode.
func _finish_transient() -> void:
	if not _drag_transient:
		return
	_drag_transient = false
	_arrange = null
	_hints.arranging = false
	_hints.show_hints(_placing)
	_hints.restyle()
