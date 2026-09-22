class_name LootChest
extends Control
## LE COFFRE ANIME — la feuille Aseprite du kit (assets/misc/loot-box.webp +
## loot-box.json), avec son eclat au repos et son couvercle qui saute.
##
## Porte de loot-chest.tsx (le coffre ferme et son eclat) et de
## chest-opening.tsx (le couvercle), en gardant ce que ces deux fichiers ont
## decide :
##
##   • L'ECLAT EST LA RAISON D'ETRE DE CETTE FEUILLE. Un coffre plat n'a pas
##     de lumiere dessus ; celui-ci en attrape une toutes les quatre secondes
##     (tag `higblight`, images 0-5). Rare expres : un coffre qui brille sans
##     arret est une icone qui clignote, et un joueur apprend a ne plus la
##     voir.
##   • ON DECOUPE A L'ENCRE, PAS A LA CASE. Chaque image est rognee d'une
##     source 64x64 et les pixels dessines font 23x14, bas dans la case. Un
##     coffre dimensionne « pour avoir l'air bien » n'y arrive jamais : on
##     dimensionne la BOITE et on obtient un petit sprite a la derive. Le
##     controle EST donc le coffre : sa taille est celle de l'encre, et la
##     mise en page ordinaire (un ecart, une hauteur, un centrage) s'applique
##     a ce qu'on voit.
##   • L'OUVERTURE A SA PROPRE FENETRE. Les images du couvercle sont plus
##     grandes et bougent (jusqu'a 30x15, l'une 3px plus haut que le coffre
##     ferme) : le rognage du coffre ferme couperait le couvercle en plein
##     vol. `Crop.OPENING` est l'UNION de toutes les images jouees, lue dans
##     l'atlas et non devinee : 31x17 a (20, 47).
##   • LA FEUILLE SE CHRONOMETRE ELLE-MEME : chaque image porte la duree que
##     l'artiste lui a donnee, donc le rythme du saut se regle dans Aseprite,
##     pas ici.

## Le couvercle a fini de sauter (la derniere image est posee).
signal opened

const SHEET := preload("res://assets/misc/loot-box.webp")
const ATLAS := preload("res://assets/misc/loot-box.json")

enum Crop {
	## Le coffre ferme, au pixel pres : 23x14 a (21, 50). Pour un onglet.
	CHEST,
	## Le coffre ET la place du couvercle : 31x17 a (20, 47). Pour la ceremonie.
	OPENING,
}

const CROPS := {
	Crop.CHEST: Rect2i(21, 50, 23, 14),
	Crop.OPENING: Rect2i(20, 47, 31, 17),
}

## L'eclat au repos — tag `higblight` (sic) de l'atlas.
const SHINE_FROM := 0
const SHINE_TO := 5
## L'ouverture, dans l'ordre de lecture : la moitie arriere du coffre
## (`jump front`, 6-10), puis la levre avant (`jumpback`, 17-21). Les images
## 8 et 19 sont le meme dessin dans les deux tags ; les garder toutes les
## deux est ce que la feuille veut — un seul saut, pas deux moities.
const OPEN_FRAMES := [6, 7, 8, 9, 10, 17, 18, 19, 20, 21]
const CLOSED_FRAME := 0

## Le temps par defaut entre deux eclats (loot-chest.tsx `everyMs`).
const SHINE_EVERY := 4.2

@export var crop: Crop = Crop.CHEST:
	set(value):
		crop = value
		_fit()
## La largeur a l'ecran ; la hauteur suit le rapport du rognage.
@export var width := 46.0:
	set(value):
		width = value
		_fit()
@export var every_seconds := SHINE_EVERY
@export var shine := true

## Les images de l'atlas : {src: Rect2, at: Vector2, ms: float}.
var _frames: Array = []
var _frame := CLOSED_FRAME
## Ce qui joue : une file d'indices, videe image par image.
var _queue: Array = []
var _queue_is_opening := false
var _clock := 0.0
var _rest := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_read_atlas()
	_fit()


func _ready() -> void:
	_rest = every_seconds


## L'atlas d'Aseprite : `frames` est un TABLEAU dans cet export (les vieux
## exports ecrivent un objet) ; on accepte les deux, comme le web.
func _read_atlas() -> void:
	_frames.clear()
	var data: Variant = ATLAS.data
	if not (data is Dictionary):
		return
	var raw: Variant = data.get("frames", [])
	var entries: Array = raw if raw is Array else (raw as Dictionary).values()
	for entry in entries:
		var f: Dictionary = entry["frame"]
		var s: Dictionary = entry["spriteSourceSize"]
		_frames.append({
			"src": Rect2(float(f["x"]), float(f["y"]), float(f["w"]), float(f["h"])),
			"at": Vector2(float(s["x"]), float(s["y"])),
			"ms": float(entry.get("duration", 100)),
		})


func _fit() -> void:
	var box: Rect2i = CROPS[crop]
	custom_minimum_size = Vector2(width, width * float(box.size.y) / float(box.size.x))
	queue_redraw()


## JOUER L'OUVERTURE. Le coffre reste ouvert ensuite ; `opened` part sur la
## derniere image.
func pop() -> void:
	_queue = OPEN_FRAMES.duplicate()
	_queue_is_opening = true
	_clock = 0.0
	_show(_queue.pop_front())


## Reposer le coffre ferme (pour rejouer).
func close() -> void:
	_queue.clear()
	_queue_is_opening = false
	_rest = every_seconds
	_show(CLOSED_FRAME)


func _process(delta: float) -> void:
	if _frames.is_empty():
		return
	if not _queue.is_empty() or _queue_is_opening:
		_clock += delta * 1000.0
		var hold: float = _frames[_frame]["ms"]
		if _clock < hold:
			return
		_clock -= hold
		if _queue.is_empty():
			# La derniere image de l'ouverture a tenu son temps.
			_queue_is_opening = false
			opened.emit()
			return
		_show(_queue.pop_front())
		if _queue.is_empty() and not _queue_is_opening:
			# La fin d'un eclat : retour au repos.
			_show(SHINE_FROM)
			_rest = every_seconds
		return
	if not shine:
		return
	_rest -= delta
	if _rest <= 0.0:
		_queue = range(SHINE_FROM + 1, SHINE_TO + 1)
		_clock = 0.0
		_show(SHINE_FROM)


func _show(index: int) -> void:
	_frame = clampi(index, 0, _frames.size() - 1)
	queue_redraw()


func _draw() -> void:
	if _frames.is_empty():
		return
	var box: Rect2i = CROPS[crop]
	var k := size.x / float(box.size.x)
	var f: Dictionary = _frames[_frame]
	var src: Rect2 = f["src"]
	# Chaque image porte son propre decalage dans la case source, pour que le
	# couvercle retombe la ou il a ete dessine et non dans le coin.
	var at: Vector2 = (f["at"] as Vector2) - Vector2(box.position)
	draw_texture_rect_region(SHEET, Rect2(at * k, src.size * k), src)
