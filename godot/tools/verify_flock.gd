extends SceneTree
## LES MOUTONS S'ENFUIENT — le troupeau hors ligne (IslandFlock, porte de
## flee.ts) et la marche du decor, sur une vraie ile.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_flock.gd
##
## ATTENDU : chaque ligne finit par « ok ».

var _fails := 0


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("   %s   %s" % ["ok" if ok else "ECHEC", label])


func _init() -> void:
	_run.call_deferred()


func _run() -> void:
	var island: Node = (load("res://scenes/island.tscn") as PackedScene).instantiate()
	get_root().add_child(island)
	await process_frame
	island.play_local("sandbox-42", "content-42")
	await process_frame
	var ground: IslandGround = island._ground
	# Le tour automatique coupe le temps des mesures a la main.
	var run: LocalRun = island.local_run
	island.local_run = null
	_check("des moutons sur l'ile", ground.sheep.size() > 0)
	var ids: Array = ground.sheep.keys()
	var id: String = ids[0]
	var at: Vector2i = ground.sheep[id]
	_check("l'id est celui du web (sheep-N)", id.begins_with("sheep-"))
	var beside := Vector2i(-1, -1)
	for c in ground.steps_from(at):
		if ground.can_step(c, at) and not ground.has_sheep(c):
			beside = c
			break
	_check("un mouton bloque le pas", beside.x >= 0 and not island._board.may_step(beside, at))
	_check("sa case reste au plateau", island._board.content.has(at))

	# UN LAPIN A COTE : le mouton detale au tour suivant.
	var near := Vector2i(-1, -1)
	for c in ground.steps_from(at):
		if not ground.has_sheep(c):
			near = c
			break
	var flights := IslandFlock.plan(ground, [near] as Array[Vector2i])
	var mine: Dictionary = {}
	for f in flights:
		if f.id == id:
			mine = f
	_check("affole, il part", not mine.is_empty())
	_check("en courant", bool(mine.get("sprinting", false)))
	var to: Vector2i = mine.get("to", at)
	var far := maxi(absi(to.x - near.x), absi(to.y - near.y))
	_check("loin du lapin (%d cases)" % far, far >= 2)
	_check("chemin contigu", _contiguous(at, mine.get("path", [])))

	# APPLIQUE COMME LE SERVEUR : le plateau d'abord, le sprite rattrape.
	island._on_sheep_moved(flights)
	_check("le plateau le voit ailleurs", ground.sheep[id] == to and not ground.has_sheep(at) or to == at)
	_check("sa vieille case se foule", ground.occupant_at(at).get("kind", "") != "sheep")
	var node: Node2D = island._scenery._sheep[id].node
	_check("il court (galop)", bool(island._scenery._sheep[id].bolting))
	await create_timer(1.0).timeout
	_check("arrive, il broute", not bool(island._scenery._sheep[id].bolting))
	_check("remonte dans le bloc de sa case", node.get_parent() != island._scenery)
	var want: Vector2 = island._terrain.map.screen_of(to.x, to.y)
	_check("pose sur sa case", node.get_parent().position.distance_to(want) < 0.5)

	# LE TOUR HORS LIGNE TOURNE SEUL.
	var before := ground.sheep.duplicate()
	island.local_run = run
	island.local_run.at = ground.sheep[ids[-1]] + Vector2i(1, 0)
	await create_timer(2.0).timeout
	_check("le troupeau bouge tout seul", before != ground.sheep)

	print("TROUPEAU : %s" % ("OK" if _fails == 0 else "%d ECHEC(S)" % _fails))
	quit(1 if _fails > 0 else 0)


static func _contiguous(from: Vector2i, path: Array) -> bool:
	var at := from
	for c in path:
		if maxi(absi(c.x - at.x), absi(c.y - at.y)) != 1:
			return false
		at = c
	return not path.is_empty()
