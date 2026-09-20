@tool
extends Button
class_name PxButton
## THE KIT'S BUTTON: a flat face over a hard shadow, square corners, no bevel
## gradient — the web client's PxButton (src/components/px.tsx), as a Godot
## theme rather than a nine-slice.
##
## Drawn with StyleBoxFlat rather than the kit's PNG because the web version's
## slab is a solid fill plus one offset shadow, and both are exactly what a
## flat stylebox gives — with the press state coming free as a content margin
## shift. Bringing the PNG in would mean matching its slice insets to the
## font's metrics for no visual gain.
##
## PRESSED MEANS MOVED, not tinted. The face drops onto its own shadow, which is
## what makes a pixel slab feel like a physical key.

## How far the face sinks when pressed, and therefore how tall the shadow is.
const DROP := 4

@export var face: Color = Color("#ff8c42"):
	set(value):
		face = value
		_restyle()

@export var shadow: Color = Color("#a8521c"):
	set(value):
		shadow = value
		_restyle()

@export var ink: Color = Color("#2a1206"):
	set(value):
		ink = value
		_restyle()

## The front door wiggles. Only the primary action takes this — a screen where
## everything moves has no primary action.
@export var wiggle: bool = false

var _wiggle_time := 0.0


func _ready() -> void:
	_restyle()
	set_process(wiggle)
	if not Engine.is_editor_hint():
		# The kit's slabs are pressed, not hovered: a pointer is not a promise.
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND


func _process(delta: float) -> void:
	if not wiggle:
		return
	# A slow lean, not a shake: ±1.5° at a third of a hertz. The pivot is the
	# slab's middle so it rocks rather than swings off its corner.
	_wiggle_time += delta
	pivot_offset = size * 0.5
	rotation = deg_to_rad(sin(_wiggle_time * 2.0) * 1.5)


func _restyle() -> void:
	# NORMAL: the face lifted DROP pixels off the bottom, with the shadow
	# showing underneath as the stylebox's own offset shadow.
	var normal := StyleBoxFlat.new()
	normal.bg_color = face
	normal.set_corner_radius_all(0)
	normal.shadow_color = shadow
	normal.shadow_size = 0
	normal.shadow_offset = Vector2(0, DROP)
	normal.content_margin_left = 14
	normal.content_margin_right = 14
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8 + DROP
	# A one-pixel hard line, the way every block on this screen is cut.
	normal.border_color = shadow
	normal.set_border_width_all(2)

	# PRESSED: the same slab, DROP lower. The margins carry the label down with
	# the face, so the whole key moves as one piece.
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.shadow_offset = Vector2.ZERO
	pressed.content_margin_top = 8 + DROP
	pressed.content_margin_bottom = 8

	# HOVER and FOCUS reuse the normal face: the crown outline below is the only
	# focus affordance, so a keyboard walk is visible without a colour change
	# that would read as a second state.
	var focus := StyleBoxFlat.new()
	focus.draw_center = false
	focus.set_corner_radius_all(0)
	focus.border_color = Color("#ffd45c")
	focus.set_border_width_all(2)
	focus.expand_margin_bottom = DROP

	add_theme_stylebox_override("normal", normal)
	add_theme_stylebox_override("hover", normal)
	add_theme_stylebox_override("pressed", pressed)
	add_theme_stylebox_override("focus", focus)
	add_theme_stylebox_override("disabled", normal)

	add_theme_color_override("font_color", ink)
	add_theme_color_override("font_hover_color", ink)
	add_theme_color_override("font_pressed_color", ink)
	add_theme_color_override("font_focus_color", ink)
	# Disabled is the one place the ink gives way: a slab you cannot press has
	# to say so without moving.
	add_theme_color_override("font_disabled_color", Color(ink, 0.45))
