extends SceneTree
## LES REGLES D'UN PAS ET D'UN X, hors ligne (`local_run.gd`), contre ce que
## run.ts `resolveMove` / `flagTile` decident.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_dig.gd
##
## ATTENDU : chaque ligne `ok`, puis `CREUSAGE : OK`.
##
## Une ile reelle (`default` / `abc`, celle du fixture) : on y cherche une
## case de chaque sorte a cote du lapin plutot que d'en fabriquer une. Une
## regle mesuree sur un plateau invente dit ce que le plateau invente permet.

var _ok := true


func _check(label: String, cond: bool) -> void:
	print("   %s %s" % ["ok  " if cond else "FAUX", label])
	_ok = _ok and cond


func _init() -> void:
	var map := IslandMap.new()
	map.grow("default")
	var ground := IslandGround.new(map, FirstIsland.ground_seed("default"))
	var board := IslandBoard.new(map)
	board.deal_generated(ground, "default", "abc", 0.0)
	var t := IslandBoard._tuning()
	var run := LocalRun.new(board, board.spawn)
	var now := 1000

	_check("depart : %d d'energie" % int(t.ENERGY.START), run.energy == int(t.ENERGY.START))
	_check("le depart est creuse", board.is_dug(board.spawn))

	# 1. MARCHER SUR DU CREUSE EST GRATUIT.
	var dug_n := Vector2i(-1, -1)
	for n in ground.steps_from(board.spawn):
		if board.is_dug(n):
			dug_n = n
			break
	var e0 := run.energy
	var out := run.move(dug_n, now)
	_check("un pas sur du creuse ne coute rien", out.ok and run.energy == e0 and not out.has("dig"))
	run.move(board.spawn, now)

	# 2. UNE CASE PAS VOISINE EST REFUSEE.
	out = run.move(board.spawn + Vector2i(3, 0), now)
	_check("une case a trois pas est refusee", not out.ok and out.reason == "blocked")

	# 3. CREUSER : une carotte coute DIG_COST et paie CARROT_VALUE.
	var found := _walk_to_kind(board, ground, run, IslandBoard.Content.CARROT, now)
	_check("une carotte trouvee a cote du lapin", found.x >= 0)
	if found.x >= 0:
		e0 = run.energy
		var c0 := run.carrots
		out = run.move(found, now)
		_check("carotte : -%d energie, +%d carottes" % [int(t.ENERGY.DIG_COST), int(t.RUN.CARROT_VALUE)],
			out.ok and run.energy == e0 - int(t.ENERGY.DIG_COST) + int(t.ENERGY.CARROT_GAIN)
			and run.carrots == c0 + int(t.RUN.CARROT_VALUE) and run.at == found)

	# 4. UN X JUSTE, puis la bombe est un mur.
	var bomb := _walk_beside_kind(board, ground, run, IslandBoard.Content.BOMB, now)
	_check("une bombe trouvee a cote du lapin", bomb.x >= 0)
	if bomb.x >= 0:
		e0 = run.energy
		out = run.flag(bomb, now)
		_check("X juste : marquee, +xGain borne, serie 1", out.ok and bool(out.flag.correct)
			and board.is_flagged(bomb) and run.flag_streak == 1
			and run.energy == mini(int(t.ENERGY.MAX), e0 + int(board.tier.xGain)))
		out = run.move(bomb, now)
		_check("une bombe marquee refuse le pas", not out.ok and out.reason == "flagged")

	# 5. UN X FAUX : -FLAG.LOSS, la serie retombe, la case se montre.
	var safe := Vector2i(-1, -1)
	for n in board._neighbours(run.at):
		if board.state.get(n) == IslandBoard.State.BURIED \
				and board.content[n] != IslandBoard.Content.BOMB \
				and board.content[n] != IslandBoard.Content.CHEST:
			safe = n
			break
	if safe.x >= 0:
		e0 = run.energy
		out = run.flag(safe, now)
		_check("X faux : -%d, serie 0, case indicee" % int(t.FLAG.LOSS), out.ok
			and not bool(out.flag.correct) and run.energy == e0 - int(t.FLAG.LOSS)
			and run.flag_streak == 0 and board.state[safe] == IslandBoard.State.HINTED)

	# 6. UNE BOMBE CREUSEE : -(DIG_COST + BOMB_LOSS), sonne, le lapin dans le cratere.
	var bomb2 := _walk_beside_kind(board, ground, run, IslandBoard.Content.BOMB, now, true)
	if bomb2.x >= 0:
		e0 = run.energy
		out = run.move(bomb2, now)
		var loss := int(t.ENERGY.DIG_COST) + int(t.ENERGY.BOMB_LOSS)
		_check("bombe : -%d, lapin sur la case" % loss, out.ok and run.energy == e0 - loss
			and run.at == bomb2 and out.dig.has("knockback"))
		out = run.move(board.spawn, now + 10)
		_check("sonne : le pas suivant est refuse", not out.ok and out.reason == "stunned")
		now += int(t.BOMB.STUN_MS) + 1

	# 7. UN COFFRE : son lot est celui de `chest_loot`, et l'ile se finit au dernier.
	var p0 := board.chest_progress()
	for c in board.chest_tier:
		board.state[c] = IslandBoard.State.DUG
	var p1 := board.chest_progress()
	_check("tous les coffres pris : %d/%d -> fraction 1" % [p0.left, p0.total],
		int(p1.left) == 0 and float(p1.fraction) == 1.0)

	print("CREUSAGE : %s" % ("OK" if _ok else "CASSE"))
	quit(0 if _ok else 1)


## Marche (sur du sol sur, en trichant — l'energie est remise a plein) jusqu'a
## ce qu'une case de `kind` touche le lapin ; rend cette case.
func _walk_beside_kind(board: IslandBoard, ground: IslandGround, run: LocalRun,
		kind: int, now: int, unflagged: bool = false) -> Vector2i:
	for step in range(400):
		for n in board._neighbours(run.at):
			if board.content[n] != kind or board.state[n] != IslandBoard.State.BURIED \
					or board.is_flagged(n):
				continue
			# Un X vise n'importe quelle voisine ; un pas veut une case ou
			# l'on peut marcher. `unflagged` : on veut CREUSER la bombe.
			if (kind == IslandBoard.Content.BOMB and not unflagged) or board.may_step(run.at, n):
				return n
		var moves: Array[Vector2i] = []
		for n in ground.steps_from(run.at):
			if board.content.has(n) and board.content[n] != IslandBoard.Content.BOMB \
					and board.may_step(run.at, n):
				moves.append(n)
		if moves.is_empty():
			return Vector2i(-1, -1)
		run.energy = 300
		run.move(moves[step * 7 % moves.size()], now)
	return Vector2i(-1, -1)


func _walk_to_kind(board: IslandBoard, ground: IslandGround, run: LocalRun, kind: int,
		now: int) -> Vector2i:
	return _walk_beside_kind(board, ground, run, kind, now)
