extends RefCounted
## Shared seamless camera path for the title background and the demo.
static func sample(elapsed: float, duration: float = 72.0) -> Vector3:
	var phase := fposmod(elapsed, duration) * TAU / duration
	return Vector3(
		sin(phase) * 32.0 + sin(phase * 3.0) * 4.0,
		sin(phase * 2.0) * 8.0 + sin(phase * 5.0) * 1.5,
		1.12 + (0.5 - 0.5 * cos(phase)) * 0.065
	)
