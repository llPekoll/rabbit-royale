extends CanvasLayer
## LE BLOOM — un halo sur ce qui est clair, sur le monde.
##
## Un autoload : il survit aux traversees de Screens, donc l'ile, le terrier et
## le raid l'ont sans que chaque scene ait a le poser.
##
## CALCULE EN BASSE RESOLUTION (Paul, 2026-09-23). Le glow de l'Environment
## coutait 20 fps au Seeker (120 -> 40) sans meme se voir : il floute a la
## resolution de l'ecran. Ce calque lit les mipmaps de l'ecran a 1/4 et 1/16,
## voir shaders/bloom.gdshader.
##
## LE JEU, PAS L'UI (Paul, 2026-09-23). Calque 1 : juste au-dessus du monde
## (0) et de la mer (-100), sous le chrome de l'ile (10), le chrome (20) et le
## rideau (100). Et eteint hors du monde : le doorstep pose ses boutons au
## calque 0, il bavait tout entier. Un calque d'UI sous 2 passe sous le halo.
##
## `--no-bloom` au lancement l'eteint, pour comparer ; au Seeker, un fichier
## `user://no-bloom` (adb shell run-as rip.rabbit.royale touch files/no-bloom).

const SHADER := preload("res://shaders/bloom.gdshader")


func _ready() -> void:
	layer = 1
	if "--no-bloom" in OS.get_cmdline_user_args() \
			or FileAccess.file_exists("user://no-bloom"):
		return
	var rect := ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	# IGNORE : plein ecran au-dessus du monde, il avalerait toutes les tapes
	# destinees au sol.
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	rect.material = mat
	add_child(rect)
	Screens.changed.connect(_follow)
	_follow()


func _follow() -> void:
	visible = Screens.in_world()
