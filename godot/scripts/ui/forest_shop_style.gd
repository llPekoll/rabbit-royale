class_name ForestShopStyle
## Woodland shop pieces, composed like CampStyle. Source PNGs stay intact;
## AtlasTexture regions and NineSlice preserve their corners at any size.
const WOOD := Color("#43291e")
const OAK := Color("#a66735")
const GOLD := Color("#edbd62")
const GREEN := Color("#427842")
const CREAM := Color("#f3dfb0")
const INK := Color("#24180f")
const MUTED := Color("#ceb58b")
const BACKDROP := preload("res://assets/ui/shop-forest/stall-backdrop.png")
const UI := preload("res://assets/ui/shop-forest/forest-ui-kit.png")
const PACKS := preload("res://assets/ui/shop-forest/pack-illustrations.png")
const REGIONS := preload("res://assets/ui/shop-forest/atlas-regions.json")

static var _textures: Dictionary = {}


static func texture(key: String) -> AtlasTexture:
	if _textures.has(key):
		return _textures[key]
	var entry: Dictionary = REGIONS.data[key]
	var box: Array = entry["region"]
	var tex := AtlasTexture.new()
	tex.atlas = PACKS if entry["atlas"] == "pack-illustrations.png" else UI
	tex.region = Rect2(box[0], box[1], box[2], box[3])
	tex.filter_clip = true
	_textures[key] = tex
	return tex


static func panel(key: String, edge: float = 20.0) -> NineSlice:
	var tex := texture(key)
	var entry: Dictionary = REGIONS.data[key]
	var cut: Array = entry.get("slice", [0, 0, 0, 0])
	var source := Vector4i(cut[0], cut[1], cut[2], cut[3])
	var screen := Vector4.ONE * edge
	if source.y == 0:
		screen.y = 0
		screen.w = 0
	return NineSlice.make(tex, source, screen)


static func picture(tex: Texture2D, keep_aspect := true) -> TextureRect:
	var rect := TextureRect.new()
	rect.texture = tex
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED if keep_aspect else TextureRect.STRETCH_SCALE
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rect


static func words(value: String, px: int = 16, color: Color = CREAM) -> Label:
	var label := Kit.label(value, px, color, false)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	return label


static func button(value: String, face := "tab-off", px := 16) -> Button:
	var hit := Button.new()
	hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "disabled"]:
		hit.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	var focus := StyleBoxFlat.new()
	focus.bg_color = Color.TRANSPARENT
	focus.border_color = CREAM
	focus.set_border_width_all(2)
	hit.add_theme_stylebox_override("focus", focus)
	var skin := panel(face, 18)
	skin.name = "Face"
	Kit.fill(skin)
	hit.add_child(skin)
	var label := words(value, px)
	label.name = "Words"
	Kit.fill(label)
	label.offset_left = 14
	label.offset_right = -14
	hit.add_child(label)
	hit.mouse_entered.connect(func() -> void:
		if not hit.disabled:
			hit.modulate = Color(1.12, 1.12, 1.12))
	hit.mouse_exited.connect(func() -> void: hit.modulate = Color.WHITE)
	hit.button_down.connect(func() -> void: hit.modulate = Color(0.8, 0.8, 0.8))
	hit.button_up.connect(func() -> void: hit.modulate = Color.WHITE)
	return hit
