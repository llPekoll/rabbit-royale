class_name Drain
extends CanvasLayer
## LE MONDE PASSE AU GRIS — la manche est finie POUR TOI (src/game/fx/Drain.ts).
##
## Joue quand le lapin du joueur depense son dernier point d'energie, sur l'ile
## comme en raid. Pas l'ile qui coule : l'ile, elle, n'est pas finie ; c'est le
## joueur qui n'a plus de quoi y marcher. Le lapin tombe (damage) et s'endort,
## la couleur s'en va en 0,9 s, et une ligne dit pourquoi.
##
## LE MONDE, PAS L'INTERFACE. Le shader lit l'ecran au calque 2 (voir
## shaders/drain.gdshader) : la carte, la mer et le halo grisaillent, le chrome
## (10, 20) garde sa couleur, comme le HUD React au-dessus du canevas. La ligne
## est au calque 30, au-dessus du chrome, sous le rideau (100) : l'iris la
## recouvre en fermant.
##
## ENFANT DE LA SCENE qui le pose : le gestionnaire detruit la scene au noir du
## rideau, et le gris part avec elle — rien a nettoyer a l'arrivee au terrier.
## Le raid, lui, ne change pas de scene : il appelle `clear()` au milieu du
## rideau.

const SHADER := preload("res://shaders/drain.gdshader")

## Combien de temps la couleur met a partir : plus long qu'un saut, pour se
## lire comme un fondu et non comme une coupe (`DRAIN_SECONDS`).
const SECONDS := 0.9
## La ligne se tamponne une fois le gris bien entame.
const LINE_DELAY := 0.45
const LINE_IN := 0.52
const LINE_TOP := 0.3
const LINE_INK := Color("#f4ead2")
const LINE_SHADOW := Color("#1a1410")

var _mat: ShaderMaterial
var _line: Label
var _line_layer: CanvasLayer
var _tween: Tween


## Pose le gris sur `host` et le lance. Une fois par fin : un second appel rend
## celui qui est deja la, sans repartir de la couleur.
static func start(host: Node, text: String = "") -> Drain:
	for child in host.get_children():
		if child is Drain:
			return child
	var d := Drain.new()
	host.add_child(d)
	d._play(text)
	return d


## Le gris de `host`, s'il y en a un, s'en va d'un coup.
static func clear(host: Node) -> void:
	for child in host.get_children():
		if child is Drain:
			child.queue_free()


func _ready() -> void:
	layer = 2
	var rect := ColorRect.new()
	Kit.fill(rect)
	# IGNORE : plein ecran au-dessus du monde, il avalerait les tapes.
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	_mat.set_shader_parameter("t", 0.0)
	rect.material = _mat
	add_child(rect)

	_line_layer = CanvasLayer.new()
	_line_layer.layer = 30
	add_child(_line_layer)
	_line = Kit.label("", 30, LINE_INK)
	_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_line.add_theme_color_override("font_shadow_color", LINE_SHADOW)
	_line.add_theme_constant_override("shadow_offset_x", 0)
	_line.add_theme_constant_override("shadow_offset_y", 3)
	_line.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_line.scale = Vector2.ZERO
	_line_layer.add_child(_line)
	get_viewport().size_changed.connect(_measure)
	_measure()


func _measure() -> void:
	var view := get_viewport().get_visible_rect().size
	_line.add_theme_font_size_override("font_size", int(clampf(view.x * 0.045, 18.0, 34.0)))
	_line.offset_top = view.y * LINE_TOP
	_line.offset_bottom = _line.offset_top + 44.0
	_line.pivot_offset = Vector2(view.x * 0.5, 22.0)


func _play(text: String) -> void:
	_line.text = text
	_line.visible = not text.is_empty()
	_tween = create_tween().set_parallel(true)
	# `sine.out`, comme le web : le gros de la couleur part tout de suite.
	_tween.tween_method(_set_t, 0.0, 1.0, SECONDS) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	if _line.visible:
		_line.modulate.a = 0.0
		_tween.tween_method(_stamp, 0.0, 1.0, LINE_IN).set_delay(LINE_DELAY)


func _set_t(t: float) -> void:
	_mat.set_shader_parameter("t", t)


## Le tampon (`rr-victory-stamp`, comme « THE ISLAND SINKS ») : de rien a un
## peu trop, puis a sa taille.
func _stamp(s: float) -> void:
	var over := 1.0 + 0.56 * pow(2.0, -8.0 * s) * sin((s - 0.1) * TAU / 0.4) if s < 1.0 else 1.0
	_line.scale = Vector2.ONE * (over if s > 0.0 else 0.0)
	_line.modulate.a = clampf(s * 4.0, 0.0, 1.0)


## La ligne s'efface avant que le rideau ne tombe : elle a ete lue.
func fade_line(seconds: float = 0.3) -> void:
	if _line == null or not _line.visible:
		return
	create_tween().tween_property(_line, "modulate:a", 0.0, seconds)
