// L'IMAGE COLLEE SUR LA PAGE DE DROITE du livre (IntroBook) : l'illustration
// ou l'ile qui joue, rendues a plat dans un SubViewport, posees ici sur la
// page courbe du livre peint — elles plongent dans la reliure et retombent au
// bord comme le papier — avec un cadre au trait du livre.
//
// LA COURBE vient de `bend` dans le book.json (IntroBook la passe en `inner`
// / `outer`) : le haut ET le bas de la page descendent de `inner` px contre
// la reliure, a plat du tiers jusqu'aux sept dixiemes, et redescendent de
// `outer` px au bord exterieur. Le livre de Shiro, moins courbe le 2026-10-15,
// dit 9,25 / 6,25 (la moitie de sa courbe d'origine, 18,5 / 12,5). Un
// decalage vertical, colonne par colonne : c'est ce que fait la page peinte.
// Le texte de la page de gauche suit le meme profil (BEND_SHADER).
//
// Tout se mesure en px de PAGE (le Control `_right`) ; `px` = la taille a
// l'ecran d'un pixel de l'image du livre. Le contour se cale sur sa grille,
// en marches comme les bords peints ; l'image, elle, glisse sans marches.
shader_type canvas_item;

// Le rect ou ce TextureRect se dessine, en px de page.
uniform vec2 origin;
uniform vec2 size;
// La page (`_right.size`) et le cadre a plat (position, taille) dedans.
uniform vec2 page;
uniform vec4 plate;
uniform float px = 1.0;
// Les descentes, en px d'image du livre : contre la reliure, au bord.
uniform float inner = 18.5;
uniform float outer = 12.5;
// La reliure est-elle a gauche de la page (page de droite) ?
uniform bool spine_left = true;
uniform vec4 ink : source_color = vec4(0.188, 0.125, 0.208, 1.0);
uniform vec4 shade : source_color = vec4(0.675, 0.51, 0.439, 1.0);

float sag(float x) {
	float u = clamp(x / page.x, 0.0, 1.0);
	if (!spine_left) {
		u = 1.0 - u;
	}
	float a = pow(max(1.0 - u / 0.33, 0.0), 1.5) * inner;
	float b = pow(max((u - 0.7) / 0.3, 0.0), 1.3) * outer;
	return a + b;
}

bool inside(vec2 q, vec2 lo, vec2 hi) {
	return q.x >= lo.x && q.y >= lo.y && q.x < hi.x && q.y < hi.y;
}

void fragment() {
	vec2 p = origin + UV * size;
	// La cellule de la grille du livre ou tombe ce pixel : la silhouette.
	vec2 cell = floor(p / px);
	vec2 c = (cell + 0.5) * px;
	vec2 qc = vec2(c.x, c.y - floor(sag(c.x) + 0.5) * px);
	vec2 q = vec2(p.x, p.y - sag(p.x) * px);
	vec2 lo = plate.xy;
	vec2 hi = plate.xy + plate.zw;
	vec4 col = vec4(0.0);
	if (inside(qc, lo, hi)) {
		col = texture(TEXTURE, clamp((q - lo) / plate.zw, vec2(0.0), vec2(1.0)));
		col.a = 1.0;
		// La gouttiere : l'image s'assombrit ou la page plonge.
		float u = spine_left ? q.x / page.x : 1.0 - q.x / page.x;
		col.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.16, u));
	} else if (inside(qc, lo - px, hi + px)) {
		col = ink;
	} else if (inside(qc - px, lo - px, hi + px)) {
		// L'ombre portee d'un pixel, en bas a droite : collee, pas imprimee.
		col = vec4(shade.rgb, 0.85);
	}
	COLOR = col;
}
