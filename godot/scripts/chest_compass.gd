extends Control
class_name ChestCompass
## LA BOUSSOLE DES COFFRES — un chevron au bord de l'ecran pour chaque coffre
## hors du cadre, dans la couleur de son palier.
##
## Porte de src/game/fx/ChestCompass.ts. Les coffres sont le but de l'ile et
## ils dorment sur son pourtour (`rimTiles`) : au cadrage d'ouverture, TOUS
## sont hors de l'ecran. Sans elle, le but ne se trouve qu'en promenant la
## camera au hasard.
##
## EN PIXELS D'ECRAN, pas du monde : le web contre-met a l'echelle un calque
## dans le conteneur de la camera ; ici on vit directement dans un
## CanvasLayer et on lit la position de chaque coffre a travers la camera
## (`get_global_transform_with_canvas`). Meme resultat, sans rien a annuler.
##
## RELUE A CHAQUE IMAGE. Une dizaine de coffres, trois multiplications
## chacun : moins cher que de suivre chaque mouvement de camera, et rien ne
## peut se desynchroniser.
##
## Pas sur la premiere ile : son coffre a sa fleche, et le couloir n'a qu'une
## direction.

const ARROW := preload("res://assets/ui/d8-arrow-down.png")

## A combien du bord de l'ecran se pose le chevron.
const INSET := 34.0
## Un coffre est « dans le cadre » s'il est a au moins une case et demie
## (a l'echelle de la camera) de chaque bord : juste au bord, on le voit mal.
const IN_VIEW_TILES := 1.5
## Le fondu en entree : le chevron apparait sur une bande, pas d'un coup.
const FADE_BAND := 0.45
const FADE_OF_MARGIN := 0.6
const SCALE := 1.4
## La largeur d'une case, en pixels du monde (`ISO_TILE_W`).
const TILE_W := 44.0

## Ou lire les coffres (`TileView.chest_targets`) et l'echelle de la camera
## (le noeud de l'ile porte la camera dans sa position et son echelle).
var tiles: TileView
var cam: Node2D

var _pool: Array[Sprite2D] = []


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func _process(_delta: float) -> void:
	var used := 0
	if tiles != null and cam != null and is_visible_in_tree():
		used = _layout()
	for i in range(used, _pool.size()):
		_pool[i].visible = false


func _layout() -> int:
	var view := get_viewport_rect().size
	if view.x <= 0.0 or view.y <= 0.0:
		return 0
	var centre := view * 0.5
	var margin := TILE_W * cam.scale.x * IN_VIEW_TILES
	var used := 0
	for target in tiles.chest_targets():
		var node: Node2D = target.node
		if not is_instance_valid(node):
			continue
		var at := node.get_global_transform_with_canvas().origin
		var d := at - centre
		if d == Vector2.ZERO:
			continue
		if at.x > margin and at.x < view.x - margin \
				and at.y > margin and at.y < view.y - margin:
			continue
		var reach := d.length()
		var u := d / reach
		# OU LE RAYON DEPUIS LE CENTRE SORT DU CADRE INSET.
		var tx := INF if u.x == 0.0 else (view.x * 0.5 - INSET) / absf(u.x)
		var ty := INF if u.y == 0.0 else (view.y * 0.5 - INSET) / absf(u.y)
		var at_frame := minf(tx, ty)
		var dist := minf(at_frame, reach - margin)
		# Un coffre juste derriere le bord : pas encore de chevron, il entre.
		if dist <= 0.0 or reach - margin < at_frame:
			continue
		var headroom := (reach - margin) - at_frame
		var band := minf(margin * FADE_OF_MARGIN, at_frame * FADE_BAND)
		var s := _take(used)
		used += 1
		var tint: Color = target.tint
		tint.a = 1.0 if band <= 0.0 else clampf(headroom / band, 0.0, 1.0)
		s.modulate = tint
		s.position = centre + u * dist
		s.rotation = atan2(d.y, d.x) - PI * 0.5
		s.visible = true
	return used


func _take(i: int) -> Sprite2D:
	if i < _pool.size():
		return _pool[i]
	var s := Sprite2D.new()
	s.texture = ARROW
	s.centered = true
	s.scale = Vector2.ONE * SCALE
	s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(s)
	_pool.append(s)
	return s
