extends RefCounted
class_name FirstIsland
## COMMENT LA PREMIERE ILE EST NOMMEE — partage par les deux cotes, et rien
## d'autre.
##
## Porte de src/lib/game/first-island.ts.
##
## LA GRAINE EST LA SEULE CHOSE D'UNE ILE QUI ATTEINT LE CLIENT, donc le fait
## « ceci est l'ile du tutoriel » voyage dessus, en prefixe. Le terrain lit le
## prefixe pour tailler l'ile en petit (`carve_tutorial`), le generateur le lit
## pour distribuer le plateau a la main, et le client le lit pour jouer ses
## captions. Aucun drapeau ne traverse le fil que la graine ne porte deja, et
## les deux cotes ne peuvent pas etre en desaccord sur l'ile dont on parle.
const FIRST_SEED_PREFIX := "first:"

## L'UNIQUE ILE DU TUTORIEL — le meme sol pour tout joueur qui commence.
##
## La graine porte TOUJOURS l'identifiant du joueur, parce que chaque nouveau
## venu a besoin de SON instance : il creuse ses propres trous, en solo, et deux
## joueurs ne doivent pas partager un plateau. Mais tout ce dont le SOL est fait
## — la cote, l'apparition, ou sont la bombe enseignee et son temoin, ou est le
## coffre — se derive de cette constante, donc l'ile sur laquelle ils
## atterrissent est identique.
##
## POURQUOI FIXE. La premiere ile est une lecon ecrite : les captions enoncent
## une deduction a voix haute, le plateau doit la prouver, et la manche est
## bloquee tant que le joueur n'a pas marque la bombe. Chacune de ces choses
## suppose de savoir exactement ce que le joueur regarde. Distribuee par joueur,
## le tutoriel devait se defendre contre un sol qu'il ne pouvait pas prevoir —
## et la seule chose pire qu'un tutoriel difficile a regler, c'est un tutoriel
## dont le comportement differe entre deux joueurs qui rapportent le meme bug.
const FIRST_ISLAND_GROUND := "tutorial-v1"

## L'UNIQUE ILE — le meme sol pour tous les joueurs, a tous les niveaux.
##
## Meme echange que le tutoriel, pour une autre raison : le jeu est une
## competition, et deux joueurs qui comparent leurs manches doivent avoir
## marche sur la meme cote. Chaque ile reste son instance (id = uuid neuf), et
## ce qui est ENTERRE sort toujours de la graine de contenu privee : connaitre
## le sol par coeur dit ou marcher, jamais ou sont les bombes.
##
## Doit rester egal a ISLAND_GROUND de src/lib/game/first-island.ts. Changer le
## suffixe retaille l'ile pour tout le monde d'un coup.
const ISLAND_GROUND := "island-v1"


## LE NIVEAU DU LAPIN VOYAGE AUSSI SUR LA GRAINE : `lv3:<uuid>`. Il decide
## la TAILLE de l'ile (RABBIT_LEVELS `land`) et ses coffres, et le client taille
## la cote depuis la graine seule. Porte de `seedLevel` (first-island.ts).
static func seed_level(seed_value: String) -> int:
	if not seed_value.begins_with("lv"):
		return 0
	var colon := seed_value.find(":")
	if colon < 3:
		return 0
	var digits := seed_value.substr(2, colon - 2)
	return int(digits) if digits.is_valid_int() else 0


## La ligne de l'echelle d'un niveau, bornee a 1..MAX comme `levelRow`.
static func level_row(level: int) -> Dictionary:
	var ladder: Array = (load("res://assets/tuning.json") as JSON).data.RABBIT_LEVELS.LADDER
	return ladder[clampi(level, 1, ladder.size()) - 1]


static func seed_for(id: String) -> String:
	return FIRST_SEED_PREFIX + id


static func is_first(seed_value: String) -> bool:
	return seed_value.begins_with(FIRST_SEED_PREFIX)


## LA GRAINE DONT LE SOL EST TAILLE, pour n'importe quelle graine d'ile.
##
## Le sol de la premiere ile est celui, fixe, du tutoriel ; toute autre ile
## partage `ISLAND_GROUND`. Le terrain, la forme et la distribution passent tous par ici, donc
## les deux cotes ne peuvent pas diverger : le client rebatit la cote a partir
## de la graine qu'on lui a tendue et tombe sur la meme regle.
static func ground_seed(seed_value: String) -> String:
	if is_first(seed_value):
		return FIRST_SEED_PREFIX + FIRST_ISLAND_GROUND
	return ISLAND_GROUND
