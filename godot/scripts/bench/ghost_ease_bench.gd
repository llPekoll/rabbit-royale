extends Node2D
## LE BANC DE LA CHUTE DU X FANTOME : la case enseignee de la lecon, seule, et
## deux menus pour choisir la courbe (transition + ease) de sa chute.
##
##   godot --path godot scenes/bench/ghost_ease_bench.tscn
##
## La chute est celle du jeu (`TileView.ghost_fall`) ; la courbe retenue se
## recopie dans GHOST_TRANS / GHOST_EASE de tile_view.gd — la ligne a copier
## s'affiche sous les menus.

const ZOOM := 5.0
const GRASS := Color("#6fbf4a")
const GRASS_EDGE := Color("#4f9a35")
const TARGET := Color("#8fd65e")

const TRANS := {
	"LINEAR": Tween.TRANS_LINEAR, "SINE": Tween.TRANS_SINE, "QUINT": Tween.TRANS_QUINT,
	"QUART": Tween.TRANS_QUART, "QUAD": Tween.TRANS_QUAD, "EXPO": Tween.TRANS_EXPO,
	"ELASTIC": Tween.TRANS_ELASTIC, "CUBIC": Tween.TRANS_CUBIC, "CIRC": Tween.TRANS_CIRC,
	"BOUNCE": Tween.TRANS_BOUNCE, "BACK": Tween.TRANS_BACK, "SPRING": Tween.TRANS_SPRING,
}
const EASES := {
	"IN": Tween.EASE_IN, "OUT": Tween.EASE_OUT,
	"IN_OUT": Tween.EASE_IN_OUT, "OUT_IN": Tween.EASE_OUT_IN,
}

var _board := Node2D.new()
var _x := TileView.FlagMark.new()
var _tw: Tween
var _trans: OptionButton
var _ease: OptionButton
var _code: Label


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("#2a4a6b"))
	_board.scale = Vector2.ONE * ZOOM
	_board.draw.connect(_draw_ground)
	add_child(_board)
	_x.scale = TileView.X_SQUASH
	_board.add_child(_x)
	get_viewport().size_changed.connect(_center)
	_center()
	_build_ui()
	_replay()


func _center() -> void:
	_board.position = get_viewport_rect().size * Vector2(0.5, 0.6)


## Un carre de 3x3 cases d'herbe, celle du milieu plus claire : la case visee.
func _draw_ground() -> void:
	var hw := Iso.half_w()
	var hh := Iso.half_h()
	for c in range(-1, 2):
		for r in range(-1, 2):
			var at := Vector2((c - r) * hw, (c + r) * hh)
			var pts := PackedVector2Array([at + Vector2(0, -hh), at + Vector2(hw, 0),
				at + Vector2(0, hh), at + Vector2(-hw, 0)])
			_board.draw_colored_polygon(pts, TARGET if c == 0 and r == 0 else GRASS)
			pts.append(pts[0])
			_board.draw_polyline(pts, GRASS_EDGE, 1.0 / ZOOM)


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var box := VBoxContainer.new()
	box.position = Vector2(16, 16)
	layer.add_child(box)
	var row := HBoxContainer.new()
	box.add_child(row)
	_trans = _menu(row, "Transition", TRANS, TileView.GHOST_TRANS)
	_ease = _menu(row, "Ease", EASES, TileView.GHOST_EASE)
	_code = Label.new()
	box.add_child(_code)


func _menu(row: HBoxContainer, title: String, items: Dictionary, current: int) -> OptionButton:
	var label := Label.new()
	label.text = title
	row.add_child(label)
	var menu := OptionButton.new()
	for name in items:
		menu.add_item(name, items[name])
		if items[name] == current:
			menu.select(menu.item_count - 1)
	menu.item_selected.connect(func(_i: int) -> void: _replay())
	row.add_child(menu)
	return menu


func _replay() -> void:
	if _tw != null and _tw.is_valid():
		_tw.kill()
	var trans := _trans.get_selected_id()
	var ease := _ease.get_selected_id()
	_code.text = "const GHOST_TRANS := Tween.TRANS_%s\nconst GHOST_EASE := Tween.EASE_%s" % [
		_trans.get_item_text(_trans.selected), _ease.get_item_text(_ease.selected)]
	_tw = create_tween().set_loops()
	TileView.ghost_fall(_tw, _x, trans, ease)
