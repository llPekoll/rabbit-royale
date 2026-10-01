// LES ICONES DES ILOTS (DIG, DEFEND, RAID) : un liseré blanc autour du dessin,
// et un reflet blanc qui les traverse en diagonale quand `shine` passe de
// -0.3 a 1.3 (burrow_landmarks.gd `_glint`, une icone a la fois).
//
// Les icones n'ont pas de marge transparente — le dessin touche les bords —
// alors le quad grandit de `outline_px + 1` texels de chaque cote, et ce qui
// tombe hors de la texture se lit transparent.
shader_type canvas_item;

// L'epaisseur du liseré, en texels de la texture (le script la convertit
// depuis des pixels du monde : les trois icones n'ont pas la meme densite).
uniform float outline_px = 1.5;
uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
// Le reflet : sa position le long de la diagonale (0 en haut a gauche, 1 en
// bas a droite), hors de [0, 1] il n'est pas sur l'icone.
uniform float shine = -1.0;
// La bande en texels de diagonale : un coeur plein, un bord plus doux —
// net au pixel, pas un degrade (l'art est en pixels).
uniform float shine_core = 1.5;
uniform float shine_edge = 3.0;

void vertex() {
	vec2 texels = 1.0 / TEXTURE_PIXEL_SIZE;
	float pad = outline_px + 1.0;
	vec2 dir = UV * 2.0 - 1.0;
	VERTEX += dir * pad;
	UV = (UV * texels + dir * pad) / texels;
}

float alpha_at(sampler2D tex, vec2 uv) {
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
		return 0.0;
	}
	return texture(tex, uv).a;
}

void fragment() {
	vec2 uv = UV;
	bool inside = uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
	vec4 col = inside ? texture(TEXTURE, uv) : vec4(0.0);

	// LE LISERÉ : le plus opaque des voisins sur un cercle de `outline_px`.
	float ring = 0.0;
	for (int i = 0; i < 12; i++) {
		float a = float(i) * 6.2831853 / 12.0;
		vec2 off = vec2(cos(a), sin(a)) * outline_px * TEXTURE_PIXEL_SIZE;
		ring = max(ring, alpha_at(TEXTURE, uv + off));
	}
	ring = step(0.5, ring);
	float edge = ring * (1.0 - step(0.5, col.a));
	vec4 result = mix(col, outline_color, edge);
	result.a = max(col.a, edge * outline_color.a);

	// LE REFLET : une bande diagonale calee sur la grille des texels, posee
	// sur le dessin et son liseré.
	vec2 texels = 1.0 / TEXTURE_PIXEL_SIZE;
	vec2 cell = floor(uv * texels);
	float diag = cell.x + cell.y;
	float at = mix(-shine_edge, texels.x + texels.y + shine_edge, shine);
	float dist = abs(diag - at);
	float band = dist <= shine_core ? 0.85 : (dist <= shine_edge ? 0.4 : 0.0);
	result.rgb = mix(result.rgb, vec3(1.0), band * step(0.5, result.a));

	// PAS `* COLOR.a` : en entree, COLOR est deja multiplie par la texture —
	// son alpha est nul partout ou le dessin est transparent, et le liseré
	// n'apparaissait qu'hors du quad.
	COLOR = result;
}
