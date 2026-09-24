extends SceneTree
## LE PARCOURS ENTIER, avec la vraie racine, le vrai chrome et le vrai rideau :
## accueil → terrier → ile → terrier (x3) → accueil → terrier.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_scene_flow.gd
##
## ATTENDU : chaque ligne finit par « ok ».
##
## Les trois bugs que le gestionnaire de scenes a remplaces, un par un :
##   - l'ile derriere l'accueil         → « accueil : monde vide »
##   - un plateau d'ile au terrier      → « terrier : une scene, un terrier »
##   - les boutons du sol disparus      → « terrier : batiments poses »
##     (depuis le 2026-09-24 les portes sont des batiments du monde,
##     burrow_landmarks.gd, et plus une barre du chrome)
## Et un quatrieme, qui guette tout gestionnaire qui construit : la fuite. Le
## nombre de noeuds de l'arbre doit revenir au meme a chaque retour au terrier.

var _main: Node
var _screens: Node
var _fails := 0


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("%s %s" % [label, "ok" if ok else "ECHEC"])


func _init() -> void:
	_run.call_deferred()


func _wait(seconds: float) -> void:
	await create_timer(seconds).timeout


func _run() -> void:
	_screens = get_root().get_node("Screens")
	_main = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	get_root().add_child(_main)
	await _wait(0.5)
	var world: Node = _main.get_node("%World")
	var chrome_host: Node = _main.get_node("%Chrome")
	_check("accueil : pas de chrome", chrome_host.get_child_count() == 0)

	_screens.show_place(_screens.Place.BURROW)
	await _wait(0.5)
	_check("terrier : chrome construit", chrome_host.get_child_count() == 1)
	var counts: Array[int] = []
	for round in 3:
		_screens.cross(_screens.Place.ISLAND)
		await _wait(3.0)
		_check("ile : une scene, une ile", world.get_child_count() == 1 and world.get_child(0).scene_file_path.ends_with("island.tscn"))
		_check("ile : pas de barre du sol", _find(chrome_host, "LoopBar") == null)
		_screens.cross(_screens.Place.BURROW)
		await _wait(3.0)
		_check("terrier : une scene, un terrier", world.get_child_count() == 1 and not (world.get_child(0).scene_file_path.ends_with("island.tscn")))
		var marks: Node = _find(world, "BurrowLandmarks")
		_check("terrier : batiments poses", marks != null and marks.get("sea_map") != null \
			and marks.get_child_count() > 1)
		_check("terrier : rideau fini", not _screens.crossing)
		await _wait(0.2)
		counts.append(_count(get_root()))
	print("noeuds au retour au terrier : %s" % str(counts))
	_check("pas de fuite entre deux retours", counts[1] == counts[2])

	_screens.show_doorstep()
	await _wait(0.5)
	_check("accueil : monde vide", world.get_child_count() == 0)
	_check("accueil : chrome detruit", chrome_host.get_child_count() == 0)
	_check("accueil : l'accueil est la", _main.get_node("%Screen").get_child_count() == 1)

	_screens.show_place(_screens.Place.BURROW)
	await _wait(0.5)
	_check("reconnexion : un chrome, un terrier",
		chrome_host.get_child_count() == 1 and world.get_child_count() == 1)
	print("%d echec(s)" % _fails)
	quit(1 if _fails > 0 else 0)


static func _find(node: Node, cls: String) -> Node:
	for child in node.get_children():
		var script: Script = child.get_script()
		if script != null and script.get_global_name() == cls:
			return child
		var hit := _find(child, cls)
		if hit != null:
			return hit
	return null


static func _count(node: Node) -> int:
	var n := 1
	for child in node.get_children():
		n += _count(child)
	return n
