extends Node2D
class_name SeaRocks
## LES PETITS ROCHERS QUI BALLOTTENT EN PLEINE EAU.
##
## Porte de `IsoIslandView.buildSeaRocks`.
##
## LE PLATEAU N'A RIEN A DIRE DE LA MER — rien ne s'y tient — donc les
## placements ne portent aucun rocher et la VUE tire les siens, SUR UN FLUX DE
## GRAINE A PART pour que la terre n'en soit pas derangee. C'est la meme
## discipline que partout ailleurs dans ce portage : un tirage en plus au
## mauvais endroit decale toute la suite et donne une autre ile que le serveur.
##
## JAMAIS CONTRE LE RIVAGE. Un rocher pose sur une case de mer qui TOUCHE la
## terre se colle a la cote et se lit comme un morceau d'ile detache. On ne les
## met donc qu'en eau ouverte, et c'est aussi ce qui laisse a l'ecume la place
## de sa frange.
##
## LES CANARDS DOIVENT SAVOIR OU ILS SONT : un canard est dessine SOUS le decor,
## et un canard route a travers une case de rocher nageait droit dans le
## rocher. D'ou `has_rock`.

const SHEETS := [
	preload("res://assets/water/sea-rock-01.webp"),
	preload("res://assets/water/sea-rock-02.webp"),
	preload("res://assets/water/sea-rock-03.webp"),
	preload("res://assets/water/sea-rock-04.webp"),
]

var map: BurrowMap
## La graine texte de l'ile — le flux des rochers en derive.
var seed_text := ""

var _cells: Dictionary = {}
var _sprites: Array[Sprite2D] = []
var _frames: Array = []
## Les feuilles decoupees, dans l'ordre des sprites.
var _frames_of: Array = []
var _phases: PackedFloat32Array = PackedFloat32Array()
var _elapsed := 0.0


func _ready() -> void:
	y_sort_enabled = false


## Y a-t-il un rocher sur cette case de mer ?
func has_rock(cell: Vector2i) -> bool:
	return _cells.has(cell)


func build() -> void:
	clear()
	if map == null:
		return
	_slice()

	var look: Dictionary = WaterLook.ROCKS
	# UN FLUX A PART, suffixe comme chez le web (`:sea-rocks`) pour que la
	# meme ile pose toujours les memes rochers sans deranger le relief.
	var rng := Rng.from_seed(seed_text + ":sea-rocks")

	for row in range(map.height):
		for col in range(map.width):
			if map.level_at(col, row) != 0:
				continue
			# EN EAU OUVERTE SEULEMENT : une case de mer qui touche la terre
			# collerait son rocher au rivage.
			if _touches_land(col, row):
				continue
			if rng.next() > look["chance"]:
				continue

			var cell := Vector2i(col, row)
			_cells[cell] = true
			var sheet: Array = _frames[int(rng.next() * float(_frames.size()))]

			var s := Sprite2D.new()
			s.texture = sheet[0]
			s.centered = true
			s.position = map.screen_of(col, row) + Vector2(0, Iso.half_h())
			# LA FEUILLE EST DECOUPEE A 128, le double du 64 du reste du sol :
			# appliquer `size` seule dessinerait un rocher gros comme un arbre.
			# On divise donc par sa propre image d'abord — la meme normalisation
			# que le sol fait avec `metrics.w / TILE`.
			var norm: float = float(BurrowTerrain.TILE) / float(look["frame"])
			# LE FACTEUR EST CELUI DU WEB, EXACTEMENT :
			#   deco_scale * (TILE / frame) * size = 0.4 * (64/128) * 3 = 0.6
			#
			# Premiere version ici : SANS `deco_scale`, et AVEC en plus le
			# `scale_up` du sol (44/42) — soit 1,571, donc 2,6 fois trop gros.
			# Paul sur la capture du Seeker : « les rochers sont un peu gros ».
			# Deux erreurs cumulees, dont une seule se voyait a l'oeil.
			#
			# `GROUND_PAINTED_W` n'a RIEN A FAIRE ici : il corrige ce qu'une
			# TUILE DE SOL peint dans sa boite de 64, ce qui ne dit rien d'un
			# rocher dessine dans une boite de 128.
			var k: float = look["deco_scale"] * norm * look["size"]
			s.scale = Vector2(k, k)
			s.z_index = Iso.depth(col, row) + 1
			add_child(s)
			_sprites.append(s)
			_phases.append(rng.next() * float(look["frames"]))
			_frames_of.append(sheet)


func _slice() -> void:
	if not _frames.is_empty():
		return
	var look: Dictionary = WaterLook.ROCKS
	for sheet in SHEETS:
		var line: Array[Texture2D] = []
		for i in range(look["frames"]):
			var frame := AtlasTexture.new()
			frame.atlas = sheet
			frame.region = Rect2(i * int(look["frame"]), 0, look["frame"], look["frame"])
			line.append(frame)
		_frames.append(line)


func _touches_land(x: int, y: int) -> bool:
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0:
				continue
			if map.is_land(x + dx, y + dy):
				return true
	return false


func _process(delta: float) -> void:
	if _sprites.is_empty():
		return
	_elapsed += delta * 1000.0
	var look: Dictionary = WaterLook.ROCKS
	var base := _elapsed / float(look["frame_ms"])
	for i in range(_sprites.size()):
		var sheet: Array = _frames_of[i]
		var n: int = sheet.size()
		_sprites[i].texture = sheet[int(base + _phases[i]) % n]


func clear() -> void:
	for s in _sprites:
		s.queue_free()
	_sprites.clear()
	_frames_of.clear()
	_phases = PackedFloat32Array()
	_cells.clear()


func count() -> int:
	return _sprites.size()
