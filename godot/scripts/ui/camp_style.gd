class_name CampStyle
## LE CAMP DE RAID : le menu du joueur (profil, historique, reglages), decoupe
## dans les maquettes art-source/profile-ui-proposals-20261008 (02 et 05) par
## tools/slice-camp-ui.py.
##
## UN POUR UN. Les pieces gardent leur taille de maquette ; le panneau pose
## chaque chose a ses coordonnees de 02-camp-de-raid.png (`Profile._put`), le
## tout multiplie par une seule echelle. Les panneaux sont des NineSlice dont
## les bords suivent cette echelle, les illustrations sont les crops eux-memes.

const NIGHT := Color("#102732")
const SURFACE := Color("#123c46")
const RAISED := Color("#1b4853")
const EDGE := Color("#32616a")
const COPPER := Color("#f28c45")
const TEXT := Color("#f5e4bf")
const MUTED := Color("#b8cdd0")
const GOOD := Color("#a8d889")
const BAD := Color("#ff9b83")
## « Abandonner ce terrier » : le rouge-orange de la maquette.
const DANGER := Color("#f0603e")
## Le cerne des titres.
const INK := Color("#06141a")
## La face pixel du jeu (d8) est bien plus large que celle de la maquette :
## a corps egal, « Historique » debordait de son onglet. Les tailles restent
## celles de la maquette, la police les prend a cette part.
const TEXT_SCALE := 0.74

const DIR := "res://assets/ui/camp/"
const FRAME := preload("res://assets/ui/camp/frame.png")
## Le filet de cuivre est a FRAME_LINE pixels du bord de chaque coin ; les
## coins font FRAME_C.
const FRAME_C := 64
const FRAME_LINE := 12
const BACKDROP := preload("res://assets/ui/camp/backdrop.jpg")
## Les marges de nuit de la maquette 05, hors de son cadre de cuivre.
const BACKDROP_SLICE := Vector4i(70, 64, 74, 54)

## Les panneaux : texture et coupe (symetriques, voir sym9 du script).
const PANELS := {
	"content": [preload("res://assets/ui/camp/panel-content.png"), 16],
	"section": [preload("res://assets/ui/camp/panel-section.png"), 16],
	"plate": [preload("res://assets/ui/camp/panel-plate.png"), 14],
	"face": [preload("res://assets/ui/camp/panel-face.png"), 8],
	"name": [preload("res://assets/ui/camp/panel-name.png"), 14],
	"inset": [preload("res://assets/ui/camp/panel-inset.png"), 10],
	"row": [preload("res://assets/ui/camp/panel-row.png"), 12],
	"list": [preload("res://assets/ui/camp/panel-list.png"), 12],
	"cell-off": [preload("res://assets/ui/camp/cell-off.png"), 10],
	"cell-on": [preload("res://assets/ui/camp/cell-on.png"), 12],
	"outline": [preload("res://assets/ui/camp/button-outline.png"), 12],
	"console": [preload("res://assets/ui/camp/panel-console.png"), 16],
	"card-off": [preload("res://assets/ui/camp/card-off.png"), 16],
	"card-on": [preload("res://assets/ui/camp/card-on.png"), 18],
}
## Les bandes a hauteur fixe : texture, chapeau gauche, chapeau droit.
const BANDS := {
	"tab-on": [preload("res://assets/ui/camp/tab-on.png"), 14, 31],
	"tab-off": [preload("res://assets/ui/camp/tab-off.png"), 14, 14],
	"pill": [preload("res://assets/ui/camp/pill.png"), 14, 14],
	"bar-track": [preload("res://assets/ui/camp/bar-track.png"), 10, 10],
	"bar-fill": [preload("res://assets/ui/camp/bar-fill.png"), 10, 10],
	"slider-track": [preload("res://assets/ui/camp/slider-track.png"), 0, 22],
	"slider-fill": [preload("res://assets/ui/camp/slider-fill.png"), 22, 0],
}


## Une piece par son nom de fichier (sans .png).
static func tex(name: String) -> Texture2D:
	return load(DIR + name + ".png")


## UN PANNEAU de la maquette a l'echelle `k` : ses coins gardent leur
## proportion avec le reste.
static func nine(which: String, k: float) -> NineSlice:
	var p: Array = PANELS[which]
	var c := int(p[1])
	return NineSlice.make(p[0], Vector4i(c, c, c, c), Vector4(c, c, c, c) * k)


## UNE BANDE (onglet, pilule, jauge) : seuls les bouts gardent leur dessin,
## toute la hauteur suit la boite.
static func band(which: String, k: float, height: float) -> NineSlice:
	var b: Array = BANDS[which]
	var t: Texture2D = b[0]
	# Les bouts a la meme echelle que la hauteur, pour ne pas les ecraser.
	var s := height / float(t.get_height())
	var n := NineSlice.make(t, Vector4i(int(b[1]), 0, int(b[2]), 0), Vector4(float(b[1]) * s, 0, float(b[2]) * s, 0))
	return n


## Une image posee telle quelle, etiree a sa boite.
static func picture(texture: Texture2D, cover: bool = false) -> TextureRect:
	var r := TextureRect.new()
	r.texture = texture
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED if cover else TextureRect.STRETCH_SCALE
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


## UN TEXTE DU CAMP. `heading` : le cerne et l'ombre des titres de la
## maquette, en capitales la ou la face pixel crie.
static func text(words: String, size: float, color: Color = TEXT, heading: bool = false) -> Label:
	size = maxf(9.0, size * TEXT_SCALE)
	var l := Kit.title(words, roundi(size), color) if heading else Kit.label(words, roundi(size), color)
	if heading:
		l.uppercase = true
		l.add_theme_color_override("font_outline_color", INK)
		l.add_theme_constant_override("outline_size", maxi(2, roundi(size * 0.18)))
		l.add_theme_color_override("font_shadow_color", Color(INK, 0.8))
		l.add_theme_constant_override("shadow_offset_x", 0)
		l.add_theme_constant_override("shadow_offset_y", maxi(1, roundi(size * 0.08)))
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.clip_text = true
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return l


## UN BOUTON NU : la piece dessinee dessous fait tout le visuel ; lui ne
## porte que le doigt, et eclaire ce qu'il couvre au survol.
static func hit(name: String = "") -> Button:
	var b := Button.new()
	if not name.is_empty():
		b.name = name
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "disabled", "focus", "hover_pressed"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	b.mouse_entered.connect(func() -> void:
		if not b.disabled:
			b.modulate = Color(1.12, 1.12, 1.12))
	b.mouse_exited.connect(func() -> void: b.modulate = Color.WHITE)
	b.button_down.connect(func() -> void: b.modulate = Color(0.85, 0.85, 0.85))
	b.button_up.connect(func() -> void: b.modulate = Color.WHITE)
	return b


# ── L'ancien style plat, garde pour le detail des skins ──────────────────────

static func panel(fill: Color = SURFACE, border: Color = EDGE, padding: int = 12) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = fill
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(6)
	s.anti_aliasing = false
	s.set_content_margin_all(padding)
	return s


static func button(words: String, accent: bool = false, height: float = 44.0) -> Button:
	var b := Button.new()
	b.text = words
	b.custom_minimum_size.y = height
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_size_override("font_size", 12)
	paint_button(b, accent)
	return b


static func paint_button(b: Button, accent: bool = false, quiet: bool = false) -> void:
	b.add_theme_stylebox_override("normal", panel(Color.TRANSPARENT if quiet else (COPPER if accent else RAISED), Color.TRANSPARENT if quiet else (COPPER if accent else EDGE), 8))
	b.add_theme_stylebox_override("hover", panel(RAISED.lightened(0.12), COPPER, 8))
	b.add_theme_stylebox_override("pressed", panel(NIGHT, COPPER, 8))
	b.add_theme_stylebox_override("disabled", panel(NIGHT, EDGE, 8))
	var focus := panel(Color.TRANSPARENT, COPPER, 8)
	focus.set_border_width_all(2)
	b.add_theme_stylebox_override("focus", focus)
	b.add_theme_color_override("font_color", NIGHT if accent else TEXT)
	b.add_theme_color_override("font_hover_color", TEXT)
	b.add_theme_color_override("font_pressed_color", TEXT)
	b.add_theme_color_override("font_focus_color", NIGHT if accent else TEXT)
	b.add_theme_color_override("font_disabled_color", Color(MUTED, 0.45))
	b.add_theme_constant_override("outline_size", 0)
