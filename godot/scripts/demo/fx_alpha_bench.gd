extends Node
## LES EFFETS SEULS, SUR FOND TRANSPARENT — pour le marketing, qui les pose sur
## ses propres plans. L'explosion (Blast) ou la foudre (LightningFx), jouees
## telles qu'en jeu, sans ile ni lapin, image par image dans un dossier de PNG.
##
##   godot --path godot --fixed-fps 60 scenes/demo/fx_alpha_bench.tscn -- \
##     --fx=explosion --out=/tmp/frames [--zoom=1]
##
## Le cadre est celui des rushes (marketing/capture.sh) : la vue de 854x480
## rendue en 1920x1080, au zoom de jeu (PLAY_TILE_PX). `--zoom=2` grossit.
## Les PNG sortent PREMULTIPLIES (le canvas de Godot melange ainsi sur un fond
## transparent) : marketing/fx-alpha.sh les repasse en alpha droit.

const VIEW := Vector2i(854, 480)
const FRAME := Vector2i(1920, 1080)
## Le pied de l'effet, en fraction de la vue : un peu sous le centre, pour que
## la foudre ait de la hauteur et que la fumee ne sorte pas par le haut.
const FOOT := Vector2(0.5, 0.62)
const TAIL_S := 0.4


## Un terrain qui n'a qu'une case, sans sol : `mount_veil` pose l'effet sur
## le pied, et c'est tout ce que Blast lui demande.
class FakeTerrain extends BurrowTerrain:
	func _ready() -> void:
		pass

	func mount_veil(_cell: Vector2i, veil: Node2D, z: int = 0) -> bool:
		veil.position = Vector2.ZERO
		veil.z_index = z
		add_child(veil)
		return true


var _vp: SubViewport
var _out := ""
var _frame := 0
var _last := -1
var _skipped := 0


func _ready() -> void:
	var args := {}
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--") and "=" in a:
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1]
	# macOS NE DESSINE PAS une fenetre cachee, alors que le temps, lui, avance :
	# des images manquaient (42 sur 120). Au premier plan, et on les compte.
	get_window().always_on_top = true
	_out = args.get("out", "user://fx")
	DirAccess.make_dir_recursive_absolute(_out)
	var zoom := float(args.get("zoom", "1"))

	_vp = SubViewport.new()
	_vp.size = FRAME
	_vp.size_2d_override = VIEW
	_vp.size_2d_override_stretch = true
	_vp.transparent_bg = true
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_vp)
	var stage := Node2D.new()
	stage.position = Vector2(VIEW) * FOOT
	stage.scale = Vector2.ONE * (60.0 / (Iso.half_w() * 2.0)) * zoom
	_vp.add_child(stage)
	var shown := TextureRect.new()
	shown.texture = _vp.get_texture()
	shown.set_anchors_preset(Control.PRESET_FULL_RECT)
	shown.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	add_child(shown)

	RenderingServer.frame_post_draw.connect(_grab)
	await get_tree().process_frame
	var life := 0.0
	match args.get("fx", "explosion"):
		"explosion":
			var terrain := FakeTerrain.new()
			stage.add_child(terrain)
			Blast.play(self, terrain, Vector2i.ZERO, true)
			life = 1.6
		"lightning":
			LightningFx.big_bolt(stage, Vector2.ZERO, 0)
			life = LightningFx.HOLD_S + LightningFx.GAP_S + LightningFx.SPARK_LIFE_S
	await get_tree().create_timer(life + TAIL_S).timeout
	RenderingServer.frame_post_draw.disconnect(_grab)
	print("[fx] %d images dans %s" % [_frame, _out])
	if _skipped > 0:
		push_error("[fx] %d images sautees" % _skipped)
	get_tree().quit(1 if _skipped > 0 else 0)


func _grab() -> void:
	var now := Engine.get_process_frames()
	if _last >= 0:
		_skipped += now - _last - 1
	_last = now
	var img := _vp.get_texture().get_image()
	img.save_png("%s/%04d.png" % [_out, _frame])
	_frame += 1
