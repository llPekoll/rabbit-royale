extends RefCounted
class_name LightningFx
## LA FOUDRE DU SPECTATEUR — porte de IslandScene.ts `playLightning` et de
## fx/Electrocute.ts, dessinee au shader (lightning_bolt.gdshader) depuis le
## 2026-09-25 : les planches pixel (lightning-1/-2, lightning-bolt) tombaient
## de 64 px, l'eclair part maintenant DU HAUT DE L'ECRAN jusqu'au pied.
##
## Deux usages :
##
##   • LA FRAPPE, un seul eclair au centre du carre frappe.
##   • LE GRAND, sur un lapin touche seulement — c'est lui qui le foudroie.
##
## Ancre au PIED : le noeud est pose sur la case (ou le lapin), le rectangle
## du shader monte de la jusqu'au-dessus du bord haut de l'ecran.

const SHADER := preload("res://shaders/lightning_bolt.gdshader")

## Largeur du rectangle du shader en pixels d'ECRAN (le halo s'y etale ; le
## coeur blanc, lui, fait quelques pixels).
const WIDTH := 180.0
## Au-dessus du bord haut, pour que le fondu du shader soit hors champ.
const TOP_MARGIN := 60.0
## Allume, un trou (le « double coup » d'un vrai eclair), puis s'eteint.
const HOLD_S := 0.1
const GAP_S := 0.05
const FADE_S := 0.3
## LES ETINCELLES DU PIED, en pixels d'ecran : une gerbe au premier coup,
## une autre au second, qui jaillissent et retombent.
const SPARKS := 26
const SPARK_LIFE_S := 0.45
const SPARK_SPEED := Vector2(90.0, 220.0)
const SPARK_GRAVITY := 900.0
const SPARK_SIZE := Vector2(2.0, 4.0)
## L'eclair touche le lapin tout de suite : plus d'images de chute.
const BIG_LANDS_S := 0.05

## Dans le bloc de la case, au-dessus du sol et du chiffre (`blastDepth` 9).
const Z_BOLT := 9


## UN SEUL ECLAIR, sur la premiere case de `cells` (le centre du carre) : les
## autres cases s'ouvrent par `tile_revealed`, sans eclair a elles.
static func strike(host: Node, terrain: BurrowTerrain, cells: Array[Vector2i], indices: Array[int]) -> void:
	if cells.is_empty() or not is_instance_valid(terrain):
		return
	var bolt := _bolt(float(indices[0] if not indices.is_empty() else 0))
	if not terrain.mount_veil(cells[0], bolt, Z_BOLT):
		bolt.free()
		return
	_arm(bolt, WIDTH, 1.0)


## LE GRAND ECLAIR, au pied `at` du lapin, trie a `z`.
static func big_bolt(host: Node, at: Vector2, z: int) -> void:
	var bolt := _bolt(at.x * 0.013 + at.y * 0.007)
	bolt.position = at
	bolt.z_index = z
	host.add_child(bolt)
	_arm(bolt, WIDTH, 1.0)


## Le pied (Node2D) et son rectangle de shader, encore sans taille.
static func _bolt(seed: float) -> Node2D:
	var foot := Node2D.new()
	var rect := ColorRect.new()
	# Un Control sur l'ile mange les tapes s'il ne les ignore pas.
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("seed", fmod(seed * 0.618, 97.0))
	rect.material = mat
	foot.add_child(rect)
	return foot


## Une fois dans l'arbre : le rectangle monte du pied au haut de l'ecran, puis
## la vie de l'eclair — allume, un trou, rallume, s'eteint.
static func _arm(foot: Node2D, width_px: float, impact: float) -> void:
	var rect := foot.get_child(0) as ColorRect
	var mat := rect.material as ShaderMaterial
	var xf := foot.get_global_transform_with_canvas()
	var s := maxf(absf(xf.get_scale().y), 0.001)
	var h := maxf(xf.origin.y + TOP_MARGIN, 64.0) / s
	var w := width_px / s
	rect.position = Vector2(-w * 0.5, -h)
	rect.size = Vector2(w, h)
	mat.set_shader_parameter("y_size", h / w)
	mat.set_shader_parameter("impact", impact)
	var sparks := _sparks(s, impact)
	foot.add_child(sparks)
	sparks.emitting = true
	var life := func(v: float) -> void: mat.set_shader_parameter("life", v)
	var tw := foot.create_tween()
	tw.tween_interval(HOLD_S)
	tw.tween_callback(life.bind(0.15))
	tw.tween_interval(GAP_S)
	tw.tween_callback(life.bind(1.0))
	tw.tween_callback(sparks.restart)
	tw.tween_method(life, 1.0, 0.0, FADE_S).set_ease(Tween.EASE_IN)
	# Le noeud part quand la derniere etincelle est retombee.
	tw.tween_interval(maxf(0.0, SPARK_LIFE_S - FADE_S))
	tw.tween_callback(foot.queue_free)


## La gerbe : des carres de pixel blancs qui virent au bleu et s'eteignent,
## tires vers le haut en eventail. `s` = echelle du pied a l'ecran, pour que
## les tailles et vitesses soient en pixels d'ecran quel que soit le zoom.
static func _sparks(s: float, impact: float) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.one_shot = true
	p.explosiveness = 0.9
	p.amount = maxi(6, int(SPARKS * impact))
	p.lifetime = SPARK_LIFE_S
	p.randomness = 0.4
	p.local_coords = true
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 6.0 / s
	p.direction = Vector2(0, -1)
	p.spread = 28.0
	p.initial_velocity_min = SPARK_SPEED.x / s
	p.initial_velocity_max = SPARK_SPEED.y / s
	p.gravity = Vector2(0, SPARK_GRAVITY / s)
	p.damping_min = 20.0 / s
	p.damping_max = 60.0 / s
	p.scale_amount_min = SPARK_SIZE.x / s
	p.scale_amount_max = SPARK_SIZE.y / s
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 1.0, 1.0, 1.0))
	ramp.set_color(1, Color(0.35, 0.5, 1.0, 0.0))
	ramp.add_point(0.35, Color(0.75, 0.9, 1.0, 1.0))
	p.color_ramp = ramp
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	p.material = add
	return p
