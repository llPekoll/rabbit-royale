extends Node
## LE TEST DE BOUT EN BOUT A DEUX — un des deux joueurs.
##
##   bun run tools/e2e/duo.ts        (lance le serveur de scene, les deux
##                                    fenetres, et joue le scenario)
##
## Le VRAI jeu (main.tscn), joue par une main qu'on voit (bench_hand.gd) :
## chaque geste est un clic pousse dans le viewport, recu comme celui d'un
## joueur. Ce script ne joue jamais a la place du jeu ; il CHOISIT ou taper.
## Pour choisir sur une ile en ligne, il demande au chef d'orchestre ou sont
## les bombes et les coffres (l'oracle du banc, `__stage where`).
##
## Le chef d'orchestre (tools/e2e/duo.ts) parle par fichiers, dans `--bus=` :
##   cmd.json    {seq, op, args}           ce qu'il demande
##   ack.json    {seq, ok, notes, result}  ce que le joueur a fait
##   state.json  ou en est le joueur (relu toutes les 0,5 s)
##   want.txt / where.json                 l'oracle de l'ile jouee
## Un geste qui n'aboutit pas laisse une capture <seq>-<quoi>.png dans le bus.

const BEAT_S := 0.22
const LESSON_BEAT_S := 0.4

var _hand: BenchHand
var _main: Node
var _bus := ""
var _tag := "?"
var _seq := -1
var _op := ""
## Ce que l'operation en cours a remarque : repris dans l'ack, puis au rapport.
var _notes: Array[String] = []
var _result: Dictionary = {}
var _deadline := 0
var _last_run: Dictionary = {}
var _wired_run := false
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--bus="):
			_bus = arg.trim_prefix("--bus=")
		elif arg.begins_with("--tag="):
			_tag = arg.trim_prefix("--tag=")
	_rng.seed = hash(_tag) ^ Time.get_ticks_usec()
	_main = preload("res://scenes/main.tscn").instantiate()
	add_child(_main)
	_hand = BenchHand.new()
	_hand.layer = 110
	add_child(_hand)
	var pump := Timer.new()
	pump.wait_time = 0.5
	pump.autostart = true
	pump.timeout.connect(_write_state)
	add_child(pump)
	var live := Timer.new()
	live.wait_time = 4.0
	live.autostart = true
	live.timeout.connect(func() -> void: _snap_to(_bus + "/live.png"))
	add_child(live)
	_serve.call_deferred()


func _say(what: String) -> void:
	print("[e2e %s] %s" % [_tag, what])


func _note(what: String) -> void:
	_notes.append(what)
	_say("  · " + what)


# ── Le bus ──────────────────────────────────────────────────────────────────

func _read_json(name: String) -> Variant:
	var text := FileAccess.get_file_as_string(_bus + "/" + name)
	return JSON.parse_string(text) if not text.is_empty() else null


func _write_json(name: String, data: Variant) -> void:
	var tmp := _bus + "/." + name
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify(data))
	f.close()
	DirAccess.rename_absolute(tmp, _bus + "/" + name)


func _write_state() -> void:
	if _bus.is_empty():
		return
	var place := "title"
	if Screens.in_world():
		place = "island" if Screens.place == Screens.Place.ISLAND else "burrow"
	var run := RunState.current
	var raid := RaidState.current
	var dialog := ""
	if Chrome.current != null and Chrome.current.dialog_open():
		var d: Control = Chrome.current.get("_dialog")
		var s: Script = d.get_script() if d != null else null
		dialog = s.resource_path.get_file() if s != null else "?"
	_write_json("state.json", {
		"tag": _tag,
		"op": _op,
		"seq": _seq,
		"playerId": String(Session.player.get("id", "")),
		"name": String(Session.player.get("name", "")),
		"level": int(Home.player.get("level", 0)) if Home.loaded() else 0,
		"energy": int(Home.live_energy()["energy"]) if Home.loaded() else 0,
		"stock": int(Home.burrow.get("stock", 0)) if Home.loaded() else 0,
		"place": place,
		"crossing": Screens.crossing,
		"seed": run.seed if run != null else "",
		"onIsland": run != null and not run.me().is_empty(),
		"spectating": run.spectating if run != null else "",
		"inRaid": raid != null and raid.has_raid(),
		"incoming": raid != null and raid.has_incoming(),
		"dialog": dialog,
		"mode": String(Chrome.current.get("_mode")) if Chrome.current != null else "",
	})


func _serve() -> void:
	while true:
		await _wait(0.2)
		var cmd: Variant = _read_json("cmd.json")
		if not (cmd is Dictionary) or int(cmd.get("seq", -1)) <= _seq:
			continue
		_seq = int(cmd["seq"])
		_op = String(cmd.get("op", ""))
		_notes = []
		_result = {}
		var args: Dictionary = cmd.get("args", {}) if cmd.get("args") is Dictionary else {}
		_deadline = Time.get_ticks_msec() + int(float(args.get("timeout", 600)) * 1000.0)
		_say("▶ %s %s" % [_op, JSON.stringify(args)])
		var ok: bool = await _dispatch(_op, args)
		if not ok:
			_snap(_op)
		_say("%s %s" % ["✔" if ok else "✘", _op])
		_write_json("ack.json", {"seq": _seq, "op": _op, "ok": ok, "notes": _notes, "result": _result})
		_op = ""


func _dispatch(op: String, a: Dictionary) -> bool:
	if Home.loaded():
		Home.refresh()
	match op:
		"onboard": return await _onboard()
		"dig": return await _dig(a)
		"raid": return await _raid(a)
		"guard": return await _guard(a)
		"defend_setup": return await _defend_setup(a)
		"watch": return await _watch(a)
		"shop": return await _shop(a)
		"wander": return await _wander(a)
		"harvest": return await _harvest()
		"idle": return await _settle()
	_note("op inconnue " + op)
	return false


func _late() -> bool:
	return Time.get_ticks_msec() > _deadline


func _snap(what: String) -> void:
	_snap_to("%s/%03d-%s.png" % [_bus, _seq, what])


func _snap_to(path: String) -> void:
	if _bus.is_empty():
		return
	var img := get_viewport().get_texture().get_image()
	if img != null:
		img.save_png(path)


# ── Le doigt ────────────────────────────────────────────────────────────────

func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


func _until(cond: Callable, limit: float = 20.0) -> bool:
	var left := limit
	while not cond.call():
		await get_tree().process_frame
		left -= get_process_delta_time()
		if left <= 0.0:
			return false
	return true


func _tap(at: Vector2) -> void:
	await _hand.tap(at, func() -> void: _click(at))


func _click(at: Vector2) -> void:
	for down in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = down
		ev.position = at
		ev.global_position = at
		get_viewport().push_input(ev, true)


## UN GLISSE DU DOIGT qui ramene `at` vers le milieu de l'ecran.
func _pan(at: Vector2) -> void:
	var mid := get_viewport().get_visible_rect().get_center()
	var delta := (mid - at).limit_length(220.0)
	var from := mid + Vector2(0, 30) - delta * 0.5
	await _hand.tap(from, func() -> void: pass)
	_press(from, true)
	for i in range(1, 9):
		var ev := InputEventMouseMotion.new()
		ev.position = from + delta * (i / 8.0)
		ev.global_position = ev.position
		ev.button_mask = MOUSE_BUTTON_MASK_LEFT
		get_viewport().push_input(ev, true)
		await get_tree().process_frame
	_press(from + delta, false)
	await _wait(0.3)


func _press(at: Vector2, down: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = down
	ev.position = at
	ev.global_position = at
	get_viewport().push_input(ev, true)


func _tap_control(c: Control) -> void:
	await _tap(c.get_global_rect().get_center())


func _key(code: Key) -> void:
	for down in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = down
		get_viewport().push_input(ev)


## Aucun bouton sous ce point : une tape y tombera sur le monde.
func _free_at(at: Vector2) -> bool:
	var ev := InputEventMouseMotion.new()
	ev.position = at
	ev.global_position = at
	get_viewport().push_input(ev)
	var rect := get_viewport().get_visible_rect().grow(-6.0)
	return rect.has_point(at) and get_viewport().gui_get_hovered_control() == null


func _shown(c: Variant) -> bool:
	return c is Control and is_instance_valid(c) and (c as Control).is_visible_in_tree()


# ── Trouver les pieces du jeu ───────────────────────────────────────────────

func _find(script_name: String) -> Node:
	var path := "res://scripts/%s.gd" % script_name
	var stack: Array[Node] = [get_tree().root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		var s: Script = n.get_script()
		if s != null and s.resource_path == path and n.is_inside_tree():
			return n
		for c in n.get_children():
			stack.append(c)
	return null


func _island() -> Node:
	return _find("island")


func _burrow() -> Node:
	return _find("burrow")


func _at_burrow() -> bool:
	return Screens.in_world() and Screens.place == Screens.Place.BURROW and not Screens.crossing \
		and _burrow() != null


func _at_island() -> bool:
	return Screens.in_world() and Screens.place == Screens.Place.ISLAND and not Screens.crossing \
		and _island() != null


func _cell_on_island(island: Node2D, cell: Vector2i) -> Vector2:
	var map = island.get("_terrain").map
	return island.get_global_transform_with_canvas() * (map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h()))


## UN POINT TAPABLE DE LA CASE : son milieu, ou une autre part du losange
## qu'aucun bouton ne couvre (et que le jeu lit bien comme cette case). INF
## si la case est toute cachee.
func _cell_point(island: Node2D, cell: Vector2i) -> Vector2:
	var mid := _cell_on_island(island, cell)
	var k: float = island.global_scale.x
	var hw := Iso.half_w() * k
	var hh := Iso.half_h() * k
	for o in [Vector2.ZERO, Vector2(0, 0.5), Vector2(-0.5, 0), Vector2(0.5, 0), Vector2(0, -0.5),
			Vector2(-0.3, 0.3), Vector2(0.3, 0.3), Vector2(0, 0.75), Vector2(-0.75, 0), Vector2(0.75, 0)]:
		var at: Vector2 = mid + Vector2(o.x * hw, o.y * hh)
		if _free_at(at) and island.call("_cell_at", at) == cell:
			return at
	return Vector2.INF


func _cell_on_burrow(burrow: Node2D, tile: int) -> Vector2:
	var c := BurrowLayout.cell_of(tile)
	var map = burrow.get("_terrain").map
	return burrow.get_global_transform_with_canvas() * (map.screen_of(c.x, c.y) + Vector2(0, Iso.half_h()))


func _sign(door: String) -> Control:
	var marks := _find("burrow_landmarks")
	if marks == null:
		return null
	var signs: Dictionary = marks.get("_signs")
	return signs.get(door) as Control


## AU TERRIER, LES MAINS LIBRES : plus de dialogue, de mode, de decor en main,
## de ceremonie. Tout ce qui reste ouvert se ferme comme un joueur le ferme.
func _settle(limit: float = 40.0) -> bool:
	var left := limit
	while left > 0.0:
		left -= 0.3
		if not Screens.in_world() or Screens.crossing:
			await _wait(0.3)
			continue
		if Screens.place == Screens.Place.ISLAND:
			var island := _island()
			if island != null and bool(island.get("_ending")):
				await _close_run_end()
			elif island != null:
				_note("au terrier : rentre d'une ile restee ouverte")
				await _tap_control(island.get("_back"))
				await _wait(1.0)
			else:
				await _wait(0.3)
			continue
		var reveal := _find("ui/purchase_reveal")
		if reveal != null:
			await _tap(get_viewport().get_visible_rect().get_center())
			await _wait(0.4)
			continue
		var victory := _find("ui/raid_victory")
		if victory != null:
			if bool(victory.get("_shown")):
				await _tap_control(victory.get("_button"))
			await _wait(0.4)
			continue
		var chrome := Chrome.current
		if chrome != null and chrome.dialog_open():
			var d: Control = chrome.get("_dialog")
			var close: Variant = d.get("close_button") if d != null else null
			if _shown(close):
				await _tap_control(close)
			else:
				await _tap(Vector2(8, get_viewport().get_visible_rect().size.y - 8))
			await _wait(0.4)
			continue
		if chrome != null and String(chrome.get("_mode")) != "":
			var back: Variant = chrome.get("_back")
			if back != null and _shown(back.get("_btn")):
				await _tap_control(back.get("_btn"))
			await _wait(0.5)
			continue
		var burrow := _burrow()
		if burrow != null and burrow.get("_arrange") != null:
			_key(KEY_ESCAPE)
			await _wait(0.4)
			continue
		if RaidState.current.has_raid() or burrow == null:
			await _wait(0.3)
			continue
		if HousePanel._expanded and chrome != null:
			await _fold_house(chrome)
			continue
		return true
	_note("settle : le terrier ne s'est pas libere")
	return false


func _fold_house(chrome: Chrome) -> void:
	var house: Control = chrome.get("_house")
	var panel: Control = house.get("_panel")
	var best: Button = null
	for b: Button in panel.find_children("*", "Button", true, false):
		if b is HubSlab or not b.is_visible_in_tree():
			continue
		if best == null or b.size.x * b.size.y < best.size.x * best.size.y:
			best = b
	if best != null:
		await _tap_control(best)
	await _wait(0.5)


## Le panneau d'un ilot, sorti de l'eau et tapable.
func _tap_sign(door: String, limit: float = 30.0) -> bool:
	if not await _settle():
		return false
	var ok := await _until(func() -> bool: return _shown(_sign(door)), limit)
	if not ok:
		_note("l'ilot %s n'est pas la" % door)
		return false
	await _wait(0.3)
	await _tap_control(_sign(door))
	return true


# ── L'accueil et la lecon ───────────────────────────────────────────────────

func _onboard() -> bool:
	await _until(func() -> bool: return _find("title") != null or Screens.in_world(), 40.0)
	var title := _find("title")
	if title != null:
		var guest: Control = title.get("_guest")
		# Avec un vrai jeton (`--token=`), l'accueil entre seul : pas de porte.
		var consent_ok := await _until(func() -> bool:
			if Screens.in_world():
				return true
			var dlg := _find("ui/consent_dialog")
			if dlg != null:
				var b := dlg.find_child("ConsentAccept", true, false) as Control
				if _shown(b):
					return true
			return _shown(guest) and not (guest as BaseButton).disabled, 30.0)
		if Screens.in_world():
			_note("session reprise : l'accueil entre seul")
		elif not consent_ok:
			_note("l'accueil n'offre pas de porte invite")
			return false
		if not Screens.in_world():
			var dlg := _find("ui/consent_dialog")
			if dlg != null:
				_note("consentement : accepte")
				await _tap_control(dlg.find_child("ConsentAccept", true, false))
				await _wait(1.0)
			await _wait(1.0)
			await _tap_control(guest)
		if not await _until(func() -> bool: return Session.signed_in(), 20.0):
			_note("la connexion n'aboutit pas")
			return false
	_result["playerId"] = String(Session.player.get("id", ""))
	_write_state()
	# LA LECON, si elle est due.
	await _until(func() -> bool: return Screens.in_world() and not Screens.crossing, 30.0)
	var island := _island()
	if island != null and await _until(func() -> bool:
			var i := _island()
			return i != null and i.get("_board") != null and bool(i.call("_is_tutorial")), 15.0):
		if not await _tutorial():
			return false
	if not await _until(_at_burrow, 60.0):
		_note("pas de terrier apres la lecon")
		return false
	return await _settle()


func _tutorial() -> bool:
	_note("lecon")
	await _wait(1.5)
	var island: Node2D = _island()
	var board: IslandBoard = island.get("_board")
	var bomb := TutorialMap.bomb()
	var chest := TutorialMap.chest()
	var guard := 0
	while is_instance_valid(island) and not bool(island.get("_done")) and guard < 80:
		guard += 1
		var rabbit: HomeRabbit = island.get("_rabbit")
		await _until(func() -> bool: return not rabbit.hopping(), 5.0)
		await _wait(LESSON_BEAT_S)
		var here := rabbit.at()
		if not board.is_flagged(bomb) and board.is_beside(here, bomb):
			await _tap_control(island.get("_mark"))
			await _wait(0.45)
			await _tap(_cell_on_island(island, bomb))
			await _wait(0.6)
			continue
		var goal := bomb if not board.is_flagged(bomb) else chest
		var best := Vector2i(-1, -1)
		var best_d := 1 << 30
		for n in board._neighbours(here):
			if not board.may_step(here, n) or n == bomb:
				continue
			var d: int = 0 if n == goal else board._steps_between(n, goal)
			if d < best_d:
				best_d = d
				best = n
		if best.x < 0:
			_note("lecon : bloque en %s" % str(here))
			return false
		await _tap(_cell_on_island(island, best))
	return true


# ── Creuser ─────────────────────────────────────────────────────────────────

func _wire_run() -> void:
	if _wired_run or RunState.current == null:
		return
	_wired_run = true
	RunState.current.run_ended.connect(func(r: Dictionary) -> void: _last_run = r)
	RunState.current.arm_refused.connect(func(kind: String, why: String) -> void:
		if _op != "":
			_note("%s refuse : %s" % [kind, why]))
	RunState.current.leave_refused.connect(func(ms: int) -> void:
		if _op != "":
			_note("depart refuse (encre, %d ms)" % ms))


## Ce que l'oracle sait de l'ile `seed`, ou {}. Chaque question porte un
## numero : la reponse d'avant ne passe pas pour celle-ci.
func _where(seed: String) -> Dictionary:
	_asked += 1
	var f := FileAccess.open(_bus + "/want.txt", FileAccess.WRITE)
	f.store_string("%s|%d" % [seed, _asked])
	f.close()
	for i in 50:
		var j: Variant = _read_json("where.json")
		if j is Dictionary and String(j.get("seed", "")) == seed and j.has("bombs") \
				and int(j.get("n", -1)) == _asked:
			return j
		await _wait(0.06)
	return {}


var _asked := 0


## UNE PARTIE. Vers le coffre le plus proche par des cases sures ; quelques
## croix sur des bombes voisines ; un saut sur une bombe (`blast`) ; une croix
## fausse (`wrong`). Sur une ile partagee (`fight`) : eclair, bloop, et la
## chasse — marcher sur le rival pour le pousser, a la mer si elle est la.
func _dig(a: Dictionary) -> bool:
	_wire_run()
	_last_run = {}
	if not await _tap_sign("dig"):
		return false
	var arrived := await _until(func() -> bool:
		if _energy_popup() != null:
			return true
		var i := _island()
		return i != null and not Screens.crossing and i.get("_board") != null and bool(i.get("_remote")) \
			and not RunState.current.seed.is_empty() and not RunState.current.me().is_empty(), 45.0)
	if _energy_popup() != null:
		_note("DIG : pas assez d'energie — achat aux carottes")
		var pop := _energy_popup()
		if _shown(pop.get("_buy")):
			await _tap_control(pop.get("_buy"))
			await _wait(1.5)
		await _settle()
		if not await _tap_sign("dig"):
			return false
		arrived = await _until(func() -> bool:
			var i := _island()
			return i != null and not Screens.crossing and bool(i.get("_remote")) \
				and not RunState.current.me().is_empty(), 45.0)
	if not arrived:
		_note("DIG : pas d'ile en ligne")
		return false
	var island: Node2D = _island()
	await _until(func() -> bool:
		var t: Variant = island.get("_cam_tween")
		return not (t is Tween and (t as Tween).is_valid()), 4.0)
	await _wait(0.6)
	var seed := RunState.current.seed
	_result["seed"] = seed
	_result["level"] = int(RunState.current.island.get("level", 0))
	_say("ile %s niveau %d" % [seed.left(14), _result["level"]])

	var marks_left := int(a.get("marks", 2))
	var blast := bool(a.get("blast", false))
	var wrong := bool(a.get("wrong", false))
	var fight := bool(a.get("fight", false))
	var leave_after := float(a.get("leave_after", -1))
	var started := Time.get_ticks_msec()
	var steps := 0
	var hunt := 0
	var same := 0
	var last_here := Vector2i(-99, -99)
	var fights := {"strike": 0, "bloop": 0, "shove": 0}
	var covered := 0
	var hidden := {}
	while not _late():
		if not is_instance_valid(island) or _island() != island or Screens.place != Screens.Place.ISLAND:
			break
		if bool(island.get("_ending")) or bool(island.get("_done")):
			break
		if leave_after >= 0.0 and Time.get_ticks_msec() - started > leave_after * 1000.0:
			_note("rentre a pied avant la fin")
			await _tap_control(island.get("_back"))
			await _wait(1.0)
			if RunState.current.ink_left_ms() > 0:
				await _wait(RunState.current.ink_left_ms() / 1000.0 + 0.3)
				await _tap_control(island.get("_back"))
			break
		if Chrome.current != null and Chrome.current.dialog_open():
			var d: Control = Chrome.current.get("_dialog")
			_note("un panneau s'est ouvert en pleine partie (%s) : ferme" % \
				(d.get_script().resource_path.get_file() if d != null and d.get_script() != null else "?"))
			_snap("dialog-mid-run")
			if d != null and _shown(d.get("close_button")):
				await _tap_control(d.get("close_button"))
			await _wait(0.6)
			continue
		var rabbit: IslandRabbit = island.get("_rabbit")
		await _until(func() -> bool: return not is_instance_valid(rabbit) or not rabbit.hopping(), 5.0)
		var me := RunState.current.me()
		if me.is_empty() or not bool(me.get("alive", true)):
			await _wait(0.4)
			continue
		var stun := RunState.current.stun_left(me)
		if stun > 0:
			await _wait(stun / 1000.0 + 0.05)
		await _wait(BEAT_S)
		if not is_instance_valid(island) or _island() != island or bool(island.get("_ending")):
			break
		var board: IslandBoard = island.get("_board")
		var w := await _where(seed)
		if w.is_empty():
			_note("oracle muet")
			await _wait(1.0)
			continue
		var bombs := {}
		for t in w.get("bombs", []):
			bombs[board.cell_of(int(t))] = true
		var chests := {}
		for t in w.get("chests", []):
			chests[board.cell_of(int(t))] = true
		if chests.is_empty():
			await _wait(0.5)
			continue
		var here: Vector2i = island.call("_me_cell")
		if here == last_here:
			same += 1
		else:
			same = 0
		last_here = here
		var taken := {}
		var rivals: Dictionary = island.get("_rivals")
		for id in rivals:
			var r: IslandRabbit = rivals[id]
			if is_instance_valid(r) and r.visible:
				taken[r.at()] = id

		# LE COMBAT, sur une ile ou il est permis.
		if fight and not rivals.is_empty() and RunState.current.may_fight_here() and steps > 3:
			var act := await _fight(island, board, here, taken, fights, steps)
			if act == "hunt":
				hunt = 14
			elif act != "":
				steps += 1
				continue

		# LES CROIX.
		var beside_bomb := Vector2i(-1, -1)
		for n in board._neighbours(here):
			if bombs.has(n) and not board.is_flagged(n):
				beside_bomb = n
				break
		if beside_bomb.x >= 0 and blast and board.may_step(here, beside_bomb) and not taken.has(beside_bomb) \
				and _cell_point(island, beside_bomb) != Vector2.INF:
			_note("saute sur une bombe exprès")
			blast = false
			await _tap(_cell_point(island, beside_bomb))
			await _wait(1.8)
			continue
		if beside_bomb.x >= 0 and marks_left > 0 and _rng.randf() < 0.6:
			if await _mark(island, beside_bomb):
				marks_left -= 1
				continue
		if wrong:
			for n in board._neighbours(here):
				if not bombs.has(n) and not chests.has(n) and board.state.get(n) != IslandBoard.State.DUG \
						and not board.is_flagged(n):
					_note("croix fausse exprès")
					wrong = false
					await _mark(island, n)
					break

		# LA CHASSE : se placer cote terre, la mer derriere le rival, et
		# le pousser dedans (la noyade).
		if hunt > 0 and not taken.is_empty():
			var shove := Vector2i(-1, -1)
			for r in taken:
				var d: Vector2i = r - here
				if absi(d.x) <= 1 and absi(d.y) <= 1 and _is_sea(island, r + d):
					shove = r
			if shove.x >= 0 and _cell_point(island, shove) != Vector2.INF:
				hunt = 0
				fights["drown"] = int(fights.get("drown", 0)) + 1
				_note("pousse %s vers la mer" % RunState.current.name_of(String(taken[shove])))
				await _tap(_cell_point(island, shove))
				steps += 1
				await _wait(1.0)
				continue
		# LE PAS.
		var goal := chests
		if hunt > 0 and not taken.is_empty():
			hunt -= 1
			goal = {}
			for r in taken:
				for dy in [-1, 0, 1]:
					for dx in [-1, 0, 1]:
						var d := Vector2i(dx, dy)
						if d != Vector2i.ZERO and _is_sea(island, r + d) and board.content.has(r - d) \
								and not bombs.has(r - d):
							goal[r - d] = true
			if goal.is_empty():
				for r in taken:
					goal[r] = true
		var avoid := bombs.duplicate()
		avoid.merge(hidden)
		var next := _path_step(board, here, goal, avoid, taken if hunt <= 0 else {})
		if same > 6:
			next = _any_step(board, here, bombs, taken)
			same = 0
		if next.x < 0:
			next = _any_step(board, here, bombs, taken)
		if next.x < 0:
			await _wait(0.6)
			continue
		var at := _cell_point(island, next)
		if at == Vector2.INF:
			# UN BOUTON COUVRE LA CASE : un doigt fait glisser l'ile pour la
			# ramener au milieu ; si la camera refuse, un autre pas.
			await _pan(_cell_on_island(island, next))
			at = _cell_point(island, next)
			if at == Vector2.INF:
				covered += 1
				hidden[next] = true
				if covered == 1:
					_note("case %s toute cachee sous le HUD, le glisse ne la degage pas : contournee" % str(next))
					_snap("covered")
				var others: Array[Vector2i] = []
				for n in board._neighbours(here):
					if not bombs.has(n) and not taken.has(n) and board.may_step(here, n) \
							and _cell_point(island, n) != Vector2.INF:
						others.append(n)
				if others.is_empty():
					await _wait(0.5)
					continue
				next = others[_rng.randi() % others.size()]
				at = _cell_point(island, next)
		if taken.has(next):
			fights["shove"] += 1
		await _tap(at)
		steps += 1

	if _late():
		_note("DIG : temps ecoule (%d pas)" % steps)
		if is_instance_valid(island) and _island() == island:
			await _tap_control(island.get("_back"))
	await _close_run_end()
	var home := await _until(_at_burrow, 40.0)
	_result["steps"] = steps
	_result["fights"] = fights
	_result["run"] = _last_run
	_result["levelAfter"] = int(Home.player.get("level", 0))
	if not _last_run.is_empty():
		var how: String = "cleared" if bool(_last_run.get("cleared", false)) else \
			("killed" if _last_run.has("killedBy") else "over")
		_result["end"] = how
		_note("fin de run : %s %s" % [how, JSON.stringify(_last_run).left(160)])
	return home and not _late()


func _energy_popup() -> Control:
	var chrome := Chrome.current
	if chrome == null or not chrome.dialog_open():
		return null
	var d: Control = chrome.get("_dialog")
	return d if d is EnergyPopup else null


## La fin d'une run : la ceremonie passe seule ; le panneau « plus d'energie »
## se ferme a la main.
func _close_run_end() -> void:
	var ok := await _until(func() -> bool: return _at_burrow() or _energy_popup() != null, 25.0)
	if not ok:
		return
	var pop := _energy_popup()
	if pop != null:
		_note("panneau energie en fin de run : ferme")
		await _wait(0.8)
		await _tap_control(pop.get("close_button"))


func _mark(island: Node2D, cell: Vector2i) -> bool:
	var mb := _find("ui/mark_bomb_button")
	if mb == null or not _shown(mb.get("_button")) or _cell_point(island, cell) == Vector2.INF:
		return false
	await _tap_control(mb.get("_button"))
	await _wait(0.3)
	var at := _cell_point(island, cell)
	if at == Vector2.INF:
		return false
	await _tap(at)
	await _wait(0.5)
	return true


## LA MER FRANCHE (palier 0) : seule elle noie. Une plage hors plateau
## (palier 1) arrete la poussee comme un mur (push.ts `isSea`).
func _is_sea(island: Node2D, c: Vector2i) -> bool:
	var map = island.get("_terrain").map
	if c.x < 0 or c.y < 0 or c.x >= map.width or c.y >= map.height:
		return true
	return int(map.level_at(c.x, c.y)) == 0


## En largeur, le premier pas vers la case la plus proche de `goal`.
func _path_step(board: IslandBoard, from: Vector2i, goal: Dictionary, bombs: Dictionary, taken: Dictionary) -> Vector2i:
	var prev := {from: from}
	var queue: Array[Vector2i] = [from]
	var head := 0
	while head < queue.size():
		var c := queue[head]
		head += 1
		if goal.has(c) and c != from:
			var step := c
			while prev[step] != from:
				step = prev[step]
			return step
		for n in board._neighbours(c):
			if prev.has(n) or bombs.has(n) or not board.may_step(c, n):
				continue
			if taken.has(n) and not goal.has(n):
				continue
			prev[n] = c
			queue.append(n)
	return Vector2i(-1, -1)


func _any_step(board: IslandBoard, here: Vector2i, bombs: Dictionary, taken: Dictionary) -> Vector2i:
	var ok: Array[Vector2i] = []
	for n in board._neighbours(here):
		if not bombs.has(n) and not taken.has(n) and board.may_step(here, n):
			ok.append(n)
	return ok[_rng.randi() % ok.size()] if not ok.is_empty() else Vector2i(-1, -1)


## Un geste de combat, ou "" : l'eclair, le bloop, ou « hunt » (chasser).
func _fight(island: Node2D, board: IslandBoard, here: Vector2i, taken: Dictionary,
		fights: Dictionary, steps: int) -> String:
	if steps % 5 != 0:
		return ""
	var run := RunState.current
	var hud := _find("ui/run_hud")
	if hud == null or not _shown(hud.get("_arm_plate")):
		return ""
	var target := ""
	for c in taken:
		target = String(taken[c])
	var rival: IslandRabbit = (island.get("_rivals") as Dictionary).get(target)
	if rival == null:
		return ""
	var turn := (steps / 5) % 3
	var kind: String = ["strike", "bloop", "hunt"][turn]
	if kind == "hunt":
		return "hunt"
	var bag_kind := "lightning" if kind == "strike" else "bloop"
	if int(run.bag.get(bag_kind, 0)) <= 0:
		return ""
	var button: Button = hud.get("_strike" if kind == "strike" else "_bloop")
	if not _shown(button) or button.disabled:
		return ""
	_note("%s sur %s" % ["eclair" if kind == "strike" else "bloop", run.name_of(target)])
	await _tap_control(button)
	await _wait(0.3)
	var body: Vector2 = island.get_global_transform_with_canvas() * \
		(rival.position + Vector2(0, -16.0 * HomeRabbit.RABBIT_SCALE * 0.5))
	await _tap(body)
	fights[kind] += 1
	await _wait(1.2)
	if run.aiming != "":
		run.set_aiming("")
	return kind


# ── Le raid ─────────────────────────────────────────────────────────────────

## La ligne de `target` dans la liste RAID, ouverte par son ilot.
func _target_row(target: String) -> Control:
	if not await _tap_sign("raid"):
		return null
	var ok := await _until(func() -> bool: return _find("ui/target_list") != null, 8.0)
	if not ok:
		_note("la liste RAID ne s'ouvre pas (niveau ? energie ?)")
		return null
	var tl := _find("ui/target_list")
	# Une lambda GDScript capture par VALEUR : l'index se relit apres coup.
	await _until(func() -> bool:
		var i := _target_index(target)
		return i >= 0 and is_instance_valid(tl) and (tl.get("_rows") as Control).get_child_count() > i, 12.0)
	await _wait(0.3)
	var idx := _target_index(target)
	if idx < 0:
		_note("la cible n'est pas dans la liste RAID")
		return null
	var rows: Control = tl.get("_rows")
	var row := rows.get_child(idx) as Control
	(tl.get("_scroll") as ScrollContainer).ensure_control_visible(row)
	await _wait(0.4)
	return row


func _target_index(target: String) -> int:
	var targets: Array = RaidState.current.targets
	for i in targets.size():
		if targets[i] is Dictionary and String((targets[i] as Dictionary).get("id", "")) == target:
			return i
	return -1


func _row_buttons(row: Control) -> Array:
	var line := row.get_child(0)
	var slot := line.get_child(2)
	if slot is VBoxContainer:
		return [slot.get_child(0), slot.get_child(1)]
	return [slot, null]


## RAIDER `target` : la ligne, RAID, puis vers le potager pas a pas.
## `retreat_after` : se replier apres n pas.
func _raid(a: Dictionary) -> bool:
	var target := String(a.get("target", ""))
	var retreat_after := int(a.get("retreat_after", -1))
	var row := await _target_row(target)
	if row == null:
		return false
	var raid_button: Control = _row_buttons(row)[0]
	_result["presence"] = RaidState.current.presence_of(RaidState.current.targets.filter(
		func(t: Dictionary) -> bool: return String(t.get("id", "")) == target)[0])
	if (raid_button as BaseButton).disabled:
		_note("RAID grise (bouclier ?)")
		await _settle()
		return false
	await _tap_control(raid_button)
	var entered := await _until(func() -> bool:
		var b := _burrow()
		return b != null and bool(b.get("_in_raid")) and not Screens.crossing and not RaidState.current.busy, 20.0)
	if not entered:
		_note("le raid ne s'ouvre pas : " + RaidState.current.note)
		await _settle()
		return false
	await _wait(1.0)
	var visited := {}
	var walked := 0
	while not _late():
		var raid: Dictionary = RaidState.current.raid
		if raid.is_empty() or bool(raid.get("finished", false)):
			break
		var burrow: Node2D = _burrow()
		if burrow == null or not bool(burrow.get("_in_raid")):
			break
		if retreat_after >= 0 and walked >= retreat_after:
			var hud := _find("ui/raid_hud")
			if hud != null and _shown(hud.get("_retreat")):
				_note("se replie apres %d pas" % walked)
				await _tap_control(hud.get("_retreat"))
				break
		var layout: BurrowLayout = burrow.get("_layout")
		var best := -1
		var best_d := INF
		for t in raid.get("steps", []):
			var tile := int(t)
			var c := BurrowLayout.cell_of(tile)
			var d := INF
			for f in layout.field:
				d = minf(d, Vector2(c - BurrowLayout.cell_of(f)).length())
			d += float(visited.get(tile, 0)) * 3.0 + _rng.randf() * 0.5
			if not _free_at(_cell_on_burrow(burrow, tile)):
				d += 100.0
			if d < best_d:
				best_d = d
				best = tile
		if best < 0:
			await _wait(0.4)
			continue
		visited[best] = int(visited.get(best, 0)) + 1
		await _tap(_cell_on_burrow(burrow, best))
		walked += 1
		await _wait(0.15)
		await _until(func() -> bool: return not RaidState.current.busy, 5.0)
		await _wait(0.35)
	var raid: Dictionary = RaidState.current.raid
	_result["walked"] = walked
	_result["outcome"] = {
		"succeeded": raid.get("succeeded"), "struck": raid.get("struck"),
		"trapsSprung": raid.get("trapsSprung"), "carrots": raid.get("carrotsLooted"),
	}
	_note("raid : %s" % JSON.stringify(_result["outcome"]))
	# La ceremonie, ou le depart tout seul.
	await _until(func() -> bool:
		var v := _find("ui/raid_victory")
		return (v != null and bool(v.get("_shown"))) or not RaidState.current.has_raid(), 15.0)
	var v := _find("ui/raid_victory")
	if v != null and bool(v.get("_shown")):
		await _wait(1.5)
		await _tap_control(v.get("_button"))
	await _until(func() -> bool:
		var b := _burrow()
		return b != null and not bool(b.get("_in_raid")) and not Screens.crossing, 20.0)
	return await _settle()


## GARDER LA MAISON : au terrier, attendre l'intrus ; le foudroyer apres
## `strike_after` pas (-1 : le laisser faire, et regarder).
func _guard(a: Dictionary) -> bool:
	var strike_after := int(a.get("strike_after", -1))
	if not await _settle():
		return false
	_write_state()
	var came := await _until(func() -> bool: return RaidState.current.has_incoming(), float(a.get("wait", 120)))
	if not came:
		_note("personne n'est venu")
		return false
	var who: Dictionary = RaidState.current.incoming.get("attacker", {})
	_note("alerte : %s entre" % String(who.get("name", "?")))
	await _wait(0.5)
	if strike_after >= 0:
		await _until(func() -> bool:
			var inc: Dictionary = RaidState.current.incoming
			return inc.is_empty() or bool(inc.get("finished", false)) or _walked(inc) >= strike_after, 60.0)
		var hud := _find("ui/defend_hud")
		var inc: Dictionary = RaidState.current.incoming
		if hud != null and _shown(hud.get("_strike")) and not bool(inc.get("finished", false)):
			_note("FOUDROIE l'intrus au pas %d" % _walked(inc))
			await _tap_control(hud.get("_strike"))
		else:
			_note("pas de bouton eclair a temps")
	await _until(func() -> bool:
		var inc: Dictionary = RaidState.current.incoming
		return inc.is_empty() or bool(inc.get("finished", false)), 90.0)
	var inc: Dictionary = RaidState.current.incoming
	_result["incoming"] = {
		"walked": _walked(inc), "succeeded": inc.get("succeeded"), "struck": inc.get("struck"),
		"trapsSprung": inc.get("trapsSprung"), "carrots": inc.get("carrotsLooted"),
	}
	_note("defense : %s" % JSON.stringify(_result["incoming"]))
	await _until(func() -> bool:
		var b := _burrow()
		return b != null and not bool(b.get("_defending")), 25.0)
	return await _settle()


## Les pas de l'intrus : `walked` est la liste des cases foulees.
func _walked(inc: Dictionary) -> int:
	var w: Variant = inc.get("walked", 0)
	return (w as Array).size() if w is Array else int(w)


# ── Defendre ────────────────────────────────────────────────────────────────

## DEFEND : des bombes sur le chemin de la porte au potager, des clotures.
func _defend_setup(a: Dictionary) -> bool:
	var want_traps := int(a.get("traps", 3))
	var want_fences := int(a.get("fences", 2))
	if not await _tap_sign("defend"):
		return false
	if not await _until(func() -> bool: return String(Chrome.current.get("_mode")) == "placing", 8.0):
		_note("DEFEND n'ouvre pas le mode pose")
		return false
	await _wait(0.8)
	var burrow: Node2D = _burrow()
	var layout: BurrowLayout = burrow.get("_layout")
	var shop := ShopState.shared()
	var path := _burrow_path(layout)
	var placed := 0
	for tile in path:
		if placed >= want_traps or _late():
			break
		if int(shop.item("trap").get("held", 0)) <= 0:
			_note("plus de bombe en poche")
			break
		if not layout.is_trappable(tile) or (shop.traps.get("placed", []) as Array).has(tile):
			continue
		var at := _cell_on_burrow(burrow, tile)
		if not _free_at(at):
			continue
		var before := (shop.traps.get("placed", []) as Array).size()
		await _tap(at)
		if await _until(func() -> bool: return (shop.traps.get("placed", []) as Array).size() > before, 5.0):
			placed += 1
		await _wait(0.3)
	_note("bombes posees : %d" % placed)
	_result["traps"] = placed

	# LES CLOTURES.
	var kit: Node = Chrome.current.get("_kit")
	var slot: Control = (kit.get("_slots") as Dictionary).get("fence")
	var fenced := 0
	if _shown(slot) and want_fences > 0:
		await _tap_control(slot)
		if await _until(func() -> bool: return String(Chrome.current.get("_mode")) == "walling", 5.0):
			await _wait(0.6)
			var fences: Node2D = burrow.get("_fences")
			for d in (fences.get("_drawn") as Array).duplicate():
				if fenced >= want_fences or _late():
					break
				var offered: Dictionary = fences.get("_offered")
				if not offered.has(String(d["key"])):
					continue
				var at: Vector2 = fences.get_global_transform_with_canvas() * Vector2(d["mid"])
				if not _free_at(at):
					continue
				var before := (fences.get("_built") as Dictionary).size()
				await _tap(at)
				if await _until(func() -> bool: return (fences.get("_built") as Dictionary).size() > before, 5.0):
					fenced += 1
				await _wait(0.3)
	else:
		_note("pas de case cloture dans le kit")
	_note("clotures posees : %d" % fenced)
	_result["fences"] = fenced
	return await _settle()


## Le chemin de la porte au potager, en largeur sur les cases praticables.
func _burrow_path(layout: BurrowLayout) -> Array[int]:
	var walk := {}
	for t in layout.walkable_tiles():
		walk[t] = true
	var field := {}
	for t in layout.field:
		field[t] = true
	var prev := {layout.entrance: -1}
	var queue: Array[int] = [layout.entrance]
	var head := 0
	var end := -1
	while head < queue.size():
		var t := queue[head]
		head += 1
		if field.has(t):
			end = t
			break
		var c := BurrowLayout.cell_of(t)
		for s in BurrowLayout.STEPS:
			var n := BurrowLayout.index(c + s)
			if walk.has(n) and not prev.has(n):
				prev[n] = t
				queue.append(n)
	var out: Array[int] = []
	while end >= 0:
		out.push_front(end)
		end = int(prev.get(end, -1))
	return out


# ── Regarder ────────────────────────────────────────────────────────────────

## REGARDER `target` qui creuse : sa ligne, REGARDER, son ile ; `zap` : lui
## lancer un bloop et un eclair depuis le public.
func _watch(a: Dictionary) -> bool:
	var target := String(a.get("target", ""))
	var row := await _target_row(target)
	if row == null:
		return false
	var watch_button: Variant = _row_buttons(row)[1]
	if watch_button == null:
		_note("pas de REGARDER : la ligne ne le dit pas en train de creuser (%s)" % \
			RaidState.current.presence.get(target, "?"))
		await _settle()
		return false
	await _tap_control(watch_button)
	var there := await _until(func() -> bool:
		return _at_island() and RunState.current.spectating == target and not RunState.current.seed.is_empty(), 25.0)
	if not there:
		_note("le public n'arrive pas sur l'ile")
		await _settle()
		return false
	_note("regarde l'ile %s" % RunState.current.seed.left(14))
	await _wait(float(a.get("secs", 12)) * 0.5)
	if bool(a.get("zap", false)):
		var island: Node2D = _island()
		var hud := _find("ui/run_hud")
		for kind in ["bloop", "strike"]:
			var rival: IslandRabbit = (island.get("_rivals") as Dictionary).get(target)
			if hud == null or rival == null:
				break
			var button: Button = hud.get("_" + kind)
			if int(RunState.current.bag.get("lightning" if kind == "strike" else "bloop", 0)) <= 0:
				_note("public : sac vide pour %s" % kind)
				continue
			if not _shown(button):
				_note("public : pas de bouton %s" % kind)
				continue
			_note("public : %s" % kind)
			await _tap_control(button)
			await _wait(0.3)
			await _tap(island.get_global_transform_with_canvas() * \
				(rival.position + Vector2(0, -16.0 * HomeRabbit.RABBIT_SCALE * 0.5)))
			await _wait(1.5)
	await _wait(float(a.get("secs", 12)) * 0.5)
	var island: Node = _island()
	if island != null:
		await _tap_control(island.get("_back"))
	return await _until(_at_burrow, 25.0) and await _settle()


# ── La boutique ─────────────────────────────────────────────────────────────

## ACHETER aux carottes : {"buy": {"lightning": 2, ...}}. Deux tapes par
## achat (la confirmation), puis la revelation qu'on ferme d'une tape.
func _shop(a: Dictionary) -> bool:
	if not await _tap_sign("shop"):
		return false
	if not await _until(func() -> bool: return _find("ui/shop") != null, 8.0):
		_note("la boutique ne s'ouvre pas")
		return false
	await _wait(1.0)
	var state := ShopState.shared()
	var bought := {}
	var wants: Dictionary = a.get("buy", {})
	for kind in wants:
		for n in int(wants[kind]):
			if _late():
				break
			var buy := await _shop_button(String(kind))
			if buy == null:
				_note("pas de bouton d'achat %s" % kind)
				break
			var before := int(state.item(kind).get("held", 0))
			await _tap_control(buy)
			await _wait(0.35)
			# La vitrine se refait a chaque nouvelle du terrier : le bouton arme
			# peut avoir ete remplace (et desarme) entre les deux tapes.
			var again := await _shop_button(String(kind))
			if again != buy:
				_note("vitrine refaite entre ACHETER et CONFIRMER (%s) : on recommence" % kind)
				if again == null:
					break
				await _tap_control(again)
				await _wait(0.35)
				again = await _shop_button(String(kind))
				if again == null:
					break
			await _tap_control(again)
			if await _until(func() -> bool: return int(state.item(kind).get("held", 0)) > before, 6.0):
				bought[kind] = int(bought.get(kind, 0)) + 1
			else:
				_note("achat %s sans effet : %s" % [kind, state.note])
			await _wait(0.5)
			if _find("ui/purchase_reveal") != null:
				await _wait(0.8)
				await _tap(get_viewport().get_visible_rect().get_center())
				await _until(func() -> bool: return _find("ui/purchase_reveal") == null, 4.0)
	_result["bought"] = bought
	_note("achats : %s" % JSON.stringify(bought))
	return await _settle()


## Le bouton d'achat de la carte `kind`, amene a l'ecran, ou null.
func _shop_button(kind: String) -> Control:
	var shop := _find("ui/shop")
	if shop == null:
		return null
	for c in (shop.get("_row") as Control).get_children():
		if c.has_meta("kind") and String(c.get_meta("kind")) == kind and not c.is_queued_for_deletion():
			(shop.get("_shelf") as ScrollContainer).ensure_control_visible(c)
			await _wait(0.3)
			if not is_instance_valid(c):
				return null
			var lift: Control = c.get_meta("lift")
			for b in lift.get_children():
				if b is PlankButton and _shown(b):
					return b
	return null


func _harvest() -> bool:
	if not await _settle():
		return false
	if Home.live_garden() <= 0:
		_note("potager vide")
		return true
	var before := int(Home.burrow.get("stock", 0))
	if not await _tap_sign("harvest", 6.0):
		return false
	await _until(func() -> bool: return int(Home.burrow.get("stock", 0)) > before, 6.0)
	_note("recolte : +%d" % (int(Home.burrow.get("stock", 0)) - before))
	return true


# ── Tout toucher ────────────────────────────────────────────────────────────

## UN JOUEUR QUI FOUILLE : chaque bouton du terrier, chaque panneau ouvert
## puis ferme, la maison amelioree, un decor deplace, des tapes au hasard.
func _wander(a: Dictionary) -> bool:
	var ok := true
	await _harvest()
	# LA MAISON.
	if await _settle():
		var house: Control = Chrome.current.get("_house")
		if _shown(house.get("_button")):
			await _tap_control(house.get("_button"))
			await _wait(0.8)
			var slabs := (house.get("_panel") as Control).find_children("*", "HubSlab", true, false)
			if not slabs.is_empty() and bool(Home.burrow.get("canUpgrade", false)):
				var lvl := int(Home.burrow.get("level", 0))
				await _tap_control(slabs[0])
				await _until(func() -> bool: return int(Home.burrow.get("level", 0)) > lvl, 6.0)
				_note("maison : niveau %d → %d" % [lvl, int(Home.burrow.get("level", 0))])
			await _fold_house(Chrome.current)
		else:
			_note("pas de volet maison")
	# LA QUETE.
	var quest := _find("ui/quest_card")
	if quest != null and _shown(quest.get("_slab")):
		_note("quete reclamee")
		await _tap_control(quest.get("_slab"))
		await _wait(1.0)
	# LA BARRE DU HAUT : profil (ses onglets), saison, histoire, son.
	var bar := _find("ui/top_bar")
	if bar != null:
		for what in ["chip", "season_button", "story_button"]:
			if not await _settle():
				ok = false
				break
			var b: Variant = bar.get(what)
			if not _shown(b):
				_note("barre : %s cache" % what)
				continue
			await _tap_control(b)
			var opened := await _until(func() -> bool: return Chrome.current.dialog_open(), 4.0)
			_note("barre : %s %s" % [what, "ouvert" if opened else "NE S'OUVRE PAS"])
			await _wait(1.2)
			if what == "chip" and opened:
				var prof := _find("ui/profile")
				if prof != null:
					for tab: Button in prof.get("_tabs"):
						if _shown(tab):
							await _tap_control(tab)
							await _wait(0.8)
		await _settle()
		var sound: Node = bar.get("sound")
		if sound != null and _shown(sound.get("sound_button")):
			await _tap_control(sound.get("sound_button"))
			await _wait(1.0)
			await _tap(get_viewport().get_visible_rect().get_center() + Vector2(0, 60))
			await _wait(0.6)
	# LE DECOR : prendre, poser ailleurs.
	if await _settle():
		var burrow: Node2D = _burrow()
		var layout: BurrowLayout = burrow.get("_layout")
		var tried := 0
		for p in layout.placements:
			if tried >= 6 or burrow.get("_arrange") != null:
				break
			var tile := BurrowLayout.index(Vector2i(int(p.get("x", 0)), int(p.get("y", 0))))
			var at := _cell_on_burrow(burrow, tile)
			if not _free_at(at):
				continue
			tried += 1
			await _tap(at)
			await _wait(0.5)
		var arrange: Variant = burrow.get("_arrange")
		if arrange != null:
			var targets: Variant = arrange.get("targets")
			var spots: Array = (targets as Dictionary).keys() if targets is Dictionary else (targets as Array)
			spots.shuffle()
			var dropped := false
			for t in spots:
				var cell: Vector2i = t if t is Vector2i else BurrowLayout.cell_of(int(t))
				var at := _cell_on_burrow(burrow, BurrowLayout.index(cell))
				if _free_at(at):
					await _tap(at)
					dropped = true
					break
			await _wait(1.0)
			_note("decor deplace" if dropped and burrow.get("_arrange") == null else "decor : pris, pas pose")
		else:
			_note("decor : rien a prendre")
	# DES TAPES AU HASARD sur le terrier.
	for i in int(a.get("random", 6)):
		var rect := get_viewport().get_visible_rect()
		var at := Vector2(_rng.randf_range(40, rect.size.x - 40), _rng.randf_range(60, rect.size.y - 40))
		await _tap(at)
		await _wait(0.5)
	return await _settle() and ok
