extends CanvasLayer
class_name SeaGradient
## LA MER — un plan de profondeur, SOUS TOUT, QUI NE BOUGE PAS.
##
## Porte de src/game/fx/SeaGradient.ts ; le shader lui-meme est dans
## shaders/sea_gradient.gdshader, avec ses raisons.
##
## POURQUOI UN CanvasLayer ET PAS UN ENFANT DE L'ILE.
##
## Le web monte ce plan sur le STAGE, pas sur le conteneur que la camera
## promene, et la raison tient ici mot pour mot : la flaque claire est un
## ECLAIRAGE, pas un objet du monde. Enfant de l'ile, elle grossirait au zoom et
## se deplacerait au glissement — elle cesserait de se lire comme un fond marin
## pour devenir une tache peinte sur l'ile. Fixe a l'ecran, c'est l'ile qui se
## promene DEDANS, ce qui est le rapport qu'on veut.
##
## `layer` tres negatif : sous le terrain, sous l'ecume, sous tout.

const SHADER := preload("res://shaders/sea_gradient.gdshader")

var _rect: ColorRect


func _ready() -> void:
	layer = -100
	_rect = ColorRect.new()
	_rect.material = ShaderMaterial.new()
	(_rect.material as ShaderMaterial).shader = SHADER
	# Il couvre tout le cadre et se redimensionne avec lui.
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rect)
	_apply()
	get_viewport().size_changed.connect(_resize)
	_resize()


## LES VALEURS REGLEES, poussees dans le shader.
##
## Elles viennent toutes de `WaterLook.SEA` — un seul endroit, pour que l'ile et
## le terrier ne montrent jamais deux mers differentes.
func _apply() -> void:
	var m := _rect.material as ShaderMaterial
	var look: Dictionary = WaterLook.SEA
	m.set_shader_parameter("sea", look["sea"])
	m.set_shader_parameter("deep", look["deep"])
	m.set_shader_parameter("center", look["center"])
	m.set_shader_parameter("radius", look["radius"])
	m.set_shader_parameter("aspect", look["aspect"])
	m.set_shader_parameter("softness", look["softness"])
	m.set_shader_parameter("strength", look["strength"])
	# Le shader prend des RADIANS ; la config est en degres, comme le web.
	m.set_shader_parameter("angle", deg_to_rad(look["angle_deg"]))
	m.set_shader_parameter("steps", look["steps"])


## LA TAILLE DU PLAN EN PIXELS est une uniforme, et il la lui faut vraiment.
##
## Le shader mesure son ecart EN PIXELS pour que la rotation de l'ellipse soit
## honnete : sur des coordonnees normalisees, un cadre non carre cisaille la
## rotation et le grand axe se tord en tournant. Sans cette uniforme a jour, la
## flaque change de forme a chaque rotation d'ecran.
func _resize() -> void:
	var size := get_viewport().get_visible_rect().size
	(_rect.material as ShaderMaterial).set_shader_parameter("size", size)
