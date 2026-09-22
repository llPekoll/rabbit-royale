@tool
class_name NineSlice
extends Control
## UN CADRE EN NEUF MORCEAUX, dessine a l'echelle de l'ECRAN et non de la
## source.
##
## POURQUOI PAS NinePatchRect. Il dessine chaque bord a sa taille SOURCE, et
## tout l'art du web est decoupe autrement : `border-image: leaf-frame 110 90
## 85 90 / 36px` prend 110 pixels de source et les rend sur 36 ; la planche
## doree prend 340 et les rend sur 30. Peko a contourne ca pour les planches
## en reduisant les textures elles-memes (plank_button.gd) ; ici les marges
## d'ecran sont un parametre, et n'importe quel art se pose sans etre refait.
##
## TROIS TRANCHES, C'EST NEUF AVEC DEUX A ZERO. Une planche (`0 30 fill`) n'a
## pas de bord haut ni bas : l'art est etire sur toute la hauteur, seuls les
## bouts sont preserves. Mettre `slice.y` et `slice.w` a zero fait exactement
## ca — les rangees vides ne se dessinent pas.
##
## `fill` peint le centre, comme le mot-cle du CSS ; sans lui le cadre est un
## trou, ce qu'on veut pour poser un cadre PAR-DESSUS un contenu.

## La texture, et ses coupes en PIXELS SOURCE : gauche, haut, droite, bas.
@export var texture: Texture2D:
	set(value):
		texture = value
		queue_redraw()

@export var slice := Vector4i(0, 0, 0, 0):
	set(value):
		slice = value
		queue_redraw()

## La largeur de chaque bord A L'ECRAN, meme ordre. Zero = la taille source.
@export var edge := Vector4(0, 0, 0, 0):
	set(value):
		edge = value
		queue_redraw()

@export var fill := true:
	set(value):
		fill = value
		queue_redraw()

@export var tint := Color.WHITE:
	set(value):
		tint = value
		queue_redraw()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## Le raccourci pour le code : une texture, ses coupes, ses bords.
static func make(tex: Texture2D, src: Vector4i, screen: Vector4 = Vector4.ZERO, painted: bool = true) -> NineSlice:
	var node := NineSlice.new()
	node.texture = tex
	node.slice = src
	node.edge = screen
	node.fill = painted
	return node


## Ce que les bords prennent a l'ecran, pour qui pose un contenu dedans.
func inset() -> Vector4:
	return Vector4(_edge(0), _edge(1), _edge(2), _edge(3))


func _edge(i: int) -> float:
	return edge[i] if edge[i] > 0.0 else float(slice[i])


func _draw() -> void:
	if texture == null:
		return
	var tw := float(texture.get_width())
	var th := float(texture.get_height())
	var w := size.x
	var h := size.y

	# Les coupes de source, bornees a la texture ; les bords d'ecran, bornes a
	# la boite — un cadre plus petit que ses coins ecrase les coins plutot que
	# de les faire deborder.
	var sl := minf(slice.x, tw)
	var st := minf(slice.y, th)
	var sr := minf(slice.z, tw - sl)
	var sb := minf(slice.w, th - st)
	var scale_x := minf(1.0, w / maxf(1.0, _edge(0) + _edge(2)))
	var scale_y := minf(1.0, h / maxf(1.0, _edge(1) + _edge(3)))
	var dl := _edge(0) * scale_x
	var dt := _edge(1) * scale_y
	var dr := _edge(2) * scale_x
	var db := _edge(3) * scale_y

	var src_x := [0.0, sl, tw - sr, tw]
	var src_y := [0.0, st, th - sb, th]
	var dst_x := [0.0, dl, w - dr, w]
	var dst_y := [0.0, dt, h - db, h]

	for row in 3:
		for col in 3:
			if row == 1 and col == 1 and not fill:
				continue
			var src := Rect2(src_x[col], src_y[row], src_x[col + 1] - src_x[col], src_y[row + 1] - src_y[row])
			var dst := Rect2(dst_x[col], dst_y[row], dst_x[col + 1] - dst_x[col], dst_y[row + 1] - dst_y[row])
			if src.size.x <= 0.0 or src.size.y <= 0.0 or dst.size.x <= 0.0 or dst.size.y <= 0.0:
				continue
			draw_texture_rect_region(texture, dst, src, tint)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()
