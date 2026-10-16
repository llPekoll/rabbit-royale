class_name LoreCodex
extends Dialog
## L'ETAGERE DES TROIS LIVRES (2026-10-15, le soir) — ce qui reste du codex.
##
## Les cinq chapitres a vie (« The Island That Gives »...) racontaient l'ancien
## lore et contredisaient les livres ; le user : « supprimer le recueil, mettre
## juste les 3 livres a la place, disponibles seulement quand on les a deja
## vus, sinon un lock et grise ». Un livre lu se rouvre en le touchant ; un
## livre a venir est gris, sous un cadenas, avec l'etape qui l'ouvre (BURY,
## RAID — LevelSkip, Chrome.maybe_books).
##
## Garde son nom et sa porte (`LoreCodex.open`, le bouton d'histoire de la
## barre du haut) : rien d'autre n'a a changer.

const BOOKS := ["shiro", "kuro", "sea"]
## La couverture : la premiere image de `open` du livre peint, recadree sur
## le livre ferme (`cover_view` du book.json).
const COVER_DIR := "res://assets/intro/book/shiro/"
const CARD_W := 210.0
const GREY := Color(0.42, 0.4, 0.38, 0.85)

## FAUX DANS UN BANC : un banc ne pose rien (garde pour les bancs).
var read_marks := true

var _row: HBoxContainer
## La couverture recadree, et ce que le book.json dit d'elle.
var _crop := Rect2()
var _quad: Array = []


## OUVRIR L'ETAGERE sur le chrome.
static func open() -> LoreCodex:
	var codex := LoreCodex.new()
	Chrome.current.open(codex)
	return codex


func _init() -> void:
	super("", 720.0, 0.0)
	go_fullscreen()


func _ready() -> void:
	ink_title()
	var header := title_label.get_parent()
	var icon := Kit.icon(Kit.SCROLL, 26.0)
	header.add_child(icon)
	header.move_child(icon, 0)
	set_title(I18N.t("codex.title"))
	var center := CenterContainer.new()
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(center)
	_row = Kit.hbox(Kit.PAD * 2.0)
	_row.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(_row)
	_fill()
	I18N.locale_changed.connect(func(_c: String) -> void: _fill())
	Home.changed.connect(_fill)


func _fill() -> void:
	if not is_inside_tree():
		return
	for old in _row.get_children():
		old.queue_free()
	var cover := _cover()
	for which in BOOKS:
		_row.add_child(_card(which, cover))


## Un livre de l'etagere : sa couverture, son titre, et — s'il n'est pas
## encore lu — le cadenas et l'etape qui l'ouvre.
func _card(which: String, cover: Texture2D) -> Control:
	var look: Dictionary = IntroBook.BOOKS[which]
	var open := IntroBook.seen(which)
	var card := Kit.vbox(4)
	card.custom_minimum_size = Vector2(CARD_W, 0)
	card.mouse_filter = Control.MOUSE_FILTER_STOP if open else Control.MOUSE_FILTER_IGNORE
	var pic := TextureRect.new()
	pic.texture = cover
	var cover_h := CARD_W * (_crop.size.y / _crop.size.x if _crop.size.x > 0.0 else 0.75)
	pic.custom_minimum_size = Vector2(CARD_W, cover_h)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_SCALE
	pic.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(pic)
	if not _quad.is_empty():
		pic.add_child(_face(look))
	var title := Kit.label(I18N.t(String(look.title)), 15, Palette.INK if open else Palette.BARK)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_shadow_color", Color.TRANSPARENT)
	title.add_theme_constant_override("shadow_offset_y", 2)
	Kit.wrapped(title)
	card.add_child(title)
	var sub := Kit.label(I18N.t(String(look.sub)) if open else I18N.t("codex.locked." + which), 11, Palette.BARK)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Kit.wrapped(sub)
	card.add_child(sub)
	I18N.apply_face([title, sub])
	if open:
		card.gui_input.connect(func(event: InputEvent) -> void:
			var tap: bool = (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT) \
				or (event is InputEventScreenTouch and event.pressed)
			if tap:
				close_requested()
				IntroBook.play_on(Chrome.current, which))
		card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	else:
		pic.modulate = GREY
		var lock := _Lock.new()
		lock.set_anchors_preset(Control.PRESET_FULL_RECT)
		pic.add_child(lock)
	return card


func _cover() -> Texture2D:
	var tex: Texture2D = load(COVER_DIR + "open.webp") if ResourceLoader.exists(COVER_DIR + "open.webp") else null
	if tex == null:
		return Kit.SCROLL
	var spec: Variant = IntroBook._read_json(COVER_DIR + "book.json")
	var frame := Vector2(640, 431)
	var crop := Rect2(Vector2.ZERO, frame)
	if spec is Dictionary:
		var fs: Array = spec.get("frame", [640, 431])
		frame = Vector2(float(fs[0]), float(fs[1]))
		var cv: Array = spec.get("cover_view", [])
		crop = Rect2(float(cv[0]), float(cv[1]), float(cv[2]), float(cv[3])) if cv.size() == 4 else Rect2(Vector2.ZERO, frame)
		var quads: Array = spec.get("cover_quads", [])
		_quad = quads[0] if not quads.is_empty() and quads[0] is Array else []
	_crop = crop
	var atlas := AtlasTexture.new()
	atlas.atlas = tex
	atlas.region = crop
	return atlas


## LA FACE DE LA COUVERTURE, comme dans le livre (IntroBook `_build_face`) :
## le logo, le titre et sa ligne a plat, projetes sur les coins du cuir.
func _face(look: Dictionary) -> Control:
	var view := SubViewport.new()
	view.transparent_bg = true
	view.size = IntroBook.FACE_SIZE
	view.render_target_update_mode = SubViewport.UPDATE_ONCE
	var fs := Vector2(IntroBook.FACE_SIZE)
	var logo := TextureRect.new()
	logo.texture = IntroBook.LOGO
	logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	logo.size = Vector2(210, 210)
	logo.position = Vector2((fs.x - 210) * 0.5, 46)
	logo.self_modulate = Color(1.0, 0.93, 0.8, 0.96)
	view.add_child(logo)
	var title := Kit.label(I18N.t(String(look.title)), 46, look.ink)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_color_override("font_shadow_color", look.edge)
	title.add_theme_constant_override("shadow_offset_y", 3)
	title.position = Vector2(24, 270)
	title.size = Vector2(fs.x - 48, 0)
	view.add_child(title)
	var sub := Kit.label(I18N.t(String(look.sub)), 24, Palette.PARCHMENT)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_color_override("font_shadow_color", look.edge)
	sub.add_theme_constant_override("shadow_offset_y", 2)
	sub.size = Vector2(fs.x - 64, 0)
	view.add_child(sub)
	I18N.apply_face([title, sub])
	(func() -> void:
		sub.position = Vector2(32, 270 + title.get_minimum_size().y + 10)
		view.render_target_update_mode = SubViewport.UPDATE_ONCE).call_deferred()
	var face := TextureRect.new()
	face.add_child(view)
	face.texture = view.get_texture()
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	face.stretch_mode = TextureRect.STRETCH_SCALE
	face.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = Shader.new()
	mat.shader.code = IntroBook.FACE_SHADER
	mat.set_shader_parameter("frame", _crop.size)
	mat.set_shader_parameter("hinv", IntroBook.face_hinv(_quad, _crop.position))
	face.material = mat
	return face


## LE CADENAS, dessine : un anneau et un corps, a l'encre du parchemin.
class _Lock extends Control:
	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		# Sous le titre de la couverture, pas dessus : on lit ce qu'on attend.
		var c := Vector2(size.x * 0.5, size.y * 0.84)
		var w := 34.0
		var h := 28.0
		var ink := Palette.INK
		var gold := Palette.GOLD
		# L'anneau : trois traits epais.
		var top := c.y - h * 0.5
		draw_rect(Rect2(c.x - w * 0.32, top - 18.0, 6.0, 20.0), ink)
		draw_rect(Rect2(c.x + w * 0.32 - 6.0, top - 18.0, 6.0, 20.0), ink)
		draw_rect(Rect2(c.x - w * 0.32, top - 22.0, w * 0.64, 6.0), ink)
		# Le corps, cerne, et le trou de la serrure.
		var body := Rect2(c.x - w * 0.5, top, w, h)
		draw_rect(body.grow(3.0), ink)
		draw_rect(body, gold)
		draw_rect(Rect2(c.x - 3.0, c.y - 6.0, 6.0, 12.0), ink)
