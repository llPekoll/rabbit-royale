class_name ItemSlot
extends Button
## UNE CASE D'INVENTAIRE : un carre, l'image de la chose, et un compte dans
## le coin.
##
## Porte de src/components/item-slot.tsx et de `.rr-toolkit-tool`
## (kit-row.css). La forme qu'un objet a partout dans ce jeu hors de l'etal
## de la boutique — un carre a bordure plutot que la planche arrondie des
## cartes, parce que c'est a ca que ressemble une case, et parce que la
## bordure est ce qui peut porter un etat VIVANT sans second element :
##
##   • CHOISIE : le liseret dore (`aria-pressed`, #ffce44) — Kit.style_well(true).
##   • VIDE : rien en main, rien en cours. ASSOMBRIE, PAS CACHEE. Un objet
##     qu'on ne voit pas est un objet dont on ignore l'existence, et
##     plusieurs de ceux-ci n'arrivent que d'un coffre. Le CARRE garde son
##     fond opaque et c'est L'IMAGE qui palit : une case a moitie
##     transparente sur l'eau de l'ile sortait bleu pale, plus claire que ses
##     voisines pleines, l'exact contraire de « tu n'en as pas ».
##   • EN COURS : une fenetre est ouverte (un bouclier qui tient) — le coin
##     dit combien de temps il reste, la ou c'est parfois le seul endroit du
##     jeu ou le fait apparait.
##
## L'ART EST PRIS OU LE JEU EN A (item-meta.ts) : le piege est la bombe
## enterree, la bombe qu'on porte est celle a meche allumee, la cloture est
## le sprite meme du potager. La fumee et le mirage n'ont pas de sprite —
## le web tombe sur un emoji, que la face pixel n'a pas — alors ils sont
## DESSINES ici en quelques rectangles, dans la teinte que item-meta.ts leur
## donne.

## `--item-size: 54px` sous 960 de large (notre 890 de reference) ; 64 au-dela.
const SIZE := 54.0
const SIZE_WIDE := 64.0
const WIDE_SCREEN := 960.0
## `.rr-toolkit-art` : 28px sous 960, 34 au-dela.
const ART := 28.0
const ART_WIDE := 34.0
## La quantite : bas-droit a 5 / 3, 11px, ombre 0 2px #28170c.
const COUNT_SIZE := 11
const COUNT_SHADOW := Color("#28170c")
## L'art d'une case vide palit a 0.4.
const DIM := 0.4

## Les teintes d'item-meta.ts pour ce qui est dessine.
const SMOKE_TINT := Color("#6b7a8f")
const SMOKE_LIGHT := Color("#9aa7b8")
const MIRAGE_DARK := Color("#69468f")
const MIRAGE_MID := Color("#c5a1eb")
const MIRAGE_LIGHT := Color("#f3dcff")

## Le sprite de chaque sorte, et son rapport largeur/hauteur pour ne jamais
## l'etirer (`aspect`).
const ART_OF := {
	"trap": [preload("res://assets/ui/icons/bomb.png"), 27.0 / 36.0],
	"bomb": [preload("res://assets/ui/icons/bomb-lit.png"), 36.0 / 43.0],
	"lightning": [preload("res://assets/ui/icons/bolt.webp"), 24.0 / 29.0],
	"shield": [preload("res://assets/ui/icons/shield.webp"), 1.0],
	"energy": [preload("res://assets/gauge/dial-icon.webp"), 1.0],
	"fence": [preload("res://assets/deco/fence.png"), 192.0 / 128.0],
	"water": [preload("res://assets/ui/icons/water.webp"), 32.0 / 33.0],
	"fertiliser": [preload("res://assets/ui/icons/fertiliser.webp"), 32.0 / 29.0],
}

var kind := ""
var selected := false
var _art: Control
var _count: Label
var _wide := false


func _init(p_kind: String = "") -> void:
	kind = p_kind
	focus_mode = Control.FOCUS_NONE
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	add_theme_font_size_override("font_size", 1)
	add_theme_color_override("font_color", Color.TRANSPARENT)
	_art = art_for(kind, ART)
	add_child(_art)
	_count = Kit.label("", COUNT_SIZE, Palette.CREAM)
	_count.add_theme_color_override("font_shadow_color", COUNT_SHADOW)
	_count.add_theme_constant_override("shadow_offset_x", 0)
	_count.add_theme_constant_override("shadow_offset_y", 2)
	_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	add_child(_count)
	resized.connect(_place)
	set_wide(false)
	_restyle()


## La case et son art au format de l'ecran.
func set_wide(wide: bool) -> void:
	_wide = wide
	var s := SIZE_WIDE if wide else SIZE
	custom_minimum_size = Vector2(s, s)
	var art := ART_WIDE if wide else ART
	var ratio: float = _art.get_meta("ratio", 1.0)
	_art.custom_minimum_size = Vector2(art * ratio, art)
	_place()


func set_selected(on: bool) -> void:
	selected = on
	_restyle()


## Ce que le coin dit : un compte, des jours, ou rien.
func set_count(text: String) -> void:
	_count.text = text


## Assombrit l'art, pas le carre.
func set_dim(dim: bool) -> void:
	_art.modulate.a = DIM if dim else 1.0


func _restyle() -> void:
	var well := Kit.style_well(selected)
	for state in ["normal", "hover", "pressed", "focus"]:
		add_theme_stylebox_override(state, well)
	var off := Kit.style_well(selected)
	off.bg_color = Palette.WELL_FACE.darkened(0.2)
	add_theme_stylebox_override("disabled", off)


func _place() -> void:
	var want := _art.custom_minimum_size
	_art.size = want
	# Centre, puis remonte un peu : le CSS garde 15px de padding en bas pour
	# laisser la quantite au coin sans qu'elle couvre l'image.
	_art.position = Vector2(floorf((size.x - want.x) * 0.5), floorf((size.y - 10.0 - want.y) * 0.5))
	_count.size = Vector2(size.x - 10.0, float(COUNT_SIZE) + 2.0)
	_count.position = Vector2(5.0, size.y - 3.0 - _count.size.y)


## L'IMAGE D'UNE SORTE a une hauteur donnee : le sprite quand il y en a un,
## sinon la fumee ou le mirage dessines.
static func art_for(p_kind: String, height: float) -> Control:
	if ART_OF.has(p_kind):
		var entry: Array = ART_OF[p_kind]
		var tex: Texture2D = entry[0]
		var ratio: float = entry[1]
		var r := Kit.icon(tex, height)
		r.custom_minimum_size = Vector2(height * ratio, height)
		r.set_meta("ratio", ratio)
		return r
	var glyph := Glyph.new()
	glyph.kind = p_kind
	glyph.custom_minimum_size = Vector2(height, height)
	glyph.set_meta("ratio", 1.0)
	glyph.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return glyph


## La fumee et le mirage, en cellules d'une grille de 24 — le mirage est la
## spirale SVG de kit-row.tsx (`shapeRendering: crispEdges`), la fumee un
## nuage en trois bosses.
class Glyph extends Control:
	var kind := ""

	func _cell(x: float, y: float, w: float, h: float, color: Color) -> void:
		var u := size.x / 24.0
		draw_rect(Rect2(x * u, y * u, w * u, h * u), color)

	func _draw() -> void:
		if kind == "mirage":
			# Le cadre sombre a coins coupes, decale d'un pixel, puis le
			# meme en clair par-dessus, puis la spirale au centre.
			for entry in [[0.0, 0.0, MIRAGE_DARK], [-1.0, 1.0, MIRAGE_MID]]:
				var dx: float = entry[0]
				var dy: float = entry[1]
				var c: Color = entry[2]
				_cell(5.0 + dx, 4.0 + dy, 14.0, 3.0, c)
				_cell(5.0 + dx, 18.0 + dy, 14.0, 3.0, c)
				_cell(2.0 + dx, 7.0 + dy, 4.0, 11.0, c)
				_cell(18.0 + dx, 7.0 + dy, 4.0, 11.0, c)
			_cell(8.0, 10.0, 8.0, 2.0, MIRAGE_LIGHT)
			_cell(13.0, 12.0, 3.0, 1.0, MIRAGE_LIGHT)
			_cell(10.0, 13.0, 6.0, 2.0, MIRAGE_LIGHT)
		else:
			_cell(3.0, 12.0, 18.0, 7.0, SMOKE_TINT)
			_cell(6.0, 8.0, 7.0, 5.0, SMOKE_TINT)
			_cell(12.0, 6.0, 7.0, 7.0, SMOKE_TINT)
			_cell(7.0, 9.0, 5.0, 2.0, SMOKE_LIGHT)
			_cell(13.0, 7.0, 4.0, 2.0, SMOKE_LIGHT)
			_cell(4.0, 13.0, 3.0, 2.0, SMOKE_LIGHT)
