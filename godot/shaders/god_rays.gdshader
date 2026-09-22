shader_type canvas_item;
// LES RAIS DE LUMIERE — des colonnes de soleil qui tombent entre les nuages.
//
// Porte de src/game/fx/GodRays.ts, dont il garde le raisonnement :
//
//   • UN RAI EST UN TROU DANS LA COUVERTURE NUAGEUSE, VU DE COTE. Une ombre au
//     sol est le meme trou vu d'en dessous. Les deux effets decrivent le meme
//     ciel, donc ils lisent le MEME bruit avec les MEMES reglages — sinon on
//     obtient deux ciels superposes, ce qui se voit immediatement.
//
//   • LE FRAGMENT N'ECHANTILLONNE PAS L'ECRAN. Le rai part d'une source
//     (souvent hors-champ) et balaie vers le bas ; ce qui compte pour un pixel
//     est l'ANGLE sous lequel on le voit depuis cette source. Le bruit est
//     donc lu en (angle, distance) :
//       - l'angle decoupe les faisceaux. Un seul axe, donc des bandes nettes
//         et paralleles, jamais des taches.
//       - la distance ne sert qu'a faire respirer la bande et a l'eteindre.
//         Elle est divisee par `softness` pour que le bruit varie LENTEMENT le
//         long du rai : un bruit isotrope donnait des chapelets de bulles dans
//         le faisceau au lieu d'une colonne.
//     C'est aussi pourquoi les rais s'ecartent en descendant sans qu'on ait a
//     le coder : a angle constant, deux bords s'eloignent avec la distance.
//
//   • LE RENDU EST ADDITIF. De la lumiere s'AJOUTE a ce qu'elle traverse. Un
//     blanc en alpha-blend delave l'ile en gris et lui prend ses couleurs ;
//     l'additif garde l'herbe verte sous le rai, juste plus claire. C'est la
//     difference entre « eclaire » et « voile ».
//
// CE QUI COUTE, sur un telephone : les octaves. Chaque octave est un simplex
// de plus par pixel, et c'est le seul dial qui change l'ordre de grandeur. Le
// web en met 3.9 ; `pixel` quantifie l'echantillonnage pour diviser le reste.

render_mode blend_add, unshaded;

// La source de lumiere, en coordonnees d'ecran normalisees. Hors-champ en
// general : le soleil est derriere le bord haut.
uniform vec2 source = vec2(0.78, -0.25);

// L'echelle du bruit angulaire : combien de faisceaux sur le tour.
uniform float scale : hint_range(0.5, 12.0) = 2.9;

// La derive du ciel. Lente : un nuage qui file trahit l'echelle du decor.
uniform float speed : hint_range(0.0, 1.0) = 0.05;

// Le fondu du bruit sur lui-meme, pour que les faisceaux se deforment au lieu
// de seulement glisser.
uniform float morph : hint_range(0.0, 0.5) = 0.05;

// LE DIAL QUI COUTE. Chaque octave ajoute un simplex par pixel.
uniform int octaves : hint_range(1, 6) = 4;

// Combien de ciel est couvert. Plus haut = moins de rais, plus etroits.
uniform float coverage : hint_range(0.0, 1.0) = 0.57;

// La durete du bord du faisceau.
uniform float edge : hint_range(0.01, 0.5) = 0.08;

// L'etalement du bruit LE LONG du rai. Voir l'en-tete : sans lui, des bulles.
uniform float softness : hint_range(0.5, 8.0) = 3.0;

// La quantification de l'echantillonnage, en pixels. 3 veut dire qu'on lit le
// bruit par blocs de 3x3 : neuf fois moins de simplex pour une difference que
// l'oeil ne voit pas sur un voile aussi doux.
uniform float pixel : hint_range(1.0, 8.0) = 3.0;

// La couleur du rai, et sa force.
uniform vec4 tint : source_color = vec4(1.0, 0.95, 0.82, 1.0);
uniform float strength : hint_range(0.0, 2.0) = 0.55;

// Ou le rai s'eteint, en fraction de la hauteur d'ecran.
uniform float reach : hint_range(0.1, 2.0) = 1.05;

uniform vec2 screen_size = vec2(890.0, 400.0);


// Simplex 2D d'Ashima — le meme que le web, pour que les deux effets lisent
// exactement le meme ciel.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
	const vec4 C = vec4(0.211324865405187, 0.366025403784439,
			-0.577350269189626, 0.024390243902439);
	vec2 i = floor(v + dot(v, C.yy));
	vec2 x0 = v - i + dot(i, C.xx);
	vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
	vec4 x12 = x0.xyxy + C.xxzz;
	x12.xy -= i1;
	i = mod289(i);
	vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
			+ i.x + vec3(0.0, i1.x, 1.0));
	vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
			dot(x12.zw, x12.zw)), 0.0);
	m = m * m;
	m = m * m;
	vec3 x = 2.0 * fract(p * C.www) - 1.0;
	vec3 h = abs(x) - 0.5;
	vec3 ox = floor(x + 0.5);
	vec3 a0 = x - ox;
	m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
	vec3 g;
	g.x = a0.x * x0.x + h.x * x0.y;
	g.yz = a0.yz * x12.xz + h.yz * x12.yw;
	return 130.0 * dot(m, g);
}


// Le repliement d'octaves. La boucle est bornee par une constante et coupee
// par `i >= octaves` : un compte variable dans la condition empecherait le
// pilote de derouler la boucle sur certains GPU mobiles.
float fbm(vec2 p, float t) {
	float sum = 0.0;
	float amp = 0.5;
	float freq = 1.0;
	for (int i = 0; i < 6; i++) {
		if (i >= octaves) {
			break;
		}
		sum += amp * snoise(p * freq + vec2(0.0, t * morph * freq));
		freq *= 2.0;
		amp *= 0.5;
	}
	return sum;
}


void fragment() {
	// La quantification : on ramene le pixel sur une grille de `pixel` unites
	// AVANT de lire le bruit. C'est ce qui divise le cout sans que le voile
	// change d'aspect.
	vec2 px = floor(FRAGCOORD.xy / pixel) * pixel;
	vec2 uv = px / screen_size;

	// Le vecteur depuis la source, en corrigeant l'aspect pour que l'angle
	// soit un vrai angle et pas un angle etire par le format de l'ecran.
	float aspect = screen_size.x / screen_size.y;
	vec2 d = vec2((uv.x - source.x) * aspect, uv.y - source.y);
	float dist = length(d);

	// ANGLE ET DISTANCE, pas x et y. Voir l'en-tete : c'est ce qui fait des
	// colonnes au lieu de taches.
	float ang = atan(d.y, d.x);
	float t = TIME * speed;
	float n = fbm(vec2(ang * scale, dist / softness) + vec2(t, 0.0), TIME);

	// Du bruit au faisceau : au-dessus du seuil il y a de la lumiere, et le
	// bord est adouci sur `edge`.
	float beam = smoothstep(coverage - edge, coverage + edge, n * 0.5 + 0.5);

	// Le rai s'eteint avec la distance, et ne part pas de la source elle-meme
	// (sinon un point brulant hors-champ).
	float fade = 1.0 - smoothstep(0.0, reach, dist);
	fade *= smoothstep(0.0, 0.12, dist);

	COLOR = vec4(tint.rgb, 1.0) * beam * fade * strength;
}
