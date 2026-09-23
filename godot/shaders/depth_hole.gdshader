shader_type canvas_item;
// LE TROU DE PROFONDEUR — ce qui se tient devant le lapin est perce d'un disque
// trame autour de lui, pour qu'un sapin ne l'avale pas.
//
// Porte de src/game/fx/DepthHole.ts (le filtre) et config/depthHoleLook.ts
// (le reglage). Le web le fait en FILTRE, une passe par sprite perce ; ici
// c'est le materiau du sprite lui-meme, pose seulement sur ce qui est DEVANT
// le lapin et a portee (island.gd `_refresh_hole`) — le choix de profondeur
// se fait sur le CPU, ou l'on connait les cases, et le shader ne fait que le
// disque.
//
// TRAME ET NON FONDU : un trou lisse se lit comme un flou pose sur l'art ; une
// trame ordonnee de Bayer garde des pixels francs — le trou est lui aussi du
// pixel art. Ce qui reste d'un pixel coupe est un fantome a `ghost`.

// Le centre du trou, en pixels de la FENETRE (FRAGCOORD) : island.gd y passe
// la transformation d'etirement du viewport.
uniform vec2 centre = vec2(-1000.0);
uniform float radius = 35.0;
uniform float feather = 11.0;
// La taille d'un point de trame, en pixels de fenetre.
uniform float dot_px = 1.0;
// 3 bits = une matrice 8x8 (`matrix: 8`).
uniform float bits = 3.0;
uniform float ghost = 0.1;

// La valeur de Bayer d'une cellule, par la recurrence bit a bit du web — un
// XOR sans XOR entier : a + b - 2ab.
float bayer(vec2 cell, float b) {
	float size = exp2(b);
	float x = mod(cell.x, size);
	float y = mod(cell.y, size);
	float v = 0.0;
	float weight = size * size / 4.0;
	for (int i = 0; i < 3; i++) {
		if (float(i) >= b) break;
		float xb = mod(x, 2.0);
		float yb = mod(y, 2.0);
		float xr = xb + yb - 2.0 * xb * yb;
		v += (xr * 2.0 + yb) * weight;
		weight /= 4.0;
		x = floor(x / 2.0);
		y = floor(y / 2.0);
	}
	return (v + 0.5) / (size * size);
}

void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	float d = distance(FRAGCOORD.xy, centre);
	// 1 dans le rayon, glissant vers 0 au bord de la frange. Lineaire : la
	// trame adoucit deja, une courbe en plus se lit comme un flou.
	float cut = 1.0 - clamp((d - radius) / max(feather, 0.001), 0.0, 1.0);
	if (cut > 0.0 && cut > bayer(floor(FRAGCOORD.xy / max(dot_px, 1.0)), bits)) {
		c.a *= ghost;
	}
	COLOR = c;
}
