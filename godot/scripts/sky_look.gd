extends RefCounted
class_name SkyLook
## COMMENT LE CIEL ECLAIRE L'ILE, EN UN SEUL ENDROIT.
##
## Meme discipline que `WaterLook`, et pour la meme raison : les ombres et les
## rais sont deux couches distinctes qui doivent decrire UN SEUL ciel. Six de
## ces reglages sont PARTAGES entre elles, et c'est volontaire — les separer,
## c'est obtenir une ombre au sol qui ne correspond plus au rai qui la cause.
##
## ⚠ CES VALEURS SONT CELLES DE PAUL, REGLEES A LA MAIN SUR LE SEEKER le
## 2026-09-22, avec `scenes/sky_tuner.tscn` et la vraie ile dessous. Elles ne
## sont PAS celles du web, et c'est voulu : les siennes sont reglees pour un
## cadre ou l'ile occupe moins de place, et la plupart se lisent mal une fois
## l'ile cadree pour 890x400.
##
## Elles se retouchent de la meme facon : on relance le tuner, on bouge, on
## appuie sur COPIER, on recopie ici. Ne pas les corriger « au raisonnement »
## depuis la source web — c'est l'oeil qui tranche un eclairage.
##
## Le depart reste CLOUD_SHADOW_NOISE_DEFAULTS et GOD_RAYS_DEFAULTS (web).

## LES OMBRES DE NUAGES — CLOUD_SHADOW_NOISE_DEFAULTS, RECOPIES TELS QUELS.
##
## Elles ne lisent PLUS rien de `SKY`. Les six « partages » ci-dessous ont ete
## regles au tuner pour les rais, sur un bruit different, et les faire servir
## aux ombres a donne un ciel qui n'avait plus rien de celui du web — Paul :
## « rien a voir avec ce que j'avais sur la version pixi ». Le shader
## d'ombre est maintenant un portage fidele du web, dans les memes unites, donc
## il prend les memes chiffres, et c'est la story
## `Island/Cloud Shadows (noise)` du storybook qui sert de reference.
##
## Pour retoucher : regler dans la story, recopier ici. Meme sens des dials
## que la-bas (scale = cellules de bruit par cadre de 960 px ; coverage BAS =
## plus de nuages).
const SHADOWS := {
	"iso": 0.4,
	"scale": 2.9,
	"speed": 0.05,
	"angle": 40.0,
	"morph": 0.05,
	"octaves": 3.9,
	"warp": 0.1,
	"coverage": 0.57,
	"coverage_min": 0.3,
	"coverage_max": 0.8,
	"weather_period": 240.0,
	"edge": 0.08,
	"pixel": 3.0,
	"shade": Color("#10203a"),
	"alpha": 0.32,
}

const SKY := {
	# ── LES SIX PARTAGES : ils decrivent LE CIEL, pas une couche ────────────
	## L'echelle du bruit. Pour les ombres, des cellules en travers du plan ;
	## pour les rais, des faisceaux sur le tour. Le meme chiffre dans les deux
	## parce que c'est la meme couverture nuageuse.
	## 6,1 — LA VALEUR DU TUNER (commit edc666f). NE PAS LA BOUGER AU
	## RAISONNEMENT.
	##
	## Le sens du dial est contre-intuitif : il compte les repetitions de la
	## texture, donc PLUS HAUT = TACHES PLUS PETITES.
	##
	## Essayee a ONZE puis a QUATRE le 2026-09-22, les deux mauvais, et la
	## lecon vaut d'etre gardee : l'etendue de luminosite du sol est restee a
	## 54, 57, 58 sur les trois essais. UN REGLAGE QUI NE DEPLACE PAS LA MESURE
	## DE TROIS NIVEAUX SUR 255 N'EST PAS LE REGLAGE EN CAUSE — le probleme
	## etait `warp` et `octaves`, coupes tous deux pendant la crise de fps.
	## 3,4 au lieu de 6,1 : des taches DEUX FOIS PLUS LARGES, donc moins
	## nombreuses a l'ecran. Avec `coverage` descendu et `octaves` coupe, c'est
	## le troisieme levier de la meme correction — passer d'une couverture
	## trouee a quelques nuages epars.
	"scale": 3.4,
	## LA DERIVE DU CIEL — ralentie a 0,012, le web est a 0,05.
	##
	## Son chiffre est regle sur un CADRE ; ici le plan couvre quatre fois le
	## cadre, donc la meme vitesse de bruit fait defiler quatre fois plus de
	## paysage sous les yeux. Paul sur la capture : « c'est un peu trop
	## rapide ». Un nuage qui file trahit l'echelle du decor — a cette taille
	## d'ile, une ombre doit mettre une minute a la traverser.
	"speed": 0.018,
	## LE FONDU DU BRUIT SUR LUI-MEME — ramene a 0,012, le web est a 0,05.
	##
	## C'est ce qui fait que les formes se DEFORMENT au lieu de seulement
	## glisser : l'indice qui dit « il y a une meteo au-dessus » plutot que
	## « quelqu'un a bouge un pochoir ». Mais trop haut, une plaque se defait
	## avant d'avoir traverse — Paul : « ca se dissout un peu trop vite ». Une
	## forme doit VIVRE le temps de sa traversee, et ne changer qu'a la marge
	## pendant ce temps.
	##
	## Garde EGAL a `speed` : les deux disent la meme chose — a quelle vitesse
	## le ciel se renouvelle — et les desaccorder donne soit des plaques figees
	## qui glissent, soit des taches qui bouillonnent sur place.
	"morph": 0.022,
	## 2,2 — fractionnaire, la derniere octave se fond progressivement.
	##
	## CE DIAL A ETE BAISSE DEUX FOIS POUR DEUX RAISONS OPPOSEES, et c'est ce
	## qui rend son histoire confuse. Coupe a 2,0 pendant la crise de fps,
	## quand chaque octave etait un simplex 3D de plus par pixel ; remis a 3,9
	## une fois le bruit cuit, puisqu'il ne coutait plus rien.
	##
	## Il redescend ici POUR L'IMAGE, pas pour le budget. Une octave haute
	## ajoute du detail FIN, et du detail fin sur une ombre de nuage la hache
	## en mouchetis : au lieu d'une masse qui passe, on lit un motif de
	## camouflage. Paul : « c'est encore bcp trop dense et bcp trop detaille ».
	##
	## Un nuage n'a que deux ou trois echelles de forme. Au-dela on ne dessine
	## plus un nuage, on dessine du bruit.
	"octaves": 2.2,
	## La durete du bord, des deux cotes de la ligne de partage. PLUS PETIT =
	## PLUS FRANC : c'est la demi-largeur du `smoothstep`.
	##
	## 0,19, LA VALEUR DU TUNER. Resserree a 0,10 le 2026-09-22 en cherchant a
	## donner une arete au nuage ; ca n'a rien change a la mesure, parce que le
	## defaut venait de `warp`.
	"edge": 0.19,
	## La quantification de l'echantillonnage. Divise le cout sans que le voile
	## change d'aspect : un rai et une ombre sont trop flous pour qu'on voie la
	## grille.
	"pixel": 3.0,

	# ── LES OMBRES ──────────────────────────────────────────────────────────
	## 0 = espace ecran, 1 = plan du sol. C'EST LUI QUI COUCHE L'OMBRE sur le
	## terrain au lieu de la laisser flotter devant.
	"iso": 0.4,
	## Le cap de la derive, en degres, dans l'espace du sol.
	"angle": 40.0,
	## LA DEFORMATION DU DOMAINE — pour que les taches ne soient pas les BOSSES
	## HEXAGONALES du simplex.
	##
	## 0,1, LA VALEUR DU TUNER, RETABLIE. Coupee a zero pendant la crise de fps
	## avec ce motif : « deux simplex 3D par pixel pour une nuance invisible a
	## ce cadrage ». Les deux moities etaient fausses.
	##
	## LE COUT N'EXISTE PLUS : le bruit est CUIT dans une `NoiseTexture2D`
	## depuis 7a82e79, donc un warp est une lecture de texture, pas un simplex.
	## Le dial a cesse d'etre celui qui coute au moment meme ou je l'ai coupe.
	##
	## ET LA NUANCE N'EST PAS INVISIBLE, c'est meme LE defaut qu'on voyait.
	## Sans warp, le bruit montre sa structure brute : de grandes cellules
	## molles qui marbrent tout l'ecran d'un bout a l'autre, la mer comme
	## l'ile. Paul, photo du 2026-09-22 : « c'est toujours hyper moche, a un
	## moment on avait les bonnes settings ». Il avait raison sur les deux
	## points — c'etait moche, et ses reglages etaient bons ; j'en avais casse
	## deux en cherchant des fps.
	"warp": 0.1,
	## Le bleu de nuit tres sombre de l'ombre. PAS DU NOIR : une ombre noire
	## sur de l'herbe donne du gris mort ; un bleu profond garde la couleur
	## dessous et se lit comme de l'ombre.
	"shade": Color("#10203a"),
	## 0,49, LA VALEUR DU TUNER. Montee a 0,70 le 2026-09-22 : le rapport
	## masse/grain sur l'herbe n'a pas bouge (0,58 → 0,52) alors que l'alpha
	## prenait 75 %. Encore le meme signe — le dial n'etait pas le bon.
	"shade_alpha": 0.49,

	# ── LES RAIS ────────────────────────────────────────────────────────────
	## La source, en coordonnees d'ecran normalisees. HORS-CHAMP, EN HAUT A
	## DROITE : le soleil est derriere le coin, et les rais traversent tout
	## l'ecran en diagonale. A (0,60, 0,20) la source tombait DANS le cadre,
	## au milieu du ciel : l'eventail s'ouvrait depuis le centre de l'ecran
	## (capture de Paul, 2026-09-23).
	##
	## Y A -0,10 ET NON -0,35 : plus le soleil est BAS, plus les rais sont
	## RASANTS. A -0,35 ils plongeaient ; Paul les voulait « plus vers
	## l'horizon ». X recule a 1,35 pour que la source reste bien hors champ.
	"source": Vector2(1.35, -0.10),
	## L'etalement du bruit LE LONG du rai. Sans lui, des chapelets de bulles
	## dans le faisceau au lieu d'une colonne.
	## 8,0 (le max du shader) : des colonnes longues, pas des taches.
	"softness": 8.0,
	## Le blanc chaud de la lumiere. Le rendu est ADDITIF : de la lumiere
	## s'ajoute a ce qu'elle traverse, donc l'herbe reste verte sous le rai,
	## juste plus claire. Un blanc en alpha-blend delaverait l'ile en gris.
	"ray_tint": Color(1.0, 0.95, 0.82, 1.0),
	## LA FORCE DES RAIS — ramenee a 0,20, le web est a 0,55.
	##
	## A 0,55 sur cet ecran les colonnes ECRASENT l'ile : l'herbe disparait
	## sous le blanc et on ne lit plus le terrain, ce qui est l'inverse du but.
	## Un rai doit se sentir, pas se nommer — comme la couche chaude du web,
	## « on veut le sentir, pas le nommer ».
	##
	## Meme cause que les tailles de l'eau : le chiffre du web est regle pour
	## un cadre ou l'ile occupe moins de place, et le rendu additif porte donc
	## sur proportionnellement moins de terrain.
	"ray_strength": 0.20,
	## Jusqu'ou le rai porte, en hauteurs de plan. SE REGLE AVEC `source` :
	## depuis (1,35, -0,10) le coin bas-gauche est a ~3,0 hauteurs (aspect
	## compris). A 5,5 le rai y arrive encore a ~45 %, a mi-ecran a ~73 % :
	## il traverse tout l'ecran au lieu de s'eteindre a mi-chemin.
	"ray_reach": 5.5,

	# ── LES POUSSIERES DANS L'AIR ───────────────────────────────────────────
	## Elles ne sont pas un systeme a part : le shader des rais les MULTIPLIE
	## par le faisceau, donc un grain ne brille QUE dans la lumiere. C'est
	## ainsi qu'on voit la poussiere dans la vraie vie — jamais dans l'ombre.
	"motes": 0.3,
	"mote_cell": 26.0,
	"mote_size": 2.2,
	## BASSE : la plupart des cellules sont vides. Une grille pleine laisse
	## voir sa trame en une seconde.
	"mote_density": 0.25,
	## La montee. L'air chaud d'un rai porte la poussiere vers le haut ; elle
	## ne file pas le long du faisceau.
	"mote_rise": 6.0,
	## A quelle vitesse un grain nait, brille et s'eteint. Des grains
	## permanents qui ne font que deriver se lisent comme une texture qui
	## glisse, pas comme de la poussiere.
	"mote_blink": 0.12,
}
