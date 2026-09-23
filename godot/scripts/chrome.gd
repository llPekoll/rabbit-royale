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

## Le diametre DESSINE du [x] (close-default.webp a l'ecran), sous sa zone
## de tap de Kit.CLOSE_TAP.
const CLOSE_ART := 30.0

## Combien de temps une pastille reste, et son fondu.
const TOAST_SECONDS := 3.2
const TOAST_FADE := 0.35

@onready var column: Control = %Column
@onready var floor_host: Control = %Floor
@onready var top_bar: Control = %TopBar
@onready var toasts: VBoxContainer = %Toasts
@onready var overlays: Control = %Overlays
@onready var dialogs: Control = %Dialogs

const SCRIM_BLUR := preload("res://shaders/scrim_blur.gdshader")

var _scrim: ColorRect
var _dialog: Control
var _placement := "center"

var _column: BurrowColumn
var _loop: LoopBar
var _kit: KitRow
var _back: BackButton
## Le mode du terrier en cours ("placing", "walling"), vide sinon.
var _mode := ""
## NETTOYER LA BASE, en DEFEND : a la place de la colonne, qui s'efface.
var _clean: PlankButton
var _clean_armed := false
## LE PLATEAU MONTRE UN RAID (burrow.gd `show_raid`) — pas « RaidState en a
## un » : entre les deux, il y a le rideau, et le chrome tourne au noir.
var _raid_shown := false
## Pour la pastille, qui montre la jauge du raid tant que le plateau est la.
signal _raid_changed
## LA RECOLTE ENCAISSEE LOIN DU TERRIER (`banked` sur l'ile). La barre du sol
## n'existe pas la-bas : c'est le chrome qui la garde, et la lui rend quand le
## rideau s'est rouvert sur le terrier.
var _pending_haul := 0


func _ready() -> void:
	current = self
	visible = Screens.in_world()
	Screens.world_shown.connect(_on_world_shown)
	Screens.moved.connect(_on_moved)
	Home.noted.connect(toast)
	Screens.changed.connect(_hand_haul)
	GameSocket.event.connect(_on_socket_event)
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
	# son dialogue ; la pastille ouvre le grand livre du reservoir, et son +
	# la recharge (energy-panel.tsx / carrot-pill.tsx).
	var bar: TopBar = preload("res://scenes/ui/top_bar.tscn").instantiate()
	top_bar.add_child(bar)
	bar.profile_pressed.connect(func() -> void: Profile.open())
	bar.shop_pressed.connect(func() -> void: Shop.open())
	bar.story_pressed.connect(func() -> void: LoreCodex.open())
	bar.season_pressed.connect(_open_season)
	_wire_bag()
	bar.energy_tapped.connect(func() -> void: EnergyPanel.open())
	bar.add_pressed.connect(func() -> void: EnergyPopup.open())

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
	hud.open_shop.connect(func() -> void: Shop.open())
	_wire_run(bar)

	# Ce que la boutique et le raid repondent passe en pastille, comme Home.
	ShopState.shared().noted.connect(toast)
	RaidState.current.noted.connect(toast)
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
	state.me_changed.connect(feed)
	state.rabbits_changed.connect(feed)
	state.volcano_changed.connect(feed)
	# SCREENS ET RAIDSTATE SURVIVENT AU CHROME : une lambda branchee sur eux
	# lui survivrait aussi, et le premier signal apres le retour a l'accueil
	# appelait une instance morte (tools/verify_scene_flow.gd). Une METHODE
	# se debranche seule quand le chrome meurt.
	_feed_run = feed
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
	_kit = null
	_back = null

	if not Screens.in_world() or Screens.place != Screens.Place.BURROW:
		return
	# EN RAID, le terrier est le plateau d'un autre : ni colonne, ni DIG sous
	# le doigt — la barre du raid decrit le lieu ou l'on se tient vraiment
	# (page.tsx : `crossing || shownRaid ? null : …`). Elle se cache seule.
	if _raid_shown:
		floor_host.add_child(preload("res://scenes/ui/raid_hud.tscn").instantiate())
		return

	# LA COLONNE, a gauche sous la barre. Sa ligne « et maintenant » pointe
	# une porte du sol : meme routage que les trois dalles.
	var column_card: BurrowColumn = preload("res://scenes/ui/burrow_column.tscn").instantiate()
	column.add_child(column_card)
	Kit.fill(column_card)
	column_card.next_action.connect(_on_door)
	_column = column_card

	# LE SOL : les trois verbes, la rangee du kit qui monte a la place de la
	# barre en DEFEND, et la sortie du mode.
	_loop = preload("res://scenes/ui/loop_bar.tscn").instantiate()
	floor_host.add_child(_loop)
	_loop.dig_pressed.connect(_on_door.bind("dig"))
	_loop.defend_pressed.connect(_on_door.bind("defend"))
	_loop.raid_pressed.connect(_on_door.bind("raid"))

	_kit = preload("res://scenes/ui/kit_row.tscn").instantiate()
	floor_host.add_child(_kit)
	_kit.buy_trap_pressed.connect(func() -> void: ShopState.shared().buy("trap"))
	_kit.use_shield.connect(func() -> void: ShopState.shared().buy("shield"))
	# LES CASES DU KIT CHANGENT LE MODE DU PLATEAU (page.tsx : `startPlacing`,
	# `startWalling`, `inspect`). Non branchees, la case cloture ouvrait sa
	# carte et le plateau restait en pose de bombes : aucune planche a viser.
	_kit.start_placing.connect(_switch_mode.bind("placing"))
	_kit.start_walling.connect(_switch_mode.bind("walling"))
	_kit.inspect.connect(_switch_mode.bind("inspect"))
	# LA RANGEE SUIT L'ETAL : une bombe ou une planche posee passe par
	# ShopState, qui relit le serveur — la carte du kit, elle, gardait sa
	# lecture d'ouverture (« 3 available · 0 placed » apres trois planches).
	# `_mount_place` repasse a chaque arrivee : on ne branche qu'une fois.
	if not ShopState.shared().changed.is_connected(_feed_kit):
		ShopState.shared().changed.connect(_feed_kit)

	_back = preload("res://scenes/ui/back_button.tscn").instantiate()
	floor_host.add_child(_back)
	_back.pressed.connect(_end_mode)

	# Le HUD de defense (un raid en cours chez soi) se montre seul.
	floor_host.add_child(preload("res://scenes/ui/defend_hud.tscn").instantiate())


## `-- --open=<surface>` : ouvre une surface une fois le terrier lu, pour
## qu'une capture (DevShot) la trouve sans main. Outil, pas comportement.
func _dev_open() -> void:
	var what := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--open="):
			what = arg.trim_prefix("--open=")
	if what.is_empty():
		return
	while not (Home.loaded() and Screens.in_world()):
		await Home.changed
	await get_tree().create_timer(1.0).timeout
	match what:
		"shop": Shop.open()
		"profile": Profile.open()
		"season": _open_season()
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
		"bombs": int(shop.item("bomb").get("held", 0))})


func _on_bag_spent(name: String, data: Variant) -> void:
	if name == "bomb_planted" or (name == "lightning_struck" and data is Dictionary \
			and String(data.get("castBy", "")) == RunState.current.my_id()):
		ShopState.shared().refresh()


## LE TABLEAU DE SAISON, et sa porte vers l'ile des autres : « regarder » une
## ligne qui creuse fait traverser en spectateur (page.tsx `spectate`). Sans
## siege et sans cout — le serveur pose son instantane, sans lapin a moi.
func _open_season() -> void:
	var board := SeasonBoard.open()
	board.spectate.connect(func(id: String) -> void:
		close_dialog()
		RunState.current.spectate(id)
		if Screens.place != Screens.Place.ISLAND:
			Screens.cross(Screens.Place.ISLAND))


## LES RAIDS SONT-ILS OUVERTS A CE LAPIN ? Niveau lu sur /api/burrow ; un
## terrier pas encore charge laisse passer (le serveur tranche).
static func raids_open() -> bool:
	var level: Variant = Home.player.get("level")
	return level == null or int(level) >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 10)


## UNE PORTE DU SOL, qu'elle vienne d'une dalle ou de la ligne de la colonne.
func _on_door(door: String) -> void:
	match door:
		"dig":
			_dig()
		"defend":
			_start_mode("placing")
		"raid":
			# PAS DE RAID AVANT LE NIVEAU 10, dans les deux sens (2026-09-23) :
			# le serveur refuse de toute facon ; ici on dit pourquoi.
			if not Chrome.raids_open():
				toast(I18N.f("rabbitLevel.raidLocked", [Tuning.i("RABBIT_LEVELS.RAID_MIN", 10)]), true)
				return
			TargetList.open()
		"shop":
			Shop.open()
		"energy":
			EnergyPopup.open()


## DIG. Pas de liste : le SERVEUR choisit l'ile au niveau du lapin (1 a 10,
## 2026-09-23 — seul jusqu'au 5, a deux du 6 au 9, jusqu'a quatre au 10). Le
## tutoriel reste a part : son plateau est dessine, et il traverse sans siege
## hors ligne.
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
			Sound.deny()
			EnergyPopup.open()
			return
	RunState.current.join(null)
	Screens.cross(Screens.Place.ISLAND)


## UN RAID SUR NOTRE TERRIER commence ou finit (burrow.gd). La grille monte
## seule — un raid est LE moment ou une bombe vaut d'etre enterree, et le
## joueur n'a pas a chercher le bouton — et ce qui etait ouvert descend : la
## liste des cibles, le codex, l'energie restaient par-dessus la defense
## (page.tsx, l'effet du defenseur). A la fin, le mode pose se referme.
func defend(on: bool, finished: bool = false) -> void:
	if on:
		close_dialog()
		if _mode != "placing" and not finished:
			_start_mode("placing")
	elif _mode == "placing":
		_end_mode()


## LE PLATEAU DU RAID vient de monter, ou de redescendre (burrow.gd, au noir
## du rideau). Le chrome tourne AU MEME INSTANT que le plateau : la barre du
## raid au-dessus de notre propre jardin, ou DIG sous le sol d'un autre,
## c'etait le bug du web avant `shownRaid`.
func show_raid(on: bool) -> void:
	if _raid_shown == on:
		return
	_raid_shown = on
	close_dialog()
	_end_mode()
	_mount_place()
	_raid_changed.emit()


## UN MODE DU TERRIER (poser des pieges, des clotures) : la rangee du kit
## monte, la barre et la colonne s'effacent, le terrier prend son cadrage, et
## le retour s'affiche. La pose elle-meme est au terrier (burrow.gd
## `_toggle_trap`) : une tape sur une case minable, le serveur d'abord.
func _start_mode(mode: String) -> void:
	if _kit == null:
		return
	_mode = mode
	_kit.open(mode)
	_loop.visible = false
	_column.set_editing(true)
	_back.show_for(mode)
	_mount_clean()
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", mode == "placing")
		burrow.call("set_walling", mode == "walling")


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
## En haut a gauche, a la place de la colonne qui s'efface en DEFEND ; montre
## seulement s'il y a quelque chose a retirer — un bouton qui ne fait rien est
## pire que pas de bouton. DEUX APPUIS : le premier demande « sur ? » trois
## secondes, le second nettoie — rien ne se perd, mais une defense entiere se
## defait d'un coup.
func _mount_clean() -> void:
	_drop_clean()
	_clean = preload("res://scenes/plank_button.tscn").instantiate()
	_clean.custom_minimum_size = Vector2(0, 44)
	column.add_child(_clean)
	_clean.position = Vector2(0, Kit.PAD_TIGHT)
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
	_clean.relabel(I18N.shout(I18N.t("defend.cleanSure" if _clean_armed else "defend.clean")))
	_clean.size = _clean.get_combined_minimum_size()


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


## CHANGER DE MODE SANS REFERMER LA RANGEE : c'est elle qui vient de le
## demander, sa case est deja choisie. « inspect » suspend le plateau (ni pose
## ni cloture) mais garde la rangee et le retour.
func _switch_mode(mode: String) -> void:
	if _kit == null or _mode.is_empty() or _mode == mode:
		return
	_mode = mode
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", mode == "placing")
		burrow.call("set_walling", mode == "walling")


func _end_mode() -> void:
	if _mode.is_empty():
		return
	_mode = ""
	_drop_clean()
	if _kit != null:
		_kit.close()
		_back.dismiss()
		_column.set_editing(false)
		_loop.visible = true
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", false)
		burrow.call("set_walling", false)


## `banked` pendant que la barre du sol n'existe pas : on garde. Au terrier,
## la barre ecoute elle-meme et montre sur-le-champ.
func _on_socket_event(name: String, data: Variant) -> void:
	if name != "banked" or not (data is Dictionary) or _loop != null:
		return
	_pending_haul = int((data as Dictionary).get("carrots", 0))


func _hand_haul() -> void:
	if _pending_haul <= 0 or _loop == null or Screens.crossing:
		return
	_loop.show_haul(_pending_haul)
	_pending_haul = 0


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
	# Un dialogue ouvert sur un lieu ne suit pas le joueur sur l'autre, ni un
	# mode du terrier.
	close_dialog()
	_end_mode()
	_mount_place()


## LA MISE EN PAGE (globals.css) : la barre du haut est une bande epinglee
## de TOPBAR_H ; la colonne prend max(25vw, 220px) a gauche, sous la barre ;
## le sol est une bande en bas ; les pastilles se centrent sous la barre.
func _measure() -> void:
	var view := get_viewport_rect().size
	top_bar.offset_bottom = Kit.TOPBAR_H

	var column_w := maxf(view.x * 0.25, 220.0)
	column.offset_left = Kit.EDGE
	column.offset_top = Kit.TOPBAR_H
	column.offset_right = Kit.EDGE + column_w
	column.offset_bottom = -Kit.EDGE

	toasts.offset_top = Kit.TOPBAR_H + Kit.PAD_TIGHT
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
	toasts.offset_top = bottom + Kit.PAD_TIGHT


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


func _center_dialog() -> void:
	if _dialog == null:
		return
	# LA PLACE DU [x]. Il deborde du coin du cadre (Dialog.CLOSE_OVER_*) ; un
	# dialogue etire a Kit.EDGE des bords le poussait hors de l'ecran, et sur
	# 400px de haut c'est tous les dialogues. Le cadre recule donc de ce
	# debordement, en haut et des deux cotes pour rester centre.
	var view := get_viewport_rect().size
	if _dialog.get("fullscreen") == true:
		_dialog.position = Vector2.ZERO
		_dialog.size = view
		return
	if _placement == "board":
		# `.rr-lb` : top clamp(52px, 13svh, 100px), bottom clamp(12px, 8svh,
		# 60px), right --rr-edge, width max(26vw, 220px).
		var board_top := clampf(view.y * 0.13, 52.0, 100.0)
		var board_bottom := clampf(view.y * 0.08, 12.0, 60.0)
		var board_w := minf(maxf(view.x * 0.26, 220.0), view.x * 0.86)
		_dialog.custom_minimum_size = Vector2(board_w, 0.0)
		_dialog.size = Vector2(board_w, view.y - board_top - board_bottom)
		_dialog.position = Vector2(view.x - Kit.EDGE - board_w, board_top)
		return
	# Le dessin du [x] est plus petit que sa zone de tap (Kit.CLOSE_TAP) :
	# seul le DESSIN doit rester a l'ecran, d'ou le retrait de cette marge.
	var slack := (Kit.CLOSE_TAP - CLOSE_ART) * 0.5
	var side := maxf(Kit.EDGE, -Dialog.CLOSE_OVER_RIGHT - slack + 4.0)
	var top := maxf(Kit.EDGE, -Dialog.CLOSE_OVER_TOP - slack + 4.0)
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


func close_dialog() -> void:
	if _dialog != null:
		_dialog.queue_free()
		_dialog = null
	if _scrim != null:
		_scrim.queue_free()
		_scrim = null
	dialogs.mouse_filter = Control.MOUSE_FILTER_IGNORE


func dialog_open() -> bool:
	return _dialog != null


## Un tampon plein ecran (niveau gagne, raid subi) : pose sur l'etage des
## overlays, il se retire lui-meme.
func stamp(node: Control) -> void:
	overlays.add_child(node)
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
	RaidState.current.sprung.connect(func(_tile: int) -> void: Sound.play("explosion"))
	# Un raid perdu tombe ; un raid gagne a sa ceremonie, qui sonne elle-meme.
	RaidState.current.finished.connect(func(raid: Dictionary, _outcome: Dictionary) -> void:
		if not bool(raid.get("succeeded", false)):
			Sound.play("die"))
