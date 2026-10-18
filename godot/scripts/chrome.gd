class_name Chrome
extends Control
## LE CHROME — ce qui survit AU-DESSUS du monde : la barre du haut, la
## colonne du terrier, le sol aux trois verbes, les pastilles, les dialogues.
##
## Il vit dans l'etage `Chrome` de main.tscn, entre le monde et le rideau.
## Screens le CONSTRUIT en entrant dans le monde et le DETRUIT au retour a
## l'accueil : aucun bouton d'une session ne survit dans la suivante.
##
## LES PIECES D'UN LIEU NAISSENT ET MEURENT AVEC LUI (`_mount_place`). La
## colonne, le sol aux trois verbes, la rangee du kit : construits a chaque
## arrivee au terrier, detruits en partant. Elles ne se cachaient avant que par
## leur propre calcul de visibilite, et un calcul fait au mauvais moment (le
## milieu du rideau) les laissait cachees pour de bon.
##
## CINQ ETAGES, dans l'ordre ou ils se dessinent, comme main.tscn :
##
##   Column    la colonne du terrier (quete, jardin, terrier) — a gauche.
##   Floor     le sol : DIG · DEFEND · RAID, ou ce que le lieu y met.
##   TopBar    le joueur a gauche, la pastille au centre, le rail a droite.
##   Toasts    ce que le terrier dit, sous la pastille.
##   Overlays  les tampons plein ecran (niveau, raid subi, victoire).
##   Dialogs   un voile et UN dialogue a la fois, centre.
##
## CHAQUE ETAGE LAISSE PASSER LES CLICS qu'il ne couvre pas (mouse_filter
## IGNORE sur les conteneurs) : le sol du terrier se tape a travers eux. Seuls
## les panneaux prennent les leurs.
##
## LES PIECES NE SONT PAS ICI. Chaque panneau est sa propre scene sous
## scenes/ui/, et ce fichier les monte a leur etage dans `_mount`. Un panneau
## qui n'existe pas encore est une ligne de moins, pas un trou.

## Le chrome vivant, pour qui doit lui parler : `Chrome.current.toast(...)`,
## `Chrome.current.open(dialog)`.
static var current: Chrome

## Combien de temps une pastille reste, et son fondu.
const TOAST_SECONDS := 3.2
const TOAST_FADE := 0.35
## L'arrivee d'une pastille : de quelle taille elle part, en combien de temps.
const TOAST_POP_FROM := 0.6
const TOAST_POP_SECONDS := 0.28

@onready var column: Control = %Column
@onready var floor_host: Control = %Floor
@onready var top_bar: Control = %TopBar
@onready var toasts: VBoxContainer = %Toasts
@onready var overlays: Control = %Overlays
@onready var dialogs: Control = %Dialogs

const SCRIM_BLUR := preload("res://shaders/scrim_blur.gdshader")
## Les panneaux de cote s'arretent a la maquette (342 px de 1376) : plus
## large, ce n'est plus un panneau mais une bande de texte clairseme.
const COLUMN_MAX := 360.0
## LES ILOTS OU LES PLANCHES (2026-10-13, « en fait les planches c'est
## mieux ») : DIG, BURY, RAID en barre au sol (loop_bar.gd), la maison et le
## potager en boutons du haut du terrier (burrow_hud.gd). Le code des ilots
## (burrow_landmarks.gd) reste entier : vrai, il revient tel quel. Une
## variable et pas une constante : le banc (burrow_ux_bench) rallume les
## ilots pour les comparer.
static var islets := false
## Le cadran d'energie qui porte DIG : plus grand que les planches, un peu
## remonte, pas colle au bord (« ca touche le cote et un peu plus bas »),
## puis un peu plus a gauche (2026-10-14).
const DIAL_GROW := 1.6
const DIAL_RISE := 8.0
const DIAL_LEFT := 24.0
const BOARD_MIN := 280.0
const BOARD_MAX := 380.0

var _scrim: ColorRect
var _dialog: Control
var _placement := "center"

var _column: BurrowColumn
var _loop: LoopBar
var _kit: KitRow
var _back: BackButton
## Le volet du terrier, sous les boutons du haut a droite (house_panel.gd).
var _house: HousePanel
## SANS ILOTS : le haut du terrier (KIT 04) et la visite.
var _hud: BurrowHud
## LE PLAN DE DEFENSE pendant BURY (ui/bury_plan.gd) : le chemin du pillard,
## le verdict, TESTER. Il prend la place du haut le temps du mode.
var _plan: BuryPlan
var _plan_testing := false
## Un raid subi est en cours chez nous (`defend`).
var _defending := false
## La version, en bas a droite du terrier : QUOI DE NEUF (version_tag.gd).
var _version: VersionTag
## Le mode du terrier en cours ("placing", "walling"), vide sinon.
var _mode := ""
## NETTOYER LA BASE, en DEFEND : a la place de la colonne, qui s'efface.
var _clean: PlankButton
var _clean_armed := false
## CE QU'ON TIENT au terrier (burrow.gd `_tell_arrange`) : le bandeau se pose
## sur le sol le temps du geste, DIG · DEFEND · RAID restent dessous. Et la
## legende qui pointe un arbre tant
## qu'on n'a jamais rien deplace.
var _arrange_bar: ArrangeBar
var _arrange_tip: ArrangeTip
const CLEAN_H := 44.0
## LE PLATEAU MONTRE UN RAID (burrow.gd `show_raid`) — pas « RaidState en a
## un » : entre les deux, il y a le rideau, et le chrome tourne au noir.
var _raid_shown := false
## LE LIVRE OUVERT SUR LE TERRIER (`maybe_books`), un a la fois.
var _book: IntroBook
## Pour la pastille, qui montre la jauge du raid tant que le plateau est la.
signal _raid_changed


func _ready() -> void:
	current = self
	visible = Screens.in_world()
	Screens.world_shown.connect(_on_world_shown)
	Screens.moved.connect(_on_moved)
	Home.noted.connect(toast)
	GameSocket.event.connect(_on_socket_event)
	# Le serveur a redemarre sous le jeu : relancer, voir UpdateDialog. Relu
	# ici aussi, pour un chrome remonte apres coup (changement de scene).
	GameSocket.server_updated.connect(_on_server_updated)
	if GameSocket.server_moved_on:
		_on_server_updated.call_deferred()
	get_viewport().size_changed.connect(_measure)
	_measure()
	_mount()
	if Screens.in_world():
		_mount_place()
	_dev_open()


func _exit_tree() -> void:
	if current == self:
		current = null


## CE QUI VIT TANT QU'ON EST DANS LE MONDE : la barre du haut, les sons, les
## tampons. Les pieces d'un lieu sont a part, dans `_mount_place`.
func _mount() -> void:
	# LA BARRE DU HAUT : le joueur, la pastille, le rail. Chaque bouton ouvre
	# son dialogue ; la pastille, OU QU'ON LA TAPE, ouvre le grand livre du
	# reservoir (energy-panel.tsx), dont le bouton vert mene a la recharge.
	# L'anneau ouvrait le livre et le chiffre la recharge : deux panneaux
	# pour une seule plaque, et on ne savait pas lequel viendrait
	# (2026-10-01).
	var bar: TopBar = preload("res://scenes/ui/top_bar.tscn").instantiate()
	top_bar.add_child(bar)
	bar.profile_pressed.connect(func() -> void: Profile.open())
	bar.shop_pressed.connect(func() -> void: Shop.open())
	bar.story_pressed.connect(func() -> void: LoreCodex.open())
	bar.season_pressed.connect(_open_season)
	# La boutique se montre aussi pendant un raid, qui se joue au terrier.
	_raid_changed.connect(bar.reflect_place)
	_wire_bag()
	bar.energy_tapped.connect(func() -> void: EnergyPanel.open())
	bar.add_pressed.connect(func() -> void: EnergyPanel.open())

	# L'ATTENTE DU SERVEUR, en bas a droite : une petite carotte qui se
	# remplit tant qu'une ecriture est en route (Net.busy_changed).
	add_child(BusySpinner.new())

	# LE HUD DE MANCHE (run-hud.tsx) : le X, l'eclair et la bombe, la maree,
	# les legendes, le recap. Il se cache seul hors de l'ile. SOUS la barre du
	# haut dans l'ordre de dessin, au-dessus du monde.
	var hud: RunHud = preload("res://scenes/ui/run_hud.tscn").instantiate()
	add_child(hud)
	move_child(hud, top_bar.get_index())
	Kit.fill(hud)
	# LES DEUX SORTIES DU RECAP. Relayees par le HUD, et jamais ecoutees : la
	# carte « ISLAND CLEARED » restait a l'ecran, bouton mort.
	hud.go_home.connect(func() -> void:
		RunState.current.go_home()
		if Screens.place == Screens.Place.ISLAND:
			Screens.cross(Screens.Place.BURROW))
	hud.refill.connect(_refill_after_run)
	_wire_run(bar)

	# Ce que la boutique et le raid repondent passe en pastille : ils s'y
	# posent eux-memes (ShopState/RaidState `_toast`). Les rebrancher ici
	# doublait chaque legende et chaque son de refus (2026-10-12).
	_wire_sounds()
	# Les tampons qui s'annoncent seuls : le niveau gagne, le raid subi.
	LevelUpStamp.arm()


## LA MANCHE SUR LA PASTILLE : l'energie sur le cadran, le butin porte et les
## coffres sous le compte (carrot-pill.tsx `energy`, `carrying`, `chests`).
## Seulement sur l'ile, et seulement quand le serveur y a mis un lapin a moi —
## sinon le cadran rend la main au reservoir du terrier.
func _wire_run(bar: TopBar) -> void:
	var state := RunState.current
	var feed := func() -> void:
		# La barre meurt avec le chrome ; `Screens`, lui, reste et rappelle.
		if not is_instance_valid(bar):
			return
		# EN RAID, le medaillon bat avec la jauge que le raid depense
		# (page.tsx : `raid.raid.tank`), relue a chaque pas.
		var raid := RaidState.current.raid
		if _raid_shown and not raid.is_empty() and raid.get("tank") != null:
			bar.set_run(0, {})
			bar.set_run_energy(int(raid["tank"]))
			return
		var me := state.me()
		var on_island := Screens.in_world() and Screens.place == Screens.Place.ISLAND
		if not on_island or me.is_empty():
			bar.set_run(0, {})
			bar.set_run_energy(-1)
			return
		bar.set_run(int(me.get("carrots", 0)), {"taken": state.chests_taken,
			"total": state.chests_total, "warnStage": state.warn_stage})
		bar.set_run_energy(int(me.get("energy", 0)))
	# SCREENS, RAIDSTATE ET RUNSTATE SURVIVENT AU CHROME : une lambda branchee
	# sur eux lui survivrait aussi, et le premier signal apres le retour a
	# l'accueil appelait une instance morte (tools/verify_scene_flow.gd ; pour
	# RunState, une erreur « Lambda capture freed » a chaque pas, vue par le
	# banc tools/e2e/duo.ts). Une METHODE se debranche seule quand le chrome
	# meurt.
	_feed_run = feed
	state.me_changed.connect(_refeed_run)
	state.rabbits_changed.connect(_refeed_run)
	state.volcano_changed.connect(_refeed_run)
	Screens.moved.connect(_refeed_run)
	RaidState.current.changed.connect(_refeed_run)
	_raid_changed.connect(_refeed_run)


var _feed_run: Callable


func _refeed_run(_arg: Variant = null) -> void:
	_feed_run.call()


## LES PIECES DU LIEU, reconstruites a chaque arrivee. On DETRUIT ce qui etait
## la et on construit ce que le lieu veut — rien a cacher, donc rien a oublier
## de montrer. L'ile n'a rien ici : ses boutons sont dans sa propre scene, et
## meurent avec elle.
func _mount_place() -> void:
	for host in [column, floor_host]:
		for child in (host as Node).get_children():
			host.remove_child(child)
			child.queue_free()
	_column = null
	_loop = null
	_hud = null
	_plan = null
	_defending = false
	_kit = null
	_measure()
	_back = null
	_house = null
	_version = null
	_arrange_bar = null
	_arrange_tip = null

	if not Screens.in_world() or Screens.place != Screens.Place.BURROW:
		return
	# EN RAID, le terrier est le plateau d'un autre : ni colonne, ni DIG sous
	# le doigt — la barre du raid decrit le lieu ou l'on se tient vraiment
	# (page.tsx : `crossing || shownRaid ? null : …`). Elle se cache seule.
	if _raid_shown:
		floor_host.add_child(preload("res://scenes/ui/raid_hud.tscn").instantiate())
		return

	# LA COLONNE NE GARDE QUE LA QUETE (2026-09-24) : le jardin et le
	# terrier sont devenus le potager et la maison, DIG · DEFEND · RAID des
	# batiments sur leurs ilots (burrow_landmarks.gd). Plus de barre au sol.
	var column_card: BurrowColumn = preload("res://scenes/ui/burrow_column.tscn").instantiate()
	column_card.quest_only = true
	column.add_child(column_card)
	Kit.fill(column_card)
	_column = column_card

	_kit = preload("res://scenes/ui/kit_row.tscn").instantiate()
	floor_host.add_child(_kit)
	_kit.buy_trap_pressed.connect(func() -> void: ShopState.shared().buy("trap"))
	# LEVER le bouclier tenu (POST /api/burrow `shield`), pas en racheter un :
	# `buy` passait par /api/shop, payait 400 carottes et laissait le terrier
	# nu — le bouclier d'une quete ne servait jamais.
	_kit.use_shield.connect(func() -> void:
		await Home.act("shield")
		ShopState.shared().refresh())
	# LES CASES DU KIT CHANGENT LE MODE DU PLATEAU (page.tsx : `startPlacing`,
	# `startWalling`, `inspect`). Non branchees, la case cloture ouvrait sa
	# carte et le plateau restait en pose de bombes : aucune planche a viser.
	_kit.start_placing.connect(_switch_mode.bind("placing"))
	_kit.start_walling.connect(_switch_mode.bind("walling"))
	_kit.inspect.connect(_switch_mode.bind("inspect"))
	_kit.laid_out.connect(func() -> void: _place_clean.call_deferred())
	# LA RANGEE SUIT L'ETAL : une bombe ou une planche posee passe par
	# ShopState, qui relit le serveur — la carte du kit, elle, gardait sa
	# lecture d'ouverture (« 3 available · 0 placed » apres trois planches).
	# `_mount_place` repasse a chaque arrivee : on ne branche qu'une fois.
	if not ShopState.shared().changed.is_connected(_feed_kit):
		ShopState.shared().changed.connect(_feed_kit)

	# LE VOLET DU TERRIER, sous les boutons du haut a droite : le niveau, le
	# suivant, le coffre, AMELIORER (house_panel.gd).
	_house = HousePanel.new()
	if not islets:
		_mount_floor()
		_house.under = _hud.house_button
	floor_host.add_child(_house)

	_back = preload("res://scenes/ui/back_button.tscn").instantiate()
	floor_host.add_child(_back)
	_back.pressed.connect(_end_mode)

	# Le HUD de defense (un raid en cours chez soi) se montre seul.
	floor_host.add_child(preload("res://scenes/ui/defend_hud.tscn").instantiate())

	# LA VERSION, en bas a droite — sa tape ouvre QUOI DE NEUF.
	_version = VersionTag.new(Changelog.latest(), Changelog.should_announce())
	_version.top_level = true
	floor_host.add_child(_version)
	_version.tapped.connect(_open_whats_new)
	if _version.unseen:
		_announce_whats_new()


## LA BARRE AU SOL ET LE HAUT DU TERRIER, quand les ilots sont eteints.
## DIG sur le cadran d'energie, DEFEND ▸ RAID sur leurs planches ; au-dessus,
## BURROW · les carottes et leur coffre · HARVEST. Chacun entre a son tour
## (UiEntrance) ; la camera cadre l'ile au-dessus de la barre.
func _mount_floor() -> void:
	_loop = preload("res://scenes/ui/loop_bar.tscn").instantiate()
	_loop.dig_dial = true
	_loop.dial_grow = DIAL_GROW
	_loop.dial_rise = DIAL_RISE
	_loop.dial_left = DIAL_LEFT
	_loop.bury = true
	floor_host.add_child(_loop)
	_loop.dig_pressed.connect(_on_door.bind("dig"))
	_loop.defend_pressed.connect(_on_door.bind("defend"))
	_loop.raid_pressed.connect(_on_door.bind("raid"))

	_hud = BurrowHud.new()
	_hud.live = true
	# Le sol est une bande de hauteur nulle en bas de l'ecran : le haut se
	# pose en coordonnees d'ecran, comme la version.
	_hud.top_level = true
	floor_host.add_child(_hud)
	_hud.house_pressed.connect(_on_door.bind("upgrade"))
	_hud.harvest_pressed.connect(_on_door.bind("harvest"))
	_place_hud()
	_hud.pose()
	Screens.on_reveal(_hud_arrive)

	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_floor_reserve"):
		burrow.call("set_floor_reserve", _loop.height() + Kit.EDGE + Kit.PAD_TIGHT)

	_measure()


## Centre en haut, a la hauteur des boutons du rail.
func _place_hud() -> void:
	if not is_instance_valid(_hud):
		return
	var view := get_viewport_rect().size
	_hud.position = Vector2(roundf((view.x - _hud.size.x) * 0.5), Kit.screen_inset().y)


## Le haut entre apres les trois boutons du rail (top_bar.gd `_arrive`).
func _hud_arrive() -> void:
	if is_instance_valid(_hud):
		_hud.play_entrance(UiEntrance.STEP * 3)


## Ou les carottes recoltees volent quand la pastille se tait (burrow.gd).
func hud_carrot() -> Vector2:
	if is_instance_valid(_hud) and _hud.is_visible_in_tree():
		return _hud.carrot_target()
	return Vector2(INF, INF)


## `-- --open=<surface>` : ouvre une surface une fois le terrier lu, pour
## qu'une capture (DevShot) la trouve sans main. Outil, pas comportement.
## Le temps que l'accueil s'efface avant un `--open=` (captures).
const DEV_OPEN_DELAY_S := 8.0


func _dev_open() -> void:
	var what := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--open="):
			what = arg.trim_prefix("--open=")
	if what.is_empty():
		return
	# SONDE, pas `await Home.changed` : le terrier charge, plus rien ne
	# change pendant une minute, et `--open=` partait a 60-90 s (ou jamais).
	while not (Home.loaded() and Screens.in_world()):
		await get_tree().create_timer(0.3).timeout
	# L'ACCUEIL DOIT AVOIR FINI DE S'EFFACER : un dialogue ouvert sous son
	# fondu le laissait « Loading... » a l'ecran (2026-10-14, --open=raid,
	# ouvert 6 s apres le lancement sur un serveur chaud).
	await get_tree().create_timer(DEV_OPEN_DELAY_S).timeout
	# `--open=raid:<id>` : entrer chez ce terrier, comme RAID dans la liste.
	if what.begins_with("raid:"):
		revenge(what.trim_prefix("raid:"))
		return
	match what:
		"shop": Shop.open()
		# Traverser vers l'ile, comme la planche DIG (`_dig`) — pour capturer
		# une ile servie par le serveur sans main.
		"dig": _dig()
		# SKIP TO BURY / SKIP RAID : la confirmation (`skip`), ou le saut fait
		# (`skip-go`) — pour capturer les deux sans main.
		"skip":
			LevelSkip.ask()
		"skip-go":
			if LevelSkip.next_rung() > 0:
				LevelSkip.skip(LevelSkip.next_rung())
		# Les livres par-dessus le terrier (les boutons du codex).
		"book": IntroBook.play_on(self, "shiro")
		"book-kuro": IntroBook.play_on(self, "kuro")
		"book-sea": IntroBook.play_on(self, "sea")
		# La porte DEFEND, comme son ilot la pousse.
		"defend": _on_door("defend")
		# La planche RAID : sa liste de terriers (tools/scenarios/raid-lab.ts).
		"raid": _on_door("raid")
		# BURY puis TESTER : Kuro sur le chemin du plan (bury_plan.gd).
		"bury-test":
			_on_door("defend")
			await get_tree().create_timer(1.5).timeout
			if is_instance_valid(_plan):
				_plan._run_test()
		# Le volet de la maison, comme le bouton BURROW du haut l'ouvre.
		"upgrade": _on_door("upgrade")
		"profile": Profile.open()
		"season": _open_season()
		"pass": PassDialog.open()
		"codex": LoreCodex.open()
		"energy": EnergyPanel.open()
		"refill": EnergyPopup.open()
		"language": LanguageSelect.open()
		"history":
			var profile := Profile.open()
			profile._show_tab(Profile.Tab.HISTORY)
		# `linger` : le tampon reste pose, pour qu'une capture le trouve.
		"levelup": LevelUpStamp.announce(int(Home.burrow.get("level", 1)) + 1).linger = true
		# Le passage de niveau entier, comme un achat le declenche (la maison
		# du palier suivant, sa fete, le son, le tampon), REJOUE toutes les
		# 1,5 s : l'ouverture varie de plusieurs secondes avec le reseau, et
		# une capture doit pouvoir tomber dans la fete.
		"celebrate":
			while is_inside_tree():
				Home.level_up.emit(int(Home.burrow.get("level", 1)) + 1)
				await get_tree().create_timer(1.5).timeout
		"raided": RaidedStamp.announce({"by": "Thistle", "others": 1, "carrots": 340, "defended": false, "count": 2}).linger = true
		"defended": RaidedStamp.announce({"by": "Thistle", "others": 0, "carrots": 0, "defended": true, "count": 1}).linger = true
		_: _on_door(what)


## LE SAC DU SPECTATEUR : la foudre et les bombes qu'il tient, lues sur
## l'etal (page.tsx : `held` des articles `lightning` et `bomb`). Un eclair
## lance ou une bombe plantee les depense cote serveur : l'etal est relu, et
## le compte des boutons suit.
func _wire_bag() -> void:
	# DES METHODES, pas des lambdas : l'etal et RunState survivent au chrome,
	# et une lambda branchee sur eux lui survivrait aussi.
	ShopState.shared().changed.connect(_feed_bag)
	RunState.current.board.connect(_on_bag_spent)
	_feed_bag()


func _feed_bag() -> void:
	var shop := ShopState.shared()
	RunState.current.set_bag({"lightning": int(shop.item("lightning").get("held", 0)),
		"bloop": int(shop.item("bloop").get("held", 0))})


func _on_bag_spent(name: String, data: Variant) -> void:
	var me := RunState.current.my_id()
	if (name == "lightning_struck" and data is Dictionary and String(data.get("castBy", "")) == me) \
			or (name == "rabbit_inked" and data is Dictionary and String(data.get("by", "")) == me):
		ShopState.shared().refresh()


## LE TABLEAU DE SAISON, et sa porte vers l'ile des autres : « regarder » une
## ligne qui creuse fait traverser en spectateur (page.tsx `spectate`). Sans
## siege et sans cout — le serveur pose son instantane, sans lapin a moi.
func _open_season() -> void:
	var board := SeasonBoard.open()
	board.spectate.connect(watch)
	board.raid.connect(revenge)


## REGARDER LA RUN D'UN AUTRE : fermer la carte, entrer dans sa salle sans
## lapin, traverser vers l'ile. Le tableau de saison, la liste RAID (une
## ligne qui creuse) et le banc de scenarios passent tous par ici.
func watch(player_id: String) -> void:
	Net.trace("watch %s (depuis %s)" % [player_id, str(Screens.place)])
	close_dialog()
	RunState.current.spectate(player_id)
	if Screens.place != Screens.Place.ISLAND:
		Screens.cross(Screens.Place.ISLAND)


## SE VENGER depuis l'historique du profil : entrer dans le terrier de celui
## qui nous a pilles, comme la ligne RAID de la liste (target_list.gd). Le
## raid se joue au terrier : depuis l'ile, on n'y traverse qu'une fois le
## serveur d'accord — un refus (bouclier, cooldown) laisse le joueur ou il
## est, la pastille dit pourquoi.
func revenge(player_id: String) -> void:
	Net.trace("revenge %s (depuis %s)" % [player_id, str(Screens.place)])
	close_dialog()
	if player_id.is_empty():
		return
	if not Chrome.raids_open():
		toast(I18N.f("rabbitLevel.raidLocked", [Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)]), true)
		return
	if PlaySettings.solo_on():
		toast(I18N.t("sound.soloRaids"), true)
		return
	var state := RaidState.current
	# DEPUIS L'ILE, EN PLEINE PARTIE : le serveur refuse un raid a qui tient
	# une place (`on_island`) — la vengeance restait sans effet, avec « ca n'a
	# pas marche » (2026-10-12). On rend la place d'abord, comme BACK : le sac
	# est encaisse, puis le raid part, et on rentre au terrier quoi qu'il dise.
	var left_island := Screens.place == Screens.Place.ISLAND and not RunState.current.seed.is_empty()
	if left_island:
		RunState.current.go_home()
	await state.enter(player_id, left_island)
	if (state.has_raid() or left_island) and Screens.place != Screens.Place.BURROW:
		Screens.cross(Screens.Place.BURROW)


## LES RAIDS SONT-ILS OUVERTS A CE LAPIN ? Niveau lu sur /api/burrow ; un
## terrier pas encore charge laisse passer (le serveur tranche).
static func raids_open() -> bool:
	var level: Variant = Home.player.get("level")
	return level == null or int(level) >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)


## UNE PORTE DES BATIMENTS DU TERRIER (burrow_landmarks.gd).
func go(door: String) -> void:
	if dialog_open() or not _mode.is_empty():
		return
	_on_door(door)


## UNE PORTE, qu'elle vienne d'un batiment ou de la ligne de la quete.
func _on_door(door: String) -> void:
	Analytics.track("door", {"door": door})
	match door:
		"dig":
			_dig()
		"defend":
			Analytics.track("defend_open")
			_start_mode("placing")
		"raid":
			# SOUS RAID_MIN : la planche dit SKIP TO RAID (LevelSkip).
			if LevelSkip.stage() == 2:
				LevelSkip.ask()
				return
			# PAS DE RAID AVANT RABBIT_LEVELS.RAID_MIN (3), dans les deux sens :
			# le serveur refuse de toute facon ; ici on dit pourquoi.
			Net.trace("porte RAID : niveau=%s" % str(Home.player.get("level")))
			if not Chrome.raids_open():
				Net.trace("porte RAID refusee : niveau < RAID_MIN")
				Analytics.track("raid_locked", {"level": int(Home.player.get("level", 0))})
				toast(I18N.f("rabbitLevel.raidLocked", [Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)]), true)
				return
			# SOLO : hors du PvP dans les deux sens (le serveur refuse aussi).
			if PlaySettings.solo_on():
				Analytics.track("raid_locked", {"solo": true})
				toast(I18N.t("sound.soloRaids"), true)
				return
			TargetList.open()
		"shop":
			Shop.open()
		"energy":
			EnergyPopup.open()
		# LE POTAGER : on recolte tout de suite, sans carte. Les plants
		# s'arrachent au doigt (un « pop », la recolte est optimiste) et
		# chaque carotte tinte en se posant sur la pastille (burrow.gd).
		"harvest":
			if Home.live_garden() <= 0 or Home.pending:
				Sound.deny()
				return
			Sound.play("hop", 1.4)
			Home.act("harvest")
		# LA MAISON : son volet, en haut a droite (house_panel.gd) — il a pris
		# la place de la carte qui s'ouvrait au milieu de l'ecran.
		"upgrade":
			if _house != null:
				# Le bouton BURROW du haut ouvre ET referme son volet.
				if _house.under != null:
					_house.toggle()
				else:
					_house.expand()


## DIG. Pas de liste : le SERVEUR choisit l'ile au niveau du lapin (1 a 10,
## 2026-10-02 — seul aux niveaux 1-2, a deux du 3 au 5, jusqu'a quatre des le 6).
##
## LE `join` EST ICI depuis que l'ile lit la socket (2026-09-23) : c'est
## l'instantane du serveur (`island`) qui pose le plateau — coffres, chiffres,
## cases creusees.
func _dig() -> void:
	if Island.tutorial_pending():
		# CONNECTE, la lecon est celle du SERVEUR : un compte sans manche y est
		# assis quoi qu'on demande, et une lecon faite hors ligne ne le lui dit
		# pas — il la redonnait, sur une ile que le client ne posait pas.
		if Session.signed_in():
			RunState.current.join(null)
		Screens.cross(Screens.Place.ISLAND)
		return
	# A SEC, ON NE TRAVERSE PAS. Le serveur refuse le `join` (`no_energy`) et
	# l'ile d'attente restait a l'ecran, sans siege — on y « creusait » quand
	# meme, a crédit, sur un plateau qui n'etait pas le sien (2026-09-23). Le
	# terrier dit l'attente et vend le plein ; l'ile n'est pas l'endroit ou on
	# apprend qu'on n'a pas de quoi y aller (server/index.ts, le `join`).
	if not Home.burrow.is_empty():
		var run_cost := int(Home.burrow.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")))
		if int(Home.live_energy()["energy"]) < run_cost:
			Analytics.track("energy_empty", {"where": "dig_door", "energy": int(Home.live_energy()["energy"]), "need": run_cost})
			Sound.deny()
			EnergyPopup.open()
			return
	RunState.current.join(null)
	Screens.cross(Screens.Place.ISLAND)




## A SEC EN PLEINE RUN : le recap « GET MORE ENERGY » propose le plein, en
## carottes ou en argent (EnergyPopup), pas l'etal entier — sept etageres
## devant « je veux continuer a creuser » font perdre le fil. On rentre
## d'abord (le lapin est mort, l'ile n'a plus de place pour lui : meme chemin
## que le refus `no_energy`, island.gd), le dialogue s'ouvre au terrier, et un
## plein pris renvoie tout de suite creuser. Ferme sans acheter : on reste au
## terrier, qui dit l'attente.
func _refill_after_run() -> void:
	RunState.current.go_home()
	if Screens.place == Screens.Place.ISLAND:
		Screens.moved.connect(func(_id: Screens.Place) -> void:
			_offer_refill(), CONNECT_ONE_SHOT)
		Screens.cross(Screens.Place.BURROW)
	else:
		_offer_refill()


func _offer_refill() -> void:
	EnergyPopup.open("carrots", func() -> void:
		# Le terrier relu AVANT la porte : `_dig` compare la barre au prix
		# de la traversee, et une barre d'avant l'achat rouvrirait ce dialogue.
		await Home.refresh()
		_dig())


## UN RAID SUR NOTRE TERRIER commence ou finit (burrow.gd). La grille monte
## seule — un raid est LE moment ou une bombe vaut d'etre enterree, et le
## joueur n'a pas a chercher le bouton — et ce qui etait ouvert descend : la
## liste des cibles, le codex, l'energie restaient par-dessus la defense
## (page.tsx, l'effet du defenseur). A la fin, le mode pose se referme.
func defend(on: bool, finished: bool = false) -> void:
	# LE HAUT DU TERRIER S'EFFACE LE TEMPS DU RAID SUBI (2026-10-14) : la
	# carte de la defense prend sa place ; pendue dessous, elle couvrait le
	# potager, la ou l'intrus va.
	_defending = on
	if on:
		close_dialog()
		# UN VRAI RAID : le plan et sa repetition s'effacent, la defense en
		# direct a besoin du terrier.
		_drop_plan()
		# LA CARTE REPLIEE : le raid se joue sur le terrier, et la carte de
		# la bombe (« Buy a bomb ») en couvrait le milieu — l'intrus passait
		# dessous. La rangee reste, une tape sur la bombe la rouvre.
		if _mode != "placing" and not finished:
			_start_mode("placing", false)
	else:
		alarm_off()
		if _mode == "placing":
			_end_mode()
	var was := is_instance_valid(_hud) and _hud.visible
	_sync_top()
	if is_instance_valid(_hud) and _hud.visible and not was:
		_hud.play_entrance()


## L'ALERTE DU RAID SUBI (raid_alarm.gd) : les bords battent en rouge et des
## lignes convergent vers le centre tant que l'intrus est chez nous. Sous les
## tampons (premier enfant des overlays) : DEFENDED passe devant.
var _alarm: RaidAlarm


func alarm_on(who: String, action: String = "") -> RaidAlarm:
	if _alarm != null and is_instance_valid(_alarm):
		return _alarm
	_alarm = RaidAlarm.new()
	_alarm.who = who
	# Au terrier, le panneau de defense dit deja qui entre ; ailleurs, rien
	# ne le dit : le bandeau crie, et le bouton ramene.
	_alarm.banner = not action.is_empty()
	_alarm.action = action
	overlays.add_child(_alarm)
	overlays.move_child(_alarm, 0)
	Kit.fill(_alarm)
	return _alarm


## Un coup chez nous (une bombe a saute sous lui) : les lignes repartent.
func alarm_burst() -> void:
	if _alarm != null and is_instance_valid(_alarm):
		_alarm.burst()


## Foudroye, a sec, reparti : l'alerte s'eteint.
func alarm_off() -> void:
	if _alarm != null and is_instance_valid(_alarm):
		_alarm.finish()
	_alarm = null


## UN RAID SUR NOTRE TERRIER PENDANT QU'ON EST AILLEURS — sur l'ile, la tete
## dans le sable. RaidState ne garde le raid subi qu'au terrier (il n'a pas
## de plateau ou le poser ailleurs) ; mais la socket le pousse partout, et
## se taire ici, c'etait apprendre le pillage au retour (le user,
## 2026-10-01 : « il le sait pas, faut une grosse notification alerte »).
## Le meme cri qu'au terrier, bandeau compris, plus DEFENDRE qui ramene.
## Le raid est le notre : on ne lit que ce que la poussee dit.
var _away_raid := ""
var _away_sprung := 0
var _away_ended := ""
## Plus de nouvelles depuis AWAY_QUIET_S : la fin s'est perdue (socket
## coupee) — l'alerte ne reste pas allumee pour toujours.
const AWAY_QUIET_S := 45.0
var _away_quiet: Timer


func _raid_away(d: Dictionary) -> void:
	if Screens.place == Screens.Place.BURROW or not Screens.in_world() or Screens.crossing:
		return
	if RaidState.current.has_raid():
		return
	var id := String(d.get("raidId", ""))
	var attacker: Dictionary = d.get("attacker", {}) if d.get("attacker") is Dictionary else {}
	if bool(d.get("finished", false)):
		if id == _away_ended:
			return
		_away_ended = id
		var was_on := not _away_raid.is_empty()
		_away_off()
		if not was_on:
			return
		var looted := int(d.get("carrotsLooted", 0))
		if bool(d.get("struck", false)):
			toast(I18N.t("defend.struckDown"))
		elif bool(d.get("succeeded", false)) and looted > 0:
			toast(I18N.f("defend.looted", [I18N.group_digits(looted)]), true)
		else:
			toast(I18N.t("defend.held_"))
		return
	_quiet_timer().start(AWAY_QUIET_S)
	if _away_raid == id:
		# UNE BOMBE A SAUTE sous lui, chez nous : les lignes repartent.
		var sprung := int(d.get("trapsSprung", 0))
		if sprung > _away_sprung:
			_away_sprung = sprung
			alarm_burst()
			Sound.play("explosion")
		return
	_away_raid = id
	_away_sprung = int(d.get("trapsSprung", 0))
	alarm_off()
	var alarm := alarm_on(String(attacker.get("name", "")), I18N.t("loop.defend"))
	alarm.acted.connect(_defend_from_away)
	Sound.play("explosion")
	Input.vibrate_handheld(600)
	Analytics.track("defend_alarm_away", {})


## DEFENDRE, depuis l'ile : rentrer (le serveur banque sur `leave`, comme le
## bouton de retour), et le terrier relit le raid subi en arrivant
## (RaidState `_on_moved` → `refresh_incoming`). Le chemin de push.gd.
func _defend_from_away() -> void:
	if Screens.crossing:
		return
	Analytics.track("defend_alarm_tap", {})
	_away_off()
	if Screens.place == Screens.Place.ISLAND:
		RunState.current.go_home()
	Screens.cross(Screens.Place.BURROW)


func _away_off() -> void:
	if _away_raid.is_empty():
		return
	_away_raid = ""
	_away_sprung = 0
	if _away_quiet != null:
		_away_quiet.stop()
	alarm_off()


func _quiet_timer() -> Timer:
	if _away_quiet == null:
		_away_quiet = Timer.new()
		_away_quiet.one_shot = true
		_away_quiet.timeout.connect(_away_off)
		add_child(_away_quiet)
	return _away_quiet


## Le plateau montre-t-il un raid ? (la barre du haut y rallume la boutique)
func raid_shown() -> bool:
	return _raid_shown


## LE PLATEAU DU RAID vient de monter, ou de redescendre (burrow.gd, au noir
## du rideau). Le chrome tourne AU MEME INSTANT que le plateau : la barre du
## raid au-dessus de notre propre jardin, ou DIG sous le sol d'un autre,
## c'etait le bug du web avant `shownRaid`.
func show_raid(on: bool) -> void:
	if _raid_shown == on:
		return
	_raid_shown = on
	Analytics.set_raid(on)
	close_dialog()
	_end_mode()
	_mount_place()
	_raid_changed.emit()


## UN MODE DU TERRIER (poser des pieges, des clotures) : la rangee du kit
## monte, la barre et la colonne s'effacent, le terrier prend son cadrage, et
## le retour s'affiche. La pose elle-meme est au terrier (burrow.gd
## `_toggle_trap`) : une tape sur une case minable, le serveur d'abord.
func _start_mode(mode: String, expanded: bool = true) -> void:
	if _kit == null:
		return
	_mode = mode
	# Le coin bas-droit est au kit et a CLEAR ALL le temps du mode.
	if _version != null:
		_version.visible = false
	arrange_state({})
	# AVEC LE PLAN, LA CARTE REPLIEE : elle couvrait le chemin du pillard. Une
	# tape sur une case la rouvre. Pas de plan pendant un vrai raid
	# (`expanded` faux, `defend`).
	var plan := expanded and _hud != null
	_kit.open(mode, expanded and not plan)
	if _loop != null:
		_loop.set_away(true)
	if plan:
		_mount_plan(mode)
	_column.set_editing(true)
	_back.show_for(mode)
	_mount_clean()
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_defend_kit", true)
		burrow.call("set_placing", mode == "placing")
		burrow.call("set_walling", mode == "walling")


## LE PLAN DE DEFENSE monte avec BURY : le haut du terrier s'efface, le
## panneau prend sa place, et le terrier se cadre entier entre lui et la
## rangee du kit (`set_plan_room`).
func _mount_plan(mode: String) -> void:
	_drop_plan()
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow == null or not burrow.has_method("show_route"):
		return
	_plan = BuryPlan.new()
	_plan.burrow = burrow
	# Le sol est une bande de hauteur nulle : le panneau se pose a l'ecran.
	_plan.top_level = true
	floor_host.add_child(_plan)
	_plan.set_mode(mode)
	_plan.room_changed.connect(_plan_room)
	_plan.testing.connect(_on_plan_testing)
	if not _kit.laid_out.is_connected(_plan_room):
		_kit.laid_out.connect(_plan_room)
	if is_instance_valid(_hud):
		_hud.visible = false
	_plan_room.call_deferred()


func _drop_plan() -> void:
	_plan_testing = false
	if is_instance_valid(_plan):
		_plan.queue_free()
		_plan = null
		if is_instance_valid(_hud):
			_sync_top()
			if _hud.visible:
				_hud.play_entrance()
	_plan = null
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_plan_room"):
		burrow.call("set_plan_room", 0.0, 0.0)
	_measure()


## Le terrier entre le bas du panneau et le haut de la rangee du kit.
func _plan_room() -> void:
	if not is_instance_valid(_plan) or _kit == null:
		return
	var view := get_viewport_rect().size
	var tray := _kit.tray_rect()
	var floor_top := tray.position.y if tray.has_area() else view.y - KitRow.TAB_H - 2.0 * Kit.EDGE
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_plan_room"):
		burrow.call("set_plan_room", _plan.bottom() + Kit.PAD_TIGHT, view.y - floor_top + Kit.PAD_TIGHT)
	_measure()


## TESTER : Kuro marche, la pose se suspend ; elle reprend la case choisie.
func _on_plan_testing(on: bool) -> void:
	_plan_testing = on
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow == null or not burrow.has_method("set_placing") or _mode.is_empty():
		return
	burrow.call("set_placing", not on and _mode == "placing")
	burrow.call("set_walling", not on and _mode == "walling")


## Donne a la rangee du kit ce que l'etal vient de relire. Une METHODE et
## non une lambda : l'etal survit au chrome (voir `_wire_run`).
func _feed_kit() -> void:
	if _kit == null:
		return
	var shop := ShopState.shared()
	if not shop.shop.is_empty():
		_kit.state.adopt_shop(shop.shop)
	if not shop.fences.is_empty():
		_kit.state.adopt_fences(shop.fences)


## LE BOUTON « TOUT RETIRER » : toutes les bombes et toutes les planches
## reviennent au sac (le serveur le fait : `?all=1` sur les deux routes).
## En bas a gauche, juste au-dessus de BACK — le coin haut-gauche porte la
## note des invites (« Guest burrow… »), qui le recouvrait ; montre
## seulement s'il y a quelque chose a retirer — un bouton qui ne fait rien est
## pire que pas de bouton. DEUX APPUIS : le premier demande « sur ? » trois
## secondes, le second nettoie — rien ne se perd, mais une defense entiere se
## defait d'un coup.
func _mount_clean() -> void:
	_drop_clean()
	_clean = preload("res://scenes/plank_button.tscn").instantiate()
	floor_host.add_child(_clean)
	_clean.pressed.connect(_on_clean)
	_clean_armed = false
	_relabel_clean()
	if not ShopState.shared().changed.is_connected(_relabel_clean):
		ShopState.shared().changed.connect(_relabel_clean)


func _drop_clean() -> void:
	if _clean != null and is_instance_valid(_clean):
		_clean.queue_free()
	_clean = null
	_clean_armed = false


func _relabel_clean() -> void:
	if _clean == null or not is_instance_valid(_clean):
		return
	_clean.visible = ShopState.shared().base_dirty()
	var words := I18N.shout(I18N.t("defend.cleanSure" if _clean_armed else "defend.clean"))
	_clean.relabel(words)
	# LA PLANCHE PEINT SON TEXTE ELLE-MEME : sa taille minimale ne le compte
	# pas. Sans largeur donnee, elle tombait a une pastille de ses deux bouts
	# (2026-09-23). La largeur du mot le plus long des deux, bouts compris.
	var font := get_theme_default_font()
	var w := 0.0
	for key in ["defend.clean", "defend.cleanSure"]:
		w = maxf(w, font.get_string_size(I18N.shout(I18N.t(key)), HORIZONTAL_ALIGNMENT_LEFT, -1,
			_clean.label_size).x)
	var sz := Vector2(ceilf(w + 2.0 * PlankButton.TEXT_PAD + 8.0), CLEAN_H)
	_clean.custom_minimum_size = sz
	_clean.size = sz
	_place_clean.call_deferred()


## CLEAR ALL A COTE DES CASES, en bas au centre (2026-10-01) : c'est ce
## qu'il vide, et en bas a gauche, au-dessus de BACK, il se lisait comme une
## sortie. A droite de la rangee, centre sur elle ; a gauche si la droite
## manque de place. Sans rangee posee : l'ancien coin, au-dessus de BACK.
func _place_clean() -> void:
	if _clean == null or not is_instance_valid(_clean):
		return
	var view := get_viewport_rect().size
	var sz := _clean.size
	var tray: Rect2 = _kit.tray_rect() if _kit != null else Rect2()
	if tray.size.x <= 0.0:
		_clean.global_position = Vector2(Kit.EDGE,
			view.y - Kit.EDGE - BackButton.MAX_H - Kit.PAD - sz.y).round()
		return
	var x := tray.end.x + KitRow.GAP
	if x + sz.x > view.x - Kit.EDGE:
		x = tray.position.x - KitRow.GAP - sz.x
	_clean.global_position = Vector2(x, tray.get_center().y - sz.y * 0.5).round()


func _on_clean() -> void:
	if not _clean_armed:
		_clean_armed = true
		_relabel_clean()
		await get_tree().create_timer(3.0).timeout
		_clean_armed = false
		_relabel_clean()
		return
	_clean_armed = false
	_clean.disabled = true
	var got: Array = await ShopState.shared().clear_base()
	if _clean != null and is_instance_valid(_clean):
		_clean.disabled = false
		_relabel_clean()
	if int(got[0]) + int(got[1]) > 0:
		toast(I18N.f("defend.cleaned", [int(got[0]), int(got[1])]))


## LE BANDEAU DE CE QU'ON TIENT, pose sur le sol. `{}` : on ne tient rien, il
## s'en va. Pas en mode : la rangee du kit tient le bas, et un « pose ·
## ANNULER » qui trainait de l'amenagement se serait empile dessus.
func arrange_state(state: Dictionary) -> void:
	if state.is_empty() or not _mode.is_empty():
		if _arrange_bar != null:
			_arrange_bar.queue_free()
			_arrange_bar = null
		return
	if floor_host.get_child_count() == 0 or _raid_shown:
		return
	if _arrange_bar == null:
		_arrange_bar = ArrangeBar.new()
		_arrange_bar.ground = _loop
		_arrange_bar.aside = _column
		floor_host.add_child(_arrange_bar)
		_arrange_bar.put_back.connect(func() -> void:
			var burrow := Screens.at(Screens.Place.BURROW)
			if burrow != null and burrow.has_method("arrange_cancel"):
				burrow.call("arrange_cancel"))
	_arrange_bar.show_state(state)


## Un refus a la tape : le bandeau tremble.
func arrange_nudge() -> void:
	if _arrange_bar != null:
		_arrange_bar.nudge()


## LA LEGENDE « TOUCHE UN ARBRE », pointee sur `at` (pixels d'ecran).
func arrange_tip(at: Vector2, show: bool) -> void:
	if not show:
		if _arrange_tip != null:
			_arrange_tip.queue_free()
			_arrange_tip = null
		return
	if _arrange_tip == null:
		if floor_host.get_child_count() == 0 or _raid_shown:
			return
		_arrange_tip = ArrangeTip.new()
		# Sur l'etage des pastilles : sous les dialogues, au-dessus du sol.
		toasts.get_parent().add_child(_arrange_tip)
		toasts.get_parent().move_child(_arrange_tip, toasts.get_index())
	_arrange_tip.point(at - _arrange_tip.get_parent().global_position)


## CHANGER DE MODE SANS REFERMER LA RANGEE : c'est elle qui vient de le
## demander, sa case est deja choisie. « inspect » suspend le plateau (ni pose
## ni cloture) mais garde la rangee et le retour.
func _switch_mode(mode: String) -> void:
	if _kit == null or _mode.is_empty() or _mode == mode:
		return
	_mode = mode
	if _plan != null:
		_plan.set_mode(mode)
	if _plan_testing:
		return
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", mode == "placing")
		burrow.call("set_walling", mode == "walling")


func _end_mode() -> void:
	if _mode.is_empty():
		return
	_mode = ""
	_drop_clean()
	_drop_plan()
	if _version != null:
		_version.visible = true
	if _kit != null:
		_kit.close()
		_back.dismiss()
		_column.set_editing(false)
	if _loop != null:
		_loop.set_away(false)
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", false)
		burrow.call("set_walling", false)
		burrow.call("set_defend_kit", false)


## Les evenements du serveur qui parlent au chrome lui-meme.
func _on_socket_event(name: String, data: Variant) -> void:
	# LE BANC DE SCENARIOS (tools/scenarios, serveur local RR_STAGE=1) dit qui
	# regarder : la meme traversee que « regarder » au tableau de saison.
	# Le serveur de prod n'emet jamais cet evenement.
	if name == "__caption" and data is Dictionary:
		_stage_caption(String((data as Dictionary).get("text", "")))
		return
	if name == "__follow" and data is Dictionary:
		watch(String((data as Dictionary).get("playerId", "")))
		return
	if name == "raid_incoming" and data is Dictionary:
		_raid_away(data)


## Le bandeau du banc de scenarios : le cas en cours, fixe en haut de l'ecran
## jusqu'au suivant. Cree au premier `__caption`, donc absent en jeu normal.
var _stage_label: Label


func _stage_caption(text: String) -> void:
	if _stage_label == null:
		_stage_label = Label.new()
		_stage_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
		_stage_label.offset_top = 96.0
		_stage_label.offset_left = 24.0
		_stage_label.offset_right = -24.0
		_stage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_stage_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		# Cliquer le bandeau fait avancer le banc (le serveur relaie au runner).
		_stage_label.mouse_filter = Control.MOUSE_FILTER_STOP
		_stage_label.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_stage_label.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				GameSocket.act("__next", 0)
			elif ev is InputEventScreenTouch and ev.pressed:
				GameSocket.act("__next", 0))
		_stage_label.add_theme_font_size_override("font_size", 26)
		_stage_label.add_theme_color_override("font_color", Color.WHITE)
		var box := StyleBoxFlat.new()
		box.bg_color = Color(0, 0, 0, 0.72)
		box.set_corner_radius_all(8)
		box.set_content_margin_all(12)
		_stage_label.add_theme_stylebox_override("normal", box)
		_stage_label.z_index = 4000
		add_child(_stage_label)
	_stage_label.text = text
	_stage_label.visible = not text.is_empty()


func _on_world_shown(shown: bool) -> void:
	visible = shown
	if not shown:
		close_dialog()


func _on_moved(place: int) -> void:
	# Un raid se joue au terrier : ailleurs, il n'y a pas de plateau de raid.
	# Au terrier, la scene neuve l'a deja dit (`show_raid`, dans son _ready,
	# AVANT ce signal) — on ne le lui reprend pas.
	if place != Screens.Place.BURROW:
		_raid_shown = false
	# L'alerte d'ailleurs ne suit pas : au terrier, burrow.gd allume la sienne.
	_away_off()
	# Un dialogue ouvert sur un lieu ne suit pas le joueur sur l'autre, ni un
	# mode du terrier.
	close_dialog()
	_end_mode()
	_mount_place()
	if place == Screens.Place.BURROW:
		maybe_books()


## LES LIVRES DU TERRIER, un par etape (LevelSkip), chacun une fois, apres
## le tampon du niveau et jamais par-dessus un raid, un mode ou un dialogue
## (il attend la visite suivante) :
##   - Shiro au premier terrier ; un compte neuf traverse ensuite vers sa
##     premiere ile, le tuto ;
##   - Kuro au niveau 2 (DEFEND s'ouvre) — d'ordinaire deja lu, sur l'ile du
##     tuto qui coule (island.gd `_book_two_then_home`) ;
##   - puis relier un wallet (une fois, un invite seulement ; WALLET_OFFER) ;
##   - la mer a RAID_MIN (RAID et les iles a plusieurs s'ouvrent ; pas en Solo).
## `-- --no-intro` les coupe (captures).
func maybe_books(delay := 2.6) -> void:
	await get_tree().create_timer(delay).timeout
	for i in range(20):
		if Home.loaded():
			break
		await get_tree().create_timer(0.5).timeout
	if not _books_calm():
		return
	var level := int(Home.player.get("level", 1))
	var book := ""
	if not IntroBook.seen("shiro"):
		book = "shiro"
	# SANS TUTO (niveau 3 d'un coup) : les livres s'etalent sur les premieres
	# iles — Kuro apres la premiere, la mer apres la deuxieme (2026-10-17).
	elif level >= 2 and not IntroBook.seen("kuro") and not _skipped_before(1):
		book = "kuro"
	elif _wallet_offer_due():
		# AU TERRIER, A L'ARRIVEE AU NIVEAU 3 (2026-10-17, « il faudra proposer
		# le connect wallet au niveau 3 ») — d'abord juste apres le livre 2,
		# la fin du tuto (2026-10-16). Avant le livre de la mer.
		await _offer_wallet()
		maybe_books(0.4)
		return
	elif level >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3) and not PlaySettings.solo_on() and not IntroBook.seen("sea") \
			and not _skipped_before(2):
		book = "sea"
	if book.is_empty():
		# LE TUTO PAS ENCORE FAIT (l'app fermee avant le coffre) : on y retourne.
		if Island.tutorial_pending():
			go("dig")
		return
	_book = IntroBook.play_on(self, book)
	await _book.finished
	maybe_books(0.6)


## SANS TUTO, et moins de `runs` iles jouees : ce qui suit la lecon attend.
func _skipped_before(runs: int) -> bool:
	return Island.tutorial_skipped() and SnackState.runs_played() < runs


func _books_calm() -> bool:
	return is_inside_tree() and not is_instance_valid(_book) and Home.loaded() \
		and Screens.in_world() and Screens.place == Screens.Place.BURROW \
		and not _raid_shown and _mode.is_empty() and not is_instance_valid(_dialog) \
		and not "--no-intro" in OS.get_cmdline_user_args()


## ETEINTE pour la prod (2026-10-18, « pas la proposition de connect wallet,
## plus tard ») : le wallet se relie depuis l'accueil et le profil, comme avant.
const WALLET_OFFER := false

## RELIER UN WALLET, propose une fois a l'arrivee au terrier au niveau 3 (les
## raids ; avant : apres le livre 2) — a un invite seulement. Une fois par joueur sur cet
## appareil. Sans wallet pour repondre (un navigateur de bureau sans
## extension), la proposition vient quand meme ; CONNECT WALLET dit alors
## qu'il en faut un, sans en pousser aucun (2026-10-16, « mets juste connect
## wallet, car tu peux avoir Solflare, Backpack et Jup »).
func _wallet_offer_due() -> bool:
	if not WALLET_OFFER or Net.WORLD == "web2" or not bool(Session.player.get("guest", false)):
		return false
	# Au niveau des raids, sans tuto compris (il y arrive d'un coup).
	if int(Home.player.get("level", 1)) < Tuning.i("RABBIT_LEVELS.RAID_MIN", 3):
		return false
	var cfg := ConfigFile.new()
	cfg.load(IntroBook.PATH)
	return not bool(cfg.get_value("wallet", _wallet_key(), false))


func _wallet_key() -> String:
	return "p_" + str(Session.player.get("id", "anon"))


func _offer_wallet() -> void:
	var cfg := ConfigFile.new()
	cfg.load(IntroBook.PATH)
	cfg.set_value("wallet", _wallet_key(), true)
	cfg.save(IntroBook.PATH)
	var dialog := Dialog.new(I18N.t("auth.offerTitle"), 460.0)
	var why := Kit.wrapped(Kit.label(I18N.t("auth.offerWhy"), 13, Palette.INK))
	dialog.body.add_child(why)
	var none := Kit.wrapped(Kit.label(I18N.t("auth.offerNoWallet"), 12, Palette.BARK))
	none.visible = false
	dialog.body.add_child(none)
	var row := Kit.hbox(Kit.PAD)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	dialog.body.add_child(row)
	var later := Kit.button(I18N.t("auth.offerLater"), "wood", 130.0, 40.0)
	later.pressed.connect(dialog.close_requested)
	row.add_child(later)
	var link := Kit.button(I18N.t("auth.offerLink"), "gold", 170.0, 40.0)
	link.pressed.connect(func() -> void:
		# Demande au moment du clic : une extension s'injecte parfois tard.
		if not Wallet.available():
			none.visible = true
			Sound.deny()
			return
		link.disabled = true
		var address := await Wallet.address()
		if not address.is_empty():
			var signer := func(message: String) -> String: return await Wallet.sign(message)
			if await Session.link_wallet(address, signer):
				toast(I18N.t("auth.offerDone"))
		Analytics.track("wallet_offer", {"linked": not bool(Session.player.get("guest", true))})
		dialog.close_requested())
	row.add_child(link)
	I18N.apply_face([why, none, later, link])
	open(dialog)
	await dialog.closed


## LA MISE EN PAGE (globals.css) : la barre du haut est une bande epinglee
## de TOPBAR_H ; la colonne prend max(25vw, 220px) a gauche, sous la barre ;
## le sol est une bande en bas ; les pastilles se centrent sous la barre.
func _measure() -> void:
	var view := get_viewport_rect().size
	top_bar.offset_bottom = Kit.TOPBAR_H
	# La rangee du kit se repose aussi : CLEAR ALL la suit.
	_place_clean.call_deferred()

	# 25 % de la largeur, entre 220 et 360 : au-dela, un grand ecran etirait
	# les cartes sur 640 px pour trois lignes (2560 de large, 2026-09-23).
	var column_w := clampf(view.x * 0.25, 220.0, COLUMN_MAX)
	column.offset_left = Kit.EDGE
	# Sous les boutons du rail, qui tiennent maintenant ce coin.
	column.offset_top = TopBar.rail_bottom(view) + Kit.PAD_TIGHT
	column.offset_right = Kit.EDGE + column_w
	column.offset_bottom = -Kit.EDGE

	_place_hud()
	# Les legendes passent sous le haut du terrier, qui tient le milieu —
	# ou sous le plan de defense, qui le remplace pendant BURY.
	var toast_top := Kit.TOPBAR_H
	if is_instance_valid(_plan):
		toast_top = maxf(toast_top, _plan.bottom())
	elif is_instance_valid(_hud):
		toast_top = maxf(toast_top, _hud.position.y + _hud.size.y)
	toasts.offset_top = toast_top + Kit.PAD_TIGHT
	var toast_w := minf(560.0, view.x - 2.0 * (column_w + 24.0))
	toasts.offset_left = -toast_w * 0.5
	toasts.offset_right = toast_w * 0.5


# ── Les pastilles ────────────────────────────────────────────────────────────

## CE QUE LE TERRIER DIT, sous la pastille : une legende sombre, rouge a
## l'encre si c'est un refus. Une seule a la fois — la nouvelle remplace
## l'ancienne, comme `setNote` sur le web.
func toast(text: String, refused: bool = false) -> void:
	for old in toasts.get_children():
		old.queue_free()
	if text.is_empty():
		return
	# UN REFUS S'ENTEND (page.tsx `refuse`) : le meme non partout.
	if refused:
		Sound.deny()
	_clear_pill()
	var note := Kit.caption(text, refused)
	note.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	# UNE LEGENDE QUI SE REPLIE N'A PAS DE LARGEUR A ELLE : centree dans la
	# bande, elle tombait a zero et cassait apres chaque lettre — le refus
	# « No traps left » se lisait en colonne sur le Seeker (2026-09-23). Elle
	# prend donc la largeur de son texte, bornee par la bande.
	var words: Label = note.get_child(0)
	var font := words.get_theme_font("font")
	var font_size := words.get_theme_font_size("font_size")
	var room := toasts.size.x - 36.0
	var line := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	words.custom_minimum_size.x = ceilf(minf(line + 1.0, maxf(room, 120.0)))
	toasts.add_child(note)
	# ELLE ARRIVE, elle n'apparait pas : petite et transparente, elle gonfle
	# un peu au-dela et se pose. L'echelle seulement — la position est a la
	# bande (VBoxContainer), qui la reposerait. Le pivot attend la mesure.
	note.modulate.a = 0.0
	note.scale = Vector2.ONE * TOAST_POP_FROM
	var arrive := func() -> void:
		if not is_instance_valid(note):
			return
		note.pivot_offset = note.size * 0.5
		var pop := create_tween().set_parallel(true)
		pop.tween_property(note, "scale", Vector2.ONE, TOAST_POP_SECONDS) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		pop.tween_property(note, "modulate:a", 1.0, TOAST_POP_SECONDS * 0.5)
	arrive.call_deferred()
	var tween := create_tween()
	tween.tween_interval(TOAST_SECONDS)
	tween.tween_property(note, "modulate:a", 0.0, TOAST_FADE)
	tween.tween_callback(note.queue_free)


## SOUS LA PASTILLE, PAS SOUS LA BARRE. Le cadran d'energie de la pastille a
## carottes pend plus bas que TOPBAR_H : une legende calee sur la barre
## passait dessous, et « Could not save your burrow » se lisait a moitie
## derriere le cadran (2026-09-23). On mesure donc le bas de ce qui est
## vraiment dessine — la pastille et tout ce qu'elle porte.
func _clear_pill() -> void:
	var bottom := Kit.TOPBAR_H
	for pill in top_bar.find_children("*", "CarrotPill", true, false):
		if pill is Control and (pill as Control).is_visible_in_tree():
			bottom = maxf(bottom, _drawn_bottom(pill) - global_position.y)
	# EN RAID, SOUS LA PLAQUE DU NOM aussi : « Pas de hache » se posait sur
	# « Terrier de X » et les deux se lisaient l'un dans l'autre (2026-10-12).
	var plaque := RaidHud.bottom()
	if plaque > 0.0:
		bottom = maxf(bottom, plaque - global_position.y)
	# SOUS LE HAUT DU TERRIER, ou sous le plan de defense qui le remplace.
	if is_instance_valid(_plan):
		bottom = maxf(bottom, _plan.bottom() - global_position.y)
	elif is_instance_valid(_hud) and _hud.visible:
		bottom = maxf(bottom, _hud.position.y + _hud.size.y - global_position.y)
	toasts.offset_top = bottom + Kit.PAD_TIGHT


## LA PASTILLE A CAROTTES VISIBLE, pour ce qui doit y voler (la recolte).
## Null quand la barre ne la montre pas.
func carrot_pill() -> CarrotPill:
	for pill in top_bar.find_children("*", "CarrotPill", true, false):
		if pill is CarrotPill and (pill as CarrotPill).is_visible_in_tree():
			return pill
	return null


static func _drawn_bottom(node: Control) -> float:
	var y := node.get_global_rect().end.y
	for child in node.get_children():
		if child is Control and (child as Control).visible:
			y = maxf(y, _drawn_bottom(child))
	return y


# ── Les dialogues ────────────────────────────────────────────────────────────

## OUVRIR UN DIALOGUE : un voile sur tout l'ecran, le dialogue centre dessus,
## a Kit.EDGE du bord au moins. Un dialogue deja ouvert est ferme d'abord —
## un seul a la fois, comme le web.
##
## `dismiss` : le voile ferme au clic. Vrai pour tout ce qu'on consulte, faux
## pour ce qui attend une reponse (un paiement en cours).
##
## `placement` : "center" (un dialogue), ou "board" — le panneau de la
## saison dans le coin droit (globals.css `.rr-lb`), sans voile quand
## l'ecran a la place (`min-width: 860px`, `.rr-scrim { display: none }`) :
## rien n'est couvert, et un voile avalerait les taps destines au terrier.
func open(dialog: Control, dismiss: bool = true, placement: String = "center") -> void:
	# RELANCER passe avant tout : rien ne se pose sur le dialogue de mise a
	# jour, et rien ne le retire (voir `close_dialog`).
	if _dialog is UpdateDialog:
		dialog.queue_free()
		return
	close_dialog()
	_placement = placement
	_scrim = ColorRect.new()
	_scrim.color = Palette.SCRIM
	_scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	if placement == "board" and get_viewport_rect().size.x >= 860.0:
		_scrim.color = Color.TRANSPARENT
		_scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	else:
		# LE JEU FLOU DERRIERE LE VOILE, comme le web (`backdrop-filter:
		# blur(3px)`) : sans lui, le terrier assombri restait net et se
		# disputait l'oeil avec le dialogue.
		var blur := ShaderMaterial.new()
		blur.shader = SCRIM_BLUR
		blur.set_shader_parameter("veil", Palette.SCRIM)
		blur.set_shader_parameter("radius_px", 3.0 * get_viewport().get_final_transform().get_scale().x)
		_scrim.material = blur
	Kit.fill(_scrim)
	dialogs.add_child(_scrim)
	if dismiss:
		_scrim.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed:
				close_dialog())

	_dialog = dialog
	dialogs.add_child(dialog)
	dialog.set_anchors_preset(Control.PRESET_CENTER)
	_center_dialog()
	dialog.resized.connect(_center_dialog)
	# Et quand son MINIMUM retombe : un libelle mesure etroit au premier
	# passage le gonfle (1435px pour la liste des iles), Godot refuse ensuite
	# toute taille sous ce minimum, et rien d'autre ne le refait.
	dialog.minimum_size_changed.connect(_center_dialog)
	if dialog.has_signal("closed"):
		dialog.connect("closed", close_dialog)
	dialogs.mouse_filter = Control.MOUSE_FILTER_IGNORE if _scrim.mouse_filter == Control.MOUSE_FILTER_IGNORE \
		else Control.MOUSE_FILTER_STOP

	# L'arrivee du web (`rr-shop-in`, 140 ms) : le voile et le dialogue
	# montent en fondu ensemble.
	dialogs.modulate.a = 0.0
	create_tween().tween_property(dialogs, "modulate:a", 1.0, 0.14)
	Analytics.dialog_opened(dialog)
	_sync_top()


func _center_dialog() -> void:
	if _dialog == null:
		return
	var view := get_viewport_rect().size
	if _dialog.get("fullscreen") == true:
		var want: Vector2 = (_dialog as Dialog).hug_size() if _dialog is Dialog else Vector2.ZERO
		var screen := Dialog.screen_rect(view, want)
		_dialog.position = screen.position
		_dialog.size = screen.size
		return
	# Le [x] est DANS le cadre (Dialog `_place_close`) : rien ne deborde, le
	# cadre tient a la gouttiere du chrome de tous cotes.
	var side := Kit.EDGE
	var top := Kit.EDGE
	if _placement == "board":
		# `.rr-lb` : top clamp(52px, 13svh, 100px), bottom clamp(12px, 8svh,
		# 60px), width max(26vw, 220px), a la gouttiere du chrome a droite.
		var board_top := clampf(view.y * 0.13, 52.0, 100.0)
		var board_bottom := clampf(view.y * 0.08, 12.0, 60.0)
		# AU-DESSUS DU SOL : sur un telephone couche, le panneau descendait
		# sur la planche RAID et en cachait le mot (2026-09-23).
		if _loop != null and _loop.visible:
			board_bottom = maxf(board_bottom, Kit.EDGE + _loop.height() + Kit.PAD_TIGHT)
		# 280 au moins (le web disait 220) : a 231 au Seeker la liste n'avait
		# pas la place d'un nom, d'un podium et d'un score (2026-10-08).
		var board_w := minf(clampf(view.x * 0.3, BOARD_MIN, BOARD_MAX), view.x * 0.86)
		_dialog.custom_minimum_size = Vector2(board_w, 0.0)
		_dialog.size = Vector2(board_w, view.y - board_top - board_bottom)
		_dialog.position = Vector2(view.x - side - board_w, board_top)
		return
	var wanted := _dialog.get_combined_minimum_size()
	var w := minf(wanted.x, view.x - 2.0 * side)
	# Sur le MINIMUM seul : relire `size` gardait toute taille gonflee une
	# fois (un libelle mesure etroit au premier passage), et le dialogue
	# sortait de l'ecran.
	var h := minf(wanted.y, view.y - top - Kit.EDGE)
	_dialog.size = Vector2(w, h)
	var at := ((view - _dialog.size) * 0.5).floor()
	at.y = maxf(at.y, top)
	_dialog.position = at


func _on_server_updated() -> void:
	if not _dialog is UpdateDialog:
		open(UpdateDialog.new(), false)


func close_dialog() -> void:
	if _dialog is UpdateDialog and is_instance_valid(_dialog):
		return
	if _dialog != null:
		Analytics.dialog_closed()
		_dialog.queue_free()
		_dialog = null
	if _scrim != null:
		_scrim.queue_free()
		_scrim = null
	dialogs.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sync_top()


## LE HAUT DU TERRIER SE TAIT SOUS UN MENU (2026-10-14) : pose a l'ecran
## (`top_level`), il passait par-dessus le profil, le codex, la boutique.
## Le plan de BURY aussi ; sans menu, le plan tient la place du haut.
func _sync_top() -> void:
	var calm := _dialog == null
	if is_instance_valid(_plan):
		_plan.visible = calm
	if is_instance_valid(_hud):
		_hud.visible = calm and not is_instance_valid(_plan) and not _defending
	# L'etiquette de version (coin bas-droit) passait aussi sur le pied des
	# menus — le bouton KURO du codex au Seeker couche.
	if _version != null:
		_version.visible = calm and _mode.is_empty()


func dialog_open() -> bool:
	return _dialog != null


## QUOI DE NEUF. Vu des qu'il s'ouvre : un dialogue chasse par un autre, ou
## un lieu quitte, ne doit pas revenir a chaque arrivee.
func _open_whats_new() -> void:
	Changelog.mark_seen()
	if _version != null:
		_version.unseen = false
	open(WhatsNewDialog.from_changelog())


## A L'ARRIVEE au terrier, une fois le rideau ouvert et le decor pose — et
## seulement si rien d'autre n'est deja a l'ecran (consentement, boite
## surprise, vengeance) : `open` le chasserait. Sinon on reessaie a la
## prochaine arrivee, la version n'est pas marquee vue.
func _announce_whats_new() -> void:
	var tag := _version
	await get_tree().create_timer(1.5).timeout
	if tag != _version or not is_instance_valid(tag) or not tag.visible:
		return
	if dialog_open() or not Screens.in_world() or Screens.place != Screens.Place.BURROW or _raid_shown:
		return
	_open_whats_new()


## Un tampon plein ecran (niveau gagne, raid subi) : pose sur l'etage des
## overlays, il se retire lui-meme.
func stamp(node: Control) -> void:
	overlays.add_child(node)
	Kit.fill(node)


## Une fete qui doit passer DEVANT le dialogue ouvert (un achat, l'etal
## ouvert) : posee en dernier enfant du chrome, apres l'etage des dialogues.
func over_dialogs(node: Control) -> void:
	add_child(node)
	Kit.fill(node)


# ── Les sons ─────────────────────────────────────────────────────────────────

## CE QUE LE TERRIER FAIT ENTENDRE, pris aux signaux plutot qu'aux gestes :
## c'est la reponse du serveur qui sonne, pas le doigt (page.tsx). Les sons
## propres a un panneau (la quete, le jardin, les ceremonies) sont chez lui.
func _wire_sounds() -> void:
	# L'ILE A SA MUSIQUE, reprise du debut a chaque traversee ; le terrier
	# rend la main a l'ambiance (IslandScene `show` / `hide`).
	Screens.moved.connect(func(place: int) -> void:
		if place == Screens.Place.ISLAND:
			Sound.music("island")
		else:
			Sound.stop_music())
	Home.level_up.connect(func(_level: int) -> void: Sound.play("match"))
	Home.quest_claimed.connect(func(_id: String, _reward: Dictionary) -> void: Sound.play("match"))
	# Un piege achete fait le pas qu'il fera pose ; le reste de la boutique,
	# payee en carottes, le petit carillon.
	ShopState.shared().bought.connect(func(kind: String, _qty: int) -> void:
		Sound.play("step" if kind == "trap" else "chime_quick"))
	# La bombe d'un raid sonne avec son explosion (burrow.gd `_on_raid_sprung`),
	# pas a la reponse du serveur : le son partait 1 a 2 s avant le feu, le
	# temps que le saut du lapin se pose (2026-10-12).
	# Un raid perdu tombe ; un raid gagne a sa ceremonie, qui sonne elle-meme.
	RaidState.current.finished.connect(func(raid: Dictionary, _outcome: Dictionary) -> void:
		if not bool(raid.get("succeeded", false)):
			Sound.play("die"))
