extends Node2D
class_name BurrowLandmarks
## LES BATIMENTS DU TERRIER — l'interface posee dans le monde (2026-09-24).
##
## DIG, DEFEND et RAID etaient trois planches au pied de l'ecran, la boutique
## un bouton du rail, la recolte et l'amelioration deux cartes de la colonne.
## Le joueur a voulu les voir DANS le monde (sa maquette du 2026-09-24) :
## chaque porte est un batiment, avec son nom sur une planche au-dessous.
##
##   • TROIS ILOTS AU SUD, un a l'est. La fosse de fouille (DIG) au sud-ouest,
##     le fort (DEFEND) au sud, le quai et son bateau (RAID) au sud-est,
##     l'etal (SHOP) a l'est. Ils sont FIXES : la memoire du pouce vaut plus
##     que la liberte de les deplacer. Seuls la maison et le potager se
##     deplacent encore (burrow_arrange.gd).
##   • LES ILOTS SONT DU DECOR, PAS DU TERRIER. Ils vivent HORS de la grille
##     19x19 que le serveur connait (generate.ts) : aucune case jouable ne
##     bouge, aucun index de tuile ne change, les raids et les bombes ne les
##     voient pas. Leur carte partage le treillis du terrier (meme origine,
##     memes pas) pour que leurs blocs se trient sur `Iso.depth` avec lui.
##   • ILS SE POSENT SUR LE RELIEF DE LA GRAINE : chacun part du large dans sa
##     direction et rentre vers le centre tant qu'il reste GAP cases d'eau
##     entre lui et toute terre. Une ile large les repousse, une ile maigre
##     les rapproche, l'ecart reste le meme.
##   • LA MAISON (UPGRADE) ET LE POTAGER (HARVEST) ont aussi leur planche.
##     La planche ouvre la porte ; le batiment lui-meme reste a l'amenagement
##     (un clic le prend), sinon on ne pourrait plus le deplacer.
##
## L'ART DES QUATRE BATIMENTS EST PROVISOIRE : decoupe dans la maquette
## (assets/buildings/landmarks/, 2026-09-24), en attendant les vrais sprites
## peints sur le gabarit iso.

## Une porte vient d'etre pressee : "dig", "defend", "raid", "shop",
## "harvest" ou "upgrade". Le chrome sait ou elle mene (`Chrome.go`).
signal door_pressed(door: String)

## Les cases d'eau laissees entre un ilot et toute autre terre.
const GAP := 2
## De combien de cases la mer deborde les ilots dans la carte de la mer.
const SEA_PAD := 3

## LES ILOTS. `dir` est une direction du TREILLIS (col, row) : (0,1) descend
## a gauche a l'ecran, (1,1) droit vers le bas, (1,0) a droite vers le bas,
## (1,-0.6) vers la droite. `size` en cases. `anchor` : le point du sprite,
## en part de sa taille, qui se pose au milieu de l'ilot. `at` decale ce
## point, en cases (le bateau se tient dans l'eau, a l'est de son quai).
const ISLETS := [
	{"door": "dig", "tex": preload("res://assets/buildings/landmarks/dig.png"),
		"dir": Vector2(-0.15, 1.0), "size": Vector2i(3, 3), "scale": 0.8,
		"anchor": Vector2(0.5, 0.62), "at": Vector2.ZERO},
	{"door": "defend", "tex": preload("res://assets/buildings/landmarks/defend.png"),
		"dir": Vector2(1.0, 1.0), "size": Vector2i(4, 4), "scale": 0.72,
		"anchor": Vector2(0.5, 0.78), "at": Vector2.ZERO},
	{"door": "raid", "tex": preload("res://assets/buildings/landmarks/raid.png"),
		"dir": Vector2(1.0, 0.15), "size": Vector2i(3, 3), "scale": 0.72,
		"anchor": Vector2(0.5, 0.88), "at": Vector2(1.6, 0.4)},
	{"door": "shop", "tex": preload("res://assets/buildings/landmarks/shop.png"),
		"dir": Vector2(1.0, -0.7), "size": Vector2i(3, 3), "scale": 0.72,
		"anchor": Vector2(0.5, 0.8), "at": Vector2.ZERO},
]

## LA PLANCHE a l'ecran : taille du verbe et de la ligne, en pixels d'ECRAN.
## Elle se contre-met a l'echelle de la camera (`_process`) : un nom lisible
## ne doit pas retrecir avec l'ile sur un telephone.
const VERB_PX := 13
const LINE_PX := 9
## L'air garde entre une planche et le bord de l'ecran.
const SCREEN_EDGE := 6.0
## Au-dessus des blocs, des decors et du lapin ; sous les rais (3500) et la
## fleche du raid (4000).
const Z_SIGN := 3400
## Le batiment dans son ilot, un cran devant le sol de sa case.
const Z_BUILDING := 8
## La ligne d'etat compte a rebours : une relecture toutes les 15 s.
const TICK_SECONDS := 15.0
## « brought home » reste 4 s sur DIG (page.tsx `BROUGHT_HOME_MS`).
const HAUL_SECONDS := 4.0

var _main: BurrowMap
## Les cases des ilots, dans le treillis du terrier (col, row) -> porte.
var _islet_cells := {}
## La carte de la mer : terrier + ilots, pour l'ecume, les rochers, les
## canards et le cadrage de la maison.
var sea_map: BurrowMap
## Le coin haut-gauche de `sea_map`, dans le treillis du terrier.
var _lo := Vector2i.ZERO
var _terrain: BurrowTerrain
var _buildings := {}
var _signs := {}
## Ou chaque planche se pose, dans le repere du terrier.
var _anchors := {}
var _live := false
var _tick := 0.0


func _ready() -> void:
	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())
	ShopState.shared().changed.connect(refresh)


## POSE LES ILOTS AUTOUR DE `main`, et la carte de la mer qui les englobe.
## Rappele a chaque sol (`show_ground`) : une autre graine, d'autres cotes.
func build(main: BurrowMap) -> void:
	clear()
	_main = main
	var taken := {}
	var tops := {}
	for spec in ISLETS:
		var top := _settle(spec["size"], spec["dir"], taken)
		tops[spec["door"]] = top
		for c in _shape(spec["size"]):
			var cell: Vector2i = top + c
			_islet_cells[cell] = spec["door"]
			taken[cell] = true

	# LE CADRE COMMUN : toutes les cases, le terrier compris, et SEA_PAD de mer.
	var lo := Vector2i(0, 0)
	var hi := Vector2i(main.width - 1, main.height - 1)
	for cell in _islet_cells:
		lo = Vector2i(mini(lo.x, cell.x), mini(lo.y, cell.y))
		hi = Vector2i(maxi(hi.x, cell.x), maxi(hi.y, cell.y))
	lo -= Vector2i(SEA_PAD, SEA_PAD)
	hi += Vector2i(SEA_PAD, SEA_PAD)
	var dims := hi - lo + Vector2i.ONE
	_lo = lo
	var origin := main.origin + Vector2(float(lo.x - lo.y) * Iso.half_w(), float(lo.x + lo.y) * Iso.half_h())

	sea_map = BurrowMap.new(dims.x, dims.y, origin)
	var islets := BurrowMap.new(dims.x, dims.y, origin)
	for row in range(main.height):
		for col in range(main.width):
			sea_map.level[(row - lo.y) * dims.x + (col - lo.x)] = main.level_at(col, row)
	for cell in _islet_cells:
		var i: int = (cell.y - lo.y) * dims.x + (cell.x - lo.x)
		sea_map.level[i] = 1
		islets.level[i] = 1
	sea_map.measure_tiers()
	islets.measure_tiers()

	# UN TERRAIN POUR TOUS LES ILOTS. Ses blocs se trient sur leurs cases
	# LOCALES ; decaler le noeud de la profondeur du coin remet chaque bloc a
	# `Iso.depth` de sa case dans le treillis du terrier.
	_terrain = BurrowTerrain.new()
	_terrain.name = "IsletTerrain"
	_terrain.map = islets
	_terrain.z_index = Iso.depth(lo.x, lo.y)
	add_child(_terrain)
	var sods: Array[Vector2i] = []
	for cell in _islet_cells:
		sods.append(cell - lo)
	_terrain.lay_sods(sods)

	for spec in ISLETS:
		_place_building(spec, tops[spec["door"]], islets, lo)
	for spec in ISLETS:
		_lay_bridge(spec["door"])
	for door in ["harvest", "upgrade"]:
		_signs[door] = _make_sign(door)
	refresh()


func clear() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_islet_cells.clear()
	_buildings.clear()
	_signs.clear()
	_anchors.clear()
	_terrain = null
	sea_map = null


## LA MAISON ET LE POTAGER ont bouge (ou le sol vient d'etre pose) : leurs
## planches suivent. `house` est la case de la maison (coin nord de ses 2x2),
## `field` les cases du potager.
func follow(house: Vector2i, field: Array[Vector2i]) -> void:
	if _main == null:
		return
	if house.x >= 0:
		# Le coin SUD de l'emprise, la ou la cour touche l'herbe.
		var front := house + Vector2i(1, 1)
		_anchors["upgrade"] = _main.screen_of(front.x, front.y) + Vector2(0, Iso.half_h() * 2.0 + 2.0)
	else:
		_anchors.erase("upgrade")
	if not field.is_empty():
		var sum_x := 0.0
		var foot := -INF
		for c in field:
			var at := _main.screen_of(c.x, c.y)
			sum_x += at.x
			foot = maxf(foot, at.y + Iso.half_h() * 2.0)
		_anchors["harvest"] = Vector2(sum_x / float(field.size()), foot + 2.0)
	else:
		_anchors.erase("harvest")


## LES PLANCHES SE MONTRENT-ELLES ? Chez soi, hors de tout mode, rien en main.
func set_live(on: bool) -> void:
	if _live == on:
		return
	_live = on
	for door in _signs:
		(_signs[door] as Control).visible = on and _anchors.has(door)


## LE BATIMENT SOUS UN POINT du repere du terrier, ou "". Les planches sont
## des boutons et repondent seules ; ceci est pour le batiment lui-meme, sur
## son ilot — la maison et le potager restent a l'amenagement.
func door_at(point: Vector2) -> String:
	if not _live:
		return ""
	for door in _buildings:
		var s: Sprite2D = _buildings[door]
		var box := Rect2(s.position + s.offset * s.scale, s.texture.get_size() * s.scale).grow(-4.0)
		if not box.has_point(point):
			continue
		# Le vrai pixel, pas la boite : le coin vide d'un sprite n'est pas lui.
		var local := (point - s.position) / s.scale - s.offset
		var img := s.texture.get_image()
		if img != null and img.get_pixelv(Vector2i(local)).a > 0.1:
			return door
	# L'ILOT AUSSI : une tape sur son herbe vaut son batiment.
	var cell := BurrowPick.at(sea_map, point) if sea_map != null else Vector2i(-1, -1)
	if cell.x >= 0:
		var lattice := cell + _lo
		return String(_islet_cells.get(lattice, ""))
	return ""


## LA RECOLTE RAMENEE DE L'ILE, posee sur DIG le temps de la lire.
func show_haul(amount: int) -> void:
	var sign: Control = _signs.get("dig")
	if sign == null or amount <= 0:
		return
	var note := Kit.plank_note("+%s %s" % [I18N.group_digits(amount), I18N.t("loop.broughtHome")], LINE_PX + 2)
	note.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sign.add_child(note)
	note.position = Vector2(0, -note.get_combined_minimum_size().y - 4.0)
	Sound.play("coin")
	var tween := note.create_tween()
	tween.tween_interval(HAUL_SECONDS)
	tween.tween_property(note, "modulate:a", 0.0, 0.35)
	tween.tween_callback(note.queue_free)


# ── La pose ────────────────────────────────────────────────────────────────

## UN ILOT RECTANGULAIRE aux coins rognes : un rectangle se lit comme une
## dalle, pas comme une ile.
func _shape(size: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(size.y):
		for x in range(size.x):
			var corner := (x == 0 or x == size.x - 1) and (y == 0 or y == size.y - 1)
			if corner and size.x >= 4 and size.y >= 4:
				continue
			out.append(Vector2i(x, y))
	return out


## DU LARGE VERS LE CENTRE, tant que l'ilot reste a GAP cases de toute terre.
func _settle(size: Vector2i, dir: Vector2, taken: Dictionary) -> Vector2i:
	var centre := Vector2(float(_main.width - 1), float(_main.height - 1)) * 0.5
	var d := dir.normalized()
	var half := Vector2(size) * 0.5
	var best := Vector2i(roundi(centre.x + d.x * 30.0 - half.x), roundi(centre.y + d.y * 30.0 - half.y))
	var t := 30.0
	while t > 0.0:
		var top := Vector2i(roundi(centre.x + d.x * t - half.x), roundi(centre.y + d.y * t - half.y))
		if not _clear(top, size, taken):
			break
		best = top
		t -= 0.5
	return best


func _clear(top: Vector2i, size: Vector2i, taken: Dictionary) -> bool:
	for c in _shape(size):
		var cell := top + c
		for dy in range(-GAP, GAP + 1):
			for dx in range(-GAP, GAP + 1):
				var n := cell + Vector2i(dx, dy)
				if _main.is_land(n.x, n.y) or taken.has(n):
					return false
	return true


func _place_building(spec: Dictionary, top: Vector2i, islets: BurrowMap, lo: Vector2i) -> void:
	var size: Vector2i = spec["size"]
	var tex: Texture2D = spec["tex"]
	var mid := Vector2(top) + Vector2(size - Vector2i.ONE) * 0.5 + (spec["at"] as Vector2)
	# Le milieu de l'ilot a l'ecran : le treillis a plat, leve d'un palier.
	var flat := _main.origin + Vector2((mid.x - mid.y) * Iso.half_w(), (mid.x + mid.y) * Iso.half_h())
	var ground := flat + Vector2(0, Iso.half_h() - islets.lift_at(top.x - lo.x + 1, top.y - lo.y + 1))
	var sprite := Sprite2D.new()
	sprite.texture = tex
	sprite.centered = false
	sprite.scale = Vector2.ONE * float(spec["scale"])
	sprite.offset = -tex.get_size() * (spec["anchor"] as Vector2)
	sprite.position = ground
	var front := top + size - Vector2i.ONE
	sprite.z_index = Iso.depth(front.x, front.y) + Z_BUILDING
	add_child(sprite)
	_buildings[spec["door"]] = sprite
	# La planche, sous la pointe sud de l'ilot.
	var south := _main.origin + Vector2(float(front.x - front.y) * Iso.half_w(), float(front.x + front.y) * Iso.half_h())
	# SUR LA RIVE, a cheval sur le bord comme les enseignes de la maquette :
	# pendue sous l'ilot, DEFEND sortait du cadre du Seeker.
	_anchors[spec["door"]] = Vector2(ground.x, south.y + Iso.half_h() * 2.0 - float(islets.lift_px) - 12.0)
	_signs[spec["door"]] = _make_sign(spec["door"])


# ── Les pontons ────────────────────────────────────────────────────────────

## LE PLUS LONG PONTON qu'on pose, en cases d'eau.
const BRIDGE_MAX := 9

## UN PONTON DROIT, le long d'un axe du treillis, du bord de l'ilot a la
## terre la plus proche : un axe iso se lit comme un vrai ponton, une
## diagonale d'ecran comme un escalier. Le plus court des quatre axes gagne.
## PROVISOIRE, dessine au code (Bridge), en attendant l'art.
func _lay_bridge(door: String) -> void:
	var best: Array[Vector2i] = []
	var best_axis := Vector2i.ZERO
	for cell in _islet_cells:
		if _islet_cells[cell] != door:
			continue
		for axis in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var path: Array[Vector2i] = []
			var at: Vector2i = cell + axis
			var landed := false
			while path.size() <= BRIDGE_MAX:
				if _main.is_land(at.x, at.y):
					landed = true
					break
				if _islet_cells.has(at):
					break
				path.append(at)
				at += axis
			if not landed or path.is_empty():
				continue
			# Le ponton doit longer la mer des deux cotes : pas de ponton qui
			# rase une cote sur toute sa longueur.
			if best.is_empty() or path.size() < best.size():
				best = path
				best_axis = axis
	if best.is_empty():
		return
	for i in range(best.size()):
		var cell: Vector2i = best[i]
		var bridge := Bridge.new()
		bridge.axis = best_axis
		bridge.first = i == 0
		bridge.last = i == best.size() - 1
		var flat := _main.origin + Vector2(float(cell.x - cell.y) * Iso.half_w(),
			float(cell.x + cell.y) * Iso.half_h())
		bridge.position = flat + Vector2(0, Iso.half_h() - float(_main.lift_px) + 1.0)
		bridge.z_index = Iso.depth(cell.x, cell.y) + 2
		add_child(bridge)


## UNE CASE DE PONTON : un tablier de planches en travers, deux poteaux par
## bord, une rambarde de corde. Dessine autour du centre de la case.
class Bridge extends Node2D:
	const DECK := Color("#a8743f")
	const DECK_LIGHT := Color("#c08a4f")
	const SEAM := Color("#6e4524")
	const SIDE := Color("#4a2e18")
	const POST := Color("#5a3a1f")
	const POST_TOP := Color("#8a5a30")
	const ROPE := Color("#d8b27a")
	## La largeur du tablier, en part d'une case ; son epaisseur en pixels.
	const WIDTH := 0.42
	const THICK := 3.0
	const PLANKS := 4
	const POST_H := 7.0
	## Le tablier deborde sur la terre aux deux bouts.
	const REACH := 0.35

	var axis := Vector2i(1, 0)
	var first := false
	var last := false

	func _draw() -> void:
		# Un pas le long de l'axe, et un pas en travers, a l'ecran.
		var along := Vector2(float(axis.x - axis.y) * Iso.half_w(), float(axis.x + axis.y) * Iso.half_h())
		var perp_cell := Vector2i(-axis.y, axis.x)
		var across := Vector2(float(perp_cell.x - perp_cell.y) * Iso.half_w(),
			float(perp_cell.x + perp_cell.y) * Iso.half_h()) * WIDTH
		var back := -0.5 - (REACH if first else 0.0)
		var front := 0.5 + (REACH if last else 0.0)
		var a := along * back
		var b := along * front
		var h := across * 0.5
		var deck := PackedVector2Array([a - h, b - h, b + h, a + h])
		# Le flanc, sous le tablier.
		var drop := Vector2(0, THICK)
		draw_colored_polygon(PackedVector2Array([a - h, b - h, b - h + drop, a - h + drop]), SIDE)
		draw_colored_polygon(PackedVector2Array([a + h, b + h, b + h + drop, a + h + drop]), SIDE)
		draw_colored_polygon(deck, DECK)
		# Les planches en travers, une sur deux plus claire.
		var span := front - back
		var n := int(round(float(PLANKS) * span))
		for i in range(n):
			var t0 := back + span * float(i) / float(n)
			var t1 := back + span * float(i + 1) / float(n)
			var p0 := along * t0
			var p1 := along * t1
			if i % 2 == 1:
				draw_colored_polygon(PackedVector2Array([p0 - h, p1 - h, p1 + h, p0 + h]), DECK_LIGHT)
			draw_line(p0 - h, p0 + h, SEAM, 1.0)
		draw_polyline(deck + PackedVector2Array([deck[0]]), SEAM, 1.0)
		# Les poteaux aux deux bords, et la corde entre eux.
		var up := Vector2(0, -POST_H)
		var posts: Array[Vector2] = []
		for side in [-1.0, 1.0]:
			for t in [-0.5, 0.5]:
				posts.append(along * t + across * 0.5 * side)
		for side in [-1.0, 1.0]:
			var p0: Vector2 = along * -0.5 + across * 0.5 * side + up
			var p1: Vector2 = along * 0.5 + across * 0.5 * side + up
			var sag := (p0 + p1) * 0.5 + Vector2(0, 2.0)
			draw_polyline(PackedVector2Array([p0, sag, p1]), ROPE, 1.0)
		for p in posts:
			draw_line(p + Vector2(0, THICK + 2.0), p + up, POST, 2.0)
			draw_rect(Rect2(p + up - Vector2(1, 1), Vector2(2, 2)), POST_TOP)


# ── Les planches ───────────────────────────────────────────────────────────

class Sign extends Button:
	var door := ""
	var verb: Label
	var line: Label
	var badge: Label
	var _body: PanelContainer

	func _init(p_door: String) -> void:
		door = p_door
		flat = true
		focus_mode = Control.FOCUS_NONE
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		for state in ["normal", "hover", "pressed", "focus", "disabled", "hover_pressed"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())
		_body = PanelContainer.new()
		_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.add_theme_stylebox_override("panel", Kit.style_plank(2.0, 12.0, 3.0))
		add_child(_body)
		var col := VBoxContainer.new()
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_theme_constant_override("separation", 0)
		_body.add_child(col)
		verb = Kit.label("", VERB_PX, Palette.CREAM, true)
		verb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		verb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(verb)
		line = Kit.label("", LINE_PX, Palette.CREAM)
		line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(line)
		badge = Kit.label("!", VERB_PX, Palette.INK)
		badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var bg := StyleBoxFlat.new()
		bg.bg_color = Color("#ffd45c")
		bg.set_corner_radius_all(9)
		bg.set_border_width_all(2)
		bg.border_color = Color("#352011")
		badge.add_theme_stylebox_override("normal", bg)
		badge.custom_minimum_size = Vector2(18, 18)
		badge.visible = false
		add_child(badge)
		button_down.connect(func() -> void: _body.position.y = 2.0)
		button_up.connect(func() -> void: _body.position.y = 0.0)

	func say(word: String, words: String, lit: bool) -> void:
		verb.text = word
		line.text = words
		line.visible = not words.is_empty()
		modulate = Color.WHITE if lit else Color(0.82, 0.82, 0.82)
		_fit.call_deferred()

	func _fit() -> void:
		var want := _body.get_combined_minimum_size()
		_body.size = want
		size = want
		custom_minimum_size = want
		badge.position = Vector2(want.x - 10.0, -8.0)


func _make_sign(door: String) -> Sign:
	var sign := Sign.new(door)
	sign.z_index = Z_SIGN
	sign.z_as_relative = false
	sign.visible = _live and _anchors.has(door)
	sign.pressed.connect(func() -> void: door_pressed.emit(door))
	add_child(sign)
	return sign


## LES PLANCHES SUIVENT LA CAMERA SANS GRANDIR AVEC ELLE : posees sur leur
## ancre du monde, contre-mises a l'echelle du terrier.
func _process(delta: float) -> void:
	var parent := get_parent() as Node2D
	# A L'ECHELLE DU CHROME, pas du monde : 1 sur le Seeker (890x400), plus
	# grand sur un ecran de bureau, comme la barre du haut.
	var view := get_viewport_rect().size
	var ui := clampf(minf(view.x / BurrowCamera.GAME_W, view.y / BurrowCamera.GAME_H), 1.0, 1.6)
	var k := ui / maxf(0.05, parent.scale.x if parent != null else 1.0)
	var shown: Array[Sign] = []
	for door in _signs:
		var sign: Sign = _signs[door]
		if not sign.visible or not _anchors.has(door):
			continue
		sign.scale = Vector2(k, k)
		sign.position = (_anchors[door] as Vector2) - Vector2(sign.size.x * 0.5 * k, 0.0)
		shown.append(sign)
	_part(shown, k)
	# JAMAIS HORS DE L'ECRAN : la maison cadre serre, et le batiment du bord
	# peut deborder — sa planche, elle, reste a portee du pouce.
	if parent != null:
		var s := parent.scale.x
		for sign in shown:
			var at := parent.position + sign.position * s
			var sz := sign.size * sign.scale.x * s
			at.x = clampf(at.x, SCREEN_EDGE, view.x - SCREEN_EDGE - sz.x)
			at.y = clampf(at.y, SCREEN_EDGE, view.y - SCREEN_EDGE - sz.y)
			sign.position = (at - parent.position) / s
	_tick += delta
	if _tick >= TICK_SECONDS:
		_tick = 0.0
		refresh()


## DEUX PLANCHES QUI SE COUVRENT S'ECARTENT, de moitie chacune : la maison
## pose souvent sa cour contre le potager, et UPGRADE tombait sur HARVEST.
func _part(shown: Array[Sign], k: float) -> void:
	const AIR := 4.0
	for _pass in range(3):
		for i in range(shown.size()):
			for j in range(i + 1, shown.size()):
				var a := Rect2(shown[i].position, shown[i].size * k).grow(AIR * k * 0.5)
				var b := Rect2(shown[j].position, shown[j].size * k).grow(AIR * k * 0.5)
				if not a.intersects(b):
					continue
				var push := (minf(a.end.x, b.end.x) - maxf(a.position.x, b.position.x)) * 0.5
				var left := shown[i] if a.get_center().x <= b.get_center().x else shown[j]
				var right := shown[j] if left == shown[i] else shown[i]
				left.position.x -= push
				right.position.x += push


## CE QUE CHAQUE PLANCHE DIT SOUS SON NOM — la raison de la presser.
## Les mots sont ceux des trois planches du sol et des cartes (loop.*,
## burrow.*) : pas une cle de plus a traduire.
func refresh() -> void:
	if _signs.is_empty():
		return
	var b := Home.burrow
	var tank := Home.live_energy() if Home.loaded() else {"energy": 0, "max": 0}
	var energy: int = tank["energy"]
	var run_cost := int(b.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")))
	var crossing := int(b.get("crossingCost", Tuning.i("ENERGY.CROSSING_COST")))
	var garden := Home.live_garden() if Home.loaded() else 0
	var level := int(Home.player.get("level", 1))
	var raid_min := Tuning.i("RABBIT_LEVELS.RAID_MIN", 10)

	var say := func(door: String, word: String, words: String, lit: bool) -> void:
		var sign: Sign = _signs.get(door)
		if sign != null:
			sign.say(word, words, lit)

	var can_dig := energy >= run_cost
	say.call("dig", I18N.shout(I18N.t("loop.dig")),
		I18N.f("loop.runCosts", [crossing]) if can_dig else I18N.f("loop.energyOf", [energy, tank["max"]]),
		can_dig)

	var shield_ms: Variant = b.get("shieldMs", null)
	var guard := I18N.f("loop.shieldFor", [I18N.wait(float(shield_ms))]) \
		if shield_ms != null and float(shield_ms) > 0.0 else I18N.t("loop.noShield")
	say.call("defend", I18N.shout(I18N.t("loop.defend")), guard, true)

	if level < raid_min:
		say.call("raid", I18N.shout(I18N.t("loop.raid")), I18N.f("rabbitLevel.badge", [raid_min]), false)
	else:
		var floor_e := Tuning.raid_floor()
		say.call("raid", I18N.shout(I18N.t("loop.raid")),
			"" if energy >= floor_e else I18N.f("loop.energyOf", [energy, floor_e]), energy >= floor_e)

	say.call("shop", I18N.shout(I18N.t("shop.title")), "", true)
	say.call("harvest", I18N.shout(I18N.t("burrow.harvest")),
		"+%s" % I18N.group_digits(garden) if garden > 0 else I18N.t("loop.gardenEmpty"), garden > 0)

	var cost: Variant = b.get("upgradeCost", null)
	if cost == null:
		say.call("upgrade", I18N.t("burrow.maxLevel"), "", false)
	else:
		say.call("upgrade", I18N.shout(I18N.t("burrow.upgrade")), I18N.group_digits(float(cost)),
			bool(b.get("canUpgrade", false)))

	# LE « ! » DE LA QUETE sur le batiment ou elle mene.
	var pointed := _quest_door()
	for door in _signs:
		(_signs[door] as Sign).badge.visible = door == pointed


## LA PORTE OU MENE LA QUETE (LoopBar `_quest_loop`), ou la ligne « et
## maintenant » sans quete active.
func _quest_door() -> String:
	var door := ""
	var active := Home.active_quest()
	if not active.is_empty():
		door = String(active.get("door", ""))
	elif Home.loaded():
		var b := Home.burrow
		var next := Content.next_action({
			"energy": Home.live_energy()["energy"],
			"runCost": b.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")),
			"nextRunInMs": b.get("nextRunInMs", null),
			"gardenReady": Home.live_garden(),
			"gardenCapacity": b.get("gardenCapacity", 0),
			"shieldMs": b.get("shieldMs", null),
			"trapsLive": 0,
			"targets": [],
		})
		door = String(next.get("door", ""))
	match door:
		"farm":
			return "dig"
		"garden":
			return "harvest"
		"base":
			return "defend"
		"raid", "shop", "upgrade":
			return door
		_:
			return ""
