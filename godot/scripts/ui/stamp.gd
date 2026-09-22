class_name ScreenStamp
extends Control
## UN TAMPON PLEIN ECRAN — « quelque chose est arrive a ton terrier », dit
## une fois sur tout l'ecran, puis retire.
##
## C'est la grammaire commune de level-up-stamp.tsx et raided-stamp.tsx
## (globals.css `.rr-levelup`, `.rr-raided`) : les lumieres baissent, un
## eclat fleurit du milieu, le tampon claque comme celui de la victoire d'un
## raid (meme keyframe `rr-victory-stamp` — UNE grammaire pour « tu as fait
## la chose »), et il s'enleve une seconde plus tard. Les deux tampons ne
## different que par le ton (or ou rouge de danger) et par la duree ; ce
## fichier porte la mecanique, level_up_stamp.gd et raided_stamp.gd portent
## les mots.
##
## CE QUE LE WEB A APPRIS ET QU'ON GARDE :
##
##   • LES LUMIERES BAISSENT SOUS LE TAMPON. Il atterrissait sur le terrier
##     eclaire — de l'or sur de l'herbe et du sable au soleil, ou il n'avait
##     presque rien pour se detacher. Une vignette sombre monte en 180 ms,
##     tient, et s'enleve avec lui. Plus sombre aux bords qu'au milieu : le
##     lieu est assombri, pas noirci.
##   • L'ECLAT EST RETENU (Paul, 2026-09-16 : « the glow is too strong »).
##     Un coeur blanc pur a pleine opacite ecrasait le terrier — le tampon
##     s'annoncait en effacant ce qu'il felicitait. La lumiere fleurit
##     toujours du milieu, elle ne sature plus au blanc. Et en vmin, pas en
##     pourcentages : un degrade en pourcentages se mesure a la diagonale, et
##     le meme reglage etait invisible sur un bureau et aveuglant sur un
##     telephone.
##   • LE HALO DERRIERE LES LETTRES respire ; les ombres des glyphes eclairent
##     leurs bords, lui eclaire l'espace ou elles se tiennent.
##
## IL SE RETIRE LUI-MEME : pose par `Chrome.current.stamp(node)`, il attend
## sa duree et se libere. Rien n'a a le suivre.

## Le tampon a fini et va se liberer.
signal done

## Le keyframe `rr-victory-stamp` : 520 ms, un rebond (cubic-bezier
## 0.34, 1.56, 0.64, 1).
const SLAM_S := 0.52
## Le depart, `rr-levelup-out` : 400 ms, monte de 10 px en s'agrandissant.
const OUT_S := 0.4
## L'eclat, `rr-levelup-flash` : 1200 ms.
const FLASH_S := 1.2
## La respiration du halo : 900 ms aller, 900 ms retour.
const HALO_S := 0.9
## Le tampon : clamp(22px, 6vw, 44px), interlettrage 0.08em ; sa ligne du
## dessous a 0.42em, interlettrage 0.12em, 6px sous lui.
const FACE_MIN := 22.0
const FACE_MAX := 44.0
const FACE_VW := 0.06
const SPACING := 0.08
const SMALL_EM := 0.42
const SMALL_SPACING := 0.12
const SMALL_GAP := 6.0

## La vignette : rgba(8,6,4) de .5 au centre a .78 aux trois quarts.
const DIM_CORE := Color(8.0 / 255.0, 6.0 / 255.0, 4.0 / 255.0, 0.5)
const DIM_EDGE := Color(8.0 / 255.0, 6.0 / 255.0, 4.0 / 255.0, 0.78)

## Les ombres des lettres (globals.css `.rr-levelup-stamp`, `.rr-raided`).
const SHADOW_GOLD := Color("#7a3a10")
const SHADOW_DANGER := Color("#5a0f14")
## La ligne du dessous du tampon rouge (`.rr-raided small`).
const SMALL_DANGER := Color("#ffd9d4")

## Combien de temps le tampon reste, quand il commence a partir, et combien
## de temps la vignette tient — chaque tampon donne les siens.
var stay_s := 2.2
var out_at_s := 1.7
var dim_s := 2.1

## L'encre, son ombre, la ligne du dessous.
var ink := Palette.RANK_GOLD
var ink_shadow := SHADOW_GOLD
var small_ink := Palette.PILL_INK

## L'eclat et le halo : les paliers du degrade radial, du centre au bord.
var flash_stops: PackedColorArray = PackedColorArray([
	Color(1.0, 248.0 / 255.0, 214.0 / 255.0, 0.7),
	Color(1.0, 214.0 / 255.0, 92.0 / 255.0, 0.5),
	Color(1.0, 160.0 / 255.0, 40.0 / 255.0, 0.24),
	Color(1.0, 160.0 / 255.0, 40.0 / 255.0, 0.0),
])
## Les positions de ces paliers en vmin (0, 14, 32, 58) ramenees a 1.
var flash_offsets: PackedFloat32Array = PackedFloat32Array([0.0, 14.0 / 58.0, 32.0 / 58.0, 1.0])
var flash_vmin := 58.0
var halo_stops: PackedColorArray = PackedColorArray([
	Color(1.0, 214.0 / 255.0, 92.0 / 255.0, 0.38),
	Color(1.0, 160.0 / 255.0, 40.0 / 255.0, 0.14),
	Color(1.0, 160.0 / 255.0, 40.0 / 255.0, 0.0),
])

## Ce que le tampon dit : la grande ligne et la petite.
var headline := ""
var subline := ""

## VRAI DANS UN BANC SEULEMENT : le tampon reste, pour la capture.
var linger := false

var _dim: TextureRect
var _flash: TextureRect
var _halo: TextureRect
var _stamp: VBoxContainer
var _big: Label
var _small: Label
var _dim_tween: Tween


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	_build()
	resized.connect(_measure)
	_measure()
	# La choregraphie part APRES la premiere mise en page : le chrome pose le
	# tampon puis l'etire (`Chrome.stamp` : add_child, puis Kit.fill), et les
	# pivots des tweens doivent connaitre cette taille-la.
	_play.call_deferred()


## Pose les mots avant l'entree dans l'arbre (les deux tampons le font).
func set_words(big: String, small: String) -> void:
	headline = big
	subline = small
	if _big != null:
		_big.text = big
		_small.text = small


func _build() -> void:
	_dim = _radial(PackedColorArray([DIM_CORE, DIM_EDGE]), PackedFloat32Array([0.0, 0.75]))
	Kit.fill(_dim)
	add_child(_dim)

	_flash = _radial(flash_stops, flash_offsets)
	# ECRANEE sur la vignette, pour lire comme de la lumiere jetee sur la
	# scene et non comme une brume pale posee dessus. L'addition est le
	# `screen` du web dans un rendu qui n'a pas ce mode.
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_flash.material = add
	add_child(_flash)

	_halo = _radial(halo_stops, PackedFloat32Array([0.0, 0.45, 0.72]))
	add_child(_halo)

	_stamp = Kit.vbox(SMALL_GAP)
	_stamp.alignment = BoxContainer.ALIGNMENT_CENTER
	_stamp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_stamp)
	_big = Kit.label(headline, int(FACE_MAX), ink)
	_big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_shade(_big, ink_shadow, 3)
	_stamp.add_child(_big)
	_small = Kit.label(subline, int(FACE_MAX * SMALL_EM), small_ink)
	_small.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_shade(_small, ink_shadow, 2)
	_stamp.add_child(_small)


## Un degrade radial en texture, etire par son TextureRect : un cercle sur
## un carre, une ellipse sur l'ecran, comme `radial-gradient(ellipse ...)`.
func _radial(colors: PackedColorArray, offsets: PackedFloat32Array) -> TextureRect:
	var ramp := Gradient.new()
	ramp.offsets = offsets
	ramp.colors = colors
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 256
	tex.height = 256
	var rect := TextureRect.new()
	rect.texture = tex
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rect


## L'ombre dure d'un pixel-art : `0 3px 0 <ombre>`.
func _shade(label: Label, color: Color, drop: int) -> void:
	label.add_theme_color_override("font_shadow_color", color)
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", drop)


## L'interlettrage du web (`letter-spacing`), que Label n'a pas : une
## variation de la face du theme, avec un espace par glyphe.
func _spaced(px: int, em: float) -> Font:
	var base: Font = ThemeDB.get_project_theme().default_font if ThemeDB.get_project_theme() != null else ThemeDB.fallback_font
	var fv := FontVariation.new()
	fv.base_font = base
	fv.set_spacing(TextServer.SPACING_GLYPH, int(round(px * em)))
	return fv


## LA MISE EN PAGE, sur la taille du tampon lui-meme (une cellule de banc
## comme un ecran entier) : la face en 6vw bornee, l'eclat en vmin, le halo
## a -45% / -14% autour des lettres.
func _measure() -> void:
	var box := size
	var face := int(round(clampf(box.x * FACE_VW, FACE_MIN, FACE_MAX)))
	_big.add_theme_font_size_override("font_size", face)
	_big.add_theme_font_override("font", _spaced(face, SPACING))
	var small := int(round(face * SMALL_EM))
	_small.add_theme_font_size_override("font_size", small)
	_small.add_theme_font_override("font", _spaced(small, SMALL_SPACING))

	var vmin := minf(box.x, box.y) / 100.0
	var flash_d := flash_vmin * 2.0 * vmin
	_flash.size = Vector2(flash_d, flash_d)
	_flash.position = (box - _flash.size) * 0.5
	_flash.pivot_offset = _flash.size * 0.5

	var wanted := _stamp.get_combined_minimum_size()
	_stamp.size = wanted
	_stamp.position = ((box - wanted) * 0.5).floor()
	_stamp.pivot_offset = wanted * 0.5

	var halo_size := Vector2(wanted.x * 1.28, wanted.y * 1.9)
	_halo.size = halo_size
	_halo.position = _stamp.position + (wanted - halo_size) * 0.5
	_halo.pivot_offset = halo_size * 0.5


## LA CHOREGRAPHIE, dans l'ordre du CSS.
func _play() -> void:
	# La vignette : 0 -> 1 sur 9% de sa duree, tient jusqu'a 81%, s'eteint.
	_dim.modulate.a = 0.0
	_dim_tween = create_tween()
	_dim_tween.tween_property(_dim, "modulate:a", 1.0, dim_s * 0.09)
	if not linger:
		_dim_tween.tween_interval(dim_s * 0.72)
		_dim_tween.tween_property(_dim, "modulate:a", 0.0, dim_s * 0.19)

	# L'eclat : 0.6 -> 1 en 12%, tient a .9, puis s'efface en grandissant.
	_flash.modulate.a = 0.0
	_flash.scale = Vector2(0.6, 0.6)
	var flash := create_tween().set_parallel(true)
	flash.tween_property(_flash, "modulate:a", 1.0, FLASH_S * 0.12)
	flash.tween_property(_flash, "scale", Vector2.ONE, FLASH_S * 0.12)
	if not linger:
		flash.chain().tween_property(_flash, "modulate:a", 0.9, FLASH_S * 0.23)
		var out := flash.chain().set_parallel(true)
		out.tween_property(_flash, "modulate:a", 0.0, FLASH_S * 0.65)
		out.tween_property(_flash, "scale", Vector2(1.25, 1.25), FLASH_S * 0.65)

	# Le tampon claque : 2.6x et -8deg, retombe a .94 / 2deg, se pose.
	_stamp.modulate.a = 0.0
	_stamp.scale = Vector2(2.6, 2.6)
	_stamp.rotation_degrees = -8.0
	var slam := create_tween().set_parallel(true)
	slam.tween_property(_stamp, "modulate:a", 1.0, SLAM_S * 0.3)
	slam.tween_property(_stamp, "scale", Vector2(0.94, 0.94), SLAM_S * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	slam.tween_property(_stamp, "rotation_degrees", 2.0, SLAM_S * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	var settle := slam.chain().set_parallel(true)
	settle.tween_property(_stamp, "scale", Vector2(1.04, 1.04), SLAM_S * 0.2)
	settle.tween_property(_stamp, "rotation_degrees", -1.0, SLAM_S * 0.2)
	var rest := settle.chain().set_parallel(true)
	rest.tween_property(_stamp, "scale", Vector2.ONE, SLAM_S * 0.2)
	rest.tween_property(_stamp, "rotation_degrees", 0.0, SLAM_S * 0.2)

	# Le halo respire, aller-retour, tant que le tampon est la.
	_halo.modulate.a = 0.7
	_halo.scale = Vector2(0.94, 0.94)
	var breath := create_tween().set_loops()
	breath.set_parallel(true)
	breath.tween_property(_halo, "modulate:a", 1.0, HALO_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	breath.tween_property(_halo, "scale", Vector2(1.06, 1.06), HALO_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var back := breath.chain().set_parallel(true)
	back.tween_property(_halo, "modulate:a", 0.7, HALO_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	back.tween_property(_halo, "scale", Vector2(0.94, 0.94), HALO_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	if linger:
		return
	# Le depart, et la fin.
	var leave := create_tween()
	leave.tween_interval(out_at_s)
	var go := leave.chain().set_parallel(true)
	go.tween_property(_stamp, "modulate:a", 0.0, OUT_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	go.tween_property(_stamp, "scale", Vector2(1.15, 1.15), OUT_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	go.tween_property(_stamp, "position:y", -10.0, OUT_S).as_relative().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	go.tween_property(_halo, "modulate:a", 0.0, OUT_S)
	var end := leave.chain()
	end.tween_interval(maxf(0.0, stay_s - out_at_s - OUT_S))
	end.tween_callback(_finish)


func _finish() -> void:
	done.emit()
	queue_free()


## Pose le tampon sur l'etage des overlays du chrome quand il y en a un ; un
## banc le pose lui-meme.
static func mount(stamp: Control) -> void:
	if Chrome.current != null and is_instance_valid(Chrome.current):
		Chrome.current.stamp(stamp)
