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

const SKY := {
	# ── LES SIX PARTAGES : ils decrivent LE CIEL, pas une couche ────────────
	## L'echelle du bruit. Pour les ombres, des cellules en travers du plan ;
	## pour les rais, des faisceaux sur le tour. Le meme chiffre dans les deux
	## parce que c'est la meme couverture nuageuse.
	"scale": 6.1,
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
	## LE DIAL QUI COUTE : chaque octave est un simplex de plus PAR PIXEL.
	## 3,9 — fractionnaire, la derniere se fond progressivement.
	"octaves": 3.9,
	## La durete du bord, des deux cotes de la ligne de partage.
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
	## La deformation du domaine, pour que les taches ne soient pas les bosses
	## hexagonales du simplex.
	"warp": 0.1,
	## Le bleu de nuit tres sombre de l'ombre. PAS DU NOIR : une ombre noire
	## sur de l'herbe donne du gris mort ; un bleu profond garde la couleur
	## dessous et se lit comme de l'ombre.
	"shade": Color("#10203a"),
	"shade_alpha": 0.49,

	# ── LES RAIS ────────────────────────────────────────────────────────────
	## La source, en coordonnees d'ecran normalisees. HORS-CHAMP : le soleil
	## est derriere le bord haut, et un rai part de plus loin que le cadre.
	"source": Vector2(0.69, 0.29),
	## L'etalement du bruit LE LONG du rai. Sans lui, des chapelets de bulles
	## dans le faisceau au lieu d'une colonne.
	"softness": 5.3,
	## Le blanc chaud de la lumiere. Le rendu est ADDITIF : de la lumiere
	## s'ajoute a ce qu'elle traverse, donc l'herbe reste verte sous le rai,
	## juste plus claire. Un blanc en alpha-blend delaverait l'ile en gris.
	"ray_tint": Color(1.0, 0.95, 0.82, 1.0),
	## LA FORCE DES RAIS — ramenee a 0,22, le web est a 0,55.
	##
	## A 0,55 sur cet ecran les colonnes ECRASENT l'ile : l'herbe disparait
	## sous le blanc et on ne lit plus le terrain, ce qui est l'inverse du but.
	## Un rai doit se sentir, pas se nommer — comme la couche chaude du web,
	## « on veut le sentir, pas le nommer ».
	##
	## Meme cause que les tailles de l'eau : le chiffre du web est regle pour
	## un cadre ou l'ile occupe moins de place, et le rendu additif porte donc
	## sur proportionnellement moins de terrain.
	"ray_strength": 0.29,
	## Jusqu'ou le rai porte, en hauteurs de plan.
	"ray_reach": 0.90,

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
