class_name ScrollFade
extends Control
## LE BORD D'UNE LISTE QUI DEFILE FOND tant qu'il y a quelque chose derriere
## (scroll-fade.tsx). Une carte coupee net par le bord se lit comme la fin de
## la liste ; la barre de defilement, elle, ne se voit pas assez (Paul,
## 2026-09-23, la boutique). Le fondu ne prend pas de place et dit « encore » :
## il ne s'allume que du cote ou l'on peut encore aller, et s'eteint au bout.
##
## UN VOILE DE LA COULEUR DU FOND, pose sur le bord, et non un masque. Les
## deux autres chemins cassent sur les cartes de la boutique, qui se
## decoupent deja elles-memes (`clip_children`) : un masque imbrique effacait
## leur art et leur texte, et une copie du fond (BackBufferCopy) etait
## ecrasee par leur propre passage dans le tampon. Les listes vivent toutes
## sur le parchemin des dialogues, uni : sa couleur suffit.

## La longueur du fondu, en pixels de design : celle de la colonne du terrier.
const FADE := 36.0

static var _parchment := Color(0, 0, 0, 0)

var _scroll: ScrollContainer
var _fade := FADE
var _tone := Color.WHITE
var _sides := Vector4.ZERO


## Pose le fondu sur `scroll`, vers `tone` (le parchemin par defaut). Rien a
## changer dans ce qu'il contient.
static func attach(scroll: ScrollContainer, tone: Color = Color(0, 0, 0, 0), fade: float = FADE) -> ScrollFade:
	var node := ScrollFade.new()
	node._scroll = scroll
	node._fade = fade
	node._tone = tone if tone.a > 0.0 else parchment()
	# Interne et en queue : le ScrollContainer ne le compte pas comme son
	# contenu, et il se dessine par-dessus.
	scroll.add_child(node, false, Node.INTERNAL_MODE_BACK)
	return node


## Le parchemin des dialogues, lu au centre de sa texture.
static func parchment() -> Color:
	if _parchment.a == 0.0:
		var img := Kit.LEAF_FRAME.get_image()
		if img.is_compressed():
			img.decompress()
		_parchment = img.get_pixel(img.get_width() / 2, img.get_height() / 2)
		_parchment.a = 1.0
	return _parchment


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for bar: Range in [_scroll.get_h_scroll_bar(), _scroll.get_v_scroll_bar()]:
		bar.value_changed.connect(_update.unbind(1))
		bar.changed.connect(_update)
	_scroll.resized.connect(_update)
	_scroll.sort_children.connect(_update)
	_update()


## Seulement les cotes ou il reste a voir : gauche, haut, droite, bas.
func _update() -> void:
	var box := _scroll.size
	position = Vector2.ZERO
	size = box
	var h := _scroll.get_h_scroll_bar()
	var v := _scroll.get_v_scroll_bar()
	var fx := minf(_fade, box.x * 0.25)
	var fy := minf(_fade, box.y * 0.25)
	var sides := Vector4(
		fx if h.value > 0.5 else 0.0,
		fy if v.value > 0.5 else 0.0,
		fx if h.value + h.page < h.max_value - 0.5 else 0.0,
		fy if v.value + v.page < v.max_value - 0.5 else 0.0)
	if sides != _sides:
		_sides = sides
		queue_redraw()


func _draw() -> void:
	var clear := Color(_tone, 0.0)
	var w := size.x
	var h := size.y
	# Chaque bord : une rampe du fond (dehors) au transparent (dedans).
	if _sides.x > 0.0:
		_ramp(Rect2(0, 0, _sides.x, h), _tone, clear, true)
	if _sides.z > 0.0:
		_ramp(Rect2(w - _sides.z, 0, _sides.z, h), clear, _tone, true)
	if _sides.y > 0.0:
		_ramp(Rect2(0, 0, w, _sides.y), _tone, clear, false)
	if _sides.w > 0.0:
		_ramp(Rect2(0, h - _sides.w, w, _sides.w), clear, _tone, false)


func _ramp(r: Rect2, from: Color, to: Color, across: bool) -> void:
	var pts := PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
	var cols := PackedColorArray([from, to, to, from]) if across \
		else PackedColorArray([from, from, to, to])
	draw_polygon(pts, cols)
