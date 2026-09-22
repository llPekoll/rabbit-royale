shader_type canvas_item;
// LA PROFONDEUR SOUS L'ILE, comme un degrade plutot que comme une mer plate.
//
// Porte de src/game/fx/SeaGradient.ts.
//
// Le fond ETAIT l'eau : une couleur d'un bord a l'autre. Sur un ecran large ca
// se lit comme une feuille de papier bleu avec une ile collee dessus — rien ne
// dit que l'ile est POSEE DANS quelque chose. Ce qu'un peintre ferait, c'est
// eclairer la plate-forme peu profonde sur laquelle la terre se tient et
// laisser l'eau s'assombrir en s'en eloignant.
//
// RADIAL, ET POURQUOI CE N'EST PAS CONCENTRIQUE. Un degrade rond centre sur
// l'ile se lit comme un projecteur : le treillis fait 44x24, donc l'ile est
// bien plus large que haute, et un cercle autour d'elle laisse l'eau pale
// au-dessus et au-dessous de la cote et sombre aux pointes. `aspect` etire la
// chute sur X, et `angle` bascule le resultat sur la diagonale propre de
// l'ile, pour que la flaque ait la forme de ce qu'elle eclaire.
//
// QUANTIFIE. Une rampe lisse est la seule chose qui trahisse un post-process
// pose sur du pixel art — les tuiles ont une palette fixe, un degrade de 256
// paliers non. On quantifie LA RAMPE et non la couleur : echelonner le melange
// garde le resultat sur la ligne entre les deux couleurs choisies, donc aucun
// palier ne peut deriver vers une teinte qu'aucune des deux ne possede.
// Echelonner le rgb final — ce que faisait l'ancien shader — est ce qui donnait
// au banding une couleur propre.

uniform vec2 size = vec2(890.0, 400.0);
uniform vec4 sea : source_color = vec4(0.051, 0.373, 0.549, 1.0);
uniform vec4 deep : source_color = vec4(0.118, 0.667, 0.769, 1.0);
uniform vec2 center = vec2(0.5, 0.55);
uniform float radius = 0.5;
uniform float aspect = 3.25;
uniform float softness = 0.56;
uniform float strength = 1.0;
uniform float angle = 3.054;
uniform float steps = 40.0;

void fragment() {
	vec2 uv = UV;

	// L'ECART EST MESURE EN PIXELS, pas dans l'UV 0..1.
	//
	// Le cadre n'est pas carre, donc une rotation appliquee a des coordonnees
	// normalisees sort CISAILLEE : le grand axe de l'ellipse se tord en
	// tournant et la forme cesse d'etre une ellipse sauf a 0 et 90 degres.
	// Remultiplier par `size` rend le plan carre, la rotation y est honnete, et
	// rediviser par size.y a la fin remet le rayon a l'echelle qu'il avait — une
	// part de la HAUTEUR du cadre, pour que la molette garde le sens avec lequel
	// elle a ete reglee.
	vec2 d = (uv - center) * size;
	float ca = cos(angle);
	float sa = sin(angle);
	d = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
	d.x /= max(aspect, 0.0001);
	float r = length(d) / size.y / max(radius, 0.0001);

	// 1 au centre, 0 au large. `softness` elargit la bande sur laquelle la
	// rampe se fait ; a 0 c'est un disque franc, ce qui est un look legitime
	// sur du pixel art et merite de rester atteignable.
	float t = 1.0 - smoothstep(1.0 - clamp(softness, 0.0, 1.0), 1.0, r);
	t *= strength;

	if (steps > 0.5) {
		t = floor(t * steps + 0.5) / steps;
	}

	COLOR = vec4(mix(sea.rgb, deep.rgb, clamp(t, 0.0, 1.0)), 1.0);
}
