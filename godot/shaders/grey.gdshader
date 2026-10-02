shader_type canvas_item;
// Ce qui n'est pas encore a toi : la meme image, en gris (Snack Time, les
// carottes du lendemain). COLOR porte deja la texture en Godot 4.

uniform float dim : hint_range(0.0, 1.0) = 0.7;

void fragment() {
	float g = dot(COLOR.rgb, vec3(0.3, 0.59, 0.11));
	COLOR.rgb = vec3(g * dim);
}
