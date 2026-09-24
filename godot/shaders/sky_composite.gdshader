shader_type canvas_item;
// LA COUCHE DES RAIS POSEE SUR LA SCENE — opacite et mode de fusion.
//
// Les rais se calculent dans un SubViewport en demi-resolution (sky_light.gd)
// et y sont stockes comme une LUMIERE : du rgb pur, alpha nul. Ce shader les
// recompose sur l'ecran.
//
// L'ADDITIF NE RELIT PAS L'ECRAN, les autres modes si. Relire l'ecran force
// Godot a copier le back-buffer, une passe de plus : l'additif reste le
// defaut, les autres sont la pour comparer a l'oeil.
//
// Le tout sort en PREMULTIPLIE : `rgb + dst * (1 - a)`. Additif = alpha nul ;
// les autres = le resultat du mode, fondu dans l'ecran sur `opacity`.

render_mode blend_premul_alpha, unshaded;

// 0 additif, 1 ecran, 2 lumiere douce, 3 incrustation, 4 densite couleur -.
uniform int mode = 0;
uniform float opacity : hint_range(0.0, 1.0) = 1.0;
uniform sampler2D screen : hint_screen_texture, filter_linear;

void fragment() {
	vec3 light = texture(TEXTURE, UV).rgb;
	if (mode == 0) {
		COLOR = vec4(light * opacity, 0.0);
	} else {
		vec3 d = texture(screen, SCREEN_UV).rgb;
		vec3 r;
		if (mode == 1) {
			r = 1.0 - (1.0 - d) * (1.0 - light);
		} else if (mode == 2 || mode == 3) {
			// La lumiere est noire hors des rais ; on la recentre sur 0,5
			// pour que le noir soit NEUTRE, et non une ombre.
			vec3 b = clamp(0.5 + light, 0.0, 1.0);
			if (mode == 2) {
				r = (1.0 - 2.0 * b) * d * d + 2.0 * b * d;
			} else {
				r = mix(2.0 * d * b, 1.0 - 2.0 * (1.0 - d) * (1.0 - b), step(0.5, d));
			}
		} else {
			r = d / max(1.0 - light, 0.001);
		}
		r = clamp(r, 0.0, 1.0);
		COLOR = vec4(r * opacity, opacity);
	}
}
