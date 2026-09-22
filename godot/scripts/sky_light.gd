extends Node2D
class_name SkyLight
## LA LUMIERE DU CIEL — les ombres de nuages, puis les rais entre elles.
##
## Porte de `mountSkyLight` (src/game/fx/GodRays.ts).
##
## DEUX COUCHES QUI DECRIVENT LE MEME CIEL. Une ombre au sol est un trou dans
## la couverture vu d'en dessous ; un rai est le meme trou vu de cote. Elles
## lisent donc le MEME bruit avec les MEMES reglages — scale, speed, morph,
## octaves, coverage, edge. Les desaccorder donne deux ciels superposes, et ca
## se voit immediatement.
##
## LA COUVERTURE EST RECOPIEE A CHAQUE IMAGE, et c'est la seule ligne qui tient
## l'accord dans la duree. Le web insiste : sans elle, chaque couche decrit sa
## propre meteo des que le ciel se charge.
##
## POURQUOI ELLES SUIVENT LA CAMERA, contrairement a la mer.
##
## La mer est un eclairage de fond : elle reste sous l'ecran pendant que l'ile
## defile. Une ombre de nuage est le CONTRAIRE — elle est posee SUR le terrain,
## a un endroit du monde, et doit glisser avec lui. D'ou un Node2D enfant de
## l'ile et non un CanvasLayer. C'est aussi ce que fait le web : le plan des
## rais est ajoute au conteneur de la CAMERA, pas au stage.
##
## CE QUI N'EST PAS PORTE : `mountSunWarm`, la couche chaude qui respire en
## sens contraire de l'ombre. Elle module en `overlay`, un mode de fusion que
## ce portage n'a pas encore, et elle se lit surtout sur un ecran calibre. Les
## deux couches qui FONT le ciel sont la ; la chaleur viendra avec son mode.

const SHADOW_SHADER := preload("res://shaders/cloud_shadows.gdshader")
const RAYS_SHADER := preload("res://shaders/god_rays.gdshader")

## LE PLAN DEBORDE LARGEMENT DU CADRE.
##
## Un plan a la taille de l'ecran laisse voir son bord des que la camera
## bouge : une ligne franche ou l'ombre s'arrete net. Quatre fois le cadre
## couvre tout ce que le pan peut atteindre. C'est le `REACH` du web.
## 1,6 ET PAS 4,0 — ET C'EST UNE MESURE DE PERFORMANCE, pas de gout.
##
## A 4, le plan fait SEIZE FOIS l'ecran. Deux couches de shader remplissent
## donc seize ecrans de fragments a chaque image, sur un telephone : Paul, sur
## le tutoriel, « j'ai un fps de 21 ». Le cout n'est pas la lecture du bruit
## (`pixel = 3` n'en lit deja qu'un sur neuf) mais le FILL RATE brut.
##
## 1,6 ramene ca a 2,6 ecrans — six fois moins — et couvre encore largement ce
## que le pan peut atteindre, puisque la camera de l'ile ne se deplace pas
## librement pour l'instant (elle cadre, voir island.gd). A remonter si le
## pan/zoom libre arrive, et a re-mesurer le jour ou on le fera.
##
## `fx_bench` porte la reponse de rechange si ca ne suffit plus : rendre le
## voile en DEMI-RESOLUTION dans un SubViewport, ce qui divise encore par
## quatre — « un rai est trop flou pour qu'on le voie ». Ce portage ne l'a pas
## encore branche.
## 1,0 — LE VOILE COUVRE L'ECRAN, PAS PLUS.
##
## Il a valu 4,0 (seize ecrans de fragments), puis 1,6 (2,6 ecrans) : dans les
## deux cas 21 images par seconde, parce que le cout est le FILL RATE — ecrire
## les fragments — et pas le bruit qu'on y calcule. Grossir l'echantillonnage
## n'a rien change non plus, ce qui l'a prouve.
##
## A 1,0 le voile fait exactement l'ecran. La marge servait a couvrir ce qu'un
## pan pouvait atteindre ; la camera de l'ile ne se promene pas encore (elle
## cadre, voir island.gd), donc il n'y a rien a couvrir au-dela. A remonter avec
## le pan/zoom libre — et a re-mesurer ce jour-la.
const REACH := 1.0

## DE COMBIEN ON GROSSIT LE PAS D'ECHANTILLONNAGE DU BRUIT.
##
## `pixel` vaut 3 dans la config — le chiffre du web, regle sur un cadre ou
## l'ile est grande. Ici elle est cadree a 0,56 pour tenir dans 890x400 : « vu
## qu'on est zoomes, y a moins de detail », et un bruit lu trois fois plus
## grossierement donne exactement la meme image. Le calcul, lui, tombe d'un
## facteur neuf — quatre octaves de simplex 3D par echantillon, deux couches.
const COARSE := 3.0

## LA COUVERTURE VIVANTE, celle que les deux couches lisent.
##
## Elle erre entre ses bornes sur une periode lente — c'est la meteo. Le web
## la fait varier sur 240 secondes : assez lent pour qu'on ne la surprenne
## jamais en train de changer, assez rapide pour qu'une partie voie le ciel se
## charger et se degager.
##
## LES BORNES SONT RESSERREES SUR LA DYNAMIQUE REELLE DU BRUIT, et c'est la
## mesure qui les a fixees, pas le web.
##
## `coverage` est un SEUIL dans le bruit, et le bruit ne balaie pas [0, 1] :
## un fBm normalise se concentre autour de 0,5. MESURE SUR LE SEEKER, en
## peignant le bruit brut en niveaux de gris : il tient dans **0,32 a 0,65**,
## moyenne 0,51 — ce qui est la plage attendue d'une somme d'octaves.
##
## Les bornes du web (0,3 a 0,8) DEBORDENT donc des deux cotes : a 0,8 aucun
## pixel n'atteint le seuil et l'ombre est PLEINE et uniforme ; a 0,3 aucun ne
## l'atteint non plus et elle disparait. Dans les deux cas on obtient une nappe
## unie, c'est-a-dire rien.
##
## 0,42 a 0,62 reste dans la plage mesuree et garde un vrai decoupage aux deux
## extremes.
## LA PLAGE EST CENTREE SUR LE REGLAGE DE PAUL, pas sur la mienne.
##
## Il a fixe la couverture a 0,30 au tuner — la molette y etait en butee basse,
## donc c'est un choix et pas un hasard : moins de nuages, des trouees larges,
## et des rais qui passent. Ma plage precedente (0,42-0,62) ne descendait meme
## pas jusque-la, donc le jeu n'aurait jamais montre le ciel qu'il a valide.
##
## On garde une VARIATION — la meteo doit deriver, c'est ce qui fait qu'il y a
## un ciel au-dessus — mais autour de sa valeur et sans la depasser vers le
## haut : 0,30 a 0,44. Le plafond reste bien dans la dynamique mesuree du bruit
## (0,32-0,65), donc les deux extremes decoupent encore.
const COVERAGE_MIN := 0.30
const COVERAGE_MAX := 0.44
## LA PERIODE DE LA METEO — 600 s, le web est a 240.
##
## Elle commande a quelle vitesse les rais s'ouvrent et se referment, donc elle
## participe du meme reproche que `speed` et `morph` : « c'est un peu trop
## rapide ». Dix minutes pour un cycle complet, c'est un ciel qu'on ne surprend
## jamais en train de changer mais dont une partie voit bien qu'il a change.
const WEATHER_PERIOD := 600.0

## OU LA METEO COMMENCE, en part de sa plage.
##
## AU MILIEU, ET PAS EN HAUT. Le premier jet faisait `cos(0) = 1`, donc la
## partie s'ouvrait sur la couverture MAXIMALE — le seul reglage ou l'ombre est
## pleine et donc invisible. Toutes les captures des huit premieres secondes
## montraient un ciel vide, et les sondes disaient « tout va bien » parce que
## les valeurs etaient effectivement celles demandees. Le defaut n'etait pas
## dans l'accord des couches mais dans l'instant ou on les regardait.
const WEATHER_START := 0.5

## L'ECHELLE DE RENDU DU VOILE — PAS ENCORE BRANCHEE.
##
## `fx_bench` rend son voile a la moitie dans un SubViewport, ce qui divise le
## travail par quatre sans qu'on voie la difference (« un rai est trop flou »).
## Cette constante a ete recopiee ici SANS l'etre, et je ne l'ai vu qu'en
## cherchant d'ou venaient 21 images par seconde — une constante morte qui a
## l'air d'un reglage actif est pire que pas de constante du tout.
##
## Gardee, nommee pour ce qu'elle est : la reponse de rechange si baisser
## `REACH` ne suffit plus.
const RENDER_SCALE_UNUSED := 0.5

## LA PROFONDEUR DES DEUX COUCHES, sur la regle du terrain.
##
## Tres au-dessus de tout ce qui se tient sur le sol : les nuages sont dans le
## ciel.
##
## LES CHIFFRES DU WEB NE PASSENT PAS ICI, et la sonde l'a trouve avant
## l'appareil : il met les ombres a 5 000 et les rais a 7 500, or GODOT BORNE
## `z_index` A ±4096. Les deux valeurs etaient REJETEES — pas ecretees,
## rejetees — et les couches retombaient a 0, donc dessinees SOUS le terrain.
## Un ciel parfaitement calcule et parfaitement invisible.
##
## C'est L'ORDRE qui compte, pas les valeurs absolues : les ombres sous les
## rais, les deux au-dessus de tout ce qui se tient au sol. Le plus haut bloc
## de terrain vaut `Iso.depth(31,31) + 3` = 995 sur une ile 32x32, donc 3000 et
## 3500 laissent de la marge et tiennent dans la borne. L'intervalle entre les
## deux reste libre pour les oiseaux, qui doivent BAIGNER dans le soleil et non
## se poser dessus.
const Z_SHADOWS := 3000
const Z_RAYS := 3500

var _shadows: ColorRect
var _rays: ColorRect
var _elapsed := 0.0


func _ready() -> void:
	y_sort_enabled = false
	_shadows = _make_layer(SHADOW_SHADER, Z_SHADOWS)
	_rays = _make_layer(RAYS_SHADER, Z_RAYS)
	_apply()
	_resize()
	get_viewport().size_changed.connect(_resize)


## LE VOILE COUTE CE QU'IL COUVRE, et c'est la seule chose qui compte ici.
##
## MESURE SUR LE SEEKER, en eteignant les couches une par une :
##
##   tout allume ................ 21 fps
##   ombres + rais coupes ....... 97 fps
##   mer coupee en plus ......... 95 fps
##
## Le ciel coutait donc 76 images par seconde a lui seul, la mer rien. Et le
## nombre d'objets n'y etait pour rien : 46 draw calls dans les deux cas.
##
## `adb shell dumpsys gfxinfo` annoncait 7 ms par image pendant ce temps — il
## compte ce qu'ANDROID compose, pas ce que Godot rend. C'est la lecon des
## notes de l'app Expo (« le fps JS ment sur expo-gl ») sous une autre forme :
## on lit `Performance.TIME_FPS`, le moniteur du moteur.


func _make_layer(shader: Shader, z: int) -> ColorRect:
	var rect := ColorRect.new()
	var mat := ShaderMaterial.new()
	mat.shader = shader
	rect.material = mat
	rect.z_index = z
	# Un voile ne repond jamais au doigt : il couvre tout le plateau, et
	# laisse interactif il avalerait chaque tape destinee a une case.
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(rect)
	return rect


## LES VALEURS REGLEES, poussees dans les deux shaders.
##
## CE QUI EST PARTAGE EST PARTAGE VOLONTAIREMENT : scale, speed, morph,
## octaves, coverage et edge decrivent LE CIEL, pas une couche. Un seul de ces
## six qui differe et l'ombre au sol cesse de correspondre au rai qui la cause.
func _apply() -> void:
	var look: Dictionary = SkyLook.SKY
	var sm := _shadows.material as ShaderMaterial
	# LE BRUIT, CUIT UNE FOIS. `NoiseTexture2D` le genere au chargement ; le
	# shader ne fait plus qu'une lecture de texture la ou il evaluait deux
	# simplex 3D par pixel. `seamless` est indispensable : la texture est lue en
	# repeat, et une couture se verrait comme une ligne droite en travers du
	# ciel.
	if sm.get_shader_parameter("noise") == null:
		var tex := NoiseTexture2D.new()
		tex.width = 256
		tex.height = 256
		tex.seamless = true
		tex.generate_mipmaps = false
		var fn := FastNoiseLite.new()
		fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		fn.frequency = 0.012
		fn.fractal_octaves = 3
		tex.noise = fn
		sm.set_shader_parameter("noise", tex)
	sm.set_shader_parameter("iso", look["iso"])
	sm.set_shader_parameter("half_tile", Vector2(Iso.half_w(), Iso.half_h()))
	sm.set_shader_parameter("scale", look["scale"])
	sm.set_shader_parameter("speed", look["speed"])
	sm.set_shader_parameter("angle", look["angle"])
	sm.set_shader_parameter("morph", look["morph"])
	sm.set_shader_parameter("edge", look["edge"])
	sm.set_shader_parameter("pixel", look["pixel"] * COARSE)
	sm.set_shader_parameter("shade", look["shade"])
	sm.set_shader_parameter("alpha", look["shade_alpha"])

	var rm := _rays.material as ShaderMaterial
	# LE MEME BRUIT CUIT QUE LES OMBRES, et c'est voulu : les deux couches
	# decrivent UN SEUL ciel, donc elles doivent lire le meme champ. Partager la
	# texture le garantit par construction, la ou deux textures distinctes
	# auraient pu deriver.
	if rm.get_shader_parameter("noise") == null:
		rm.set_shader_parameter("noise", sm.get_shader_parameter("noise"))
	rm.set_shader_parameter("scale", look["scale"])
	rm.set_shader_parameter("speed", look["speed"])
	rm.set_shader_parameter("morph", look["morph"])
	rm.set_shader_parameter("octaves", int(look["octaves"]))
	rm.set_shader_parameter("edge", look["edge"])
	rm.set_shader_parameter("pixel", look["pixel"] * COARSE)
	rm.set_shader_parameter("softness", look["softness"])
	# LES DEUX CORRECTIONS D'ECHELLE DU PLAN, et sans elles rien n'arrive sur
	# l'ile. Le web les enonce ; je les avais omises, et le defaut ne se voit
	# pas : le plan rend sans erreur, simplement plus AUCUN rai n'atteint la
	# terre. Mesure — `fade` valait 0,24 au centre de l'ile, et quadrupler
	# `strength` ne changeait rien (ecart 0,5/255 sur la capture).
	#
	#   • `reach` est une distance en HAUTEURS DE PLAN — le fragment divise
	#     deja par la taille qu'on lui passe. Il faut donc la MULTIPLIER par
	#     REACH pour couvrir la meme distance a l'ecran.
	#   • `source` PASSE TELLE QUELLE, et surtout PAS divisee.
	#
	# LA DIVISION ETAIT LE PREMIER REFLEXE ET ELLE EST FAUSSE, parce qu'elle
	# RAPPROCHE le soleil au lieu de le garder loin. Mesure : elle mettait la
	# source a 0,20 de l'ile au lieu de 0,80. A cette distance l'eventail
	# s'ouvre DEPUIS l'ile — un projecteur pose dessus — au lieu de tomber en
	# colonnes presque paralleles d'un soleil lointain. Paul : « les god rays
	# sont super beaux mais les reglages ca va pas du tout ».
	#
	# LA REGLE : plus la source est LOIN, plus les rais sont PARALLELES ; plus
	# elle est PRES, plus ils divergent. Un soleil est loin.
	rm.set_shader_parameter("source", look["source"])
	rm.set_shader_parameter("tint", look["ray_tint"])
	rm.set_shader_parameter("strength", look["ray_strength"])
	rm.set_shader_parameter("reach", look["ray_reach"] * REACH)
	for k in ["motes", "mote_cell", "mote_size", "mote_density", "mote_rise", "mote_blink"]:
		rm.set_shader_parameter(k, look[k])


## LE PLAN, ET LE PIEGE D'ECHELLE QU'IL PORTE.
##
## Les deux voiles couvrent REACH fois le cadre, pour qu'aucun bord ne se voie
## quand la camera se promene. Mais l'ile est un Node2D MIS A L'ECHELLE : un
## plan pose ici en pixels d'ecran serait retreci avec elle. On divise donc par
## l'echelle du parent pour que le voile couvre toujours le meme ECRAN.
##
## Et les shaders veulent la taille REELLE : les rais corrigent l'aspect pour
## que l'angle soit un vrai angle, les ombres comptent leurs cellules en
## travers du plan. Une valeur perimee et les faisceaux s'etirent avec la
## fenetre.
func _resize() -> void:
	var view := get_viewport_rect().size
	var k: float = 1.0
	var parent := get_parent()
	if parent is Node2D:
		k = maxf(0.0001, (parent as Node2D).scale.x)
	var span := view * REACH / k

	for rect in [_shadows, _rays]:
		rect.size = span
		# Centre sur l'ile, pas sur le coin : le plan doit deborder de tous
		# les cotes.
		rect.position = -span * 0.5

	(_shadows.material as ShaderMaterial).set_shader_parameter("plane_size", span)
	# L'ETENDUE DU SOL, en cases : c'est elle qui donne au bruit son echelle.
	# Le plan fait `span` pixels ; une case fait une tuile. On compte donc
	# combien de tuiles tiennent en travers.
	(_shadows.material as ShaderMaterial).set_shader_parameter(
		"ground_span", Vector2(span.x / Iso.BURROW_TILE_W, span.y / Iso.BURROW_TILE_H))
	# LES RAIS LISENT L'ECRAN, PAS LE PLAN. Leur `source` est en coordonnees
	# d'ecran normalisees et leur angle se mesure la : leur passer la taille du
	# plan mettrait le soleil quatre fois trop loin et l'ile tomberait tout
	# entiere dans le fondu — plus un seul rai sur la terre. C'est le piege que
	# le web decrit en toutes lettres.
	(_rays.material as ShaderMaterial).set_shader_parameter("screen_size", span)


## LA METEO AVANCE, et les deux couches la lisent.
func _process(delta: float) -> void:
	_elapsed += delta
	# Une erre lente entre les bornes. Un cosinus plutot qu'un tirage : la
	# meteo doit deriver, pas sauter.
	# Decalee d'un quart de tour pour DEMARRER AU MILIEU de la plage : voir
	# WEATHER_START. Un sinus part de 0,5 la ou un cosinus part de 1.
	var phase := _elapsed / WEATHER_PERIOD * TAU
	var t := sin(phase) * 0.5 + WEATHER_START
	var live: float = lerpf(COVERAGE_MIN, COVERAGE_MAX, t)
	# LA MEME VALEUR AUX DEUX, a chaque image : c'est la ligne qui tient
	# l'accord. Sans elle, l'ombre et le rai racontent deux meteos.
	(_shadows.material as ShaderMaterial).set_shader_parameter("coverage", live)
	(_rays.material as ShaderMaterial).set_shader_parameter("coverage", live)
	# L'echelle du parent peut changer (cadrage, pincement) : le voile doit
	# garder la meme couverture d'ecran.
	_resize()


## Allume ou eteint les deux couches d'un coup — pour le banc et les sondes.
func show_sky(on: bool) -> void:
	_shadows.visible = on
	_rays.visible = on


## La couverture du moment, pour les sondes.
func coverage() -> float:
	return (_shadows.material as ShaderMaterial).get_shader_parameter("coverage")
