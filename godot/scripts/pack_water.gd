extends Node2D
class_name PackWater
## LA HOULE DU PACK, posee sur les cases de l'ile.
##
## Porte de src/game/fx/PackWater.ts.
##
## POURQUOI UNE IMAGE DESSINEE ET PAS UNE SILHOUETTE CALCULEE. Le web a
## reconstruit cette frange deux fois — l'ecume comme seize copies decalees de
## la silhouette de l'ile, reunies en anneau — et les deux tentatives butaient
## sur le meme mur : une forme derivee du plateau HERITE de son escalier en
## losanges, et aucune n'a jamais produit le bord irregulier, pointille a la
## main, qu'a la reference. L'anneau ne pouvait meme pas etre evide.
##
## Le pack livre la houle DEJA DESSINEE, ce bord compris — seize images. On en
## pose une par case de rivage, et l'ondulation devient l'animation du pack
## plutot qu'une carte de deplacement : plus de silhouette, plus de flou, plus
## d'union, plus de masque.

## L'IMAGE CUITE, en pixels. Le DOUBLE de la case, expres : la houle est
## cisaillee a sa propre taille et DEBORDE du losange 44x24 sur lequel elle se
## pose. Une image a la taille d'une case rognerait ce debordement — or c'est
## exactement lui qui fait que des cases voisines se rejoignent en une cote.
const FRAME := 128
const FOAM_FRAMES := 16

const FOAM_SHEET := preload("res://assets/water/pack-foam.webp")

var map: BurrowMap

var _frames: Array[Texture2D] = []
var _sprites: Array[Sprite2D] = []
## L'image de depart de chaque sprite, pour que la cote ne pulse jamais.
var _offsets: PackedInt32Array = PackedInt32Array()
var _elapsed := 0.0


## SOUS TOUT LE TERRAIN, D'UN SEUL BLOC — pas trie case par case.
##
## C'est le `sea.zIndex = -1000` du web, et il a fallu le voir sur l'appareil
## pour comprendre pourquoi il est si bas. Premiere version ici : chaque sprite
## d'ecume trie sur `Iso.depth(case) - 1`, « derriere sa propre case ». Ca la
## met bien derriere SA case — et DEVANT toutes les cases plus lointaines. Sur
## le Seeker, le resultat etait un QUADRILLAGE CLAIR pose sur l'herbe du
## pourtour au lieu d'une frange de rivage. Paul, le 2026-09-22 : « l'ecume on
## la voit aussi dans la terre ».
##
## L'image est un LOSANGE PLEIN (mesure : 48x24 pixels opaques, centre compris),
## pas un anneau : posee devant quoi que ce soit, elle le recouvre. Sa place est
## donc SOUS tout le terrain, ou son debordement se glisse sous la terre qu'elle
## lape — « beneath the land it laps ».
const Z_SEA := -1000


func _ready() -> void:
	y_sort_enabled = false
	z_index = Z_SEA
	_slice()


func _slice() -> void:
	if not _frames.is_empty():
		return
	for i in range(FOAM_FRAMES):
		var frame := AtlasTexture.new()
		frame.atlas = FOAM_SHEET
		frame.region = Rect2(i * FRAME, 0, FRAME, FRAME)
		_frames.append(frame)


## POSE LA HOULE SUR CHAQUE CASE DE TERRE QUI TOUCHE LA MER.
##
## LES CASES DE TERRE DU BORD, PAS LES CASES DE MER D'A COTE — et c'est le
## piege que ce commentaire existe pour desarmer.
##
## Poser un sprite sur chaque case de mer voisine du rivage mettait la houle une
## tuile ENTIERE au large : ca se lisait comme un chapelet de losanges flottant
## au loin, pas comme une ligne qui se brise sur la cote. La rentrer d'une case
## — sur la terre la plus exterieure — laisse le debordement propre du sprite
## faire le travail : il couvre la case ou il est pose et deborde dans l'eau
## au-dela.
func build() -> void:
	clear()
	if map == null:
		return
	_slice()

	var look: Dictionary = WaterLook.FOAM
	for row in range(map.height):
		for col in range(map.width):
			if not map.is_land(col, row):
				continue
			if not _touches_sea(col, row):
				continue

			var f := Sprite2D.new()
			f.texture = _frames[0]
			f.centered = true
			# LE CENTRE DU LOSANGE, dans la convention de ce portage :
			# `screen_of` rend le coin HAUT (voir burrow_map.gd).
			# LEVEE AU PALIER DE SA CASE, et c'est `screen_of` qui le fait :
			# il porte deja le lift. Posee A PLAT, la houle pendrait un
			# TIER_LIFT SOUS l'herbe qu'elle est censee border — cachee derriere
			# la terre surelevee au nord et a l'ouest, frange detachee sous la
			# falaise au sud et a l'est. Le web a le meme piege et le meme
			# remede (`foamAt`).
			f.position = map.screen_of(col, row) + Vector2(0, Iso.half_h())
			f.scale = Vector2(look["overlap"], look["overlap"])
			f.modulate = look["color"]
			f.modulate.a = look["alpha"]
			add_child(f)
			_sprites.append(f)

			# HACHE DEPUIS LA CASE, pas tire au hasard : la meme ile s'anime
			# toujours pareil, ce qui rend une capture d'ecran comparable.
			var hash := absf(sin(float(col) * 127.1 + float(row) * 311.7) * 43758.5453)
			hash = hash - floorf(hash)
			_offsets.append(int(hash * float(FOAM_FRAMES) * look["phase"]))


## VRAI quand l'une des huit voisines est de la mer — donc une case de rivage.
func _touches_sea(x: int, y: int) -> bool:
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0:
				continue
			if not map.is_land(x + dx, y + dy):
				return true
	return false


func _process(delta: float) -> void:
	if _sprites.is_empty():
		return
	_elapsed += delta * 1000.0
	var base := int(_elapsed / float(WaterLook.FOAM["frame_ms"]))
	for i in range(_sprites.size()):
		_sprites[i].texture = _frames[(base + _offsets[i]) % FOAM_FRAMES]


func clear() -> void:
	for s in _sprites:
		s.queue_free()
	_sprites.clear()
	_offsets = PackedInt32Array()


## Combien de cases portent la houle — pour les sondes.
func count() -> int:
	return _sprites.size()
