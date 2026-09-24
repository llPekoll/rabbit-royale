extends RefCounted
class_name LocalRun
## UNE MANCHE HORS LIGNE — ce que le serveur decide d'un pas, rejoue ici.
##
## Porte de src/lib/game/run.ts, `resolveMove` et `flagTile`, pour UN lapin
## seul. Il n'y a PAS d'action « creuser » sur le web : le client envoie
## `move {tile}`, et un pas sur une case enterree la creuse — le lapin finit
## dessus, en un seul geste. On garde ce contrat mot pour mot : c'est lui que
## le chrome devra envoyer au serveur le jour ou l'ile passera en ligne.
##
## ⚠ SERT LE BAC A SABLE ET LES BANCS, pas une vraie manche. En ligne, les
## contenus ne sont pas connus du client (voir island_board.gd) et chacune de
## ces decisions revient au serveur. Ce qui est porte ici est la REGLE ; la
## verite reste la-bas.
##
## Ce qui n'est pas porte, parce qu'un lapin seul ne le rencontre pas : la
## poussee (`planPush`), les bombes posees par un rival, la cadence minimale
## entre deux pas (`MIN_MOVE_INTERVAL_MS`), la retenue du tutoriel (le
## tutoriel a son propre chemin dans island.gd).

var board: IslandBoard
var at := Vector2i(-1, -1)
var energy := 0
var carrots := 0
var alive := true
## L'heure (ms, `Time.get_ticks_msec`) avant laquelle le lapin est sonne.
var stunned_until := 0
var flag_streak := 0
## Le sac : `{kind: nombre}` — eau, engrais, bombes, bouclier, eclair.
var loot: Dictionary = {}
var nfts := 0
## Le compte de la manche, ce que le recap montrera (`NO_DIGS` de RunState).
var digs := {"tiles": 0, "bombs": 0, "goldens": 0, "chests": 0, "flags": 0}

var _tune: Dictionary


func _init(p_board: IslandBoard, start: Vector2i) -> void:
	board = p_board
	at = start
	_tune = IslandBoard._tuning()
	energy = int(_tune.ENERGY.START)


func _cap(v: int) -> int:
	return mini(int(_tune.ENERGY.MAX), v)


func is_stunned(now: int) -> bool:
	return now < stunned_until


## UN PAS VERS `to`. Rend le `MoveOutcome` du web, en dictionnaire :
##
##   {ok, reason, tile, energy, carrots, run_over, dig: {tile, content,
##    adjacent, energy_delta, carrot_delta, loot, hinted, knockback}}
##
## `reason` vaut, comme `MoveRejection` : dead, stunned, off-island, flagged,
## blocked, no-energy.
func move(to: Vector2i, now: int) -> Dictionary:
	if not alive:
		return _reject("dead")
	if is_stunned(now):
		return _reject("stunned")
	if not board.content.has(to):
		return _reject("off-island")
	# UN X ROUGE EST UN MUR : on a prouve qu'il y a une bombe, un doigt qui
	# glisse ne doit pas couter une manche.
	if board.is_flagged(to) and not board.is_dug(to):
		return _reject("flagged")
	if not board.is_beside(at, to) or not board.may_step(at, to):
		return _reject("blocked")

	# LE SOL DEJA CREUSE SE PARCOURT GRATUITEMENT — « looking is free ». La
	# cascade repart quand meme du pied du lapin : un zero ouvert par un autre
	# peut avoir laisse une zone a finir.
	if board.is_dug(to):
		at = to
		var hinted := board.cascade_hints([to])
		return _ok({"hinted": hinted})

	# UNE CASE INDICEE N'EST PAS GRATUITE : son chiffre est connu, son contenu
	# non, et y marcher la creuse.
	var cost := int(_tune.ENERGY.DIG_COST)
	if energy <= 0 or energy < cost:
		return _reject("no-energy")

	board.state[to] = IslandBoard.State.DUG
	energy -= cost
	digs.tiles += 1
	var kind: int = board.content[to]
	var dig := {
		"tile": to, "content": kind, "adjacent": board.adjacent.get(to, 0),
		"energy_delta": -cost, "carrot_delta": 0,
	}

	match kind:
		IslandBoard.Content.BOMB:
			# LE SOUFFLE LE RENVOIE D'OU IL VIENT (run.ts, `cameFrom`, depuis
			# le 2026-09-23) : il saute sur la bombe, elle saute, il retombe sur
			# sa case de depart.
			# BOMB_LOSS TOUT COMPRIS (run.ts, 2026-09-23) : le point du creusage
			# fait partie du souffle — 30 a l'ecran, 30 payes, pas 31.
			var loss := int(_tune.ENERGY.BOMB_LOSS)
			energy -= loss - cost
			dig.energy_delta = -loss
			stunned_until = now + int(_tune.BOMB.STUN_MS)
			flag_streak = 0
			digs.bombs += 1
			dig.knockback = {"tile": at, "stunned_until": stunned_until}
		IslandBoard.Content.CARROT, IslandBoard.Content.GOLDEN:
			var golden := kind == IslandBoard.Content.GOLDEN
			var gain := int(_tune.ENERGY.GOLDEN_GAIN if golden else _tune.ENERGY.CARROT_GAIN)
			var value := int(_tune.RUN.GOLDEN_VALUE if golden else _tune.RUN.CARROT_VALUE)
			energy = _cap(energy + gain)
			carrots += value
			dig.energy_delta += gain
			dig.carrot_delta = value
			if golden:
				digs.goldens += 1
		IslandBoard.Content.CHEST:
			var prize := board.chest_loot(to)
			digs.chests += 1
			dig.loot = prize
			if prize.nft:
				nfts += 1
			if prize.kind == "carrots":
				carrots += int(prize.amount)
				dig.carrot_delta = int(prize.amount)
			elif prize.kind == "nft":
				nfts += 1
			else:
				loot[prize.kind] = int(loot.get(prize.kind, 0)) + int(prize.amount)
	if not dig.has("knockback"):
		at = to

	# La cascade part d'ou le lapin S'ARRETE (run.ts `cascadeAround(rabbit.tile)`).
	var opened := board.cascade_hints([at])
	if not opened.is_empty():
		dig.hinted = opened
	if energy <= 0:
		energy = 0
		alive = false
	return _ok({"dig": dig})


## UN X SUR `cell`, depuis la case du lapin (`flagTile`).
##
## JUSTE : la case est marquee, l'energie remonte du gain du palier, et la
## serie paie en carottes (1, 2, 3, plafonnee) — plus ce que l'energie pleine
## n'a pas pu prendre. FAUX : quinze d'energie, la serie retombe, et la case
## payee montre son chiffre. Rien n'est creuse dans les deux cas.
##
##   {ok, reason, energy, carrots, run_over, flag: {tile, correct,
##    energy_delta, carrot_delta, streak, item, hinted}}
func flag(cell: Vector2i, now: int) -> Dictionary:
	if not alive:
		return _reject("dead")
	if is_stunned(now):
		return _reject("stunned")
	if not board.content.has(cell):
		return _reject("off-island")
	if not board.is_beside(at, cell):
		return _reject("not-adjacent")
	var st = board.state.get(cell)
	if st == IslandBoard.State.DUG or st == IslandBoard.State.HINTED \
			or board.is_flagged(cell) or board.content[cell] == IslandBoard.Content.CHEST:
		return _reject("known")

	var f := FlagRules.new(_tune)
	if board.content[cell] == IslandBoard.Content.BOMB:
		board.flagged[cell] = true
		var before := energy
		var tier: Dictionary = board.tier if not board.tier.is_empty() \
			else IslandBoard.tier_for(0.0)
		var gain := int(tier.xGain)
		energy = _cap(energy + gain)
		flag_streak += 1
		var overflow := gain - (energy - before)
		var won := mini(f.most, f.base + f.step * (flag_streak - 1)) + overflow * f.overflow
		carrots += won
		digs.flags += 1
		var item := flag_streak % f.item_every == 0
		if item:
			loot["bomb"] = int(loot.get("bomb", 0)) + 1
		return _ok({"flag": {"tile": cell, "correct": true, "energy_delta": energy - before,
			"carrot_delta": won, "streak": flag_streak, "item": item}})

	energy -= f.loss
	flag_streak = 0
	board.state[cell] = IslandBoard.State.HINTED
	var hinted: Array[Vector2i] = [cell]
	hinted.append_array(board.cascade_hints([at]))
	if energy <= 0:
		energy = 0
		alive = false
	return _ok({"flag": {"tile": cell, "correct": false, "energy_delta": -f.loss,
		"carrot_delta": 0, "streak": 0, "hinted": hinted}})


func _reject(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "tile": at, "energy": energy,
		"carrots": carrots, "run_over": not alive}


func _ok(extra: Dictionary) -> Dictionary:
	var out := {"ok": true, "tile": at, "energy": energy, "carrots": carrots,
		"run_over": not alive}
	out.merge(extra)
	return out


## Les nombres de `FLAG`, lus une fois.
class FlagRules:
	var loss: int
	var base: int
	var step: int
	var most: int
	var item_every: int
	var overflow: int

	func _init(t: Dictionary) -> void:
		loss = int(t.FLAG.LOSS)
		base = int(t.FLAG.CARROTS_BASE)
		step = int(t.FLAG.CARROTS_STEP)
		most = int(t.FLAG.CARROTS_MAX)
		item_every = int(t.FLAG.ITEM_EVERY)
		overflow = int(t.FLAG.OVERFLOW_CARROTS)
