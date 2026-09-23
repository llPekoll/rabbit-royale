extends RefCounted
class_name Blast
## UNE BOMBE QUI SAUTE — porte de src/game/fx/Blast.ts, avec les nombres que le
## banc FX/Explosion du web a regles.
##
## Cinq temps, dans l'ordre ou l'oeil les lit :
##
##   0 ms    LE FLASH, blanc et additif, qui gonfle et s'eteint en 0,14 s — et
##           LE FEU, la planche `explosion` (14 images de 48) a 20 i/s, 2,2x.
##   0 ms    L'ONDE, a plat sur le sol, sur l'ellipse ISO : un cercle se lirait
##           comme un anneau debout dans l'air plutot que comme le sol qui
##           repond.
##   60 ms   LES DEBRIS : dix-huit mottes jetees en cloche, trajet ecrase a 2:1
##           comme le sol — sinon elles glissent sur l'ECRAN, pas sur le champ.
##   120 ms  LA FUMEE, qui reste APRES le feu : la case ne passe pas d'un coup du
##           plein feu a l'herbe nue.
##   150 ms  LA BRULURE, seulement quand le terrain n'a pas pu peindre le trou
##           (`no_scorch`) : un trou et une brulure diraient deux fois la meme
##           chose, la seconde en moins bien.
##
## TOUT EST MONTE DANS LE BLOC DE LA CASE (`mount_veil`), comme les voiles : un
## effet libre se trierait sur un z_index litteral et passerait devant un sapin
## plus pres de la camera. Dans le bloc, ce qui est devant la case reste devant
## le feu — c'est le `blastDepth` du web.

const SHEET := preload("res://assets/fx/explosion.webp")
const FRAME := 48
const FRAMES := 14

const FIRE_SCALE := 2.2
const FIRE_FPS := 20.0
const FIRE_LIFT := 20.0
const FLASH_SCALE := 1.4
const SHOCKWAVE_TILES := 2.5
const DEBRIS_COUNT := 18
const SMOKE_COUNT := 8
const SCORCH_ALPHA := 0.55
const SCORCH_HOLD := 2.4
const SCORCH_FADE := 1.6

const AT_DEBRIS := 0.06
const AT_SMOKE := 0.12
const AT_SCORCH := 0.15

## Les etages dans le bloc : la brulure et l'onde sur le sol, sous ce qui se
## tient sur la case (7) ; la fumee, les debris, le feu et le flash au-dessus.
const Z_SCORCH := 3
const Z_RING := 4
const Z_SMOKE := 9
const Z_DEBRIS := 10
const Z_FIRE := 10
const Z_FLASH := 11

const RING_COLOR := Color("#fff1c4")
const DEBRIS_COLORS := [Color("#8a5a2b"), Color("#4b3a22")]
const SMOKE_COLOR := Color("#2b2b33")

static var _frames: SpriteFrames
static var _disc: ImageTexture


## Joue l'explosion sur `cell`. `host` porte les tweens (un noeud de la scene).
static func play(host: Node, terrain: BurrowTerrain, cell: Vector2i, no_scorch: bool) -> void:
	var rng := RandomNumberGenerator.new()

	# ---- 1. le flash
	var flash := Sprite2D.new()
	flash.texture = _soft_disc()
	flash.modulate = Color(1, 1, 1, 0.9)
	flash.material = _additive()
	flash.position.y = -FIRE_LIFT
	flash.scale = Vector2.ONE * FLASH_SCALE
	if _mount(terrain, cell, flash, Z_FLASH):
		var f := host.create_tween().set_parallel(true)
		f.tween_property(flash, "modulate:a", 0.0, 0.14).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		f.tween_property(flash, "scale", Vector2.ONE * FLASH_SCALE * 1.6, 0.14)
		f.chain().tween_callback(flash.queue_free)

	# ---- le feu
	var fire := AnimatedSprite2D.new()
	fire.sprite_frames = _fire_frames()
	fire.scale = Vector2.ONE * FIRE_SCALE
	fire.position.y = -FIRE_LIFT
	fire.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if _mount(terrain, cell, fire, Z_FIRE):
		fire.play("boom")
		fire.animation_finished.connect(fire.queue_free)

	# ---- 2. l'onde
	var ring := Node2D.new()
	var state := {"r": 6.0, "a": 0.85}
	ring.draw.connect(func() -> void:
		var ratio := Iso.half_h() / Iso.half_w()
		var pts := PackedVector2Array()
		for i in 33:
			var a := TAU * i / 32.0
			pts.append(Vector2(cos(a) * state.r, sin(a) * state.r * ratio))
		ring.draw_polyline(pts, Color(RING_COLOR, state.a), 3.0))
	if _mount(terrain, cell, ring, Z_RING):
		var reach: float = SHOCKWAVE_TILES * Iso.half_w() * 2.0
		var w := host.create_tween()
		w.tween_method(func(t: float) -> void:
			state.r = lerpf(6.0, reach, t)
			state.a = 0.85 * (1.0 - t)
			ring.queue_redraw(), 0.0, 1.0, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		w.tween_callback(ring.queue_free)

	# ---- 3. les debris
	host.get_tree().create_timer(AT_DEBRIS).timeout.connect(func() -> void:
		for i in DEBRIS_COUNT:
			var size := 2.0 + rng.randf() * 3.0
			var chunk := Polygon2D.new()
			chunk.polygon = PackedVector2Array([
				Vector2(-size, -size) * 0.5, Vector2(size, -size) * 0.5,
				Vector2(size, size) * 0.5, Vector2(-size, size) * 0.5])
			chunk.color = DEBRIS_COLORS[0] if rng.randf() < 0.4 else DEBRIS_COLORS[1]
			chunk.position.y = -6
			if not _mount(terrain, cell, chunk, Z_DEBRIS):
				return
			var home := chunk.position
			var dir := rng.randf() * TAU
			var dist := 18.0 + rng.randf() * 46.0
			var dx := cos(dir) * dist
			var dy := sin(dir) * dist * (Iso.half_h() / Iso.half_w())
			var rise := 22.0 + rng.randf() * 26.0
			var t := 0.45 + rng.randf() * 0.35
			var fly := host.create_tween().set_parallel(true)
			fly.tween_property(chunk, "position:x", home.x + dx, t)
			# EN CLOCHE, deux tweens : une ligne droite vers le point de chute
			# est la seule forme que ne prend jamais une chose lancee.
			var arc := host.create_tween()
			arc.tween_property(chunk, "position:y", home.y - rise, t * 0.4) \
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			arc.tween_property(chunk, "position:y", home.y + 6 + dy, t * 0.6) \
				.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			arc.tween_property(chunk, "modulate:a", 0.0, 0.25)
			arc.tween_callback(chunk.queue_free))

	# ---- 4. la fumee
	host.get_tree().create_timer(AT_SMOKE).timeout.connect(func() -> void:
		for i in SMOKE_COUNT:
			var puff := Sprite2D.new()
			puff.texture = _soft_disc()
			puff.modulate = Color(SMOKE_COLOR, 0.55)
			var s := 0.4 + rng.randf() * 0.4
			puff.scale = Vector2.ONE * s
			if not _mount(terrain, cell, puff, Z_SMOKE):
				return
			puff.position += Vector2((rng.randf() - 0.5) * 22.0, -4.0)
			var secs := 0.9 + rng.randf() * 0.6
			var up := host.create_tween().set_parallel(true)
			up.tween_property(puff, "position",
				puff.position + Vector2((rng.randf() - 0.5) * 24.0, -(26.0 + rng.randf() * 26.0)),
				secs).set_delay(i * 0.05).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
			up.tween_property(puff, "modulate:a", 0.0, secs).set_delay(i * 0.05)
			up.tween_property(puff, "scale", Vector2.ONE * s * 2.2, 1.2).set_delay(i * 0.05)
			up.chain().tween_callback(puff.queue_free))

	# ---- 5. la brulure
	if no_scorch:
		return
	host.get_tree().create_timer(AT_SCORCH).timeout.connect(func() -> void:
		var scorch := Node2D.new()
		scorch.draw.connect(func() -> void:
			var pts := PackedVector2Array()
			for i in 24:
				var a := TAU * i / 24.0
				pts.append(Vector2(cos(a) * Iso.half_w() * 0.8, sin(a) * Iso.half_h() * 0.8))
			scorch.draw_colored_polygon(pts, Color(Color("#1a1209"), SCORCH_ALPHA)))
		scorch.modulate.a = 0.0
		if not _mount(terrain, cell, scorch, Z_SCORCH):
			return
		var b := host.create_tween()
		b.tween_property(scorch, "modulate:a", 1.0, 0.3).set_delay(0.1)
		# Et elle s'en va : retiree, pas laissee a zero — une longue partie
		# n'empile pas un dessin invisible par bombe.
		b.tween_property(scorch, "modulate:a", 0.0, SCORCH_FADE).set_delay(SCORCH_HOLD)
		b.tween_callback(scorch.queue_free))


## Monte dans le bloc en GARDANT le decalage demande : `mount_veil` pose le
## noeud au centre de la case, on y ajoute le sien.
static func _mount(terrain: BurrowTerrain, cell: Vector2i, node: Node2D, z: int) -> bool:
	var offset := node.position
	if not terrain.mount_veil(cell, node, z):
		node.free()
		return false
	node.position += offset
	return true


static func _fire_frames() -> SpriteFrames:
	if _frames != null:
		return _frames
	_frames = SpriteFrames.new()
	_frames.remove_animation("default")
	_frames.add_animation("boom")
	_frames.set_animation_speed("boom", FIRE_FPS)
	_frames.set_animation_loop("boom", false)
	for i in FRAMES:
		var f := AtlasTexture.new()
		f.atlas = SHEET
		f.region = Rect2(i * FRAME, 0, FRAME, FRAME)
		_frames.add_frame("boom", f)
	return _frames


## LE DISQUE DOUX du web (`softDisc`) : huit anneaux concentriques a 12 %,
## pas un degrade — c'est du pixel art, une retombee qui crisse n'est pas un
## defaut ici. Blanc : la fumee et le flash le teintent.
static func _soft_disc() -> ImageTexture:
	if _disc != null:
		return _disc
	var r := 32
	var img := Image.create(r * 2, r * 2, false, Image.FORMAT_RGBA8)
	for y in r * 2:
		for x in r * 2:
			var d := Vector2(x + 0.5 - r, y + 0.5 - r).length()
			var rings := 0
			for i in range(1, 9):
				if d <= r * i / 8.0:
					rings += 1
			var a := 1.0 - pow(1.0 - 0.12, rings)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	_disc = ImageTexture.create_from_image(img)
	return _disc


static func _additive() -> CanvasItemMaterial:
	var m := CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	return m
