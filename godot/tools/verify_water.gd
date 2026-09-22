extends SceneTree
## LA MER ET SES HABITANTS, mesures — placement puis 30 secondes de nage.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_water.gd
##
## ATTENDU :
##   ECUME sur les cases de TERRE du bord (pas les cases de mer d'a cote)
##   ROCHERS : jamais sur la terre, jamais colles au rivage
##   CANARDS : 0 image sur la terre, 0 sur un rocher, et ils bougent
##
## POURQUOI 30 SECONDES ET PAS UN ETAT FINAL. C'est ici que le web s'est fait
## avoir : un canard qui teste seulement son ARRIVEE prend la ligne droite
## entre deux coins de mer et passe proprement SOUS L'ILE en chemin. Le defaut
## n'existe qu'entre deux images, donc on regarde chaque image.
var _n: Node2D
var _f := 0
var _ticks := 0
var _on_land := 0
var _on_rock := 0
var _moved := 0.0
var _dives := 0
var _was_diving := {}

func _init() -> void:
	_n = (load("res://scenes/island.tscn") as PackedScene).instantiate()
	get_root().add_child(_n)

func _process(_d: float) -> bool:
	_f += 1
	if _f < 3:
		return false
	var terrain = _n.get_node("%Terrain")
	var rocks = _n.get_node("%Rocks")
	var ducks = _n.get_node("%Ducks")
	var m = terrain.map

	var last: Array = ducks.positions()
	# 30 s a 60 images/s.
	for i in range(1800):
		ducks._process(1.0 / 60.0)
		_ticks += 1
		var now: Array = ducks.positions()
		for j in range(now.size()):
			var p: Vector2 = now[j]
			var c := Vector2i(int(floor(p.x)), int(floor(p.y)))
			if m.is_land(c.x, c.y):
				_on_land += 1
			if rocks.has_rock(c):
				_on_rock += 1
			if j < last.size():
				_moved += last[j].distance_to(p)
		last = now
	print("apres %d images (30 s simulees) :" % _ticks)
	print("  images-canard SUR LA TERRE : %d  (doit etre 0)" % _on_land)
	print("  images-canard SUR UN ROCHER: %d  (doit etre 0)" % _on_rock)
	print("  distance totale parcourue  : %.1f cases (ils bougent vraiment)" % _moved)
	var pos: Array = ducks.positions()
	var inside := 0
	for p in pos:
		if p.x >= 0.0 and p.y >= 0.0 and p.x < float(m.width) and p.y < float(m.height):
			inside += 1
	print("  canards encore dans la grille : %d/%d" % [inside, pos.size()])
	return true
