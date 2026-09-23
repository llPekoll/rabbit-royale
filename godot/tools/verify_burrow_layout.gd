extends SceneTree
## LE TERRIER GODOT CONTRE CELUI DU SERVEUR, case par case.
##
##   bun tools/export-godot-burrow-fixture.ts        # depuis la racine du depot
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_burrow_layout.gd
##
## ATTENDU : une ligne `OK` par terrier, puis `TERRIER : OK`.
##
## Compare le relief, le genre de chaque case (sol, entree, potager,
## paillasson, bloque), la traversee, le decor garde et la case de la maison.
## Une bombe est un INDEX que le serveur juge sur SON terrier : une case
## d'ecart et la grille allume ce qu'il refuse.

const FIXTURE := "res://tools/burrow_fixture.json"
const LETTER := {0: ".", 1: "g", 2: "E", 3: "F", 4: "d"}


func _init() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))
	var all_ok := true
	for c in cases:
		all_ok = _check(c) and all_ok
	print("TERRIER : %s" % ("OK" if all_ok else "CASSE"))
	quit(0 if all_ok else 1)


func _check(c: Dictionary) -> bool:
	var t0 := Time.get_ticks_msec()
	var b := BurrowLayout.grow(String(c.seed), 2)
	var ms := Time.get_ticks_msec() - t0
	var problems: Array[String] = []

	var levels := ""
	for r in range(b.map.height):
		for col in range(b.map.width):
			levels += str(b.map.level_at(col, r))
	if levels != String(c.levels):
		problems.append("relief (1re diff a %d)" % _first_diff(levels, c.levels))

	var cells := ""
	for k in b.cells:
		cells += LETTER[k]
	if cells != String(c.cells):
		problems.append("cases (1re diff a %d)" % _first_diff(cells, c.cells))
	if b.entrance != int(c.entrance):
		problems.append("entree %d, attendu %d" % [b.entrance, c.entrance])
	if b.crossing != int(c.crossing):
		problems.append("traversee %d, attendu %d" % [b.crossing, c.crossing])
	if str(b.field) != str(_ints(c.field)):
		problems.append("potager %s, attendu %s" % [b.field, c.field])
	if str(b.doorstep) != str(_ints(c.doorstep)):
		problems.append("paillasson %s, attendu %s" % [b.doorstep, c.doorstep])

	var got: Array[String] = []
	for p in b.placements:
		got.append("%s:%d,%d:%d" % [p.kind, p.x, p.y, p.variant])
	if got != _strings(c.placements):
		problems.append("decor %d, attendu %d" % [got.size(), c.placements.size()])
	var want_home := Vector2i(int(c.building.x), int(c.building.y))
	if b.building != want_home:
		problems.append("maison %s, attendu %s" % [b.building, want_home])

	# LES AMENAGEMENTS : meme refus, ou meme sol, que `editBurrow`.
	var agreed := 0
	for e in c.get("edits", []):
		var got_e: Variant = BurrowLayout.edited(b, e.edits)
		var want_refusal := String(e.get("refused", ""))
		if got_e is String:
			if got_e != want_refusal:
				problems.append("amenagement %s : %s, attendu %s" % [JSON.stringify(e.edits), got_e, want_refusal if want_refusal != "" else "accepte"])
				continue
		else:
			if want_refusal != "":
				problems.append("amenagement %s : accepte, attendu %s" % [JSON.stringify(e.edits), want_refusal])
				continue
			var ec := ""
			for k in got_e.cells:
				ec += LETTER[k]
			if ec != String(e.cells) or got_e.crossing != int(e.crossing):
				problems.append("amenagement %s : sol different" % JSON.stringify(e.edits))
				continue
			if e.has("placements"):
				var have: Array = []
				for q in got_e.placements:
					have.append("%s:%d,%d" % [q.id, int(q.x), int(q.y)])
				if JSON.stringify(have) != JSON.stringify(e.placements):
					problems.append("amenagement %s : decors differents (%d ici, %d attendus)" % [
						JSON.stringify(e.edits), have.size(), (e.placements as Array).size()])
			if e.has("house") and BurrowLayout.index(got_e.building) != int(e.house):
				problems.append("amenagement %s : maison %d, attendu %d" % [JSON.stringify(e.edits),
					BurrowLayout.index(got_e.building), int(e.house)])
				continue
		agreed += 1

	if problems.is_empty():
		print("OK  %s  (%d ms, traversee %d, %d decors, %d amenagements)" % [c.seed, ms, b.crossing, got.size(), agreed])
		return true
	print("KO  %s : %s" % [c.seed, ", ".join(problems)])
	return false


static func _first_diff(a: String, b: String) -> int:
	for i in range(mini(a.length(), b.length())):
		if a[i] != b[i]:
			return i
	return mini(a.length(), b.length())


static func _ints(list: Array) -> Array[int]:
	var out: Array[int] = []
	for v in list:
		out.append(int(v))
	return out


static func _strings(list: Array) -> Array[String]:
	var out: Array[String] = []
	for v in list:
		out.append(String(v))
	return out
