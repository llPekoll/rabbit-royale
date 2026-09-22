extends RefCounted
class_name WaterLook
## COMMENT L'EAU SE PRESENTE, EN UN SEUL ENDROIT.
##
## Porte de src/config/waterLook.ts, et la raison de ce fichier est la meme
## la-bas qu'ici : l'ecume est batie par l'ile ET par le terrier, et reglee
## dans une troisieme scene. Trois copies des memes nombres, c'est exactement
## ainsi que les deux lieux divergent — l'ile prend un reglage, le terrier garde
## l'ancienne teinte, et le jeu montre deux mers selon l'ecran ou l'on est.
##
## CE SONT LES VALEURS SUR LESQUELLES LES REGLAGES DU WEB SE SONT ARRETES. On
## les recopie plutot que de les re-trouver a l'oeil : elles ont ete jugees
## contre la vraie ile, la vraie ecume et la vraie couleur de mer.

## L'ECUME DU PACK, telle que `PackWater` la prend.
const FOAM := {
	## Millisecondes par image de houle.
	"frame_ms": 140,
	## De combien les cases voisines se desynchronisent, pour que la cote
	## VOYAGE au lieu de clignoter d'un bloc.
	"phase": 1.0,
	"alpha": 1.0,
	## Le blanc-vert pale de l'ecume du pack.
	"color": Color("#c6f0db"),
	## AU-DESSUS DE 1 : quelle part de la houle se voit dans l'EAU plutot que
	## sous la terre.
	##
	## Le debordement est cuit dans l'image, donc ceci est une molette et non ce
	## qui fait joindre la cote. Le 0,88 de la story la rentrait davantage sous
	## la terre, ce qui sur un plateau de telephone laissait la cote comme une
	## couture fine qu'il fallait chercher. 1,2 repousse la meme bande au-dela
	## du rivage pour qu'elle se lise d'un coup d'oeil.
	"overlap": 1.2,
}

## LA COMPAGNIE DE CANARDS, telle que `Ducks` la prend.
const DUCKS := {
	"count": 4,
	## Cases par seconde — un canard se deplace dans l'espace de la CARTE, pas
	## a l'ecran.
	"speed": 2.0,
	## 0,55 d'une image de 32 px — un oiseau, et un petit.
	##
	## L'echelle est descendue deux fois. A 1,2 le canard etait le plus gros
	## animal de l'ile ; a 0,8 il arrivait au corps d'un mouton, ce qui reste un
	## canard de la taille d'un mouton. Un canard est plus petit qu'un mouton, et
	## en pleine eau il n'y a rien a cote de lui pour dire sa taille sauf les
	## cases qu'il traverse — il se lit donc a la taille ou on le dessine, et la
	## taille ou il faut le dessiner est petite.
	##
	## RELEVE A 0,9 POUR L'ECRAN DU SEEKER, et c'est un ecart assume avec le
	## web. Son 0,55 donne 17,6 px sur une frame de 32 — deja petit dans un
	## navigateur, et l'ile est cadree ici a 0,56 pour tenir dans 890x400 : le
	## canard tombait a une dizaine de pixels reels, un grain qu'on ne
	## reconnait plus. Paul sur la capture : « les duck un peu trop petit ».
	##
	## Le raisonnement du web reste vrai — un canard est plus petit qu'un
	## mouton — mais il a ete regle a une echelle de camera qui n'est pas la
	## notre. On garde son intention, pas son chiffre.
	"scale": 0.9,
	"frame_ms": 220,
	## De combien de cases un canard cherche son prochain coin. Des sauts courts
	## se lisent comme un canard qui flane ; des longs, comme un canard qui a
	## quelque chose a faire — ce qu'un canard n'est pas.
	"range": 6,
	"rest_ms": 900,
	"dive_ms": 500,
}

## LES ROCHERS EN PLEINE EAU.
##
## Ils sont le tirage DE LA VUE, pas celui du plateau : le jeu n'a rien a dire
## de la mer, rien ne s'y tient. D'ou un flux de graine a part, pour que les
## rochers ne derangent pas la terre.
const ROCKS := {
	## LA DENSITE, RELEVEE A 0,05 POUR CET ECRAN — le web est a 0,025.
	##
	## MESURE avant de toucher la molette : a 0,025 la graine « default » ne pose
	## que 8 rochers pour 331 cases d'eau libre. Ils sont en fait bien repartis
	## (2/3/2/1 par quadrant) — c'est leur RARETE qui les fait paraitre
	## agglutines, pas un defaut de tirage. Paul sur la capture : « essaie de les
	## eparpiller un peu partout dans la mer ».
	##
	## 0,05 en pose 16, repartis 4/3/3/6. Le chiffre du web a ete regle pour un
	## navigateur large ou l'ile prend moins de place dans le cadre ; ici elle est
	## cadree pour tenir dans 890x400 et la mer visible est plus petite.
	"chance": 0.05,
	## Trois fois une case : ce sont des rochers, pas des cailloux.
	"size": 3.0,
	## L'ECHELLE DU DECOR DE L'ILE — `DECO_SCALE` cote web (0,4 sur l'ile, 0,44
	## au terrier). OUBLIE DANS LE PREMIER JET, et c'est ce qui a donne des
	## rochers 2,6 fois trop gros sur le Seeker. Le facteur complet est
	## `deco_scale * (TILE/frame) * size` = 0,4 * 0,5 * 3 = 0,6.
	"deco_scale": 0.4,
	## La feuille est decoupee a 128, le double du 64 du reste du sol — il faut
	## donc diviser par sa propre image avant d'appliquer `size`, sinon le
	## rocher sort deux fois trop grand. Meme normalisation que le sol avec
	## `metrics.w / TILE`.
	"frame": 128,
	"frames": 8,
	"frame_ms": 200,
}

## LA PROFONDEUR SOUS L'ILE, telle que `SeaGradient` la prend.
##
## NOTER LE SENS, et il est l'inverse du premier jet : `sea` est la SOMBRE.
## L'eau est pale la ou l'ile se tient et s'assombrit vers le large, ce qui est
## la lecture qu'un peintre en ferait — la plate-forme sous la cote qui prend la
## lumiere, l'eau profonde au-dela qui ne la prend pas.
##
## `sea` est donc aussi ce a quoi le fond est efface : le degrade atteint sa
## couleur lointaine sur les bords, et tout ce qui depasse du plan doit
## s'accorder avec elle, sinon le cadre montre un livre dans l'ancien bleu.
const SEA := {
	## Le large, loin de toute terre — et la couleur d'effacement du fond.
	"sea": Color("#0d5f8c"),
	## L'eau peu profonde dans laquelle l'ile se tient.
	"deep": Color("#1eaac4"),
	"center": Vector2(0.5, 0.55),
	"radius": 0.5,
	## UN VRAI RAPPORT D'ELLIPSE, mesure en pixels : la flaque est plus large
	## que le treillis parce qu'elle tient lieu de la profondeur qui s'eloigne,
	## pas de l'empreinte de l'ile.
	"aspect": 3.25,
	"softness": 0.56,
	"strength": 1.0,
	## Inclinee sur la diagonale de l'ile, ce qui la met en perspective plutot
	## que d'equerre avec l'ecran. En degres ; le shader prend des radians.
	"angle_deg": 175.0,
	## Assez de paliers pour se lire comme une rampe, assez peu pour rester du
	## pixel art. UNE RAMPE LISSE EST LA SEULE CHOSE QUI TRAHIT un post-process
	## pose sur du pixel art : les tuiles ont une palette fixe, un degrade de
	## 256 paliers non.
	"steps": 40.0,
}
