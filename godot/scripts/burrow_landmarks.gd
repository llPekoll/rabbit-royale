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
##   • LE POTAGER (HARVEST) a aussi sa planche ; la maison n'en a plus (son
##     volet est en haut a droite, house_panel.gd).
##     La planche ouvre la porte ; le batiment lui-meme reste a l'amenagement
##     (un clic le prend), sinon on ne pourrait plus le deplacer.
##
## DIG, DEFEND et RAID utilisent les icones du kit, flottant sur une ombre.
## SHOP conserve son etal. Chaque porte garde sa planche de label.

## Une porte vient d'etre pressee : "dig", "defend", "raid", "shop" ou
## "harvest". Le chrome sait ou elle mene (`Chrome.go`).
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
		# La pioche est un dessin de 23x25 : a ICON_PX elle grossissait 1,8
		# fois, en gros pixels et liseré epais, et pesait deux fois le
		# bouclier et les epees (60 px, reduits). Plus petite, elle s'aligne.
		"icon_px": 30.0,
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
## La pastille du « ! » (la hauteur du « NEW » de la barre) et son jaune vif.
const BADGE_PX := 20.0
const BADGE_YELLOW := Color("#ffe23a")
## LA REVELATION (`_wanted`, `_rise`). Ce qu'un joueur a deja vu sortir de
## l'eau, par joueur ; DIG apres le tuto, DEFEND au niveau 2, RAID a RAID_MIN.
const REVEAL_PATH := "user://reveal.cfg"
const REVEAL_DIG_RUNS := 1
const REVEAL_DEFEND_LEVEL := 2
const RISE_PX := 36.0
const RISE_SECONDS := 1.2
## L'ecart entre deux ilots qui sortent ensemble (DIG puis SHOP) : assez pour
## qu'on voie deux montees et pas une seule.
const RISE_STAGGER := 0.9
const RISE_SPLASHES := 6
## Le temps de retrouver l'ecran (le focus, le fondu d'arrivee) avant que la
## mer ne s'ouvre ; puis le ponton, en fondu une fois l'ilot pose.
const RISE_WAIT := 1.5
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
## LES ICONES DES PORTES PASSENT AU-DESSUS DES OMBRES DE NUAGES (2026-10-02) :
## triees sur leur case, elles tombaient sous le voile de SkyLight (3000) et
## s'assombrissaient au passage d'un nuage. « l'ombre du sol shader il faut
## jamais la faire apparaitre sur les icones ». Sous les oiseaux et les rais.
## Sans risque pour le tri : aucun lapin ne marche sur un ilot. Leur ombre
## ronde (IconShadow) reste au sol, donc sous le nuage.
const Z_ABOVE_CLOUDS := SkyLight.Z_SHADOWS + 1
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
## LE CADRAGE DE LA MAISON : `sea_map` plus les ilots encore sous l'eau, pour
## que leur ombre reste dans le cadre sans que la mer les borde d'ecume.
var frame_map: BurrowMap
## LES ILOTS A VENIR, UNE OMBRE SOUS L'EAU (2026-10-01) : DEFEND et RAID
## sortent a un niveau donne, et rien ne disait qu'il y aurait une action de
## plus. Tant qu'un ilot n'est pas sorti, sa silhouette se devine sous la mer,
## a sa place, et respire doucement. Seulement une fois le tuto fini (DIG
## sorti) : avant, la mer reste vide.
const SHALLOW_INK := Color(0.02, 0.10, 0.20, 1.0)
## Plus fort que le trait net d'avant : le flou en dilue le coeur.
const SHALLOW_ALPHA := Vector2(0.45, 0.7)
## LE « ? » BLANC qui flotte au-dessus de chaque ombre : quelque chose est
## la, pas encore pour vous.
const MYSTERY_PX := 30
const MYSTERY_LIFT := 46.0
const MYSTERY_BOB := 5.0
const MYSTERY_SECONDS := 1.1
const SHALLOW_SECONDS := 2.4
var _shallow_cells := {}
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
## LES CIBLES DE RAID, lues UNE fois par terrier ouvert (`_ask_targets`) :
## la ligne « et maintenant » nomme le jardin le plus riche, et RaidState ne
## les relit sinon qu'a la connexion et a l'ouverture de la liste.
var _targets_asked := false
## LE BANC (scenes/bench/reveal_bench.tscn) force l'etape et garde sa memoire
## en RAM : il ne touche ni a Home ni a `user://reveal.cfg`.
static var bench_doors: Array[String] = []
static var bench_seen: Array[String] = []
static var bench_tapped: Array[String] = []
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

## LES ICONES FLOTTANTES (DIG, DEFEND, RAID), plus grosses depuis le
## 2026-10-01, avec un liseré blanc et un reflet qui les traverse de temps en
## temps — UNE A LA FOIS, jamais deux fois de suite la meme (icon_glint).
const ICON_PX := 44.0
const ICON_LIFT := 34.0
## Le liseré, en pixels du monde ; le shader le veut en texels de l'icone.
const OUTLINE_WORLD := 1.5
const GLINT := preload("res://shaders/icon_glint.gdshader")
const GLINT_SECONDS := 0.7
## L'attente entre deux reflets, toujours plus longue qu'un reflet : deux
## icones ne brillent jamais ensemble.
const GLINT_EVERY := Vector2(2.2, 4.2)
var _glint_wait := 1.5
var _glint_last := ""
var _float_shadows := {}


func _ready() -> void:
	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_c: String) -> void: refresh())
	ShopState.shared().changed.connect(refresh)
	# Les cibles de raid nourrissent la ligne « et maintenant » (`_quest_door`).
	RaidState.current.targets_changed.connect(refresh)


## POSE LES ILOTS AUTOUR DE `main`, et la carte de la mer qui les englobe.
## Rappele a chaque sol (`show_ground`) : une autre graine, d'autres cotes.
## `own` : notre terrier. Celui d'un autre n'a aucun ilot, et ne revele ni
## ne retient rien.
func build(main: BurrowMap, own: bool = true) -> void:
	clear()
	_main = main
	_own = own
	var taken := {}
	var tops := {}
	# LES PLACES SONT CELLES DES QUATRE, montres ou non : un ilot qui sort de
	# l'eau ne pousse pas ses voisins.
	_built = _wanted()
	var shallow := own and _built.has("dig")
	for spec in ISLETS:
		var top := _settle(spec["size"], spec["dir"], taken)
		tops[spec["door"]] = top
		for c in _shape(spec["size"]):
			var cell: Vector2i = top + c
			_all_cells[cell] = spec["door"]
			if _built.has(spec["door"]):
				_islet_cells[cell] = spec["door"]
			elif shallow:
				_shallow_cells[cell] = spec["door"]
			taken[cell] = true

	# LE CADRE COMMUN : toutes les cases, le terrier compris, et SEA_PAD de mer.
	var lo := Vector2i(0, 0)
	var hi := Vector2i(main.width - 1, main.height - 1)
	for cell in _islet_cells.keys() + _shallow_cells.keys():
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
	frame_map = sea_map
	if not _shallow_cells.is_empty():
		frame_map = BurrowMap.new(dims.x, dims.y, origin)
		frame_map.level = sea_map.level.duplicate()
		for cell in _shallow_cells:
			frame_map.level[(cell.y - lo.y) * dims.x + (cell.x - lo.x)] = 1
		frame_map.measure_tiers()
		_lay_shallows(sea_map)

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
	# PLUS DE PLANCHE AMELIORER sur la maison (2026-10-01) : le volet du
	# terrier, en haut a droite (house_panel.gd), la remplace.
	for door in ["harvest"]:
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
##   • DIG et SHOP a la fin du tuto (sa partie compte : runs >= 1), niveau 1 ;
##   • DEFEND au niveau 2 ;
##   • RAID au niveau RAID_MIN (3) : la ou les raids ouvrent.
## Un ilot vu reste.
func _wanted() -> Array[String]:
	var doors: Array[String] = []
	if bench:
		return _ordered(bench_doors.duplicate())
	# CHEZ L'AUTRE, AUCUN ILOT : le raider n'a rien a faire de DIG, DEFEND,
	# RAID ni de la boutique (le user, 2026-10-01). Son terrier seul, dans sa
	# mer.
	if not _own:
		return doors
	# RIEN AVANT LA FIN DU TUTO : DIG sort de l'eau au retour de la lecon, pas
	# avant — vu pendant, il serait deja la. Sans Home, ce qu'on a deja vu.
	var seen := _seen()
	var runs := int(Home.burrow.get("runs", 0)) if Home.loaded() else 0
	for door in ["dig", "shop"]:
		if seen.has(door) or runs >= REVEAL_DIG_RUNS:
			doors.append(door)
	var level := int(Home.player.get("level", 1)) if Home.loaded() else 0
	if seen.has("defend") or (doors.has("dig") and level >= REVEAL_DEFEND_LEVEL):
		doors.append("defend")
	if seen.has("raid") or (doors.has("defend") and level >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)):
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


## LE « ! » NE SE MONTRE QU'UNE FOIS par batiment : la premiere planche
## pressee l'eteint pour de bon (par joueur, sur cet appareil).
func _tapped() -> Array[String]:
	if bench:
		return bench_tapped.duplicate()
	var out: Array[String] = []
	var cfg := ConfigFile.new()
	if cfg.load(REVEAL_PATH) == OK:
		for door in cfg.get_value("tapped", _player_key(), []):
			out.append(String(door))
	return out


func _note_tapped(door: String) -> void:
	var tapped := _tapped()
	if tapped.has(door):
		return
	tapped.append(door)
	if bench:
		bench_tapped = tapped
	else:
		var cfg := ConfigFile.new()
		cfg.load(REVEAL_PATH)
		cfg.set_value("tapped", _player_key(), tapped)
		cfg.save(REVEAL_PATH)
	refresh()


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
		# Le meme remous que l'ile qui coule, la mer s'ouvre dans l'autre sens.
		Sound.play("island_sink")
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


## Les ombres des ilots a venir : un losange sombre par case, a plat, un peu
## sous la surface, sous tout le reste.
func _lay_shallows(map: BurrowMap) -> void:
	var node := Shallows.new()
	node.name = "Shallows"
	node.z_as_relative = false
	node.z_index = -4000
	for cell in _shallow_cells:
		# Le centre du losange, un peu sous la surface.
		node.centres.append(Iso.project(cell.x - _lo.x, cell.y - _lo.y, map.origin)
			+ Vector2(0, Iso.half_h() * 1.5))
	node.bake()
	add_child(node)
	# UN « ? » PAR ILOT A VENIR, au-dessus du milieu de son ombre.
	var by_door := {}
	for cell in _shallow_cells:
		var door: String = _shallow_cells[cell]
		if not by_door.has(door):
			by_door[door] = []
		by_door[door].append(Iso.project(cell.x - _lo.x, cell.y - _lo.y, map.origin) + Vector2(0, Iso.half_h()))
	for door in by_door:
		var sum := Vector2.ZERO
		for c in by_door[door]:
			sum += c
		_float_mystery(sum / float(by_door[door].size()) - Vector2(0, MYSTERY_LIFT))
	node.modulate.a = SHALLOW_ALPHA.x
	var t := node.create_tween().set_loops()
	t.tween_property(node, "modulate:a", SHALLOW_ALPHA.y, SHALLOW_SECONDS).set_trans(Tween.TRANS_SINE)
	t.tween_property(node, "modulate:a", SHALLOW_ALPHA.x, SHALLOW_SECONDS).set_trans(Tween.TRANS_SINE)


## FLOUES, comme une forme vue a travers l'eau (2026-10-01) : les losanges
## sont peints dans une petite image au quart, adoucie de quelques passes de
## flou en boite, puis etiree en filtrage lineaire — un contour net se lisait
## comme une dalle posee sur la mer.
func _float_mystery(at: Vector2) -> void:
	var mark := Kit.label("?", MYSTERY_PX, Color.WHITE)
	mark.add_theme_color_override("font_outline_color", Palette.INK)
	mark.add_theme_constant_override("outline_size", 6)
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	mark.z_as_relative = false
	mark.z_index = 3000
	add_child(mark)
	mark.reset_size()
	var rest := (at - mark.size * 0.5).round()
	mark.position = rest
	var t := mark.create_tween().set_loops()
	t.tween_property(mark, "position:y", rest.y - MYSTERY_BOB, MYSTERY_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(mark, "position:y", rest.y, MYSTERY_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


class Shallows extends Node2D:
	## Le quart de la resolution du monde ; le flou en pixels de cette image.
	const SCALE := 0.25
	const BLUR_R := 2
	const PASSES := 1
	var centres: Array[Vector2] = []
	var _tex: ImageTexture
	var _rect := Rect2()

	func bake() -> void:
		if centres.is_empty():
			return
		var hw := Iso.half_w()
		var hh := Iso.half_h()
		var box := Rect2(centres[0], Vector2.ZERO)
		for c in centres:
			box = box.expand(c - Vector2(hw, hh)).expand(c + Vector2(hw, hh))
		var margin := float(BLUR_R * PASSES + 2) / SCALE
		box = box.grow(margin)
		var w := maxi(1, int(ceilf(box.size.x * SCALE)))
		var h := maxi(1, int(ceilf(box.size.y * SCALE)))
		var a := PackedFloat32Array()
		a.resize(w * h)
		for y in h:
			for x in w:
				var world := box.position + (Vector2(x, y) + Vector2(0.5, 0.5)) / SCALE
				for c in centres:
					if absf(world.x - c.x) / hw + absf(world.y - c.y) / hh <= 1.0:
						a[y * w + x] = 1.0
						break
		for i in PASSES:
			a = _blur(a, w, h, Vector2i(1, 0))
			a = _blur(a, w, h, Vector2i(0, 1))
		var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
		for y in h:
			for x in w:
				img.set_pixel(x, y, Color(SHALLOW_INK, a[y * w + x]))
		_tex = ImageTexture.create_from_image(img)
		_rect = box
		texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		queue_redraw()

	static func _blur(src: PackedFloat32Array, w: int, h: int, step: Vector2i) -> PackedFloat32Array:
		var out := PackedFloat32Array()
		out.resize(w * h)
		var n := float(2 * BLUR_R + 1)
		for y in h:
			for x in w:
				var sum := 0.0
				for k in range(-BLUR_R, BLUR_R + 1):
					var xx := clampi(x + step.x * k, 0, w - 1)
					var yy := clampi(y + step.y * k, 0, h - 1)
					sum += src[yy * w + xx]
				out[y * w + x] = sum / n
		return out

	func _draw() -> void:
		if _tex != null:
			draw_texture_rect(_tex, _rect, false)


func clear() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_islet_cells.clear()
	_shallow_cells.clear()
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
	# LA PLANCHE HARVEST NEUVE nait opaque : sans ce -1, `_follow_harvest_sign`
	# la croyait deja effacee et la laissait dire « garden empty ».
	_harvest_on = -1
	_anchors.clear()
	sea_map = null
	frame_map = null


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


## LA RECOLTE, « +N » qui sort de DERRIERE la planche HARVEST (2026-10-01,
## a la place de la legende sous la pastille) : la meme legende sombre, qui
## monte au-dessus et ralentit longuement, tient HARVEST_HOLD, puis repart
## vers le haut en s'effacant. Elle vit dans la couche des planches, juste
## avant la sienne (donc dessous), et la suit a chaque image : la planche,
## elle, s'efface une fois la legende sortie — il n'y a plus rien a recolter.
const HARVEST_RISE := 0.9
const HARVEST_HOLD := 2.0
const HARVEST_LEAVE := 0.6
const HARVEST_DRIFT := 18.0
## La planche HARVEST qui s'en va ou revient (le potager vide, puis repousse).
const HARVEST_SIGN_FADE := 0.6
const HARVEST_SIGN_SHRINK := 0.85

var _harvest_note: Control = null
var _harvest_note_y := 0.0
## -1 : pas encore pose (la premiere fois, sans fondu).
var _harvest_on := -1
var _harvest_want := true
## La planche attend que la legende soit sortie de derriere elle.
var _harvest_hold_until := 0

func show_harvest(amount: int) -> void:
	var sign: Sign = _signs.get("harvest")
	if sign == null or not sign.visible or amount <= 0 or not is_instance_valid(_sign_layer):
		return
	if is_instance_valid(_harvest_note):
		_harvest_note.queue_free()
	var k := maxf(1.0, sign._ui_scale)
	var note := Kit.caption(I18N.f("notes.harvested", [amount]))
	var words: Label = note.get_child(0)
	words.autowrap_mode = TextServer.AUTOWRAP_OFF
	words.add_theme_font_size_override("font_size", roundi(13.0 * k))
	_sign_layer.add_child(note)
	_sign_layer.move_child(note, sign.get_index())
	note.size = note.get_combined_minimum_size()
	_harvest_note = note
	var shown_y := -note.size.y - 4.0 * k
	_harvest_note_y = (sign.size.y - note.size.y) * 0.5
	_harvest_hold_until = Time.get_ticks_msec() + int(HARVEST_RISE * 1000.0)
	note.modulate.a = 0.0
	_place_harvest_note()
	var tw := note.create_tween()
	tw.set_parallel(true)
	tw.tween_property(self, "_harvest_note_y", shown_y, HARVEST_RISE) \
		.set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	tw.tween_property(note, "modulate:a", 1.0, HARVEST_RISE * 0.25)
	tw.set_parallel(false)
	tw.tween_interval(HARVEST_HOLD)
	tw.set_parallel(true)
	tw.tween_property(self, "_harvest_note_y", shown_y - HARVEST_DRIFT * k, HARVEST_LEAVE) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(note, "modulate:a", 0.0, HARVEST_LEAVE) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.set_parallel(false)
	tw.tween_callback(note.queue_free)


## La planche HARVEST dit ce que le potager tient, et s'il doit se montrer.
func _say_harvest(garden: int) -> void:
	_harvest_want = garden > 0
	var sign: Sign = _signs.get("harvest")
	if sign != null:
		sign.say(I18N.shout(I18N.t("burrow.harvest")),
			"+%s" % I18N.group_digits(garden) if garden > 0 else I18N.t("loop.gardenEmpty"), garden > 0)


## La legende suit sa planche, centree, a `_harvest_note_y` de son haut.
func _place_harvest_note() -> void:
	var sign: Sign = _signs.get("harvest")
	if not is_instance_valid(_harvest_note) or sign == null:
		return
	_harvest_note.position = (sign.position + Vector2(
		(sign.size.x - _harvest_note.size.x) * 0.5, _harvest_note_y)).round()


## PAS DE PLANCHE SANS RIEN A RECOLTER : elle s'efface doucement (et ne
## se tape plus), puis revient de meme quand le potager a repousse.
func _follow_harvest_sign() -> void:
	var sign: Sign = _signs.get("harvest")
	if sign == null:
		return
	# LA PREMIERE CAROTTE la fait revenir sur l'image, sans attendre le
	# releve de TICK_SECONDS, avec son « +1 » deja ecrit.
	if Home.loaded() and (Home.live_garden() > 0) != _harvest_want:
		_say_harvest(Home.live_garden())
	var want := 1 if _harvest_want else 0
	if want == _harvest_on or Time.get_ticks_msec() < _harvest_hold_until:
		return
	var first := _harvest_on < 0
	_harvest_on = want
	sign.mouse_filter = Control.MOUSE_FILTER_STOP if want == 1 else Control.MOUSE_FILTER_IGNORE
	sign.pivot_offset = sign.size * 0.5
	if first:
		sign.modulate.a = float(want)
		return
	var tw := sign.create_tween().set_parallel(true)
	if want == 1:
		sign.scale = Vector2.ONE * HARVEST_SIGN_SHRINK
		tw.tween_property(sign, "scale", Vector2.ONE, HARVEST_SIGN_FADE) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(sign, "modulate:a", 1.0, HARVEST_SIGN_FADE * 0.6)
	else:
		tw.tween_property(sign, "scale", Vector2.ONE * HARVEST_SIGN_SHRINK, HARVEST_SIGN_FADE) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw.tween_property(sign, "modulate:a", 0.0, HARVEST_SIGN_FADE) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


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
		# Des icones de ICON_PX, levees au-dessus du milieu de leur ilot.
		var k := float(spec.get("icon_px", ICON_PX)) / maxf(tex.get_width(), tex.get_height())
		sprite.scale = Vector2.ONE * k
		var glint := ShaderMaterial.new()
		glint.shader = GLINT
		# Jamais sous un texel : plus fin, l'echantillon retombe sur le meme
		# pixel et le liseré ne se dessinait qu'au bord du quad (la pioche).
		glint.set_shader_parameter("outline_px", maxf(1.0, roundf(OUTLINE_WORLD / k)))
		sprite.material = glint
		var rest := ground + Vector2(0, -ICON_LIFT)
		_float_origins[spec["door"]] = rest
		sprite.position = rest
		var shadow := IconShadow.new()
		shadow.position = ground
		shadow.z_index = sprite.z_index - 1
		root.add_child(shadow)
		_float_shadows[spec["door"]] = shadow
	sprite.z_as_relative = false
	sprite.z_index = Z_ABOVE_CLOUDS
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
	## LE « ! » DE LA PORTE A PRENDRE, sur la pastille a feuilles du « NEW »
	## de la barre (Kit.badge) et en jaune vif — c'etait un rond plat dessine
	## a la main, a l'encre, d'un autre style que tout le chrome (2026-10-01).
	var badge: NineSlice
	var _badge_mark: Label
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
		badge = Kit.badge(BADGE_PX)
		badge.size = Vector2(BADGE_PX, BADGE_PX)
		_badge_mark = Kit.label("!", VERB_PX, BADGE_YELLOW, true)
		_badge_mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_badge_mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		Kit.fill(_badge_mark)
		badge.add_child(_badge_mark)
		badge.visible = false
		add_child(badge)
		button_down.connect(func() -> void: _body.position.y = 2.0)
		button_up.connect(func() -> void: _body.position.y = 0.0)

	func say(word: String, words: String, lit: bool) -> void:
		verb.text = word
		line.text = words
		line.visible = not words.is_empty()
		# L'eclair suit un prix : DIG et RAID finissent leur phrase par leur
		# chiffre (« crossing costs 58 ») ; « LVL 3 » sous un RAID ferme n'en
		# est pas un, et son dernier caractere est un chiffre aussi.
		energy_icon.visible = (door == "dig" or door == "raid") \
			and words.right(1).is_valid_int() and not words.begins_with(I18N.f("rabbitLevel.badge", [""]).strip_edges())
		# La teinte seulement : l'opacite est a la planche HARVEST, qui
		# s'efface quand le potager est vide (`_follow_harvest_sign`).
		var tint := Color.WHITE if lit else Color(0.82, 0.82, 0.82)
		modulate = Color(tint, modulate.a)
		_fit.call_deferred()

	func set_ui_scale(value: float) -> void:
		if is_equal_approx(value, _ui_scale):
			return
		_ui_scale = value
		energy_icon.custom_minimum_size = Vector2.ONE * roundf(10.0 * value)
		# Rasterize text at its final screen size instead of scaling glyphs.
		verb.add_theme_font_size_override("font_size", roundi(VERB_PX * value))
		line.add_theme_font_size_override("font_size", roundi(LINE_PX * value))
		_badge_mark.add_theme_font_size_override("font_size", roundi(VERB_PX * value))
		var side := roundf(BADGE_PX * value)
		var k := side / float(Kit.BADGE.get_height())
		badge.edge = Vector4(Kit.BADGE_SLICE) * k
		badge.size = Vector2(side, side)
		_body.add_theme_stylebox_override("panel", Kit.style_plank(2.0 * value, roundf(12.0 * value), roundf(3.0 * value)))
		_fit.call_deferred()


	func _fit() -> void:
		var want := _body.get_combined_minimum_size()
		_body.size = want
		size = want
		custom_minimum_size = want
		badge.position = Vector2(want.x - badge.size.x * 0.6, -badge.size.y * 0.45)


## LES PLANCHES A L'ECRAN, en pixels d'ecran (leur CanvasLayer n'a ni
## decalage ni echelle) : ce qui se pose par-dessus le terrier les evite —
## la legende d'amenagement (burrow.gd `_pick_tip`).
func sign_rects() -> Array[Rect2]:
	var out: Array[Rect2] = []
	for door in _signs:
		var sign: Sign = _signs[door]
		if sign.visible and _anchors.has(door):
			out.append(sign.get_rect())
	return out


func _make_sign(door: String) -> Sign:
	var sign := Sign.new(door)
	if not is_instance_valid(_sign_layer):
		_sign_layer = CanvasLayer.new()
		_sign_layer.name = "LandmarkInterface"
		_sign_layer.layer = SIGN_LAYER
		add_child(_sign_layer)
	sign.visible = _live and _anchors.has(door)
	sign.pressed.connect(func() -> void:
		_note_tapped(door)
		door_pressed.emit(door))
	_sign_layer.add_child(sign)
	return sign


## LE REFLET SUIVANT : une icone tiree au sort parmi les autres que la
## derniere, qui brille seule le temps de GLINT_SECONDS.
func _tick_glint(delta: float) -> void:
	if _float_origins.is_empty():
		return
	_glint_wait -= delta
	if _glint_wait > 0.0:
		return
	_glint_wait = randf_range(GLINT_EVERY.x, GLINT_EVERY.y)
	var doors: Array = _float_origins.keys()
	if doors.size() > 1:
		doors.erase(_glint_last)
	var door: String = doors.pick_random()
	_glint_last = door
	var sprite: Sprite2D = _buildings.get(door)
	if sprite == null or not (sprite.material is ShaderMaterial):
		return
	var glint := sprite.material as ShaderMaterial
	var tw := sprite.create_tween()
	tw.tween_method(func(at: float) -> void: glint.set_shader_parameter("shine", at),
		-0.3, 1.3, GLINT_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Interface labels follow projected world anchors without inheriting world scale.
func _process(delta: float) -> void:
	_float_time += delta
	_tick_glint(delta)
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
		# Une planche effacee n'ecarte plus ses voisines.
		if sign.modulate.a < 0.02:
			continue
		shown.append(sign)
	_part(shown, 1.0)
	# JAMAIS HORS DE L'ECRAN : la maison cadre serre, et le batiment du bord
	# peut deborder — sa planche, elle, reste a portee du pouce.
	for sign in shown:
		var at := sign.position
		at.x = clampf(at.x, SCREEN_EDGE, maxf(SCREEN_EDGE, view.x - SCREEN_EDGE - sign.size.x))
		at.y = clampf(at.y, SCREEN_EDGE, maxf(SCREEN_EDGE, view.y - SCREEN_EDGE - sign.size.y))
		sign.position = at.round()
	_follow_harvest_sign()
	_place_harvest_note()
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
	var raid_min := Tuning.i("RABBIT_LEVELS.RAID_MIN", 3)
	var solo := PlaySettings.solo_on()
	_ask_targets(level >= raid_min and not solo)

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
	elif solo:
		say.call("raid", I18N.shout(I18N.t("loop.raid")), I18N.t("sound.solo"), false)
	else:
		var floor_e := Tuning.raid_floor()
		# Meme phrase que DIG : « crossing costs 58 », pas un 58 seul.
		say.call("raid", I18N.shout(I18N.t("loop.raid")),
			I18N.f("loop.runCosts", [floor_e]), energy >= floor_e)

	say.call("shop", I18N.shout(I18N.t("shop.title")), "", true)
	_say_harvest(garden)

	var cost: Variant = b.get("upgradeCost", null)
	if cost == null:
		say.call("upgrade", I18N.t("burrow.maxLevel"), "", false)
	else:
		say.call("upgrade", I18N.shout(I18N.t("burrow.upgrade")), I18N.group_digits(float(cost)),
			bool(b.get("canUpgrade", false)))

	# LE « ! » DE LA QUETE sur le batiment ou elle mene — jamais sur DIG, ou
	# il ne faisait que du bruit a cote du prix ; seulement tant qu'on n'y est
	# jamais entre ; jamais sur un potager vide.
	var pointed := _quest_door()
	var tapped := _tapped()
	for door in _signs:
		(_signs[door] as Sign).badge.visible = door == pointed and door != "dig" \
			and not tapped.has(door) and not (door == "harvest" and garden <= 0)


## LES BOMBES ARMEES sur le terrier (`/api/traps` `armed`, que ShopState
## tient deja pour le plateau) — le `trapsLive` du web (page.tsx).
func _traps_live() -> int:
	var armed: Variant = ShopState.shared().traps.get("armed", [])
	return (armed as Array).size() if armed is Array else 0


## LES CIBLES, UNE FOIS : a l'ouverture de NOTRE terrier, une fois le
## niveau connu et s'il ouvre les raids (le serveur rend une liste vide
## en dessous de RAID_MIN). Jamais en boucle ; jamais pendant un raid.
func _ask_targets(raids_open: bool) -> void:
	if _targets_asked or not _own or not Home.loaded() or not raids_open:
		return
	if RaidState.current.has_raid():
		return
	_targets_asked = true
	RaidState.current.refresh()


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
			"trapsLive": _traps_live(),
			"targets": RaidState.current.targets if Chrome.raids_open() else [],
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
