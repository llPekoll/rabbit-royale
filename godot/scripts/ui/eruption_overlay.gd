class_name EruptionOverlay
extends Control
## LE CIEL PENDANT QUE L'ILE COULE.
##
## Porte de src/components/eruption-overlay.tsx. La scene secoue et enfonce
## l'ile (`IslandScene.playEruption`, a venir) ; ceci est la moitie que le
## plateau ne fait pas : la lumiere qui devient froide et verte, l'ecume
## jetee VERS LE HAUT a travers le cadre quand l'eau prend le sol, et une
## ligne qui dit ce qui se passe. Monte pour le temps du serveur
## (ERUPTION.SEQUENCE_MS) et retire par `run_over`, pas par le prochain
## instantane — sinon la banniere battait encore derriere le recap (Paul,
## 2026-09-20 : « ca tourne en fond »).
##
## LA DIRECTION EST TOUT LE PROPOS. La cendre tombait d'un volcan qui
## n'existe plus ; la mer monte. Chaque goutte est lancee de sous le cadre,
## ralentit, et retombe — `power2.out` a la montee, pour qu'elle reste
## suspendue en haut de son arc, ce qui se lit comme de l'eau et non comme
## des confettis.
##
## « L'ile coule » est la seule regle que personne ne devine — l'ile est
## l'horloge — et c'est le seul moment ou le jeu peut l'apprendre.

const SPRAY_COUNT := 70
## Le voile : rgba(20,70,90,.25) au centre (50%, 40%) vers rgba(3,14,26,.85)
## a 90%, en 1200 ms `ease-in`.
const DARK_CENTER := Color(20.0 / 255.0, 70.0 / 255.0, 90.0 / 255.0, 0.25)
const DARK_EDGE := Color(3.0 / 255.0, 14.0 / 255.0, 26.0 / 255.0, 0.85)
const DARK_IN := 1.2
## L'ecume : #cfeaf2, 2 a 5 px, un tiers plus hautes que larges.
const SPRAY_INK := Color("#cfeaf2")
## La ligne : #7fe3ff, a 24% du haut, tamponnee 500 ms apres le debut.
## LE TEXTE EST CELUI DU WEB, EN ANGLAIS : eruption-overlay.tsx l'ecrit en
## dur, hors dictionnaire (« THE ISLAND SINKS »). Le jour ou l'export lui
## donne une cle (`run.sinks`), c'est la seule ligne a changer.
const LINE_TEXT := "THE ISLAND SINKS"
const LINE_INK := Color("#7fe3ff")
const LINE_SHADOW := Color("#0a2230")
const LINE_TOP := 0.24
const LINE_DELAY := 0.5
const LINE_IN := 0.52

## SUIT-IL LA MANCHE ? Oui pour celui du HUD, qui monte a l'eruption du
## serveur. Non pour celui que l'ile pose elle-meme a la fin du tutoriel : la
## lecon n'a pas de manche en ligne, et deux voiles branches sur le meme signal
## joueraient deux fois pendant une vraie eruption.
@export var follows_run := true

var _dark: TextureRect
var _line: Label
var _drops: Array[Dictionary] = []
var _t := 0.0
var _seconds := 0.0
var _playing := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.9])
	ramp.colors = PackedColorArray([DARK_CENTER, DARK_EDGE])
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.4)
	tex.fill_to = Vector2(0.5, 1.2)
	_dark = TextureRect.new()
	_dark.texture = tex
	_dark.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_dark.stretch_mode = TextureRect.STRETCH_SCALE
	_dark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_dark)
	add_child(_dark)

	_line = Kit.label(LINE_TEXT, 30, LINE_INK)
	_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_line.add_theme_color_override("font_shadow_color", LINE_SHADOW)
	_line.add_theme_constant_override("shadow_offset_x", 0)
	_line.add_theme_constant_override("shadow_offset_y", 3)
	_line.set_anchors_preset(Control.PRESET_TOP_WIDE)
	add_child(_line)

	if follows_run:
		var state := RunState.current
		state.erupting_changed.connect(_on_erupting)
		if state.erupting_ms > 0:
			play(state.erupting_ms)
	get_viewport().size_changed.connect(_measure)
	_measure()


func _measure() -> void:
	var view := get_viewport_rect().size
	# `clamp(16px, 4vw, 30px)`.
	_line.add_theme_font_size_override("font_size", int(clampf(view.x * 0.04, 16.0, 30.0)))
	_line.offset_top = view.y * LINE_TOP
	_line.offset_bottom = _line.offset_top + 40.0
	_line.pivot_offset = Vector2(view.x * 0.5, 20.0)


func _on_erupting(ms: int) -> void:
	if ms > 0:
		play(ms)
	else:
		stop()


## L'ile coule pour `ms` : le voile monte, l'ecume part, la ligne se pose.
func play(ms: int) -> void:
	_seconds = maxf(1.0, ms / 1000.0)
	_t = 0.0
	_playing = true
	visible = true
	var view := get_viewport_rect().size
	_drops.clear()
	for i in SPRAY_COUNT:
		var size := float(randi_range(2, 5))
		_drops.append({
			"x": randf() * view.x,
			"w": size,
			"h": size * (2.0 if randf() < 0.3 else 1.0),
			"rise": randf_range(0.45, 0.9) * view.y,
			"dx": randf_range(-50.0, 50.0),
			"dur": randf_range(_seconds * 0.5, _seconds * 1.1),
			"delay": randf_range(0.0, _seconds * 0.5),
		})
	_dark.modulate.a = 0.0
	_line.scale = Vector2.ZERO
	set_process(true)


func stop() -> void:
	_playing = false
	visible = false
	set_process(false)


func _process(delta: float) -> void:
	if not _playing:
		return
	_t += delta
	# Le voile, `ease-in` : lent d'abord, puis franc.
	var d := clampf(_t / DARK_IN, 0.0, 1.0)
	_dark.modulate.a = d * d
	# Le tampon de la ligne (`rr-victory-stamp`) : de rien a un peu trop, puis
	# a sa taille, en 520 ms apres 500 ms de retard.
	var s := clampf((_t - LINE_DELAY) / LINE_IN, 0.0, 1.0)
	var over := 1.0 + 0.56 * pow(2.0, -8.0 * s) * sin((s - 0.1) * TAU / 0.4) if s < 1.0 else 1.0
	_line.scale = Vector2.ONE * (over if s > 0.0 else 0.0)
	queue_redraw()


func _draw() -> void:
	if not _playing:
		return
	var view := size
	for drop in _drops:
		var p := clampf((_t - float(drop["delay"])) / float(drop["dur"]), 0.0, 1.0)
		if p <= 0.0 or p >= 1.0:
			continue
		var e := 1.0 - (1.0 - p) * (1.0 - p)
		var x := float(drop["x"]) + float(drop["dx"]) * e
		# Depuis SOUS le cadre (`bottom: -3vh`) : la mer monte, elle ne tombe pas.
		var y := view.y * 1.03 - float(drop["rise"]) * e
		draw_rect(Rect2(x, y, float(drop["w"]), float(drop["h"])), Color(SPRAY_INK, 0.9 * (1.0 - p)))
