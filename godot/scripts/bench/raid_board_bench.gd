extends Node2D
## LE BANC DU PLATEAU DE RAID : le vrai terrier (burrow.tscn) qui devient le
## terrier d'un autre — son sol, le voile, les chiffres, l'anneau d'or, les
## deux fleches, et le lapin qui marche vers le potager — sans compte ni
## serveur.
##
##   godot --path godot scenes/bench/raid_board_bench.tscn -- --shot=raid.png --after=1.5
##   ... -- --walk --after=4        # trois pas, une bombe au deuxieme, la fete
##   ... -- --walk --struck         # ... et l'eclair du defenseur a la fin
##   ... -- --smoke                 # la fumee : pas de chiffres
##   ... -- --leave --after=5       # le retour chez soi apres la marche
##
## `RaidState.fake` coupe le reseau : aucun pas ne part vers ws.rabbit.rip.

const DEFENDER := "thistle"


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var walk := "--walk" in args or "--leave" in args
	Session.player = {"id": "burrow"}
	ShopState.shared().fake([], {"held": 3, "maxPlaced": 8})

	var burrow: Node2D = preload("res://scenes/burrow.tscn").instantiate()
	add_child(burrow)
	DevShot.arm(self)
	await get_tree().create_timer(0.3).timeout

	var layout := BurrowLayout.of(DEFENDER)
	var at := layout.entrance
	var walked: Array = [at]
	var smoked := "--smoke" in args
	var r := _raid(layout, walked, smoked)
	RaidState.current.fake({"raid": r.duplicate(true)})
	if not walk:
		return

	# Vers le potager, case voisine par case voisine, comme le serveur
	# l'accepterait.
	var goal := BurrowLayout.cell_of(layout.field[0])
	for i in range(3):
		await get_tree().create_timer(0.7).timeout
		var steps: Array = r["steps"]
		if steps.is_empty():
			break
		steps.sort_custom(func(a: int, b: int) -> bool:
			return BurrowLayout.cell_of(a).distance_squared_to(goal) \
				< BurrowLayout.cell_of(b).distance_squared_to(goal))
		walked.append(steps[0])
		r = _raid(layout, walked, smoked)
		if i == 1:
			r["trapsSprung"] = 1
			RaidState.current.sprung.emit(int(r["tile"]))
		RaidState.current.fake({"raid": r.duplicate(true)})
	await get_tree().create_timer(0.9).timeout
	r["finished"] = true
	r["struck"] = "--struck" in args
	r["succeeded"] = not r["struck"]
	RaidState.current.fake({"raid": r.duplicate(true)})
	if "--leave" in args:
		await get_tree().create_timer(1.5).timeout
		RaidState.current.fake({"raid": {}})


## Le raid tel que le serveur le rendrait : ce qu'on a foule et ses voisins
## vus (`raiderView`), des chiffres inventes, les voisins praticables en pas.
static func _raid(layout: BurrowLayout, walked: Array, smoked: bool) -> Dictionary:
	var at: int = walked[-1]
	var seen := {}
	for t in walked:
		seen[t] = true
		for n in _around(layout, t):
			seen[n] = true
	var view: Array = []
	for t in seen:
		view.append({"tile": t, "clue": null if smoked else (t * 7) % 4})
	var steps: Array = []
	for n in _around(layout, at):
		if not walked.has(n):
			steps.append(n)
	return {"raidId": "bench", "defender": {"id": DEFENDER, "name": "Thistle", "avatar": "gray", "level": 3},
		"tile": at, "energy": 60, "tank": 60, "trapsSprung": 0, "view": view, "walked": walked.duplicate(),
		"steps": steps, "smoked": smoked, "finished": false, "succeeded": false, "carrotsLooted": 0}


static func _around(layout: BurrowLayout, tile: int) -> Array:
	var out: Array = []
	var here := BurrowLayout.cell_of(tile)
	for s in BurrowLayout.STEPS:
		var c := here + s
		if c.x < 0 or c.y < 0 or c.x >= BurrowLayout.COLS or c.y >= BurrowLayout.ROWS:
			continue
		var t := BurrowLayout.index(c)
		if layout.is_walkable(t):
			out.append(t)
	return out
