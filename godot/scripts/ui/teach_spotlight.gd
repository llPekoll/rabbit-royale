class_name TeachSpotlight
extends CanvasLayer
## LE PROJECTEUR — pendant que le tutoriel demande le X rouge, tout l'ecran
## passe au noir sauf MARQUER UNE BOMBE, sa fleche et le bandeau qui le nomme.
##
## Porte de src/components/teach-spotlight.tsx (Paul, 2026-09-22 : « darkening
## the whole screen except the MARK A BOMB button »). Le plateau refuse tout
## pas tant que la bombe enseignee n'a pas son X ; un pas refuse bourdonne, et
## un joueur qui n'a pas vu le bouton dans le coin lit le bourdon comme un jeu
## casse. Plateau eteint, le bouton et la phrase sont les seules choses qui
## restent.
##
## UN CALQUE A PART, au-dessus du chrome (20) et sous le rideau (100) : la
## barre du haut s'eteint aussi, comme sur le web. Les trous sont MESURES a
## chaque image sur les Controls qu'on eclaire (`lit`) — tous vivent dans des
## calques sans transformation, donc leur rectangle global EST leur place a
## l'ecran. Le trou se dessine au shader, coins arrondis, sans prendre le doigt.

## Le voile du web : `rgba(0, 0, 0, 0.66)`.
const SHADE := Color(0, 0, 0, 0.66)
## L'air autour de chaque chose eclairee, pour ne pas rogner les feuilles des
## planches, et l'arrondi des trous (`PAD`, `RADIUS`).
const PAD := 8.0
const RADIUS := 10.0
const FADE_SECONDS := 0.28
const MAX_HOLES := 4

const SHADER := """
shader_type canvas_item;
uniform vec4 shade : source_color;
uniform vec4 holes[4];
uniform int count;
uniform float radius;
varying vec2 screen_px;
void vertex() { screen_px = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy; }
float box(vec2 p, vec4 r) {
	vec2 c = r.xy + r.zw * 0.5;
	vec2 q = abs(p - c) - (r.zw * 0.5 - vec2(radius));
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
void fragment() {
	float a = 1.0;
	for (int i = 0; i < count; i++) {
		a = min(a, clamp(box(screen_px, holes[i]) + 0.5, 0.0, 1.0));
	}
	COLOR = vec4(shade.rgb, shade.a * a);
}
"""

## Ce qu'on eclaire. Un Control cache ou de taille nulle ne perce rien.
var lit: Array[Control] = []

var _veil: ColorRect
var _mat: ShaderMaterial
var _on := false
var _fade: Tween


func _init() -> void:
	layer = 25


func _ready() -> void:
	var sh := Shader.new()
	sh.code = SHADER
	_mat = ShaderMaterial.new()
	_mat.shader = sh
	_mat.set_shader_parameter("shade", SHADE)
	_mat.set_shader_parameter("radius", RADIUS)
	_veil = ColorRect.new()
	_veil.material = _mat
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	_veil.modulate.a = 0.0
	add_child(_veil)
	visible = false
	set_process(false)


## Allume ou eteint, en fondu (`rr-teach-spotlight-in`, 280 ms).
func set_on(on: bool) -> void:
	if on == _on:
		return
	_on = on
	if _fade != null and _fade.is_valid():
		_fade.kill()
	if on:
		visible = true
		set_process(true)
		_measure()
	_fade = create_tween()
	_fade.tween_property(_veil, "modulate:a", 1.0 if on else 0.0, FADE_SECONDS) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	if not on:
		_fade.tween_callback(func() -> void:
			visible = false
			set_process(false))


func _process(_delta: float) -> void:
	_measure()


func _measure() -> void:
	var holes: Array[Vector4] = []
	for c in lit:
		if c == null or not c.is_visible_in_tree() or holes.size() >= MAX_HOLES:
			continue
		var r := c.get_global_rect()
		if r.size.x <= 0.0 or r.size.y <= 0.0:
			continue
		holes.append(Vector4(r.position.x - PAD, r.position.y - PAD,
			r.size.x + 2.0 * PAD, r.size.y + 2.0 * PAD))
	var n := holes.size()
	while holes.size() < MAX_HOLES:
		holes.append(Vector4.ZERO)
	_mat.set_shader_parameter("holes", holes)
	_mat.set_shader_parameter("count", n)
