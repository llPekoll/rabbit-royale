class_name RaidAlarm
extends Control
## L'ALERTE DU RAID SUBI — quelqu'un est dans MON terrier, et l'ecran le crie.
##
## Trois couches, du fond vers le devant :
##
##   • LE VOILE ROUGE des bords, qui bat toutes les PULSE_S : une lumiere
##     d'alarme, pas un filtre — le centre (le terrier, l'intrus) reste net.
##   • LES LIGNES DE VITESSE qui convergent vers le centre (les « focus
##     lines » du manga) : une rafale a l'arrivee et a chaque coup (`burst`),
##     un souffle a chaque battement le reste du temps.
##   • LE BANDEAU sous la barre du haut : « KURO IS RAIDING YOU », qui claque
##     en entrant et dont le cadre rougit avec le battement.
##
##   • LE BOUTON, hors du terrier seulement (`action`) : DEFENDRE, sous le
##     bandeau, qui bat avec lui. Sur l'ile on creuse la tete baissee et le
##     raid passait inapercu (le user, 2026-10-01 : « il le sait pas, faut
##     une grosse notification alerte ») ; une tape ramene au terrier.
##
## Demande pour la video de defense (le user, 2026-09-30 : « une notification
## under attack, avec une lumiere rouge de temps en temps ou les lignes rouges
## qui convergent vers le centre »). Rien ici ne lit le reseau : on la pose
## (`add_child` + Kit.fill), on la relance (`burst`), on la retire (`finish`).

const RED := Color("#ff2a2a")
const DEEP := Color("#7a0710")
## Un battement toutes les 1,4 s : assez vite pour dire « urgent », assez
## lent pour ne pas clignoter.
const PULSE_S := 1.4
## Le voile au creux et au sommet du battement.
const VEIL_LOW := 0.25
const VEIL_HIGH := 0.7
## Les lignes : combien, et tous les combien on les retire au hasard (le
## tremble des focus lines dessinees a la main).
const LINES := 64
const JITTER_S := 0.07
## Ce que les lignes gardent au creux d'un battement, et le temps d'une rafale.
const LINES_REST := 0.28
const BURST_S := 1.1

## SOUS LE MEDAILLON, pas sous TOPBAR_H : la jauge et sa pastille d'energie
## pendent plus bas que la barre, et le bandeau passait dessous (« K… U »).
const BANNER_Y := Kit.TOPBAR_H * 2.0
## Le bouton DEFENDRE : large, sous le bandeau.
const BUTTON_W := 240.0
const BUTTON_H := 56.0
const BUTTON_GAP := 14.0

## Le nom de l'intrus, pose avant l'entree dans l'arbre.
var who := ""
## LE BANDEAU, pour la video seulement : en jeu, le panneau de defense
## (defend_hud.gd) dit deja « KURO IS RAIDING YOU », avec l'eclair dessous —
## deux fois la meme ligne l'une sur l'autre ne crie pas plus fort.
var banner := true
## Le mot du bouton sous le bandeau ; vide, pas de bouton (au terrier, on y
## est deja). Une tape emet `acted`.
var action := ""

signal acted

var _veil: TextureRect
var _lines: FocusLines
var _banner: PanelContainer
var _frame: StyleBoxFlat
var _button: PlankButton
var _t := 0.0
var _burst := 0.0
var _fade := 1.0
var _leaving := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_veil = _edge_veil()
	Kit.fill(_veil)
	add_child(_veil)

	_lines = FocusLines.new()
	_lines.count = LINES
	_lines.color = RED
	Kit.fill(_lines)
	add_child(_lines)

	_banner = PanelContainer.new()
	_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame = StyleBoxFlat.new()
	_frame.bg_color = Color(DEEP.darkened(0.55), 0.92)
	_frame.border_color = RED
	_frame.set_border_width_all(2)
	_frame.set_corner_radius_all(4)
	_frame.content_margin_left = 14.0
	_frame.content_margin_right = 14.0
	_frame.content_margin_top = 5.0
	_frame.content_margin_bottom = 5.0
	_banner.add_theme_stylebox_override("panel", _frame)
	# Hors du terrier, le bandeau est le seul a le dire : plus gros.
	var words := Kit.label(I18N.shout(I18N.f("defend.underAttack", [who])), 20 if action.is_empty() else 28, Color("#ffe3dc"))
	words.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	words.add_theme_color_override("font_shadow_color", DEEP)
	words.add_theme_constant_override("shadow_offset_x", 0)
	words.add_theme_constant_override("shadow_offset_y", 2)
	_banner.add_child(words)
	add_child(_banner)
	_banner.visible = banner

	if not action.is_empty():
		_button = preload("res://scenes/plank_button.tscn").instantiate()
		_button.board = PlankButton.Board.DANGER
		_button.label_size = 20
		_button.custom_minimum_size = Vector2(BUTTON_W, BUTTON_H)
		_button.relabel(action)
		_button.pressed.connect(func() -> void: acted.emit())
		add_child(_button)

	resized.connect(_place)
	_place.call_deferred()
	_slam.call_deferred()
	burst()


## Sous la barre du haut, au centre.
func _place() -> void:
	var want := _banner.get_combined_minimum_size()
	_banner.size = want
	_banner.position = Vector2(floorf((size.x - want.x) * 0.5), BANNER_Y)
	_banner.pivot_offset = want * 0.5
	if _button != null:
		_button.size = Vector2(BUTTON_W, BUTTON_H)
		_button.position = Vector2(floorf((size.x - BUTTON_W) * 0.5), BANNER_Y + want.y + BUTTON_GAP)
		_button.pivot_offset = _button.size * 0.5


## Le bandeau claque : 1,7x, puis se pose.
func _slam() -> void:
	_banner.modulate.a = 0.0
	_banner.scale = Vector2(1.7, 1.7)
	var t := create_tween().set_parallel(true)
	t.tween_property(_banner, "modulate:a", 1.0, 0.12)
	t.tween_property(_banner, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if _button != null:
		_button.modulate.a = 0.0
		t.tween_property(_button, "modulate:a", 1.0, 0.2).set_delay(0.18)


## UN COUP : l'arrivee, une bombe qui saute — les lignes repartent a fond.
func burst() -> void:
	_burst = 1.0


## C'EST FINI (foudroye, reparti, a sec) : tout s'eteint, puis s'en va.
func finish() -> void:
	if _leaving:
		return
	_leaving = true
	var t := create_tween().set_parallel(true)
	t.tween_property(self, "_fade", 0.0, 0.45)
	t.tween_property(_banner, "modulate:a", 0.0, 0.3)
	if _button != null:
		_button.disabled = true
		t.tween_property(_button, "modulate:a", 0.0, 0.3)
	t.chain().tween_callback(queue_free)


func _process(delta: float) -> void:
	_t += delta
	_burst = maxf(0.0, _burst - delta / BURST_S)
	# Un battement aigu : long creux, montee courte — une sirene, pas une vague.
	var beat := pow(0.5 + 0.5 * sin(_t * TAU / PULSE_S - PI * 0.5), 3.0)
	_veil.modulate.a = lerpf(VEIL_LOW, VEIL_HIGH, beat) * _fade
	_lines.strength = maxf(_burst, beat * LINES_REST) * _fade
	_frame.border_color = RED.lerp(Color("#ffd0c8"), beat)
	# Le bouton gonfle au battement : il appelle, il n'attend pas.
	if _button != null and not _button.button_pressed:
		_button.scale = Vector2.ONE * (1.0 + 0.06 * beat)
	_lines.jitter(delta, JITTER_S)


## Le voile : rien au centre, le rouge monte vers les bords (une ellipse sur
## l'ecran, comme le vignettage des tampons).
func _edge_veil() -> TextureRect:
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.62, 0.9, 1.0])
	ramp.colors = PackedColorArray([Color(RED, 0.0), Color(RED, 0.0), Color(RED, 0.45), Color(DEEP, 0.8)])
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


## LES LIGNES DE VITESSE : des aiguilles fines qui partent des bords et
## s'arretent avant le centre, retirees au hasard tous les JITTER_S.
class FocusLines:
	extends Control

	var count := 64
	var color := Color.RED
	var strength := 0.0
	var _rays: Array[Vector4] = []
	var _clock := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func jitter(delta: float, every: float) -> void:
		_clock -= delta
		if _clock <= 0.0 or _rays.is_empty():
			_clock = every
			_rays.clear()
			for i in count:
				# angle, demi-largeur (rad), ou la pointe s'arrete (0-1), alpha
				_rays.append(Vector4(randf() * TAU, randf_range(0.004, 0.016),
					randf_range(0.42, 0.72), randf_range(0.45, 1.0)))
		queue_redraw()

	func _draw() -> void:
		if strength <= 0.01:
			return
		var c := size * 0.5
		var far := size.length() * 0.5 + 8.0
		for r in _rays:
			var tip := c + Vector2.from_angle(r.x) * far * r.z
			var a := c + Vector2.from_angle(r.x - r.y) * far
			var b := c + Vector2.from_angle(r.x + r.y) * far
			draw_colored_polygon(PackedVector2Array([a, b, tip]), Color(color, r.w * strength))
