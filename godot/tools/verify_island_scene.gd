extends SceneTree
## L'ILE DU TUTORIEL, MONTEE POUR DE VRAI, et jouee au doigt jusqu'au coffre.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_island_scene.gd
##
## ATTENDU :
##   scene montee, 0 SCRIPT ERROR
##   lapin sur S ; bandeau « tap »
##   ... pas a pas jusqu'au coffre ; `_done` vrai ; X visible sur la bombe
##   ILE : OK
##
## POURQUOI, alors que verify_tutorial.gd joue deja la manche : celui-la joue
## le PLATEAU (island_board.gd), pas la SCENE. Le lapin, le bouton, le bandeau
## et le X sont dans island.gd et tile_view.gd, et un `_ready` qui plante la
## n'apparait nulle part en headless — sauf a l'export, comme un ecran noir
## sans autre symptome, suivi d'une heure de diagnostic a vide. On monte donc
## la vraie scene et on compte les erreurs.
##
## LES AUTOLOADS NE SONT PAS MONTES par `--script` : on pose I18N et Screens
## sous la racine a la main, sous leur nom, ce qui suffit a la resolution
## `/root/<Nom>` que le compilateur emet pour un identifiant d'autoload.
##
## `_ready` attend une image (voir verify_boards.gd) : d'ou la machine a etats
## sur `_frames`.

var _island: Node2D
var _frames := 0
var _ok := true
var _at_step := 0
var _path: Array[Vector2i] = []


func _initialize() -> void:
	for pair in [["I18N", "res://scripts/i18n.gd"], ["Screens", "res://scripts/screens.gd"],
			["Session", "res://scripts/session.gd"]]:
		var node: Node = (load(pair[1]) as GDScript).new()
		node.name = pair[0]
		root.add_child(node)
	_island = (load("res://scenes/island.tscn") as PackedScene).instantiate()
	root.add_child(_island)


func _process(_delta: float) -> bool:
	_frames += 1
	match _frames:
		3:
			_island.show_ground(FirstIsland.seed_for("probe"))
			print("scene montee, graine tutoriel posee")
		5:
			_check_start()
			_plan_walk()
		_:
			if _frames > 5 and _frames % 2 == 0:
				if not _walk_one():
					_finish()
					return true
	return false


func _check_start() -> void:
	var at: Vector2i = _island._rabbit.at()
	var spawn := TutorialMap.spawn()
	_expect(at == spawn, "lapin sur S : %s (S=%s)" % [at, spawn])
	var cap: Control = _island._caption
	_expect(cap != null and cap.visible, "bandeau visible au depart")
	_expect(_island._caption._shown == "tap", "bandeau « tap », lu : %s" % _island._caption._shown)
	_expect(_island._mark != null and _island._mark.visible, "bouton MARQUER visible")
	# Une tape hors voisinage ne fait rien — ni pas, ni plantage.
	_island._tutorial_tap(TutorialMap.chest())
	_expect(_island._rabbit.at() == spawn, "tape lointaine ignoree")


## LE CHEMIN, calcule sur le plateau comme dans verify_tutorial.gd : a chaque
## tour le pas permis qui rapproche, d'abord de la bombe, puis du coffre.
func _plan_walk() -> void:
	_path.clear()
	_at_step = 0


func _walk_one() -> bool:
	var board: IslandBoard = _island._board
	var bomb := TutorialMap.bomb()
	var chest := TutorialMap.chest()
	var at: Vector2i = _island._rabbit.at()

	if _island._done:
		return false

	# A COTE DE LA BOMBE ET PAS ENCORE MARQUEE : le X, en deux tapes.
	if board.is_beside(at, bomb) and not board.is_flagged(bomb):
		_expect(_island._caption._shown == "mark", "a cote : bandeau « mark », lu : %s" % _island._caption._shown)
		_expect(_island._tiles._x[bomb].visible, "X fantome visible sur la bombe")
		_island._set_armed(true)
		_expect(_island._caption._shown == "aim", "arme : bandeau « aim », lu : %s" % _island._caption._shown)
		_island._tutorial_tap(bomb)
		_expect(board.is_flagged(bomb), "X pose sur la bombe")
		_expect(not _island._armed, "le mode retombe apres un marquage")
		_expect(_island._tiles._x[bomb].visible and _island._tiles._x[bomb].modulate.a == 1.0, "X plein sur la bombe")
		_expect(_island._caption._shown == "fetch", "marquee : bandeau « fetch », lu : %s" % _island._caption._shown)
		return true

	var goal := chest if board.is_flagged(bomb) else bomb
	var best := Vector2i(-1, -1)
	var best_d := 1 << 30
	for n in board._neighbours(at):
		if not board.may_step(at, n):
			continue
		var d: int = board._steps_between(n, goal)
		if d < best_d:
			best_d = d
			best = n
	if best.x < 0:
		_expect(false, "bloque en %s, but %s" % [at, goal])
		return false
	_island._tutorial_tap(best)
	_at_step += 1
	_expect(_island._rabbit.at() == best, "pas %d : lapin en %s" % [_at_step, best])
	return _at_step < 40


func _finish() -> void:
	_expect(_island._done, "le coffre termine la manche")
	_expect(_island._caption._shown == "chest", "bandeau final « chest », lu : %s" % _island._caption._shown)
	print("")
	print("ILE : ", "OK" if _ok else "ECHEC")
	quit(0 if _ok else 1)


func _expect(cond: bool, what: String) -> void:
	print(("   ok   " if cond else "   ECHEC ") + what)
	_ok = _ok and cond
