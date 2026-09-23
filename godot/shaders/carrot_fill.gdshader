shader_type canvas_item;
// LA CAROTTE QUI SE REMPLIT (ui/carrot_loader.gd).
//
// La carotte de l'icone est en diagonale, pointe en bas a gauche, fanes en
// haut a droite : elle se colore dans CE sens, de la pointe aux fanes, comme
// une carotte qui pousse. Ce qui n'est pas encore rempli est la silhouette,
// sombre et desaturee — on voit la forme a remplir des la premiere image.
//
// Le front avance PAR PIXELS de l'art (texel entier), jamais en degrade : le
// reste du jeu est du pixel art, un bord lisse s'y verrait comme une tache.

uniform float fill : hint_range(0.0, 1.0) = 0.0;
uniform vec4 shadow_tint : source_color = vec4(0.16, 0.10, 0.07, 1.0);
uniform float shadow_alpha = 0.55;

void fragment() {
	vec4 art = texture(TEXTURE, UV);
	vec2 texel = floor(UV / TEXTURE_PIXEL_SIZE);
	vec2 cells = 1.0 / TEXTURE_PIXEL_SIZE;
	// 0 a la pointe (bas-gauche), 1 aux fanes (haut-droite), par texel.
	float along = (texel.x + (cells.y - 1.0 - texel.y)) / (cells.x + cells.y - 2.0);
	if (along > fill) {
		float lum = dot(art.rgb, vec3(0.3, 0.59, 0.11));
		COLOR = vec4(mix(shadow_tint.rgb, vec3(lum), 0.18), art.a * shadow_alpha);
	} else {
		COLOR = art;
	}
}
