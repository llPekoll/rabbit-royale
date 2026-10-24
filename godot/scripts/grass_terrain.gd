extends BurrowTerrain
class_name GrassTerrain
## LE SOL DE L'ILE ET DU TERRIER, depuis le 2026-10-24 : l'herbe peinte, les cotes en relief (CoastKit) et la mer peinte (ShoreWater) — le banc
## `terrain_study_bench`, valide tel quel et porte dans le jeu.
##
## RIEN QUE DE L'HABILLAGE : le relief, les cases et les regles sont ceux de
## BurrowTerrain. Les mottes de l'ile (TileView) et du terrier (`lay_sods`)
## passent par les memes trois crochets — `sod_rise`, `sod_tint`, `dress_sod`.
##
## PAS DE VENT : le banc agitait les brins par un shader sur chaque motte —
## ~9 i/s au Seeker, et on ne le voyait pas. Les brins sont cuits au repos dans
## la motte.

const VARIANTS := 24
## Importees en IMAGE, pas en texture : elles ne servent qu'a cuire les mottes,
## et relire une planche de 4608 px depuis le GPU du Seeker (gl_compatibility)
## rendait du bruit.
const GROUND: Image = preload("res://assets/terrain/grass/ground.png")
const BLADES: Image = preload("res://assets/terrain/grass/blades.png")
const PALETTES := [
	preload("res://assets/terrain/grass/palette-1.png"),
	preload("res://assets/terrain/grass/palette-2.png"),
	preload("res://assets/terrain/grass/palette-3.png"),
	preload("res://assets/terrain/grass/palette-4.png"),
]
## Le dessous de la terre, accorde a l'herbe plus claire.
const GRASS_UNDERLAY := Color("a6b946")
## La motte levee : trois pixels peints de rebord, plus de la forte bordure
## d'origine (quatre).
const COVERED_RISE := 3.0 * Iso.BURROW_TILE_W / GROUND_PAINTED_W

var _patch_noise := FastNoiseLite.new()
## Les mottes cuites (sol + brins) et les planches lues, pour toute la partie :
## relire une planche (`get_image`) coute cher au telephone — 3 s par ile au
## Seeker quand chaque cadre relisait la sienne.
static var _frames: Dictionary = {}
static var _sheets: Dictionary = {}
## La motte de chaque case, de l'ile comme du terrier : les levres de la cote
## ne se posent que la, et prennent son voile.
var _dressed: Dictionary = {}
var _coast: CoastKit
var _water: ShoreWater


func _ready() -> void:
	slope_shading = 0.23
	shore_spray = false
	paints_sea = true
	_patch_noise.seed = 231026
	_patch_noise.frequency = 0.14
	_patch_noise.fractal_octaves = 1
	super._ready()
	_grass.clear()
	for sheet: Texture2D in PALETTES:
		_grass.append(_slice(sheet, GRASS_ORIGIN, 4, 4))
	build()


func build() -> void:
	super.build()
	if is_instance_valid(_underlay):
		_underlay.color = GRASS_UNDERLAY


func sod_texture(cell: Vector2i, row: int, look: int) -> Texture2D:
	if row == TileView.DIG_TILE_GARDEN_ROW:
		return super.sod_texture(cell, row, look)
	return _open_shore(cell, _grass_frame(cell, look))


func sod_rise(look: int) -> float:
	return COVERED_RISE if look == TileView.Look.COVERED else super.sod_rise(look)


## Les variations sont dans la texture, pas un damier de teintes ajoute.
func sod_tint(_cell: Vector2i) -> Color:
	return Color.WHITE


## La motte de chaque case : les levres de la cote prennent son voile.
func dress_sod(cell: Vector2i, sod: Sprite2D, _look: int) -> void:
	_dressed[cell] = sod


func has_sod(cell: Vector2i) -> bool:
	return _dressed.has(cell) or super.has_sod(cell)


## La motte de `cell`, ou null.
func sod_at(cell: Vector2i) -> Sprite2D:
	var sod: Sprite2D = _dressed.get(cell)
	return sod if is_instance_valid(sod) else null


## LE RIVAGE ET LA MER, une fois les mottes posees : les levres de la cote ne
## vont que sur une motte, et la mer cuit la silhouette de tout ce qui est
## dessine. Rappele a chaque `build`.
func dress_shore() -> void:
	_drop_shore()
	_coast = CoastKit.new()
	add_child(_coast)
	_coast.build(self)
	_water = ShoreWater.new()
	add_child(_water)
	_water.build(self, _coast)


func coast() -> CoastKit:
	return _coast


func water() -> ShoreWater:
	return _water


func clear() -> void:
	_dressed.clear()
	_drop_shore()
	super.clear()


func _drop_shore() -> void:
	for node: Node in [_coast, _water]:
		if is_instance_valid(node):
			remove_child(node)
			node.queue_free()
	_coast = null
	_water = null


func _variant(cell: Vector2i) -> int:
	# Une teinte pour plusieurs cases voisines ; le grain ne decide pas la couleur.
	var patch := _patch_noise.get_noise_2d(float(cell.x), float(cell.y))
	var group := 0 if patch < -0.18 else (2 if patch > 0.18 else 1)
	var rng := Rng.from_seed("terrain-grass-v3:%d:%d" % [cell.x, cell.y])
	return group * VARIANTS + int(rng.next() * VARIANTS)


## La famille de teinte d'une case (0 sombre, 1, 2 claire) : les levres de la
## cote la suivent.
func grass_group(cell: Vector2i) -> int:
	return _variant(cell) / VARIANTS


## La motte de `cell` : le sol, ses brins au repos par-dessus, inclinee sur
## une rampe. Une texture par variante et par etat, jamais par case.
func _grass_frame(cell: Vector2i, look: int) -> Texture2D:
	var region := Rect2i(_variant(cell) * TILE, clampi(look, 0, 1) * TILE, TILE, TILE)
	var key := "%s" % region
	if not _frames.has(key):
		var img := _rgba(GROUND).get_region(region)
		img.blend_rect(_rgba(BLADES), region, Vector2i.ZERO)
		_frames[key] = ImageTexture.create_from_image(img)
	var flat: Texture2D = _frames[key]
	if _warp_at.has(cell):
		var lifts: Array = (_warp_at[cell][1] as Array)[0]
		return Slopes.ramp_texture(flat, lifts, null, 0, false, false, slope_shading)
	return flat


static func _rgba(sheet: Image) -> Image:
	if sheet.get_format() == Image.FORMAT_RGBA8:
		return sheet
	var key := sheet.get_instance_id()
	if not _sheets.has(key):
		var img := sheet.duplicate() as Image
		img.convert(Image.FORMAT_RGBA8)
		_sheets[key] = img
	return _sheets[key]


## L'image d'une planche, lue une fois.
static func sheet_image(sheet: Texture2D) -> Image:
	var id := sheet.get_rid().get_id()
	if not _sheets.has(id):
		var img := sheet.get_image()
		if img.is_compressed():
			img.decompress()
		if img.get_format() != Image.FORMAT_RGBA8:
			img.convert(Image.FORMAT_RGBA8)
		_sheets[id] = img
	return _sheets[id]
