class_name HubIconButton
extends Button
## UN BOUTON CARRE DU CHROME, en haut a droite — la boutique, l'histoire,
## le tableau de saison, le son. Porte de src/components/hub-icon-button.tsx :
##
##   • C'EST UN ANNEAU DE PIERRE, pas une dalle grise (Paul, 2026-09-19) :
##     les cadres de pierre moussue disent « chrome » mieux qu'une nuance
##     plus sombre de l'app, en etant faits de l'ile.
##   • TROIS ANNEAUX, CHOISIS PAR HACHAGE DE L'ETIQUETTE — au hasard en
##     apparence, mais STABLE : un tirage se rejouerait a chaque rendu et
##     l'anneau changerait sous les yeux. FNV-1a et non `h*31+c` : quatre des
##     cinq etiquettes commencent par « S », et un `*31` donnait le meme
##     anneau a Shop et Story, cote a cote.
##   • LE GLYPHE EST PLUS PETIT QUE LE CARRE : l'ouverture de l'anneau est
##     RONDE, a 76-88 % de l'art, et un sprite a l'ancienne taille s'asseyait
##     sur les pierres au lieu de dedans (« les icones au centre plus
##     petite ») — 5,6 svh contre les 11 du bouton.
##   • LE ROUGE VEUT DIRE NOUVELLE. `news` est quelque chose qui est arrive
##     (la pastille rouge a feuilles) ; `count` est un nombre qui se tient
##     (le rang, les pieges) — une puce discrete. Tout etait rouge, et ouvrir
##     ne trouvait rien de nouveau, ce qui se lisait comme casse.
##   • LA PASTILLE SIEGE SUR LE BORD HAUT, CENTREE, pas au coin : l'anneau
##     n'a pas de coin, et une pastille au coin de la boite flottait dans le
##     vide (« les petits label en haut »).
##   • UN ENFONCEMENT, PAS UN ECRASEMENT (px-top-floor.css `.rr-ring-btn`) :
##     l'art porte son ombre, donc presser c'est descendre de 2 px DANS cette
##     ombre, avec un leger assombrissement. Ouvert se lit comme presse et le
##     reste.

## Le glyphe : clamp(17px, 5.6svh, 34px).
const GLYPH_MIN := 17.0
const GLYPH_MAX := 34.0
const GLYPH_VH := 0.056
## L'enfoncement de la presse, et son assombrissement.
const PRESS_Y := 2.0
const PRESS_DIM := 0.97
## La puce d'un compte : 9 px, 18 de large au moins, a cheval sur le bord
## haut de 5. Elle en depassait de 7 et 8 : avec le rail a 6 px du haut de
## l'ecran, « 3 », « NEW » et « #44 » etaient coupes (2026-09-23).
const CHIP_FONT := 9
const CHIP_MIN_W := 18.0
const CHIP_OVER := -5.0
const NEWS_H := 18.0
const NEWS_OVER := -5.0

const RINGS: Array[Texture2D] = [Kit.RING_1, Kit.RING_2, Kit.RING_3]

## La cle STABLE qui choisit l'anneau (le web hache l'aria-label, qui
## change avec la langue et avec l'etat muet ; ici on hache un mot fixe).
var key := ""

var _cast: TextureRect
var _ring: TextureRect
var _glyph: TextureRect
var _caret: Control
var _caret_down := true
var _chip: PanelContainer
var _chip_label: Label
var _news: NineSlice
var _news_label: Label
var _square := Kit.ICON_MIN
var _glyph_h := GLYPH_MIN
var _held := false
var _sunk := false


static func make(stable_key: String, glyph: Texture2D = null) -> HubIconButton:
	var b := HubIconButton.new()
	b.key = stable_key
	if glyph != null:
		b.set_glyph(glyph)
	return b


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	flat = true
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		add_theme_stylebox_override(state, StyleBoxEmpty.new())
	add_theme_font_size_override("font_size", 1)
	add_theme_color_override("font_color", Color(0, 0, 0, 0))
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	_cast = Stencil.cast(Kit.RING_1)
	add_child(_cast)

	_ring = TextureRect.new()
	_ring.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_ring.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_ring)
	add_child(_ring)

	_glyph = TextureRect.new()
	_glyph.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_glyph.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_glyph.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glyph.visible = false
	add_child(_glyph)

	# LA FLECHE DU KIT, dessinee : le kit web la prend d'un sprite qui n'est
	# pas dans le projet ; la pastille du web dessine deja son caret avec des
	# bordures, celui-ci fait pareil en cellules de pixel.
	_caret = Control.new()
	_caret.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_caret.visible = false
	_caret.draw.connect(_draw_caret)
	add_child(_caret)

	_chip = Kit.panel(_chip_style())
	_chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_chip_label = Kit.label("", CHIP_FONT, Palette.PILL_INK)
	_chip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_chip.add_child(_chip_label)
	_chip.visible = false
	add_child(_chip)

	_news = Kit.badge(NEWS_H)
	_news_label = Kit.label("", CHIP_FONT, Palette.CREAM, true)
	_news_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_news_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	Kit.fill(_news_label)
	_news.add_child(_news_label)
	_news.visible = false
	add_child(_news)

	button_down.connect(func() -> void: _held = true; _relook())
	button_up.connect(func() -> void: _held = false; _relook())
	mouse_entered.connect(_relook)
	mouse_exited.connect(_relook)
	resized.connect(_place)


func _ready() -> void:
	_ring.texture = ring_for(key)
	_cast.texture = _ring.texture
	_place()


## WHICH RING — FNV-1a 32 bits sur l'etiquette, modulo trois.
static func ring_for(label: String) -> Texture2D:
	var h := 0x811c9dc5
	for i in label.length():
		h ^= label.unicode_at(i)
		h = int((h * 0x01000193) & 0xffffffff)
	return RINGS[h % RINGS.size()]


## Le carre du bouton et la hauteur de son glyphe, tous deux calcules par
## la barre sur la hauteur de l'ecran.
func set_square(px: float, view_height: float) -> void:
	_square = px
	_glyph_h = clampf(view_height * GLYPH_VH, GLYPH_MIN, GLYPH_MAX)
	custom_minimum_size = Vector2(px, px)
	size = Vector2(px, px)
	_place()


func set_glyph(tex: Texture2D) -> void:
	_glyph.texture = tex
	_glyph.visible = tex != null
	_caret.visible = false
	_place()


## Le glyphe est une fleche : vers le bas pour ouvrir, vers le haut pour
## replier — elle pointe la ou le panneau va.
func set_caret(down: bool) -> void:
	_caret_down = down
	_caret.visible = true
	_glyph.visible = false
	_caret.queue_redraw()


## Ce que le coin dit. Vide : rien — un « 0 » n'annonce rien.
func set_badge(text: String, news: bool = false) -> void:
	_chip.visible = not text.is_empty() and not news
	_news.visible = not text.is_empty() and news
	_chip_label.text = text
	_news_label.text = text
	_place()


## Ouvert se lit comme presse, et le reste.
func set_pressed_look(on: bool) -> void:
	_sunk = on
	_relook()


func _chip_style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.SOIL
	s.set_border_width_all(1)
	s.border_color = Palette.SOIL_DEEP
	s.set_corner_radius_all(0)
	s.content_margin_left = Kit.PAD_TIGHT
	s.content_margin_right = Kit.PAD_TIGHT
	s.content_margin_top = 2
	s.content_margin_bottom = 2
	return s


func _place() -> void:
	var sq := size
	_glyph.size = Vector2(_glyph_h, _glyph_h)
	if _glyph.texture != null:
		var t := _glyph.texture
		_glyph.size.x = _glyph_h * float(t.get_width()) / maxf(1.0, float(t.get_height()))
	_glyph.position = ((sq - _glyph.size) * 0.5).round()
	var caret_h := clampf(_glyph_h * 0.5, 8.0, 16.0)
	_caret.size = Vector2(caret_h * 2.0, caret_h)
	_caret.position = ((sq - _caret.size) * 0.5).round()
	_caret.queue_redraw()

	_chip.reset_size()
	var w := maxf(CHIP_MIN_W, _chip.get_combined_minimum_size().x)
	_chip.size = Vector2(w, _chip.get_combined_minimum_size().y)
	_chip.position = Vector2(round((sq.x - w) * 0.5), CHIP_OVER)

	var nw := maxf(NEWS_H, _news_label.get_combined_minimum_size().x + 2.0 * 6.0)
	_news.size = Vector2(nw, NEWS_H)
	_news.position = Vector2(round((sq.x - nw) * 0.5), NEWS_OVER)
	# LE MOT REMPLIT LA PASTILLE pour s'y centrer. Un `reset_size` pour le
	# mesurer le ramenait a sa taille minimale, cale en haut a gauche :
	# « NEW » depassait du haut de la pastille (Paul, 2026-09-23).
	_news_label.position = Vector2.ZERO
	_news_label.size = _news.size
	_relook()


## L'ETAT SE LIT DANS LA HAUTEUR : enfonce de 2 px sur la presse et tant
## qu'il est ouvert ; l'ombre au sol ne bouge pas, l'objet se referme sur
## elle. Le survol eclaire d'un cran (brightness 1.08).
func _relook() -> void:
	var down := _held or _sunk
	var dy := PRESS_Y if down else 0.0
	for node: Control in [_ring, _glyph, _caret, _chip, _news]:
		node.position.y = _base_y(node) + dy
	_cast.offset_top = Stencil.CAST_DROP - dy
	_cast.offset_bottom = Stencil.CAST_DROP - dy
	var tint := PRESS_DIM if down else (1.08 if is_hovered() else 1.0)
	_ring.modulate = Color(tint, tint, tint)
	_glyph.modulate = _ring.modulate
	_caret.modulate = _ring.modulate


func _base_y(node: Control) -> float:
	if node == _ring:
		return 0.0
	if node == _glyph:
		return round((size.y - _glyph.size.y) * 0.5)
	if node == _caret:
		return round((size.y - _caret.size.y) * 0.5)
	if node == _chip:
		return CHIP_OVER
	return NEWS_OVER


## Un triangle en cellules : quatre rangees qui retrecissent, vers le bas
## ou vers le haut. Creme, comme l'encre du bois.
func _draw_caret() -> void:
	var rows := 4
	var cell := _caret.size.y / float(rows)
	var full := _caret.size.x
	for r in rows:
		var w := full * (1.0 - float(r) / float(rows))
		var y := float(r) * cell if _caret_down else float(rows - 1 - r) * cell
		var x := (full - w) * 0.5
		_caret.draw_rect(Rect2(x, y, w, cell), Palette.CREAM)
