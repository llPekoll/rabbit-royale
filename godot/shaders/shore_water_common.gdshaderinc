// World pixels keep both the ripples and the contact attached while panning.
uniform sampler2D shore_distance : filter_nearest, repeat_disable;
uniform vec2 shore_origin;
uniform vec2 shore_size;
uniform float distance_range = 96.0;
uniform float time_override = -1.0;
uniform bool foam_enabled = true;
uniform bool painted_surface = true;
uniform float wave_speed = 2.0;
uniform float surface_speed = 2.0;
uniform sampler2D water_art : source_color, filter_linear, repeat_disable;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
		mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
}

vec2 mirror_uv(vec2 uv) {
	// Fold the painting at its edges, avoiding a visible repeat seam.
	return 1.0 - abs(mod(uv, 2.0) - 1.0);
}

vec3 painted_water(vec2 p, float d, float t) {
	// A quiet painted bed underneath moving, much finer surface reflections.
	// Only the moving water uses this clock; star glints keep unscaled t.
	float surface_time = t * surface_speed;
	vec2 flow = vec2(sin(p.y * 0.014 + surface_time * 0.55) * 2.4,
		cos(p.x * 0.010 - surface_time * 0.40) * 1.2);
	vec2 uv = (p + flow + vec2(surface_time * 1.4, -surface_time * 0.45)) / vec2(560.0, 360.0);
	vec3 paint = texture(water_art, mirror_uv(uv)).rgb;
	vec3 bed = texture(water_art, mirror_uv(p / vec2(970.0, 640.0) + vec2(0.37, 0.61))).rgb;
	float pools = smoothstep(0.25, 0.72, bed.g);
	float shallows = 1.0 - smoothstep(4.0, 94.0, d);
	float depth = clamp(shallows * 0.87 + pools * 0.25, 0.0, 1.0);
	vec3 col = mix(vec3(0.018, 0.31, 0.52), vec3(0.02, 0.67, 0.73), depth);
	// Retain the painted patch shapes, with restrained contrast in the deep.
	float pigment = (paint.g - 0.43) * (0.46 + shallows * 0.25);
	col += vec3(0.025, 0.24, 0.29) * pigment;
	float light = smoothstep(0.51, 0.84, paint.g);
	float breathe = 0.55 + 0.45 * sin(p.x * 0.017 + p.y * 0.023 + surface_time * 0.72);
	float reflection = light * (0.20 + 0.80 * pools) * (0.45 + breathe * 0.55);
	col = mix(col, vec3(0.18, 0.84, 0.86), reflection * (0.22 + shallows * 0.25));
	float shelf = (1.0 - smoothstep(3.0, 27.0, d)) * (0.65 + pools * 0.35);
	col = mix(col, vec3(0.06, 0.76, 0.75), shelf * 0.40);
	// Isolated sun glints: crosses and little diamonds, offset within large
	// cells and fading independently. The painting supplies the curved ribbons.
	vec2 grid = floor(p / vec2(88.0, 56.0));
	float seed = hash21(grid + vec2(71.0, 19.0));
	vec2 centre = (grid + 0.18 + vec2(seed, hash21(grid + 21.0)) * 0.64) * vec2(88.0, 56.0);
	vec2 q = abs(p - centre + vec2(sin(t * 0.9 + seed * 7.0), 0.0));
	float pulse = pow(max(0.0, sin(t * (0.65 + seed * 0.25) + seed * 47.0)), 5.0);
	float selected = step(0.68, seed) * smoothstep(13.0, 28.0, d);
	float cross = max((1.0 - smoothstep(0.3, 0.85, q.x)) * (1.0 - smoothstep(1.5, 4.5, q.y)),
		(1.0 - smoothstep(0.3, 0.85, q.y)) * (1.0 - smoothstep(1.5, 4.8, q.x)));
	float diamond = 1.0 - smoothstep(0.8, 2.0, q.x + q.y);
	float glow = exp(-dot(q / vec2(4.0, 2.7), q / vec2(4.0, 2.7))) * 0.18;
	col = mix(col, vec3(0.74, 1.0, 0.96), (max(cross, diamond) + glow) * pulse * selected);
	return col;
}
vec4 shore_water(vec2 world_pixel) {
	float t = time_override >= 0.0 ? time_override : TIME;
	vec2 p = floor(world_pixel);
	vec2 uv = (p - shore_origin + 0.5) / shore_size;
	bool in_map = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
	vec2 shore = texture(shore_distance, uv).rg;
	float d = in_map ? shore.r * distance_range : distance_range;
	float land = in_map ? shore.g : 0.0;
	float surface_time = t * surface_speed;
	vec2 drift = vec2(surface_time * 0.9, -surface_time * 0.3);
	float broad = noise((p + drift) / vec2(46.0, 21.0));
	float small = noise((p + drift * 1.4) / vec2(11.0, 5.0));
	float depth = 1.0 - smoothstep(6.0, 100.0, d + (broad - 0.5) * 25.0);
	vec3 col = mix(vec3(0.025, 0.36, 0.56), vec3(0.035, 0.67, 0.72), depth);
	// Broad, flat patches with a limited palette, rather than glittery noise.
	float patch = floor((broad * 0.7 + small * 0.3) * 7.0) / 7.0 - 0.5;
	col += vec3(0.015, 0.12, 0.14) * patch;
	float shoal = (1.0 - smoothstep(4.0, 29.0, d)) * (0.7 + broad * 0.3);
	col = mix(col, vec3(0.08, 0.76, 0.75), shoal * 0.55);
	// Narrow submerged contact: a dark foot, with clear water immediately out.
	float contact = (1.0 - smoothstep(0.0, 2.8, d)) * (0.4 + small * 0.3);
	col = mix(col, vec3(0.04, 0.34, 0.39), contact);
	vec2 grid = floor((p + drift) / vec2(22.0, 11.0));
	vec2 cell = mod(p + drift, vec2(22.0, 11.0));
	float rnd = hash21(grid);
	float ripple = step(0.83, rnd) * step(4.0, cell.x) * step(cell.x, 9.0 + rnd * 4.0)
		* step(5.0, cell.y) * step(cell.y, 6.0) * (0.5 + 0.5 * sin(surface_time * 0.8 + rnd * 38.0));
	col = mix(col, vec3(0.32, 0.83, 0.84), ripple * 0.32);
	if (painted_surface) {
		col = painted_water(p, d, t);
		// The validated dark intersection stays at the exact same waterline.
		col = mix(col, vec3(0.04, 0.34, 0.39), contact);
	}
	float coverage = 0.0;
	if (foam_enabled && land < 0.5) {
		float wave_time = t * wave_speed;
		// Local phases, holes and broken outer crests: never one pulsing outline.
		float along = noise(p / vec2(12.0, 7.0));
		float grain = noise(p / vec2(3.0, 2.0) + vec2(wave_time * 0.15, 0.0));
		float phase = wave_time + along * 7.0;
		float reach = 1.4 + sin(phase) * 0.7 + along * 1.0;
		float broken = noise(p / vec2(7.0, 4.0) + vec2(wave_time * 0.12, 0.0));
		float line = (1.0 - smoothstep(0.65, 1.55, abs(d - reach)))
			* smoothstep(0.32, 0.55, broken + 0.14 * sin(phase));
		float wash = (1.0 - smoothstep(1.0, 5.5, d)) * (0.42 + along * 0.25);
		col = mix(col, vec3(0.44, 0.87, 0.87), wash);
		float cycle = fract(wave_time * 0.14 + along * 0.55);
		float outer = (1.0 - smoothstep(0.45, 1.1, abs(d - (4.0 + cycle * 8.0))))
			* smoothstep(0.46, 0.65, grain) * sin(cycle * 3.14159);
		col = mix(col, vec3(0.78, 0.97, 0.93), outer * 0.88);
		col = mix(col, vec3(0.90, 1.0, 0.95), line * 0.94);
		coverage = max(line * 0.94, max(outer * 0.88, wash * 0.65));
	}
	return vec4(col, coverage);
}
