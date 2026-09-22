extends Control
## LE BANC D'ESSAI DES EFFETS — combien coute vraiment un rai de lumiere.
##
## Il ne sert pas a regler l'aspect, il sert a repondre a UNE question : est-ce
## que cet effet tient sur le Seeker. On le mesure avant d'avoir une ile
## dessous, parce qu'une fois le terrain la on ne sait plus demeler ce qui
## coute.
##
## CE QU'IL MESURE, et pourquoi pas le fps. Le fps est borne par le vsync : a
## 60 ou 120 images par seconde il affiche la meme valeur que l'effet coute
## 2 ms ou 7 ms, et ne bouge que quand il est deja trop tard. Le chiffre utile
## est le temps que le GPU passe sur une image — `get_frames_per_second` ne le
## donne pas, mais les moniteurs de rendu si.
##
## Un rappel des notes du projet, verifie sur l'app Expo : « le fps JS ment sur
## expo-gl ». Le principe vaut ici — on lit le temps GPU, pas une cadence.
##
## COMMENT S'EN SERVIR. On lance, on laisse tourner quelques secondes, et on
## lit les trois lignes. Le bouton fait varier les octaves, qui sont le seul
## dial qui change l'ordre de grandeur : chaque octave est un simplex de plus
## PAR PIXEL.

const OCTAVE_STEPS := [1, 2, 3, 4, 5, 6]

@onready var _rays: ColorRect = %Rays
@onready var _viewport: SubViewport = %RaysViewport
@onready var _out: TextureRect = %RaysOut
@onready var _readout: Label = %Readout
@onready var _title: Label = %Title

var _material: ShaderMaterial
var _octaves := 4
var _samples: Array[float] = []
var _settle := 0.0

## Combien de temps on ignore avant de mesurer. Les premieres images payent la
## compilation du shader et le remplissage des caches : les compter donnerait
## un chiffre deux fois trop gros.
const SETTLE_SECONDS := 1.5

## Sur combien d'images on moyenne. Assez pour lisser une image lente isolee,
## assez peu pour que le chiffre reagisse quand on change un reglage.
const WINDOW := 60

## LE PLAFOND DU JEU. Au-dela, on calcule des images que l'ecran n'affichera
## pas : c'est de la chaleur dans la main et de la batterie en moins, pour rien.
const CAP_FPS := 60

## La part de la resolution ecran a laquelle le voile est calcule. Un demi
## divise le travail par quatre, et un rai est trop flou pour qu'on le voie.
const RENDER_SCALE := 0.5

## VRAI DANS LE BANC, FAUX DANS LE JEU.
##
## Mesurer demande d'enlever le plafond, sinon la cadence ne dit rien du cout.
## Jouer demande le contraire : calculer 120 images pour en afficher 60 ne fait
## que chauffer la main et vider la batterie. Le shader qui partira dans le
## monde heritera du plafond, pas de cette exception.
const measuring := true


func _ready() -> void:
	# VSYNC COUPE, POUR MESURER SEULEMENT.
	#
	# Avec lui, la cadence est plafonnee et ne dit rien du cout tant qu'on n'a
	# pas DEJA depasse le budget. Sans lui, les images par seconde sont une
	# mesure directe.
	#
	# C'est un reglage de BANC : dans le jeu, laisser le GPU tourner a 87
	# images par seconde pour en afficher 60 ne fait que chauffer le telephone
	# et vider sa batterie. Voir `CAP_FPS` plus bas.
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = 0 if measuring else CAP_FPS

	_material = _rays.material as ShaderMaterial
	_out.texture = _viewport.get_texture()
	_apply()
	get_viewport().size_changed.connect(_resize)
	_resize()


func _resize() -> void:
	# LE SHADER A BESOIN DE LA TAILLE REELLE. Il corrige l'aspect pour que
	# l'angle du rai soit un vrai angle : sans cette valeur a jour, les
	# faisceaux s'etirent avec la fenetre.
	var full := get_viewport_rect().size
	# Le viewport interne suit la fenetre, a l'echelle reduite. Au moins 1x1 :
	# une taille nulle pendant un redimensionnement tuerait la texture.
	var small := Vector2i(maxi(1, int(full.x * RENDER_SCALE)),
			maxi(1, int(full.y * RENDER_SCALE)))
	if _viewport != null:
		_viewport.size = small
		_rays.size = Vector2(small)
	if _material != null:
		# LA TAILLE DONNEE AU SHADER EST CELLE OU IL DESSINE, pas celle de
		# l'ecran : il quantifie en pixels (`pixel`) et corrige l'aspect, donc
		# lui mentir sur sa resolution deformerait les deux.
		_material.set_shader_parameter("screen_size", Vector2(small))


func _process(delta: float) -> void:
	if _settle < SETTLE_SECONDS:
		_settle += delta
		_readout.text = "mesure dans %.1f s" % (SETTLE_SECONDS - _settle)
		return

	# LE TEMPS D'UNE IMAGE, en millisecondes.
	#
	# Pourquoi pas le fps : il est borne par le vsync. A 60 ou 120 images par
	# seconde, il affiche la meme valeur que l'effet coute 2 ms ou 7 ms, et ne
	# bouge que quand il est deja trop tard. C'est pour ca que le banc coupe le
	# vsync au demarrage (voir `_ready`) : sans plafond, la cadence devient une
	# mesure du cout reel.
	var draws := int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var cpu_ms := float(Performance.get_monitor(Performance.TIME_PROCESS)) * 1000.0
	var fps := maxf(1.0, float(Performance.get_monitor(Performance.TIME_FPS)))
	var gpu_ms := 1000.0 / fps

	_samples.append(gpu_ms)
	if _samples.size() > WINDOW:
		_samples.pop_front()

	var sum := 0.0
	for v in _samples:
		sum += v
	var avg: float = sum / float(_samples.size())

	_readout.text = "\n".join([
		"octaves   %d   (le dial qui coute)" % _octaves,
		"fps       %d" % Engine.get_frames_per_second(),
		"image     %.2f ms   (budget 16.6 a 60 fps)" % avg,
		"draws     %d" % draws,
		"cpu       %.2f ms" % cpu_ms,
		"",
		"gauche: moins d'octaves    droite: plus",
	])


## LA MOITIE DROITE MONTE, LA GAUCHE DESCEND.
##
## Un appui n'importe ou faisait avancer d'un cran et ne savait pas revenir :
## sur un ecran de 2670px on vise mal, et comparer deux reglages demandait de
## faire tout le tour. Deux moities se trouvent sans regarder.
func _gui_input(event: InputEvent) -> void:
	var at := Vector2.ZERO
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if not touch.pressed:
			return
		at = touch.position
	elif event is InputEventMouseButton:
		var click := event as InputEventMouseButton
		if not click.pressed:
			return
		at = click.position
	else:
		return

	var i := OCTAVE_STEPS.find(_octaves)
	var step := 1 if at.x > size.x * 0.5 else -1
	_octaves = OCTAVE_STEPS[wrapi(i + step, 0, OCTAVE_STEPS.size())]
	_apply()
	# La fenetre est videe : sinon la moyenne traine l'ancien reglage pendant
	# une seconde et on lit un chiffre qui n'est celui d'aucun des deux.
	_samples.clear()


func _apply() -> void:
	if _material != null:
		_material.set_shader_parameter("octaves", _octaves)
	_title.text = "GOD RAYS — banc d'essai"
