shader_type canvas_item;
// LE VOILE TRAME — un decor qui cache un chiffre se laisse voir au travers,
// d'un bout a l'autre, en trame ordonnee de Bayer.
//
// Cousin de depth_hole.gdshader : meme trame, meme contour garde, mais sans
// disque — tout le sprite est voile d'une part `amount`. Pose sur un arbre
// seulement quand il couvre une case chiffree.
//
// TRAME ET NON FONDU : un arbre a 50 % d'alpha se lit comme un fantome flou
// pose sur l'art ; une trame garde des pixels francs, le voile est lui aussi
// du pixel art.

// La part des pixels qui s'effacent : 0 = l'arbre entier, 1 = son seul fil.
uniform float amount = 0.5;
// La taille d'un point de trame, en pixels de fenetre.
uniform float dot_px = 1.0;
// Ce qui reste d'un pixel efface.
uniform float ghost = 0.0;
// LE CONTOUR GARDE, en texels de l'art (voir depth_hole) : on voit toujours
// qu'un arbre se tient la.
uniform float edge = 2.0;

float bayer8(vec2 cell) {
	float x = mod(cell.x, 8.0);
	float y = mod(cell.y, 8.0);
	float v = 0.0;
	float weight = 16.0;
	for (int i = 0; i < 3; i++) {
		float xb = mod(x, 2.0);
		float yb = mod(y, 2.0);
		float xr = xb + yb - 2.0 * xb * yb;
		v += (xr * 2.0 + yb) * weight;
		weight /= 4.0;
		x = floor(x / 2.0);
		y = floor(y / 2.0);
	}
	return (v + 0.5) / 64.0;
}

void fragment() {
	// COLOR arrive deja multiplie par la texture (Godot 4).
	vec4 c = COLOR;
	if (amount > bayer8(floor(FRAGCOORD.xy / max(dot_px, 1.0)))) {
		bool rim = false;
		if (edge > 0.0 && c.a > 0.5) {
			vec2 px = TEXTURE_PIXEL_SIZE * edge;
			float lo = min(min(texture(TEXTURE, UV + vec2(px.x, 0.0)).a,
					texture(TEXTURE, UV - vec2(px.x, 0.0)).a),
				min(texture(TEXTURE, UV + vec2(0.0, px.y)).a,
					texture(TEXTURE, UV - vec2(0.0, px.y)).a));
			rim = lo < 0.5;
		}
		if (!rim) {
			c.a *= ghost;
		}
	}
	COLOR = c;
}
