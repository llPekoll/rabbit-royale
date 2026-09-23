shader_type canvas_item;
// LE CONTOUR DE CE QU'ON TIENT (burrow.gd, amenager) : un pixel blanc autour
// de la silhouette, puis un pixel sombre autour du blanc — pris aux voisins de
// la texture, donc des pixels PEINTS, qui grandissent avec le sprite comme le
// reste du pixel art. Le blanc seul se perdait sur un arbre d'automne deja
// creme ; le sombre derriere le detache de tout ce qu'il survole, herbe,
// feuillage ou eau.
uniform vec4 line : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec4 rim : source_color = vec4(0.17, 0.11, 0.08, 0.85);
// L'epaisseur d'UN trait en texels : un sprite reduit (un arbre a 0,5) garde
// ainsi des traits d'un pixel DU SOL, au lieu d'un demi-pixel qui s'efface
// (burrow.gd `_outline_for`).
uniform float texels = 1.0;

float near(sampler2D tex, vec2 uv, vec2 p) {
	return max(max(texture(tex, uv + vec2(p.x, 0.0)).a, texture(tex, uv - vec2(p.x, 0.0)).a),
		max(texture(tex, uv + vec2(0.0, p.y)).a, texture(tex, uv - vec2(0.0, p.y)).a));
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	if (c.a < 0.5) {
		vec2 p = TEXTURE_PIXEL_SIZE * texels;
		if (near(TEXTURE, UV, p) > 0.5) {
			COLOR = line;
		} else if (near(TEXTURE, UV, p * 2.0) > 0.5
				|| max(max(texture(TEXTURE, UV + p).a, texture(TEXTURE, UV - p).a),
					max(texture(TEXTURE, UV + vec2(p.x, -p.y)).a, texture(TEXTURE, UV + vec2(-p.x, p.y)).a)) > 0.5) {
			COLOR = rim;
		} else {
			COLOR = vec4(0.0);
		}
	}
}
