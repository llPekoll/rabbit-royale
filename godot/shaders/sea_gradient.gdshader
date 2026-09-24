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

// ── LE SOLEIL SUR L'EAU (essai du 2026-09-24) ─────────────────────────────
// Le motif des rais (god_rays.gdshader), lu ICI plutot que dans un voile
// par-dessus l'ile. « je les aime pas trop en god rays mais en texture de la
// mer je pense qu'il marcherait de ouf ». Meme source, meme bruit cuit, meme
// seuil : c'est le meme ciel, simplement vu sur l'eau au lieu de l'air.
//
// DANS LA MEME PASSE, et c'est tout le gain : le voile des rais remplissait
// l'ecran une deuxieme fois en additif ; ici ce sont deux lectures de texture
// de plus dans un fragment qu'on payait deja. L'ile, dessinee par-dessus,
// cache le motif la ou il n'a rien a faire.
//
// A PLAT, SUR LE PLAN ISO. L'eventail angle/distance des rais se lisait
// comme un projecteur ; ici le bruit est pose sur le sol de l'ile, dans le
// repere de ses cases (44x24), donc ecrase comme le terrain.
// « j'aimerais la texture plus plate projetee sur l'iso du terrain ».
//
// 0 eteint.
uniform float sun_strength : hint_range(0.0, 2.0) = 0.0;
// La demi-case a l'ecran, en pixels : le repere du plan iso.
uniform vec2 sun_half_tile = vec2(22.0, 12.0);
// Combien de texture par case. Petit = grandes plaques.
uniform float sun_scale = 0.02;
// L'etirement du bruit le long de l'axe y DU SOL, avant la projection : les
// plaques s'allongent en suivant une rangee de cases, puis sont ecrasees en iso
// avec elle. 1 = rondes.
uniform float sun_stretch = 3.0;
// La derive, en texture par seconde, dans le repere du sol.
uniform vec2 sun_drift = vec2(0.004, 0.002);
uniform float sun_morph = 0.05;
uniform float sun_coverage = 0.55;
uniform float sun_edge = 0.06;
// Le grain de lecture, en pixels d'ecran : des bords de plaque en escalier,
// comme le reste du pixel art.
uniform float sun_pixel = 3.0;
// Le mode de fusion de la plaque sur la mer : 0 melange, 1 additif,
// 2 ecran, 3 incrustation, 4 lumiere douce, 5 produit.
uniform int sun_blend = 0;
uniform vec4 sun_tint : source_color = vec4(0.6, 0.9, 1.0, 1.0);
uniform sampler2D sun_noise : filter_linear, repeat_enable;

float sun_beam(vec2 uv) {
	vec2 px = floor(uv * size / sun_pixel) * sun_pixel;
	// Ecran -> cases : u vers le bas-droite, v vers le bas-gauche.
	vec2 q = px / sun_half_tile;
	vec2 g = vec2(q.x + q.y, q.y - q.x) * 0.5;
	g.y /= max(sun_stretch, 0.0001);
	vec2 at = g * sun_scale + TIME * sun_drift;
	float phase = TIME * sun_morph;
	float k = fract(phase);
	vec2 jump = vec2(0.41, 0.67);
	float na = texture(sun_noise, at + floor(phase) * jump).r;
	float nb = texture(sun_noise, at + (floor(phase) + 1.0) * jump).r;
	float n = mix(na, nb, k * k * (3.0 - 2.0 * k));
	return smoothstep(sun_coverage - sun_edge, sun_coverage + sun_edge, n);
}


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

	vec3 col = mix(sea.rgb, deep.rgb, clamp(t, 0.0, 1.0));
	if (sun_strength > 0.0) {
		// VERS UNE EAU CLAIRE, PAS VERS LE BLANC. L'additif blanc delavait la
		// mer (« hyper moche c'est trop blanc ») : on melange vers une teinte
		// d'eau peu profonde, donc la plaque reste de la mer.
		float b = clamp(sun_beam(uv) * sun_strength, 0.0, 1.0);
		vec3 t = sun_tint.rgb;
		vec3 lit = t;
		if (sun_blend == 1) {
			lit = col + t;
		} else if (sun_blend == 2) {
			lit = 1.0 - (1.0 - col) * (1.0 - t);
		} else if (sun_blend == 3) {
			lit = mix(2.0 * col * t, 1.0 - 2.0 * (1.0 - col) * (1.0 - t), step(0.5, col));
		} else if (sun_blend == 4) {
			lit = (1.0 - 2.0 * t) * col * col + 2.0 * t * col;
		} else if (sun_blend == 5) {
			lit = col * t;
		}
		col = mix(col, clamp(lit, 0.0, 1.0), b);
	}
	COLOR = vec4(col, 1.0);
}
