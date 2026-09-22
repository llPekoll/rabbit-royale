shader_type canvas_item;
// L'IRIS — une nappe sombre PERCEE d'un trou en forme de lapin.
//
// Porte de src/game/fx/ShapeWipe.ts.
//
// POURQUOI UN TROU ET PAS UN SPRITE, et c'est tout le sujet : « la forme doit
// etre ce a travers quoi on VOIT. Dessiner une carotte par-dessus l'ecran
// serait un autocollant ; en decouper une dans le noir fait du noir l'objet et
// du jeu la lumiere derriere. Tout le truc est dans le NEGATIF. »
//
// Le premier essai peignait la silhouette en sombre — donc l'autocollant, pile
// ce que la note met en garde de ne pas faire. Paul, sur la capture : « c'est
// l'inverse lol ». Le trou retrecit (iris out), l'ecran est brievement tout
// sombre, puis il rouvre sur l'autre lieu (iris in).
//
// LE MASQUE EST LU DANS UN CARRE CENTRE, mis a l'echelle par `aperture`. On ne
// met pas le noeud a l'echelle : il doit couvrir tout l'ecran en permanence —
// c'est la NAPPE. Seul le trou dedans change de taille.

// La silhouette : opaque la ou le trou doit etre, transparente autour.
//
// `filter_nearest` ET `repeat_disable`, et les deux comptent :
//
//   • NEAREST parce que ce masque est un pixel art de 18x24 agrandi environ
//     quatre-vingt-dix fois. En lineaire — le defaut d'un sampler sans hint —
//     ses bords sortent FLOUS, ce qui trahit le procede : tout le reste de
//     l'ecran est du pixel art net, et le seul contour adouci se lit comme un
//     defaut d'affichage. Paul, sur la capture : « fait attention les bords
//     sont blurry, fait attention au pixel perfect ». Le trou doit avoir des
//     marches d'escalier franches, comme la silhouette dessinee.
//   • REPEAT_DISABLE en ceinture et bretelles : le fragment garde deja son
//     test de bornes, mais un mode repeat carrelerait des lapins sur tout
//     l'ecran si ce test sautait un jour.
uniform sampler2D shape : filter_nearest, repeat_disable;
// La taille du trou, en part du plus petit cote de l'ecran. 0 = ferme.
uniform float aperture : hint_range(0.0, 4.0) = 0.0;
// Le rapport largeur/hauteur de l'ecran, pour que le lapin ne s'etire pas.
uniform float screen_aspect = 2.225;
// Le rapport de la silhouette elle-meme (18/24).
uniform float shape_aspect = 0.75;
// La couleur de la nappe — le fond du jeu, pas du noir pur.
uniform vec4 sheet : source_color = vec4(0.051, 0.067, 0.09, 1.0);

void fragment() {
	if (aperture <= 0.0001) {
		// FERME : la nappe est pleine. Ce cas est explicite plutot que laisse
		// a la division ci-dessous, qui exploserait a zero.
		COLOR = sheet;
	} else {
		// Du pixel vers les coordonnees du masque, centrees sur l'ecran.
		vec2 d = UV - vec2(0.5);
		// L'ECRAN EST LARGE : sans cette correction le lapin s'etale en
		// largeur. On ramene en proportions carrees avant d'appliquer celles
		// de la silhouette.
		d.x *= screen_aspect;
		d.x /= shape_aspect;
		vec2 uv = d / aperture + vec2(0.5);

		float hole = 0.0;
		// Hors du carre du masque il n'y a pas de trou — et il FAUT le dire :
		// une texture en mode repeat carrelerait des lapins sur tout l'ecran.
		if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
			hole = texture(shape, uv).a;
		}
		// LE NEGATIF : la nappe tient partout SAUF dans la silhouette.
		COLOR = vec4(sheet.rgb, sheet.a * (1.0 - hole));
	}
}
