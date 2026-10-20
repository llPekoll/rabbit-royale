extends Node
## LE PILOTE D'UNE MANCHE HORS LIGNE (`-- --voyageur --voyage-auto`), pour
## sonder le mode Voyageur sans main : il marche vers le coffre le plus proche
## en evitant les bombes, comme celui du bac a sable (dig_sandbox `_auto_step`).
## Il TRICHE (il lit ce qui est enterre) : outil de sonde, il ne juge rien.
## Il imprime la paie et le retour au terrier pour la sonde qui le lance.

var island: Node


func _ready() -> void:
	island = get_parent()
	var tick := Timer.new()
	tick.wait_time = 0.12
	tick.autostart = true
	tick.timeout.connect(_step)
	add_child(tick)
	print("[voyage] pilote : ile %s" % String(island.get("_seed")))


func _step() -> void:
	var run: LocalRun = island.local_run
	if run == null or not run.alive or island.get("_local_over"):
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
		if board.content.get(n) == IslandBoard.Content.BOMB:
			continue
		var d := Vector2(goal - n).length() + randf() * 1.5
		if d < pick_d:
			pick_d = d
			pick = n
	if pick.x >= 0:
		island._local_tap(pick)
