extends RefCounted
class_name LightningFx
## LA FOUDRE DU SPECTATEUR — porte de IslandScene.ts `playLightning` et de
## fx/Electrocute.ts.
##
## Deux dessins, deux usages :
##
##   • LES PETITS ECLAIRS (lightning-1 / -2, six images de 64), un par case du
##     carre frappe, decales de `STAGGER_S` : la foudre tombe sur un MORCEAU
##     d'ile, pas sur un point. Le dessin alterne avec la case (`index % 2`).
##   • LE GRAND (lightning-bolt, grille 6x5 de 195x220, 27 images utiles), sur
##     un lapin touche seulement — c'est lui qui le foudroie.
##
## Les deux sont ancres au PIED : le dessin tombe du haut de sa cellule et
## eclabousse en bas, donc c'est le bas qui doit toucher la case.

const SMALL: Array[Texture2D] = [
	preload("res://assets/fx/lightning-1.webp"),
	preload("res://assets/fx/lightning-2.webp"),
]
const SMALL_FRAME := 64
const SMALL_FRAMES := 6
const SMALL_FOOT := 62.0 / 64.0
const SMALL_FPS := 14.0
## LIGHTNING.STAGGER_MS
const STAGGER_S := 0.06

const BIG := preload("res://assets/fx/lightning-bolt.webp")
const BIG_W := 195
const BIG_H := 220
const BIG_COLS := 6
const BIG_FRAMES := 27
const BIG_SCALE := 0.5
const BIG_FPS := 24.0
## L'image ou l'eclair touche le lapin (`BOLT_LANDS_FRAME`).
const BIG_LANDS_S := 5.0 / BIG_FPS

## Dans le bloc de la case, au-dessus du sol et du chiffre (`blastDepth` 9).
const Z_BOLT := 9


## Un eclair par case de `cells`, dans l'ordre (le centre d'abord).
static func strike(host: Node, terrain: BurrowTerrain, cells: Array[Vector2i], indices: Array[int]) -> void:
	for i in cells.size():
		var cell := cells[i]
		var shape := indices[i] % 2 if i < indices.size() else i % 2
		var t := host.get_tree().create_timer(STAGGER_S * float(i))
		t.timeout.connect(func() -> void:
			if is_instance_valid(terrain):
				_small(terrain, cell, shape))


static func _small(terrain: BurrowTerrain, cell: Vector2i, shape: int) -> void:
	var bolt := AnimatedSprite2D.new()
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	frames.add_animation("bolt")
	frames.set_animation_speed("bolt", SMALL_FPS)
	frames.set_animation_loop("bolt", false)
	for i in SMALL_FRAMES:
		var f := AtlasTexture.new()
		f.atlas = SMALL[shape]
		f.region = Rect2(i * SMALL_FRAME, 0, SMALL_FRAME, SMALL_FRAME)
		frames.add_frame("bolt", f)
	bolt.sprite_frames = frames
	bolt.centered = false
	bolt.offset = -Vector2(SMALL_FRAME * 0.5, SMALL_FRAME * SMALL_FOOT)
	if not terrain.mount_veil(cell, bolt, Z_BOLT):
		bolt.free()
		return
	bolt.animation_finished.connect(bolt.queue_free)
	bolt.play("bolt")


## LE GRAND ECLAIR, au pied `at` du lapin, trie a `z`.
static func big_bolt(host: Node, at: Vector2, z: int) -> void:
	var bolt := AnimatedSprite2D.new()
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	frames.add_animation("bolt")
	frames.set_animation_speed("bolt", BIG_FPS)
	frames.set_animation_loop("bolt", false)
	for i in BIG_FRAMES:
		var f := AtlasTexture.new()
		f.atlas = BIG
		f.region = Rect2((i % BIG_COLS) * BIG_W, (i / BIG_COLS) * BIG_H, BIG_W, BIG_H)
		frames.add_frame("bolt", f)
	bolt.sprite_frames = frames
	bolt.centered = false
	bolt.offset = -Vector2(BIG_W * 0.5, BIG_H)
	bolt.scale = Vector2(BIG_SCALE, BIG_SCALE)
	bolt.position = at
	bolt.z_index = z
	host.add_child(bolt)
	bolt.animation_finished.connect(bolt.queue_free)
	bolt.play("bolt")
