extends SceneTree
## LA DONNE HORS LIGNE CONTRE CELLE DU SERVEUR, case par case.
##
##   bun tools/export-godot-deal-fixture.ts          # depuis la racine du depot
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_deal.gd
##
## ATTENDU : une ligne `OK` par ile, puis `DONNE : OK`.
##
## Ce qui est compare, pour chaque case du plateau : le contenu, le palier du
## coffre, l'etat (creusee / indicee / enterree) et le chiffre. Plus le nombre
## d'objets poses (le decor decide quelles cases existent) et l'apparition.
##
## POURQUOI C'EST LA SEULE SONDE QUI COMPTE ICI. Le moindre ecart d'ordre —
## une case de plus au plateau, un tri instable, un tirage de trop — decale
## TOUS les tirages suivants. La premiere difference se voit donc au premier
## coup d'oeil ; ce qui n'est pas mesure, c'est une ile « presque » juste, et
## une ile presque juste est une autre ile.

const FIXTURE := "res://tools/deal_fixture.json"

const LETTER := {
	IslandBoard.Content.EMPTY: "E", IslandBoard.Content.CARROT: "C",
	IslandBoard.Content.GOLDEN: "G", IslandBoard.Content.BOMB: "B",
	IslandBoard.Content.CHEST: "K",
}


func _init() -> void:
	var text := FileAccess.get_file_as_string(FIXTURE)
	var cases: Array = JSON.parse_string(text)
	var all_ok := true
	for c in cases:
		all_ok = _check(c) and all_ok
	print("DONNE : %s" % ("OK" if all_ok else "CASSEE"))
	quit(0 if all_ok else 1)


func _check(c: Dictionary) -> bool:
	var seed_text: String = c.seed
	var map := IslandMap.new()
	map.grow(seed_text)
	var ground := IslandGround.new(map, FirstIsland.ground_seed(seed_text))
	var board := IslandBoard.new(map)
	var t0 := Time.get_ticks_msec()
	board.deal_generated(ground, seed_text, c.contentSeed, float(c.lifetime))
	var ms := Time.get_ticks_msec() - t0

	var problems: Array[String] = []
	if ground.placements.size() != int(c.placements):
		problems.append("decor %d, attendu %d" % [ground.placements.size(), c.placements])
	if board.index_of(board.spawn) != int(c.spawn):
		problems.append("depart %d, attendu %d" % [board.index_of(board.spawn), c.spawn])

	var want: Dictionary = c.tiles
	var got := {}
	for cell in board.content:
		var s: String = LETTER[board.content[cell]]
		if board.chest_tier.has(cell):
			s += String(board.chest_tier[cell])[0]
		match board.state.get(cell):
			IslandBoard.State.DUG:
				s += "d"
			IslandBoard.State.HINTED:
				s += "h"
		s += str(board.adjacent.get(cell, 0))
		got[str(board.index_of(cell))] = s
	if got.size() != want.size():
		problems.append("plateau %d cases, attendu %d" % [got.size(), want.size()])
	var shown := 0
	for k in want:
		if got.get(k, "?") != want[k]:
			if shown < 6:
				problems.append("case %s : %s, attendu %s" % [k, got.get(k, "absente"), want[k]])
			shown += 1
	if shown > 6:
		problems.append("… et %d autres" % (shown - 6))

	# CE QUE CHAQUE COFFRE PAIE, tire du meme rng que le serveur.
	var loot: Dictionary = c.get("loot", {})
	for k in loot:
		var i := int(k)
		var cell := Vector2i(i % map.width, i / map.width)
		var l := board.chest_loot(cell)
		var got_l := "%s:%d%s" % [l.kind, l.amount, ":nft" if l.nft else ""]
		if got_l != loot[k]:
			problems.append("coffre %s : %s, attendu %s" % [k, got_l, loot[k]])

	var p := board.chest_progress()
	var line := "%-12s %d cases, %d coffres (%d lots), %d ms" % [seed_text, got.size(), p.total,
		loot.size(), ms]
	if problems.is_empty():
		print("OK   " + line)
		return true
	print("FAUX " + line)
	for pr in problems:
		print("     " + pr)
	return false
