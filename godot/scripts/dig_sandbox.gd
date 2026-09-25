extends Node2D
## LE BAC A SABLE DU CREUSAGE — une ile generee, ses contenus, un lapin, et
## tout ce qui se joue dessus, SANS SERVEUR.
##
##   godot --path godot scenes/dig_sandbox.tscn
##   godot --path godot scenes/dig_sandbox.tscn -- --seed=reef --content=r --life=25000
##   godot --path godot scenes/dig_sandbox.tscn -- --shot=/tmp/dig.png --after=3
##
## CE QUI EST VRAI ICI, et verifie : l'ile (`island_map.gd`), son decor et ses
## pas (`island_ground.gd`), ses contenus (`IslandBoard.deal_generated`) sont
## ceux que le serveur tirerait des memes deux graines, case pour case
## (tools/verify_deal.gd). Les regles d'un pas et d'un X sont `resolveMove` et
## `flagTile` (`local_run.gd`).
##
## CE QUI NE L'EST PAS : en ligne, la graine de contenu est PRIVEE et le client
## ne sait rien de ce qui est enterre. Ce banc la choisit lui-meme — c'est un
## outil pour regler et regarder, pas une manche.
##
## LE CHROME EST CELUI DU JEU : le HUD de manche (`run_hud.gd`, jusque-la ecrit
## et pas monte) lit `RunState`, et ce banc le nourrit de ce que `LocalRun`
## rend — la forme meme des evenements de la socket. Le jour ou l'ile passera
## en ligne, seul l'emetteur change.
##
## Clavier : N nouvelle ile, R la meme depuis le debut, T palier suivant,
## X marquer une bombe.

const ISLAND := preload("res://scenes/island.tscn")
const HUD_SCENE := preload("res://scenes/ui/run_hud.tscn")
const RECAP_SCENE := preload("res://scenes/ui/run_recap.tscn")

## `minLifetime` de chaque palier : le lapin « a deja ramasse » assez pour
## l'ouvrir. Lu dans `ISLAND_TIERS`, pas recopie.
var _tiers: Array = []
var _tier_at := 0

var _island: Island
var _hud: RunHud
var _bar: TopBar
var _recap: RunRecap
var _panel: PanelContainer
var _info: Label
var _seed := ""
var _content := ""
var _started := 0


func _ready() -> void:
	_tiers = Tuning.list("ISLAND_TIERS")
	var args := _args()
	_seed = args.get("seed", "")
	_content = args.get("content", "")
	if args.has("life"):
		var life := float(args["life"])
		for i in _tiers.size():
			if life >= float(_tiers[i].minLifetime):
				_tier_at = i

	_island = ISLAND.instantiate()
	_island.own_mark = false
	add_child(_island)
	_island.set_standalone(true)
	_island.local_changed.connect(_on_changed)
	_island.local_over.connect(_on_over)

	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	var root := Control.new()
	Kit.fill(root)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	_hud = HUD_SCENE.instantiate()
	_hud.always = true
	root.add_child(_hud)

	# LA BARRE DU HAUT DU JEU : l'energie de la manche est sur SON cadran, le
	# meme qu'au terrier — le HUD de manche n'a plus de barre a lui.
	_bar = preload("res://scenes/ui/top_bar.tscn").instantiate()
	# Hors du monde (pas de Screens ici) : visible quand meme.
	_bar.preview = true
	_bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_bar.offset_bottom = Kit.TOPBAR_H
	root.add_child(_bar)

	_build_panel(root)

	# LE BOUTON MARK A BOMB DU HUD arme l'ile ; l'ile desarme le HUD une fois le
	# X pose. La sonde dit au bouton s'il y a quoi viser — sinon il refuse.
	var state := RunState.current
	state.markable_probe = func(_on: bool) -> int: return _island.markable_count()
	state.flag_mode_changed.connect(func(on: bool) -> void: _island.set_armed(on))

	_new_island(_seed if _seed != "" else _random_seed())

	# `--auto=N` : N pas joues tout seuls, pour une capture qui montre un
	# plateau entame. Le pilote TRICHE (il lit ce qui est enterre) : c'est un
	# outil de banc, il ne juge rien.
	_reckless = args.has("reckless")
	if args.has("auto"):
		_auto_left = int(args["auto"])
		var tick := Timer.new()
		# `--auto-every=0.7` : un pas toutes les 0,7 s, lisible a l'ecran pour
		# une video (`--write-movie`) ; 0,12 s par defaut pour une capture fixe.
		tick.wait_time = float(args.get("auto-every", 0.12))
		tick.autostart = true
		tick.timeout.connect(_auto_step)
		add_child(tick)
	# UNE CAPTURE N'ECOUTE PAS LE CLAVIER : la fenetre s'ouvre et prend le
	# focus pendant qu'on tape ailleurs, et chaque lettre tombait dans le banc
	# — un N tirait une autre ile, un T changeait de palier, au milieu de la
	# sonde. (`Window.unfocusable` aurait ete plus propre ; sur macOS la
	# fenetre ne rendait plus une image et la capture ne partait jamais.)
	if args.has("shot"):
		set_process_unhandled_input(false)
	# `--clean` : l'image du jeu seule, pour une video — sans le panneau du
	# banc ni le compteur de l'ile.
	if args.has("clean"):
		_panel.visible = false
		if _island._fps != null:
			_island._fps.visible = false
		set_process_unhandled_input(false)
	DevShot.arm(self)


var _auto_left := 0
var _reckless := false


## `--bomb-shot=chemin`, `--chest-shot=chemin` : des captures de la PREMIERE
## bombe / du PREMIER coffre, a quelques instants apres — une explosion dure
## une demi-seconde, une capture a heure fixe la rate. Ecrit `chemin-1.png`…
var _shots_done := {}


func _event_shots(arg: String, times: Array) -> void:
	var base: String = _args().get(arg, "")
	if base == "" or _shots_done.has(arg):
		return
	_shots_done[arg] = true
	var k := 0
	for t in times:
		k += 1
		var path := "%s-%d.png" % [base, k]
		get_tree().create_timer(t).timeout.connect(func() -> void:
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(path)
			print("[shot] ", path))


## UN PAS DU PILOTE : vers le coffre le plus proche, sur une case sure.
func _auto_step() -> void:
	var run := _island.local_run
	if _auto_left <= 0 or run == null or not run.alive:
		return
	var board := run.board
	var goal := Vector2i(-1, -1)
	var best := INF
	for c in board.chest_tier:
		if board.state.get(c) != IslandBoard.State.DUG:
			var d := Vector2(c - run.at).length()
			if d < best:
				best = d
				goal = c
	if goal.x < 0:
		return
	var pick := Vector2i(-1, -1)
	var pick_d := INF
	for n in board._neighbours(run.at):
		if not board.may_step(run.at, n):
			continue
		# `--reckless` : il marche sur les bombes, pour voir une explosion.
		if board.content.get(n) == IslandBoard.Content.BOMB and not _reckless:
			continue
		# Un peu de hasard : sans lui le pilote bute contre la premiere falaise.
		var d := Vector2(goal - n).length() + randf() * 1.5
		if d < pick_d:
			pick_d = d
			pick = n
	if pick.x < 0:
		return
	_auto_left -= 1
	_island._local_tap(pick)


func _args() -> Dictionary:
	var out := {}
	for a in OS.get_cmdline_user_args():
		if a == "--reckless":
			out["reckless"] = "1"
		if a == "--clean":
			out["clean"] = "1"
		if a.begins_with("--") and a.contains("="):
			var kv := a.substr(2).split("=", true, 1)
			out[kv[0]] = kv[1]
	return out


func _random_seed() -> String:
	return "sandbox-%d" % (randi() % 100000)


func _lifetime() -> float:
	return float(_tiers[_tier_at].minLifetime) if _tier_at < _tiers.size() else 0.0


func _new_island(seed_value: String) -> void:
	print("[sandbox] ile %s" % seed_value)
	_seed = seed_value
	if _content == "":
		_content = "c%d" % (randi() % 100000)
	if _recap != null and is_instance_valid(_recap):
		_recap.queue_free()
		_recap = null
	_island.play_local(_seed, _content, _lifetime())
	_started = Time.get_ticks_msec()
	RunState.current.set_flag_mode(false)
	_push({})


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match event.keycode:
		KEY_N:
			_content = ""
			_new_island(_random_seed())
		KEY_R:
			_new_island(_seed)
		KEY_T:
			_next_tier()
		KEY_X:
			RunState.current.set_flag_mode(not RunState.current.flag_mode)


func _next_tier() -> void:
	_tier_at = (_tier_at + 1) % maxi(1, _tiers.size())
	_new_island(_seed)


## CE QUE LA SOCKET AURAIT DIT, dans la forme de `RunState` : mon lapin, le
## volcan, le sac.
func _push(outcome: Dictionary) -> void:
	var run := _island.local_run
	if run == null:
		return
	var board := run.board
	var p := board.chest_progress()
	var stage := 0
	for w in Tuning.list("ERUPTION.WARN_STAGES"):
		if float(p.fraction) >= float(w):
			stage += 1
	var state := {
		"me_id": "me",
		"seed": _seed,
		"first_run": false,
		"rabbits": [{"playerId": "me", "name": "Sandbox", "tile": board.index_of(run.at),
			"energy": run.energy, "carrots": run.carrots, "alive": run.alive, "crowned": false}],
		"warn_stage": stage,
		"dug_fraction": p.fraction,
		"chests_taken": int(p.total) - int(p.left),
		"chests_total": p.total,
		"digs": run.digs.duplicate(),
		"bag": {"lightning": int(run.loot.get("lightning", 0)), "bombs": int(run.loot.get("bomb", 0))},
	}
	# PAS DE `hit` POUR UNE BOMBE CREUSEE : sur le fil, `hit` est le coup d'un
	# RIVAL (eclair, bombe posee) — le HUD l'annonce « A RIVAL MINED THAT ».
	# Sa propre bombe, on la voit sauter ; le serveur ne l'envoie pas en `hit`.
	RunState.current.fake(state)
	if _bar != null:
		_bar.set_run(run.carrots, {"taken": int(p.total) - int(p.left), "total": p.total,
			"warnStage": stage})
		_bar.set_run_energy(run.energy)
	_refresh_info()


func _on_changed(outcome: Dictionary) -> void:
	# LE X EST POSE, JUSTE OU FAUX : le bouton du HUD retombe, comme le mode.
	if outcome.has("flag") or (not outcome.ok and RunState.current.flag_mode):
		RunState.current.set_flag_mode(false)
	if not outcome.ok:
		print("[sandbox] refuse : %s" % outcome.reason)
	elif int(outcome.get("dig", {}).get("content", -1)) == IslandBoard.Content.BOMB:
		_event_shots("bomb-shot", [0.05, 0.2, 0.6])
	elif int(outcome.get("dig", {}).get("content", -1)) == IslandBoard.Content.CHEST:
		# Le pilote s'arrete : sinon la camera part pendant qu'on regarde.
		if _args().has("chest-shot"):
			_auto_left = 0
		_event_shots("chest-shot", [0.3, 0.5, 0.8, 1.1])
	_push(outcome)


## LA FIN : le recap du jeu, pose a plat (il n'y a pas de chrome pour
## l'ouvrir). Le fermer ou « rentrer » tire une ile neuve.
func _on_over(cleared: bool) -> void:
	print("[sandbox] fin cleared=%s" % cleared)
	var run := _island.local_run
	var recap := {
		"carrots": run.carrots, "tilesDug": int(run.digs.tiles), "bombsHit": int(run.digs.bombs),
		"durationMs": Time.get_ticks_msec() - _started, "cleared": cleared,
		"loot": run.loot.duplicate(),
	}
	_recap = RECAP_SCENE.instantiate()
	_recap.set_anchors_preset(Control.PRESET_CENTER)
	_recap.size = Vector2(380.0, 0.0)
	_recap.position = (get_viewport_rect().size - Vector2(380.0, 260.0)) * 0.5
	_panel.get_parent().add_child(_recap)
	_recap.show_recap(recap, false, {}, {})
	var again := func() -> void:
		_content = ""
		_new_island(_random_seed())
	_recap.go_home.connect(again)
	_recap.closed.connect(again)


# ---------------------------------------------------------------- le panneau

func _build_panel(root: Control) -> void:
	# EN BAS A GAUCHE : le haut est au HUD de manche (energie, maree), le bas a
	# droite a MARK A BOMB.
	_panel = Kit.panel(Kit.style_glass())
	_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_panel.offset_left = Kit.EDGE
	_panel.offset_bottom = -Kit.EDGE
	root.add_child(_panel)
	var box := Kit.vbox(4.0)
	_panel.add_child(box)
	_info = Kit.label("", 11, Palette.CREAM)
	box.add_child(_info)
	var row := Kit.hbox(4.0)
	box.add_child(row)
	var fresh := Kit.button("NEW", "green", 84.0, 32.0)
	fresh.pressed.connect(func() -> void:
		_content = ""
		_new_island(_random_seed()))
	row.add_child(fresh)
	var again := Kit.button("RETRY", "wood", 104.0, 32.0)
	again.pressed.connect(func() -> void: _new_island(_seed))
	row.add_child(again)
	var tier := Kit.button("TIER", "gold", 90.0, 32.0)
	tier.pressed.connect(_next_tier)
	row.add_child(tier)


func _refresh_info() -> void:
	var run := _island.local_run
	if run == null or _info == null:
		return
	var board := run.board
	var p := board.chest_progress()
	var tiers := {}
	for c in board.chest_tier:
		if board.state.get(c) != IslandBoard.State.DUG:
			var t: String = board.chest_tier[c]
			tiers[t] = int(tiers.get(t, 0)) + 1
	var left := []
	for t in ["crown", "gold", "silver", "bronze"]:
		if tiers.has(t):
			left.append("%s %d" % [t, tiers[t]])
	var bag := []
	for k in run.loot:
		bag.append("%s %d" % [k, run.loot[k]])
	_info.text = "\n".join([
		"%s  ·  %s" % [_seed, board.tier.get("name", "?")],
		"energie %d  ·  carottes %d  ·  serie X %d" % [run.energy, run.carrots, run.flag_streak],
		"coffres %d/%d  —  %s" % [int(p.total) - int(p.left), p.total, ", ".join(left)],
		"sac : %s" % (", ".join(bag) if not bag.is_empty() else "vide"),
	])
