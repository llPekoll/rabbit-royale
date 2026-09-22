extends Node2D
class_name Ducks
## DES CANARDS QUI BARBOTENT EN EAU LIBRE.
##
## Porte de src/game/fx/Ducks.ts.
##
## LE RESTE DU DECOR EST TAMPONNE : un arbre, un buisson, un rocher prennent
## une case. Un canard ne peut pas marcher comme ca. Ce qui nage TRAVERSE les
## cases au lieu d'en occuper une : il garde donc sa position en flottant et
## n'est jamais inscrit sur le plateau — rien ne marche sur l'eau, donc il n'y a
## rien qu'il bloque ni qui le bloque.
##
## IL NAGE DANS LE SENS OU L'ART REGARDE, ET NULLE PART AILLEURS.
##
## Le canard est dessine de trois quarts : bec vers le bas-GAUCHE de l'image,
## sillage vers le haut-droite. C'est un oiseau qui vient VERS le spectateur le
## long d'une diagonale du treillis — le pas (0, 1), que le plateau projette
## vers le bas-gauche. Mirroir, le meme dessin nage vers le bas-droite, pas
## (1, 0). Ce sont les deux SEULES directions ou cette image est un canard qui
## avance ; le long de tout le reste il glisse de cote. Une tentative a six
## directions a donne exactement ca — un canard qui marche en crabe, bec pointe
## vers le rivage.
##
## Un canard qui nage toujours vers le spectateur finit par manquer d'eau devant
## lui : il ne peut JAMAIS faire demi-tour, puisque l'art n'a pas de dos. Quand
## aucune jambe n'est possible, il PLONGE — se fond la ou il est, et remonte
## ailleurs en eau libre. Un canard qui disparait sous la surface et ressort
## plus loin, c'est ce que font les canards de toute facon.
##
## JAMAIS TOURNE, seulement retourne. Le premier jet pilotait un cap continu et
## dessinait une spline, puis faisait pivoter le sprite dessus. Ni l'un ni
## l'autre n'a survecu : la courbe etait la seule chose a l'image qui ne soit
## pas sur le treillis, et incliner un dessin vu de dessus fait BASCULER
## l'oiseau au lieu de le tourner.
##
## LA PROFONDEUR EST LA REGLE DU TERRAIN, PAS UNE COUCHE. Un canard traverse les
## cases de l'ile, donc on ne peut pas le garer sous tout : epingle sous la
## terre il passe derriere un rocher devant lequel il barbote, et derriere la
## cote sud de l'ile — le bord contre lequel on le voit le plus souvent. Il se
## trie donc sur la meme regle que tout ce qui se tient sur le terrain.

const SHEET := preload("res://assets/water/duck.webp")
## La feuille est trois images de 32x32 d'un canard qui se dandine.
const FRAME := 32
const FRAMES := 3

## A QUELLE DISTANCE DE LA TERRE une route doit se tenir, en cases.
##
## Un canard est un sprite qui a une LARGEUR : une ligne centrale qui frole la
## cote traine quand meme le corps de l'oiseau sur le sable.
const CLEARANCE := 0.45

## LES DEUX PAS qu'une jambe peut prendre : bas-gauche a l'ecran comme l'art est
## dessine, et bas-droite en miroir. Rien d'autre — voir la note du haut.
const STEPS := [Vector2i(0, 1), Vector2i(1, 0)]

var map: BurrowMap
var seed_text := ""
## Les rochers, pour ne pas nager dedans. Facultatif.
var rocks: SeaRocks

var _frames: Array[Texture2D] = []
var _ducks: Array = []
var _rng: Rng
var _elapsed := 0.0


func _ready() -> void:
	y_sort_enabled = false
	_slice()


func _slice() -> void:
	if not _frames.is_empty():
		return
	for i in range(FRAMES):
		var frame := AtlasTexture.new()
		frame.atlas = SHEET
		frame.region = Rect2(i * FRAME, 0, FRAME, FRAME)
		_frames.append(frame)


## EST-CE DE L'EAU LIBRE ? Ni terre, ni rocher.
##
## Le rocher compte comme un obstacle parce qu'un canard est dessine SOUS le
## decor : route a travers sa case, il nageait droit dans le rocher.
func _is_water(x: int, y: int) -> bool:
	if map == null:
		return false
	if x < 0 or y < 0 or x >= map.width or y >= map.height:
		return false
	if map.is_land(x, y):
		return false
	if rocks != null and rocks.has_rock(Vector2i(x, y)):
		return false
	# L'ANNEAU DE CASES QUI TOUCHENT LA TERRE N'EST PAS DE L'EAU NAGEABLE.
	#
	# Une case de mer contre la cote n'est pas vraiment visible : la terre est
	# dessinee UN PALIER PLUS HAUT — son losange d'herbe est a TIER_LIFT
	# au-dessus de son empreinte a plat — donc au nord et a l'ouest elle
	# surplombe les cases de mer derriere elle, et au sud et a l'est l'ecume
	# deborde dessus. Un canard route dans cet anneau nageait SOUS l'ile : un
	# demi-oiseau depassant de sous l'herbe. Garder la compagnie une case
	# entiere au large la pose sur de l'eau vraiment peinte comme de l'eau.
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if map.is_land(x + dx, y + dy):
				return false
	return true


## VRAI quand tout le trajet a->b est en eau libre, marge comprise.
##
## LE CHEMIN ENTIER EST TESTE AVANT DE PARTIR, et pas seulement son bout.
## N'eprouver que l'arrivee laissait un canard prendre la ligne droite entre
## deux coins de mer et passer PROPREMENT SOUS L'ILE en chemin — ce qui est
## exactement ce qui en a mis un sur un rocher. Tester a chaque image ne vaut
## pas mieux : la case qu'il quitte et celle ou il entre se contredisent tant
## qu'il est a cheval, donc il vibre le long du rivage.
func _clear_path(ax: float, ay: float, bx: float, by: float) -> bool:
	var dist := Vector2(bx - ax, by - ay).length()
	# DEUX FOIS PAR CASE, pour qu'aucun echantillon n'enjambe une langue de
	# terre large d'une seule case.
	var steps := maxi(2, ceili(dist * 2.0))
	for i in range(steps + 1):
		var t := float(i) / float(steps)
		var px := ax + (bx - ax) * t
		var py := ay + (by - ay) * t
		# LES QUATRE COINS DE LA MARGE, pas seulement le centre : un canard est
		# un sprite qui a une largeur, et une ligne centrale peut se faufiler
		# dans un passage ou son corps ne tient pas.
		for off in [Vector2(0, 0), Vector2(CLEARANCE, 0), Vector2(-CLEARANCE, 0),
				Vector2(0, CLEARANCE), Vector2(0, -CLEARANCE)]:
			if not _is_water(int(floor(px + off.x)), int(floor(py + off.y))):
				return false
	return true


## UN COIN D'EAU LIBRE tire au sort, ou null si la mer est trop petite.
##
## BORNE plutot que « jusqu'a en trouver un » : une ile qui aurait rempli sa
## propre carte ferait tourner cette boucle pour toujours.
func _open_water():
	for tries in range(200):
		var x := _rng.next() * float(map.width)
		var y := _rng.next() * float(map.height)
		# Chemin de longueur nulle : reutilise le meme test de marge, pour
		# qu'un canard ne demarre jamais colle au rivage, sans issue.
		if _clear_path(x, y, x, y):
			return Vector2(x, y)
	return null


func build() -> void:
	clear()
	if map == null:
		return
	_slice()
	_rng = Rng.from_seed(seed_text + ":ducks")

	var look: Dictionary = WaterLook.DUCKS
	for i in range(look["count"]):
		var spot = _open_water()
		if spot == null:
			break
		var s := Sprite2D.new()
		s.texture = _frames[0]
		s.centered = true
		add_child(s)
		var facing := -1.0 if _rng.next() < 0.5 else 1.0
		_ducks.append({
			"sprite": s,
			"pos": spot,
			"target": spot,
			"dir": Vector2.ZERO,
			"facing": facing,
			"phase": _rng.next() * float(FRAMES),
			"resting": _rng.next() * float(look["rest_ms"]),
			"diving": 0.0,
		})
		_place(_ducks[i])


func _process(delta: float) -> void:
	if _ducks.is_empty():
		return
	var look: Dictionary = WaterLook.DUCKS
	var delta_ms := delta * 1000.0
	_elapsed += delta_ms
	var step: float = look["speed"] * delta / 1.0

	for d in _ducks:
		if d["diving"] > 0.0:
			_dive(d, delta_ms, look)
		elif d["resting"] > 0.0:
			d["resting"] -= delta_ms
		else:
			_swim(d, step, look)
		_place(d)


## SOUS L'EAU : se fondre la ou il est, remonter ailleurs, reapparaitre.
func _dive(d: Dictionary, delta_ms: float, look: Dictionary) -> void:
	var before: float = d["diving"]
	d["diving"] = before + delta_ms
	var dive_ms: float = float(look["dive_ms"])
	if before <= dive_ms and d["diving"] > dive_ms:
		var spot = _open_water()
		if spot != null:
			d["pos"] = spot
		d["target"] = d["pos"]
	if d["diving"] >= 2.0 * dive_ms:
		d["diving"] = 0.0
		d["resting"] = float(look["rest_ms"]) * (0.5 + _rng.next())


func _swim(d: Dictionary, step: float, look: Dictionary) -> void:
	var to: Vector2 = d["target"] - d["pos"]
	var dist := to.length()
	if dist < 1e-6:
		_choose_leg(d, look)
		return
	# LE LONG DE LA JAMBE, ET JAMAIS AU-DELA : le dernier pas tombe exactement
	# sur la cible, pour que la suivante reparte sur le treillis.
	var travel := minf(step, dist)
	var next: Vector2 = d["pos"] + d["dir"] * travel
	# DERNIER GARDE-FOU : quoi qu'il ait derive, il n'entre jamais dans une
	# case de terre.
	if _is_water(int(floor(next.x)), int(floor(next.y))):
		d["pos"] = next
	else:
		# Le nez contre le rivage : on abandonne cette jambe et on rechoisit.
		d["target"] = d["pos"]


## ARRIVE : choisir une jambe qu'il peut VRAIMENT nager — un nombre entier de
## cases vers le bas-gauche ou le bas-droite, LE TRAJET ENTIER verifie et pas
## seulement son bout. On se repose d'abord dans les deux cas ; si aucune jambe
## n'est possible, on plonge.
func _choose_leg(d: Dictionary, look: Dictionary) -> void:
	d["resting"] = float(look["rest_ms"]) * (0.5 + _rng.next())
	for tries in range(16):
		var s: Vector2i = STEPS[int(_rng.next() * float(STEPS.size()))]
		var length := 1 + int(_rng.next() * float(look["range"]))
		var nx: float = d["pos"].x + float(s.x * length)
		var ny: float = d["pos"].y + float(s.y * length)
		if nx < 0.0 or ny < 0.0 or nx >= float(map.width) or ny >= float(map.height):
			continue
		if not _clear_path(d["pos"].x, d["pos"].y, nx, ny):
			continue
		d["target"] = Vector2(nx, ny)
		d["dir"] = Vector2(float(s.x), float(s.y)).normalized()
		# L'art regarde le bas-gauche, donc (1, 0) est le miroir.
		d["facing"] = -1.0 if s.x - s.y > 0 else 1.0
		return
	d["resting"] = 0.0
	d["diving"] = 1e-3


func _place(d: Dictionary) -> void:
	var look: Dictionary = WaterLook.DUCKS
	var s: Sprite2D = d["sprite"]
	var p: Vector2 = d["pos"]
	# LA POSITION D'UNE CASE FRACTIONNAIRE : on projette a plat, au niveau de la
	# mer, dans la convention de ce portage (coin haut + une demi-hauteur).
	s.position = Iso.project(0, 0, map.origin) + Vector2(
		(p.x - p.y) * Iso.half_w(),
		(p.x + p.y) * Iso.half_h() + Iso.half_h()
	)
	# JAMAIS TOURNE — voir la note du haut. Retourne pour regarder dans le sens
	# de la jambe, et c'est tout.
	var k: float = look["scale"]
	s.scale = Vector2(d["facing"] * k, k)
	# UN CANARD QUI PLONGE se fond sous l'eau, puis reapparait a son nouveau coin.
	var dive_ms: float = float(look["dive_ms"])
	if d["diving"] == 0.0:
		s.modulate.a = 1.0
	elif d["diving"] <= dive_ms:
		s.modulate.a = 1.0 - d["diving"] / dive_ms
	else:
		s.modulate.a = (d["diving"] - dive_ms) / dive_ms
	# LA PROFONDEUR, pour qu'un canard qui nage vers le sud passe DEVANT ce qui
	# est au nord de lui — un autre canard, un rocher, la cote de l'ile.
	s.z_index = Iso.depth(int(floor(p.x)), int(floor(p.y))) + 1
	s.texture = _frames[int(_elapsed / float(look["frame_ms"]) + d["phase"]) % FRAMES]


func clear() -> void:
	for d in _ducks:
		(d["sprite"] as Sprite2D).queue_free()
	_ducks.clear()


func count() -> int:
	return _ducks.size()


## Ou se tient chaque canard, en cases — pour les sondes.
func positions() -> Array[Vector2]:
	var out: Array[Vector2] = []
	for d in _ducks:
		out.append(d["pos"])
	return out
