// LE VOILE D'UN DIALOGUE : le jeu flou et assombri derriere lui
// (`.rr-lore-scrim`, `.rr-shop-scrim` : rgba(10,6,4,.78) + blur(3px)).
//
// Un flou en treize prises, pas une pyramide de mipmaps : le rendu
// Compatibility ne garantit pas les mipmaps de l'ecran, et treize lectures
// par pixel ne se paient que le temps qu'un dialogue est ouvert.
shader_type canvas_item;

uniform sampler2D screen : hint_screen_texture, filter_linear;
// Le rayon en pixels d'ECRAN (3px de design fois l'echelle du cadre).
uniform float radius_px = 3.0;
uniform vec4 veil : source_color = vec4(0.039, 0.024, 0.016, 0.78);

void fragment() {
	vec2 r = SCREEN_PIXEL_SIZE * radius_px;
	vec3 sum = texture(screen, SCREEN_UV).rgb * 0.2;
	for (int i = 0; i < 6; i++) {
		float a = float(i) * 1.0472;
		vec2 d = vec2(cos(a), sin(a));
		sum += texture(screen, SCREEN_UV + d * r * 0.5).rgb * 0.08;
		sum += texture(screen, SCREEN_UV + d * r).rgb * 0.053333;
	}
	COLOR = vec4(mix(sum, veil.rgb, veil.a), 1.0);
}
