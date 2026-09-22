class_name EnergyDial
extends Control
## LE CADRAN D'ENERGIE — la planche a cadran de Paul, avec le reservoir pour
## visage. Porte de src/components/energy-dial.tsx, en gardant ce que ce
## fichier a decide :
##
##   • DEUX COUCHES SUR UN MEME CADRE. `dial-empty` est la planche entiere
##     avec l'anneau GRIS ; `dial-full` est le meme anneau peint du vert au
##     jaune, cuit au meme cadrage. On empile : le gris dessous, la couleur
##     dessus, et la couleur est DECOUPEE a un secteur.
##   • IL SE VIDE COMME LA JAUGE D'UNE VOITURE (Paul, 2026-09-19) : a plein
##     l'anneau est entier, et le vide S'OUVRE A MIDI ET S'ELARGIT DANS LE
##     SENS INVERSE DES AIGUILLES. Ce qui survit est un arc epingle au clou
##     d'or de midi et qui court dans le sens horaire sur `frac` du tour. Le
##     web l'ecrit en `conic-gradient` en masque ; ici c'est le meme masque,
##     en shader sur la couche de couleur : l'angle de chaque pixel autour
##     du centre de l'anneau, garde s'il est sous `frac` du tour. Un masque
##     RETIRE la couleur et laisse chaque pixel de l'art gris intact — un
##     cache peint par-dessus devrait imiter le bois et couvrirait les quatre
##     clous d'or.
##   • LA GEOMETRIE EST MESUREE, PAS DEVINEE : sur l'art 268x102 le centre
##     de l'anneau est a 19,22 % / 51,72 % et il court de r=24 a r=34. Ces
##     trois nombres sont le seul lien entre l'image et le decoupage.
##   • L'ANNEAU NE SAUTE PAS : la valeur GLISSE vers sa cible en 340 ms, en
##     decelerant, pour que l'ARRIVEE soit la partie lisible. Un second
##     changement en cours de route repart d'ou l'anneau EST.
##   • LE BATTEMENT : sous un tiers du reservoir, l'eclair du moyeu gonfle et
##     le cadran s'eclaire, et de plus en plus vite a mesure qu'il se vide
##     (1,1 s au seuil, 0,5 s a vide). Une pulsation a vitesse fixe dit
##     « quelque chose est anime » ; une qui s'accelere dit « ca s'epuise ».

## Un tap sur l'anneau : le panneau qui explique le reservoir.
signal tapped

## L'art cuit, les deux couches a la meme taille.
const ART := Vector2(268.0, 102.0)
## Le centre de l'anneau, en fraction de la boite ; ses rayons en pixels
## source.
const RING_CX := 0.1922
const RING_CY := 0.5172
const RING_INNER := 24.0
const RING_OUTER := 34.0
## Le bois propre entre les deux touffes de feuilles (`dialInset`,
## `dialRoom`) : le texte se pose la et nulle part ailleurs.
const WOOD_START := 115.0
const WOOD_END := 255.0
## Les rangees de la planche elle-meme (`plankRows`) : le cadran est plus
## haut que la planche, qui pend dans les deux tiers inferieurs.
const PLANK_TOP := 31.0
const PLANK_BOTTOM := 86.0

## Le glissement de l'anneau vers une nouvelle lecture.
const SWEEP_SECONDS := 0.34
## L'eclair du moyeu, en facteur de son 24x29 : plus gros que le moyeu pour
## que ses pointes mordent sur l'anneau — « a mark stamped over the gauge,
## not a picture framed inside it ».
const HUB_BOLT := 1.6
const BOLT_SIZE := Vector2(24.0, 29.0)
## Ou l'encre de l'eclair se trouve VRAIMENT dans sa boite (le centroide de
## son alpha) : il penche a gauche et siege haut, et centrer la boite le
## posait bas et a gauche du moyeu.
const BOLT_INK := Vector2(10.84, 11.01)
## Le battement : d'ou il part, et sa periode aux deux bouts.
const BEAT_FROM := 1.0 / 3.0
const BEAT_SLOW := 1.1
const BEAT_FAST := 0.5
## Combien l'eclair gonfle, et combien le cadran s'eclaire, au sommet.
const BEAT_SWELL := 0.12
const BEAT_FLUSH := 0.28
## LE MASQUE CONIQUE : `t` est la fraction du tour, horaire depuis midi
## (sin pour x, -cos pour y, donc atan(x, -y)) ; au-dela de `frac` le pixel
## s'efface. Les deux arrets confondus du degrade du web donnent un bord
## net ; ici c'est un `step`, la meme chose.
const ARC_SHADER := """
shader_type canvas_item;
uniform float frac = 1.0;
uniform vec2 centre = vec2(0.1922, 0.5172);
uniform float aspect = 2.627;
void fragment() {
	vec2 d = (UV - centre) * vec2(aspect, 1.0);
	float a = atan(d.x, -d.y);
	float t = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
	COLOR.a *= step(t, frac);
}
"""
## LE DISQUE DE L'ECLAT : le cadran entier, un cheveu au-dela de l'anneau,
## en additif — « a filter, not a scale : the ring must not blur or move,
## only light up ».
const FLUSH_SHADER := """
shader_type canvas_item;
render_mode blend_add;
uniform vec2 centre = vec2(0.1922, 0.5172);
uniform float aspect = 2.627;
uniform float radius = 0.36;
void fragment() {
	vec2 d = (UV - centre) * vec2(aspect, 1.0);
	COLOR.a *= 1.0 - step(radius, length(d));
}
"""

## L'energie en main et le plein. `value` glisse ; `max_value` non.
var value := 0.0:
	set(v):
		if is_equal_approx(v, value):
			return
		# Le premier reglage n'est pas un mouvement : une jauge qui se remonte
		# depuis zero au montage annonce un changement qui n'a pas eu lieu.
		if _settled:
			_from = _shown
			_since = 0.0
		else:
			_shown = v
			_settled = true
		value = v
		queue_redraw()
var max_value := 1.0:
	set(v):
		max_value = maxf(0.0, v)
		queue_redraw()
## Le moyeu porte l'eclair ; le cadran bat sous un tiers ; un tap ouvre le
## panneau. Tous trois seulement la ou il Y A un reservoir (sur l'ile le
## terrier n'en a pas a depenser).
var hub := false:
	set(v):
		hub = v
		if _bolt != null:
			_bolt.visible = v
var beat := false
var tappable := false:
	set(v):
		tappable = v
		if _tap != null:
			_tap.visible = v
## Un repere sur l'anneau a cette valeur (la ligne du raid), ou negatif.
var mark := -1.0:
	set(v):
		mark = v
		queue_redraw()

var _shown := 0.0
var _from := 0.0
var _since := -1.0
var _settled := false
var _phase := 0.0
var _beating := false

var _cast: TextureRect
var _board: Control
var _arc: TextureRect
var _arc_material: ShaderMaterial
var _flush: TextureRect
var _bolt: TextureRect
var _tap: Button


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = ART

	# L'OMBRE SUR L'EAU, sous tout le reste (`--rr-cast` sur `.rr-pill-plate`).
	_cast = Stencil.cast(Kit.DIAL_EMPTY)
	add_child(_cast)

	# LA PLANCHE ET LES DEUX ANNEAUX. Une couche a part plutot que le _draw
	# de ce noeud, pour que l'ombre puisse se dessiner DESSOUS : un parent
	# se peint toujours avant ses enfants.
	_board = Control.new()
	_board.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_board.draw.connect(_draw_board)
	Kit.fill(_board)
	add_child(_board)

	# LA COULEUR, decoupee a ce qui reste.
	_arc = _layer(Kit.DIAL_FULL)
	_arc_material = ShaderMaterial.new()
	var arc_shader := Shader.new()
	arc_shader.code = ARC_SHADER
	_arc_material.shader = arc_shader
	_arc_material.set_shader_parameter("centre", Vector2(RING_CX, RING_CY))
	_arc_material.set_shader_parameter("aspect", ART.x / ART.y)
	_arc.material = _arc_material
	add_child(_arc)

	# L'ECLAT DU BATTEMENT : le disque du cadran, en additif, dont l'alpha
	# pulse. Rien n'est empile sur un cadran calme.
	_flush = _layer(Kit.DIAL_EMPTY)
	var flush_material := ShaderMaterial.new()
	var flush_shader := Shader.new()
	flush_shader.code = FLUSH_SHADER
	flush_material.shader = flush_shader
	flush_material.set_shader_parameter("centre", Vector2(RING_CX, RING_CY))
	flush_material.set_shader_parameter("aspect", ART.x / ART.y)
	flush_material.set_shader_parameter("radius", (RING_OUTER + 2.0) / ART.y)
	_flush.material = flush_material
	_flush.modulate.a = 0.0
	add_child(_flush)

	# L'ECLAIR SUR LE MOYEU, tel qu'il est dessine — son propre jaune, sans
	# teinte ni fondu : l'art est deja la couleur de l'energie du jeu.
	_bolt = TextureRect.new()
	_bolt.texture = Kit.ICONS["bolt"]
	_bolt.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bolt.stretch_mode = TextureRect.STRETCH_SCALE
	_bolt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bolt.visible = hub
	add_child(_bolt)

	# LA CIBLE DU TAP : un disque un peu plus large que l'anneau, invisible.
	_tap = Button.new()
	_tap.flat = true
	_tap.focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_tap.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_tap.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_tap.pressed.connect(func() -> void: tapped.emit())
	_tap.visible = tappable
	add_child(_tap)

	resized.connect(_place)


func _ready() -> void:
	_place()


## Dessiner la planche a cette hauteur : la largeur suit l'aspect de l'art,
## un cercle ne s'etire pas.
func set_height(h: float) -> void:
	var k := h / ART.y
	custom_minimum_size = ART * k
	size = ART * k


func scale_factor() -> float:
	return size.y / ART.y


func ring_centre() -> Vector2:
	return Vector2(size.x * RING_CX, size.y * RING_CY)


## Ce que le cadran coute au texte, et la largeur du bois propre, a
## l'echelle dessinee.
func inset() -> float:
	return round(WOOD_START * scale_factor())


func room() -> float:
	return round((WOOD_END - WOOD_START) * scale_factor())


func _place() -> void:
	var k := scale_factor()
	var c := ring_centre()
	# L'eclair : sa boite est posee pour que le centre de son ENCRE tombe sur
	# le centre de l'anneau, et il gonfle depuis ce meme point.
	var box := BOLT_SIZE * HUB_BOLT * k
	var ink := BOLT_INK * HUB_BOLT * k
	_bolt.size = box
	_bolt.position = c - ink
	_bolt.pivot_offset = ink
	var r := (RING_OUTER + 6.0) * k
	_tap.position = c - Vector2(r, r)
	_tap.size = Vector2(r * 2.0, r * 2.0)
	queue_redraw()
	_board.queue_redraw()


## Une couche de l'art sur toute la boite, comme `layer()` du web.
func _layer(tex: Texture2D) -> TextureRect:
	var r := TextureRect.new()
	r.texture = tex
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(r)
	return r


func _process(delta: float) -> void:
	# LE GLISSEMENT vers la cible, en decelerant (1 - (1-t)^3).
	if _since >= 0.0:
		_since += delta
		var t := minf(1.0, _since / SWEEP_SECONDS)
		var eased := 1.0 - pow(1.0 - t, 3.0)
		_shown = _from + (value - _from) * eased
		if t >= 1.0:
			_since = -1.0
			_shown = value
		_board.queue_redraw()
	# Bornee : l'energie est vivante, une bombe prend plus qu'il ne reste, et
	# une fraction negative ouvrirait le secteur du mauvais cote.
	var frac := clampf(_shown / max_value, 0.0, 1.0) if max_value > 0.0 else 0.0
	_arc_material.set_shader_parameter("frac", frac)
	_arc.visible = frac > 0.001

	# LE BATTEMENT, sur la VRAIE valeur — l'alarme part sur le creusement qui
	# a franchi la ligne, pas un tiers de seconde plus tard.
	var fill := (value / max_value) if max_value > 0.0 else 0.0
	var on := beat and hub and max_value > 0.0 and fill <= BEAT_FROM
	if on:
		var period := lerpf(BEAT_SLOW, BEAT_FAST, 1.0 - minf(1.0, fill / BEAT_FROM))
		_phase = fmod(_phase + delta / period, 1.0)
		var pulse := 0.5 - 0.5 * cos(TAU * _phase)
		_bolt.scale = Vector2.ONE * (1.0 + BEAT_SWELL * pulse)
		_flush.modulate.a = BEAT_FLUSH * pulse
		_beating = true
	elif _beating:
		_beating = false
		_phase = 0.0
		_bolt.scale = Vector2.ONE
		_flush.modulate.a = 0.0


## LA PLANCHE ET L'ANNEAU GRIS — toute l'image, toujours dessinee — puis le
## repere. La couleur est la couche au-dessus.
func _draw_board() -> void:
	_board.draw_texture_rect(Kit.DIAL_EMPTY, Rect2(Vector2.ZERO, size), false)

	# LE REPERE : un point sur le rayon median, a l'angle de la valeur —
	# sin pour x, -cos pour y, horaire depuis midi comme l'arc.
	if mark >= 0.0 and max_value > 0.0:
		var k := scale_factor()
		var a := TAU * clampf(mark / max_value, 0.0, 1.0)
		var r := (RING_INNER + RING_OUTER) * 0.5 * k
		var d := maxf(4.0, round(4.5 * k))
		var p := ring_centre() + Vector2(sin(a), -cos(a)) * r
		_board.draw_circle(p, d * 0.5 + 1.0, Color(Palette.CREAM, 0.85))
		_board.draw_circle(p, d * 0.5, Palette.INK)
