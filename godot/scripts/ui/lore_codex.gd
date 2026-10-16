class_name LoreCodex
extends Dialog
## The three storybooks, in a woodland library matching the shop.
## Dialog keeps the Chrome/close/Escape contract; the library supplies its art.

const BOOKS := ["shiro", "kuro", "sea"]
const COVER_DIR := "res://assets/intro/book/shiro/"
const DESIGN := Vector2(1280, 720)
const CARD_W := 332.0
const BACKDROP := preload("res://assets/ui/story-library/library-backdrop.png")
const LOCK := preload("res://assets/ui/story-library/brass-lock.png")
const SEALED_SHADER := """
shader_type canvas_item;
void fragment() {
	vec4 c = COLOR;
	float grey = dot(c.rgb, vec3(0.299, 0.587, 0.114));
	COLOR = vec4(mix(vec3(grey), c.rgb, 0.18) * 0.72, c.a);
}
"""

## Kept for existing offline benches; this screen writes no read marks.
var read_marks := true
var _board: Control
var _queued := false
var _crop := Rect2()
var _quad: Array = []


static func open() -> LoreCodex:
	var codex := LoreCodex.new()
	Chrome.current.open(codex)
	return codex


func _init() -> void:
	super("", 0.0, 0.0)
	go_fullscreen()
	_frame.hide()
	_inset.hide()
	close_button.hide()
	clip_contents = true


func _ready() -> void:
	var bg := ForestShopStyle.picture(BACKDROP, false)
	bg.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	Kit.fill(bg)
	add_child(bg)
	_board = Control.new()
	_board.name = "Library"
	_board.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_board.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_board.size = DESIGN
	add_child(_board)
	resized.connect(_layout)
	_fill()
	_layout()
	I18N.locale_changed.connect(func(_c: String) -> void: _queue_fill())
	Home.changed.connect(_queue_fill)
	get_window().focus_entered.connect(_queue_fill)


func _layout() -> void:
	if _board == null:
		return
	var k := minf(size.x / DESIGN.x, size.y / DESIGN.y)
	_board.scale = Vector2.ONE * k
	_board.position = ((size - DESIGN * k) * 0.5).floor()


func _queue_fill() -> void:
	if _queued:
		return
	_queued = true
	_fill.call_deferred()


func _seen(which: String) -> bool:
	return IntroBook.seen(which) or _reached(which)


func _put(node: Control, rect: Rect2, parent: Control = null) -> Control:
	node.position = rect.position
	node.size = rect.size
	(parent if parent != null else _board).add_child(node)
	return node


func _words(value: String, rect: Rect2, px: int, color: Color = ForestShopStyle.CREAM, parent: Control = null, wrap := false) -> Label:
	var label := ForestShopStyle.words(value, px, color)
	var font := ThemeDB.get_project_theme().default_font
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.text_overrun_behavior = TextServer.OVERRUN_NO_TRIMMING
		label.add_theme_constant_override("line_spacing", 0)
		while px > 12 and font.get_multiline_string_size(value, HORIZONTAL_ALIGNMENT_CENTER, rect.size.x, px).y > rect.size.y:
			px -= 1
	else:
		while px > 12 and font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x > rect.size.x:
			px -= 1
	label.add_theme_font_size_override("font_size", px)
	_put(label, rect, parent)
	return label


func _fill() -> void:
	_queued = false
	if not is_inside_tree():
		return
	var focused := ""
	var owner := get_viewport().gui_get_focus_owner()
	if owner != null and _board.is_ancestor_of(owner):
		focused = String(owner.name)
	for old in _board.get_children():
		_board.remove_child(old)
		old.queue_free()
	_words(I18N.t("codex.title"), Rect2(290, 28, 700, 76), 34)
	_words(I18N.t("codex.libraryHint"), Rect2(220, 122, 840, 36), 18)
	var close := TextureButton.new()
	close.name = "CloseLibrary"
	close.texture_normal = ForestShopStyle.texture("close")
	close.ignore_texture_size = true
	close.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	close.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	close.tooltip_text = I18N.t("codex.close")
	close.focus_entered.connect(func() -> void: close.modulate = Color(1.25, 1.25, 1.25))
	close.focus_exited.connect(func() -> void: close.modulate = Color.WHITE)
	_put(close, Rect2(1176, 28, 64, 64))
	close.pressed.connect(close_requested)
	var cover := _cover()
	var discovered := 0
	for i in BOOKS.size():
		var which: String = BOOKS[i]
		_put(_card(which, cover), Rect2(130 + i * 344, 174, CARD_W, 414))
		if _seen(which):
			discovered += 1
	_put(ForestShopStyle.panel("tab-off", 18), Rect2(410, 615, 460, 56))
	_words(I18N.f("codex.discovered", [discovered, BOOKS.size()]), Rect2(432, 620, 416, 44), 20)
	if not focused.is_empty():
		var next := _board.find_child(focused, true, false) as Control
		if next != null and next.focus_mode != Control.FOCUS_NONE:
			next.grab_focus()


func _card(which: String, cover: Texture2D) -> Control:
	var look: Dictionary = IntroBook.BOOKS[which]
	var open := _seen(which)
	var card := Button.new()
	card.name = "Book_" + which
	card.disabled = not open
	card.focus_mode = Control.FOCUS_ALL if open else Control.FOCUS_NONE
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if open else Control.CURSOR_ARROW
	for state in ["normal", "hover", "pressed", "disabled"]:
		card.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	var focus := StyleBoxFlat.new()
	focus.bg_color = Color.TRANSPARENT
	focus.border_color = ForestShopStyle.CREAM
	focus.set_border_width_all(3)
	card.add_theme_stylebox_override("focus", focus)
	_put(ForestShopStyle.panel("panel", 28), Rect2(0, 0, CARD_W, 414), card)
	_put(ForestShopStyle.panel("nameplate", 16), Rect2(10, 12, CARD_W - 20, 64), card)
	_words(I18N.t(String(look.title)), Rect2(28, 17, CARD_W - 56, 54), 21, ForestShopStyle.INK, card, true)
	var pedestal := ForestShopStyle.picture(ForestShopStyle.texture("pedestal"))
	_put(pedestal, Rect2(30, 223, CARD_W - 60, 88), card)
	var cover_w := CARD_W - 44
	var cover_h := cover_w * (_crop.size.y / _crop.size.x if _crop.size.x > 0.0 else 0.75)
	var pic := ForestShopStyle.picture(cover, false)
	pic.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_put(pic, Rect2(22, 84, cover_w, cover_h), card)
	if not _quad.is_empty():
		pic.add_child(_face(look))
	var hint := I18N.t(String(look.sub)) if open else I18N.t("codex.locked." + which)
	_words(hint, Rect2(28, 293, CARD_W - 56, 47), 16, ForestShopStyle.CREAM, card, true)
	card.tooltip_text = I18N.t(String(look.title)) + "\n" + hint
	_put(ForestShopStyle.panel("action" if open else "tab-off", 18), Rect2(18, 347, CARD_W - 36, 52), card)
	_words(I18N.t("codex.reread" if open else "codex.undiscovered"), Rect2(38, 351, CARD_W - 76, 44), 21,
		ForestShopStyle.CREAM if open else ForestShopStyle.MUTED, card)
	if open:
		card.pressed.connect(_read.bind(which))
		card.mouse_entered.connect(func() -> void: card.modulate = Color(1.1, 1.1, 1.1))
		card.mouse_exited.connect(func() -> void: card.modulate = Color.WHITE)
	else:
		var mat := ShaderMaterial.new()
		mat.shader = Shader.new()
		mat.shader.code = SEALED_SHADER
		pic.material = mat
		# The projected lettering uses its own shader; mute it separately.
		pic.modulate = Color(0.85, 0.85, 0.85)
		var lock := ForestShopStyle.picture(LOCK)
		lock.name = "Lock"
		# Project the leather cover's actual midpoint, excluding the pages.
		var center := pic.position + pic.size * 0.5
		if _quad.size() == 8 and _crop.size.x > 0.0 and _crop.size.y > 0.0:
			var point := IntroBook.face_hinv(_quad, _crop.position).inverse() * Vector3(0.5, 0.5, 1.0)
			center = pic.position + Vector2(point.x, point.y) / point.z / _crop.size * pic.size
		# A dark, opaque backing separates the brass from the cover lettering.
		var plate := _LockPlate.new()
		plate.name = "LockPlate"
		_put(plate, Rect2(center - Vector2(48, 48), Vector2(96, 96)), card)
		_put(lock, Rect2(center - Vector2(42, 42), Vector2(84, 84)), card)
	return card


func _read(which: String) -> void:
	if not _seen(which):
		return
	var host: Node = Chrome.current if is_instance_valid(Chrome.current) else self
	IntroBook.play_on(host, which)
	close_requested()


## L'ETAPE DEJA ATTEINTE ouvre son livre, lu ici ou non : un joueur de
## niveau 10 sur un appareil neuf n'a rien a debloquer (LevelSkip.stage).
func _reached(which: String) -> bool:
	if not Home.loaded():
		return false
	return LevelSkip.stage() >= BOOKS.find(which) + 1


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


## A small chamfered metal badge: solid contrast, with the lock kept upright.
class _LockPlate extends Control:
	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _octagon(inset: float, shift := Vector2.ZERO) -> PackedVector2Array:
		var box := Rect2(Vector2.ONE * inset + shift, size - Vector2.ONE * inset * 2.0)
		var a := box.position
		var b := box.end
		var cut := 16.0
		return PackedVector2Array([
			Vector2(a.x + cut, a.y), Vector2(b.x - cut, a.y),
			Vector2(b.x, a.y + cut), Vector2(b.x, b.y - cut),
			Vector2(b.x - cut, b.y), Vector2(a.x + cut, b.y),
			Vector2(a.x, b.y - cut), Vector2(a.x, a.y + cut),
		])

	func _draw() -> void:
		draw_colored_polygon(_octagon(-2.0, Vector2(0, 4)), Color(0.04, 0.025, 0.015, 0.7))
		draw_colored_polygon(_octagon(0.0), Color("#17110e"))
		draw_colored_polygon(_octagon(3.0), Color("#ead0a0"))
		draw_colored_polygon(_octagon(5.0), Color("#261c16"))
