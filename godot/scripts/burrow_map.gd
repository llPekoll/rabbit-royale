extends RefCounted
class_name BurrowMap
## LE RELIEF DU TERRIER — quelles cases sont de la terre, et a quelle hauteur.
##
## Arithmetique pure : aucun noeud, aucune texture. C'est deliberé, et c'est ce
## que fait la source (src/game/island/relief.ts) — la geometrie du terrain doit
## pouvoir etre calculee sans moteur de rendu, parce que le serveur en a besoin
## lui aussi pour savoir ou un lapin peut se tenir.
##
## DEUX PALIERS, PAS TROIS. Le web l'a tranche : sur un 19x19, trois paliers
## font un escalier et le palier haut devient trop petit pour porter quoi que
## ce soit.
##
## PALIER 0 = MER, 1 = SOL, 2+ = PLATEAU. Hors limites vaut zero, et c'est ce
## que veut l'autotileur : une case du pourtour doit croire qu'elle borde
## l'eau, sinon elle perd son bord.

const TIERS := 2

## Quelle part du plateau est de la terre. Plus haut que le 0.46 de l'ile : un
## terrier est une ferme, pas un fjord.
const LAND := 0.72

## Quelle part de la terre monte d'un palier.
const RISE := 0.2

## L'irregularite de la cote. A 0.3 elle etait toute en criques.
const RAGGEDNESS := 0.12

## LA HAUTEUR D'UN PALIER, EN PIXELS.
##
## Six, et ce nombre est partage mot pour mot avec l'ile. Les deux DOIVENT
## rester egaux : sinon le meme sprite de falaise a un trou sous lui sur un
## ecran et un surplomb sur l'autre.
const TIER_LIFT := 6

## LA HAUTEUR D'UN PALIER A L'ECRAN, reglable.
##
## Six est le chiffre du jeu, tranche le 2026-09-18, et il est DELIBEREMENT
## discret : le relief doit se sentir sans que le terrier devienne une falaise.
##
## CE CHIFFRE EXPLIQUE POURQUOI LE PLATEAU SEMBLE PLAT, et ce n'est pas un
## defaut. Deux cases voisines sont deja separees de douze pixels par la
## projection ; un palier n'en ajoute que six. La tuile de devant, haute de
## trente (vingt-quatre de losange et six de rocher), recouvre donc tout sauf
## six pixels de la bande de sa voisine. C'est exactement ce qu'on voit, et
## c'est ce qui etait voulu.
##
## Le monter le montre tout de suite : a dix-huit, le plateau se detache
## franchement. C'est le reglage a toucher si le relief doit se lire de plus
## loin, pas le rendu.
var lift_px := TIER_LIFT

var width: int
var height: int
## Le palier de chaque case, en ligne d'abord.
var level: PackedByteArray


func _init(p_width: int = Iso.BURROW_COLS, p_height: int = Iso.BURROW_ROWS) -> void:
	width = p_width
	height = p_height
	level = PackedByteArray()
	level.resize(width * height)


## LE PALIER D'UNE CASE. Hors limites repond zero — la mer.
func level_at(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= width or y >= height:
		return 0
	return level[y * width + x]


func is_land(x: int, y: int) -> bool:
	return level_at(x, y) > 0


## LES QUATRE COINS D'UNE CASE, et de combien chacun est souleve.
##
## LA REGLE : un sommet se tient a la PLUS HAUTE des quatre cases qui le
## partagent. Tout le relief decoule de la.
##
## Consequence, et c'est elle qui fabrique les rampes sans qu'on les code : une
## case BASSE contre un plateau voit ses coins partages leves et devient la
## pente ; le plateau, lui, garde ses propres coins a sa hauteur et reste plat
## avec une silhouette nette. La mer ne leve jamais rien, donc une case cotiere
## reste plate vers l'eau.
##
## Ordre : haut, droite, bas, gauche.
func corner_lifts(x: int, y: int) -> Array[int]:
	var tier := level_at(x, y)
	var top_of := func(vx: int, vy: int) -> int:
		return maxi(
			maxi(level_at(vx - 1, vy - 1), level_at(vx, vy - 1)),
			maxi(level_at(vx - 1, vy), level_at(vx, vy))
		) - tier
	return [
		top_of.call(x, y),
		top_of.call(x + 1, y),
		top_of.call(x + 1, y + 1),
		top_of.call(x, y + 1),
	]


## De combien la SURFACE d'une case est levee au-dessus de son palier : la
## moyenne de ses quatre coins. C'est ce qui donne a une rampe sa hauteur
## intermediaire.
func surface_lift(x: int, y: int) -> float:
	if level_at(x, y) == 0:
		return 0.0
	var lifts := corner_lifts(x, y)
	return float(lifts[0] + lifts[1] + lifts[2] + lifts[3]) / 4.0


## LA HAUTEUR D'UNE CASE A L'ECRAN, en pixels.
##
## UN LIFT PAR PALIER, SOL INCLUS — et c'est le piege que le web a paye.
##
## Le palier vaut 1 au niveau du sol, et la vue est alignee sur l'origine
## projetee au palier 0 : donc TOUTE case dessinee, le sol compris, est un lift
## au-dessus du treillis plat. Le code soustrayait 1 auparavant (« zero au
## niveau du sol »), et tout ce qui etait pose a la main — le lapin, les
## carottes, une explosion — atterrissait 18px SOUS le sol ou il se tenait.
## « Un petit lapin le cachait ; celui de l'ile, non. »
func lift_at(x: int, y: int) -> float:
	var tier := level_at(x, y)
	if tier == 0:
		return 0.0
	return (float(tier) + surface_lift(x, y)) * float(lift_px)


## Le point a l'ecran ou se pose une case, hauteur comprise.
func screen_of(x: int, y: int) -> Vector2:
	var flat := Iso.project(x, y)
	return Vector2(flat.x, flat.y - lift_at(x, y))


## LA CHUTE VERS LE SUD-EST — de combien de paliers cette case surplombe ce qui
## est devant elle.
##
## Le sud et l'est sont les deux cotes que la camera peut depasser, et un seul
## rectangle tient lieu des deux faces : on prend donc le PLUS BAS des deux
## voisins.
func drop_at(x: int, y: int) -> int:
	var tier := level_at(x, y)
	return tier - mini(level_at(x, y + 1), level_at(x + 1, y))


## UN TERRAIN, tire d'une graine.
##
## Simplifie pour l'instant : une masse de terre centrale avec un plateau
## dessus. Le web boucle jusqu'a vingt-quatre fois — il coupe un candidat, pose
## les reperes, mesure, et JETTE l'essai rate plutot que de le rafistoler. Cette
## boucle viendra avec le potager et le terrier, qui sont ce qu'elle mesure.
func generate(seed_value: int) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	var noise := FastNoiseLite.new()
	noise.seed = seed_value
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise.frequency = 0.09

	var mid := Vector2(float(width - 1) * 0.5, float(height - 1) * 0.5)
	var reach := float(mini(width, height)) * 0.5

	for y in range(height):
		for x in range(width):
			# La distance au centre, normalisee : c'est elle qui fait une ile
			# plutot qu'un damier. Le bruit ne sert qu'a en deranger le bord.
			var away := Vector2(float(x), float(y)).distance_to(mid) / reach
			var edge := away + noise.get_noise_2d(float(x), float(y)) * RAGGEDNESS
			var tier := 0
			if edge < LAND:
				tier = 1
				# Le plateau occupe le coeur, la ou le bord est le plus loin.
				if edge < LAND * (1.0 - RISE * 2.0):
					tier = 2
			level[y * width + x] = tier
