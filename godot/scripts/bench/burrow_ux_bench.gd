extends Node2D
## LE TERRIER REPENSE — le squelette jouable, pour essayer l'UX avant le jeu.
##
##   godot --path godot scenes/bench/burrow_ux_bench.tscn
##   godot --path godot scenes/bench/burrow_ux_bench.tscn -- --seed=paul --size=890x400
##   (sans --size, la fenetre s'ouvre en 1335x600 : le Seeker couche, 890x400
##   logiques, a 1,5x pour le bureau)
##   ... -- --build=bombs --shot=b.png --after=3     # ouvert sur un onglet
##   ... -- --test --shot=t.png --after=6           # TESTER lance tout seul
##   ... -- --bar --shot=bar.png --after=3          # la barre au lieu des ilots
##   ... -- --islets                                # les ilots (la BARRE est le defaut)
##   ... -- --bar --variant=3                       # le haut : 1 a 7 (TOP_NAMES), 7 KIT 04 par defaut
##   ... -- --bar --tour=0                          # la visite, au pas 0 (V)
##
## « c'est repenser toute la partie burrow et la partie defend : quand les
## joueurs arrivent c'est pas ultra clair ce que tu dois faire » (2026-10-13).
## Le vrai terrier (burrow.tscn), hors ligne, avec la defense offerte d'un
## joueur neuf (5 bombes, 5 planches). Ce qui change :
##
##   1. LE TERRIER SE REGARDE. Hors mode, une tape ne deplace plus rien
##      (`Burrow.arrange_locked`) : elle dit ce qu'est la chose touchee.
##   2. UN SEUL MODE POUR LE MODIFIER : CONSTRUIRE, trois onglets — DECOR
##      (l'amenagement d'aujourd'hui), BOMBES, CLOTURES — et OK.
##   3. LE CHEMIN DU PILLARD, dessine en construisant : le moins cher de la
##      porte au potager, bombes et planches comprises, et ce qu'il lui coute
##      sur sa reserve de marche (RAID_RUN.STAKE - TOLL).
##   4. TESTER : un pillard le parcourt, les bombes sautent, et le verdict tombe.
##   5. ILOTS ou BARRE (touche B, bouton en haut a gauche) : les portes sur
##      leurs ilots (le jeu d'aujourd'hui), ou l'ancienne barre du sol
##      DIG ▸ DEFEND ▸ RAID (loop_bar.tscn, retiree par d654933) sans ilots,
##      la camera resserree sur le terrier. En BARRE, DEFEND ouvre le mode.
##
## Rien ne part au serveur : `ShopState.sandbox` fait reussir les poses sur
## place. Les ilots ne menent nulle part ici (pas de chrome).

const BURROW := preload("res://scenes/burrow.tscn")

enum Tab { DECOR, BOMBS, FENCES }
const TAB_NAMES := ["DECOR", "BOMBES", "CLOTURES"]
const TAB_HINTS := [
	"Touche un arbre, la maison ou le potager, puis la case ou le poser.",
	"Touche une case : une bombe. Encore : tu la reprends. Le pillard y perd %d ⚡.",
	"Touche un bord du potager : une planche. Le pillard doit faire le tour.",
]

## La defense offerte a un joueur neuf (src/lib/game/default-defence.ts).
const GIFT_BOMBS := 5
const GIFT_PLANKS := 5
## Ce qu'il reste en sac pour jouer avec.
const HELD_BOMBS := 3
const HELD_PLANKS := 3

const PATH_COLOR := Color("#ffb03a")
const HIT_COLOR := Color("#ff4a3a")

var _seed := "burrow"
var _burrow: Node2D
var _building := false
var _tab: int = Tab.BOMBS
var _testing := false
var _route := {}
var _route_clock := 0.0

var _build_btn: PlankButton
var _bar: PanelContainer
var _tab_btns: Array = []
var _hint: Label
var _score: Label
var _verdict: Label
var _test_btn: PlankButton
var _ok_btn: PlankButton
var _toast: PanelContainer
var _toast_text: Label
var _toast_tween: Tween
var _path_view: Node2D
var _bar_mode := true
var _loop: LoopBar
## Les dessins des ilots caches en BARRE, pour les rendre tels quels.
var _islets_hidden: Array = []
## LES CAROTTES RESTENT EN HAUT, sur une simple planche : le cadran est
## descendu sur DIG (LoopBar `dig_dial`).
var _carrots: Control
## LE HUD DU TERRIER, six propositions (burrow_hud_lab.gd) — touches 1 a 6,
## ou le bouton du banc en haut au centre.
const HUD_LAB := preload("res://scripts/bench/burrow_hud_lab.gd")
var _lab: Control
var _variant := HUD_LAB.KIT_04
var _variant_btn: PlankButton
var _column_host: Control
var _ui_root: Control
## Les etats d'essai demandes au lancement (`--full`, `--rich`, `--shield`).
var _states: Array = []
var _sign_style := 0
## TOUTE L'INTERFACE DU TERRIER, comme le chrome la monte (`_mount_place`) :
## la barre du haut, la quete, le volet de la maison, la version.
var _top: TopBar
var _column: BurrowColumn
var _house: HousePanel
var _version: VersionTag
const CARROTS_SIZE := Vector2(150, 40)
## La rangee des boutons du banc, depuis le bas : au-dessus du sol.
const BENCH_ROW_UP := 100.0
const SEEKER_WINDOW := Vector2i(1335, 600)
var _layout_btn: PlankButton
var _frame_map_saved: BurrowMap


func _ready() -> void:
	# LES ILOTS RESTENT AU BANC : le jeu les a eteints (Chrome.islets,
	# 2026-10-13), le banc les monte pour comparer — la BARRE les cache.
	Chrome.islets = true
	var open_tab := ""
	var auto_test := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			_seed = arg.trim_prefix("--seed=")
		elif arg.begins_with("--build="):
			open_tab = arg.trim_prefix("--build=")
		elif arg == "--test":
			auto_test = true
		elif arg == "--bar":
			_bar_mode = true
		elif arg == "--islets":
			_bar_mode = false
		elif arg.begins_with("--sign="):
			_sign_style = int(arg.trim_prefix("--sign=")) - 1
		elif arg.begins_with("--lang="):
			_bench_locale.call_deferred(arg.trim_prefix("--lang="))
		elif arg in ["--full", "--rich", "--shield"]:
			_states.append(arg.trim_prefix("--"))
		elif arg.begins_with("--variant="):
			_variant = clampi(int(arg.trim_prefix("--variant=")) - 1, 0, HUD_LAB.TOP_NAMES.size() - 1)
	Session.player = {"id": _seed}
	for st in _states:
		_fake_state.call_deferred(st)
	# HORS LIGNE POUR DE BON : sans ca, la premiere relecture (`Home.refresh`)
	# partait avec le jeton enregistre sur la machine et ramenait le VRAI
	# terrier du compte par-dessus le faux.
	Session.token = ""
	# UN JOUEUR DE NIVEAU 3 qui a deja joue : les quatre ilots sont sortis, la
	# barre a de quoi ecrire sur ses planches.
	Home.player = {"id": _seed, "level": 3}
	# Une quete en cours, pour que la colonne ait sa carte.
	Home.quest = {"active": Content.quest_view({
		"id": "break-ground", "door": "farm", "goal": Tuning.i("QUESTS.FIRST_DIG_TILES"),
		"progress": 4, "done": false,
		"reward": {"carrots": Tuning.i("QUESTS.CARROTS.break-ground")}, "index": 3, "total": 10,
	}), "claimable": 0, "claimed": 2, "total": 10}
	Home.burrow = {
		"level": 1, "maxLevel": 10, "stock": 240, "lifetime": 900,
		"gardenReady": 60, "energy": 220, "maxEnergy": 300, "nextEnergyInMs": 120000,
		"runCost": Tuning.i("ENERGY.MIN_TO_CROSS"), "crossingCost": Tuning.i("ENERGY.CROSSING_COST"),
		"nextRunInMs": 0, "yieldPerHour": 60, "regenPerHour": 32, "capHours": 8,
		"gardenCapacity": 480, "gardenCeiling": 480,
		"boosts": {"water": {"held": 0, "activeMs": null}, "fertiliser": {"held": 0, "activeMs": null}},
		"shieldMs": null, "upgradeCost": 900, "canUpgrade": false,
		"next": {"yieldPerHour": 75, "regenPerHour": 33}, "runs": 4,
	}
	Home.changed.emit()

	var shop := ShopState.shared()
	shop.fake([], {"held": HELD_BOMBS, "maxPlaced": 12})
	shop.sandbox = true

	_burrow = BURROW.instantiate()
	add_child(_burrow)
	_burrow.set("arrange_locked", true)
	_burrow.tile_tapped.connect(_on_tile)
	_burrow.get("_landmarks").door_pressed.connect(_on_landmark)

	_path_view = Node2D.new()
	_path_view.z_as_relative = false
	_path_view.z_index = 4000
	_path_view.draw.connect(_draw_route)
	_burrow.add_child(_path_view)

	_build_ui()
	_seeker_window()
	DevShot.arm(self)

	# LA DEFENSE OFFERTE, posee une fois le terrier dresse (les planches ont
	# besoin des aretes que FenceView vient de tracer).
	await get_tree().create_timer(0.3).timeout
	_gift_defence()
	_set_building(false)
	_set_bar_mode(_bar_mode)
	# La consigne de regarder, seulement la ou elle sert : en ILOTS (et la
	# barre d'avant), pas sous les propositions du labo qui disent tout.
	if not _bar_mode and int(_lab.get("_tour")) < 0:
		_toast_say("Ton terrier. Touche ce que tu veux pour savoir ce que c'est.")

	if open_tab != "" or auto_test:
		await get_tree().create_timer(0.4).timeout
		_set_building(true)
		var k := ["decor", "bombs", "fences"].find(open_tab)
		_set_tab(k if k >= 0 else Tab.BOMBS)
	if auto_test:
		await get_tree().create_timer(0.8).timeout
		_test()


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo) or _building:
		return
	if event.keycode == KEY_B:
		_set_bar_mode(not _bar_mode)
	elif event.keycode == KEY_F:
		_fake_state("full")
	elif event.keycode == KEY_M:
		_fake_state("rich")
	elif event.keycode == KEY_S:
		_fake_state("shield")
	elif event.keycode == KEY_L:
		# L : la langue suivante — BURY et le reste de l'ecran dans chacune.
		var codes: Array = I18N.LOCALES.map(func(l: Dictionary) -> String: return String(l["code"]))
		_bench_locale(String(codes[(codes.find(I18N.locale) + 1) % codes.size()]))
		_toast_say(I18N.locale)
	elif event.keycode >= KEY_1 and event.keycode < KEY_1 + HUD_LAB.TOP_NAMES.size():
		_select_variant(event.keycode - KEY_1)
	elif event.keycode == KEY_A:
		# A : comment l'enseigne (HAUT 3) dit qu'on la tape.
		_toast_say("ENSEIGNE : " + String(_lab.call("next_sign_style")))
	elif event.keycode == KEY_E:
		# E : l'entree du KIT 04 (les trois planches), encore.
		_lab.call("replay_entrance")
	elif event.keycode == KEY_V:
		# V : la visite de Shiro et Kuro, depuis le debut.
		_lab.call("replay_tour")


func _process(delta: float) -> void:
	# LA MER SUIT L'ILE SEULE EN BARRE. Le terrier la rebatit avec ses ilots
	# chaque fois qu'il les refait (`_rebuild_islets`, `_build`) — on repasse
	# derriere lui.
	if _bar_mode and _burrow != null:
		_hide_islets()
		var ocean: Node = _burrow.get("_ocean")
		var main = (_burrow.get("_terrain") as Node).get("map")
		if ocean != null and main != null and ocean.foam.map != main:
			ocean.build(main, _seed)
	if not _building:
		return
	_route_clock -= delta
	if _route_clock <= 0.0:
		_route_clock = 0.3
		_refresh_route()


# ---------------------------------------------------------------- la defense offerte

func _gift_defence() -> void:
	var shop := ShopState.shared()
	var layout := _layout()
	var bombs := _bomb_spots(layout, GIFT_BOMBS)
	shop.traps["placed"] = bombs.duplicate()
	shop.traps["armed"] = bombs.duplicate()

	var fences: FenceView = _burrow.get("_fences")
	var offers: Array = []
	for d in fences.get("_drawn"):
		offers.append(d["seg"])
	# Les planches les plus proches de la porte : celles qu'un pillard trouve.
	var door := Vector2(BurrowLayout.cell_of(layout.entrance))
	var sorted := offers.duplicate()
	sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return Vector2(BurrowLayout.cell_of(int(a["tile"]))).distance_squared_to(door) \
			< Vector2(BurrowLayout.cell_of(int(b["tile"]))).distance_squared_to(door))
	var planks: Array = []
	for seg in sorted:
		if planks.size() >= GIFT_PLANKS:
			break
		planks.append(seg)
		# LA REGLE DU PORTAIL : jamais le dernier passage.
		if _cheapest(layout, [], planks).is_empty():
			planks.pop_back()
	shop.fences = {"placed": planks, "spans": [], "offers": offers,
		"held": HELD_PLANKS, "maxHeld": HELD_PLANKS + GIFT_PLANKS}
	shop.changed.emit()


## Des cases minables entre la porte et le potager, pas collees entre elles.
static func _bomb_spots(layout: BurrowLayout, n: int) -> Array[int]:
	var garden := Vector2.ZERO
	for t in layout.field:
		garden += Vector2(BurrowLayout.cell_of(t))
	garden /= float(layout.field.size())
	var tiles: Array[int] = []
	for t in layout.walkable_tiles():
		var far := Vector2(BurrowLayout.cell_of(t)).distance_to(garden)
		if layout.is_trappable(t) and layout.kind(t) == BurrowLayout.Cell.GROUND \
				and far >= 2.0 and far <= 5.0:
			tiles.append(t)
	tiles.sort_custom(func(a: int, b: int) -> bool:
		return (a * 7919) % 101 < (b * 7919) % 101)
	var out: Array[int] = []
	for t in tiles:
		var apart := true
		for o in out:
			if Vector2(BurrowLayout.cell_of(t)).distance_to(Vector2(BurrowLayout.cell_of(o))) < 2.0:
				apart = false
		if apart:
			out.append(t)
		if out.size() >= n:
			break
	return out


# ---------------------------------------------------------------- les modes

func _set_building(on: bool) -> void:
	_building = on
	_build_btn.visible = not on and not _bar_mode and not _touring()
	_layout_btn.visible = not on
	if _loop != null:
		_loop.visible = not on and _bar_mode
		_show_chrome()
	_bar.visible = on
	_test_btn.visible = on
	_ok_btn.visible = on
	_verdict.visible = on
	_burrow.call("set_defend_kit", on)
	if on:
		_set_tab(_tab)
		_refresh_route()
	else:
		_burrow.call("arrange_cancel")
		_burrow.set("arrange_locked", true)
		_burrow.call("set_placing", false)
		_burrow.call("set_walling", false)
		_route = {}
		_path_view.queue_redraw()
		if _bar_mode:
			_frame_home()


func _set_tab(k: int) -> void:
	_tab = k
	_burrow.call("arrange_cancel")
	_burrow.set("arrange_locked", k != Tab.DECOR)
	_burrow.call("set_placing", k == Tab.BOMBS)
	_burrow.call("set_walling", k == Tab.FENCES)
	for i in _tab_btns.size():
		(_tab_btns[i] as Control).modulate = Color.WHITE if i == k else Color(1, 1, 1, 0.5)
	_hint.text = TAB_HINTS[k] % Tuning.i("TRAPS.DRAIN") if k == Tab.BOMBS else TAB_HINTS[k]
	_relabel_tabs()
	_hide_toast()
	_frame_whole()


## TOUT LE TERRIER SOUS LA BARRE, quel que soit l'onglet : le chemin va de la
## porte au potager, il doit tenir entier a l'ecran. La prise du raid
## (`BurrowCamera.board`) ; le terrier croit ensuite que le joueur a la main,
## et borne au lieu de recadrer.
func _frame_whole() -> void:
	await get_tree().process_frame
	var view := get_viewport_rect().size
	var terrain: Node2D = _burrow.get("_terrain")
	var top := _bar.get_global_rect().end.y + 4.0
	var shot: BurrowCamera.Shot = BurrowCamera.board(terrain.get("map"), view.x, view.y, top)
	var tween: Tween = _burrow.get("_cam_tween")
	if tween != null and tween.is_valid():
		tween.kill()
	_burrow.set("_cam_moved_by_player", true)
	var t := create_tween().set_parallel(true).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(_burrow, "scale", Vector2(shot.scale, shot.scale), 0.35)
	t.tween_property(_burrow, "position", shot.at, 0.35)
	t.finished.connect(_path_view.queue_redraw)


func _relabel_tabs() -> void:
	var shop := ShopState.shared()
	var bombs := (shop.traps.get("placed", []) as Array).size()
	var planks := (shop.fences.get("placed", []) as Array).size()
	(_tab_btns[Tab.DECOR] as PlankButton).relabel(TAB_NAMES[Tab.DECOR])
	(_tab_btns[Tab.BOMBS] as PlankButton).relabel("%s %d  ·  %d en sac" % [
		TAB_NAMES[Tab.BOMBS], bombs, int(shop.traps.get("held", 0))])
	(_tab_btns[Tab.FENCES] as PlankButton).relabel("%s %d  ·  %d en sac" % [
		TAB_NAMES[Tab.FENCES], planks, int(shop.fences.get("held", 0))])


## UNE TAPE HORS MODE : on dit ce qu'est la chose, on ne la bouge pas.
func _on_tile(cell: Vector2i) -> void:
	if _building or _testing:
		return
	var layout := _layout()
	var tile := BurrowLayout.index(cell)
	# 2 TOUCHE : la chose touchee ouvre sa carte.
	var kind := ""
	if layout.field.has(tile):
		kind = "garden"
	elif layout.building.x >= 0 and BurrowLayout.house_cells(layout.building).has(cell):
		kind = "house"
	elif ShopState.shared().traps.get("placed", []).has(tile):
		kind = "defence"
	if not kind.is_empty() and _lab != null and _lab.call("tile_tapped", kind):
		return
	if layout.field.has(tile):
		_toast_say("LE POTAGER — tes carottes poussent ici. Un pillard peut les voler tant que tu ne les as pas recoltees.")
	elif layout.building.x >= 0 and BurrowLayout.house_cells(layout.building).has(cell):
		_toast_say("TA MAISON — ouvrirait AMELIORER (plus de carottes, plus d'energie).")
	elif ShopState.shared().traps.get("placed", []).has(tile):
		_toast_say("UNE BOMBE — un pillard qui marche dessus perd %d ⚡. Pour la bouger : CONSTRUIRE." % Tuning.i("TRAPS.DRAIN"))
	elif not layout.is_walkable(tile):
		_toast_say("Pour deplacer le decor : CONSTRUIRE, onglet DECOR.")


# ---------------------------------------------------------------- ilots ou barre

func _set_bar_mode(on: bool) -> void:
	_bar_mode = on
	_layout_btn.relabel("BARRE" if on else "ILOTS")
	var landmarks: Node2D = _burrow.get("_landmarks")
	if landmarks != null:
		if on and landmarks.get("frame_map") != null:
			_frame_map_saved = landmarks.get("frame_map")
		# LES ILOTS PARTENT un dessin a la fois (`_hide_islets`, a chaque
		# image) : on les rend tels qu'on les a trouves.
		if not on:
			for n in _islets_hidden:
				if is_instance_valid(n):
					(n as CanvasItem).visible = true
			_islets_hidden.clear()
			# Eteinte ici, le terrier la rallume a l'image suivante, planches
			# des ilots comprises.
			landmarks.call("set_live", false)
		# La prise maison cadre les ilots (`_home_map`) : sans eux, l'ile seule.
		landmarks.set("frame_map", null if on else _frame_map_saved)
		# LA MER AUSSI : son ecume et ses hauts-fonds suivent la carte qu'on
		# lui donne (burrow.gd, `_ocean.build(_landmarks.sea_map)`) — sans
		# ilots, l'ile seule, sinon leurs bancs de sable restent dans l'eau.
		var terrain: Node2D = _burrow.get("_terrain")
		var sea = landmarks.get("sea_map")
		_burrow.get("_ocean").build(terrain.get("map") if on or sea == null else sea, _seed)
	# Le toast se pose au-dessus du sol quand il est la.
	_toast.offset_bottom = -Kit.EDGE - ((_loop.height() + Kit.PAD_TIGHT) if on else 0.0)
	_loop.visible = on and not _building
	_show_chrome()
	_build_btn.visible = not on and not _building and not _touring()
	if _building:
		return
	if on:
		_frame_home()
	else:
		_burrow.set("_cam_moved_by_player", false)
		_burrow.call("frame_camera")


## LA PRISE MAISON AU-DESSUS DE LA BARRE : l'ile seule, dans ce qui reste
## d'ecran une fois le sol pose (chrome.gd d'avant d654933, `board_bottom`).
func _frame_home() -> void:
	await get_tree().process_frame
	var view := get_viewport_rect().size
	var terrain: Node2D = _burrow.get("_terrain")
	var floor_h := _loop.height() + Kit.EDGE + Kit.PAD_TIGHT
	var shot: BurrowCamera.Shot = BurrowCamera.home(terrain.get("map"), view.x, view.y - floor_h)
	var tween: Tween = _burrow.get("_cam_tween")
	if tween != null and tween.is_valid():
		tween.kill()
	_burrow.set("_cam_moved_by_player", true)
	var t := create_tween().set_parallel(true).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(_burrow, "scale", Vector2(shot.scale, shot.scale), 0.35)
	t.tween_property(_burrow, "position", shot.at, 0.35)


## EN BARRE : les ilots, leurs ponts et leurs planches s'effacent, HARVEST
## du potager compris (il est dans l'interface, sous les carottes). Le terrier rallume les planches en sortant d'un
## mode (`set_live`), d'ou le passage a chaque image.
func _hide_islets() -> void:
	var landmarks: Node2D = _burrow.get("_landmarks")
	if landmarks == null:
		return
	for n in landmarks.get_children():
		if n is CanvasItem and (n as CanvasItem).visible:
			(n as CanvasItem).visible = false
			_islets_hidden.append(n)
	var signs: Dictionary = landmarks.get("_signs")
	for door in signs:
		(signs[door] as Control).visible = false


## HARVEST dans le banc : la recolte du jeu (Home `_harvest_now`), sans
## serveur. Depuis la planche du potager (ILOTS) ou le bouton sous les
## carottes (BARRE).
func _on_landmark(door: String) -> void:
	if door == "harvest":
		_harvest()


func _harvest() -> void:
	var garden := Home.live_garden()
	if garden <= 0:
		return
	Home._harvest_now(garden)
	_toast_say("+%s carottes rentrees." % I18N.group_digits(garden))


func _on_floor(door: String) -> void:
	match door:
		"dig":
			_toast_say("DIG — traverserait vers l'ile a creuser.")
		"raid":
			_toast_say("RAID — ouvrirait la liste des terriers a piller.")
		"defend":
			_set_building(true)


# ---------------------------------------------------------------- le chemin

func _layout() -> BurrowLayout:
	var l: BurrowLayout = _burrow.get("_layout")
	return l if l != null else BurrowLayout.of(_seed)


static func _walk_budget() -> int:
	return RaidRoute.budget()


func _refresh_route() -> void:
	var shop := ShopState.shared()
	_route = _cheapest(_layout(), shop.traps.get("placed", []), shop.fences.get("placed", []))
	_path_view.queue_redraw()
	_relabel_tabs()
	if _route.is_empty():
		_score.text = "Le potager est inaccessible — le jeu refuserait cette planche."
		_verdict.text = ""
		return
	var budget := _walk_budget()
	var steps: int = (_route.path as Array).size() - 1
	var hits: int = (_route.hits as Array).size()
	var cost: int = _route.cost
	_score.text = "Meilleur chemin du pillard : %d pas + %d bombe%s = %d / %d ⚡" % [
		steps, hits, "s" if hits > 1 else "", cost, budget]
	if cost >= budget:
		_verdict.text = "DEFENSE SOLIDE — il n'atteint pas le potager"
		_verdict.add_theme_color_override("font_color", Color("#8ee26f"))
	else:
		_verdict.text = "IL PASSE — il lui reste %d ⚡ en arrivant" % (budget - cost)
		_verdict.add_theme_color_override("font_color", Color("#ff8a5a"))


## LE CHEMIN LE MOINS CHER, passe en jeu (raid_route.gd).
static func _cheapest(layout: BurrowLayout, bombs: Array, planks: Array) -> Dictionary:
	return RaidRoute.cheapest(layout, bombs, planks)


## LE TRACE : des pas orange de la porte au potager, les bombes touchees
## cerclees de rouge.
func _draw_route() -> void:
	if _route.is_empty() or _testing:
		return
	var terrain: Node2D = _burrow.get("_terrain")
	var map = terrain.get("map")
	var pts := PackedVector2Array()
	for t in _route.path:
		var c := BurrowLayout.cell_of(int(t))
		pts.append(_path_view.to_local(terrain.to_global(map.screen_of(c.x, c.y))))
	if pts.size() >= 2:
		_path_view.draw_polyline(pts, Color(0, 0, 0, 0.35), 5.0, true)
		_path_view.draw_polyline(pts, PATH_COLOR, 2.5, true)
	for i in pts.size():
		_path_view.draw_circle(pts[i], 3.0 if i > 0 else 5.0, PATH_COLOR)
	for t in _route.hits:
		var i: int = (_route.path as Array).find(t)
		_path_view.draw_arc(pts[i], 9.0, 0.0, TAU, 24, HIT_COLOR, 2.5, true)
	_path_view.draw_arc(pts[pts.size() - 1], 7.0, 0.0, TAU, 24, Color.WHITE, 2.0, true)


# ---------------------------------------------------------------- TESTER

## UN PILLARD SUR LE MEILLEUR CHEMIN, pousse comme la socket le ferait :
## chaque pas coute, chaque bombe draine, et il s'arrete a sec.
func _test() -> void:
	if _testing or _route.is_empty():
		return
	_testing = true
	_burrow.call("arrange_cancel")
	_path_view.queue_redraw()
	for b in [_test_btn, _ok_btn] + _tab_btns:
		(b as Control).modulate.a = 0.4
	var path: Array = _route.path
	var hits: Array = _route.hits
	var energy := _walk_budget()
	var drain := Tuning.i("TRAPS.DRAIN")
	var inc := {"raidId": "ux-bench", "attacker": {"id": "a1", "name": "Kuro", "avatar": "black"},
		"tile": path[0], "energy": energy, "walked": [path[0]], "trapsSprung": 0,
		"finished": false, "succeeded": false, "struck": false, "carrotsLooted": 0}
	RaidState.current.fake({"incoming": inc.duplicate(true), "lightning": 0})
	var reached := false
	var walked := 0
	for i in range(1, path.size()):
		await get_tree().create_timer(0.5).timeout
		energy -= Tuning.i("RAID_RUN.STEP_COST")
		walked += 1
		inc.tile = path[i]
		(inc.walked as Array).append(path[i])
		if hits.has(path[i]):
			energy -= drain
			inc.trapsSprung = int(inc.trapsSprung) + 1
		inc.energy = maxi(0, energy)
		if energy <= 0:
			break
		if i == path.size() - 1:
			reached = true
		RaidState.current.fake({"incoming": inc.duplicate(true)})
	inc.finished = true
	inc.succeeded = reached
	inc.carrotsLooted = 40 if reached else 0
	RaidState.current.fake({"incoming": inc.duplicate(true)})
	if reached:
		_toast_say("KURO A ATTEINT TON POTAGER — il lui restait %d ⚡. Ajoute des bombes sur son chemin." % energy, 4.0)
	else:
		_toast_say("KURO S'EST EPUISE apres %d pas et %d bombe%s. Defense tenue !" % [
			walked, int(inc.trapsSprung), "s" if int(inc.trapsSprung) > 1 else ""], 4.0)
	await get_tree().create_timer(2.5).timeout
	RaidState.current.fake({"incoming": {}})
	_testing = false
	for b in [_test_btn, _ok_btn] + _tab_btns:
		(b as Control).modulate.a = 1.0
	_set_tab(_tab)
	_refresh_route()


# ---------------------------------------------------------------- l'interface

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	var root := Control.new()
	Kit.fill(root)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	_ui_root = root
	_make_loop(1.0)
	_build_chrome(root)
	_build_carrots(root)
	# LE BAS EST CHOISI (4 VISITE) ; on essaie le HAUT (TOP_NAMES).
	_lab.call("show_layout", VISITE)
	_lab.set("sign_style", _sign_style)
	_select_variant(_variant)
	# Ce que la boutique pose sur la planche DEFEND en jeu (kit_state.gd).
	ShopState.shared().changed.connect(_feed_loop)

	# L'AIGUILLAGE ILOTS / BARRE, en haut a gauche.
	_layout_btn = Kit.button("ILOTS", "gold", 96.0, 26.0)
	# LES BOUTONS DU BANC, en bas au centre au-dessus du sol : le haut et les
	# cotes sont a l'interface qu'on essaie.
	_layout_btn.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_layout_btn.offset_left = -(96.0 + 4.0 + 170.0) * 0.5
	_layout_btn.offset_right = -(96.0 + 4.0 + 170.0) * 0.5 + 96.0
	_layout_btn.offset_top = -BENCH_ROW_UP
	_layout_btn.offset_bottom = -BENCH_ROW_UP + 26.0
	_layout_btn.pressed.connect(func() -> void:
		if not _building:
			_set_bar_mode(not _bar_mode))
	root.add_child(_layout_btn)

	# HORS MODE : un seul bouton, en bas a droite.
	_build_btn = Kit.button("CONSTRUIRE", "green", 190.0, 44.0)
	_build_btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_build_btn.offset_left = -190.0 - Kit.EDGE
	_build_btn.offset_right = -Kit.EDGE
	_build_btn.offset_top = -44.0 - Kit.EDGE
	_build_btn.offset_bottom = -Kit.EDGE
	_build_btn.pressed.connect(func() -> void: _set_building(true))
	root.add_child(_build_btn)

	# EN MODE : les onglets en haut, la consigne et le chemin dessous.
	_bar = Kit.panel(Kit.style_glass())
	_bar.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_bar.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_bar.offset_top = Kit.EDGE
	root.add_child(_bar)
	var box := Kit.vbox(4.0)
	_bar.add_child(box)
	var tabs := Kit.hbox(4.0)
	tabs.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(tabs)
	for i in TAB_NAMES.size():
		var b := Kit.button(TAB_NAMES[i], "wood", 0.0, 32.0)
		b.custom_minimum_size.x = 200.0 if i > 0 else 110.0
		var at := i
		b.pressed.connect(func() -> void:
			if not _testing:
				_set_tab(at))
		tabs.add_child(b)
		_tab_btns.append(b)
	_hint = Kit.label("", 12, Palette.CREAM)
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.custom_minimum_size.x = 520.0
	box.add_child(_hint)
	_score = Kit.label("", 12, PATH_COLOR)
	_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_score)

	_verdict = Kit.label("", 14, Palette.CREAM, true)
	_verdict.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_verdict)

	_ok_btn = Kit.button("OK", "green", 96.0, 44.0)
	_ok_btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_ok_btn.offset_left = -96.0 - Kit.EDGE
	_ok_btn.offset_right = -Kit.EDGE
	_ok_btn.offset_top = -44.0 - Kit.EDGE
	_ok_btn.offset_bottom = -Kit.EDGE
	_ok_btn.pressed.connect(func() -> void:
		if not _testing:
			_set_building(false))
	root.add_child(_ok_btn)
	_test_btn = Kit.button("TESTER", "gold", 140.0, 44.0)
	_test_btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_test_btn.offset_left = -140.0 - (96.0 + 2.0 * Kit.EDGE)
	_test_btn.offset_right = -(96.0 + 2.0 * Kit.EDGE)
	_test_btn.offset_top = -44.0 - Kit.EDGE
	_test_btn.offset_bottom = -Kit.EDGE
	_test_btn.pressed.connect(_test)
	root.add_child(_test_btn)

	_toast = Kit.panel(Kit.style_glass())
	_toast.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_toast.offset_bottom = -Kit.EDGE
	_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast.modulate.a = 0.0
	root.add_child(_toast)
	_toast_text = Kit.label("", 12, Palette.CREAM)
	_toast_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_toast_text.custom_minimum_size.x = 420.0
	_toast_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.add_child(_toast_text)


func _hide_toast() -> void:
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast.modulate.a = 0.0


## LA VISITE EST EN COURS : ce qui est au banc (la consigne, CONSTRUIRE)
## se tait — sinon il passe dans le trou de lumiere, sur DEFEND et RAID.
func _touring() -> bool:
	return _lab != null and int(_lab.get("_tour")) >= 0


func _tour_running(on: bool) -> void:
	if _build_btn == null:
		return
	if on:
		_toast_hide()
	_build_btn.visible = not on and not _bar_mode and not _building


func _toast_hide() -> void:
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast.modulate.a = 0.0


func _toast_say(text: String, hold: float = 2.6) -> void:
	_toast_text.text = text
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast.modulate.a = 1.0
	_toast_tween = create_tween()
	_toast_tween.tween_interval(hold)
	_toast_tween.tween_property(_toast, "modulate:a", 0.0, 0.4)


## LA TAILLE DU SEEKER AU DEMARRAGE : 2670x1200 physiques, 890x400 logiques ;
## 1335x600 garde la meme mise en page (le viewport reste 890x400) en plus
## grand sur un ecran de bureau. Un `--size=` passe devant (DevShot).
func _seeker_window() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--size="):
			return
	var win := get_window()
	(func() -> void:
		win.mode = Window.MODE_WINDOWED
		win.size = SEEKER_WINDOW
		var screen := DisplayServer.screen_get_usable_rect(win.current_screen)
		win.position = screen.position + (screen.size - SEEKER_WINDOW) / 2).call_deferred()


func _build_carrots(root: Control) -> void:
	_carrots = Control.new()
	_carrots.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_carrots.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_carrots.offset_left = -CARROTS_SIZE.x * 0.5
	_carrots.offset_right = CARROTS_SIZE.x * 0.5
	_carrots.offset_top = Kit.EDGE
	_carrots.offset_bottom = Kit.EDGE + CARROTS_SIZE.y
	_carrots.visible = false
	root.add_child(_carrots)
	var cap := Kit.PLANK_CAP * CARROTS_SIZE.y / float(Kit.PLANK.get_height())
	var board := NineSlice.make(Kit.PLANK, Vector4i(Kit.PLANK_CAP, 0, Kit.PLANK_CAP, 0),
		Vector4(cap, 0, cap, 0), true)
	Kit.fill(board)
	_carrots.add_child(board)
	var row := Kit.hbox(Kit.PAD_TIGHT)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(row)
	_carrots.add_child(row)
	var figure := Kit.label("", 22, Palette.PILL_INK)
	figure.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(figure)
	var carrot := Kit.icon(Kit.ICONS["carrot"], 20.0)
	carrot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(carrot)
	var show := func() -> void:
		figure.text = I18N.group_digits(int(Home.burrow.get("stock", 0)))
	show.call_deferred()
	Home.changed.connect(show)
	var tick := Timer.new()
	tick.wait_time = 1.0
	tick.autostart = true
	tick.timeout.connect(show)
	_carrots.add_child(tick)



## LE CHROME DU TERRIER, sans Chrome : chaque piece est la vraie, nourrie par
## les faux Home/Session du banc. Ses boutons repondent par un toast.
func _build_chrome(root: Control) -> void:
	_top = preload("res://scenes/ui/top_bar.tscn").instantiate()
	_top.preview = true
	Kit.fill(_top)
	root.add_child(_top)
	_top.set_rank(59, 340)
	_top.set_season_open(false)
	_top.shop_pressed.connect(_toast_say.bind("SHOP — ouvrirait la boutique."))
	_top.story_pressed.connect(_toast_say.bind("HISTOIRE — ouvrirait l'histoire."))
	_top.season_pressed.connect(_toast_say.bind("SAISON — ouvrirait le classement."))
	_top.profile_pressed.connect(_toast_say.bind("PROFIL — ouvrirait le profil."))
	_top.energy_tapped.connect(_toast_say.bind("ENERGIE — ouvrirait le reservoir."))

	# Les cartes attendent l'ouverture de l'iris pour entrer : pas d'iris au
	# banc, elles resteraient hors champ.
	OS.set_environment("RR_NO_TOON", "1")
	_column = preload("res://scenes/ui/burrow_column.tscn").instantiate()
	_column.quest_only = true
	_column.always_shown = true
	_column_host = Control.new()
	_column_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	get_viewport().size_changed.connect(_place_column)
	root.add_child(_column_host)
	_column_host.add_child(_column)
	Kit.fill(_column)

	_house = BenchHouse.new()
	root.add_child(_house)

	# LE CHOIX DE LA VARIANTE, en haut au centre sous les carottes (BARRE).
	_variant_btn = Kit.button("", "gold", 170.0, 26.0)
	_variant_btn.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_variant_btn.offset_left = -(96.0 + 4.0 + 170.0) * 0.5 + 100.0
	_variant_btn.offset_right = -(96.0 + 4.0 + 170.0) * 0.5 + 270.0
	_variant_btn.offset_top = -BENCH_ROW_UP
	_variant_btn.offset_bottom = -BENCH_ROW_UP + 26.0
	_variant_btn.pressed.connect(func() -> void: _select_variant((_variant + 1) % HUD_LAB.TOP_NAMES.size()))
	root.add_child(_variant_btn)

	_lab = HUD_LAB.new()
	_lab.bench = self
	root.add_child(_lab)
	# Sous la barre du haut et les boutons du banc, au-dessus du terrier.
	root.move_child(_lab, _top.get_index())

	_version = VersionTag.new(Changelog.latest(), false)
	_version.top_level = true
	root.add_child(_version)
	_version.tapped.connect(_toast_say.bind("QUOI DE NEUF — ouvrirait le changelog."))


## Ce qui se montre selon le mode : en construction, rien que le mode ; en
## BARRE, la planche des carottes et HARVEST remplacent la pastille (son
## cadran est descendu sur DIG).
func _show_chrome() -> void:
	if _top == null or _lab == null:
		return
	var calm := not _building
	var bar := calm and _bar_mode
	_lab.set_active(bar)
	var want: Dictionary = _lab.call("wants") if bar else {}
	_top.visible = calm
	_top.pill.visible = not _bar_mode
	_carrots.visible = bar and want.get("carrots", true)
	_version.visible = calm
	_variant_btn.visible = bar
	_column.visible = calm and not (bar and bool(want.get("quest_hidden", false)))
	_house.visible = calm and (not bar or want.get("house", false))
	# Le sol : le cadran de DIG a la taille que la proposition demande.
	var grow := float(want.get("dial_grow", 1.0))
	var rise := float(want.get("dial_rise", 0.0))
	if _loop != null and (not is_equal_approx(float(_loop.dial_grow), grow) or not is_equal_approx(float(_loop.dial_rise), rise)):
		_make_loop(grow, rise)
	if _loop != null:
		_loop.visible = bar
	_place_column()


func _select_variant(k: int) -> void:
	_variant = k
	_variant_btn.relabel("HAUT %d %s ▸" % [k + 1, HUD_LAB.TOP_NAMES[k]])
	_lab.call("set_top", k)
	_show_chrome()


## Le labo a refait sa mise en page : la quete suit (6 LE MOMENT la pousse).
func _lab_changed() -> void:
	_place_column.call_deferred()


## LA COLONNE DE LA QUETE : a gauche comme le chrome (un quart de l'ecran,
## sous le rail), a droite quand la proposition y met la quete, et poussee
## sous la carte du MOMENT.
func _place_column() -> void:
	if _column_host == null:
		return
	var view := get_viewport().get_visible_rect().size
	var w := clampf(view.x * 0.25, 220.0, Chrome.COLUMN_MAX)
	var want: Dictionary = _lab.call("wants") if _lab != null and _lab.active else {}
	var right := bool(want.get("quest_right", false))
	_column_host.anchor_left = 1.0 if right else 0.0
	_column_host.anchor_right = 1.0 if right else 0.0
	_column_host.anchor_top = 0.0
	_column_host.anchor_bottom = 1.0
	_column_host.offset_left = (-Kit.EDGE - w) if right else Kit.EDGE
	_column_host.offset_right = -Kit.EDGE if right else Kit.EDGE + w
	_column_host.offset_top = TopBar.rail_bottom(view) + Kit.PAD_TIGHT + float(want.get("quest_drop", 0.0))
	_column_host.offset_bottom = -Kit.EDGE


## LE SOL : DIG (sur le cadran) ▸ DEFEND ▸ RAID. Ses options se lisent a la
## naissance : on le refait quand la taille du cadran change.
## LA LANGUE DU BANC, sans l'enregistrer (`I18N.set_locale` la garde pour
## le vrai jeu de cette machine).
func _bench_locale(code: String) -> void:
	I18N.locale = code
	I18N._apply_theme_face()
	I18N.locale_changed.emit(code)
	if _loop != null:
		_make_loop(float(_loop.dial_grow), float(_loop.dial_rise))


## La proposition du labo retenue au tour 2 (« j'aime 4 VISITE »).
const VISITE := 3


func _make_loop(grow: float, rise: float = 0.0) -> void:
	var was_visible := false
	if _loop != null:
		was_visible = _loop.visible
		_loop.queue_free()
	_loop = preload("res://scenes/ui/loop_bar.tscn").instantiate()
	_loop.bench_mode = true
	_loop.dig_dial = true
	_loop.dial_grow = grow
	_loop.dial_rise = rise
	# Les reglages du jeu (chrome.gd) : « ca touche le cote » (2026-10-13).
	_loop.dial_left = Chrome.DIAL_LEFT if grow > 1.0 else 0.0
	# BURY a la place de DEFEND, au dictionnaire depuis le passage en jeu.
	_loop.bury = true
	_ui_root.add_child(_loop)
	_ui_root.move_child(_loop, 0)
	_loop.dig_pressed.connect(_on_floor.bind("dig"))
	_loop.defend_pressed.connect(_on_floor.bind("defend"))
	_loop.raid_pressed.connect(_on_floor.bind("raid"))
	_loop.visible = was_visible
	_feed_loop()


func _feed_loop() -> void:
	if _loop == null:
		return
	var traps: Dictionary = ShopState.shared().traps
	_loop.set_defence((traps.get("placed", []) as Array).size(), int(traps.get("held", 0)))


## LES ETATS D'ESSAI, pour voir ce que chaque proposition dit quand il y a
## quelque chose a dire : F le potager plein, M mille carottes (AMELIORER
## payable), S un bouclier de 45 min (on/off).
func _fake_state(kind: String) -> void:
	var b := Home.burrow
	match kind:
		"full":
			b["gardenReady"] = int(b.get("gardenCeiling", b.get("gardenCapacity", 480)))
			b["gardenFullInMs"] = 0
		"rich":
			b["stock"] = int(b.get("stock", 0)) + 1000
			b["canUpgrade"] = true
		"shield":
			var on: bool = b.get("shieldMs") != null and float(b.get("shieldMs")) > 0.0
			b["shieldMs"] = null if on else 45 * 60000
	Home._fetched_ms = Time.get_ticks_msec()
	Home.changed.emit()


## AMELIORER dans le banc : le niveau suivant, paye en carottes, sans serveur.
func _upgrade() -> void:
	var b := Home.burrow
	var cost: Variant = b.get("upgradeCost", null)
	if cost == null or int(b.get("stock", 0)) < int(cost):
		_toast_say("Pas assez de carottes.")
		return
	b["stock"] = int(b["stock"]) - int(cost)
	b["level"] = int(b.get("level", 1)) + 1
	var next: Variant = b.get("next", null)
	if next is Dictionary:
		b["yieldPerHour"] = int(next.get("yieldPerHour", b["yieldPerHour"]))
		b["regenPerHour"] = int(next.get("regenPerHour", b["regenPerHour"]))
	b["upgradeCost"] = int(cost) * 2
	b["canUpgrade"] = int(b["stock"]) >= int(b["upgradeCost"])
	Home.changed.emit()
	_toast_say("TERRIER NIVEAU %d." % int(b["level"]))


## OU SONT LES CHOSES A L'ECRAN, pour les puces de 2 TOUCHE : le centre
## d'une case (BurrowMap `screen_of` donne son coin haut), puis la maison
## (le milieu de ses quatre cases) et la plus haute des bombes.
func _cell_screen(cell: Vector2i) -> Vector2:
	var terrain: Node2D = _burrow.get("_terrain")
	var map: BurrowMap = terrain.get("map")
	var at := map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	return terrain.get_global_transform_with_canvas() * at


func _house_screen_spot() -> Vector2:
	var layout := _layout()
	if layout == null or layout.building.x < 0:
		return Vector2(-1, -1)
	var sum := Vector2.ZERO
	var cells: Array = BurrowLayout.house_cells(layout.building)
	for c: Vector2i in cells:
		sum += _cell_screen(c)
	return sum / float(cells.size())


func _bomb_screen_spots() -> Array:
	var out: Array = []
	for tile in ShopState.shared().traps.get("placed", []):
		out.append(_cell_screen(BurrowLayout.cell_of(int(tile))))
	# La plus proche du centre : celles du bord passent sous la barre du haut.
	var mid := get_viewport().get_visible_rect().size * 0.5
	out.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.distance_to(mid) < b.distance_to(mid))
	return out


## LE VOLET DE LA MAISON hors chrome : le jeu le cache tant que la colonne du
## chrome ne se montre pas ; ici il suit le banc.
class BenchHouse extends HousePanel:
	func _place() -> void:
		if not is_instance_valid(_panel):
			return
		var rail := _rail_rect()
		var right := rail.end.x if rail.has_area() else get_viewport_rect().size.x - Kit.EDGE
		var top := (rail.end.y if rail.has_area() else Kit.TOPBAR_H) + _s(GAP)
		var want := _panel.get_combined_minimum_size()
		_panel.size = Vector2(maxf(_s(PANEL_W), want.x), want.y)
		_panel.global_position = Vector2(right - _panel.size.x, top).round()
		_button.size = _button.get_combined_minimum_size()
		_button.global_position = Vector2(right - _button.size.x, top).round()
