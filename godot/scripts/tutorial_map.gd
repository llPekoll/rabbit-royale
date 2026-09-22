extends RefCounted
class_name TutorialMap
## L'ILE DU TUTORIEL, DESSINEE A LA MAIN — un couloir, pas un champ.
##
## Portee de src/lib/game/tutorial-map.ts, telle quelle : c'est une IMAGE, pas
## un algorithme, et c'est ce qui la rend sure a porter. Elle ne peut pas
## diverger du serveur puisqu'il n'y a rien a recalculer — seulement des cases
## a recopier.
##
## POURQUOI UNE IMAGE ET PAS DU BRUIT. Toutes les autres iles sont taillees
## dans une graine : une cote, des plateaux, du decor sur ce qui reste. C'est
## juste pour un plateau qu'on explore, et faux pour les trente premieres
## secondes d'un joueur, ou l'ile a trois choses a apprendre et ou chaque
## direction de plus est une facon d'en rater une.
##
## Paul, le 2026-09-20 : « il faut que tu adapte la taille de l'ile au
## tutorial, genre que t'as qu'une possibilite de move... au debut t'as qu'une
## case ou aller tout le reste c'est de l'eau, apres ca deploie un peu. »
##
## LA MARCHE, pas a pas :
##   1. `S` n'a qu'UNE voisine — un depart en file indienne, aucun faux pas
##      possible parce qu'il n'y a pas de choix.
##   2. Trois cases plus loin, le couloir atteint `1`, l'indice. Son compte est
##      FORCE : toutes ses voisines sont mer ou terrain ouvert, sauf `B`.
##   3. Un pas de plus met le lapin A COTE de `B`, sans autre issue : c'est la
##      qu'on demande le X.
##   4. LE CHEMIN PASSE A COTE DE LA BOMBE, PAS DESSUS. Une bombe marquee est
##      un mur (`resolveMove` refuse un pas sur une case marquee, expres : un
##      doigt qui glisse ne doit pas couter une manche), donc un couloir qui
##      traversait `B` se murait lui-meme des que la lecon etait apprise — le
##      coffre devenait inatteignable et le tutoriel infinissable. Mesure, pas
##      devine. `B` pend donc sur le cote du chemin.
##   5. Passe elle, le terrain s'elargit — deux cases, puis trois — pour que la
##      derniere ligne droite vers `C` se lise comme le vrai jeu qui s'ouvre
##      plutot que comme un rail.
##
## EN ISO, les colonnes de la grille descendent en diagonale a l'ecran : une
## colonne de cases se dessine donc comme une pente. La carte se lit ici en
## coordonnees de GRILLE, et ce que le joueur voit est cette image tournee de
## 45 degres.
##
## LE COUT, ASSUME : la premiere ile est divulgachable — un joueur peut dire a
## un autre ou est la bombe. C'est une lecon, pas un lot, et elle se joue une
## fois.

## LA CARTE, un caractere par case.
##
##   `.` mer            `o` terrain ordinaire
##   `S` l'apparition   `1` l'indice que vise la lecon des chiffres
##   `B` la bombe enseignee — la case pour laquelle la manche est retenue
##   `C` le coffre, qui termine le tutoriel
const MAP := [
	"................",
	"................",
	"......S.........",
	"......o.........",
	".....o1.........",
	".....oB.........",
	"....ooo.........",
	"...ooooo........",
	"...ooCooo.......",
	"....ooooo.......",
	".....ooo........",
	"................",
	"................",
]

## Ou le coin haut-gauche de la carte se pose sur la grille 32x32.
const ORIGIN := Vector2i(11, 11)


## TOUTES LES CASES DE TERRE du tutoriel, en coordonnees de grille.
##
## Vingt-huit, et le compte est verifie contre la source : une case de plus ou
## de moins et le couloir n'est plus celui que les captions decrivent.
static func land() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(MAP.size()):
		var line: String = MAP[y]
		for x in range(line.length()):
			if line[x] == ".":
				continue
			out.append(ORIGIN + Vector2i(x, y))
	return out


## LA CASE PORTANT UN REPERE, ou (-1,-1) si la carte ne l'a pas.
##
## Le web leve une exception ; ici on rend une case impossible, que l'appelant
## teste. Une scene qui plante au demarrage sur un telephone ne dit rien a
## personne — un repere manquant doit se voir dans une sonde, pas dans un crash.
static func cell_for(ch: String) -> Vector2i:
	for y in range(MAP.size()):
		var x: int = (MAP[y] as String).find(ch)
		if x >= 0:
			return ORIGIN + Vector2i(x, y)
	return Vector2i(-1, -1)


## Ou la manche s'ouvre. C'est aussi la case sur laquelle tombe `spawn_tile`.
static func spawn() -> Vector2i:
	return cell_for("S")


## La case creusee qui lit son compte — ce que vise la lecon des chiffres.
static func clue() -> Vector2i:
	return cell_for("1")


## La bombe enseignee : la case pour laquelle la manche est retenue jusqu'a ce
## qu'elle porte un X.
static func bomb() -> Vector2i:
	return cell_for("B")


## Le coffre qui termine le tutoriel.
static func chest() -> Vector2i:
	return cell_for("C")
