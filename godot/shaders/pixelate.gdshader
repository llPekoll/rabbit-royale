shader_type canvas_item;
// LE TABLEAU EN GROS PIXELS (home_background.gd) : relit l'ecran deja compose
// — les six calques, la parallaxe, le reflet du soleil — et le repeint en
// blocs carres. Une seule couleur par bloc, la moyenne de quatre prises dans
// ses quarts : un point unique au centre faisait scintiller les aretes fines
// (les aiguilles des sapins, l'ecume) quand la parallaxe glisse dessous.
uniform sampler2D screen : hint_screen_texture, filter_linear;
// Le cote d'un bloc en pixels d'ECRAN, arrondi par le script.
uniform float block = 8.0;

void fragment() {
	vec2 origin = floor(FRAGCOORD.xy / block) * block;
	vec2 q = vec2(block * 0.25);
	vec2 c = origin + vec2(block * 0.5);
	vec3 sum = texture(screen, (c + vec2(-q.x, -q.y)) * SCREEN_PIXEL_SIZE).rgb
		+ texture(screen, (c + vec2(q.x, -q.y)) * SCREEN_PIXEL_SIZE).rgb
		+ texture(screen, (c + vec2(-q.x, q.y)) * SCREEN_PIXEL_SIZE).rgb
		+ texture(screen, (c + vec2(q.x, q.y)) * SCREEN_PIXEL_SIZE).rgb;
	COLOR = vec4(sum * 0.25, 1.0);
}
