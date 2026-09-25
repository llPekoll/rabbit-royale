shader_type canvas_item;
// LE SOLEIL DANS L'OBJECTIF de l'ecran de connexion — lens flare facon anime.
//
// Pose sur le soleil PEINT de home-bg.webp (title_sun_glare.gd le retrouve a
// l'ecran). Propre a l'ecran titre : le ciel du jeu n'en sait rien.
//
//   • le COEUR et le HALO : une tache blanche qui brule, un voile dore ;
//   • les RAIS ARC-EN-CIEL : port 2D de « Anime Style Lens Flare Rainbow
//     Rays » (godotshaders.com, CC0). Le 3D lit l'angle et le produit
//     scalaire vue/lumiere ; ici ce sont l'angle et la distance au soleil.
//     Deux lectures d'un bruit qui glissent en sens contraires = des rais qui
//     naissent, s'allongent et meurent ;
//   • les FANTOMES : les octogones vides des reflets dans l'objectif, alignes
//     du soleil vers le centre de l'ecran (et au-dela, de l'autre cote).
//
// PREMULTIPLIE : `rgb*a + dst*(1 - a*wash)`. Le coeur recouvre (wash), les
// rais et les fantomes s'ajoutent (alpha nul).

render_mode blend_premul_alpha, unshaded;

// Taille du rectangle en pixels, pour garder le soleil rond.
uniform vec2 rect_size = vec2(1280.0, 720.0);
// Le soleil, en UV du rectangle.
uniform vec2 sun = vec2(0.89, 0.23);

uniform vec4 core_color : source_color = vec4(1.0, 0.97, 0.85, 1.0);
uniform vec4 halo_color : source_color = vec4(1.0, 0.79, 0.47, 1.0);
uniform float strength : hint_range(0.0, 2.0) = 0.85;
// Rayons en HAUTEURS DU RECTANGLE.
uniform float core_size : hint_range(0.01, 1.0) = 0.07;
uniform float halo_size : hint_range(0.05, 2.0) = 0.28;
uniform float haze : hint_range(0.0, 2.0) = 0.45;
uniform float pulse : hint_range(0.0, 0.5) = 0.08;
uniform float pulse_period = 4.0;
uniform float wash : hint_range(0.0, 1.0) = 0.5;

// --- Les rais (noms du shader d'origine) ---
uniform sampler2D noise_tex : repeat_enable, filter_linear;
// Nombre de repetitions du bruit sur un tour : ENTIER, sinon une couture.
uniform float scale_u = 8.0;
// Etirement radial du bruit : petit = des rais longs et droits (le bruit
// « anisotrope » de l'original).
uniform float radial_scale = 0.12;
uniform vec2 speed = vec2(0.012, 0.018);
// Longueur des rais, en hauteurs de rectangle.
uniform float ray_length : hint_range(0.1, 3.0) = 1.1;
uniform float offset : hint_range(-0.5, 0.5) = 0.0;
uniform float ray_limit : hint_range(0.0, 1.0) = 0.35;
uniform float ray_offset = 0.1;
uniform float ray_mask_power = 1.5;
uniform vec4 ray_color : source_color = vec4(1.0, 0.96, 0.85, 1.0);
uniform float ray_rainbow : hint_range(0.0, 1.0) = 0.35;
uniform float ray_strength : hint_range(0.0, 2.0) = 0.55;
uniform float rainbow_scale = 2.0;
uniform float glow : hint_range(0.0, 2.0) = 0.25;
uniform float glow_rainbow : hint_range(0.0, 1.0) = 0.2;

// --- Les fantomes ---
uniform float ghosts : hint_range(0.0, 2.0) = 1.0;
// Taille du plus gros, en hauteurs de rectangle.
uniform float ghost_size : hint_range(0.01, 0.5) = 0.09;
// Epaisseur du trait de l'octogone, en part de sa taille.
uniform float ghost_ring : hint_range(0.02, 0.5) = 0.12;
// Remplissage de l'interieur : 0 = vide.
uniform float ghost_fill : hint_range(0.0, 1.0) = 0.12;

vec3 spectrum(float t) {
	return clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// Distance « octogonale » : 1,0 sur le bord d'un octogone de rayon 1.
float octagon(vec2 q) {
	float seg = 6.2831853 / 8.0;
	float a = mod(atan(q.y, q.x) + seg * 0.5, seg) - seg * 0.5;
	return length(q) * cos(a) / cos(seg * 0.5);
}

// Un fantome : un octogone vide, un peu teinte. `k` = sa place sur l'axe
// soleil -> centre (0 = soleil, 1 = centre, 2 = symetrique du soleil).
vec3 ghost(vec2 p, vec2 axis, float k, float size, vec3 tint) {
	vec2 q = (p - axis * k) / size;
	float o = octagon(q);
	float ring = 1.0 - smoothstep(0.0, ghost_ring, abs(o - 1.0 + ghost_ring));
	float fill = (1.0 - smoothstep(0.9, 1.0, o)) * ghost_fill;
	return tint * (ring + fill);
}

void fragment() {
	float aspect = rect_size.x / rect_size.y;
	vec2 p = (UV - sun) * vec2(aspect, 1.0);
	float d = length(p);
	float breath = 1.0 + pulse * sin(TIME * 6.2831853 / pulse_period);

	// Coeur et halo.
	float core = exp(-pow(d / (core_size * breath), 1.6));
	float halo = exp(-d / halo_size) * haze;
	float a = clamp((core + halo) * strength, 0.0, 1.0);
	vec3 base = mix(halo_color.rgb, core_color.rgb, clamp(core, 0.0, 1.0)) * a;

	// Rais. `vdotl` va de -1 au soleil vers 0 au bout des rais.
	float vdotl = -1.0 + d / ray_length;
	float u = atan(p.y, p.x) * scale_u / 6.2831853;
	vec2 uv1 = vec2(u, vdotl * radial_scale);
	vec2 uv2 = vec2(u + 0.5, (1.0 - vdotl) * radial_scale);
	uv1.x += TIME * speed.x;
	uv2.x -= TIME * speed.y;
	float noiX = texture(noise_tex, uv1).r * texture(noise_tex, uv2).r;
	float noi = smoothstep(ray_limit, 1.0, noiX);
	float v_offset = (noiX - 0.5) * ray_offset;
	float alpha_with_offset = clamp(-vdotl + v_offset, 0.0, 1.0);
	float alpha_mask = 1.0 - abs(2.0 * clamp(-vdotl + offset, 0.0, 1.0) - 1.0);
	float alpha = alpha_with_offset * pow(alpha_mask, ray_mask_power);
	float ray_alpha = smoothstep(0.0, 0.1, alpha * noi);
	float glow_alpha = alpha_with_offset * glow;
	vec3 rb = spectrum(alpha_with_offset * rainbow_scale);
	vec3 gl = mix(alpha_with_offset * vec3(1.0), rb, glow_rainbow) * glow;
	vec3 ry = mix(vec3(ray_alpha) * ray_color.rgb, rb, ray_rainbow);
	vec3 rays = (ry * ray_alpha + gl * glow_alpha) * ray_strength;

	// Fantomes, sur l'axe soleil -> centre de l'ecran.
	vec2 axis = (vec2(0.5) - sun) * vec2(aspect, 1.0);
	vec3 g = vec3(0.0);
	g += ghost(p, axis, 0.45, ghost_size * 0.55, vec3(1.0, 0.85, 0.55));
	g += ghost(p, axis, 0.80, ghost_size * 0.35, vec3(0.6, 1.0, 0.7));
	g += ghost(p, axis, 1.25, ghost_size * 1.00, vec3(0.55, 0.8, 1.0));
	g += ghost(p, axis, 1.60, ghost_size * 0.50, vec3(1.0, 0.6, 0.85));
	// Ils respirent avec le soleil : un reflet vit de lui.
	g *= ghosts * 0.4 * breath;

	COLOR = vec4(base + rays + g, a * wash);
}
