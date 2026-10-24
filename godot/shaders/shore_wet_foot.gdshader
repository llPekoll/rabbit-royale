shader_type canvas_item;
render_mode unshaded;
#include "res://shaders/shore_water_common.gdshaderinc"
uniform bool enabled = true;
uniform vec2 field_origin = vec2(0.0);
uniform vec2 field_scale = vec2(1.0);
varying vec2 world_pixel;
varying vec4 sprite_tint;
void vertex() {
	world_pixel = ((MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy - field_origin) / field_scale;
	sprite_tint = COLOR;
}
void fragment() {
	vec4 c = texture(TEXTURE, UV) * sprite_tint;
	if (enabled && c.a > 0.0) {
		vec2 uv = (floor(world_pixel) - shore_origin + 0.5) / shore_size;
		vec4 mask = texture(shore_distance, uv);
		// The 1.0476x ground sprites and the world-pixel mask can disagree
		// at their last texel. Extend only depth into that one-pixel fringe;
		// the dry-land channel still protects every emerged terrain pixel.
		vec2 px = 1.0 / shore_size;
		float submerged_depth = max(mask.b, max(max(texture(shore_distance, uv + vec2(px.x, 0.0)).b,
			texture(shore_distance, uv - vec2(px.x, 0.0)).b), max(texture(shore_distance, uv + vec2(0.0, px.y)).b,
			texture(shore_distance, uv - vec2(0.0, px.y)).b)));
		if (mask.g >= 0.5 && c.r > c.g * 1.04) {
			// A narrow damp-earth band immediately above the foam. Restrict
			// it to brown cliff pixels so low grassy slopes keep their colour.
			c.rgb = mix(c.rgb, c.rgb * vec3(0.55, 0.66, 0.72), mask.a * 0.72);
		} else if (mask.g < 0.5) {
			// Subpixel remnants can fall outside both baked channels. They
			// belong to the sea too; never leave their original dark soil raw.
			float depth = submerged_depth > 0.0 ? submerged_depth * 32.0 : 11.0;
			vec4 water = shore_water(world_pixel);
			// Keep the first submerged strata readable, then dissolve their
			// contrast and old dark foot into exactly the surrounding sea.
			float visibility = 0.90 * exp(-depth * 0.14);
			visibility *= 1.0 - smoothstep(6.0, 11.0, depth);
			vec3 submerged = mix(c.rgb * vec3(0.60, 0.91, 1.12), water.rgb, 0.30);
			c.rgb = mix(water.rgb, submerged, visibility * (1.0 - water.a));
		}
	}
	COLOR = c;
}
