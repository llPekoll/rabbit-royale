extends Node2D
## LE BANC DE LA DEFENSE : le vrai terrier (burrow.tscn), en mode pose, avec
## des bombes factices — une armee, une en recharge a mi-chemin, une relevee
## sous le doigt — pour les voir en une capture, sans compte ni serveur.
##
##   godot --path godot scenes/bench/defend_bench.tscn -- --shot=defend.png --after=2
##   ... -- --seed=paul --lift          # un autre terrier ; l'apercu de retrait
##   ... -- --ghost --after=1.25        # le fantome d'une pose en vol et son
##                                      # anneau d'or (tape a 1,1 s)
##   ... -- --raid --after=2.2          # un raid factice : arrive (0,3 s), deux
##                                      # pas, une bombe saute (1,8 s), l'eclair
##                                      # (3 s)
##
## `ShopState.fake` coupe le reseau : aucune bombe ne part vers ws.rabbit.rip.

var _burrow: Node2D


func _ready() -> void:
	var seed_text := "burrow"
	var lift := false
	var home := false
	var raid := false
	var ghost := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--seed="):
			seed_text = arg.trim_prefix("--seed=")
		elif arg == "--lift":
			lift = true
		elif arg == "--home":
			home = true
		elif arg == "--raid":
			raid = true
		elif arg == "--ghost":
			ghost = true
	Session.player = {"id": seed_text}

	var shop := ShopState.shared()
	shop.fake([], {"held": 3, "maxPlaced": 8})

	# Trois bombes sur des cases que le SERVEUR accepterait : une au potager,
	# deux sur le sol entre la porte et lui.
	var layout := BurrowLayout.of(seed_text)
	var picks: Array[int] = [layout.field[0]]
	for tile in layout.walkable_tiles():
		if picks.size() >= 3:
			break
		if layout.is_trappable(tile) and layout.kind(tile) == BurrowLayout.Cell.GROUND \
				and tile % 5 == 0:
			picks.append(tile)
	var half := Time.get_datetime_string_from_unix_time(
		int(Time.get_unix_time_from_system()) + int(Tuning.i("TRAPS.REARM_MS") / 2000))

	_burrow = preload("res://scenes/burrow.tscn").instantiate()
	add_child(_burrow)
	shop.traps["placed"] = picks
	shop.traps["armed"] = [picks[0], picks[2]]
	shop.traps["rearming"] = [{"tile": picks[1], "readyAt": half + "Z"}]
	shop.changed.emit()

	await get_tree().create_timer(0.3).timeout
	if not home:
		_burrow.call("set_placing", true)
	if lift:
		await get_tree().create_timer(0.8).timeout
		_burrow.get_node("Traps").call("set_lifted", picks[2])
	if ghost:
		# UNE POSE EN VOL, sans serveur : le fantome tient la case, l'anneau part.
		# Au milieu du terrier, pour qu'elle soit dans le cadre.
		var free := -1
		var tiles: Array = layout.walkable_tiles()
		for i in range(tiles.size() / 2, tiles.size()):
			if layout.is_trappable(tiles[i]) and not picks.has(tiles[i]):
				free = tiles[i]
				break
		await get_tree().create_timer(0.8).timeout
		_burrow.get_node("Traps").call("pin_ghost", free)
	DevShot.arm(self)
	if raid:
		_play_raid(layout)


## Un raid qui entre par la porte et marche vers le potager, pousse comme la
## socket le pousserait — `RaidState.fake` n'appelle jamais le serveur.
func _play_raid(layout: BurrowLayout) -> void:
	var path := _walk_from(layout, layout.entrance, 2)
	var inc := {"raidId": "bench", "attacker": {"id": "a1", "name": "Nettle", "avatar": "brown"},
		"tile": layout.entrance, "energy": 58, "walked": [layout.entrance], "trapsSprung": 0,
		"finished": false, "succeeded": false, "struck": false, "carrotsLooted": 0}
	RaidState.current.fake({"incoming": inc.duplicate(true), "lightning": 2})
	for i in range(path.size()):
		await get_tree().create_timer(0.6).timeout
		inc.tile = path[i]
		(inc.walked as Array).append(path[i])
		if i == path.size() - 1:
			inc.trapsSprung = 1
		RaidState.current.fake({"incoming": inc.duplicate(true)})
	await get_tree().create_timer(1.2).timeout
	inc.struck = true
	inc.finished = true
	RaidState.current.fake({"incoming": inc.duplicate(true)})


## Quelques pas depuis la porte, sur des cases qu'on marche.
static func _walk_from(layout: BurrowLayout, from: int, steps: int) -> Array[int]:
	var out: Array[int] = []
	var at := from
	for n in range(steps):
		var here := BurrowLayout.cell_of(at)
		var best := -1
		for s in BurrowLayout.STEPS:
			var c := here + s
			if c.x < 0 or c.y < 0 or c.x >= BurrowLayout.COLS or c.y >= BurrowLayout.ROWS:
				continue
			var t := BurrowLayout.index(c)
			if layout.is_walkable(t) and not out.has(t) and t != from:
				if best < 0 or BurrowLayout.cell_of(t).distance_squared_to(
						BurrowLayout.cell_of(layout.field[0])) < BurrowLayout.cell_of(best) \
						.distance_squared_to(BurrowLayout.cell_of(layout.field[0])):
					best = t
		if best < 0:
			break
		out.append(best)
		at = best
	return out
