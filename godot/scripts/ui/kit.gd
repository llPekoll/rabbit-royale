class_name Kit
## LES PIECES DU CHROME — ce dont chaque panneau se construit.
##
## Le web fait passer tout son chrome par deux composants (px.tsx) et une
## peau (woodland/runtime.tsx) qui decide de la MATIERE d'une surface d'apres
## son role : parchemin a cadre de feuilles pour un dialogue, planche pour un
## bouton ou un bandeau, creux pour une case d'objet, pastille sombre pour une
## legende. Ce fichier est cette peau, en fabriques : un ecran demande une
## matiere par son nom et n'a jamais a connaitre la texture ni ses coupes.
##
## TOUTES LES TEXTURES SONT EN `preload`, jamais en `load()` d'un chemin : un
## chemin resolu a l'execution n'est pas vu par l'exportateur Android, et la
## texture manque a l'APK (plank_button.gd raconte comment on l'a appris).
##
## Les mesures viennent de runtime.css et des composants nommes en commentaire.
## Elles sont en pixels d'ecran a l'echelle 1 ; la fenetre s'etire en
## `canvas_items`, donc un pixel ici est un pixel du 890x400 de reference.

# ── L'art ────────────────────────────────────────────────────────────────────
## Le cadre a feuilles (leaf-frame.tsx), reduit au tiers : 504x417 -> 168x139.
## Les coupes du web, 110 90 85 90, deviennent 37 30 28 30.
const LEAF_FRAME := preload("res://assets/ui/leaf-frame.webp")
const LEAF_SLICE := Vector4i(30, 37, 30, 28)
## Les proportions des quatre bords, pour qu'un cadre plus petit garde ses
## feuilles en proportion (LeafFrame derive tout du bord gauche).
const LEAF_RATIO := Vector4(90.0, 110.0, 90.0, 85.0) / 90.0
## Ce que le BOIS du cadre occupe de ses coupes PRES DU COIN HAUT DROIT, la
## ou se tient le [x] — mesure sur une capture (2026-09-24) : 8,3 des 37
## lignes du haut, 13,8 des 30 colonnes de droite (le montant s'epaissit sous
## les feuilles du coin). Le reste est deja du parchemin. Le [x] se pose a
## CLOSE_AIR de ce bois-la.
const LEAF_RAIL_TOP := 8.3 / 37.0
const LEAF_RAIL_RIGHT := 13.8 / 30.0
## Le bord d'un dialogue : `border-image ... / 36px`.
const LEAF_EDGE := 36.0

## Les planches, deja reduites pour que leurs bouts fassent leur taille
## d'ecran (voir plank_button.gd) : bois 25px, les bandeaux 30px.
const PLANK := preload("res://assets/ui/plank.webp")
const NOTICE_GOLD := preload("res://assets/ui/notice-gold.webp")
const NOTICE_GREEN := preload("res://assets/ui/notice-green.webp")
const NOTICE_DANGER := preload("res://assets/ui/notice-danger.webp")
const NOTICE_BLUE := preload("res://assets/ui/notice-blue.webp")
const PLANK_CAP := 25
const NOTICE_CAP := 30

## La planche a energie (plank.tsx) : 167x64, deux planches soudees, coupes
## 59 / 70 pour que le milieu soit du bois plat sur les deux.
const PLANK_ENERGY := preload("res://assets/ui/plank-energy.webp")
const PLANK_ENERGY_SLICE := Vector4i(59, 0, 70, 0)

## Les bandeaux DEFEND et RAID du sol (scroll-plank.tsx), et la banniere de
## vigne (leaf-banner.tsx).
const SCROLL_PLANK := preload("res://assets/ui/scroll-plank.webp")
const SCROLL_PLANK_BLUE := preload("res://assets/ui/scroll-plank-blue.webp")
const SKULL_PLANK := preload("res://assets/ui/skull-plank.webp")
const SKULL_PLANK_RED := preload("res://assets/ui/skull-plank-red.webp")
const BANNER := preload("res://assets/ui/banner.webp")

## La pastille a feuilles (leaf-badge.tsx) : 157x151, coupes 44 / 38.
const BADGE := preload("res://assets/ui/badge.webp")
const BADGE_SLICE := Vector4i(44, 38, 44, 38)

## Le [x] (close_button.gd) : une touche carree dessinee a 32, dans une cible
## de 44 qui deborde du dessin sans pousser la mise en page.
const CLOSE_SIZE := 32.0
const CLOSE_TAP := 44.0
## L'air entre le [x] et le bord qui se voit (le bois du cadre, ou l'ecran),
## le meme au-dessus et a droite : pres du coin, sans le toucher.
const CLOSE_AIR := 10.0

## Les anneaux du podium, le coeur, la couronne, le parchemin de l'histoire.
const RING_1 := preload("res://assets/ui/ring-1.webp")
const RING_2 := preload("res://assets/ui/ring-2.webp")
const RING_3 := preload("res://assets/ui/ring-3.webp")
const HEART := preload("res://assets/ui/heart.png")
const HEART_EMPTY := preload("res://assets/ui/heart-empty.png")
const CROWN := preload("res://assets/ui/crown.png")
## La coupe d'or du kit d'arcade : le trophee de la saison, comme sur le web
## (leaderboard-drawer.tsx, `GOLD_CUP_URL`).
const CUP := preload("res://assets/ui/gold-cup.png")
const SCROLL := preload("res://assets/ui/scroll.png")

## Les icones d'objets et de portes.
const ICONS := {
	"bolt": preload("res://assets/ui/icons/bolt.webp"),
	"carrot": preload("res://assets/ui/icons/carrot.webp"),
	"fertiliser": preload("res://assets/ui/icons/fertiliser.webp"),
	"garden": preload("res://assets/ui/icons/garden.webp"),
	"shield": preload("res://assets/ui/icons/shield.webp"),
	"water": preload("res://assets/ui/icons/water.webp"),
	"swords": preload("res://assets/ui/icons/swords.webp"),
	"bomb": preload("res://assets/ui/icons/bomb.png"),
	"bomb-lit": preload("res://assets/ui/icons/bomb-lit.png"),
	"shop": preload("res://assets/ui/icons/shop.png"),
	"speaker-on": preload("res://assets/sound/speaker-on.webp"),
	"speaker-off": preload("res://assets/sound/speaker-off.webp"),
	"loot-box": preload("res://assets/misc/loot-box.webp"),
	"bomb-small": preload("res://assets/misc/RR-Bomb-Small.webp"),
	"carrot-pile": preload("res://assets/ui/carrot-pile.png"),
}

## La jauge (gauge/, tools/gen_energy_bar.py) : une coquille en trois
## morceaux de 51 de haut, et un remplissage de 24 par ton.
const GAUGE_SHELL_BASE := preload("res://assets/gauge/bar-shell-base.webp")
const GAUGE_SHELL_MID := preload("res://assets/gauge/bar-shell-mid.webp")
const GAUGE_SHELL_CAP := preload("res://assets/gauge/bar-shell-cap.webp")
const GAUGE_FILL := {
	"carrot": [preload("res://assets/gauge/bar-fill-carrot-mid.webp"), preload("res://assets/gauge/bar-fill-carrot-cap.webp")],
	"warn": [preload("res://assets/gauge/bar-fill-warn-mid.webp"), preload("res://assets/gauge/bar-fill-warn-cap.webp")],
	"danger": [preload("res://assets/gauge/bar-fill-danger-mid.webp"), preload("res://assets/gauge/bar-fill-danger-cap.webp")],
}
const DIAL_EMPTY := preload("res://assets/gauge/dial-empty.webp")
const DIAL_FULL := preload("res://assets/gauge/dial-full.webp")
const DIAL_ICON := preload("res://assets/gauge/dial-icon.webp")

## Les cinq lapins des avatars (lib/game/avatars.ts), par cle.
const AVATARS := {
	"brown": preload("res://assets/bunnies/bunny-brown.webp"),
	"gray": preload("res://assets/bunnies/bunny-gray.webp"),
	"orange": preload("res://assets/bunnies/bunny-orange.webp"),
	"white": preload("res://assets/bunnies/bunny-white.webp"),
	"yellow": preload("res://assets/bunnies/bunny-yellowish.webp"),
}

# ── Les mesures partagees (globals.css :root) ───────────────────────────────
## L'ecart entre un chrome fixe et le bord de l'ecran.
const EDGE := 10.0
## L'air dans un panneau : en-tete, corps, pied.
const PAD := 10.0
## Les pastilles et les bandes d'une ligne.
const PAD_TIGHT := 6.0
## La barre du haut, EPINGLEE : l'ile reserve exactement cette bande.
const TOPBAR_H := 56.0
## Le carre d'une icone du rail : clamp(34px, 11svh, 68px).
const ICON_MIN := 34.0
const ICON_MAX := 68.0
const ICON_VH := 0.11
## La cellule de la face pixel : 8px source, comme BitmapText.
const CELL := 8.0


# ── Les surfaces ─────────────────────────────────────────────────────────────

## LE PARCHEMIN A CADRE DE FEUILLES — la surface d'un dialogue. `fill` peint
## le papier ; `edge` est le bord gauche, les trois autres suivent la
## proportion de l'art.
static func parchment(edge: float = LEAF_EDGE, painted: bool = true) -> NineSlice:
	return NineSlice.make(LEAF_FRAME, LEAF_SLICE, LEAF_RATIO * edge, painted)


## UNE PLANCHE (3 tranches : rien en haut ni en bas). "wood", "gold",
## "green", "danger", "blue".
static func plank(tone: String = "wood") -> NineSlice:
	var cap := PLANK_CAP if tone == "wood" else NOTICE_CAP
	return NineSlice.make(plank_texture(tone), Vector4i(cap, 0, cap, 0), Vector4(cap, 0, cap, 0), true)


static func plank_texture(tone: String) -> Texture2D:
	match tone:
		"gold":
			return NOTICE_GOLD
		"green":
			return NOTICE_GREEN
		"danger":
			return NOTICE_DANGER
		"blue":
			return NOTICE_BLUE
		_:
			return PLANK


## L'encre qui va sur une planche : brune sur l'or, creme ailleurs.
static func plank_ink(tone: String) -> Color:
	return Palette.INK if tone == "gold" else Palette.CREAM


## UNE PLANCHE COMME FOND DE PANNEAU (StyleBoxTexture) : pour un
## PanelContainer dont la planche doit couvrir TOUTE la surface. Posee en
## enfant, le conteneur la rangeait dans ses marges et ses feuilles
## tombaient sous le texte. `left` : l'air apres les feuilles de gauche.
static func style_plank(left: float = 8.0, right: float = 10.0, vertical: float = 5.0) -> StyleBoxTexture:
	var s := StyleBoxTexture.new()
	s.texture = PLANK
	s.texture_margin_left = PLANK_CAP
	s.texture_margin_right = PLANK_CAP
	s.content_margin_left = PLANK_CAP + left
	s.content_margin_right = right
	s.content_margin_top = vertical
	s.content_margin_bottom = vertical
	return s


## UN MOT SUR UNE PLANCHE : le pied d'une liste (`.rr-shop-foot`, PxPanel
## PLANK), creme centre. Rend le panneau ; le libelle est son seul enfant.
static func plank_note(text: String = "", size: int = 12) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", style_plank(2.0, 12.0, 6.0))
	var l := note(text, Palette.CREAM, size)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)
	return p


## LA PASTILLE A FEUILLES, un compteur : hauteur fixe, largeur au contenu.
static func badge(height: float = 22.0) -> NineSlice:
	var k := height / float(BADGE.get_height())
	return NineSlice.make(BADGE, BADGE_SLICE,
		Vector4(BADGE_SLICE.x * k, BADGE_SLICE.y * k, BADGE_SLICE.z * k, BADGE_SLICE.w * k), true)


## UN CREUX : une case d'objet, une case de boutique (`wl-runtime-well`).
static func style_well(selected: bool = false) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.WELL_FACE
	s.set_border_width_all(3)
	s.border_color = Palette.TAB_ON_RIM if selected else Palette.WELL_RIM
	s.set_corner_radius_all(8)
	s.shadow_color = Palette.WELL_LIP
	s.shadow_offset = Vector2(0, 2)
	s.shadow_size = 0
	s.set_content_margin_all(3)
	return s


## UN COMPTEUR (`wl-runtime-badge`) : la petite plaque des chiffres.
static func style_badge() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.BADGE_BOTTOM.lerp(Palette.BADGE_TOP, 0.5)
	s.set_border_width_all(2)
	s.border_color = Palette.BADGE_RIM
	s.set_corner_radius_all(5)
	s.content_margin_left = 5
	s.content_margin_right = 5
	s.content_margin_top = 3
	s.content_margin_bottom = 3
	return s


## UNE GOUTTIERE (`wl-runtime-track`) : la piste d'une jauge.
static func style_track() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.TRACK_FACE
	s.set_border_width_all(2)
	s.border_color = Palette.TRACK_RIM
	s.set_corner_radius_all(12)
	s.shadow_color = Palette.TRACK_LIP
	s.shadow_offset = Vector2(0, 2)
	s.shadow_size = 0
	return s


## UN ONGLET (`wl-runtime-action-tab`) : bois au repos, or quand il est choisi.
static func style_tab(on: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = (Palette.TAB_ON_TOP.lerp(Palette.TAB_ON_BOTTOM, 0.5)) if on \
		else (Palette.TAB_TOP.lerp(Palette.TAB_BOTTOM, 0.5))
	s.set_border_width_all(2)
	s.border_color = Palette.TAB_RIM
	s.corner_radius_top_left = 6
	s.corner_radius_top_right = 6
	s.corner_radius_bottom_left = 3
	s.corner_radius_bottom_right = 3
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s


## LA LEGENDE (`wl-runtime-caption`) : la pastille sombre et translucide des
## messages sur le plateau. Un refus se lit a l'encre et a un lisere rouge,
## pas a une seconde planche.
static func style_caption(danger: bool = false) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.CAPTION_BG
	s.set_corner_radius_all(14)
	s.content_margin_left = 18
	s.content_margin_right = 18
	s.content_margin_top = 7
	s.content_margin_bottom = 7
	if danger:
		s.set_border_width_all(1)
		s.border_color = Palette.CAPTION_DANGER_RIM
	return s


## LE VERRE du chip de recolte sur la pastille (`CARRY_GLASS`).
static func style_glass() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.CARRY_GLASS
	s.set_corner_radius_all(6)
	s.content_margin_left = 6
	s.content_margin_right = 6
	s.content_margin_top = 2
	s.content_margin_bottom = 2
	return s


## Une carte de terre (BurrowCard) : la face en terre tassee sur son biseau.
static func style_soil() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Palette.SOIL
	s.set_border_width_all(2)
	s.border_color = Palette.SOIL_DEEP
	s.set_corner_radius_all(0)
	s.shadow_color = Palette.SOIL_DEEP
	s.shadow_offset = Vector2(0, 4)
	s.shadow_size = 0
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s


static func style_empty() -> StyleBoxEmpty:
	return StyleBoxEmpty.new()


## Un panneau qui porte un style et laisse passer ce qu'il ne couvre pas.
static func panel(style: StyleBox) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", style)
	return p


## UNE LEGENDE prete a poser : le texte dans sa pastille.
static func caption(text: String, danger: bool = false) -> PanelContainer:
	var p := panel(style_caption(danger))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := label(text, 13, Palette.CAPTION_DANGER_INK if danger else Palette.CAPTION_INK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wrapped(l)
	p.add_child(l)
	return p


# ── Le texte ─────────────────────────────────────────────────────────────────

## UN LABEL, dans la face du theme (I18N choisit la face selon la langue).
## `shadow` pose l'ombre d'un pixel que le bois demande sous la creme.
static func label(text: String, size: int = 13, color: Color = Palette.CREAM, shadow: bool = false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if shadow:
		l.add_theme_color_override("font_shadow_color", Palette.CREAM_SHADOW)
		l.add_theme_constant_override("shadow_offset_x", 0)
		l.add_theme_constant_override("shadow_offset_y", 1)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## Un titre de panneau (PanelTitle : 2,5 cellules = 20px), en capitales la
## ou le web crie.
static func title(text: String, size: int = 20, color: Color = Palette.INK) -> Label:
	var l := label(I18N.shout(text), size, color)
	l.uppercase = I18N.pixel_face()
	return l


## Un texte a la taille du kit : BitmapText scale 1.25 -> 10px, 2 -> 16px.
static func pixel_size(scale: float) -> int:
	return int(round(CELL * scale))


## Un paragraphe qui va a la ligne.
static func note(text: String, color: Color = Palette.CHALK_DIM, size: int = 12) -> Label:
	var l := wrapped(label(text, size, color))
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


## UNE LIGNE QUI SE REPLIE, et qui le dit a son conteneur. Godot 4.7 garde
## le minimum d'un libelle replie tel qu'il l'a mesure la premiere fois : pose
## avant d'avoir sa largeur, il se mesure sur 1 px (une lettre par ligne), et
## tout ce qui epouse son contenu restait geant une fois la largeur venue (les
## cartes du terrier, 2026-09-23). Il redemande donc son minimum a chaque
## taille. Tout libelle replie passe par ici.
static func wrapped(l: Label) -> Label:
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.resized.connect(l.update_minimum_size)
	return l


# ── Les commandes ────────────────────────────────────────────────────────────

## UN BOUTON SUR PLANCHE. "wood", "gold", "green", "danger", "blue" — l'or a
## l'action principale, le rouge au danger, comme le README du kit le dit.
static func button(text: String, tone: String = "wood", width: float = 0.0, height: float = 44.0) -> PlankButton:
	var b: PlankButton = preload("res://scenes/plank_button.tscn").instantiate()
	b.board = PlankButton.tone_board(tone)
	b.custom_minimum_size = Vector2(width, height)
	b.relabel(text)
	return b


## UN EMOJI EN COULEUR, par la face emoji du systeme : la face pixel n'en a
## pas, et le web s'en remet a celle du telephone pour les sortes sans
## sprite.
static var _emoji_font: SystemFont

static func emoji(text: String, size: int) -> Label:
	if _emoji_font == null:
		_emoji_font = SystemFont.new()
		_emoji_font.font_names = PackedStringArray(["Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji"])
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", _emoji_font)
	l.add_theme_font_size_override("font_size", size)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## LE [x] — toujours DANS son panneau, en haut a droite, a la marge du
## contenu (close_button.gd).
static func close_button() -> CloseButton:
	return CloseButton.new()


## Une image a une hauteur donnee, largeur au ratio, filtree au pixel pres.
static func icon(tex: Texture2D, height: float) -> TextureRect:
	var r := TextureRect.new()
	r.texture = tex
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	var w := height * float(tex.get_width()) / maxf(1.0, float(tex.get_height()))
	r.custom_minimum_size = Vector2(w, height)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


## Le carre d'une icone du rail, calcule sur la hauteur de l'ecran.
static func icon_square(view_height: float) -> float:
	return clampf(view_height * ICON_VH, ICON_MIN, ICON_MAX)


# ── La mise en page ──────────────────────────────────────────────────────────

static func vbox(gap: float = PAD_TIGHT) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", int(gap))
	return v


static func hbox(gap: float = PAD_TIGHT) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", int(gap))
	return h


static func margin(left: float, top: float, right: float, bottom: float) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", int(left))
	m.add_theme_constant_override("margin_top", int(top))
	m.add_theme_constant_override("margin_right", int(right))
	m.add_theme_constant_override("margin_bottom", int(bottom))
	return m


static func spacer() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.size_flags_vertical = Control.SIZE_EXPAND_FILL
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


## Pose un enfant sur tout le rectangle de son parent.
static func fill(node: Control) -> Control:
	node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return node
