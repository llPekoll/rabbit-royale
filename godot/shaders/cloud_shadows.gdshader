shader_type canvas_item;
// LES OMBRES DE NUAGES, COUCHEES SUR LE SOL.
//
// PORTAGE LIGNE A LIGNE de src/game/fx/CloudShadowsNoise.ts, et c'est le
// point. La version precedente avait derive du web sur six axes a la fois —
// projection sol pure, pas de warp, octaves figees dans la texture, un
// « morph » qui fondait deux lectures l'une dans l'autre, une echelle ancree a
// l'ecran, un bruit trois fois plus fin — et chaque essai de reglage au tuner
// corrigeait un symptome d'un autre axe. Paul : « rien a voir avec ce que
// j'avais sur la version pixi ». Ici les maths sont CELLES DU WEB, dans les
// memes unites (pixels du monde), avec les memes chiffres
// (CLOUD_SHADOW_NOISE_DEFAULTS). Toute retouche se compare donc a la story
// `Island/Cloud Shadows (noise)` du storybook.
//
// UNE SEULE DIFFERENCE, ET ELLE EST DE PERFORMANCE : `snoise(vec3)` n'est plus
// calcule, il est LU dans une texture 3D de simplex a une octave (cuite au
// chargement, voir sky_light.gd). Le simplex 3D calcule coutait 46 fps contre
// 67 sur le Seeker ; une lecture de texture 3D coute une lecture. Le fBm, le
// warp et le temps comme TROISIEME AXE restent ceux du web — c'est ce qui fait
// que les plaques se deforment, se scindent et fusionnent au lieu de glisser
// comme un pochoir.
//
// L'ANCIEN FONDU ENTRE DEUX LECTURES EST MORT, et c'etait lui le plus laid : a
// mi-cycle deux bruits sans rapport se moyennent, le contraste s'effondre et
// on voit deux ciels en double exposition. Un vrai axe temporel n'a pas ce
// battement.

// LE SIMPLEX A UNE OCTAVE, sur [0, 1] (normalise). Periodique sur les trois
// axes (`seamless`), d'ou le repeat.
uniform sampler3D noise : filter_linear, repeat_enable;
// Combien d'unites de bruit la texture couvre sur chaque axe : taille en
// texels x frequence de FastNoiseLite. Sert a passer d'une coordonnee de
// bruit (celle du web) a une coordonnee de texture.
uniform vec3 noise_period = vec3(8.0, 8.0, 4.0);

// LE PLAN. `plane_origin` et `plane_size` en pixels du MONDE (le repere de
// l'ile, avant la camera) : l'ombre est posee sur le terrain et doit glisser
// avec lui, exactement comme le mesh du web dans le conteneur de la camera.
uniform vec2 plane_origin = vec2(0.0);
uniform vec2 plane_size = vec2(890.0, 400.0);

// LE CADRE DU WEB : `uSize` et `uGroundSpan` du plan monte par
// `mountCloudShadows` (960x540 x REACH 4). Ce ne sont PAS des tailles
// d'ecran ici — seulement les diviseurs qui donnent au bruit son echelle en
// pixels du monde. Les garder egaux a ceux du web, c'est garder des nuages de
// la meme taille que sur l'ile Pixi.
uniform vec2 frame = vec2(3840.0, 2160.0);
uniform float ground_span = 177.27;
uniform vec2 half_tile = vec2(22.0, 12.0);

uniform float iso : hint_range(0.0, 1.0) = 0.4;
// DEJA MULTIPLIE PAR LE REACH DU WEB (2,9 x 4), comme dans `mountCloudShadows`.
uniform float scale = 11.6;
uniform vec2 drift = vec2(0.0383, 0.0321);
uniform float morph : hint_range(0.0, 0.5) = 0.05;
uniform float octaves : hint_range(1.0, 4.0) = 3.9;
uniform float warp : hint_range(0.0, 1.0) = 0.1;
uniform float coverage : hint_range(0.0, 1.0) = 0.57;
uniform float edge : hint_range(0.01, 0.5) = 0.08;
uniform float pixel : hint_range(0.0, 8.0) = 3.0;

uniform vec4 shade : source_color = vec4(0.063, 0.125, 0.227, 1.0);
uniform float alpha : hint_range(0.0, 1.0) = 0.32;

// Le `snoise(vec3)` du web, sur [-1, 1].
float snoise(vec3 p) {
	return texture(noise, p / noise_period).r * 2.0 - 1.0;
}

// Le fBm du web, verbatim : chaque octave deux fois plus fine et moitie moins
// forte, la derniere fondue quand `octaves` est fractionnaire.
float fbm(vec3 p) {
	float sum = 0.0;
	float amp = 0.5;
	float norm = 0.0;
	for (int i = 0; i < 4; i++) {
		float w = clamp(octaves - float(i), 0.0, 1.0);
		if (w <= 0.0) {
			break;
		}
		sum += amp * w * snoise(p);
		norm += amp * w;
		p = p * 2.03 + vec3(17.0, 31.0, 7.0);
		amp *= 0.5;
	}
	return sum / max(norm, 1e-4);
}

// Le `groundUv` du web : le point du plan dans les cases du sol.
vec2 ground_uv(vec2 p) {
	float u = p.x / (2.0 * half_tile.x);
	float v = p.y / (2.0 * half_tile.y);
	return vec2(u + v, v - u) / ground_span;
}

void fragment() {
	// En pixels du monde, relatif au coin du plan — le `vScreen` du web.
	vec2 p = plane_origin + UV * plane_size;
	if (pixel > 0.0) {
		p = floor(p / pixel) * pixel + pixel * 0.5;
	}

	// `iso` a 0,4 et pas 1 : la projection sol pure ecrase les plaques en
	// trainees diagonales, l'ecran pur en fait des taches sur l'objectif.
	vec2 uv = mix(p / frame, ground_uv(p), iso);
	vec2 q = uv * scale + TIME * drift;
	float t = TIME * morph;

	// Le warp : plier la lecture par un bruit plus grossier, pour que les
	// taches cessent de ressembler a la maille dont elles sortent.
	vec2 w = vec2(
		snoise(vec3(q * 0.5 + 3.1, t * 0.7)),
		snoise(vec3(q * 0.5 - 5.7, t * 0.7 + 9.0))
	);
	q += w * warp;

	float n = fbm(vec3(q, t)) * 0.5 + 0.5;
	float m = smoothstep(coverage - edge, coverage + edge, n);
	COLOR = vec4(shade.rgb, clamp(m * alpha, 0.0, 1.0));
}
