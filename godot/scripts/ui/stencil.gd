class_name Stencil
## UN POCHOIR : une texture reduite a sa silhouette, peinte d'une seule
## couleur.
##
## Le web le fait deux fois sur la barre du haut, et des deux facons que le
## CSS connait :
##
##   • `mask-image` (carrot-pill.tsx) — l'eclair jaune du sprite devient le
##     meme tampon brun que les chiffres a cote de lui : « masked to the
##     line's own ink ».
##   • `drop-shadow` (px-top-floor.css `--rr-cast`) — l'ombre portee de tout
##     le chrome sur l'eau : « take it in black and white, tint it, multiply
##     it underneath ». L'alpha de la couche fait la forme, une couleur la
##     remplit, decalee de cinq pixels vers le bas.
##
## Un `modulate` ne sait faire ni l'un ni l'autre : il MULTIPLIE, donc un
## sprite jaune module en brun donne un brun sale ou le dessin transparait
## (le web l'a appris avec `multiply` sur le moyeu — « a brown smudge »).
## Un shader d'une ligne fait exactement ce que le CSS fait : garder l'alpha,
## jeter la couleur.

const SOURCE := """
shader_type canvas_item;
uniform vec4 ink : source_color = vec4(0.0, 0.0, 0.0, 1.0);
void fragment() {
	COLOR = vec4(ink.rgb, COLOR.a * ink.a);
}
"""

## L'OMBRE DU CHROME SUR L'EAU (`--rr-cast`) : bleu profond, pas noir — « a
## neutral shadow on a blue ground reads as dirt ; the same shape in a deep
## water-blue reads as the board sitting above it ». Cinq pixels plus bas,
## assez loin pour se voir (« ya pas d'ombre » a 3px).
const CAST_INK := Color(8.0 / 255.0, 38.0 / 255.0, 68.0 / 255.0, 0.7)
const CAST_DROP := 5.0

static var _shader: Shader


## Un materiau qui peint la silhouette de ce qu'il habille en `ink`.
static func material(ink: Color) -> ShaderMaterial:
	if _shader == null:
		_shader = Shader.new()
		_shader.code = SOURCE
	var m := ShaderMaterial.new()
	m.shader = _shader
	m.set_shader_parameter("ink", ink)
	return m


## L'OMBRE PORTEE d'une texture : la meme image, en silhouette bleue, cinq
## pixels sous l'original. A poser AVANT l'original dans l'arbre, sur le
## meme rectangle.
static func cast(tex: Texture2D) -> TextureRect:
	var r := TextureRect.new()
	r.texture = tex
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.material = material(CAST_INK)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.offset_top = CAST_DROP
	r.offset_bottom = CAST_DROP
	return r
