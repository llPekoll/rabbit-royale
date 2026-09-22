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

// Le simplex 3D d'Ashima (domaine public, le standard). En 3D et non 2D
// comme les rais : il faut un troisieme axe pour que le temps DEFORME les
// plaques au lieu de les faire glisser.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
	const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
	vec3 i = floor(v + dot(v, C.yyy));
	vec3 x0 = v - i + dot(i, C.xxx);
	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min(g.xyz, l.zxy);
	vec3 i2 = max(g.xyz, l.zxy);
	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + C.yyy;
	vec3 x3 = x0 - D.yyy;
	i = mod289(i);
	vec4 p = permute(permute(permute(
		i.z + vec4(0.0, i1.z, i2.z, 1.0))
		+ i.y + vec4(0.0, i1.y, i2.y, 1.0))
		+ i.x + vec4(0.0, i1.x, i2.x, 1.0));
	float n_ = 0.142857142857;
	vec3 ns = n_ * D.wyz - D.xzx;
	vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
	vec4 x_ = floor(j * ns.z);
	vec4 y_ = floor(j - 7.0 * x_);
	vec4 x = x_ * ns.x + ns.yyyy;
	vec4 y = y_ * ns.x + ns.yyyy;
	vec4 h = 1.0 - abs(x) - abs(y);
	vec4 b0 = vec4(x.xy, y.xy);
	vec4 b1 = vec4(x.zw, y.zw);
	vec4 s0 = floor(b0) * 2.0 + 1.0;
	vec4 s1 = floor(b1) * 2.0 + 1.0;
	vec4 sh = -step(h, vec4(0.0));
	vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
	vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
	vec3 p0 = vec3(a0.xy, h.x);
	vec3 p1 = vec3(a0.zw, h.y);
	vec3 p2 = vec3(a1.xy, h.z);
	vec3 p3 = vec3(a1.zw, h.w);
	vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
	p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
	vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
	m = m * m;
	return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// LE PLAN, en pixels d'ecran.
uniform vec2 plane_size = vec2(890.0, 400.0);
// La demi-tuile, pour defaire la projection iso : 22x12.
uniform vec2 half_tile = vec2(22.0, 12.0);
// L'etendue du sol, en cases — combien de cellules de bruit en travers.
uniform vec2 ground_span = vec2(40.0, 40.0);
// 0 = espace ecran, 1 = plan du sol. C'est LUI qui couche l'ombre.
uniform float iso : hint_range(0.0, 1.0) = 0.4;

uniform float scale : hint_range(0.5, 12.0) = 2.9;
uniform float speed : hint_range(0.0, 1.0) = 0.05;
// Le cap de la derive, en degres, DANS L'ESPACE DU SOL.
uniform float angle : hint_range(0.0, 360.0) = 40.0;
uniform float morph : hint_range(0.0, 0.5) = 0.05;
// Octaves, 1 a 4. Fractionnaire : la derniere se fond progressivement.
uniform float octaves : hint_range(1.0, 4.0) = 3.9;
// La deformation du domaine, pour que les taches ne soient pas les bosses
// hexagonales du bruit lui-meme.
uniform float warp : hint_range(0.0, 0.5) = 0.1;
// OU DANS LE BRUIT l'ombre commence. Plus bas = plus de nuages.
uniform float coverage : hint_range(0.0, 1.0) = 0.57;
uniform float edge : hint_range(0.01, 0.5) = 0.08;
// La quantification, comme pour les rais : on divise le cout sans que le
// voile change d'aspect.
uniform float pixel : hint_range(1.0, 8.0) = 3.0;

uniform vec4 shade : source_color = vec4(0.063, 0.125, 0.227, 1.0);
uniform float alpha : hint_range(0.0, 1.0) = 0.32;

float fbm(vec3 p) {
	float sum = 0.0;
	float amp = 0.5;
	float norm = 0.0;
	// Bornee par une constante et coupee par un poids : un compte VARIABLE
	// dans la condition empecherait le pilote de derouler la boucle sur
	// certains GPU mobiles.
	for (int i = 0; i < 4; i++) {
		float w = clamp(octaves - float(i), 0.0, 1.0);
		sum += amp * w * snoise(p);
		norm += amp * w;
		p = p * 2.03 + vec3(17.0, 31.0, 7.0);
		amp *= 0.5;
	}
	return sum / max(norm, 1e-4);
}

// DEFAIT LA PROJECTION ISO : d'un point du plan vers les coordonnees du sol.
//
// C'est ce qui couche l'ombre sur le terrain. Sans lui le bruit est lu a
// l'ecran et la plaque se lit comme un voile devant l'ile, pas comme une
// ombre dessus.
vec2 uv_ground(vec2 p) {
	float u = p.x / (2.0 * half_tile.x);
	float v = p.y / (2.0 * half_tile.y);
	vec2 ground = vec2(v + u, v - u);
	vec2 screen = vec2(p.x / plane_size.x, p.y / plane_size.y) * ground_span;
	return mix(screen, ground, iso);
}

void fragment() {
	// LE POINT EST LU DANS LE PLAN, PAS A L'ECRAN.
	//
	// `FRAGCOORD` est en pixels d'ECRAN REEL, et ce shader est pose sur un
	// plan quatre fois plus grand que le cadre, dans un noeud lui-meme mis a
	// l'echelle. Lire FRAGCOORD revenait a n'explorer qu'un coin minuscule du
	// champ de bruit — le shader tournait, et ne produisait rien de visible.
	// C'est `UV`, qui va de 0 a 1 SUR LE PLAN, qu'il faut, remis en pixels du
	// plan pour que la quantification garde son sens.
	vec2 px = floor(UV * plane_size / pixel) * pixel;
	vec2 g = uv_ground(px) / max(ground_span.x, 1e-4) * scale;

	float t = TIME;
	float rad = radians(angle);
	vec2 drift = vec2(cos(rad), sin(rad)) * speed * t;
	vec3 sample_at = vec3(g + drift, t * morph);

	// LA DEFORMATION DU DOMAINE : un deuxieme bruit deplace le premier, pour
	// que les taches ne soient pas les bosses du simplex.
	if (warp > 0.0) {
		vec2 w = vec2(
			snoise(sample_at + vec3(11.0, 3.0, 0.0)),
			snoise(sample_at + vec3(0.0, 17.0, 5.0))
		);
		sample_at.xy += w * warp;
	}

	float n = fbm(sample_at) * 0.5 + 0.5;
	// SOUS le seuil il y a de l'ombre — l'inverse du rai, qui s'allume
	// au-dessus. C'est la meme ligne de partage vue des deux cotes.
	float m = 1.0 - smoothstep(coverage - edge, coverage + edge, n);

	float a = m * alpha;
	COLOR = vec4(shade.rgb, a);
}
