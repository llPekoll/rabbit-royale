// LE BLOOM, CALCULE EN BASSE RESOLUTION.
//
// Le glow de l'Environment rasterise sa chaine de flous a la resolution de
// l'ecran (2670x1200 sur le Seeker) : 40 fps, et un halo trop court pour se
// voir. Ici on lit les MIPMAPS de l'ecran — 1/4 et 1/16 — qui sont deja une
// moyenne floue : le flou ne coute que quelques lectures sur des textures
// minuscules, et le halo a la meme taille a toutes les resolutions.
//
// CE QUI COUTE ENCORE : la copie de l'ecran et ses mipmaps, ~6,6 ms au Seeker
// (mesure du 2026-09-23). L'intensite n'y change rien.
shader_type canvas_item;
render_mode blend_add, unshaded;

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
// Sous 1 : sans HDR 2D, aucune couleur ne depasse 1.0.
uniform float threshold = 0.65;
uniform float intensity = 0.25;
// Mip 2 = 1/4 de la resolution, mip 4 = 1/16.
uniform float near_lod = 2.0;
uniform float far_lod = 4.0;

vec3 bright(vec2 uv, float lod) {
	vec3 c = textureLod(screen, uv, lod).rgb;
	return max(c - vec3(threshold), vec3(0.0)) / (1.0 - threshold);
}

void fragment() {
	vec2 near = SCREEN_PIXEL_SIZE * exp2(near_lod);
	vec2 far = SCREEN_PIXEL_SIZE * exp2(far_lod);
	vec3 halo = bright(SCREEN_UV, near_lod) * 0.4;
	halo += (bright(SCREEN_UV + vec2(near.x, 0.0), near_lod)
		+ bright(SCREEN_UV - vec2(near.x, 0.0), near_lod)
		+ bright(SCREEN_UV + vec2(0.0, near.y), near_lod)
		+ bright(SCREEN_UV - vec2(0.0, near.y), near_lod)) * 0.15;
	halo += (bright(SCREEN_UV + far * 0.7, far_lod)
		+ bright(SCREEN_UV - far * 0.7, far_lod)
		+ bright(SCREEN_UV + vec2(far.x, -far.y) * 0.7, far_lod)
		+ bright(SCREEN_UV + vec2(-far.x, far.y) * 0.7, far_lod)) * 0.2;
	COLOR = vec4(halo * intensity, 1.0);
}
