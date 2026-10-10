class_name PurchaseReveal
extends Control
## TU L'AS — un achat montre sur tout l'ecran, le temps d'un souffle.
##
## Un achat se disait en pastille de texte (« shield ready. -150 ») et d'un
## saut de l'art sur sa carte : le recu y etait, pas la fete. Ici la chose
## achetee jaillit au milieu de l'ecran, grande, sur des rayons a sa teinte
## qui tournent ; une onde part d'elle, une gerbe d'eclats retombe, « GOT
## IT! » claque au-dessus comme le tampon d'un niveau (stamp.gd, meme
## grammaire : « tu as fait la chose »), et son nom se pose en dessous.
##
##   • AU-DESSUS DE L'ETAL. Le tampon d'un niveau vit sur l'etage des
##     overlays, que les dialogues couvrent ; celui-ci se pose par-dessus
##     (`Chrome.over_dialogs`), puisqu'on achete l'etal ouvert.
##   • UN TAP L'ENLEVE, et il s'enleve seul en deux secondes et demie : qui
##     achete trois pieges d'affilee ne doit pas attendre trois fetes. Le tap
##     est avale — il ne ferme pas l'etal dessous.
##   • UNE FETE A LA FOIS : un nouvel achat remplace celle qui joue.

## Combien de temps la fete reste, et combien dure son depart.
const STAY_S := 2.4
const OUT_S := 0.3
## L'art, en vmin, borne ; les rayons, en multiple de l'art.
const ART_VMIN := 30.0
const ART_MIN := 96.0
const ART_MAX := 220.0
const RAYS_K := 3.4
const RAY_COUNT := 16
## Les deux lignes, en vmin, bornees.
const HEAD_VMIN := 9.0
const HEAD_MIN := 26.0
const HEAD_MAX := 56.0
const NAME_VMIN := 5.5
const NAME_MIN := 16.0
const NAME_MAX := 34.0
## La gerbe.
const SPARKS := 28
const SPARK_S := 0.9

## Plus sombre que la vignette du tampon : dessous, c'est l'etal, plein de
## mots qui se liraient a travers le cri.
const DIM := Color(8.0 / 255.0, 6.0 / 255.0, 4.0 / 255.0, 0.84)
const HEAD_SHADOW := Color("#7a3a10")

## UN SKIN se revele autrement : d'abord sa SILHOUETTE, noire, qui tremble
## sous les projecteurs ; puis un eclair blanc, et le lapin en couleurs, qui
## saute de joie. La teinte des rayons est celle du skin.
const SKIN_TINT := {"solana": Color("#9945ff"), "carrot": Color("#f28a1e"), "solflare": Color("#ffef46"), "kuro-violet": Palette.GOLD}
## La silhouette tient ce temps avant l'eclair, et la fete reste plus longtemps.
const TEASE_S := 0.75
const SKIN_STAY_S := 3.4

## La fete qui joue, pour qu'un nouvel achat la remplace.
static var _live: PurchaseReveal

var kind := ""
var qty := 1
## Un skin (Kit.SKINS) a reveler au lieu d'un objet, et son nom.
var skin := ""
var skin_name := ""
## VRAI DANS UN BANC SEULEMENT : la fete reste, pour la capture.
var linger := false

var _tint := Palette.GOLD
var _dim: ColorRect
var _rays: Control
var _glow: TextureRect
var _ring: Control
var _ring_t := 0.0
var _art: Control
var _head: Label
var _name: Label
var _sparks: Control
var _leaving := false
var _bunny: AnimatedSprite2D
var _flash: ColorRect


## FETER UN ACHAT : pose la fete au-dessus de tout (l'etal compris) et la
## rend. Sans chrome (un banc), sur la scene courante.
static func announce(bought_kind: String, bought_qty: int = 1) -> PurchaseReveal:
	if is_instance_valid(_live):
		_live.queue_free()
	var reveal := PurchaseReveal.new()
	reveal.kind = bought_kind
	reveal.qty = bought_qty
	if Chrome.current != null and is_instance_valid(Chrome.current):
		Chrome.current.over_dialogs(reveal)
	else:
		var scene := (Engine.get_main_loop() as SceneTree).current_scene
		scene.add_child(reveal)
		Kit.fill(reveal)
	_live = reveal
	return reveal


## FETER UN SKIN : la meme fete, l'objet remplace par le lapin.
static func announce_skin(key: String, display_name: String) -> PurchaseReveal:
	if is_instance_valid(_live):
		_live.queue_free()
	var reveal := PurchaseReveal.new()
	reveal.skin = key
	reveal.skin_name = display_name
	if Chrome.current != null and is_instance_valid(Chrome.current):
		Chrome.current.over_dialogs(reveal)
	else:
		# Un banc, ou une sonde sans scene courante : la racine.
		var tree := Engine.get_main_loop() as SceneTree
		var scene: Node = tree.current_scene if tree.current_scene != null else tree.root
		scene.add_child(reveal)
		Kit.fill(reveal)
	_live = reveal
	return reveal


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP


func _ready() -> void:
	_tint = SKIN_TINT.get(skin, Palette.GOLD) if not skin.is_empty() else ShopState.TINT.get(kind, Palette.GOLD)
	_build()
	resized.connect(_measure)
	gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed:
			accept_event()
			_leave())
	# Apres la premiere mise en page, comme le tampon : les pivots des tweens
	# doivent connaitre la taille etiree.
	(func() -> void:
		_measure()
		_play()).call_deferred()


func _build() -> void:
	_dim = ColorRect.new()
	_dim.color = DIM
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_dim)
	add_child(_dim)

	# Les rayons : deux teintes en alternance, l'or du kit et celle de l'objet.
	_rays = Control.new()
	_rays.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rays.draw.connect(_draw_rays)
	add_child(_rays)

	_glow = TextureRect.new()
	_glow.texture = Shop._glow_texture(_tint.lerp(Palette.GOLD, 0.5).lightened(0.2), 0.75)
	_glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_glow.stretch_mode = TextureRect.STRETCH_SCALE
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_glow.material = add
	add_child(_glow)

	# L'onde de choc : un anneau qui s'ouvre et s'eteint a l'arrivee.
	_ring = Control.new()
	_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ring.draw.connect(func() -> void:
		if _ring_t <= 0.0 or _ring_t >= 1.0:
			return
		var r := _ring.size.x * 0.5 * _ring_t
		_ring.draw_arc(_ring.size * 0.5, r, 0.0, TAU, 64,
			Color(Palette.CREAM, 1.0 - _ring_t), maxf(2.0, 10.0 * (1.0 - _ring_t)), false))
	add_child(_ring)

	_sparks = Control.new()
	_sparks.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_sparks)
	add_child(_sparks)

	_art = Control.new()
	_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_art)

	_head = Kit.label(I18N.shout(I18N.t("shop.yours")), int(HEAD_MAX), Palette.RANK_GOLD)
	_head.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_shade(_head, HEAD_SHADOW, 4)
	add_child(_head)

	var words := I18N.shout(skin_name if not skin.is_empty() else I18N.t("items.%s.name" % kind))
	if qty > 1:
		words = "%s x%d" % [words, qty]
	_name = Kit.label(words, int(NAME_MAX), Palette.CREAM)
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_shade(_name, Palette.CREAM_SHADOW, 3)
	add_child(_name)

	# L'eclair de la revelation, par-dessus tout.
	_flash = ColorRect.new()
	_flash.color = Color.WHITE
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.modulate.a = 0.0
	Kit.fill(_flash)
	add_child(_flash)


func _shade(label: Label, color: Color, drop: int) -> void:
	label.add_theme_color_override("font_shadow_color", color)
	label.add_theme_constant_override("shadow_offset_x", 0)
	label.add_theme_constant_override("shadow_offset_y", drop)


func _draw_rays() -> void:
	var c := _rays.size * 0.5
	var r := _rays.size.x * 0.5
	for i in RAY_COUNT:
		var a := TAU * float(i) / float(RAY_COUNT)
		var half := TAU / float(RAY_COUNT) * 0.28
		var color := Color(Palette.GOLD, 0.32) if i % 2 == 0 else Color(_tint.lightened(0.25), 0.3)
		Shop.draw_ray(_rays, c, r, a, half, color)


## LA MISE EN PAGE sur la taille de la fete : l'art au milieu, un peu
## au-dessus du centre, le cri au-dessus de lui, le nom en dessous.
func _measure() -> void:
	var box := size
	var vmin := minf(box.x, box.y) / 100.0
	var art_px := floorf(clampf(ART_VMIN * vmin, ART_MIN, ART_MAX))
	var head_px := int(round(clampf(HEAD_VMIN * vmin, HEAD_MIN, HEAD_MAX)))
	var name_px := int(round(clampf(NAME_VMIN * vmin, NAME_MIN, NAME_MAX)))
	_head.add_theme_font_size_override("font_size", head_px)
	_name.add_theme_font_size_override("font_size", name_px)

	# L'art se refait a sa taille : `Shop._art` pose l'ombre a la bonne echelle.
	# Le lapin, lui, se garde (son animation et sa silhouette en dependent) :
	# seule son echelle suit.
	if not skin.is_empty():
		if _bunny == null:
			_bunny = AnimatedSprite2D.new()
			_bunny.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			_bunny.sprite_frames = SkinWardrobe.frames(skin)
			_bunny.centered = false
			_bunny.play("idle")
			_art.add_child(_bunny)
		# Sur la planche, le lapin assis tient x 8-22, y 16-32 de sa case :
		# c'est LUI qu'on cadre, haut comme l'art, son milieu au milieu.
		var k := floorf(art_px / 16.0)
		_bunny.scale = Vector2(k, k)
		_bunny.position = (Vector2(art_px, art_px) * 0.5 - Vector2(15.0, 24.0) * k).floor()
	else:
		for child in _art.get_children():
			child.queue_free()
		var drawn := Shop._art(kind, I18N.t("items.%s.name" % kind), _tint, art_px)
		_art.add_child(drawn)
	_art.size = Vector2(art_px, art_px)

	var head_h := _head.get_combined_minimum_size().y
	var name_h := _name.get_combined_minimum_size().y
	var gap := floorf(art_px * 0.12)
	var total := head_h + gap + art_px + gap + name_h
	var top := floorf((box.y - total) * 0.5)
	var centre := Vector2(floorf(box.x * 0.5), top + head_h + gap + art_px * 0.5)

	_art.position = (centre - _art.size * 0.5).floor()
	_art.pivot_offset = _art.size * 0.5

	_head.size = Vector2(box.x, head_h)
	_head.position = Vector2(0.0, top)
	_head.pivot_offset = _head.size * 0.5
	_name.size = Vector2(box.x, name_h)
	_name.position = Vector2(0.0, top + head_h + gap + art_px + gap)
	_name.pivot_offset = _name.size * 0.5

	var rays_d := art_px * RAYS_K
	_rays.size = Vector2(rays_d, rays_d)
	_rays.position = centre - _rays.size * 0.5
	_rays.pivot_offset = _rays.size * 0.5
	_rays.queue_redraw()
	var glow_d := art_px * 2.4
	_glow.size = Vector2(glow_d, glow_d)
	_glow.position = centre - _glow.size * 0.5
	_glow.pivot_offset = _glow.size * 0.5
	var ring_d := art_px * 3.0
	_ring.size = Vector2(ring_d, ring_d)
	_ring.position = centre - _ring.size * 0.5
	set_meta("centre", centre)
	set_meta("art_px", art_px)


## LA CHOREGRAPHIE : le noir monte, l'objet jaillit, l'onde part, la gerbe
## retombe, le cri claque, le nom se pose ; puis tout respire jusqu'au depart.
func _play() -> void:
	_dim.modulate.a = 0.0
	create_tween().tween_property(_dim, "modulate:a", 1.0, 0.16)
	if skin.is_empty():
		Sound.play("coin")
		_bloom()
		return
	_tease()


## LA SILHOUETTE D'UN SKIN : tout est cache sauf une ombre de lapin qui
## monte, tremble de plus en plus fort... puis l'eclair, et la fete.
func _tease() -> void:
	Sound.play("chest_arrive")
	for node in [_rays, _glow, _head, _name]:
		node.modulate.a = 0.0
	_art.modulate = Color.BLACK
	_art.scale = Vector2(0.6, 0.6)
	var rise := create_tween()
	rise.tween_property(_art, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# Le tremblement s'emballe : des pas de plus en plus courts et larges.
	var shake := create_tween()
	shake.tween_interval(0.2)
	var steps := 9
	for i in steps:
		var amp := 3.0 + 9.0 * float(i) / float(steps)
		shake.tween_property(_art, "rotation_degrees", amp if i % 2 == 0 else -amp, 0.055 - 0.003 * i)
	shake.tween_property(_art, "rotation_degrees", 0.0, 0.03)
	get_tree().create_timer(TEASE_S).timeout.connect(_reveal)


## L'ECLAIR : blanc plein ecran qui retombe, le lapin passe du noir a ses
## couleurs, saute de joie, et la fete de l'objet joue autour de lui.
func _reveal() -> void:
	if _leaving or not is_inside_tree():
		return
	Sound.play("chest_open")
	Sound.play("chime")
	_flash.modulate.a = 0.95
	create_tween().tween_property(_flash, "modulate:a", 0.0, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_art.modulate = Color(3.0, 3.0, 3.0)
	create_tween().tween_property(_art, "modulate", Color.WHITE, 0.4)
	for node in [_rays, _glow, _head, _name]:
		node.modulate.a = 1.0
	if _bunny != null:
		_bunny.play("happy")
	_bloom()


## L'OBJET JAILLIT, et tout ce qui va autour.
func _bloom() -> void:
	# L'objet : de rien a 1.3, penche, puis se pose en rebondissant. Le
	# lapin, deja la en silhouette, bondit de sa taille.
	_art.scale = Vector2.ZERO if skin.is_empty() else Vector2(0.85, 0.85)
	_art.rotation_degrees = -14.0 if skin.is_empty() else -6.0
	var pop := create_tween()
	pop.tween_property(_art, "scale", Vector2(1.3, 1.3), 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	pop.parallel().tween_property(_art, "rotation_degrees", 6.0, 0.16)
	pop.tween_property(_art, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	pop.parallel().tween_property(_art, "rotation_degrees", 0.0, 0.5).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	# Puis il flotte, doucement, tant qu'il est la.
	pop.tween_callback(func() -> void:
		var bob := _art.create_tween().set_loops()
		bob.tween_property(_art, "position:y", -5.0, 0.7).as_relative().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		bob.tween_property(_art, "position:y", 5.0, 0.7).as_relative().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT))

	# Les rayons s'ouvrent et tournent ; la lueur fleurit puis respire.
	_rays.scale = Vector2.ZERO
	create_tween().tween_property(_rays, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var spin := _rays.create_tween().set_loops()
	spin.tween_property(_rays, "rotation", TAU, 9.0).from(0.0)
	_glow.modulate.a = 0.0
	_glow.scale = Vector2(0.4, 0.4)
	var glow := create_tween().set_parallel()
	glow.tween_property(_glow, "modulate:a", 1.0, 0.12)
	glow.tween_property(_glow, "scale", Vector2(1.15, 1.15), 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	glow.chain().tween_property(_glow, "scale", Vector2.ONE, 0.4)
	glow.chain().tween_callback(func() -> void:
		var breathe := _glow.create_tween().set_loops()
		breathe.tween_property(_glow, "modulate:a", 0.7, 0.8).set_trans(Tween.TRANS_SINE)
		breathe.tween_property(_glow, "modulate:a", 1.0, 0.8).set_trans(Tween.TRANS_SINE))

	# L'onde.
	create_tween().tween_method(func(t: float) -> void:
		_ring_t = t
		_ring.queue_redraw(), 0.0, 1.0, 0.5).set_delay(0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	_burst()

	# Le cri claque, comme le tampon d'un niveau : 2.4x penche, puis pose.
	_head.modulate.a = 0.0
	_head.scale = Vector2(2.4, 2.4)
	_head.rotation_degrees = -8.0
	var slam := create_tween()
	slam.tween_interval(0.12)
	slam.tween_property(_head, "modulate:a", 1.0, 0.1)
	slam.parallel().tween_property(_head, "scale", Vector2(0.94, 0.94), 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	slam.parallel().tween_property(_head, "rotation_degrees", 2.0, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	slam.tween_property(_head, "scale", Vector2.ONE, 0.14)
	slam.parallel().tween_property(_head, "rotation_degrees", 0.0, 0.14)

	# Le nom monte de sous l'objet.
	_name.modulate.a = 0.0
	var rest := _name.position.y
	_name.position.y = rest + 14.0
	var rise := create_tween().set_parallel()
	rise.tween_property(_name, "modulate:a", 1.0, 0.2).set_delay(0.28)
	rise.tween_property(_name, "position:y", rest, 0.3).set_delay(0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	if linger:
		return
	get_tree().create_timer(STAY_S if skin.is_empty() else SKIN_STAY_S).timeout.connect(_leave)


## LA GERBE : des eclats carres (des pixels, pas des ronds) partent de
## l'objet en eventail, montent, puis retombent sous leur propre poids.
func _burst() -> void:
	var centre: Vector2 = get_meta("centre")
	var art_px: float = get_meta("art_px")
	var colors := [Palette.GOLD, Palette.CREAM, _tint.lightened(0.3), Palette.RANK_GOLD]
	for i in SPARKS:
		var spark := ColorRect.new()
		var s := floorf(art_px * (0.05 if i % 3 else 0.075))
		spark.size = Vector2(s, s)
		spark.color = colors[i % colors.size()]
		spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spark.position = centre - spark.size * 0.5
		spark.pivot_offset = spark.size * 0.5
		_sparks.add_child(spark)
		var angle := TAU * float(i) / float(SPARKS) + randf_range(-0.15, 0.15)
		var speed := art_px * randf_range(1.3, 2.3)
		var velocity := Vector2.from_angle(angle) * speed - Vector2(0.0, art_px * 0.9)
		var gravity := art_px * 3.2
		var life := SPARK_S * randf_range(0.8, 1.15)
		var fly := spark.create_tween().set_parallel()
		fly.tween_method(func(t: float) -> void:
			spark.position = centre - spark.size * 0.5 + velocity * t + Vector2(0.0, 0.5 * gravity * t * t), 0.0, life, life)
		fly.tween_property(spark, "rotation", randf_range(-6.0, 6.0), life)
		fly.tween_property(spark, "modulate:a", 0.0, life * 0.4).set_delay(life * 0.6)
		fly.chain().tween_callback(spark.queue_free)


## LE DEPART : tout s'efface ensemble, l'objet un peu plus grand, puis la
## fete se libere.
func _leave() -> void:
	if _leaving or not is_inside_tree():
		return
	_leaving = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var go := create_tween().set_parallel()
	go.tween_property(self, "modulate:a", 0.0, OUT_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	go.tween_property(_art, "scale", Vector2(1.2, 1.2), OUT_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	go.tween_property(_head, "position:y", -12.0, OUT_S).as_relative()
	go.chain().tween_callback(queue_free)
