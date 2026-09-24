class_name MiniMap
extends Control
## LA MINI-CARTE DE L'ILE — les cases autour du lapin, a plat, avec leurs
## chiffres (2026-09-24).
##
## « Si on voit mal » : sur l'ile les arbres, les buissons et les paliers
## couvrent des cases, et un chiffre cache est une deduction perdue. Ici rien
## ne se tient debout : pas de decor, pas de relief, juste le demineur.
##
##   • UN ROND DE TROIS CASES DE DIAMETRE autour du lapin (le joueur,
##     2026-09-24) : ses huit voisines, celles qu'il peut creuser, en grand.
##     Les cases que le bord coupe restent en morceaux, pour le contexte.
##   • EN LOSANGES 2:1, COMME L'ILE, ET LES CHIFFRES COUCHES DESSUS (le skew
##     de tile_view.gd) : la carte est le plateau vu sans ce qui se tient
##     debout. Une grille droite serait tournee de 45° par rapport a l'ecran.
##   • LES MEMES CHIFFRES que le plateau (`TileView._digit_texture`), aux memes
##     couleurs : un 3 est le meme 3 des deux cotes.
##   • UN « ? » SUR LA LISIERE : les cases encore enterrees qui touchent une
##     case ouverte — celles ou l'on devine. Pas sur toutes : le rond serait
##     un mur de points d'interrogation.
##   • ELLE NE FAIT QUE REGARDER. Les tapes s'arretent sur elle (sans quoi le
##     doigt creuserait la case de l'ile qui est dessous, a l'aveugle).
##
## Montee par l'ile (island.gd `_add_chrome`), qui lui donne son plateau et
## ou se tient le lapin — DEUX Callable, relus a chaque dessin : l'ile refait
## son plateau a chaque instantane, une reference gardee serait l'ancien.

## -> IslandBoard, -> Vector2i, et -> Array (les cases des autres lapins).
var board_of: Callable
var centre: Callable
var others: Callable

## Le diametre du rond, en largeurs de case.
const DIAMETER := 3.5
## Les cases parcourues de chaque cote du lapin : assez pour couvrir le rond.
const RADIUS := 5
## La demi-largeur d'un losange, en pixels d'ecran ; sa demi-hauteur suit la
## proportion des tuiles de l'ile (44x24).
const HALF := 16.0
const HALF_H := HALF * float(Iso.BURROW_TILE_H) / float(Iso.BURROW_TILE_W)
## Les chiffres, agrandis depuis leur texture de plateau.
const DIGIT_SCALE := 1.0
## Le nombre de cotes du rond.
const ROUND_SIDES := 48

## LE CADRE : la lunette du cadran d'energie (dial-empty), ses quatre
## pointes d'or en rose des vents — une boussole. Evidee et sans sa planche
## (assets/ui/compass-ring.png, 2026-09-24) : la carte se dessine DESSOUS et
## se voit par le trou ; le bronze couvre son bord.
const FRAME_TEX := preload("res://assets/ui/compass-ring.png")
## Le trou, dans les 102 px de la lunette : son centre et son rayon.
const HOLE_CENTRE := Vector2(51.0, 51.0)
const HOLE_HALF := Vector2(34.5, 34.5)
## La carte deborde sous le bronze de ce qu'il faut pour ne laisser aucun jour.
const UNDER_STONE := 2.0
## L'echelle de la lunette : son trou fait le rond de la carte.
const FRAME_SCALE := DIAMETER * HALF / 34.5
## Une relecture tous les dixiemes de seconde suffit : le plateau change au
## rythme d'un pas.
const TICK := 0.1

const SEA := Color("#1b4f7a")
const BURIED := Color("#5d9b3a")
const BURIED_EDGE := Color("#3f7428")
const HINTED := Color("#8cc45a")
const DUG := Color("#c9a36b")
const DUG_EDGE := Color("#9c7a47")
const BLOCKED := Color("#2f5a26")
const BOMB := Color("#e0402c")
const FLAG := Color("#ff4b3a")
const CHEST := Color("#ffd45c")
const ME := Color("#ffffff")
const ME_RING := Color("#141a26")
## LES AUTRES LAPINS : rouges, ceux qui peuvent pousser a l'eau.
const ENEMY := Color("#ff4b3a")
const FRAME := Color("#141a26", 0.72)

var _tick := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	var side := float(FRAME_TEX.get_width()) * FRAME_SCALE
	custom_minimum_size = Vector2(side, side)
	size = custom_minimum_size


func _process(delta: float) -> void:
	_tick += delta
	if _tick >= TICK:
		_tick = 0.0
		queue_redraw()


func _draw() -> void:
	# LE LAPIN AU MILIEU DU TROU, pas de la boite : le trou n'est pas centre.
	var mid := HOLE_CENTRE * FRAME_SCALE
	_mid = mid
	_hole = HOLE_HALF * FRAME_SCALE + Vector2(UNDER_STONE, UNDER_STONE)
	_round = _ellipse(mid, _hole)
	draw_colored_polygon(_round, FRAME)
	var board: IslandBoard = board_of.call() if board_of.is_valid() else null
	var me: Vector2i = centre.call() if centre.is_valid() else Vector2i(-1, -1)
	if board == null or me.x < 0:
		_frame()
		return
	# DE L'ARRIERE VERS L'AVANT, comme l'ile : rien ne se chevauche, mais le
	# lapin vient apres ses voisines.
	for dy in range(-RADIUS, RADIUS + 1):
		for dx in range(-RADIUS, RADIUS + 1):
			_cell(board, me + Vector2i(dx, dy), mid + _offset(dx, dy))
	# LE LAPIN : un rond blanc cerne, sur sa case — sous son chiffre il n'y en
	# a jamais (la case ou l'on se tient est creusee), mais pas sur le centre
	# pour ne rien cacher : en bas de la case.
	if others.is_valid():
		for c in others.call():
			var cell: Vector2i = c
			if cell == me or cell.x < 0:
				continue
			var at := mid + _offset(cell.x - me.x, cell.y - me.y)
			if ((at - _mid) / _hole).length() > 0.85:
				continue
			draw_circle(at, HALF_H * 0.45, ME_RING)
			draw_circle(at, HALF_H * 0.3, ENEMY)
	draw_circle(mid, HALF_H * 0.45, ME_RING)
	draw_circle(mid, HALF_H * 0.3, ME)
	_frame()


func _frame() -> void:
	draw_texture_rect(FRAME_TEX, Rect2(Vector2.ZERO, FRAME_TEX.get_size() * FRAME_SCALE), false)


var _round := PackedVector2Array()
var _mid := Vector2.ZERO
var _hole := Vector2.ONE


func _ellipse(at: Vector2, r: Vector2) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in range(ROUND_SIDES):
		var a := TAU * float(i) / float(ROUND_SIDES)
		out.append(at + Vector2(cos(a) * r.x, sin(a) * r.y))
	return out


## Ou tombe une case a (dx, dy) du lapin : la projection de l'ile, a plat.
func _offset(dx: int, dy: int) -> Vector2:
	return Vector2(float(dx - dy) * HALF, float(dx + dy) * HALF_H)


func _cell(board: IslandBoard, cell: Vector2i, at: Vector2) -> void:
	# HORS DU ROND, rien ; a cheval, la case est decoupee (`_diamond`) et ses
	# marques ne se posent que si leur centre est dedans.
	var d := (at - _mid) / _hole
	var inside := d.length() <= 0.8
	if d.length() > 1.4:
		return
	var map := board.map
	if map == null or not map.is_land(cell.x, cell.y):
		_diamond(at, SEA, Color.TRANSPARENT, 0.92)
		return
	if not board.state.has(cell):
		_diamond(at, BLOCKED, Color.TRANSPARENT, 0.92)
		return
	var st = board.state[cell]
	var dug: bool = st == IslandBoard.State.DUG
	var fill := DUG if dug else (HINTED if st == IslandBoard.State.HINTED else BURIED)
	_diamond(at, fill, DUG_EDGE if dug else BURIED_EDGE, 0.92)

	if not inside:
		return
	if dug and board.content.get(cell) == IslandBoard.Content.BOMB:
		draw_circle(at, HALF_H * 0.5, BOMB)
	elif board.shows_number(cell):
		# COUCHE SUR LE LOSANGE, les axes sur ses diagonales — la matrice de
		# tile_view.gd (`holder.transform`), a l'echelle de la carte.
		_lay(TileView._digit_texture(int(board.adjacent[cell])), at)
	elif st == IslandBoard.State.BURIED and not board.is_flagged(cell) and _on_edge(board, cell):
		_lay(_question(), at)
	# UN COFFRE PAS ENCORE PRIS s'annonce, comme sur l'ile.
	if not dug and board.chest_tier.has(cell):
		_diamond(at, CHEST, Color.TRANSPARENT, 0.45)
	if board.is_flagged(cell):
		var kx := HALF * 0.45
		var ky := HALF_H * 0.45
		draw_line(at + Vector2(-kx, -ky), at + Vector2(kx, ky), FLAG, 2.0)
		draw_line(at + Vector2(-kx, ky), at + Vector2(kx, -ky), FLAG, 2.0)


## UN GLYPHE COUCHE sur le losange en `at`.
func _lay(tex: Texture2D, at: Vector2) -> void:
	var k := DIGIT_SCALE
	draw_set_transform_matrix(Transform2D(Vector2(1.0, HALF_H / HALF) * k,
		Vector2(-1.0, HALF_H / HALF) * k, at))
	draw_texture(tex, -tex.get_size() * 0.5)
	draw_set_transform_matrix(Transform2D.IDENTITY)


## Enterree, et a cote d'une case ouverte (creusee ou chiffree) ?
func _on_edge(board: IslandBoard, cell: Vector2i) -> bool:
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0:
				continue
			var st = board.state.get(cell + Vector2i(dx, dy))
			if st == IslandBoard.State.DUG or st == IslandBoard.State.HINTED:
				return true
	return false


## LE « ? » dans la main des chiffres du plateau : 3x5 pixels doubles, cerne,
## mais creme et un peu passe — une question, pas une reponse.
const QUESTION_ROWS := ["111", "001", "011", "000", "010"]
const QUESTION_FACE := Color("#fff3d6", 0.85)
const QUESTION_RING := Color("#2b221e", 0.7)
static var _question_tex: ImageTexture

static func _question() -> ImageTexture:
	if _question_tex != null:
		return _question_tex
	var px := TileView.DIGIT_PX
	var img := Image.create(3 * px + 2, QUESTION_ROWS.size() * px + 2, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for pass_i in range(2):
		for y in range(QUESTION_ROWS.size()):
			for x in range(3):
				if String(QUESTION_ROWS[y])[x] != "1":
					continue
				var grow := 1 if pass_i == 0 else 0
				for dy in range(-grow, px + grow):
					for dx in range(-grow, px + grow):
						img.set_pixel(1 + x * px + dx, 1 + y * px + dy,
							QUESTION_RING if pass_i == 0 else QUESTION_FACE)
	_question_tex = ImageTexture.create_from_image(img)
	return _question_tex


func _diamond(at: Vector2, fill: Color, edge: Color, share: float) -> void:
	var w := HALF * share
	var h := HALF_H * share
	var pts := PackedVector2Array([at + Vector2(0, -h), at + Vector2(w, 0),
		at + Vector2(0, h), at + Vector2(-w, 0)])
	for part in Geometry2D.intersect_polygons(pts, _round):
		draw_colored_polygon(part, fill)
		if edge.a > 0.0:
			draw_polyline(part + PackedVector2Array([part[0]]), edge, 1.0)
