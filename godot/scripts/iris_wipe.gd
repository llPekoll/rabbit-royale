extends Wipe
class_name IrisWipe
## L'IRIS DU LAPIN — une nappe sombre percee d'un trou qui se ferme et rouvre.
##
## Porte de src/game/fx/ShapeWipe.ts.
##
## Le « That's all folks! » des Looney Tunes, sauf que l'ouverture est une CHOSE
## plutot qu'un cercle : le trou retrecit (iris out), l'ecran est brievement
## tout sombre, puis il rouvre sur l'autre lieu (iris in).
##
## LE TRUC EST DANS LE NEGATIF, et c'est la seule chose a ne pas rater ici :
## « la forme doit etre ce a travers quoi on VOIT. Dessiner une carotte
## par-dessus l'ecran serait un autocollant ; en decouper une dans le noir fait
## du noir l'objet et du jeu la lumiere derriere. » Mon premier essai peignait
## la silhouette en sombre — donc l'autocollant. Paul, sur la capture : « c'est
## l'inverse lol ». Le shader fait maintenant le negatif.
##
## POURQUOI UN OBTURATEUR ET PAS LE FONDU DU WEB, apres deux detours.
##
## Le web a cinq variantes dont un fondu : les deux scenes dessinees ensemble,
## la sortante dont l'alpha s'efface. Porte ici, ca demande que les deux LIEUX
## soient affiches en meme temps — donc deux chromes a l'ecran, un z_index a
## arbitrer, et sur l'appareil ca se lisait comme deux jeux superposes.
##
## UN IRIS N'A PAS CE PROBLEME parce qu'il a un MILIEU : un instant ou l'ecran
## est couvert. La bascule s'y cache, donc les deux lieux ne sont JAMAIS
## affiches ensemble. « c'est plus simple non » : oui, et pas seulement a
## ecrire. C'est aussi ce que le web dit de son iris — « it is a shutter as much
## as a flourish, and it buys the cut for free ».
##
## UNE SEULE VARIANTE POUR L'INSTANT. Les autres se brancheront derriere le
## contrat de `wipe.gd` sans rien deplacer — le web en a cinq, tirees au sort,
## parce qu'« un effet vu cent fois n'est plus un effet, c'est un ecran de
## chargement ».

const SHADER := preload("res://shaders/iris_wipe.gdshader")

## LA SILHOUETTE. 18x24, pleine au centre et transparente autour.
const MASK := preload("res://assets/fx/bunny-mask.webp")

## LA COULEUR DE LA NAPPE — le fond du jeu, pas du noir pur.
##
## `default_clear_color` du projet : au moment ou la nappe est pleine, elle doit
## etre indiscernable de ce qu'il y a derriere les bords du monde.
const SHEET := Color(0.051, 0.067, 0.09, 1.0)

## LA TAILLE DU TROU QUAND IL EST GRAND OUVERT, en part du petit cote.
##
## Assez large pour que la silhouette sorte du cadre par tous les cotes — les
## OREILLES comprises, qui sont ce qui depasse le plus. En dessous, la nappe
## reste visible dans les coins quand l'iris est cense etre ouvert.
const OPEN := 2.2

var _rect: ColorRect
var _tween: Tween


func _ready() -> void:
	super()
	# UN OBTURATEUR A UN MILIEU : la bascule s'y cache. C'est tout ce qui le
	# distingue d'un fondu, du point de vue de l'appelant.
	swap_first = false

	_rect = ColorRect.new()
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("shape", MASK)
	mat.set_shader_parameter("sheet", SHEET)
	mat.set_shader_parameter("shape_aspect", MASK.get_width() / float(MASK.get_height()))
	_rect.material = mat
	# LA NAPPE COUVRE TOUT L'ECRAN EN PERMANENCE et ne bouge jamais : c'est le
	# TROU qui change de taille, pas elle. Mettre le noeud a l'echelle
	# decouvrirait les bords.
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rect)
	resize()


func resize() -> void:
	if _rect == null:
		return
	var view := get_viewport().get_visible_rect().size
	(_rect.material as ShaderMaterial).set_shader_parameter(
		"screen_aspect", view.x / maxf(view.y, 1.0))


## JOUE L'IRIS : fermer le trou, basculer sous le couvert, rouvrir.
func play(swap: Callable) -> void:
	resize()
	visible = true
	_set_aperture(OPEN)

	if _tween != null and _tween.is_valid():
		_tween.kill()
	_tween = create_tween()
	# FERMER — `EASE_IN` donne son elan au geste.
	_tween.tween_method(_set_aperture, OPEN, 0.0, SWEEP_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	# LA BASCULE AU MILIEU, trou ferme — le seul instant ou elle ne se voit pas.
	# ELLE A TOUJOURS LIEU : « The change always happens; the flourish is what is
	# optional. »
	_tween.tween_callback(swap)
	# ROUVRIR — `EASE_OUT` pose le geste au lieu de le laisser filer.
	_tween.tween_method(_set_aperture, 0.0, OPEN, SWEEP_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.finished.connect(func() -> void:
		visible = false
		finished.emit())


func _set_aperture(value: float) -> void:
	(_rect.material as ShaderMaterial).set_shader_parameter("aperture", value)
