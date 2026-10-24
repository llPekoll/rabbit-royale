shader_type canvas_item;
render_mode unshaded;
#include "res://shaders/shore_water_common.gdshaderinc"
uniform vec2 draw_origin;
varying vec2 world_pixel;
void vertex() { world_pixel = VERTEX + draw_origin; }
void fragment() { COLOR = vec4(shore_water(world_pixel).rgb, 1.0); }
