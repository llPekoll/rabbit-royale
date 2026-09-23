class_name PlayerChip
extends Button
## LA PUCE DU JOUEUR, au bord gauche de la barre : sa tete et son nom, et
## elle ouvre son panneau. Porte de src/components/wallet-button.tsx :
##
##   • ELLE OUVRE, ELLE NE DECONNECTE PAS. Elle deconnectait au clic — la
##     chose la plus destructrice qu'elle puisse faire et celle qu'on voulait
##     le moins ; se deconnecter vit dans le panneau, ou ca demande un second
##     geste.
##   • ELLE EST EN BOIS. Le code web lui donne des couleurs de dalle sombre,
##     mais le skin woodland intercepte chaque bouton du kit et peint une
##     planche a la place (plank_button.gd raconte la meme chose de
##     l'accueil) : ce qu'un joueur voit est une planche brune a l'encre
##     creme.
##   • LE NOM EST LA SEULE PARTIE QUI CEDE : sur un ecran etroit la puce
##     grandissait jusqu'a heurter la pastille centree a cote d'elle. Le nom
##     se coupe ; la tete garde sa taille — une marque a moitie dessinee se
##     lit comme un bug, un nom raccourci comme un nom long.
##   • PAS DE TAG « INVITE » (Paul, 2026-09-21) : il prenait un tiers de la
##     puce et le nom payait (« Sil... »). L'etat se dit la ou la puce mene.
##   • LA TETE EST LA PREMIERE IMAGE DE REPOS de la feuille du lapin,
##     recadree a son encre : x8 y18, 14x14 dans le cadre 0 (`.rr-wallet-
##     face`). Doublee ici : la puce fait 44 px de haut pour un pouce, et
##     14 px de tete y tenaient comme un point.

## La hauteur de la puce (`chip.height`), et l'air du libelle : le pad serre
## au-dessus, le pad plein sur les cotes.
const HEIGHT := 44.0
const FACE_CROP := Rect2(8, 18, 14, 14)
const FACE_SCALE := 2.0
const FONT := 12
const PRESS_Y := 2.0
const PRESS_DIM := 0.97

var _cast: NineSlice
var _plank: NineSlice
var _row: HBoxContainer
var _face: TextureRect
var _name: Label
## LE NIVEAU DU LAPIN (1 a 10, 2026-09-23), avant le nom : il ne se coupe pas.
var _level: Label
var _held := false


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	flat = true
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		add_theme_stylebox_override(state, StyleBoxEmpty.new())
	add_theme_font_size_override("font_size", 1)
	add_theme_color_override("font_color", Color(0, 0, 0, 0))
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	custom_minimum_size = Vector2(0.0, HEIGHT)
	clip_contents = false

	# L'ombre sur l'eau : la planche en silhouette, cinq pixels plus bas.
	_cast = Kit.plank("wood")
	_cast.material = Stencil.material(Stencil.CAST_INK)
	Kit.fill(_cast)
	_cast.offset_top = Stencil.CAST_DROP
	_cast.offset_bottom = Stencil.CAST_DROP
	add_child(_cast)

	_plank = Kit.plank("wood")
	Kit.fill(_plank)
	add_child(_plank)

	_row = Kit.hbox(5.0)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(_row)

	_face = TextureRect.new()
	_face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_face.stretch_mode = TextureRect.STRETCH_SCALE
	_face.custom_minimum_size = FACE_CROP.size * FACE_SCALE
	_face.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_row.add_child(_face)

	_level = Kit.label("", FONT, Palette.CREAM, true)
	_level.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_level.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_row.add_child(_level)

	# Or de la couronne pour un joueur connecte (`CROWN`), l'ombre d'un pixel
	# que le bois demande sous une encre claire.
	_name = Kit.label("", FONT, Palette.RANK_GOLD, true)
	_name.clip_text = true
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_row.add_child(_name)

	button_down.connect(func() -> void: _held = true; _relook())
	button_up.connect(func() -> void: _held = false; _relook())
	mouse_entered.connect(_relook)
	mouse_exited.connect(_relook)
	resized.connect(_place)


func _ready() -> void:
	refresh()
	_place()


## Relit le joueur : Session le nomme, le terrier (/api/burrow) porte sa
## tete choisie ; sans choix, le lapin brun (avatars.ts DEFAULT_AVATAR).
func refresh() -> void:
	# `str` et pas `String()` : un invite porte `null` pour son avatar et son
	# wallet, et `String(null)` arrete le script.
	var name := str(Session.player.get("name", ""))
	_name.text = name
	# Lu sur /api/burrow (`player.level`), recopie par RunState a la fin d'une
	# manche. Sans terrier encore : rien, plutot qu'un « 1 » faux.
	var level: Variant = Home.player.get("level")
	_level.visible = level != null
	_level.text = I18N.f("rabbitLevel.badge", [int(level)]) if level != null else ""
	var picked: Variant = Home.player.get("avatar", Session.player.get("avatar"))
	var key := "brown" if picked == null else str(picked)
	var sheet: Texture2D = Kit.AVATARS.get(key, Kit.AVATARS["brown"])
	var crop := AtlasTexture.new()
	crop.atlas = sheet
	crop.region = FACE_CROP
	_face.texture = crop
	tooltip_text = I18N.t("auth.guestNote") if bool(Session.player.get("guest", false)) \
		else str(Session.player.get("wallet", "") if Session.player.get("wallet") != null else "")
	_fit()


## La largeur maximale que la barre lui concede : jusqu'a la pastille, pas
## un cinquieme de la barre.
func set_max_width(w: float) -> void:
	custom_minimum_size.x = 0.0
	_fit(w)


func _fit(cap: float = -1.0) -> void:
	var inset := Kit.PLANK_CAP + 8.0
	var font := _name.get_theme_font("font")
	var text_w := font.get_string_size(_name.text, HORIZONTAL_ALIGNMENT_LEFT, -1, FONT).x
	var wanted := inset * 2.0 + _face.custom_minimum_size.x + 5.0 + text_w
	if _level.visible:
		wanted += 5.0 + font.get_string_size(_level.text, HORIZONTAL_ALIGNMENT_LEFT, -1, FONT).x
	var w := wanted if cap < 0.0 else minf(wanted, cap)
	w = maxf(w, inset * 2.0 + _face.custom_minimum_size.x)
	size = Vector2(round(w), HEIGHT)
	_place()


func _place() -> void:
	var inset := Kit.PLANK_CAP + 8.0
	_row.position = Vector2(inset, 0.0)
	_row.size = Vector2(maxf(0.0, size.x - inset * 2.0), size.y)
	_name.custom_minimum_size.x = 0.0
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_relook()


## La presse : la planche et son contenu s'enfoncent de 2 px sur l'ombre,
## qui ne bouge pas, et la face s'assombrit d'un rien.
func _relook() -> void:
	var dy := PRESS_Y if _held else 0.0
	_plank.offset_top = dy
	_plank.offset_bottom = dy
	_row.position.y = dy
	_cast.offset_top = Stencil.CAST_DROP - dy
	_cast.offset_bottom = Stencil.CAST_DROP - dy
	var tint := PRESS_DIM if _held else (1.1 if is_hovered() else 1.0)
	_plank.tint = Color(tint, tint, tint)
