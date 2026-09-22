shader_type canvas_item;
// LE TEMOIN : un aplat, zero calcul. Si les fps ne remontent pas avec CA,
// le cout n'est pas le shader mais le fait de couvrir l'ecran d'une couche
// transparente de plus.
uniform vec4 shade : source_color = vec4(0.063, 0.125, 0.227, 1.0);
uniform float alpha : hint_range(0.0, 1.0) = 0.32;
void fragment() {
	COLOR = vec4(shade.rgb, alpha * 0.5);
}
