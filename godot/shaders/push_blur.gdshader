// LE FLOU DE LA POUSSEE : l'accueil sort a gauche, le monde entre de droite,
// et entre les deux l'image file un peu (screens.gd `push`).
//
// Un flou de BOUGE, horizontal, dans le sens du geste : un flou rond dirait
// « mise au point », celui-ci dit « vitesse ». Neuf prises comme scrim_blur
// et pour la meme raison — pas de mipmaps d'ecran garantis en Compatibility —
// et il ne se paie que les 0,6 s de la poussee.
shader_type canvas_item;

uniform sampler2D screen : hint_screen_texture, filter_linear;
// Le rayon en pixels d'ECRAN ; 0 = net. Anime par la poussee.
uniform float radius_px = 0.0;

void fragment() {
	float r = SCREEN_PIXEL_SIZE.x * radius_px;
	vec3 sum = texture(screen, SCREEN_UV).rgb;
	float total = 1.0;
	// Des poids qui decroissent vers les bords : un trainee, pas un doublon.
	for (int i = 1; i <= 4; i++) {
		float k = float(i) / 4.0;
		float w = 1.0 - k * 0.5;
		sum += texture(screen, SCREEN_UV + vec2(r * k, 0.0)).rgb * w;
		sum += texture(screen, SCREEN_UV - vec2(r * k, 0.0)).rgb * w;
		total += 2.0 * w;
	}
	COLOR = vec4(sum / total, 1.0);
}
