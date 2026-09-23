extends SceneTree
## L'EDITEUR DU TERRIER, sans ecran : prendre, poser, et ce que ca coute.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_burrow_arrange.gd
##
## ATTENDU : `AMENAGER : OK`. Chaque case allumee doit etre acceptee par la
## regle (BurrowLayout.edited), et le calcul des cases tenir sous une image
## et demie sur un poste de dev.

const SEEDS := ["paul", "guest-42", "burrow", "7d2e9c10-5a3b-4c7e-9f11-2b8d6e4a9c03"]


func _init() -> void:
	var ok := true
	for s in SEEDS:
		ok = _check(s) and ok
	print("AMENAGER : %s" % ("OK" if ok else "CASSE"))
	quit(0 if ok else 1)


func _check(seed_value: String) -> bool:
	var a := BurrowArrange.new(seed_value, {})
	var problems: Array[String] = []
	var solid := -1
	for i in range(a.layout.placements.size()):
		if bool(IslandGround.BLOCKS.get(a.layout.placements[i].kind, false)):
			solid = i
			break
	var p: Dictionary = a.layout.placements[solid]
	var t0 := Time.get_ticks_usec()
	a.grab(Vector2i(int(p.x), int(p.y)))
	var thing_ms := (Time.get_ticks_usec() - t0) / 1000.0
	if a.held != BurrowArrange.Held.THING:
		problems.append("l'arbre ne se prend pas")
	var lit := a.targets.size()
	var s0 := Time.get_ticks_usec()
	while a.settling():
		a.settle(4000)
	var settle_ms := (Time.get_ticks_usec() - s0) / 1000.0
	var thing_targets := a.targets.size()
	var target: Vector2i = a.targets.keys()[0] if thing_targets > 0 else Vector2i(-1, -1)
	if thing_targets > 0 and a.drop(target) != "":
		problems.append("une case allumee est refusee")
	if thing_targets > 0 and a.layout.is_walkable(BurrowLayout.index(target)):
		problems.append("l'arbre pose ne bloque pas")

	t0 = Time.get_ticks_usec()
	a.grab(BurrowLayout.cell_of(a.layout.field[0]))
	var field_ms := (Time.get_ticks_usec() - t0) / 1000.0
	while a.settling():
		a.settle(4000)
	if a.held != BurrowArrange.Held.FIELD:
		problems.append("le potager ne se prend pas")
	var field_targets := a.targets.size()
	for c in a.targets:
		if not (BurrowLayout.edited(a.base, a._candidate(c)) is BurrowLayout):
			problems.append("potager : case allumee refusee")
			break
	if field_targets > 0:
		var before := a.layout.field.duplicate()
		a.drop(a.targets.keys()[0])
		if a.layout.field == before:
			problems.append("le potager n'a pas bouge")
	a.grab(a.layout.building)
	if a.held != BurrowArrange.Held.HOUSE or a.targets.is_empty():
		problems.append("la maison ne se prend pas")
	else:
		var to: Vector2i = a.targets.keys()[0]
		a.drop(to)
		if a.layout.building != to:
			problems.append("la maison n'est pas ou on l'a posee")
	if not a.dirty():
		problems.append("brouillon propre apres trois gestes")
	print("%s  %s : arbre %d->%d cases en %.1f ms (+%.0f ms en fond), potager %d cases en %.1f ms  %s" % [
		"OK" if problems.is_empty() else "KO", seed_value, lit, thing_targets, thing_ms, settle_ms,
		field_targets, field_ms, ", ".join(problems)])
	return problems.is_empty()
