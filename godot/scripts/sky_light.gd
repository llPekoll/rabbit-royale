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
const COMPOSITE_SHADER := preload("res://shaders/sky_composite.gdshader")

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

## LA QUANTIFICATION RESTE CELLE DE LA CONFIG (`pixel` = 3).
##
## Elle a ete grossie d'un facteur trois pendant la chasse aux 21 fps, et ca
## n'avait RIEN rapporte — la mesure l'a montre tout de suite : le cout etait le
## simplex 3D, pas le nombre de lectures. Une fois le bruit cuit, le budget est
## revenu (82 fps) et le detail avec : a neuf, les ombres sortaient par gros
## blocs. « c'est trop pixelise la, on comprend rien. »



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
## LA PLAGE EST RECALEE SUR LE BRUIT CUIT, et c'est une mesure.
##
## Elle valait 0,30-0,44, cale sur le simplex calcule qui tenait dans
## 0,32-0,65. Le bruit CUIT (`NoiseTexture2D`) est mieux etale — mesure en le
## peignant en gris a l'ecran du Seeker : il balaie 0,00 a 1,00, moyenne 0,45,
## avec 40 % de sa masse entre 0,38 et 0,50.
##
## A 0,30, le seuil passait SOUS tout le bruit : zero pour cent d'ombre pleine,
## donc un ciel parfaitement uniforme et parfaitement invisible. Le meme mode de
## panne que la premiere fois, pour la raison inverse.
##
## 0,46-0,60 coupe dans le gros de la distribution : environ un cinquieme du
## ciel en ombre a la couverture basse, la moitie a la haute. Le reglage de Paul
## (0,52 au tuner) tombe au milieu.
## LA CONVERSION D'ECHELLE entre un bruit calcule et une texture.
##
## `SkyLook.scale` vaut 6,1 — le chiffre que Paul a regle au tuner, sur un bruit
## CALCULE ou il comptait des cellules de simplex. Le shader lit maintenant une
## TEXTURE, ou la meme molette compte des REPETITIONS.
##
## MESURE plutot que devine : le sol balaie 36,9 cases en travers de l'ecran
## (u de 0 a 20,2 plus v de 0 a 16,7). Pour que la texture s'y repete environ
## DEUX fois — assez pour des plaques distinctes, assez peu pour qu'un texel
## couvre plusieurs pixels — il faut un `scale` normalise de 1,1, donc ce
## facteur.
##
## Mon premier chiffre etait 0,048 : la texture ne balayait alors que 0,53
## unite sur tout l'ecran, soit a peine plus d'UN texel etire. D'ou la bouillie
## floue, et une ombre qui ne variait que le long d'une diagonale.
const TEXTURE_SCALE := 0.18

## 0,34-0,46 AU LIEU DE 0,46-0,60, et c'est de la DENSITE qu'il s'agit.
##
## L'ancienne plage « coupait dans le gros de la distribution : environ un
## cinquieme » — donc un cinquieme du ciel sous l'ombre EN PERMANENCE. Avec le
## detail de `octaves`, ce cinquieme se repartit en une multitude de petites
## taches au lieu de quelques masses, et l'ile entiere se lit comme un
## CAMOUFLAGE. Paul, sur la photo du 2026-09-22 : « c'est encore bcp trop dense
## et bcp trop detaille ».
##
## Un ciel de beau temps porte quelques nuages epars, pas une couverture
## trouee. Le seuil se descend donc SOUS le gros de la distribution : seules
## les vraies creux du bruit passent, donc peu de taches, et chacune large.
const COVERAGE_MIN := 0.34
const COVERAGE_MAX := 0.46
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

## OMBRES ET RAIS : DEMI-RESOLUTION, UNE IMAGE SUR QUATRE — 2026-09-24.
##
## Les deux voiles se rendent chacun dans un SubViewport, a la moitie de
## l'ecran (quatre fois moins de fragments), et ne sont recalcules qu'une image
## sur quatre ; entre deux on reaffiche la derniere, etiree — une seule lecture
## 2D par pixel. Ils bougent a peine et sont flous par nature, donc ni l'un ni
## l'autre ne se voit. « calcule 1 frame sur 4 et divise la resolution par 2 ».
##
## PENDANT UN PAN OU UN ZOOM, ils se recalculent a chaque image (voir
## `_process`) : sinon les ombres, posees sur le sol, traineraient derriere le
## terrain. Le gain ne vaut donc que camera immobile. 1 = chaque image.
const OFFSCREEN_EVERY := 4
const OFFSCREEN_SCALE := 0.5

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

## LE CADRE DU WEB, pour que les ombres aient la meme echelle que la-bas :
## `mountCloudShadows` monte un plan de TUNED_W x TUNED_H x REACH et multiplie
## `scale` par REACH. Ce sont des diviseurs, pas la taille du voile Godot.
const WEB_FRAME := Vector2(960.0, 540.0)
const WEB_REACH := 4.0

## Le bruit cuit des ombres : taille en texels, et la frequence qui en fait
## une periode entiere d'unites de bruit (voir `_apply_shadows`).
const SHADOW_NOISE_SIZE := Vector3i(128, 128, 64)
const SHADOW_NOISE_FREQ := 1.0 / 16.0

var _shadows: ColorRect
var _rays: ColorRect
## Les viewports ou les voiles se calculent, et les rectangles qui les
## affichent — [ombres, rais].
var _vps: Array[SubViewport] = []
var _views: Array[TextureRect] = []
var _frame := 0
## La transformation du parent a la derniere image : si elle bouge, la camera
## bouge, et les voiles se recalculent a CHAQUE image (voir OFFSCREEN_EVERY).
var _last_xform := Transform2D()
## Les poussieres en particules, quand les rais sont sur la mer.
var _motes: MoteField

## LE BRUIT DES RAIS, PARTAGE avec la mer (SeaGradient) : le soleil sur l'eau
## doit lire le meme ciel que le rai.
static var _ray_noise: NoiseTexture2D
var _elapsed := 0.0
var _shadow_phase := 0.0


func _ready() -> void:
	y_sort_enabled = false
	_shadows = _make_layer(SHADOW_SHADER, Z_SHADOWS)
	_rays = _make_layer(RAYS_SHADER, Z_RAYS)
	_offscreen(_shadows, Z_SHADOWS)
	_offscreen(_rays, Z_RAYS)
	# Un voile cache ne remplit aucun fragment, et son viewport ne rend rien.
	_views[1].visible = SkyLook.RAYS_IN_AIR
	if SkyLook.AIR_MOTES_ON:
		_motes = MoteField.new()
		_motes.z_index = Z_RAYS
		add_child(_motes)
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


## UN VOILE PASSE DANS UN SubViewport (voir OFFSCREEN_EVERY).
##
## Le viewport a fond TRANSPARENT stocke le voile en alpha PREMULTIPLIE : les
## ombres parce que le melange normal sur du noir transparent multiplie la
## couleur par l'alpha, les rais parce que leur shader ecrit deja en
## premultiplie (alpha nul = additif). L'affichage se fait donc en
## PREMULT_ALPHA pour les deux — en normal, l'ombre sortirait trop claire sur
## ses bords.
func _offscreen(rect: ColorRect, z: int) -> void:
	var vp := SubViewport.new()
	vp.transparent_bg = true
	vp.disable_3d = true
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	add_child(vp)
	remove_child(rect)
	vp.add_child(rect)
	rect.z_index = 0
	rect.position = Vector2.ZERO

	var view := TextureRect.new()
	view.texture = vp.get_texture()
	view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	view.stretch_mode = TextureRect.STRETCH_SCALE
	view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	view.z_index = z
	# Les ombres : premultiplie simple. Les rais : leur shader de composition,
	# pour l'opacite et le mode de fusion (sky_composite.gdshader).
	if rect == _rays:
		var sm := ShaderMaterial.new()
		sm.shader = COMPOSITE_SHADER
		view.material = sm
	else:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_PREMULT_ALPHA
		view.material = mat
	add_child(view)
	_vps.append(vp)
	_views.append(view)


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
	_apply_shadows(sm)

	var rm := _rays.material as ShaderMaterial
	# LE BRUIT DES RAIS, CUIT UNE FOIS. `NoiseTexture2D` le genere au
	# chargement ; le shader ne fait plus qu'une lecture de texture la ou il
	# evaluait deux simplex par pixel. `seamless` est indispensable : la texture
	# est lue en repeat, et une couture se verrait comme une ligne droite en
	# travers du ciel.
	#
	# Les ombres ont leur propre bruit, en 3D (voir `_apply_shadows`) : elles
	# sont un portage fidele du web, les rais sont regles au tuner sur celui-ci.
	if rm.get_shader_parameter("noise") == null:
		rm.set_shader_parameter("noise", ray_noise())
	rm.set_shader_parameter("scale", look["scale"] * TEXTURE_SCALE)
	rm.set_shader_parameter("speed", look["speed"])
	rm.set_shader_parameter("morph", look["morph"])
	rm.set_shader_parameter("octaves", int(look["octaves"]))
	rm.set_shader_parameter("edge", look["edge"])
	rm.set_shader_parameter("pixel", 1.0)
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
	var cm := _views[1].material as ShaderMaterial
	cm.set_shader_parameter("opacity", look["ray_opacity"])
	cm.set_shader_parameter("mode", int(look["ray_blend"]))
	# Les poussieres sont celles de MoteField quand il est la : pas deux fois.
	if SkyLook.AIR_MOTES_ON:
		rm.set_shader_parameter("motes", 0.0)


## Le bruit des rais, cuit une fois pour tout le jeu.
##
## `NoiseTexture2D` le genere au chargement ; le shader ne fait plus qu'une
## lecture de texture la ou il evaluait deux simplex par pixel. `seamless` est
## indispensable : la texture est lue en repeat, et une couture se verrait
## comme une ligne droite en travers du ciel. 1024 : cuite une fois, donc sa
## taille ne coute rien par image, et elle donne des bords de plaque francs la
## ou 256 laissait un flou d'interpolation.
static func ray_noise() -> NoiseTexture2D:
	if _ray_noise == null:
		var tex := NoiseTexture2D.new()
		tex.width = 1024
		tex.height = 1024
		tex.seamless = true
		tex.generate_mipmaps = false
		var fn := FastNoiseLite.new()
		fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		fn.frequency = 0.012
		fn.fractal_octaves = 3
		tex.noise = fn
		_ray_noise = tex
	return _ray_noise


## LES OMBRES, AUX CHIFFRES DU WEB.
##
## Tout vient de `SkyLook.SHADOWS`, qui recopie CLOUD_SHADOW_NOISE_DEFAULTS, et
## passe par les memes conversions que `mountCloudShadows` : `scale` multiplie
## par le REACH du web, `uSize`/`uGroundSpan` ceux de son plan de 3840x2160.
## Les pixels du monde sont les memes des deux cotes (cases de 44x24), donc les
## nuages ont la meme taille sur l'ile Godot que sur l'ile Pixi.
func _apply_shadows(sm: ShaderMaterial) -> void:
	var o: Dictionary = SkyLook.SHADOWS
	if sm.get_shader_parameter("noise") == null:
		# LE SIMPLEX DU WEB, CUIT EN 3D. Une seule octave : le fBm, le warp et
		# le temps se font dans le shader, comme sur le web, avec des lectures
		# au lieu de calculs. 128 x 128 x 64 en L8, un megaoctet.
		#
		# La frequence fixe la PERIODE : 1/16 sur 128 texels = 8 unites de
		# bruit par repetition, 16 texels par unite — assez pour que le
		# filtrage lineaire reste rond. Le temps boucle sur 4 unites, soit 80 s
		# a `morph` 0,05, et la derive empeche de jamais revoir la meme scene.
		var tex := NoiseTexture3D.new()
		tex.width = SHADOW_NOISE_SIZE.x
		tex.height = SHADOW_NOISE_SIZE.y
		tex.depth = SHADOW_NOISE_SIZE.z
		tex.seamless = true
		tex.normalize = true
		var fn := FastNoiseLite.new()
		# SIMPLEX_SMOOTH (OpenSimplex2S) : des noyaux larges comme le 0,6 du
		# simplex d'Ashima, donc des bosses aussi molles.
		fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		fn.fractal_type = FastNoiseLite.FRACTAL_NONE
		fn.frequency = SHADOW_NOISE_FREQ
		tex.noise = fn
		sm.set_shader_parameter("noise", tex)
		sm.set_shader_parameter("noise_period", Vector3(SHADOW_NOISE_SIZE) * SHADOW_NOISE_FREQ)

	var span := WEB_FRAME * WEB_REACH
	var half := Vector2(Iso.half_w(), Iso.half_h())
	sm.set_shader_parameter("frame", span)
	sm.set_shader_parameter("half_tile", half)
	sm.set_shader_parameter("ground_span", span.x / (2.0 * half.x) + span.y / (2.0 * half.y))
	sm.set_shader_parameter("iso", o["iso"])
	sm.set_shader_parameter("scale", o["scale"] * WEB_REACH)
	var a := deg_to_rad(o["angle"])
	sm.set_shader_parameter("drift", Vector2(cos(a), sin(a)) * o["speed"])
	for k in ["morph", "octaves", "warp", "edge", "pixel", "shade", "alpha"]:
		sm.set_shader_parameter(k, o[k])
	sm.set_shader_parameter("coverage", o["coverage"])
	_shadow_phase = _find_shadow_phase()


## LA METEO DES OMBRES, celle du web : deux sinus de periodes incommensurables,
## pour que le balancement ne soit pas un metronome. Rend 0..1.
func _shadow_weather(t: float) -> float:
	var p: float = SkyLook.SHADOWS["weather_period"]
	return 0.5 + 0.25 * sin(TAU * t / p) + 0.25 * sin(TAU * t / (p * 0.37) + 1.3)


## La phase de depart ou la meteo vaut `coverage` — le `startPhase` du web.
func _find_shadow_phase() -> float:
	var o: Dictionary = SkyLook.SHADOWS
	var lo: float = o["coverage_min"]
	var hi: float = o["coverage_max"]
	if hi <= lo:
		return 0.0
	var want := clampf((o["coverage"] - lo) / (hi - lo), 0.0, 1.0)
	var best := 0.0
	var best_err := INF
	for i in 200:
		var t: float = i / 200.0 * o["weather_period"]
		var err := absf(_shadow_weather(t) - want)
		if err < best_err:
			best_err = err
			best = t
	return best


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
	var parent := get_parent() as Node2D
	var k: float = 1.0
	var at := Vector2.ZERO
	if parent != null:
		k = maxf(0.0001, parent.scale.x)
		at = parent.position

	# LE PLAN EST ANCRE A L'ECRAN, PAS A L'ILE — et c'est la correction que la
	# capture a demandee.
	#
	# Ce noeud est ENFANT de l'ile, donc il herite de sa position ET de son
	# echelle. Le plan etait dimensionne en pixels d'ecran mais pose a `-span/2`
	# dans le repere de l'ile : des que la camera la cadrait ailleurs que sur
	# zero, le voile partait avec elle et son BORD traversait l'image — la ligne
	# horizontale nette qu'on voyait couper l'ile en deux.
	#
	# On defait donc la transformation du parent : diviser par son echelle pour
	# que le plan couvre toujours le meme ECRAN, et soustraire sa position pour
	# que son coin retombe sur le coin de l'ecran.
	var span := view * REACH / k
	var corner := (-at / k) - span * (REACH - 1.0) * 0.5 / REACH

	# Le viewport a la moitie de l'ECRAN, et son affichage couvre le plan
	# dans le repere de l'ile. Les shaders lisent UV, pas la taille du
	# rectangle, donc le motif ne change pas d'echelle.
	var px := Vector2i(maxi(1, int(view.x * OFFSCREEN_SCALE)), maxi(1, int(view.y * OFFSCREEN_SCALE)))
	for i in _vps.size():
		if _vps[i].size != px:
			_vps[i].size = px
		(_shadows if i == 0 else _rays).size = Vector2(px)
		_views[i].size = span
		_views[i].position = corner

	# LE PLAN DES OMBRES EN PIXELS DU MONDE : son coin et sa taille dans le
	# repere de l'ile. Le voile suit l'ecran, mais le bruit qu'il lit est pose
	# sur le terrain — il glisse avec lui quand la camera bouge.
	(_shadows.material as ShaderMaterial).set_shader_parameter("plane_origin", corner)
	(_shadows.material as ShaderMaterial).set_shader_parameter("plane_size", span)
	(_rays.material as ShaderMaterial).set_shader_parameter("screen_size", span)
	if _motes != null:
		_motes.area = Rect2(corner, span)
		_motes.unit = 1.0 / k


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
	# Les rais gardent la meteo reglee au tuner sur leur propre bruit.
	(_rays.material as ShaderMaterial).set_shader_parameter("coverage", live)
	# Les ombres, celle du web — le seuil n'a pas le meme sens sur un fBm
	# (qui se tasse autour de 0,5) que sur la texture des rais.
	var o: Dictionary = SkyLook.SHADOWS
	var sw := _shadow_weather(_elapsed + _shadow_phase)
	(_shadows.material as ShaderMaterial).set_shader_parameter(
		"coverage", lerpf(o["coverage_min"], o["coverage_max"], sw))
	# L'echelle du parent peut changer (cadrage, pincement) : le voile doit
	# garder la meme couverture d'ecran.
	_resize()
	_frame += 1
	# PAN OU ZOOM : les voiles suivent a chaque image. Les ombres sont posees
	# sur le sol, dans le repere du monde ; recalculees une image sur quatre
	# pendant un glissement, elles traineraient derriere le terrain. « qd tu
	# a un pan ou un zoom ou dezoom faut que ca suive ».
	var parent := get_parent() as Node2D
	var xform := parent.transform if parent != null else Transform2D()
	var moving := not xform.is_equal_approx(_last_xform)
	_last_xform = xform
	if moving or _frame % OFFSCREEN_EVERY == 0:
		for i in _vps.size():
			if _views[i].visible:
				_vps[i].render_target_update_mode = SubViewport.UPDATE_ONCE


## Allume ou eteint les deux couches d'un coup — pour le banc et les sondes.
func show_sky(on: bool) -> void:
	_views[0].visible = on
	_views[1].visible = on and SkyLook.RAYS_IN_AIR
	if _motes != null:
		_motes.visible = on


## La couverture du moment, pour les sondes.
func coverage() -> float:
	return (_shadows.material as ShaderMaterial).get_shader_parameter("coverage")
