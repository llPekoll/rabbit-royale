extends ColorRect
## LE SOLEIL DE L'ECRAN DE CONNEXION — le glare pose sur le soleil peint.
##
## `Art` couvre l'ecran en gardant ses proportions (STRETCH_KEEP_ASPECT_COVERED),
## donc l'image deborde et se recentre selon le format. On recalcule ou tombe
## le soleil peint a chaque redimensionnement, pour que la lueur reste dessus.
## Rien a voir avec le ciel du jeu (SkyLight) : c'est une couche a part.

## Le soleil dans home-bg.webp, en UV de l'image (mesure sur le PNG 1672x940).
const SUN_IN_ART := Vector2(0.891, 0.229)

@export var art: TextureRect


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(_place)
	_place()


func _place() -> void:
	var m := material as ShaderMaterial
	if m == null or size.x <= 0.0 or size.y <= 0.0:
		return
	m.set_shader_parameter("rect_size", size)
	var sun := SUN_IN_ART
	if art != null and art.texture != null:
		var tex := art.texture.get_size()
		var k := maxf(size.x / tex.x, size.y / tex.y)
		var drawn := tex * k
		var offset := (size - drawn) * 0.5
		sun = (offset + SUN_IN_ART * drawn) / size
	m.set_shader_parameter("sun", sun)
