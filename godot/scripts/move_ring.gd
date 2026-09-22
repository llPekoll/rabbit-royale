extends Node2D
class_name MoveRing
## L'ANNEAU D'OR — les cases qu'un pas peut atteindre, allumees autour du lapin.
##
## Porte de src/game/scenes/IslandScene.ts (`refreshReachable`, `startSweep`,
## `pulseRing`) et de src/game/entities/Tile.ts (`setHighlight`, `blink`).
##
## C'EST TOUTE L'AFFORDANCE DU JEU : sur un plateau iso, « quelles cases puis-je
## toucher ? » ne se lit pas dans la geometrie, et les allumer y repond sans
## tutoriel. Rappele apres chaque pas, pour que l'anneau voyage avec le lapin.
##
## ALLUME VEUT DIRE CLIQUABLE, pas seulement voisin. L'anneau allumait jadis les
## huit voisines de terre, ce qui promettait trop : allumer une case que le
## serveur va refuser apprend au joueur que l'anneau ne se fie pas, ce qui coute
## plus que l'anneau ne vaut. C'est donc l'appelant qui passe les cases, filtrees
## par la meme regle que le pas (`IslandBoard.may_step`).
##
## TOUJOURS OR. L'anneau a passe un jour au rouge sur le sol non creuse (« ce pas
## est un pari ») ; inexplique, ca se lisait comme une erreur, et ca depensait
## la seule couleur dont le mode X a besoin. Le rouge veut dire exactement une
## chose sur ce plateau : un X peut aller la.
##
## DEUX SPRITES PAR CASE, montes dans son bloc comme le voile et le chiffre :
## le CONTOUR, qui reste tant que la case est allumee, et le PLEIN, opaque, qui
## claque a 1 puis s'efface en une seconde — c'est le clignotement.
##
## LE BALAYAGE : les cases allumees clignotent UNE A LA FOIS, en tournant autour
## du lapin, pour que l'anneau se lise comme une lumiere qui voyage et non comme
## un scintillement desordonne. Triees par ANGLE depuis le lapin — c'est ce qui
## le fait tourner en cercle plutot qu'en ordre d'index.

const GOLD := Color("#ffd700")
## Le rouge du X : la marque elle-meme, et l'anneau en MODE X sur chaque case ou
## un X peut se poser. Rien d'autre sur le plateau n'a cette couleur.
const RISK := Color("#ff5a4a")

## Secondes entre deux clignotements pendant que le balayage fait le tour.
## Une cadence PAR CASE, juste tant que l'anneau est plein : huit cases a 0,25
## font un tour en deux secondes, et la lumiere se lit comme voyageant.
const SWEEP_STEP_SECONDS := 0.25
## LE TOUR LE PLUS COURT, quoi que l'anneau contienne. Une cadence par case
## seule est un stroboscope sur un petit anneau : le couloir du tutoriel allume
## UNE case, donc la meme clignotait toutes les 0,25 s — « ca blink hyper vite »
## (Paul, 2026-09-20). Le pas s'etire pour qu'un tour ne finisse jamais plus
## vite que ceci : un anneau plein reste tel quel (8 x 0,25 = 2 s), seuls les
## anneaux assez petits pour scintiller ralentissent.
const SWEEP_MIN_LAP_SECONDS := 1.6
## Le plein claque a 1, puis s'efface en une seconde.
const BLINK_SECONDS := 1.0

## DANS LE BLOC : le sol a 1, le voile a 2, le chiffre a 3, le X a 4. L'anneau
## passe au-dessus de tout ce qui habille la case.
const Z_OUTLINE := 5
const Z_BLINK := 6

## L'epaisseur du contour, en pixels de tuile.
const OUTLINE_PX := 1.5

var terrain: BurrowTerrain

var _outline: Dictionary = {}
var _blink: Dictionary = {}
var _fades: Dictionary = {}
var _lit: Array[Vector2i] = []
var _sweep: Timer
var _step := 0

static var _outline_tex: ImageTexture


func _ready() -> void:
	_sweep = Timer.new()
	_sweep.one_shot = false
	_sweep.timeout.connect(_tick)
	add_child(_sweep)


## UN CONTOUR ET UN PLEIN PAR CASE JOUABLE, invisibles jusqu'a `set_lit`.
func build(cells: Array[Vector2i]) -> void:
	clear()
	if terrain == null:
		return
	for cell in cells:
		if not terrain.has_block(cell):
			continue
		var outline := Sprite2D.new()
		outline.texture = _outline_texture()
		outline.centered = true
		outline.modulate = GOLD
		outline.visible = false
		terrain.mount_veil(cell, outline, Z_OUTLINE)
		_outline[cell] = outline

		var blink := Sprite2D.new()
		blink.texture = TileView._diamond_texture()
		blink.centered = true
		blink.modulate = Color(GOLD.r, GOLD.g, GOLD.b, 0.0)
		blink.visible = false
		terrain.mount_veil(cell, blink, Z_BLINK)
		_blink[cell] = blink


func clear() -> void:
	_stop_sweep()
	for cell in _fades:
		var t: Tween = _fades[cell]
		if t != null and t.is_valid():
			t.kill()
	_fades.clear()
	for cell in _outline:
		(_outline[cell] as Node).queue_free()
	for cell in _blink:
		(_blink[cell] as Node).queue_free()
	_outline.clear()
	_blink.clear()
	_lit.clear()


## ALLUME CES CASES, et rien d'autre. `centre` est la case du lapin, pour trier
## le balayage par angle ; `risky` passe l'anneau au rouge du X.
func set_lit(cells: Array[Vector2i], centre: Vector2i, risky: bool = false) -> void:
	_stop_sweep()
	for cell in _lit:
		if _outline.has(cell):
			(_outline[cell] as Sprite2D).visible = false
			var b: Sprite2D = _blink[cell]
			_kill_fade(cell)
			b.visible = false
			b.modulate.a = 0.0
	_lit.clear()

	var colour := RISK if risky else GOLD
	for cell in cells:
		if not _outline.has(cell):
			continue
		var o: Sprite2D = _outline[cell]
		o.modulate = colour
		o.visible = true
		var b: Sprite2D = _blink[cell]
		b.modulate = Color(colour.r, colour.g, colour.b, 0.0)
		b.visible = true
		_lit.append(cell)

	if _lit.is_empty():
		return
	_lit.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return atan2(float(a.y - centre.y), float(a.x - centre.x)) \
			< atan2(float(b.y - centre.y), float(b.x - centre.x)))
	# Au TOUR, pas a la case : un anneau d'une case a la cadence par case est la
	# meme case qui clignote quatre fois par seconde.
	_sweep.wait_time = maxf(SWEEP_STEP_SECONDS, SWEEP_MIN_LAP_SECONDS / float(_lit.size()))
	_step = 0
	_tick()
	_sweep.start()


## FAIT CLIGNOTER TOUT L'ANNEAU D'UN COUP — la reponse a une tape hors de portee.
func pulse() -> void:
	for cell in _lit:
		_flash(cell)


func _tick() -> void:
	if _lit.is_empty():
		return
	_flash(_lit[_step % _lit.size()])
	_step += 1


## UN ECLAIR D'OR : plein a 1, puis fondu vers 0 en une seconde.
func _flash(cell: Vector2i) -> void:
	if not _blink.has(cell):
		return
	var b: Sprite2D = _blink[cell]
	if not b.visible:
		return
	_kill_fade(cell)
	b.modulate.a = 1.0
	var t := create_tween()
	t.tween_property(b, "modulate:a", 0.0, BLINK_SECONDS)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_fades[cell] = t


func _kill_fade(cell: Vector2i) -> void:
	if _fades.has(cell):
		var t: Tween = _fades[cell]
		if t != null and t.is_valid():
			t.kill()
		_fades.erase(cell)


func _stop_sweep() -> void:
	if _sweep != null:
		_sweep.stop()


## LE CONTOUR DU LOSANGE, cuit une fois : la bande de `OUTLINE_PX` le long du
## bord, en pixels francs comme le losange plein.
static func _outline_texture() -> ImageTexture:
	if _outline_tex != null:
		return _outline_tex
	var w := Iso.BURROW_TILE_W
	var h := Iso.BURROW_TILE_H
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var hw := w * 0.5
	var hh := h * 0.5
	# La bande est mesuree en hauteur : `OUTLINE_PX` pixels sur l'axe court du
	# losange, ce qui donne un trait de meme epaisseur visuelle tout autour.
	var inner := 1.0 - OUTLINE_PX / hh
	for y in range(h):
		for x in range(w):
			var d := absf(x + 0.5 - hw) / hw + absf(y + 0.5 - hh) / hh
			if d <= 1.0 and d > inner:
				img.set_pixel(x, y, Color(1, 1, 1, 1))
	_outline_tex = ImageTexture.create_from_image(img)
	return _outline_tex
