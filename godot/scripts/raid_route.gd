class_name RaidRoute
## LE CHEMIN DU PILLARD, tel qu'il LIT un terrier : le moins cher de la porte
## a une case du potager. Chaque pas coute RAID_RUN.STEP_COST, une bombe
## TRAPS.DRAIN en plus, une planche refuse le pas (`fenceBlocks`). C'est le
## pire cas pour le defenseur — ce que BURY montre en direct, et ce que
## TESTER fait marcher (ne du banc burrow_ux_bench, 2026-10-13).
##
## `cheapest` rend {path: Array[int], hits: Array[int], cost: int}, ou `{}`
## si le potager est ferme.


## Ce qu'un pillard a pour marcher chez nous : sa mise moins le peage.
static func budget() -> int:
	return Tuning.i("RAID_RUN.STAKE") - Tuning.i("RAID_RUN.TOLL")


static func cheapest(layout: BurrowLayout, bombs: Array, planks: Array) -> Dictionary:
	var step_cost := Tuning.i("RAID_RUN.STEP_COST")
	var drain := Tuning.i("TRAPS.DRAIN")
	var field := {}
	for t in layout.field:
		field[t] = true
	var mined := {}
	for b in bombs:
		mined[int(b)] = true
	var fenced := {}
	for seg in planks:
		fenced["%d%s" % [int(seg["tile"]), String(seg["side"])]] = true
	var start := layout.entrance
	var cost := {start: 0}
	var came := {}
	var open: Array[int] = [start]
	var done := {}
	var goal := -1
	while not open.is_empty():
		# Dijkstra sur quelques centaines de cases : la liste suffit.
		var best_i := 0
		for i in open.size():
			if int(cost[open[i]]) < int(cost[open[best_i]]):
				best_i = i
		var tile: int = open[best_i]
		open.remove_at(best_i)
		if done.has(tile):
			continue
		done[tile] = true
		if field.has(tile):
			goal = tile
			break
		var c := BurrowLayout.cell_of(tile)
		for s in BurrowLayout.STEPS:
			var n := c + s
			if n.x < 0 or n.x >= BurrowLayout.COLS or n.y < 0 or n.y >= BurrowLayout.ROWS:
				continue
			var nt := BurrowLayout.index(n)
			if done.has(nt) or not layout.is_walkable(nt):
				continue
			if absi(layout.map.level_at(n.x, n.y) - layout.map.level_at(c.x, c.y)) > BurrowLayout.MAX_STEP:
				continue
			if fence_blocks(field, fenced, tile, nt):
				continue
			var nc := int(cost[tile]) + step_cost + (drain if mined.has(nt) else 0)
			if not cost.has(nt) or nc < int(cost[nt]):
				cost[nt] = nc
				came[nt] = tile
				open.append(nt)
	if goal < 0:
		return {}
	var path: Array[int] = [goal]
	while path[0] != start:
		path.push_front(int(came[path[0]]))
	var hits: Array[int] = []
	for t in path:
		if mined.has(t):
			hits.append(t)
	return {"path": path, "hits": hits, "cost": int(cost[goal])}


## fence.ts `fenceBlocks`, porte tel quel : une planche refuse le pas qui la
## traverse, et une diagonale passe par un sommet — toute planche qui le
## touche l'arrete. `fenced` : "<tuile><cote>" -> true.
static func fence_blocks(field: Dictionary, fenced: Dictionary, from: int, to: int) -> bool:
	if fenced.is_empty():
		return false
	if field.has(from) and field.has(to):
		return false
	var inner := to if field.has(to) else (from if field.has(from) else -1)
	if inner < 0:
		return false
	var outer := from if inner == to else to
	var a := BurrowLayout.cell_of(inner)
	var b := BurrowLayout.cell_of(outer)
	var dc := b.x - a.x
	var dr := b.y - a.y
	var has := func(t: int, side: String) -> bool: return fenced.has("%d%s" % [t, side])
	var side_dc := "" if dc == 0 else ("SE" if dc > 0 else "NW")
	var side_dr := "" if dr == 0 else ("SW" if dr > 0 else "NE")
	if side_dc == "":
		return has.call(inner, side_dr)
	if side_dr == "":
		return has.call(inner, side_dc)
	if has.call(inner, side_dc) or has.call(inner, side_dr):
		return true
	var along_dc := Vector2i(a.x + dc, a.y)
	var along_dr := Vector2i(a.x, a.y + dr)
	for pair in [[along_dc, side_dr], [along_dr, side_dc]]:
		var c: Vector2i = pair[0]
		if c.x < 0 or c.x >= BurrowLayout.COLS or c.y < 0 or c.y >= BurrowLayout.ROWS:
			continue
		var t := BurrowLayout.index(c)
		if field.has(t) and has.call(t, pair[1]):
			return true
	return false
