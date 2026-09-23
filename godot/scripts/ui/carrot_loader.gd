class_name CarrotLoader
extends Control
## LA CAROTTE QUI SE REMPLIT — l'attente, dans la langue du jeu.
##
## La carotte de l'icone, d'abord en silhouette, se colore de la pointe aux
## fanes (shaders/carrot_fill.gdshader), par crans de pixel, puis repart
## vide. Rien d'autre : pas de rebond, pas de bascule — elle ne bouge pas,
## elle se remplit (« pas d'anime, juste ca se remplit », 2026-09-23).
##
## Sert a deux endroits, toujours petite et en bas a droite, hors de la mise
## en page : l'attente du serveur en jeu (BusySpinner) et celle de l'accueil
## pendant la reprise de session (title.gd). `side` est sa largeur en pixels d'ecran ; l'art est mis
## a l'echelle entiere la plus proche, sans lissage.

const ART := preload("res://assets/ui/icons/carrot.webp")
const FILL := preload("res://shaders/carrot_fill.gdshader")

## Le remplissage, un temps plein, un temps vide.
const GROW_SECONDS := 0.9
const FULL_SECONDS := 0.25
const EMPTY_SECONDS := 0.12
## Le nombre de crans du remplissage : assez pour se lire comme une pousse,
## assez peu pour garder le pas du pixel art.
const STEPS := 10

var side := 28.0:
	set(value):
		side = value
		_fit()

var _art: TextureRect
var _material: ShaderMaterial
var _t := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_art = TextureRect.new()
	_art.texture = ART
	_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_art.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_material = ShaderMaterial.new()
	_material.shader = FILL
	_art.material = _material
	add_child(_art)
	_fit()


func _fit() -> void:
	if _art == null:
		return
	var h := side * float(ART.get_height()) / float(ART.get_width())
	custom_minimum_size = Vector2(side, h)
	size = custom_minimum_size
	_art.size = custom_minimum_size


## Repartir de la silhouette — a chaque fois qu'on la remontre.
func restart() -> void:
	_t = 0.0
	_apply()


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_t = fmod(_t + delta, GROW_SECONDS + FULL_SECONDS + EMPTY_SECONDS)
	_apply()


func _apply() -> void:
	var fill := 0.0
	if _t < GROW_SECONDS:
		fill = floorf(_t / GROW_SECONDS * STEPS) / STEPS
	elif _t < GROW_SECONDS + FULL_SECONDS:
		fill = 1.0
	_material.set_shader_parameter("fill", fill)
