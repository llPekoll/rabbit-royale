shader_type canvas_item;
// LE SOLEIL DANS L'OBJECTIF de l'ecran de connexion — sun glare + sunburst.
//
// Pose sur le soleil PEINT de home-bg.webp (title_sun_glare.gd le retrouve a
// l'ecran) et le fait vivre : un coeur blanc qui brule, un halo dore qui
// delave le coin, une etoile de branches fines qui tourne et respire.
// Propre a l'ecran titre : le ciel du jeu n'en sait rien.
//
// PREMULTIPLIE : `rgb*a + dst*(1 - a*wash)`. wash 0 = additif pur, 1 = la
// lumiere RECOUVRE la peinture (voile laiteux).

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
uniform float streaks : hint_range(0.0, 2.0) = 0.45;
uniform float streak_count : hint_range(2.0, 40.0) = 14.0;
// Radians par seconde : l'etoile tourne a peine.
uniform float spin = 0.03;
// La respiration du soleil : amplitude et periode en secondes.
uniform float pulse : hint_range(0.0, 0.5) = 0.08;
uniform float pulse_period = 5.0;
uniform float wash : hint_range(0.0, 1.0) = 0.5;

void fragment() {
	vec2 p = (UV - sun) * vec2(rect_size.x / rect_size.y, 1.0);
	float d = length(p);
	float breath = 1.0 + pulse * sin(TIME * 6.2831853 / pulse_period);

	float core = exp(-pow(d / (core_size * breath), 1.6));
	float halo = exp(-d / halo_size) * haze;

	// Deux peignes d'angles incommensurables : des branches de longueurs et
	// d'ecarts inegaux, comme sur une vraie photo.
	float ang = atan(p.y, p.x);
	float t = TIME * spin;
	float a1 = pow(0.5 + 0.5 * sin(ang * streak_count + t), 10.0);
	float a2 = pow(0.5 + 0.5 * sin(ang * streak_count * 0.618 - t * 1.3 + 1.7), 16.0);
	float burst = (a1 * 0.65 + a2 * 0.35) * exp(-d / (halo_size * 1.4 * breath)) * streaks;

	float a = clamp((core + halo + burst) * strength, 0.0, 1.0);
	vec3 col = mix(halo_color.rgb, core_color.rgb, clamp(core + burst * 0.5, 0.0, 1.0));
	COLOR = vec4(col * a, a * wash);
}
