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

## LA TAILLE DU TROU QUAND IL EST GRAND OUVERT, en part de la HAUTEUR.
##
## Assez large pour que la silhouette sorte du cadre par tous les cotes. Le
## chiffre ne se devine pas : ce qui doit sortir du cadre n'est pas la
## silhouette mais sa PARTIE PLEINE, et sur ce lapin la partie pleine s'arrete
## a l'ENCOCHE ENTRE LES OREILLES. Le haut du masque est donc inutilisable —
## les oreilles sont deux colonnes separees par du vide, et ce vide est de la
## nappe. Le trou n'est vraiment plein que sur la bande du corps.
##
## `2.2` etait un chiffre pose a la main, et il est trop petit de moitie : sur
## l'ecran par defaut (2.225) il faut `3.81` pour que le coin le plus eloigne
## tombe dans le corps du lapin. A `2.2` la nappe couvre encore 31 % de
## l'ecran a la fin du geste — d'ou l'iris qui « disparait avant d'avoir tout
## recouvert » : il ne disparait pas, il s'arrete en chemin et le `visible =
## false` de la fin escamote le reste d'un coup.
##
## ET CE CHIFFRE DEPEND DE L'ECRAN, ce qu'une constante ne peut pas savoir :
## 3.81 en 2.225, 3.05 en 16:9, 2.0 en portrait. On le calcule donc dans
## `resize()`, avec la meme geometrie que le shader.
var _open := 2.2

## LE PROFIL DU CORPS — la plus grande boite PLEINE centree dans le masque.
##
## Chaque entree est `(demi-hauteur, demi-largeur)` en part du masque, relevee
## sur l'alpha de bunny-mask.webp. Lue de haut en bas, c'est un escalier : le
## corps tient toute la largeur jusqu'a `0.083`, puis il se retrecit a mesure
## qu'on monte vers les epaules, la tete et enfin l'encoche des oreilles.
##
## POURQUOI UNE BOITE ET PAS UN RAYON. Ce qu'on cherche, c'est l'instant ou
## les QUATRE COINS de l'ecran sont dans le plein. Un ecran est un rectangle,
## donc la question est « quelle boite centree tient dans la silhouette », et
## la reponse depend de la forme de la boite — c'est-a-dire de l'ecran.
const BODY: Array[Vector2] = [
	Vector2(0.083, 0.500),
	Vector2(0.125, 0.444),
	Vector2(0.167, 0.389),
	Vector2(0.208, 0.333),
	Vector2(0.250, 0.278),
]

## UNE MARGE, parce qu'un coin pile sur le bord du plein est un coin qui
## scintille : le masque est en `filter_nearest`, donc son bord est une marche
## d'escalier, pas une ligne.
const MARGIN := 1.04

var _rect: ColorRect
var _tween: Tween
## Le numero du geste en cours : une bascule en attente de son image noire
## sait ainsi si un autre geste l'a remplacee.
var _gen := 0


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
	var screen_aspect := view.x / maxf(view.y, 1.0)
	(_rect.material as ShaderMaterial).set_shader_parameter("screen_aspect", screen_aspect)
	_open = _open_for(screen_aspect)


## L'OUVERTURE QU'IL FAUT POUR CET ECRAN-LA.
##
## On refait le trajet du shader a l'envers. Lui envoie un point de l'ecran
## vers le masque ; ici on prend le COIN de l'ecran — le point le plus
## eloigne du centre, donc le dernier a etre decouvert — et on cherche la
## plus petite ouverture qui le pose dans le plein.
##
## Le coin est en `(0.5, 0.5)` d'ecart au centre. Le shader corrige d'abord
## l'etirement (`* screen_aspect / shape_aspect`), donc en coordonnees du
## masque le coin vise `(0.5 * screen_aspect / shape_aspect, 0.5)`, et il
## faut `aperture` tel que ce point tombe dans une des boites de `BODY`.
func _open_for(screen_aspect: float) -> float:
	var shape_aspect := MASK.get_width() / float(MASK.get_height())
	var reach_x := 0.5 * screen_aspect / shape_aspect
	# Chaque palier de l'escalier propose une ouverture ; la BONNE est la plus
	# PETITE, parce qu'un trou plus grand que necessaire n'est pas faux, juste
	# gourmand — il fait sortir la silhouette du cadre plus tot que prevu.
	var best := 0.0
	for box in BODY:
		# Il faut couvrir les deux axes : `reach_x` en largeur, `0.5` en
		# hauteur. C'est le plus contraignant des deux qui decide.
		var need: float = maxf(reach_x / box.y, 0.5 / box.x)
		if best <= 0.0 or need < best:
			best = need
	return best * MARGIN


## JOUE L'IRIS : fermer le trou, basculer sous le couvert, rouvrir.
func play(swap: Callable) -> void:
	resize()
	visible = true
	_set_aperture(_open)

	if _tween != null and _tween.is_valid():
		_tween.kill()
	_gen += 1
	_tween = create_tween()
	# FERMER — `EASE_IN` donne son elan au geste.
	_tween.tween_method(_set_aperture, _open, 0.0, SWEEP_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	# LA BASCULE AU MILIEU, trou ferme — le seul instant ou elle ne se voit pas.
	# ELLE A TOUJOURS LIEU : « The change always happens; the flourish is what is
	# optional. »
	_tween.tween_callback(_swap_once_black.bind(swap, _gen))


## LE NOIR D'ABORD, LA BASCULE ENSUITE.
##
## La bascule etait appelee dans la MEME image que la derniere valeur du trou
## (0.0). Or une image se dessine APRES son traitement : le noir plein ne
## sortait qu'une fois la bascule finie. Sur le Seeker elle coute 1,6 s
## (mesure le 2026-09-23, DIG vers l'ile) — et pendant ces 1,6 s l'ecran
## gardait l'image d'avant, le trou a 0.27 : un lapin encore ouvert, fige.
## « L'iris ne se ferme pas jusqu'au bout. » On attend donc que l'image noire
## soit DESSINEE avant de basculer : deux images, la premiere dessine le noir,
## la seconde laisse le GPU le presenter. Pas `frame_post_draw`, que le rendu
## `--headless` n'emet jamais — les sondes restaient bloquees au noir.
func _swap_once_black(swap: Callable, gen: int) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	# Un autre geste a pu partir entre-temps : le sien basculera.
	if gen != _gen:
		swap.call()
		return
	swap.call()
	_tween = create_tween()
	# LE TEMPS NOIR — `WIPE_HOLD_MS` du web (500 ms), qui manquait ici.
	#
	# LA BASCULE N'EST PAS GRATUITE : `show_place` fait basculer la visibilite
	# des lieux ET de leurs CanvasLayer, et emet de quoi reveiller le chrome.
	# Sans pause, la premiere image de la reouverture tombe dans cette meme
	# frame — donc on rouvre parfois sur un lieu qui n'a pas fini de se poser,
	# ce qui est exactement ce qu'un obturateur existe pour cacher.
	#
	# C'est aussi ce que l'iris du web s'accorde, et pour la meme raison : « a
	# caller that needs a frame or two to settle gets them while nothing is
	# visible — which is the whole reason to hide a cut behind a shutter ».
	_tween.tween_interval(HOLD_SECONDS)
	_tween.tween_callback(opening.emit)
	# ROUVRIR — `EASE_OUT` pose le geste au lieu de le laisser filer.
	_tween.tween_method(_set_aperture, 0.0, _open, SWEEP_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_tween.finished.connect(func() -> void:
		visible = false
		finished.emit())


func _set_aperture(value: float) -> void:
	(_rect.material as ShaderMaterial).set_shader_parameter("aperture", value)
