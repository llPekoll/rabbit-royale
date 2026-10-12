extends Node2D
## LE BANC DE LA HACHE (2026-10-12) : le raid contre le vrai mur de
## NorminaskyTV — 31 arbres deplaces, sa maison, quatre planches, une seule
## case pour entrer — avec la barre du raid et son bouton HACHE. Jouable au
## doigt : l'anneau avance, HACHE arme, une tape sur un arbre ou une planche
## dore le coupe, et le lapin passe par la breche.
##
##   godot --path godot scenes/bench/raid_axe_bench.tscn            # a jouer
##   ... -- --armed --shot=a.png --after=2      # la hache armee : les cibles
##   ... -- --cut --shot=b.png --after=4        # l'arbre tombe, la souche
##   ... -- --through --shot=c.png --after=7    # ... et le lapin passe
##   ... -- --none                              # sans hache en sac
##   ... -- --plank                             # devant les planches
##   ... -- --owner                             # chez lui : la souche et son compte a rebours
##
## `RaidState.fake` coupe le reseau : rien ne part au serveur.

const DEFENDER := "sol:6jqajzkMbciCYjKiXKJfXqwMUo9xBDaHUrrKXkoZhyVL"
const MOVES := [[270, 174], [213, 193], [232, 173], [239, 172], [200, 177], [163, 158], [202, 120], [140, 100], [289, 101], [122, 81], [141, 80], [160, 79], [220, 178], [221, 196], [298, 140], [169, 197], [292, 121], [84, 82], [64, 61], [210, 62], [180, 192], [219, 212], [51, 211], [50, 63], [69, 179], [104, 198], [259, 160], [148, 141], [241, 122], [88, 103], [129, 139]]
const PLANKS := [{"tile": 98, "side": "NE"}, {"tile": 99, "side": "NE"}, {"tile": 99, "side": "SE"}, {"tile": 119, "side": "NE"}]
## Devant le mur d'arbres (sous l'arbre 173), et devant les planches.
const AT_WALL := 192
const AT_PLANKS := 100
const STEP := {"NE": Vector2i(0, -1), "SE": Vector2i(1, 0), "SW": Vector2i(0, 1), "NW": Vector2i(-1, 0)}

var _edits := {"moves": MOVES}
var _planks: Array = PLANKS.duplicate(true)
var _walked: Array = []
var _held := 2
var _used := false


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	Session.player = {"id": "burrow"}
	ShopState.shared().fake([], {"held": 3, "maxPlaced": 8})
	if "--none" in args:
		_held = 0
	# CHEZ LE PROPRIETAIRE, le lendemain : l'arbre 173 est a terre depuis 17 h.
	if "--owner" in args:
		Session.player = {"id": DEFENDER}
		var regrows := Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 31 * 3600) + "Z"
		Home.stumps = [{"tile": 173, "regrowsAt": regrows}]
		Home.edits = {"moves": MOVES, "cuts": [173]}

	var burrow: Node2D = preload("res://scenes/burrow.tscn").instantiate()
	add_child(burrow)
	# LA BARRE DU RAID comme le chrome la monte : dans un etage de hauteur
	# nulle epingle en bas de l'ecran (chrome.tscn %Floor), dans un plein ecran.
	var hud_layer := CanvasLayer.new()
	add_child(hud_layer)
	var screen := Control.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(screen)
	var floor_host := Control.new()
	floor_host.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	floor_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen.add_child(floor_host)
	floor_host.add_child(preload("res://scenes/ui/raid_hud.tscn").instantiate())
	DevShot.arm(self)
	await get_tree().create_timer(0.3).timeout
	if "--owner" in args:
		return

	var layout := BurrowLayout.of(DEFENDER, _edits)
	var goal := AT_PLANKS if "--plank" in args else AT_WALL
	_walked = _path(layout, layout.entrance, goal)
	RaidState.current.fake_step.connect(_on_step)
	RaidState.current.chopped.connect(_on_chopped)
	_push()

	if "--armed" in args or "--cut" in args or "--through" in args:
		await get_tree().create_timer(1.0).timeout
		RaidState.current.arm_axe(true)
	if "--cut" in args or "--through" in args:
		await get_tree().create_timer(1.2).timeout
		var a := RaidState.current.axe()
		var trees: Array = a.get("trees", [])
		if trees.has(173):
			RaidState.current.cut({"tile": 173})
		elif not (a.get("planks", []) as Array).is_empty():
			RaidState.current.cut(a["planks"][0])
	# LA SONDE DU DOIGT : une vraie tape (souris) au centre de la souche, puis
	# ce que le plateau en a fait.
	if "--tapstump" in args:
		await get_tree().create_timer(1.0).timeout
		var b: Node2D = burrow
		var probe_tile := 191 if "--tapother" in args else 173
		var c := BurrowLayout.cell_of(probe_tile)
		var map: BurrowMap = b.get("_terrain").map
		var at: Vector2 = b.position + b.scale.x * (map.screen_of(c.x, c.y) + Vector2(0, Iso.half_h()))
		var r := RaidState.current.raid
		print("[probe] steps ", r.get("steps"), " stump lit ", (r.get("steps", []) as Array).has(173), " tap at ", at,
			" picks ", b.call("_cell_at", at))
		for pressed in [true, false]:
			var ev := InputEventMouseButton.new()
			ev.button_index = MOUSE_BUTTON_LEFT
			ev.pressed = pressed
			# En coordonnees de FENETRE : le viewport remet a l'echelle.
			var win := get_viewport().get_final_transform() * at
			ev.position = win
			ev.global_position = win
			Input.parse_input_event(ev)
			await get_tree().process_frame
		await get_tree().create_timer(0.5).timeout
		var walker: Node2D = b.get("_walker")
		print("[probe] walked ", RaidState.current.raid.get("walked"), " rabbit on ", walker.get("_at"))
	if "--through" in args:
		var field_goal := BurrowLayout.cell_of(layout.field[0])
		for i in range(4):
			await get_tree().create_timer(0.8).timeout
			var steps := _steps(BurrowLayout.of(DEFENDER, _edits), int(_walked[-1]))
			if steps.is_empty():
				break
			steps.sort_custom(func(a: int, b: int) -> bool:
				return BurrowLayout.cell_of(a).distance_squared_to(field_goal) \
					< BurrowLayout.cell_of(b).distance_squared_to(field_goal))
			_on_step(steps[0])


## Un pas, tape ou script : le banc joue le serveur.
func _on_step(tile: int) -> void:
	_walked.append(tile)
	_push()


## La hache a frappe : l'arbre est a terre (`edits.cuts`), ou la planche est
## partie ; une hache de moins, celle du raid levee.
func _on_chopped(target: Dictionary) -> void:
	if target.has("side"):
		_planks = _planks.filter(func(s: Dictionary) -> bool:
			return not (int(s.tile) == int(target.tile) and String(s.side) == String(target.side)))
	else:
		var cuts: Array = _edits.get("cuts", [])
		cuts.append(int(target.tile))
		_edits["cuts"] = cuts
	_held -= 1
	_used = true
	# Le temps que l'arbre bascule, puis le sol se relit — comme la reponse
	# du serveur arrive apres la tape.
	await get_tree().create_timer(0.15).timeout
	_push()


func _push() -> void:
	var layout := BurrowLayout.of(DEFENDER, _edits)
	var at: int = _walked[-1]
	var on_field := layout.field.has(at)
	var seen := {}
	for t in _walked:
		seen[t] = true
		for n in _around(layout, t):
			seen[n] = true
	var view: Array = []
	for t in seen:
		view.append({"tile": t, "clue": (t * 7) % 3})
	var axe := {"held": _held, "used": _used, "trees": [], "planks": []}
	if not _used and not on_field:
		axe["trees"] = _trees_around(layout, at)
		axe["planks"] = _planks.filter(func(s: Dictionary) -> bool:
			return BurrowLayout.index(BurrowLayout.cell_of(int(s.tile)) + STEP[String(s.side)]) == at)
	var r := {"raidId": "axe-bench",
		"defender": {"id": DEFENDER, "name": "NorminaskyTV", "avatar": "gray", "level": 10, "edits": _edits.duplicate(true)},
		"tile": at, "energy": 60, "tank": 60, "trapsSprung": 0, "view": view, "walked": _walked.duplicate(),
		"steps": [] if on_field else _steps(layout, at), "fenced": _planks.duplicate(true), "smoked": false,
		"finished": on_field, "succeeded": on_field, "carrotsLooted": 0, "axe": axe}
	RaidState.current.fake({"raid": r})


## Les pas permis : les voisins praticables, moins ceux qu'une planche barre
## (le plus simple des refus de `fenceBlocks` : la face orthogonale).
func _steps(layout: BurrowLayout, at: int) -> Array:
	var out: Array = []
	for n in _around(layout, at):
		if _walked.has(n) or _fenced(layout, at, n):
			continue
		out.append(n)
	return out


## fence.ts `fenceBlocks`, recopie : une face orthogonale, ou — en
## diagonale — toute planche qui touche le coin traverse.
func _fenced(layout: BurrowLayout, from: int, to: int) -> bool:
	var f_to := layout.field.has(to)
	if f_to == layout.field.has(from):
		return false
	var inner := to if f_to else from
	var a := BurrowLayout.cell_of(inner)
	var d := BurrowLayout.cell_of(from if f_to else to) - a
	var side_dc := "" if d.x == 0 else ("SE" if d.x > 0 else "NW")
	var side_dr := "" if d.y == 0 else ("SW" if d.y > 0 else "NE")
	if side_dc == "":
		return _has(inner, side_dr)
	if side_dr == "":
		return _has(inner, side_dc)
	if _has(inner, side_dc) or _has(inner, side_dr):
		return true
	var along_dc := BurrowLayout.index(a + Vector2i(d.x, 0))
	var along_dr := BurrowLayout.index(a + Vector2i(0, d.y))
	if layout.field.has(along_dc) and _has(along_dc, side_dr):
		return true
	return layout.field.has(along_dr) and _has(along_dr, side_dc)


func _has(tile: int, side: String) -> bool:
	for s in _planks:
		if int(s.tile) == tile and String(s.side) == side:
			return true
	return false


static func _trees_around(layout: BurrowLayout, at: int) -> Array:
	var here := BurrowLayout.cell_of(at)
	var out: Array = []
	for p in layout.placements:
		if String(p.kind) != "tree":
			continue
		var c := Vector2i(int(p.x), int(p.y))
		if c != here and absi(c.x - here.x) <= 1 and absi(c.y - here.y) <= 1:
			out.append(BurrowLayout.index(c))
	out.sort()
	return out


static func _around(layout: BurrowLayout, tile: int) -> Array:
	var out: Array = []
	var here := BurrowLayout.cell_of(tile)
	for s in BurrowLayout.STEPS:
		var c := here + s
		if c.x < 0 or c.y < 0 or c.x >= BurrowLayout.COLS or c.y >= BurrowLayout.ROWS:
			continue
		var t := BurrowLayout.index(c)
		if layout.is_walkable(t) and absi(layout.map.level_at(c.x, c.y) - layout.map.level_at(here.x, here.y)) <= 1:
			out.append(t)
	return out


## Le chemin le plus court de la porte a `goal`, a travers le sol praticable.
static func _path(layout: BurrowLayout, from: int, goal: int) -> Array:
	var prev := {from: -1}
	var queue: Array = [from]
	while not queue.is_empty():
		var t: int = queue.pop_front()
		if t == goal:
			break
		for n in _around(layout, t):
			if not prev.has(n):
				prev[n] = t
				queue.append(n)
	if not prev.has(goal):
		return [from]
	var out: Array = []
	var t := goal
	while t != -1:
		out.push_front(t)
		t = int(prev[t])
	return out
