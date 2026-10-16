extends Node
## LE REALISATEUR DE LA VIDEO DE LA HACHE (2026-10-12) — le vrai jeu
## (main.tscn) sur un serveur local, joue par un doigt qu'on voit.
##
##   marketing/axe/film.sh       (serveur local 3012, Movie Maker, 890x400)
##
## L'histoire du user : Kuro creuse ; l'alerte rouge crie qu'on le pille ;
## au profil, l'historique dit qui (l'attaquant, sur le VRAI mur de
## NorminaskyTV : marketing/axe/stage.ts) ; REVENGE ; un terrier mure de
## partout ; la boutique, une hache ; retour, la hache abat un arbre, le
## lapin passe par la souche et pille le champ.
##
## Chaque geste est un VRAI clic sous la main (bench_hand.gd), comme la video
## Seeker. Le realisateur ne triche que pour CHOISIR : il connait les bombes
## de l'attaquant (stage.ts les pose), jamais pour jouer a la place du jeu.
## L'attaque sur Kuro est jouee par stage.ts, au signal (`<stage>/attack`).
##
## `-- --stage=<dossier>` (tokens.json, attack, attacked), `--no-music`,
## `--probe=<dossier>` : une image a chaque moment, pour regler sans filmer.

const BEAT_S := 0.7
const ZOOM_TICKS := 6
const ZOOM_TICK_S := 0.09
const STEP_S := 0.55
## L'attaquant : ses bombes (stage.ts BOMBS), l'arbre a abattre et la case
## d'ou on l'abat. LA BOMBE SUR LE CHEMIN (le user : « met aussi un peu des
## bombes ») : on s'arrete SUR la 178, une des cinq vraies, et de la on abat
## le 177 a cote. Mesure (scratchpad route.ts) : 11 pas + 12 de la bombe = 23,
## dans les 24 que laisse un raid (STAKE - TOLL) ; par le 173 c'etait 28.
## stage.ts BOMBS : les cinq vraies, plus sept le long du chemin (des chiffres).
const BOMBS := [196, 178, 140, 120, 100, 241, 205, 202, 198, 181, 165, 159]
const WALL_TREE := 177
const AT_WALL := 178
## KURO EST LE LAPIN NOIR (marketing-rushes) : pas de planche noire en jeu, le
## realisateur repeint le pelage brun de Kuro (l'attaquant est roux).
const KURO_SHEET := "res://assets/bunnies/bunny-black.png"
var _black: Texture2D
var _brown: Texture2D
var _repainted := {}
## RAID WON refait son image du lapin a chaque image (`_frame_texture`) :
## repeinte a chaque image, apres lui (process_priority).
var _victory: Node

## LES BOMBES, MONTREES seulement avec `--show-bombs` : la couche des bombes
## du proprietaire, posee sur le terrier de l'attaquant des qu'on y entre.
## Par defaut cachees, comme le pillard les vit (le user, 2026-10-12 : les
## chiffres du demineur suffisent, « sauf que tu n'affiches pas les bombes »).
var _show_bombs := false
var _bombs_live: Array = []
const BOMB_OVER_DECOR := TileView.Z_PROP + 1

var _hand: BenchHand
var _main: Node
var _clock := 0.0
var _stage := ""
var _probe := ""
var _no_music := false
var _attacker := ""


func _process(delta: float) -> void:
	_clock += delta
	if _victory != null and is_instance_valid(_victory):
		var r: TextureRect = _victory.get("_rabbit")
		if r != null:
			r.texture = _black_tex(r.texture)
	if _no_music:
		AudioServer.set_bus_mute(AudioServer.get_bus_index("Music"), true)
	_keep_bombs()


## Le sol se reconstruit (l'arbre tombe) et la synchro des bombes de Kuro
## (il n'en a pas) vide la couche : on les repose a chaque image.
func _keep_bombs() -> void:
	if _bombs_live.is_empty() or not RaidState.current.has_raid():
		return
	var burrow := _find("burrow")
	if burrow == null or not bool(burrow.get("_in_raid")):
		return
	var traps: BurrowTraps = burrow.get("_traps")
	for t in _bombs_live:
		if not traps.has_trap(int(t)):
			traps.add_trap(int(t), false)
			# AU-DESSUS DU DECOR de sa case : sous un buisson, celle sur
			# laquelle Kuro saute ne se voyait pas.
			var group: Variant = (traps.get("_traps") as Dictionary).get(int(t), {}).get("group")
			if group is Node2D:
				(group as Node2D).z_index = BOMB_OVER_DECOR


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--stage="):
			_stage = arg.trim_prefix("--stage=")
		elif arg.begins_with("--probe="):
			_probe = arg.trim_prefix("--probe=")
		elif arg == "--no-music":
			_no_music = true
		elif arg == "--show-bombs":
			_show_bombs = true
	var tokens: Variant = JSON.parse_string(FileAccess.get_file_as_string(_stage + "/tokens.json"))
	if tokens is Dictionary:
		_attacker = String(tokens.get("attackerId", ""))
	# QUOI DE NEUF s'ouvrirait a l'arrivee : vu d'avance, comme un joueur.
	Changelog.mark_seen()
	process_priority = 100
	_brown = Kit.AVATARS["brown"]
	_black = ImageTexture.create_from_image(Image.load_from_file(KURO_SHEET))
	get_tree().node_added.connect(func(n: Node) -> void: _repaint.call_deferred(n))
	var sweep := Timer.new()
	sweep.wait_time = 0.2
	sweep.timeout.connect(func() -> void: _repaint(get_tree().root))
	add_child(sweep)
	sweep.start()
	_main = preload("res://scenes/main.tscn").instantiate()
	add_child(_main)
	_hand = BenchHand.new()
	_hand.layer = 110
	add_child(_hand)
	_run.call_deferred()


func _mark(what: String) -> void:
	print("[film] %.2f %s" % [_clock, what])
	if not _probe.is_empty():
		await get_tree().process_frame
		get_viewport().get_texture().get_image().save_png("%s/%05.1f-%s.png" % [_probe, _clock, what])


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


## Le brun devient noir sous `n` : les planches decoupees (AtlasTexture),
## les images pleines, les animations du lapin.
func _repaint(n: Node) -> void:
	if not is_instance_valid(n):
		return
	var stack: Array[Node] = [n]
	while not stack.is_empty():
		var x: Node = stack.pop_back()
		var sc: Script = x.get_script()
		if sc != null and sc.resource_path == "res://scripts/ui/raid_victory.gd":
			_victory = x
		if x is AnimatedSprite2D:
			var spr := x as AnimatedSprite2D
			if spr.sprite_frames != null and not _repainted.has(spr.sprite_frames):
				spr.sprite_frames = _black_frames(spr.sprite_frames)
		elif x is Sprite2D:
			(x as Sprite2D).texture = _black_tex((x as Sprite2D).texture)
		elif x is TextureRect:
			(x as TextureRect).texture = _black_tex((x as TextureRect).texture)
		for c in x.get_children():
			stack.append(c)


func _black_tex(t: Texture2D) -> Texture2D:
	if t == _brown:
		return _black
	if t is AtlasTexture and (t as AtlasTexture).atlas == _brown:
		var a := (t as AtlasTexture).duplicate() as AtlasTexture
		a.atlas = _black
		return a
	return t


func _black_frames(frames: SpriteFrames) -> SpriteFrames:
	var touched := false
	for anim in frames.get_animation_names():
		for i in frames.get_frame_count(anim):
			var f := frames.get_frame_texture(anim, i)
			if _black_tex(f) != f:
				touched = true
				break
		if touched:
			break
	if not touched:
		_repainted[frames] = true
		return frames
	var out: SpriteFrames = frames.duplicate()
	for anim in out.get_animation_names():
		for i in out.get_frame_count(anim):
			out.set_frame(anim, i, _black_tex(out.get_frame_texture(anim, i)), out.get_frame_duration(anim, i))
	_repainted[out] = true
	return out


# ── Le doigt ────────────────────────────────────────────────────────────────

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


func _tap_control(c: Control) -> void:
	await _tap(c.get_global_rect().get_center())


## Un geste qu'on doit suivre (le profil, REVENGE) : la main glisse
## lentement, se pose, puis appuie (le user : « le mouvement est trop rapide »).
func _tap_slow(c: Control) -> void:
	var at := c.get_global_rect().get_center()
	await _hand.tap(at, func() -> void: _click(at), 0.75, 0.4)


# ── Les pieces du jeu ───────────────────────────────────────────────────────

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


func _named(root: Node, node_name: String) -> Control:
	if root == null:
		return null
	return root.find_child(node_name, true, false) as Control


func _island_cell(island: Node2D, cell: Vector2i) -> Vector2:
	var map = island.get("_terrain").map
	return island.get_global_transform_with_canvas() * (map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h()))


func _burrow_cell(burrow: Node2D, tile: int) -> Vector2:
	var c := BurrowLayout.cell_of(tile)
	var map: BurrowMap = burrow.get("_terrain").map
	return burrow.get_global_transform_with_canvas() * (map.screen_of(c.x, c.y) + Vector2(0, Iso.half_h()))


# ── Le film ─────────────────────────────────────────────────────────────────

func _run() -> void:
	await _dig()
	await _raided()
	await _profile_revenge()
	_mark("walled")
	# LE MUR, DE PRES : la molette sur le potager, on le regarde, on recule.
	await _wait(1.2)
	var burrow: Node2D = _find("burrow")
	var layout := BurrowLayout.of(_attacker, (RaidState.current.raid.get("defender", {}) as Dictionary).get("edits", {}))
	await _zoom_at(_burrow_cell(burrow, int(layout.field[layout.field.size() / 2])), 5)
	_mark("wall-close")

	await _wait(2.4)
	await _zoom_at(_burrow_cell(burrow, int(layout.field[layout.field.size() / 2])), 5, false)
	await _wait(0.8)
	await _buy_axe()
	await _cut_and_loot()
	_mark("end")
	await _wait(4.0)
	_mark("over")


## KURO CREUSE : du terrier a l'ile, quelques pas sur des cases deja ouvertes.
func _dig() -> void:
	await _until(func() -> bool: return _find("burrow") != null, 40.0)
	await _wait(1.5)
	_mark("burrow")
	var marks := _find("burrow_landmarks")
	await _until(func() -> bool:
		var signs: Dictionary = marks.get("_signs")
		return signs.has("dig") and (signs["dig"] as Control).is_visible_in_tree(), 20.0)
	await _wait(1.0)
	await _tap_control(marks.get("_signs")["dig"])
	await _until(func() -> bool:
		var i := _find("island")
		return i != null and i.get("_board") != null and bool(i.get("_remote")), 40.0)
	await _wait(1.5)
	_mark("island")
	var island: Node2D = _find("island")
	var board: IslandBoard = island.get("_board")
	var last := Vector2i(-1, -1)
	for i in 4:
		var rabbit: IslandRabbit = island.get("_rabbit")
		await _until(func() -> bool: return not rabbit.hopping(), 5.0)
		await _wait(STEP_S)
		var here: Vector2i = island.call("_me_cell")
		var next := Vector2i(-1, -1)
		for n in board._neighbours(here):
			if n != last and board.is_dug(n) and board.may_step(here, n):
				next = n
				break
		if next.x < 0:
			break
		last = here
		await _tap(_island_cell(island, next))


## LE PILLAGE : stage.ts entre chez Kuro ; l'alerte rouge, le bandeau, puis
## la fin et ce qu'il a pris.
func _raided() -> void:
	var f := FileAccess.open(_stage + "/attack", FileAccess.WRITE)
	f.store_string("go")
	f.close()
	await _until(func() -> bool:
		var c := Chrome.current
		return c != null and c.get("_alarm") != null and is_instance_valid(c.get("_alarm")), 20.0)
	await _wait(1.2)
	_mark("alarm")
	await _until(func() -> bool: return FileAccess.file_exists(_stage + "/attacked"), 30.0)
	await _wait(1.6)
	_mark("looted")
	await _wait(1.2)


## LE PROFIL : l'historique dit qui ; REVENGE.
func _profile_revenge() -> void:
	var bar := _find("ui/top_bar")
	await _tap_slow(bar.get("me_button"))
	await _until(func() -> bool: return _find("ui/profile") != null, 10.0)
	await _wait(1.0)
	_mark("profile")
	var profile := _find("ui/profile")
	var tabs: Array = profile.get("_tabs")
	await _tap_slow(tabs[1])
	await _until(func() -> bool: return _named(_find("ui/profile"), "Revenge") != null, 10.0)
	_mark("history")
	# LE TEMPS DE LIRE qui, combien, et REVENGE NOW (le user : « trop vite »).
	await _wait(2.8)
	await _tap_slow(_named(_find("ui/profile"), "Revenge"))
	await _until(func() -> bool:
		var b := _find("burrow")
		return b != null and RaidState.current.has_raid() and bool(b.get("_in_raid")), 30.0)
	if _show_bombs:
		_bombs_live = BOMBS.duplicate()
	RaidState.current.sprung.connect(func(tile: int) -> void:
		_bombs_live.erase(tile)
		# Au souffle, pas avant : burrow.gd attend l'atterrissage.
		var b := _find("burrow")
		var w: Node = b.get("_walker") if b != null else null
		while w != null and is_instance_valid(w) and w.call("hopping"):
			await get_tree().process_frame
		if b != null:
			(b.get("_traps") as BurrowTraps).remove_trap(tile))
	await _wait(1.0)


## LA BOUTIQUE : HACHE vide dit ou en trouver ; la barre du haut ouvre
## l'etal ; l'onglet des objets, la hache, deux tapes (choisir, confirmer).
func _buy_axe() -> void:
	var hud: RaidHud = RaidHud.live
	if hud != null:
		await _tap_control(hud.get("_axe"))
		await _wait(1.2)
		_mark("no-axe")
	var bar := _find("ui/top_bar")
	var shop_button: Control = bar.get("shop_button") if bar != null else null
	if shop_button == null or not shop_button.is_visible_in_tree():
		_mark("no-shop-in-raid")
		return
	await _tap_control(shop_button)
	await _until(func() -> bool: return _find("ui/forest_shop") != null, 10.0)
	await _wait(1.0)
	_mark("shop")
	var shop := _find("ui/forest_shop")
	await _tap_control(_named(shop, "Tab_items"))
	await _until(func() -> bool: return _named(_find("ui/forest_shop"), "Item_axe") != null, 10.0)
	await _wait(1.0)
	var item := _named(_find("ui/forest_shop"), "Item_axe")
	_mark("axe-card")
	await _tap_control(_named(item, "Price"))
	await _wait(0.8)
	await _tap_control(_named(_named(_find("ui/forest_shop"), "Item_axe"), "Price"))
	await _wait(1.8)
	_mark("bought")
	# GOT IT tient l'ecran (et les tapes) ~2,7 s : on le laisse finir.
	await _until(func() -> bool:
		var live: Variant = PurchaseReveal._live
		return live == null or not is_instance_valid(live), 6.0)
	await _wait(0.6)
	await _tap_control(_named(_find("ui/forest_shop"), "Close"))
	await _until(func() -> bool: return _find("ui/forest_shop") == null, 4.0)
	await _wait(1.0)


## LE RAID : jusqu'au mur, la hache, l'arbre tombe, par la souche au champ.
func _cut_and_loot() -> void:
	var burrow: Node2D = _find("burrow")
	await RaidState.current.refresh()
	await _walk_to(burrow, AT_WALL)
	_mark("at-wall")
	await _wait(BEAT_S)
	# Ou est le bouton HACHE, en part de l'ecran : le montage l'entoure.
	var plate: Control = RaidHud.live.get("_axe_plate")
	var r := plate.get_global_rect()
	var view := get_viewport().get_visible_rect().size
	print("[film] axe-rect %.4f %.4f %.4f %.4f" % [r.position.x / view.x, r.position.y / view.y, r.size.x / view.x, r.size.y / view.y])
	await _tap_control(RaidHud.live.get("_axe"))
	await _wait(1.0)
	_mark("armed")
	await _tap(_burrow_cell(burrow, WALL_TREE) + Vector2(0, -12))
	await _wait(2.2)
	_mark("felled")
	var layout := BurrowLayout.of(_attacker, (RaidState.current.raid.get("defender", {}) as Dictionary).get("edits", {}))
	await _walk_to(burrow, int(layout.field[0]), true)
	_mark("field")


## Quelques crans de molette sur `at`, un toutes les ZOOM_TICK_S.
func _zoom_at(at: Vector2, ticks: int, closer := true) -> void:
	for i in ticks:
		for down in [true, false]:
			var ev := InputEventMouseButton.new()
			ev.button_index = MOUSE_BUTTON_WHEEL_UP if closer else MOUSE_BUTTON_WHEEL_DOWN
			ev.pressed = down
			ev.factor = 1.0
			ev.position = at
			ev.global_position = at
			get_viewport().push_input(ev, true)
		await _wait(ZOOM_TICK_S)


## Pas a pas sur l'anneau du raid vers `goal` (ou le champ), sans bombe.
func _walk_to(burrow: Node2D, goal: int, field := false) -> void:
	for i in 30:
		var r := RaidState.current.raid
		if bool(r.get("finished", false)):
			return
		var here := int(r.get("tile", -1))
		if here == goal:
			return
		var steps: Array = r.get("steps", [])
		var edits: Dictionary = (r.get("defender", {}) as Dictionary).get("edits", {})
		var layout := BurrowLayout.of(_attacker, edits)
		var dist := _distances(layout, goal, field)
		var best := -1
		var best_d := 1 << 30
		for s in steps:
			var t := int(s)
			if (BOMBS.has(t) and t != goal) or not dist.has(t):
				continue
			if int(dist[t]) < best_d:
				best_d = int(dist[t])
				best = t
		if best < 0:
			_mark("stuck")
			return
		var at := _burrow_cell(burrow, best)
		if i == 0:
			_mark("walk")
		if BOMBS.has(best):
			# PLUS PRES AVANT LA BOMBE : l'explosion se voit, puis l'arbre.
			await _zoom_at(at, ZOOM_TICKS)
			await _wait(0.5)
			at = _burrow_cell(burrow, best)
			_mark("boom")
		await _tap(at)
		await _until(func() -> bool: return int(RaidState.current.raid.get("tile", -1)) == best, 5.0)
		await _wait(2.4 if BOMBS.has(best) else STEP_S)


## Les pas jusqu'a `goal` (ou jusqu'au champ), sur le sol praticable, sans
## bombe : une BFS a rebours.
static func _distances(layout: BurrowLayout, goal: int, field: bool) -> Dictionary:
	var dist := {}
	var queue: Array = []
	var starts: Array = layout.field if field else [goal]
	for t in starts:
		dist[int(t)] = 0
		queue.append(int(t))
	while not queue.is_empty():
		var t: int = queue.pop_front()
		var here := BurrowLayout.cell_of(t)
		for s in BurrowLayout.STEPS:
			var c: Vector2i = here + s
			if c.x < 0 or c.y < 0 or c.x >= BurrowLayout.COLS or c.y >= BurrowLayout.ROWS:
				continue
			var n := BurrowLayout.index(c)
			if dist.has(n) or not layout.is_walkable(n) or BOMBS.has(n):
				continue
			dist[n] = int(dist[t]) + 1
			queue.append(n)
	return dist
