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

// ── LES POUSSIERES DANS L'AIR ────────────────────────────────────────────
// Leur intensite. 0 les eteint.
uniform float motes : hint_range(0.0, 1.0) = 0.3;
// Le pas de la grille de grains, en pixels du plan.
uniform float mote_cell : hint_range(8.0, 64.0) = 26.0;
uniform float mote_size : hint_range(0.5, 6.0) = 2.2;
// Quelle part des cellules porte un grain. BASSE : une grille pleine laisse
// voir sa trame en une seconde.
uniform float mote_density : hint_range(0.0, 1.0) = 0.25;
// La montee, en pixels par seconde. L'air chaud d'un rai porte la poussiere
// vers le haut ; elle ne file pas le long du faisceau.
uniform float mote_rise : hint_range(0.0, 30.0) = 6.0;
// A quelle vitesse un grain nait, brille et s'eteint.
uniform float mote_blink : hint_range(0.0, 1.0) = 0.12;

uniform sampler2D noise : filter_linear, repeat_enable;
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


// UN HACHAGE POUR LES GRAINS. Pas le bruit du ciel : ici on veut des valeurs
// INDEPENDANTES par cellule, pas un champ continu — un bruit lisse mettrait
// les grains en chapelets.
float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}


// LES POUSSIERES : des grains distincts qui flottent dans la lumiere.
//
// Portees de `motes()` (src/game/fx/GodRays.ts). Elles ne sont PAS un systeme
// a part et c'est tout l'interet : elles sont multipliees par le faisceau, en
// bas de ce fichier, donc un grain ne brille QUE dans un rai. C'est ainsi
// qu'on voit la poussiere dans la vraie vie — jamais dans l'ombre.
//
// CE QUI LES REND VIVANTES, et chacun des trois s'est verifie necessaire cote
// web :
//   • UNE DUREE DE VIE : chaque grain nait, brille, s'eteint. Des grains
//     permanents qui ne font que deriver se lisent comme une texture de bruit
//     qui glisse.
//   • UNE MONTEE LENTE avec un leger balancement lateral, pour qu'ils ne
//     montent pas en rang comme des bulles dans un verre.
//   • UNE DENSITE BASSE : la plupart des cellules sont vides. Une grille
//     pleine laisse voir sa trame en une seconde.
//
// Deux couches, de pas et de vitesse differents, pour casser l'alignement de
// la grille sans en ajouter une troisieme.
float dust_motes(vec2 p) {
	if (motes <= 0.0) {
		return 0.0;
	}
	float sum = 0.0;
	for (int i = 0; i < 2; i++) {
		float L = float(i);
		float cell_px = mote_cell * (1.0 + 0.6 * L);

		vec2 q = p;
		// La grille DESCEND, donc les grains montent. La seconde couche plus
		// lentement : c'est elle qui donne la profondeur.
		q.y += TIME * mote_rise * (1.0 - 0.4 * L);
		q.x += sin(TIME * 0.35 + L * 2.1 + p.y * 0.012) * cell_px * 0.18;

		vec2 g = q / cell_px + L * 0.37;
		vec2 cell = floor(g);
		vec2 f = fract(g);

		float h1 = hash21(cell + L * 17.0);
		float h2 = hash21(cell.yx + L * 53.0);
		float h3 = hash21(cell * 1.3 + L * 29.0);
		if (h3 > mote_density) {
			continue;
		}

		// Le point, tenu a l'ecart des bords pour qu'un grain ne soit jamais
		// coupe en deux par la frontiere de sa cellule.
		vec2 pt = vec2(h1, h2) * 0.7 + 0.15;
		float r = mote_size / cell_px;
		float d = length(f - pt);
		float grain = 1.0 - smoothstep(r * 0.4, r, d);

		// Naitre, briller, s'eteindre — chacun a son rythme et sa phase.
		float life = fract(TIME * mote_blink * (0.6 + 0.8 * h1) + h2 * 7.0);
		float bright = sin(life * 3.14159);

		sum += grain * bright * (1.0 - 0.35 * L);
	}
	return sum * motes;
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
	// LU DANS LE PLAN, PAS A L'ECRAN — meme piege que les ombres.
	//
	// `FRAGCOORD` est en pixels d'ECRAN REEL. Monte sur un plan qui deborde du
	// cadre et dans un noeud mis a l'echelle, `FRAGCOORD / screen_size` ne
	// depassait jamais 0,27 : tout le rai se tassait dans un coin du champ et
	// rien n'arrivait sur l'ile. Le banc d'essai ne montrait pas le defaut,
	// parce que son voile couvre exactement l'ecran — les deux reperes y
	// coincident. `UV` va de 0 a 1 sur le plan, ce qui est ce que `source` et
	// l'angle veulent dire.
	vec2 px = floor(UV * screen_size / pixel) * pixel;
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
	// LE BRUIT EST CUIT, comme pour les ombres — meme raison, meme mesure.
	//
	// Les rais coutaient une vingtaine d'images par seconde a eux seuls (66 fps
	// sans, 46 avec, une fois les ombres corrigees). Ils lisent le bruit en
	// (ANGLE, DISTANCE) et non en (x, y), ce qui ne change rien pour une
	// texture : ce sont deux coordonnees comme deux autres.
	//
	// Deux lectures fondues gardent le renouvellement que `morph` donnait au
	// troisieme axe du simplex.
	vec2 at = vec2(ang * scale, dist / softness) + vec2(t, 0.0);
	float phase = TIME * morph;
	float k = fract(phase);
	vec2 jump = vec2(0.41, 0.67);
	float na = texture(noise, at + floor(phase) * jump).r;
	float nb = texture(noise, at + (floor(phase) + 1.0) * jump).r;
	float n = mix(na, nb, k * k * (3.0 - 2.0 * k)) * 2.0 - 1.0;

	// Du bruit au faisceau : au-dessus du seuil il y a de la lumiere, et le
	// bord est adouci sur `edge`.
	float beam = smoothstep(coverage - edge, coverage + edge, n * 0.5 + 0.5);

	// Le rai s'eteint avec la distance, et ne part pas de la source elle-meme
	// (sinon un point brulant hors-champ).
	float fade = 1.0 - smoothstep(0.0, reach, dist);
	fade *= smoothstep(0.0, 0.12, dist);

	// LES GRAINS SONT MULTIPLIES PAR LE FAISCEAU, comme chez le web
	// (`shaft * fade * (dust * uAlpha + motes(p))`). Une poussiere ne se voit
	// QUE dans un rai : ajoutee par-dessus, elle scintillerait aussi dans
	// l'ombre, ce qui ne veut rien dire.
	//
	// `px` et non `UV` : les grains ont une taille en PIXELS, pas une part du
	// plan — sinon ils grossiraient avec lui.
	// LES GRAINS SUIVENT LE COEUR DU FAISCEAU, pas son halo.
	//
	// `beam` seul ne suffit pas : avec un bord large et une couverture basse —
	// le reglage choisi ici — il ne descend jamais sous 0,29, donc la lumiere
	// est douce et PARTOUT. Les grains se voyaient alors jusque sur la mer,
	// loin de tout rai, ce qui les fait lire comme du bruit d'image plutot que
	// comme de la poussiere en suspension.
	//
	// On les multiplie donc par une PUISSANCE de `beam` : la ou la lumiere est
	// pleine ca ne change rien (1 a n'importe quelle puissance vaut 1), et le
	// halo s'eteint vite. Au cube il restait des grains sur la mer ; a la
	// puissance 5 le halo tombe a 0,002 et le coeur du rai est intact.
	// « essaye d'en mettre juste ou y a de la lumiere » — Paul, 2026-09-22.
	//
	// La poussiere est ainsi plus SELECTIVE que la lumiere, ce qui est aussi
	// vrai dans la realite : on ne la voit que dans le trait franc du rai, pas
	// dans la clarte diffuse autour.
	float lit = beam * beam;
	float dust = dust_motes(px) * lit * lit * beam;
	COLOR = vec4(tint.rgb, 1.0) * beam * fade * (strength + dust);
}
