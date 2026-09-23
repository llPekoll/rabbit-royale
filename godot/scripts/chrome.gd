class_name Chrome
extends Control
## LE CHROME — ce qui survit AU-DESSUS du monde : la barre du haut, la
## colonne du terrier, le sol aux trois verbes, les pastilles, les dialogues.
##
## Il vit dans l'etage `Chrome` de main.tscn, entre le monde et le rideau,
## pour la raison que ce fichier-la donne : un dialogue ouvert ne meurt pas
## parce que le sol a change dessous. Il est monte UNE FOIS par la racine et
## ne se recharge jamais ; ce sont ses pieces qui apparaissent et
## disparaissent avec le lieu.
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


func _ready() -> void:
	current = self
	visible = Screens.in_world()
	Screens.world_shown.connect(_on_world_shown)
	Screens.moved.connect(_on_moved)
	Home.noted.connect(toast)
	get_viewport().size_changed.connect(_measure)
	_measure()
	_mount()
	_dev_open()


## LES PANNEAUX, a leur etage. Chacun est une scene sous scenes/ui/ ; il
## lit Home, Session, GameSocket et Screens lui-meme, et se cache tout seul
## quand le lieu ne le concerne pas.
func _mount() -> void:
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

	_back = preload("res://scenes/ui/back_button.tscn").instantiate()
	floor_host.add_child(_back)
	_back.pressed.connect(_end_mode)

	# LA BARRE DU HAUT : le joueur, la pastille, le rail. Chaque bouton ouvre
	# son dialogue ; la pastille ouvre le grand livre du reservoir, et son +
	# la recharge (energy-panel.tsx / carrot-pill.tsx).
	var bar: TopBar = preload("res://scenes/ui/top_bar.tscn").instantiate()
	top_bar.add_child(bar)
	bar.profile_pressed.connect(func() -> void: Profile.open())
	bar.shop_pressed.connect(func() -> void: Shop.open())
	bar.story_pressed.connect(func() -> void: LoreCodex.open())
	bar.season_pressed.connect(func() -> void: SeasonBoard.open())
	bar.energy_tapped.connect(func() -> void: EnergyPanel.open())
	bar.add_pressed.connect(func() -> void: EnergyPopup.open())

	# Ce que la boutique et le raid repondent passe en pastille, comme Home.
	ShopState.shared().noted.connect(toast)
	RaidState.current.noted.connect(toast)
	_wire_sounds()
	# Les tampons qui s'annoncent seuls : le niveau gagne, le raid subi.
	LevelUpStamp.arm()
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
		"season": SeasonBoard.open()
		"codex": LoreCodex.open()
		"energy": EnergyPanel.open()
		"refill": EnergyPopup.open()
		"language": LanguageSelect.open()
		"islands":
			var picker := IslandPicker.new()
			open(picker)
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


## UNE PORTE DU SOL, qu'elle vienne d'une dalle ou de la ligne de la colonne.
func _on_door(door: String) -> void:
	match door:
		"dig":
			_dig()
		"defend":
			_start_mode("placing")
		"raid":
			TargetList.open()
		"shop":
			Shop.open()
		"energy":
			EnergyPopup.open()


## DIG. Le premier depart est le tutoriel, sans liste : le web traverse seul
## le nouveau venu vers sa premiere ile. Ensuite, la liste des iles.
##
## PAS DE `join` ICI (2026-09-23) : l'ile du portage (island.gd, Peko) ne joue
## encore que le plateau dessine, hors ligne. Demander un siege au serveur
## prendrait de l'energie pour une manche qu'aucun plateau ne montre. Choisir
## une ile traverse donc comme le bouton « → ILE » le faisait ; le `join` se
## branchera ici quand l'ile lira la socket.
func _dig() -> void:
	if Island.tutorial_pending():
		Screens.cross(Screens.Place.ISLAND)
		return
	var picker := IslandPicker.new()
	picker.chosen.connect(func(_choice: Dictionary) -> void:
		close_dialog()
		Screens.cross(Screens.Place.ISLAND))
	open(picker)


## UN MODE DU TERRIER (poser des pieges, des clotures) : la rangee du kit
## monte, la barre et la colonne s'effacent, le terrier prend son cadrage, et
## le retour s'affiche. La POSE au toucher n'est pas branchee : le terrier ne
## dessine pas encore les pieges, et un piege pose mais invisible est le
## mensonge que page.tsx refuse (`onToggleTrap`).
func _start_mode(mode: String) -> void:
	_mode = mode
	_kit.open(mode)
	_loop.visible = false
	_column.set_editing(true)
	_back.show_for(mode)
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", mode == "placing")
		burrow.call("set_walling", mode == "walling")


func _end_mode() -> void:
	if _mode.is_empty():
		return
	_mode = ""
	_kit.close()
	_back.dismiss()
	_column.set_editing(false)
	_loop.visible = true
	var burrow := Screens.at(Screens.Place.BURROW)
	if burrow != null and burrow.has_method("set_placing"):
		burrow.call("set_placing", false)
		burrow.call("set_walling", false)


func _on_world_shown(shown: bool) -> void:
	visible = shown
	if not shown:
		close_dialog()


func _on_moved(_place: int) -> void:
	# Un dialogue ouvert sur un lieu ne suit pas le joueur sur l'autre, ni un
	# mode du terrier.
	close_dialog()
	_end_mode()


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
	var note := Kit.caption(text, refused)
	note.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	toasts.add_child(note)
	var tween := create_tween()
	tween.tween_interval(TOAST_SECONDS)
	tween.tween_property(note, "modulate:a", 0.0, TOAST_FADE)
	tween.tween_callback(note.queue_free)


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
