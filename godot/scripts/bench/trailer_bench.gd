extends "res://scripts/dig_sandbox.gd"
## LE PLATEAU DE TOURNAGE — le bac a sable, plus un rival et des coups qui
## n'existent qu'en ligne (foudre, bloop, poussee a l'eau), rejoues ici sans
## serveur pour filmer une pub. Les coups passent par les memes fonctions que
## les evenements de la socket ; seule la mise en scene est inventee.
##
##   godot --path godot --write-movie /tmp/lightning.avi --fixed-fps 30 \
##     --quit-after 210 scenes/bench/trailer_bench.tscn -- --clean --beat=lightning
##
## `--beat=` : lightning | bloop | drown | bomb | chest. Sans `--beat`, c'est le bac a sable
## avec le son : creuser au pilote (`--auto=N --auto-every=0.8`).

const RIVAL := "rival"


func _ready() -> void:
	# LE SON DU JEU : un banc n'a pas de racine qui l'heberge (`Sound.host`),
	# il restait muet — et la video avec lui.
	Sound.host(self)
	# Les effets seuls : l'ambiance les couvrait (0,3 contre 0,15 pour
	# l'explosion). Le montage remet la musique dessous, plus bas.
	Sound._ambient.stop()
	super._ready()
	var beat: String = _args().get("beat", "")
	await get_tree().create_timer(0.8).timeout
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
	r.set_plate("degen", false)
	return r


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
	_island._rabbit.send_to(shore)
	Sound.play("hop")
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
	_island._local_tap(best.c)
