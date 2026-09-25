shader_type canvas_item;
render_mode blend_add, unshaded;

// L'ECLAIR QUI TOMBE DU CIEL — porte en 2D du « 3D Lightning Shader »
// (godotshaders.com, CC0). Un trait de bruit fractal : chaque colonne est a
// `1/distance` du fil qui serpente, donc un coeur blanc qui baigne dans son
// halo. Le rectangle va du haut de l'ecran (UV.y = 0) au pied (UV.y = 1).
//
// Deux ajouts au shader d'origine :
//   • le fil REJOINT LE CENTRE en bas (`pin`) : l'eclair tombe SUR la case,
//     pas a cote ;
//   • `life` (1 → 0) l'eteint, et `impact` allume une tache au pied.

uniform vec3 main_color : source_color = vec3(1.0);
uniform vec3 effect_color : source_color = vec3(0.45, 0.55, 1.0);

uniform int octave_count : hint_range(1, 20) = 10;
uniform float amp_start = 0.5;
uniform float amp_coeff = 0.5;
uniform float freq_coeff = 2.0;
uniform float speed = 3.0;

// Frequence du zigzag le long de l'eclair : hauteur / largeur du rectangle
// pour un bruit isotrope, ecrite par lightning_fx.gd.
uniform float y_size = 8.0;
uniform float x_size = 1.0;

uniform float emission_power = 1.6;
uniform float seed = 0.0;
uniform float life : hint_range(0.0, 1.0) = 1.0;
uniform float impact = 1.0;

float hash12(vec2 p) {
	return fract(cos(mod(dot(p, vec2(13.9898, 8.141)), 3.14)) * 43758.5453);
}

vec2 hash22(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 b = smoothstep(0.0, 1.0, f);
	float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
	float c = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
	float d = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
	float e = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
	return mix(mix(a, c, b.x), mix(d, e, b.x), b.y) + 0.5;
}

float fbm(vec2 p) {
	float v = 0.0;
	float amp = amp_start;
	for (int i = 0; i < octave_count; i++) {
		v += amp * noise(p);
		p *= freq_coeff;
		amp *= amp_coeff;
	}
	return v;
}

void fragment() {
	vec2 uv = 2.0 * UV - 1.0;
	uv.y *= y_size;
	uv.x *= x_size;

	float t = TIME * speed + seed * 17.0;
	// Le fil serpente autour de x = 0 : `noise` tourne autour de 0.5, donc
	// `fbm` autour de la moitie de la somme des amplitudes.
	float wander = fbm(uv + vec2(t, seed * 3.1)) - 0.5 * amp_start / (1.0 - amp_coeff);
	float pin = 1.0 - smoothstep(0.7, 1.0, UV.y);
	float dist = abs(uv.x + wander * pin * 0.9);

	// Le scintillement du shader d'origine : une intensite tiree a chaque image.
	float flick = mix(0.018, 0.05, hash12(vec2(floor(TIME * 30.0) + seed)));
	vec3 col = effect_color * flick / max(dist, 0.002);

	// La tache d'impact, au pied.
	vec2 foot = (UV - vec2(0.5, 1.0)) * vec2(1.0, y_size);
	col += effect_color * impact * 0.06 / max(length(foot) * 3.0, 0.03);

	// Le halo en 1/distance ne retombe jamais a zero : sans ce fondu, le
	// rectangle se lit comme une vitre. Le haut se fond aussi dans le ciel.
	float side = 1.0 - smoothstep(0.35, 1.0, abs(2.0 * UV.x - 1.0));
	float top = smoothstep(0.0, 0.08, UV.y);
	col = min(col * main_color * emission_power * life * side * side * top, vec3(3.0));
	COLOR = vec4(col, 1.0);
}
