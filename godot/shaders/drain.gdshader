// LE MONDE SE VIDE DE SA COULEUR (src/game/fx/Drain.ts `drainMatrix`).
//
// Le meme melange que le web : l'identite glisse vers la luma Rec. 709, et la
// meme part assombrit — a mi-chemin, moitie de saturation ET moitie de
// l'assombrissement, jamais un gris encore a pleine lumiere. Gris, pas noir
// (0.7) : le plateau reste lisible, ou la manche a fini fait partie de ce
// qu'elle dit.
//
// LU SUR L'ECRAN, sous le chrome : pose au calque 2, au-dessus du monde (0),
// de la mer (-100) et du bloom (1) — le halo grisaille avec le reste — et sous
// l'UI (10, 20), qui garde sa couleur comme le HUD React garde la sienne.
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen : hint_screen_texture, filter_linear;
uniform float t : hint_range(0.0, 1.0) = 0.0;
uniform float brightness = 0.7;
// Un peu plus sombre aux bords, a la meme part : le regard revient au lapin.
uniform float vignette = 0.35;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void fragment() {
	vec3 c = texture(screen, SCREEN_UV).rgb;
	float k = 1.0 + (brightness - 1.0) * t;
	vec3 grey = mix(c, vec3(dot(c, LUMA)), t) * k;
	vec2 d = (SCREEN_UV - vec2(0.5, 0.45)) * vec2(1.0, 0.8);
	float edge = smoothstep(0.25, 0.75, length(d));
	COLOR = vec4(grey * (1.0 - vignette * t * edge), 1.0);
}
