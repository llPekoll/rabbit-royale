shader_type canvas_item;
// LES OMBRES DE NUAGES, COUCHEES SUR LE SOL.
//
// Porte de src/game/fx/CloudShadowsNoise.ts.
//
// UNE OMBRE AU SOL ET UN RAI DE LUMIERE DECRIVENT LE MEME CIEL : l'un est un
// trou dans la couverture vu d'en dessous, l'autre le meme trou vu de cote.
// Les deux shaders lisent donc le MEME bruit avec les MEMES reglages (scale,
// speed, morph, octaves, coverage, edge). Les desaccorder donne deux ciels
// superposes, et ca se voit tout de suite.
//
// POURQUOI DU BRUIT ET PAS UNE TEXTURE. Le web a essaye la texture d'abord et
// « ca ressemblait a de la moisissure sur l'eau », pour trois raisons que
// celui-ci evite par construction :
//
//   • LE GRAIN. Une carte satellite a des franges dentelees ; seuillee, ca
//     fait une mouchetures de petites morsures, pas des nuages. Un fBm a deux
//     ou trois octaves donne des taches rondes et molles, sans rien de plus
//     fin que sa derniere octave.
//   • UNE FORME FIGEE. Un motif fixe qui glisse sur l'image se lit comme un
//     décalcomanie, quelle que soit la projection. ICI LE TEMPS EST LE
//     TROISIEME AXE DU BRUIT, donc les plaques se deforment, se scindent et
//     fusionnent en derivant — c'est le seul indice qui dise « il y a une
//     meteo au-dessus » plutot que « quelqu'un a bouge un pochoir ».
//   • L'ECHELLE. Sur une ile de cette taille, une ombre de nuage fait deux ou
//     trois grandes plaques molles, pas un semis.
//
// LE BRUIT EST LU SUR LE PLAN DU SOL, PAS SUR L'ECRAN — c'est `iso` qui en
// decide, et c'est ce qui fait qu'une ombre se COUCHE sur le terrain au lieu
// de flotter devant lui. `uv_ground` defait la projection iso.

// LE BRUIT EST CUIT, PAS CALCULE — et c'est la seule chose qui a fait bouger
// les images par seconde.
//
// MESURE SUR LE SEEKER, en remplacant ce shader par un APLAT de meme surface :
//
//   bruit calcule (2 octaves de simplex 3D) ..... 46 fps
//   aplat, zero calcul .......................... 67 fps
//
// Le cout n'etait donc ni la surface (REACH de 4,0 a 1,0 : 21 -> 27) ni
// l'echantillonnage (pixel x3 : aucun changement), mais le SIMPLEX 3D
// lui-meme — douze permutations par evaluation, deux par pixel. « si faut
// c'est le shader qui est mal code » : c'etait la bonne piste.
//
// Une `NoiseTexture2D` porte le meme champ, cuit une fois au chargement. Une
// lecture de texture remplace douze permutations.
//
// LE TEMPS RESTE LE TROISIEME AXE, et c'est lui qui fait que les plaques se
// DEFORMENT au lieu de glisser — l'indice qui dit « il y a une meteo au-dessus
// » plutot que « quelqu'un a bouge un pochoir ». On le garde en lisant la
// texture DEUX FOIS a des decalages differents et en fondant entre les deux,
// sur un cycle qui boucle. Deux lectures restent bien moins cheres qu'un seul
// simplex 3D.

uniform sampler2D noise : filter_linear, repeat_enable;

// LE PLAN, en pixels d'ecran.
uniform vec2 plane_size = vec2(890.0, 400.0);
uniform vec2 half_tile = vec2(22.0, 12.0);
uniform vec2 ground_span = vec2(40.0, 40.0);
// 0 = espace ecran, 1 = plan du sol. C'est LUI qui couche l'ombre.
uniform float iso : hint_range(0.0, 1.0) = 0.4;

uniform float scale : hint_range(0.5, 12.0) = 2.9;
uniform float speed : hint_range(0.0, 1.0) = 0.05;
uniform float angle : hint_range(0.0, 360.0) = 40.0;
// A quelle vitesse les formes se renouvellent (le fondu entre les deux
// lectures). Remplace l'ancien troisieme axe du simplex.
uniform float morph : hint_range(0.0, 0.5) = 0.05;
uniform float coverage : hint_range(0.0, 1.0) = 0.57;
uniform float edge : hint_range(0.01, 0.5) = 0.08;
uniform float pixel : hint_range(1.0, 8.0) = 3.0;

uniform vec4 shade : source_color = vec4(0.063, 0.125, 0.227, 1.0);
uniform float alpha : hint_range(0.0, 1.0) = 0.32;

// DEFAIT LA PROJECTION ISO : d'un point du plan vers les coordonnees du sol.
//
// C'est ce qui couche l'ombre sur le terrain. Sans lui le bruit est lu a
// l'ecran et la plaque se lit comme un voile devant l'ile, pas comme une ombre
// dessus.
vec2 uv_ground(vec2 p) {
	float u = p.x / (2.0 * half_tile.x);
	float v = p.y / (2.0 * half_tile.y);
	vec2 ground = vec2(v + u, v - u);
	vec2 screen = vec2(p.x / plane_size.x, p.y / plane_size.y) * ground_span;
	return mix(screen, ground, iso);
}

void fragment() {
	vec2 px = floor(UV * plane_size / pixel) * pixel;
	vec2 g = uv_ground(px) / max(ground_span.x, 1e-4) * scale;

	float t = TIME;
	float rad = radians(angle);
	vec2 drift = vec2(cos(rad), sin(rad)) * speed * t;
	vec2 at = g + drift;

	// LES DEUX LECTURES, fondues l'une dans l'autre. Le cycle boucle, donc la
	// meteo ne saute jamais : quand `f` revient a 0, la seconde lecture est
	// devenue la premiere.
	float phase = t * morph;
	float k = fract(phase);
	vec2 jump = vec2(0.37, 0.61);
	float a = texture(noise, at + floor(phase) * jump).r;
	float b = texture(noise, at + (floor(phase) + 1.0) * jump).r;
	// Fondu adouci : un melange lineaire laisserait voir le battement.
	float n = mix(a, b, k * k * (3.0 - 2.0 * k));

	// SOUS le seuil il y a de l'ombre — l'inverse du rai, qui s'allume
	// au-dessus. C'est la meme ligne de partage vue des deux cotes.
	float m = 1.0 - smoothstep(coverage - edge, coverage + edge, n);
	COLOR = vec4(shade.rgb, m * alpha);
}
