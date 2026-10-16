extends "res://scripts/dig_sandbox.gd"
## LA MINI-CARTE D'UNE VRAIE PARTIE, SEULE, SUR FOND TRANSPARENT — pour le
## marketing (2026-10-02). Le bac a sable joue la manche (son pilote marche
## vers le coffre, jamais sur une bombe) ; on ne filme que la mini-carte, une
## seconde instance de `MiniMap` branchee sur la meme ile, agrandie dans un
## viewport transparent. Tout le reste tourne hors champ.
##
##   godot --path godot --fixed-fps 60 scenes/demo/minimap_alpha_bench.tscn -- \
##     --out=/tmp/frames --seconds=3 --size=1080 --seed=lv1:minimap-0 \
##     --clean --auto=40 --auto-every=0.7
##
## Deux choses que la mini-carte du jeu n'a pas, pour la video :
##   • LA VAGUE : une case que le front du plateau (`TileView.ripple`) n'a pas
##     encore atteinte reste enterree sur la carte aussi.
##   • LE BROUILLARD : ce qui est enterre et ne touche rien d'ouvert est dans
##     le noir ; quand une case en sort, son voile s'eleve et s'efface.
## Les PNG sortent PREMULTIPLIES : marketing/minimap-alpha.sh les repasse en
## alpha droit, comme fx-alpha.sh.

const DARK := Color(0.02, 0.05, 0.04, 0.85)
const LIFT_S := 0.6
const LIFT_UP := 0.9
const SETTLE_S := 0.6


class FilmMap extends MiniMap:
	## -> Dictionary : les cases que la vague n'a pas encore atteintes.
	var pending: Callable
	var _was_dark := {}
	var _lifted := {}
	var _now := 0.0

	func _process(delta: float) -> void:
		_now += delta
		queue_redraw()

	func _frame() -> void:
		pass

	## LE PLATEAU TEL QUE L'ECRAN LE MONTRE : les cases en attente du front
	## repassent enterrees le temps du dessin.
	func _draw() -> void:
		var board: IslandBoard = board_of.call() if board_of.is_valid() else null
		var held := {}
		if board != null and pending.is_valid():
			for c in pending.call():
				held[c] = board.state.get(c)
				board.state[c] = IslandBoard.State.BURIED
		super._draw()
		for c in held:
			board.state[c] = held[c]

	func _cell(board: IslandBoard, cell: Vector2i, at: Vector2) -> void:
		super._cell(board, cell, at)
		if not board.state.has(cell):
			return
		var dark: bool = board.state[cell] == IslandBoard.State.BURIED and not _on_edge(board, cell)
		if _was_dark.get(cell, true) and not dark:
			_lifted[cell] = _now
		_was_dark[cell] = dark
		var a := 1.0
		var up := 0.0
		if not dark:
			var u := clampf((_now - float(_lifted.get(cell, -INF))) / LIFT_S, 0.0, 1.0)
			if u >= 1.0:
				return
			a = cos(u * PI * 0.5)
			up = sin(u * PI * 0.5) * LIFT_UP * HALF_H
		_diamond(at - Vector2(0, up), Color(DARK, DARK.a * a), Color.TRANSPARENT, 1.0)


var _vp: SubViewport
var _out := ""
var _frame := 0
var _last := -1
var _skipped := 0


func _ready() -> void:
	super._ready()
	var args := _args()
	# macOS ne dessine pas une fenetre cachee (fx_alpha_bench.gd).
	get_window().always_on_top = true
	_out = args.get("out", "user://minimap")
	DirAccess.make_dir_recursive_absolute(_out)
	var seconds := float(args.get("seconds", "3"))
	var side := int(args.get("size", "1080"))

	_vp = SubViewport.new()
	_vp.size = Vector2i(side, side)
	_vp.transparent_bg = true
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_vp)
	var mini := FilmMap.new()
	mini.board_of = func() -> IslandBoard: return _island.local_run.board if _island.local_run != null else null
	mini.centre = _island._me_cell
	mini.pending = func() -> Array: return _island._tiles._ripple_draw.keys()
	mini.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_vp.add_child(mini)
	mini.scale = Vector2.ONE * (float(side) / mini.size.x)
	var lens := TextureRect.new()
	lens.texture = MiniMap.FRAME_TEX
	lens.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	lens.size = MiniMap.FRAME_TEX.get_size() * MiniMap.FRAME_SCALE
	lens.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	mini.add_child(lens)

	# LA FENETRE NE MONTRE QUE LA CARTE, par-dessus la partie qui tourne.
	var layer := CanvasLayer.new()
	layer.layer = 100
	add_child(layer)
	var bg := ColorRect.new()
	bg.color = Color(0.1, 0.1, 0.12)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(bg)
	var shown := TextureRect.new()
	shown.texture = _vp.get_texture()
	shown.set_anchors_preset(Control.PRESET_FULL_RECT)
	shown.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shown.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	layer.add_child(shown)

	await get_tree().create_timer(SETTLE_S).timeout
	RenderingServer.frame_post_draw.connect(_grab)
	await get_tree().create_timer(seconds).timeout
	RenderingServer.frame_post_draw.disconnect(_grab)
	print("[minimap] %d images dans %s" % [_frame, _out])
	if _skipped > 0:
		push_error("[minimap] %d images sautees" % _skipped)
	get_tree().quit(1 if _skipped > 0 else 0)


func _grab() -> void:
	var now := Engine.get_process_frames()
	if _last >= 0:
		_skipped += now - _last - 1
	_last = now
	_vp.get_texture().get_image().save_png("%s/%04d.png" % [_out, _frame])
	_frame += 1
