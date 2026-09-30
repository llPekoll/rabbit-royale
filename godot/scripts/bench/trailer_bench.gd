extends "res://scripts/dig_sandbox.gd"
## LE PLATEAU DE TOURNAGE — le bac a sable, plus un rival et des coups qui
## n'existent qu'en ligne (foudre, bloop, poussee a l'eau), rejoues ici sans
## serveur pour filmer une pub. Les coups passent par les memes fonctions que
## les evenements de la socket ; seule la mise en scene est inventee.
##
##   godot --path godot --write-movie /tmp/lightning.avi --fixed-fps 30 \
##     --quit-after 210 scenes/bench/trailer_bench.tscn -- --clean --beat=lightning
##
## `--beat=` : lightning | bloop | drown | bomb | chest | zap | shove |
## bombshove | duel. Sans `--beat`, c'est le bac a sable avec le son : creuser
## au pilote (`--auto=N --auto-every=0.8`), ou `--hunt` : il va chercher les
## bombes, pour une video qui explose (l'energie ne s'epuise pas).
## `--names` : Shiro et Kuro portent leur nom.

const RIVAL := "kuro"
## KURO EST LE NOIR (2026-09-30) : le pelage brun du jeu, recolore — pas un
## sixieme siege, le banc peint seulement son lapin.
const KURO_SHEET := "res://assets/bunnies/bunny-black.png"


func _ready() -> void:
	# LE SON DU JEU : un banc n'a pas de racine qui l'heberge (`Sound.host`),
	# il restait muet — et la video avec lui.
	Sound.host(self)
	# Les effets seuls : l'ambiance les couvrait (0,3 contre 0,15 pour
	# l'explosion). Le montage remet la musique dessous, plus bas.
	Sound._ambient.stop()
	super._ready()
	var args := _args()
	var beat: String = args.get("beat", "")
	await get_tree().create_timer(0.8).timeout
	if _flag("names"):
		_island._rabbit.set_plate("Shiro", true)
		_lift_plate(_island._rabbit, 13.0)
		_arm_up()
	match beat:
		"lightning":
			await _lightning()
		"bloop":
			await _bloop()
		"drown":
			await _drown()
		"bomb":
			await _step_on(IslandBoard.Content.BOMB)
		"chest":
			await _step_on(IslandBoard.Content.CHEST)
		"zap":
			await _zap()
		"shove":
			await _shove(false)
		"bombshove":
			await _shove(true)
		"duel":
			await _duel()


## Un drapeau sans `=` : `_args` ne garde que `--cle=valeur` (et deux noms).
func _flag(name: String) -> bool:
	return ("--" + name) in OS.get_cmdline_user_args()


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


func _board() -> IslandBoard:
	return _island.local_run.board


## Une case de terre libre a `d` cases de `from`, dans la direction `dir`.
func _land(from: Vector2i, dir: Vector2i, d: int) -> Vector2i:
	var c := from + dir * d
	return c if _board().map.is_land(c.x, c.y) else Vector2i(-1, -1)


func _spawn_rival(cell: Vector2i) -> IslandRabbit:
	_island._add_rival({"playerId": RIVAL, "tile": _board().index_of(cell), "alive": true}, true)
	var r: IslandRabbit = _island._rivals.get(RIVAL)
	r.set_plate("Kuro", false)
	_paint_kuro(r)
	return r


## Cote a cote, les deux noms se chevauchaient : celui de Shiro monte d'un
## cran, et son trait s'allonge d'autant.
static func _lift_plate(r: IslandRabbit, px: float) -> void:
	var plate: Label = r.get("_plate")
	var stem: Line2D = r.get("_stem")
	if plate == null or stem == null:
		return
	plate.position.y -= px
	var pts := stem.points
	pts[0].y -= px
	stem.points = pts


## Les memes images, prises sur la planche noire.
static func _paint_kuro(r: IslandRabbit) -> void:
	var sprite: AnimatedSprite2D = r.get("_sprite")
	if sprite == null:
		return
	var sheet := ImageTexture.create_from_image(Image.load_from_file(KURO_SHEET))
	var frames: SpriteFrames = sprite.sprite_frames.duplicate()
	for anim in frames.get_animation_names():
		for i in frames.get_frame_count(anim):
			var f := frames.get_frame_texture(anim, i) as AtlasTexture
			if f == null:
				continue
			var black := AtlasTexture.new()
			black.atlas = sheet
			black.region = f.region
			frames.set_frame(anim, i, black, frames.get_frame_duration(anim, i))
	sprite.sprite_frames = frames


## Mon lapin, pose ailleurs sans saut ; la camera le reprend.
func _put_me(cell: Vector2i) -> void:
	_island.local_run.at = cell
	_island._rabbit.place_at(cell)
	_island._refresh_ring()
	_island.frame_camera(true)


## Un rival a deux cases, n'importe quel cote qui soit de la terre.
func _rival_near(me: Vector2i) -> Vector2i:
	for dir in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(1, 1)]:
		var c: Vector2i = _land(me, dir, 2)
		if c.x >= 0 and c != me:
			return c
	return me + Vector2i(1, 0)


## LA FOUDRE : il arrive, fait un pas, et le carre autour de lui s'embrase.
func _lightning() -> void:
	var me: Vector2i = _island.local_run.at
	var at := _rival_near(me)
	var r := _spawn_rival(at)
	await _wait(0.9)
	if _flag("hand"):
		await _aim_at(r, "strike")
	var tiles := []
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var c: Vector2i = at + Vector2i(dx, dy)
			if _board().map.is_land(c.x, c.y):
				tiles.append(_board().index_of(c))
	_island._on_lightning({"tiles": tiles, "target": _board().index_of(at)})
	await _wait(0.15)
	r.electrocute(2600, false)
	r.stun(2600)


## LE BLOOP : le calmar gicle sur le rival — puis sur moi, et mon ecran se tache.
func _bloop() -> void:
	var me: Vector2i = _island.local_run.at
	var r := _spawn_rival(_rival_near(me))
	await _wait(0.9)
	if _flag("hand"):
		await _aim_at(r, "bloop")
	r.inked(3000)
	Sound.play("hop", 0.6)
	await _wait(1.6)
	_island._rabbit.inked(3000)
	_hud._on_ink(3000)


## A L'EAU : un rival sur le rivage, moi derriere lui ; je le pousse, il vole
## a la mer, coule, et remonte plus loin.
func _drown() -> void:
	var board := _board()
	var best := {}
	var start: Vector2i = _island.local_run.at
	for c: Vector2i in board.content:
		if not board.map.is_land(c.x, c.y):
			continue
		for dir in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]:
			var sea: Vector2i = c + dir
			var back: Vector2i = c - dir
			if board.map.is_land(sea.x, sea.y) or not board.content.has(back):
				continue
			var d: float = Vector2(c - start).length()
			if best.is_empty() or d < float(best.d):
				best = {"c": c, "dir": dir, "sea": sea, "back": back, "d": d}
	if best.is_empty():
		return
	var shore: Vector2i = best.c
	var pusher: Vector2i = best.back
	_put_me(pusher)
	var r := _spawn_rival(shore)
	await _wait(1.0)
	# Le coup : je saute sur sa case, il part vers le large.
	await _hop_to(shore)
	await _wait(0.12)
	_island._on_pushed({"playerId": RIVAL, "from": board.index_of(shore), "sea": board.index_of(best.sea),
		"to": board.index_of(_middle_from(shore, best.dir)), "drowned": true, "stunMs": 1800,
		"pushedBy": "me"})


## Ou il remonte : quelques cases vers l'interieur.
func _middle_from(shore: Vector2i, dir: Vector2i) -> Vector2i:
	for k in [4, 3, 2]:
		var c: Vector2i = shore - dir * k
		if _board().content.has(c):
			return c
	return shore - dir


## LA BOMBE, LE COFFRE : pose a cote d'une case qui en cache un, il hesite,
## puis il y va — par la vraie regle du bac a sable (`_local_tap`), donc le vrai
## renvoi, la vraie ouverture.
func _step_on(kind: int) -> void:
	var board := _board()
	var start: Vector2i = _island.local_run.at
	var best := {}
	for c: Vector2i in board.content:
		if int(board.content[c]) != kind:
			continue
		for n in board._neighbours(c):
			if board.content.get(n) == IslandBoard.Content.BOMB or not board.may_step(n, c):
				continue
			var d: float = Vector2(n - start).length()
			if best.is_empty() or d < float(best.d):
				best = {"c": c, "n": n, "d": d}
	if best.is_empty():
		return
	_put_me(best.n)
	await _wait(1.4)
	await _by_hand(_cell_on_screen(best.c), func() -> void: _island._local_tap(best.c))


## Une case ou jouer un coup : `c` avec `c - dir` (moi) et `c + dir` (ou il
## part) sur l'ile, au plus pres du depart. `want` choisit ce que doit etre
## `c + dir` : "land" (de la terre sans bombe), "bomb" (une bombe pas
## creusee), "sea".
func _spot(want: String) -> Dictionary:
	var board := _board()
	var start: Vector2i = _island.local_run.at
	var best := {}
	for c: Vector2i in board.content:
		if board.content[c] == IslandBoard.Content.BOMB:
			continue
		for dir in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]:
			var me: Vector2i = c - dir
			var to: Vector2i = c + dir
			if not board.content.has(me) or board.content[me] == IslandBoard.Content.BOMB:
				continue
			var ok := false
			match want:
				"land":
					ok = board.content.has(to) and board.content[to] != IslandBoard.Content.BOMB
				"bomb":
					ok = board.content.get(to) == IslandBoard.Content.BOMB \
						and board.state.get(to) != IslandBoard.State.DUG
				"sea":
					ok = not board.map.is_land(to.x, to.y) and board.content.has(me - dir) \
						and board.content[me - dir] != IslandBoard.Content.BOMB
			if not ok:
				continue
			var d: float = Vector2(c - start).length()
			if best.is_empty() or d < float(best.d):
				best = {"c": c, "dir": dir, "me": me, "to": to, "d": d}
	return best


## KURO FOUDROIE SHIRO : il tombe du ciel a deux cases, et le carre autour de
## moi s'embrase.
func _zap() -> void:
	var me: Vector2i = _island.local_run.at
	_spawn_rival(_rival_near(me))
	await _wait(1.2)
	_strike_on(_island._rabbit, me, 2400)


func _strike_on(r: IslandRabbit, at: Vector2i, ms: int) -> void:
	var tiles := []
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var c: Vector2i = at + Vector2i(dx, dy)
			if _board().map.is_land(c.x, c.y):
				tiles.append(_board().index_of(c))
	_island._on_lightning({"tiles": tiles, "target": _board().index_of(at)})
	await _wait(0.15)
	r.electrocute(ms, false)
	r.stun(ms)


## SHIRO POUSSE KURO : je saute sur sa case, il vole d'une case — sur de la
## terre, ou (`onto_bomb`) sur une bombe, qui saute et le renvoie.
func _shove(onto_bomb: bool) -> void:
	var s := _spot("bomb" if onto_bomb else "land")
	if s.is_empty():
		push_warning("[trailer] pas de case pour la poussee")
		return
	_put_me(s.me)
	var r := _spawn_rival(s.c)
	await _wait(1.3)
	await _shove_hit(r, s.c, s.to, onto_bomb)


## Le coup : je saute sur `c`, Kuro vole vers `to`.
func _shove_hit(r: IslandRabbit, c: Vector2i, to: Vector2i, onto_bomb: bool) -> void:
	var board := _board()
	await _hop_to(c)
	await _wait(0.12)
	_island._on_pushed({"playerId": RIVAL, "from": board.index_of(c), "to": board.index_of(to),
		"stunMs": 0 if onto_bomb else 1600, "pushedBy": "me"})
	if not onto_bomb:
		return
	# Il se pose sur la bombe : elle saute, le souffle le rejette plus loin.
	await _wait(IslandRabbit.KNOCK_FLIGHT)
	var away := to + (to - c)
	if not board.content.has(away):
		away = to
	board.reveal_remote(board.index_of(to), "bomb", 0)
	_island._tiles.refresh()
	_island._on_remote_reveal(to, "bomb")
	r.blast_back(to, away)


## LE DUEL, d'une traite, au bord de l'eau : Kuro tombe du ciel, m'encre,
## me foudroie ; je me releve, je m'approche, et je le pousse a la mer.
func _duel() -> void:
	var s := _spot("sea")
	if s.is_empty():
		push_warning("[trailer] pas de rivage")
		return
	var shore: Vector2i = s.c
	var close: Vector2i = s.me
	var far: Vector2i = close - s.dir
	_put_me(far)
	await _wait(0.6)
	var r := _spawn_rival(shore)
	await _wait(1.3)
	# L'encre : le calmar sur moi, l'ecran tache.
	_island._rabbit.inked(2600)
	_hud._on_ink(2600)
	Sound.play("hop", 0.6)
	await _wait(2.4)
	# La foudre.
	await _strike_on(_island._rabbit, far, 2200)
	await _wait(2.8)
	# Je me releve, un pas vers lui.
	await _hop_to(close)
	_island._refresh_ring()
	await _wait(1.0)
	# La poussee, a la mer.
	await _hop_to(shore)
	await _wait(0.12)
	_island._on_pushed({"playerId": RIVAL, "from": _board().index_of(shore),
		"sea": _board().index_of(s.to), "to": _board().index_of(_middle_from(shore, s.dir)),
		"drowned": true, "stunMs": 1800, "pushedBy": "me"})


## `--hunt` : LE PILOTE QUI CHERCHE LES BOMBES. Il marche vers la bombe pas
## encore creusee la plus proche et saute dessus ; une case sur trois, il
## creuse a cote (des carottes, des chiffres), pour que ca reste du jeu. Il
## attend d'etre releve, et l'energie est remise a plein : la video ne
## s'arrete pas a sec.
func _auto_step() -> void:
	if _flag("hand") and not _flag("hunt"):
		_hand_step()
		return
	if not _flag("hunt"):
		super._auto_step()
		return
	var run := _island.local_run
	if _hand_busy or _auto_left <= 0 or run == null or not run.alive:
		return
	if run.is_stunned(Time.get_ticks_msec()) or _island._rabbit.hopping():
		return
	run.energy = maxi(run.energy, 200)
	var board := run.board
	var goal := Vector2i(-1, -1)
	var best := INF
	for c: Vector2i in board.content:
		if board.content[c] != IslandBoard.Content.BOMB or board.state.get(c) == IslandBoard.State.DUG:
			continue
		var d := Vector2(c - run.at).length()
		if d < best:
			best = d
			goal = c
	if goal.x < 0:
		goal = _safe_step(run)
		if goal.x < 0:
			return
	var pick := Vector2i(-1, -1)
	var pick_d := INF
	for n in board._neighbours(run.at):
		if not board.may_step(run.at, n):
			continue
		var bomb: bool = board.content.get(n) == IslandBoard.Content.BOMB and board.state.get(n) != IslandBoard.State.DUG
		if bomb and n != goal and randf() < 0.5:
			continue
		var d := Vector2(goal - n).length() + randf() * 1.2
		if n == goal:
			d = -1.0
		if d < pick_d:
			pick_d = d
			pick = n
	if pick.x < 0:
		return
	_auto_left -= 1
	_hand_busy = true
	await _by_hand(_cell_on_screen(pick), func() -> void: _island._local_tap(pick))
	_hand_busy = false


# ── `--hand` : LA MAIN DU JOUEUR ────────────────────────────────────────────
##
## Le pilote, mais on voit le doigt : la main du curseur du jeu
## (ui/cursors/hand.png) glisse jusqu'a la case, tape, et le lapin y va. Une
## bombe a cote, pas encore marquee : elle va d'abord taper MARK A BOMB, puis
## la case — et la croix rouge s'y pose. Le bac a sable triche (il sait ou
## sont les bombes) ; a l'ecran, c'est un joueur qui lit les chiffres.

var _hand: BenchHand
var _hand_busy := false


## Le milieu d'une case, a l'ecran : le losange au sol, la ou le lapin pose
## les pieds (home_rabbit.gd `_place`), passe par la camera de l'ile.
func _cell_on_screen(cell: Vector2i) -> Vector2:
	var map := _island._terrain.map
	var local: Vector2 = map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	return _island.get_global_transform_with_canvas() * local


## La main (bench_hand.gd) va a `at`, appuie, et `then` part.
func _hand_tap(at: Vector2, then: Callable) -> void:
	if _hand == null:
		_hand = BenchHand.new()
		add_child(_hand)
	await _hand.tap(at, then)


func _hand_step() -> void:
	var run := _island.local_run
	if _hand_busy or _auto_left <= 0 or run == null or not run.alive:
		return
	if run.is_stunned(Time.get_ticks_msec()) or _island._rabbit.hopping():
		return
	_hand_busy = true
	run.energy = maxi(run.energy, 120)
	var board := run.board
	# UNE BOMBE A COTE, pas marquee : la croix d'abord.
	var mine := Vector2i(-1, -1)
	for n in board._neighbours(run.at):
		if board.content.get(n) == IslandBoard.Content.BOMB and board.state.get(n) != IslandBoard.State.DUG \
				and not board.is_flagged(n):
			mine = n
			break
	if mine.x >= 0:
		# LA PLANCHE elle-meme (`_button`) : MarkBombButton couvre le HUD entier
		# et la pose dans son coin — son centre a lui tombait au milieu de l'ile.
		var button: Control = _hud.mark_button.get("_button")
		var at := button.get_global_rect().get_center()
		await _hand_tap(at, func() -> void: RunState.current.set_flag_mode(true))
		await _wait(0.35)
		await _hand_tap(_cell_on_screen(mine), func() -> void: _island._local_tap(mine))
		_auto_left -= 1
		await _wait(0.5)
		_hand_busy = false
		return
	var pick := _safe_step(run)
	if pick.x >= 0:
		await _hand_tap(_cell_on_screen(pick), func() -> void: _island._local_tap(pick))
		_auto_left -= 1
	_hand_busy = false


## Le pas du pilote du bac a sable (dig_sandbox `_auto_step`) : vers le coffre
## le plus proche, jamais sur une bombe.
func _safe_step(run: LocalRun) -> Vector2i:
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
		return goal
	var pick := Vector2i(-1, -1)
	var pick_d := INF
	for n in board._neighbours(run.at):
		if not board.may_step(run.at, n) or board.content.get(n) == IslandBoard.Content.BOMB:
			continue
		var d := Vector2(goal - n).length() + randf() * 1.5
		if d < pick_d:
			pick_d = d
			pick = n
	return pick



## LA RANGEE D'ARMES du HUD de manche (l'eclair, le bloop) : elle ne se montre
## que sur une ile ou l'on se bat — niveau 10, plusieurs sieges — et avec
## quelque chose dans le sac.
func _arm_up() -> void:
	var state := RunState.current
	state.island = {"level": 10}
	state.island_changed.emit(state.island)
	state.set_bag({"lightning": 3, "bloop": 2})


## LE GESTE DU JOUEUR : la main tape l'arme (`strike`, `bloop`) dans la
## rangee, la visee s'arme (« tap a rabbit »), puis elle tape Kuro — le coup
## part au moment ou le doigt le touche, et le sac perd une charge.
func _aim_at(r: IslandRabbit, mode: String) -> void:
	var state := RunState.current
	var button: Control = _hud.get("_strike" if mode == "strike" else "_bloop")
	await _hand_tap(button.get_global_rect().get_center(), func() -> void: state.set_aiming(mode))
	await _wait(0.5)
	# Le milieu du corps, pas les pieds (island.gd `_rival_near`).
	var body := r.get_global_transform_with_canvas() * Vector2(0, -16.0 * HomeRabbit.RABBIT_SCALE * 0.5)
	await _hand_tap(body, func() -> void:
		state.set_aiming("")
		var left := state.bag.duplicate()
		left[("lightning" if mode == "strike" else "bloop")] -= 1
		state.set_bag(left))



## UN GESTE DE SHIRO : avec `--hand`, la main va le faire (glisse, tape) ;
## sans, il part tout de suite.
func _by_hand(at: Vector2, action: Callable) -> void:
	if _flag("hand"):
		await _hand_tap(at, action)
	else:
		action.call()


## Je saute sur `cell` — une poussee, un pas : la main tape la case.
func _hop_to(cell: Vector2i) -> void:
	await _by_hand(_cell_on_screen(cell), func() -> void:
		_island._rabbit.send_to(cell)
		Sound.play("hop"))
