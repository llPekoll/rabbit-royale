extends Node2D
class_name BurrowLandmarks
## LES BATIMENTS DU TERRIER — l'interface posee dans le monde (2026-09-24).
##
## DIG, DEFEND et RAID etaient trois planches au pied de l'ecran, la boutique
## un bouton du rail, la recolte et l'amelioration deux cartes de la colonne.
## Le joueur a voulu les voir DANS le monde (sa maquette du 2026-09-24) :
## chaque porte est un batiment, avec son nom sur une planche au-dessous.
##
##   • TROIS ILOTS AU SUD, un a l'est. La pioche (DIG) au sud-ouest,
##     le bouclier (DEFEND) au sud, les epees croisees (RAID) au sud-est,
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
## DIG, DEFEND et RAID utilisent les icones du kit, flottant sur une ombre.
## SHOP conserve son etal. Chaque porte garde sa planche de label.

## Une porte vient d'etre pressee : "dig", "defend", "raid", "shop",
## "harvest" ou "upgrade". Le chrome sait ou elle mene (`Chrome.go`).
signal door_pressed(door: String)
## Les ilots a montrer ne sont plus ceux poses : le terrier doit rebatir
## (burrow.gd `_rebuild_islets`) — la mer, sa cote et le cadrage en dependent.
signal reveal_changed

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
	{"door": "dig", "tex": preload("res://assets/ui/icons/pickaxe.png"),
		"dir": Vector2(-0.15, 1.0), "size": Vector2i(3, 3), "scale": 1.0, "floating": true,
		"anchor": Vector2(0.5, 0.5), "at": Vector2.ZERO},
	{"door": "defend", "tex": preload("res://assets/ui/icons/shield.webp"),
		"dir": Vector2(1.0, 1.0), "size": Vector2i(4, 4), "scale": 1.0, "floating": true,
		"anchor": Vector2(0.5, 0.5), "at": Vector2.ZERO},
	{"door": "raid", "tex": preload("res://assets/ui/icons/swords.webp"),
		"dir": Vector2(1.0, 0.15), "size": Vector2i(3, 3), "scale": 1.0, "floating": true,
		"anchor": Vector2(0.5, 0.5), "at": Vector2.ZERO},
	{"door": "shop", "tex": preload("res://assets/buildings/landmarks/shop.png"),
		"dir": Vector2(1.0, -0.7), "size": Vector2i(3, 3), "scale": 0.72,
		"anchor": Vector2(0.5, 0.8), "at": Vector2.ZERO},
]

## LA PLANCHE a l'ecran : taille du verbe et de la ligne, en pixels d'ECRAN.
## Dessinee dans l'interface : sa taille ne depend pas du zoom du monde.
const VERB_PX := 13
## LA REVELATION (`_wanted`, `_rise`). Ce qu'un joueur a deja vu sortir de
## l'eau, par joueur ; le seuil de parties de DEFEND (le tuto en est une).
const REVEAL_PATH := "user://reveal.cfg"
const REVEAL_DIG_RUNS := 1
const REVEAL_DEFEND_RUNS := 2
const RISE_PX := 36.0
const RISE_SECONDS := 1.2
const RISE_STAGGER := 0.45
const RISE_SPLASHES := 6
## Le temps de retrouver l'ecran (le focus, le fondu d'arrivee) avant que la
## mer ne s'ouvre ; puis le ponton, en fondu une fois l'ilot pose.
const RISE_WAIT := 3.0
const BRIDGE_FADE := 0.5

## Les planches posees AU-DESSUS de leur batiment ; toutes les autres dessous.
const SIGNS_ABOVE := ["upgrade", "shop"]
const LINE_PX := 9
## L'air garde entre une planche et le bord de l'ecran.
const SCREEN_EDGE := 6.0
## Au-dessus du monde, sous le chrome et ses dialogues.
const SIGN_LAYER := 19 # Interface, below Chrome (20) and its dialogs.
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
## UN NOEUD PAR ILOT (sol, batiment, ombre, ponton) : c'est lui qui sort de
## l'eau quand l'ilot se revele (`_rise`).
var _roots := {}
## Les pontons de chaque ilot, a part : ils arrivent APRES lui (`_rise`).
var _decks := {}
## Les portes posees au dernier `build` ; `_wanted` dit celles a montrer.
var _built: Array[String] = []
## TOUTES les cases d'ilots, montres ou non : un ponton s'y arrete toujours,
## pour ne pas changer de trace le jour ou le voisin sort de l'eau.
var _all_cells := {}
var _own := true
## LE BANC (scenes/bench/reveal_bench.tscn) force l'etape et garde sa memoire
## en RAM : il ne touche ni a Home ni a `user://reveal.cfg`.
static var bench_doors: Array[String] = []
static var bench_seen: Array[String] = []
static var bench := false
## Combien d'ilots montent en ce moment : chacun part un peu apres l'autre.
var _rising := 0
## Les ilots encore sous l'eau : leur planche reste cachee.
var _under := {}
var _buildings := {}
var _signs := {}
var _sign_layer: CanvasLayer
## Ou chaque planche se pose, dans le repere du terrier.
var _anchors := {}
var _live := false
var _tick := 0.0
var _float_time := 0.0
## La maison, pour caler UPGRADE sur son toit (`follow`, `_roof`).
var _home: Sprite2D
var _roof_tex: Texture2D
var _roof_y := 0.0
var _float_origins := {}
var _float_shadows := {}


func _ready() -> void:
	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())
	ShopState.shared().changed.connect(refresh)


## POSE LES ILOTS AUTOUR DE `main`, et la carte de la mer qui les englobe.
## Rappele a chaque sol (`show_ground`) : une autre graine, d'autres cotes.
## `own` : notre terrier. Celui d'un autre montre ses quatre ilots, sans
## rien reveler ni rien retenir.
func build(main: BurrowMap, own: bool = true) -> void:
	clear()
	_main = main
	_own = own
	var taken := {}
	var tops := {}
	# LES PLACES SONT CELLES DES QUATRE, montres ou non : un ilot qui sort de
	# l'eau ne pousse pas ses voisins.
	_built = _wanted()
	for spec in ISLETS:
		var top := _settle(spec["size"], spec["dir"], taken)
		tops[spec["door"]] = top
		for c in _shape(spec["size"]):
			var cell: Vector2i = top + c
			_all_cells[cell] = spec["door"]
			if _built.has(spec["door"]):
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

	# UN TERRAIN PAR ILOT, dans son noeud. Ses blocs se trient sur leurs cases
	# LOCALES ; decaler le terrain de la profondeur du coin remet chaque bloc
	# a `Iso.depth` de sa case dans le treillis du terrier.
	for spec in ISLETS:
		var door: String = spec["door"]
		if not _built.has(door):
			continue
		var root := Node2D.new()
		root.name = "Islet_" + door
		add_child(root)
		_roots[door] = root
		var shape := BurrowMap.new(dims.x, dims.y, origin)
		var sods: Array[Vector2i] = []
		for cell in _islet_cells:
			if _islet_cells[cell] == door:
				shape.level[(cell.y - lo.y) * dims.x + (cell.x - lo.x)] = 1
				sods.append(cell - lo)
		shape.measure_tiers()
		var ground := BurrowTerrain.new()
		ground.name = "Ground"
		ground.map = shape
		ground.z_index = Iso.depth(lo.x, lo.y)
		root.add_child(ground)
		ground.lay_sods(sods)

	for spec in ISLETS:
		if _built.has(spec["door"]):
			_place_building(spec, tops[spec["door"]], islets, lo)
	for spec in ISLETS:
		if _built.has(spec["door"]):
			_lay_bridge(spec["door"])
	for door in ["harvest", "upgrade"]:
		_signs[door] = _make_sign(door)
	# CE QU'ON N'AVAIT JAMAIS VU SORT DE L'EAU, une fois par joueur.
	if _own:
		var seen := _seen()
		for door in _built:
			if not seen.has(door):
				_rise(door)
				seen.append(door)
		_remember(seen)
	refresh()


# ── Les ilots qui se revelent ─────────────────────────────────────────────

## L'ILE SE DEVOILE AVEC LE JEU :
##   • DIG et SHOP a la fin du tuto (sa partie compte : runs >= 1) ;
##   • DEFEND apres la premiere vraie partie (le tuto en compte deja une) ;
##   • RAID quand le bouclier de depart est tombe.
## Un ilot vu reste : relever un bouclier ne recache pas RAID.
func _wanted() -> Array[String]:
	var doors: Array[String] = []
	if bench:
		return _ordered(bench_doors.duplicate())
	if not _own:
		return _ordered(["dig", "shop", "defend", "raid"] as Array[String])
	# RIEN AVANT LA FIN DU TUTO : DIG sort de l'eau au retour de la lecon, pas
	# avant — vu pendant, il serait deja la. Sans Home, ce qu'on a deja vu.
	var seen := _seen()
	var runs := int(Home.burrow.get("runs", 0)) if Home.loaded() else 0
	for door in ["dig", "shop"]:
		if seen.has(door) or runs >= REVEAL_DIG_RUNS:
			doors.append(door)
	if seen.has("defend") or (Home.loaded() and int(Home.burrow.get("runs", 0)) >= REVEAL_DEFEND_RUNS):
		doors.append("defend")
	var shield: Variant = Home.burrow.get("shieldMs", null) if Home.loaded() else 1
	if seen.has("raid") or (doors.has("defend") and (shield == null or float(shield) <= 0.0)):
		doors.append("raid")
	return _ordered(doors)


## Dans l'ordre d'ISLETS, pour comparer a `_built`.
func _ordered(doors: Array[String]) -> Array[String]:
	var ordered: Array[String] = []
	for spec in ISLETS:
		if doors.has(spec["door"]):
			ordered.append(spec["door"])
	return ordered


## Les ilots deja sortis de l'eau pour ce joueur, sur cet appareil.
func _seen() -> Array[String]:
	if bench:
		return bench_seen.duplicate()
	var out: Array[String] = []
	var cfg := ConfigFile.new()
	if cfg.load(REVEAL_PATH) == OK:
		for door in cfg.get_value("seen", _player_key(), []):
			out.append(String(door))
	return out


func _remember(seen: Array[String]) -> void:
	if bench:
		bench_seen = seen.duplicate()
		return
	var cfg := ConfigFile.new()
	cfg.load(REVEAL_PATH)
	cfg.set_value("seen", _player_key(), seen)
	cfg.save(REVEAL_PATH)


func _player_key() -> String:
	return str(Session.player.get("id", "anon"))


## L'ILOT SORT DE L'EAU : il monte de sous la mer en s'eclaircissant, la mer
## gicle sur son pourtour, et sa planche n'arrive qu'une fois pose.
func _rise(door: String) -> void:
	var root: Node2D = _roots.get(door)
	if root == null:
		return
	var delay := RISE_WAIT + RISE_STAGGER * float(_rising)
	_rising += 1
	var deck: Node2D = _decks.get(door)
	if deck != null:
		deck.modulate = Color(1, 1, 1, 0)
		var d := deck.create_tween()
		d.tween_interval(delay + RISE_SECONDS)
		d.tween_property(deck, "modulate:a", 1.0, BRIDGE_FADE)
	root.position = Vector2(0, RISE_PX)
	root.modulate = Color(1, 1, 1, 0)
	var t := root.create_tween()
	t.tween_interval(delay)
	t.tween_callback(func() -> void:
		_splash(door)
		Sound.play("chime"))
	t.set_parallel(true)
	t.tween_property(root, "modulate:a", 1.0, RISE_SECONDS * 0.4)
	t.tween_property(root, "position:y", 0.0, RISE_SECONDS) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.set_parallel(false)
	t.tween_callback(func() -> void: _rising = maxi(0, _rising - 1))
	# LA PLANCHE ATTEND L'ILOT : cachee (et non transparente — `say` remet
	# son modulate), elle revient quand il est pose.
	_under[door] = true
	var sign: Control = _signs.get(door)
	if sign != null:
		sign.visible = false
	var s := root.create_tween()
	s.tween_interval(delay + RISE_SECONDS * 0.8)
	s.tween_callback(func() -> void:
		_under.erase(door)
		var back: Control = _signs.get(door)
		if back != null:
			back.visible = _live and _anchors.has(door))


## Des gerbes sur le pourtour de l'ilot, decalees : la mer s'ouvre autour.
func _splash(door: String) -> void:
	var cells: Array[Vector2i] = []
	for cell in _islet_cells:
		if _islet_cells[cell] == door:
			cells.append(cell)
	cells.shuffle()
	var t := create_tween()
	for i in range(mini(RISE_SPLASHES, cells.size())):
		var c: Vector2i = cells[i]
		var at := _main.origin + Vector2(float(c.x - c.y) * Iso.half_w(), float(c.x + c.y) * Iso.half_h() + Iso.half_h())
		t.tween_callback(func() -> void:
			if is_inside_tree():
				WaterSplash.play(self, at, Iso.depth(c.x, c.y) + 12, 600))
		t.tween_interval(0.07)


func clear() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_islet_cells.clear()
	_all_cells.clear()
	_roots.clear()
	_decks.clear()
	_under.clear()
	_rising = 0
	_buildings.clear()
	_float_origins.clear()
	_float_shadows.clear()
	_signs.clear()
	_sign_layer = null
	_anchors.clear()
	sea_map = null


## LA MAISON ET LE POTAGER ont bouge (ou le sol vient d'etre pose) : leurs
## planches suivent. `house` est la case de la maison (coin nord de ses 2x2),
## `field` les cases du potager.
## `home` le sprite de la maison : UPGRADE se cale sur son TOIT PEINT, relu a
## chaque image (`_process`) — la maison change d'art a chaque niveau, et son
## cadre de 112 px est surtout de l'air (toit a 25..48 px du pied).
func follow(house: Vector2i, field: Array[Vector2i], home: Sprite2D = null) -> void:
	if _main == null:
		return
	_home = home if house.x >= 0 else null
	if house.x >= 0:
		# Repli sans sprite : le milieu de l'emprise.
		var front := house + Vector2i(1, 1)
		_anchors["upgrade"] = _main.screen_of(front.x, front.y)
	else:
		_anchors.erase("upgrade")
	if not field.is_empty():
		# HARVEST AU MILIEU DU POTAGER : le centre de ses cases.
		var sum := Vector2.ZERO
		for c in field:
			sum += _main.screen_of(c.x, c.y) + Vector2(0, Iso.half_h())
		_anchors["harvest"] = sum / float(field.size())
	else:
		_anchors.erase("harvest")


## Le haut de l'art peint de la maison, dans le repere des planches. Mesure
## une fois par texture (l'alpha de son cadre).
func _roof() -> Vector2:
	var tex := _home.texture
	if tex != _roof_tex:
		_roof_tex = tex
		var img := tex.get_image() if tex != null else null
		_roof_y = float(img.get_used_rect().position.y) if img != null else 0.0
	# Le milieu du cadre en x (l'offset le recentre deja), le toit en y.
	var local := Vector2(0, _roof_y + _home.offset.y)
	return to_local(_home.to_global(local))


## LES PLANCHES SE MONTRENT-ELLES ? Chez soi, hors de tout mode, rien en main.
func set_live(on: bool) -> void:
	if _live == on:
		return
	_live = on
	for door in _signs:
		(_signs[door] as Control).visible = on and _anchors.has(door) and not _under.has(door)


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
	# UNE LIGNE, TAILLEE A LA MAIN : le panneau est un Button, pas un
	# conteneur, et personne ne donnerait de largeur a la note. Repliee, elle
	# se mesurait sur 1 px — une lettre par ligne, en colonne sur l'ilot.
	(note.get_child(0) as Label).autowrap_mode = TextServer.AUTOWRAP_OFF
	sign.add_child(note)
	note.size = note.get_combined_minimum_size()
	note.position = Vector2((sign.size.x - note.size.x) * 0.5, -note.size.y - 4.0)
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
	var root: Node2D = _roots[spec["door"]]
	root.add_child(sprite)
	_buildings[spec["door"]] = sprite
	if spec.get("floating", false):
		# Uniform 32-pixel icons, raised above their own island centre.
		sprite.scale = Vector2.ONE * (32.0 / maxf(tex.get_width(), tex.get_height()))
		var rest := ground + Vector2(0, -28)
		_float_origins[spec["door"]] = rest
		sprite.position = rest
		var shadow := IconShadow.new()
		shadow.position = ground
		shadow.z_index = sprite.z_index - 1
		root.add_child(shadow)
		_float_shadows[spec["door"]] = shadow
	# LA PLANCHE SOUS LE BATIMENT : sous l'ombre de l'icone flottante, ou
	# sous le pied peint du sprite (son alpha, pas son cadre). Celles de
	# SIGNS_ABOVE se posent sur le haut peint.
	var foot := ground.y + IconShadow.RADIUS.y + 2.0
	if not spec.get("floating", false):
		var img := tex.get_image()
		var painted := img.get_used_rect() if img != null else Rect2i(Vector2i.ZERO, Vector2i(tex.get_size()))
		if SIGNS_ABOVE.has(spec["door"]):
			foot = sprite.position.y + (sprite.offset.y + float(painted.position.y)) * sprite.scale.y
		else:
			foot = maxf(foot, sprite.position.y + (sprite.offset.y + float(painted.end.y)) * sprite.scale.y)
	_anchors[spec["door"]] = Vector2(ground.x, foot)
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
				if _all_cells.has(at):
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
		if not _decks.has(door):
			var deck := Node2D.new()
			deck.name = "Bridge_" + door
			add_child(deck)
			_decks[door] = deck
		(_decks[door] as Node2D).add_child(bridge)


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


## L'OMBRE D'UNE ICONE FLOTTANTE : une ellipse sombre posee sur l'ilot, sous
## l'icone qui danse au-dessus. `_process` la gonfle et la degonfle avec le
## balancement.
class IconShadow extends Node2D:
	const RADIUS := Vector2(12.0, 5.0)
	const COLOR := Color(0.0, 0.0, 0.0, 0.28)
	const SEGMENTS := 24

	func _draw() -> void:
		var points := PackedVector2Array()
		for i in range(SEGMENTS):
			var t := TAU * float(i) / float(SEGMENTS)
			points.append(Vector2(cos(t) * RADIUS.x, sin(t) * RADIUS.y))
		draw_colored_polygon(points, COLOR)


# ── Les planches ───────────────────────────────────────────────────────────

class Sign extends Button:
	var door := ""
	var verb: Label
	var line: Label
	var energy_icon: TextureRect
	var badge: Label
	var _body: PanelContainer
	var _ui_scale := -1.0

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
		var details := HBoxContainer.new()
		details.alignment = BoxContainer.ALIGNMENT_CENTER
		details.add_theme_constant_override("separation", 3)
		details.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(details)
		details.add_child(line)
		energy_icon = TextureRect.new()
		energy_icon.texture = preload("res://assets/ui/icons/bolt.webp")
		energy_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		energy_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		energy_icon.custom_minimum_size = Vector2(10, 10)
		energy_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		energy_icon.visible = false
		details.add_child(energy_icon)
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
		# L'eclair suit un prix : la phrase de DIG finit par son chiffre, RAID
		# n'ecrit que le sien (« LVL 10 » n'est pas un prix).
		energy_icon.visible = (door == "dig" and words.right(1).is_valid_int()) \
			or (door == "raid" and words.is_valid_int())
		tooltip_text = word + " — " + words
		modulate = Color.WHITE if lit else Color(0.82, 0.82, 0.82)
		_fit.call_deferred()

	func set_ui_scale(value: float) -> void:
		if is_equal_approx(value, _ui_scale):
			return
		_ui_scale = value
		energy_icon.custom_minimum_size = Vector2.ONE * roundf(10.0 * value)
		# Rasterize text at its final screen size instead of scaling glyphs.
		verb.add_theme_font_size_override("font_size", roundi(VERB_PX * value))
		line.add_theme_font_size_override("font_size", roundi(LINE_PX * value))
		badge.add_theme_font_size_override("font_size", roundi(VERB_PX * value))
		_body.add_theme_stylebox_override("panel", Kit.style_plank(2.0 * value, roundf(12.0 * value), roundf(3.0 * value)))
		_fit.call_deferred()


	func _fit() -> void:
		var want := _body.get_combined_minimum_size()
		_body.size = want
		size = want
		custom_minimum_size = want
		badge.position = Vector2(want.x - 10.0, -8.0)


func _make_sign(door: String) -> Sign:
	var sign := Sign.new(door)
	if not is_instance_valid(_sign_layer):
		_sign_layer = CanvasLayer.new()
		_sign_layer.name = "LandmarkInterface"
		_sign_layer.layer = SIGN_LAYER
		add_child(_sign_layer)
	sign.visible = _live and _anchors.has(door)
	sign.pressed.connect(func() -> void: door_pressed.emit(door))
	_sign_layer.add_child(sign)
	return sign


## Interface labels follow projected world anchors without inheriting world scale.
func _process(delta: float) -> void:
	_float_time += delta
	for door in _float_origins:
		var bob := sin(_float_time * 2.0) * 2.0
		(_buildings[door] as Sprite2D).position = (_float_origins[door] as Vector2) + Vector2(0, bob)
		var shadow: Node2D = _float_shadows[door]
		shadow.scale = Vector2.ONE * (1.0 + bob * 0.025)
	if is_instance_valid(_sign_layer):
		_sign_layer.visible = is_visible_in_tree()
	# A L'ECHELLE DU CHROME, pas du monde : 1 sur le Seeker (890x400), plus
	# grand sur un ecran de bureau, comme la barre du haut.
	var view := get_viewport_rect().size
	var ui := clampf(minf(view.x / BurrowCamera.GAME_W, view.y / BurrowCamera.GAME_H), 1.0, 1.6)
	var world_to_screen := get_global_transform_with_canvas()
	if is_instance_valid(_home) and _anchors.has("upgrade"):
		_anchors["upgrade"] = _roof()
	var shown: Array[Sign] = []
	for door in _signs:
		var sign: Sign = _signs[door]
		if not sign.visible or not _anchors.has(door):
			continue
		sign.set_ui_scale(ui)
		# Pendue au-dessus du toit (SIGNS_ABOVE), centree sur son ancre
		# (HARVEST, au milieu du potager), ou SOUS son ancre.
		var lift := -2.0 * ui
		if SIGNS_ABOVE.has(door):
			lift = sign.size.y + 2.0 * ui
		elif door == "harvest":
			lift = sign.size.y * 0.5
		sign.position = world_to_screen * (_anchors[door] as Vector2) - Vector2(sign.size.x * 0.5, lift)
		shown.append(sign)
	_part(shown, 1.0)
	# JAMAIS HORS DE L'ECRAN : la maison cadre serre, et le batiment du bord
	# peut deborder — sa planche, elle, reste a portee du pouce.
	for sign in shown:
		var at := sign.position
		at.x = clampf(at.x, SCREEN_EDGE, maxf(SCREEN_EDGE, view.x - SCREEN_EDGE - sign.size.x))
		at.y = clampf(at.y, SCREEN_EDGE, maxf(SCREEN_EDGE, view.y - SCREEN_EDGE - sign.size.y))
		sign.position = at.round()
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
				# UPGRADE TIENT SUR SON TOIT : l'autre s'ecarte seul, dans l'axe
				# qui l'eloigne de la maison.
				var pinned := -1
				if shown[i].door == "upgrade":
					pinned = i
				elif shown[j].door == "upgrade":
					pinned = j
				if pinned >= 0:
					var fixed := a if pinned == i else b
					var mover: Sign = shown[j] if pinned == i else shown[i]
					var box := b if pinned == i else a
					var dir := (box.get_center() - fixed.get_center()).normalized()
					if dir == Vector2.ZERO:
						dir = Vector2.DOWN
					for _step in range(80):
						if not box.intersects(fixed):
							break
						box.position += dir * 2.0
						mover.position += dir * 2.0
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
	if _main != null and _own and _wanted() != _built:
		reveal_changed.emit()
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
	# LE PRIX EN TOUTES LETTRES : « la traversee coute 5 » et l'eclair, un
	# chiffre seul ne disait pas ce qu'il comptait.
	say.call("dig", I18N.shout(I18N.t("loop.dig")),
		I18N.f("loop.runCosts", [crossing]),
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
			str(floor_e), energy >= floor_e)

	say.call("shop", I18N.shout(I18N.t("shop.title")), "", true)
	say.call("harvest", I18N.shout(I18N.t("burrow.harvest")),
		"+%s" % I18N.group_digits(garden) if garden > 0 else I18N.t("loop.gardenEmpty"), garden > 0)

	var cost: Variant = b.get("upgradeCost", null)
	if cost == null:
		say.call("upgrade", I18N.t("burrow.maxLevel"), "", false)
	else:
		say.call("upgrade", I18N.shout(I18N.t("burrow.upgrade")), I18N.group_digits(float(cost)),
			bool(b.get("canUpgrade", false)))

	# LE « ! » DE LA QUETE sur le batiment ou elle mene — jamais sur DIG, ou
	# il ne faisait que du bruit a cote du prix.
	var pointed := _quest_door()
	for door in _signs:
		(_signs[door] as Sign).badge.visible = door == pointed and door != "dig"


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
