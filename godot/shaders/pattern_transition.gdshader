shader_type canvas_item;

// Transition par motif — port de « Transition with a Pattern Texture »
// (Ultipuk, CC0, https://godotshaders.com/shader/transition-with-a-pattern-texture/).
// Les #define de l'original sont devenus des uniformes pour le banc, et la
// division par une fenetre nulle est gardee (0/0 au centre de chaque tuile).

/** Avancement de la transition, pilote par script. */
uniform float progress: hint_range(0.0, 1.0) = 0.0;
/** Largeur du front, en fraction d'UV. */
uniform float width: hint_range(0.0, 1.0) = 0.5;

/** Le motif (alpha compris), module par COLOR. Bord transparent obligatoire :
*   repeat_disable etire le dernier pixel. */
uniform sampler2D tile_texture: source_color, repeat_disable;
/** Taille d'une tuile en pixels ecran. */
uniform float tile_pixel_size = 32.0;
/** Echelle max de la tuile une fois le front passe. */
uniform float tile_grown_scale: hint_range(0.0, 16.0) = 2.0;

/** Canal rouge : quand chaque endroit se couvre (noir d'abord). */
uniform sampler2D transition_texture;

/** USE_CLOSING : couvre jusqu'a 0.5, puis decouvre dans l'autre sens. */
uniform bool closing = false;
/** REMOVE_DISTORTION : une tuile = une seule valeur de transition. */
uniform bool remove_distortion = false;

void fragment() {
	vec2 tile_uv = fract(FRAGCOORD.xy / tile_pixel_size);

	vec2 transition_uv = UV;
	if (remove_distortion) {
		vec2 tiles = vec2(1.0 / SCREEN_PIXEL_SIZE / tile_pixel_size);
		transition_uv = ceil(UV * tiles) / tiles;
	}

	float part;
	float transition = texture(transition_texture, transition_uv).r;
	if (closing && progress > 0.5) {
		part = (1.0 - (progress - 0.5) * 2.0) * (1.0 + 2.0 * width) - width;
		transition = 1.0 - transition;
	} else if (closing) {
		part = 2.0 * progress * (1.0 + 2.0 * width) - width;
	} else {
		part = progress * (1.0 + 2.0 * width) - width;
	}

	float window = clamp(width + (part - transition) / max(width, 0.0001), 0.0, 1.0);

	tile_uv = tile_uv * 2.0 - 1.0;
	tile_uv /= max(window * tile_grown_scale, 0.0001);
	tile_uv = (tile_uv + 1.0) * 0.5;

	COLOR *= texture(tile_texture, tile_uv);
}
