extends RefCounted
class_name IslandBoard
## CE QUI EST ENTERRE, ET CE QUI EST DEJA DECOUVERT.
##
## Porte de src/lib/game/island.ts — la partie qui se calcule, pas celle qui se
## tire au sort.
##
## ARITHMETIQUE PURE, aucun noeud, comme `BurrowMap` : l'etat d'un plateau doit
## pouvoir se calculer sans moteur de rendu, parce que le serveur en a besoin
## lui aussi.
##
## ⚠ CE FICHIER NE SERT QUE LE TUTORIEL POUR L'INSTANT, et c'est une limite de
## fond, pas un manque de temps.
##
## Sur une ile ORDINAIRE, les bombes viennent d'un `contentSeed` PRIVE, connu du
## seul serveur (src/lib/game/island.ts) : il ne traverse jamais le fil, et
## `publicView` ne laisse filtrer que ce qui est deja creuse. Un client qui les
## deviderait divergerait — ou tricherait. Les contenus d'une vraie ile
## viendront donc du reseau, case par case.
##
## LE TUTORIEL EST L'EXCEPTION, et il l'est par construction : `tutorialLayout`
## ne tire RIEN au sort. Il ecrit ce que la carte dessinee dit — une bombe en
## `B`, un coffre en `C`, l'indice laisse VIDE, des carottes partout ailleurs.
## « la phrase de la lecon est un fait sur une image de ce depot plutot qu'un
## espoir sur du terrain genere ». Donc il se calcule ici, a l'identique, sans
## serveur.

enum Content {
	EMPTY,
	CARROT,
	BOMB,
	CHEST,
	## La carotte doree : cinq fois la valeur, et placee plus loin du depart
	## (`RISK_GRADIENT.GOLDEN`) — le butin qui paie la marche vers le bord.
	GOLDEN,
}

## L'etat d'une case, en plus de son contenu.
enum State {
	BURIED,
	## Creusee : le voile est tombe, le contenu est connu.
	DUG,
	## Le chiffre est connu mais la case n'est pas creusee — le cadeau que fait
	## la cascade. Elle reste creusable.
	HINTED,
}

var map: BurrowMap

## Par case : son contenu, son etat, et le nombre de bombes qui la touchent.
var content: Dictionary = {}
var state: Dictionary = {}
var adjacent: Dictionary = {}

## LES CASES PORTANT UN X ROUGE — une bombe que le joueur a PROUVEE.
##
## A part, et pas un `State`, pour la meme raison que le web en fait un booleen
## sur la tuile : un X se pose sur une case ENTERREE et l'y laisse. Ce n'est pas
## une quatrieme facon d'etre ouvert, c'est une annotation par-dessus.
var flagged: Dictionary = {}

## LE DECOR POSE SUR UNE CASE — un buisson du pack, par sa variante (1 a 4).
##
## Une case decoree reste une case du plateau, et ON PEUT MARCHER DESSUS : les
## buissons du pack sont « assez hauts pour cacher le joueur, trop petits pour
## valoir une case perdue invisiblement — donc ils ne bloquent pas »
## (island/tileset.ts). C'est la fenetre de profondeur qui garde le lapin
## visible derriere, pas un mur.
var decor: Dictionary = {}

## LE PALIER DE CHAQUE COFFRE — bronze, argent, or, couronne.
##
## PUBLIC, contrairement a ce que le coffre contient : `publicView` laisse
## filtrer `{tile, tier}` des coffres non creuses, et c'est voulu — un coffre
## couronne DOIT s'annoncer de loin, c'est ce qui fait marcher vers lui.
var chest_tier: Dictionary = {}

## LE SOL D'UNE ILE GENEREE — ou l'on marche, ce qui se tient dessus. Nul sur
## le tutoriel, dont le couloir n'a ni decor ni falaise.
var ground: IslandGround

## LA GRAINE PUBLIQUE, celle qui nomme l'ile. Elle tire aussi ce que chaque
## coffre contient (`<graine>:<case>`, server/index.ts) : un coffre donne
## toujours la meme chose, a qui que ce soit qui l'ouvre.
var seed_text := ""

## L'apparition : la ou la manche commence.
var spawn := Vector2i(-1, -1)

## LE PALIER DE L'ILE (`ISLAND_TIERS`) : ses densites, et ce qu'un X juste
## rend d'energie. Vide sur le tutoriel.
var tier: Dictionary = {}

## LA RETENUE DU TUTORIEL (`teaching_hold`) ne vaut QUE pour la premiere ile.
## Sur une ile ordinaire, une bombe visible est du danger, pas une lecon — la
## laisser bloquer les pas murerait le plateau des la premiere bombe au bord.
var teaching := false

const TUNING := preload("res://assets/tuning.json")

## LES BUISSONS DU TUTORIEL, deux, a l'ecart du couloir.
##
## Paul, 2026-09-23 : « le chest, 1 ou 2 buissons ». La carte est nettoyee de
## tout arbre — un seul pin coupait l'ile en deux — mais un buisson sur une case
## que la marche n'emprunte pas habille l'ile sans rien lui cacher.
const TUTORIAL_DECOR := {
	Vector2i(19, 20): 1,
	Vector2i(14, 19): 3,
}


func _init(p_map: BurrowMap) -> void:
	map = p_map


## LES CASES JOUABLES. De la terre, et rien d'autre pour l'instant.
##
## Le web y retire aussi celles qui portent un arbre ou un rocher
## (`farmableTiles`) ; ce portage n'a pas encore de decor sur l'ile, et le
## couloir du tutoriel est nettoye de toute facon — « pas un arbre », parce
## qu'un seul pin coupait l'ile en deux.
func playable() -> Array[Vector2i]:
	if ground != null:
		return ground.farmable_cells()
	var out: Array[Vector2i] = []
	for row in range(map.height):
		for col in range(map.width):
			if map.is_land(col, row):
				out.append(Vector2i(col, row))
	return out


## POSE LES CONTENUS DU TUTORIEL, lus sur sa carte.
##
## Rien n'est distribue ici. C'est tout l'interet de l'ile dessinee a la main.
func deal_tutorial() -> void:
	teaching = true
	content.clear()
	state.clear()
	for cell in playable():
		content[cell] = Content.CARROT
		state[cell] = State.BURIED

	content[TutorialMap.bomb()] = Content.BOMB
	content[TutorialMap.chest()] = Content.CHEST
	# Le premier palier, comme `tutorialLayout` (`CHEST_TIER_WEIGHTS[0]`).
	chest_tier.clear()
	chest_tier[TutorialMap.chest()] = String(_tuning().CHEST_TIER_WEIGHTS[0].kind)
	decor.clear()
	for cell in TUTORIAL_DECOR:
		if content.has(cell):
			decor[cell] = TUTORIAL_DECOR[cell]
	# L'INDICE RESTE VIDE : c'est la case dont le chiffre porte la premiere
	# lecon, et une carotte qui jaillirait en la creusant couvrirait le seul
	# glyphe dont la legende parle.
	content[TutorialMap.clue()] = Content.EMPTY

	recompute_adjacent()
	# ON ATTERRIT TOUJOURS QUELQUE PART OU L'ON PEUT LIRE : l'apparition et ses
	# voisines sont ouvertes d'emblee, puis les zeros ouvrent autour d'eux comme
	# le ferait un premier clic au demineur.
	var spawn := TutorialMap.spawn()
	dig(spawn)
	for n in _neighbours(spawn):
		dig(n)
	prove_taught_bombs()


## ACHEVE LA PREUVE DE LA PREMIERE ILE : ouvrir la derniere case qui brouille
## son temoin.
##
## LE TUTORIEL ENONCE UNE DEDUCTION A VOIX HAUTE — « il ne reste qu'une case
## fermee, c'est donc la bombe ». Que cette preuve TOMBE ne depend pas de la
## carte dessinee : ca depend de la cascade, qui tourne apres. Mesure ici meme,
## avant ce code : l'indice portait bien un « 1 » mais pointait vers DEUX
## voisines fermees — la phrase a l'ecran etait donc fausse, et la lecon
## enseignait a deviner.
##
## Le web a mesure la meme chose sur soixante plateaux (« the witness was
## usually one cell short ») et corrige de la meme facon : on ouvre le retardaire
## APRES la cascade. C'est le meme cadeau que la cascade fait deja — un chiffre
## sur une case non creusee — et ca ne revele rien que le joueur ne puisse
## deduire, puisque la case ouverte n'est jamais la bombe.
##
## LA BOUCLE VA JUSQU'A UN POINT FIXE : ouvrir des cases pour prouver une bombe
## change ce qui est ouvert pour la suivante, et peut DEFAIRE une preuve deja
## acquise en devoilant une voisine fraiche. Bornee — chaque tour ouvre au moins
## une case ou s'arrete.
func prove_taught_bombs() -> void:
	for round in range(40):
		var unproven: Array[Vector2i] = []
		for cell in playable():
			if content.get(cell) != Content.BOMB:
				continue
			# Une bombe que le joueur peut deja rencontrer : elle touche du sol
			# ouvert. Les autres sont du danger ordinaire, pas une lecon.
			var visible := false
			for n in _neighbours(cell):
				if _open(n):
					visible = true
			if visible and not _proven(cell):
				unproven.append(cell)
		if unproven.is_empty():
			return
		var changed := false
		for bomb in unproven:
			changed = _prove_one(bomb) or changed
		if not changed:
			return


## Cette case est-elle deja lisible — creusee ou indicee ?
func _open(cell: Vector2i) -> bool:
	var st = state.get(cell)
	return st == State.DUG or st == State.HINTED


## LA BOMBE EST-ELLE PROUVEE ? Il faut un temoin ouvert dont TOUTES les autres
## voisines sont ouvertes : son chiffre ne peut alors designer qu'elle.
func _proven(bomb: Vector2i) -> bool:
	for w in _neighbours(bomb):
		if not _open(w):
			continue
		var all_open := true
		for n in _neighbours(w):
			if n != bomb and not _open(n):
				all_open = false
		if all_open:
			return true
	return false


## OUVRE LE MOINS DE CASES POSSIBLE pour qu'un temoin designe cette bombe.
##
## On choisit le temoin le MOINS CHER — celui a qui il manque le moins de
## voisines — et jamais un qui pointerait aussi vers une AUTRE bombe : sa preuve
## serait ambigue, et le joueur aurait raison de ne pas la croire.
func _prove_one(bomb: Vector2i) -> bool:
	var best_witness := Vector2i(-1, -1)
	var best_missing: Array[Vector2i] = []
	var best_cost := 1 << 30

	for w in _neighbours(bomb):
		if content.get(w) == Content.BOMB:
			continue
		var missing: Array[Vector2i] = []
		var touches_other_bomb := false
		for n in _neighbours(w):
			if n == bomb or _open(n):
				continue
			if content.get(n) == Content.BOMB:
				touches_other_bomb = true
			missing.append(n)
		if touches_other_bomb:
			continue
		var cost: int = missing.size() + (0 if _open(w) else 1)
		if cost < best_cost:
			best_cost = cost
			best_witness = w
			best_missing = missing

	if best_witness.x < 0:
		return false

	var changed := false
	if not _open(best_witness):
		state[best_witness] = State.HINTED
		changed = true
	for cell in best_missing:
		state[cell] = State.HINTED
		changed = true
	return changed


## COMBIEN DE BOMBES TOUCHENT CHAQUE CASE. Huit voisines, comme au demineur.
func recompute_adjacent() -> void:
	adjacent.clear()
	for cell in playable():
		var n := 0
		for other in _neighbours(cell):
			if content.get(other, Content.EMPTY) == Content.BOMB:
				n += 1
		adjacent[cell] = n


## CREUSE UNE CASE, et ouvre autour d'elle si elle ne touche aucune bombe.
##
## LA CASCADE EST CE QUI REND LE DEMINEUR JOUABLE : sans elle, ouvrir un champ
## vide demanderait une tape par case. Un zero ouvre ses voisines, et une
## voisine a zero continue — c'est la meme regle appliquee en chaine.
##
## LES CASES OUVERTES PAR LA CASCADE SONT `HINTED`, PAS `DUG`, et la distinction
## porte tout le jeu : elles montrent leur chiffre mais restent a creuser. C'est
## le cadeau du demineur — on sait ce qu'il y a autour sans avoir paye le pas.
## Rend ce que la cascade a ouvert, pour la vague.
func dig(cell: Vector2i) -> Array[Vector2i]:
	if not content.has(cell):
		return []
	if state.get(cell) == State.DUG:
		return []
	state[cell] = State.DUG
	return cascade_hints([cell])


## LA CASCADE DU DEMINEUR, sans la pelle (island.ts `cascadeHints`).
##
## Depuis chaque case OUVERTE et NULLE de `from`, les voisines recoivent leur
## chiffre, et chaque zero ainsi trouve continue la marche jusqu'au premier
## vrai nombre. Rien n'est creuse : ce qui est enterre reste a qui marchera
## dessus. Une bombe n'est jamais indicee, par construction — elle n'est
## jamais voisine d'un zero.
##
## LA MARCHE PASSE PAR LES ZEROS DEJA CREUSES, et c'est ce qui la rend
## entiere : la zone est la region connexe des zeros, et un zero creuse il y a
## une heure est un pont autant qu'un zero indice a l'instant. S'arreter aux
## cases creusees ouvrait une zone a moitie — « quand tu clean une zone faut
## nettoyer toute la zone » (Paul).
##
## `around` BORNE la marche a `CASCADE_RADIUS` cases (Chebyshev) : seule la
## NAISSANCE de l'ile s'en sert. Un plateau ne doit pas naitre avec le quart
## de ses chiffres deja ecrits. Rend ce qui a ete ouvert, dans l'ordre.
func cascade_hints(from: Array, around: Vector2i = Vector2i(-1, -1)) -> Array[Vector2i]:
	var opened: Array[Vector2i] = []
	var radius: int = int(_tuning().ISLAND.CASCADE_RADIUS)
	var seen := {}
	var queue: Array[Vector2i] = []
	for c in from:
		if content.has(c) and _open(c) and _is_zero(c) and not seen.has(c):
			seen[c] = true
			queue.append(c)
	var head := 0
	while head < queue.size():
		var here := queue[head]
		head += 1
		for n in _neighbours(here):
			if around.x >= 0 and maxi(absi(n.x - around.x), absi(n.y - around.y)) > radius:
				continue
			if not _open(n):
				state[n] = State.HINTED
				opened.append(n)
			if _is_zero(n) and not seen.has(n):
				seen[n] = true
				queue.append(n)
	return opened


func _is_zero(c: Vector2i) -> bool:
	return content.get(c) != Content.BOMB and adjacent.get(c, 0) == 0


## L'ANCIENNE CASCADE, gardee pour le seul appelant qui en depend : un X faux
## ouvre la case payee et ce que son zero touche.
func _cascade(from: Vector2i) -> void:
	cascade_hints([from])


## POSE OU REFUSE UN X ROUGE. Rend `true` si la bombe etait la.
##
## Porte de `flagTile` (src/lib/game/run.ts), sans l'energie ni les carottes :
## ce portage n'a pas encore de bourse, et le tutoriel n'en depend pas — la
## lecon est le GESTE, et le prix se branchera avec le reste de l'economie.
##
## LES REFUS SONT CEUX DU WEB : on ne marque que depuis une case VOISINE, et
## jamais une case dont on sait deja quelque chose (creusee, indiquee, deja
## marquee, ou le coffre). Marquer ce qu'on connait n'est pas une deduction.
func flag(from: Vector2i, at: Vector2i) -> bool:
	if not content.has(at):
		return false
	if not _neighbours(from).has(at):
		return false
	var st = state.get(at)
	if st == State.DUG or st == State.HINTED or flagged.has(at):
		return false
	if content.get(at) == Content.CHEST:
		return false

	if content.get(at) == Content.BOMB:
		flagged[at] = true
		return true

	# FAUX. La case est sure, et l'avoir payee achete le savoir : son chiffre
	# s'ecrit comme la cascade l'aurait fait. RIEN N'EST CREUSE — c'est un
	# indice, pas un coup de pelle.
	state[at] = State.HINTED
	if adjacent.get(at, 0) == 0:
		_cascade(at)
	return false


func is_flagged(cell: Vector2i) -> bool:
	return flagged.has(cell)


## Les deux cases se touchent-elles, sur les huit voisines ?
func is_beside(a: Vector2i, b: Vector2i) -> bool:
	return a != b and absi(a.x - b.x) <= 1 and absi(a.y - b.y) <= 1


## LA BOMBE QUE LE TUTORIEL RETIENT, ou (-1,-1) quand l'ile a lache prise.
##
## Porte de `teachingHold`. La bombe enseignee est celle dont le joueur peut
## DEJA lire le bord : une bombe dont aucune voisine n'est ouverte n'enseigne
## rien, puisque rien a l'ecran ne la designe.
##
## MARQUEE, L'ILE LACHE — c'est la seule sortie, et c'est ce qui fait de la
## lecon un passage oblige plutot qu'un decor.
func teaching_hold() -> Vector2i:
	if not teaching:
		return Vector2i(-1, -1)
	for cell in content.keys():
		if content[cell] != Content.BOMB:
			continue
		var visible := false
		for n in _neighbours(cell):
			var st = state.get(n)
			if st == State.DUG or st == State.HINTED:
				visible = true
				break
		if not visible:
			continue
		return Vector2i(-1, -1) if flagged.has(cell) else cell
	return Vector2i(-1, -1)


## UN PAS EST-IL PERMIS PENDANT LA LECON ?
##
## Porte du bloc `teachingHold` de `resolveMove`, avec ses deux cicatrices.
##
## 1. `DUG`, PAS `DUG OU HINTED`. Une case indiquee montre son chiffre mais est
##    encore en terre : y marcher la CREUSE, la cascade ouvre un anneau de plus,
##    qui devient marchable a son tour. La retenue fuyait un anneau a la fois,
##    et le joueur arrivait au coffre sans avoir rien marque — vu en partie le
##    2026-09-20 (cases 497, 498, 467, puis le coffre en 436).
##
## 2. UNE PORTE, UNE SEULE : une case indiquee qui RAPPROCHE de la bombe. Tenir
##    au seul sol creuse etait un blocage — aucune voisine de la bombe n'est
##    creusee sur un plateau neuf, et marquer exige d'etre a cote. « Touche la
##    bombe » etait trop strict sur le couloir dessine, ou la marche passe par
##    des cases indiquees a deux et trois pas : le joueur etait arrete court
##    devant la case qu'on lui disait de marquer.
func may_step(from: Vector2i, to: Vector2i) -> bool:
	if not content.has(to):
		return false
	# UNE ILE GENEREE MARCHE SUR SON RELIEF : une falaise de deux paliers se
	# voit et ne se monte pas, un arbre ne se traverse pas (`canWalk`).
	if ground != null and not ground.can_step(from, to):
		return false
	# UN MOUTON BLOQUE SA CASE, mais il s'en va : la case reste au plateau
	# (on y enterre), seul le pas est refuse tant qu'il y broute (`canWalk`).
	if ground != null and ground.occupant_at(to).get("kind", "") == "sheep":
		return false
	# Un X rouge est un mur : un doigt qui glisse ne doit pas couter une manche.
	if flagged.has(to) and state.get(to) != State.DUG:
		return false
	var held := teaching_hold()
	if held.x < 0:
		return true
	if state.get(to) == State.DUG:
		return true
	if state.get(to) != State.HINTED:
		return false
	return _steps_between(to, held) < _steps_between(from, held)


## LA DISTANCE EN PAS ENTRE DEUX CASES, a travers la terre seulement.
##
## En largeur. Rend un grand nombre quand la cible est injoignable, pour que la
## comparaison de `may_step` refuse simplement le pas.
func _steps_between(from: Vector2i, to: Vector2i) -> int:
	if from == to:
		return 0
	var seen := {from: true}
	var frontier: Array[Vector2i] = [from]
	var depth := 0
	while not frontier.is_empty():
		depth += 1
		var next: Array[Vector2i] = []
		for cell in frontier:
			for n in _neighbours(cell):
				if seen.has(n) or not content.has(n):
					continue
				if n == to:
					return depth
				seen[n] = true
				next.append(n)
		frontier = next
	return 1 << 30


func is_dug(cell: Vector2i) -> bool:
	return state.get(cell) == State.DUG


## Le chiffre se lit-il sur cette case ?
func shows_number(cell: Vector2i) -> bool:
	var s = state.get(cell)
	return (s == State.DUG or s == State.HINTED) \
		and content.get(cell) != Content.BOMB \
		and adjacent.get(cell, 0) > 0


func _neighbours(cell: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0:
				continue
			var n := cell + Vector2i(dx, dy)
			# LES CASES DU PLATEAU, grimpables ou non (`boardNeighbors`) :
			# l'etagere au-dessus d'une falaise compte dans le chiffre, le pin
			# non — rien n'est enterre sous lui. Avant la donne, la terre.
			var on_board := content.has(n) if not content.is_empty() \
				else map.is_land(n.x, n.y)
			if on_board:
				out.append(n)
	return out


# ================================================================ l'ile generee
#
# Porte de `generateIsland` (src/lib/game/island.ts), la branche qui n'est PAS
# le tutoriel. ⚠ Voir l'en-tete : sur une ile en ligne, les contenus viennent du
# serveur et de son `contentSeed` prive. Ce qui suit sert l'ile HORS LIGNE —
# le bac a sable, les bancs, les sondes — avec une graine de contenu qu'on
# choisit soi-meme. Meme recette, meme ordre de tirages : a graines egales,
# c'est l'ile du serveur, case pour case (tools/verify_deal.gd).


static func _tuning() -> Dictionary:
	return (TUNING as JSON).data


## tuning.ts `tierFor` : le dernier palier dont le seuil est atteint.
static func tier_for(lifetime: float) -> Dictionary:
	var tiers: Array = _tuning().ISLAND_TIERS
	var tier: Dictionary = tiers[0]
	for t in tiers:
		if lifetime >= float(t.minLifetime):
			tier = t
	return tier


## rng.ts `pickWeighted`.
static func pick_weighted(rng: Rng, table: Array) -> Dictionary:
	var total := 0.0
	for e in table:
		total += float(e.weight)
	var r := rng.next() * total
	for e in table:
		r -= float(e.weight)
		if r <= 0.0:
			return e
	return table[table.size() - 1]


## rng.ts `randInt`, bornes comprises.
static func rand_int(rng: Rng, lo: int, hi: int) -> int:
	return lo + int(floor(rng.next() * (hi - lo + 1)))


## L'index d'une case, tel que le fil le porte (`toIndex`).
func index_of(c: Vector2i) -> int:
	return c.y * map.width + c.x


## DONNE UNE ILE GENEREE : bombes, carottes dorees, coffres au bord, carottes.
##
## `content_seed` est la graine PRIVEE du serveur. Hors ligne, on la choisit ;
## vide, elle retombe sur la graine publique — le comportement « devinable »
## que le web garde pour ses tests, et exactement ce qu'il faut a un banc.
func deal_generated(p_ground: IslandGround, p_seed: String, content_seed: String = "",
		lifetime: float = 0.0) -> void:
	ground = p_ground
	seed_text = p_seed
	teaching = false
	content.clear()
	state.clear()
	flagged.clear()
	chest_tier.clear()
	decor.clear()
	var tune := _tuning()
	var rng := Rng.from_seed("content:%s" % (content_seed if content_seed != "" else p_seed))
	tier = tier_for(lifetime)

	# LE PLATEAU : les cases ou le serveur enterre, ligne d'abord — l'ordre des
	# cles EST l'ordre des tirages.
	var tiles := ground.farmable_cells()
	for c in tiles:
		content[c] = Content.EMPTY
		state[c] = State.BURIED

	# LES BUISSONS SE DESSINENT, et on marche dessus : le decor que le plateau
	# sait deja montrer (variante 1 a 4 pour `TileView`).
	for p in ground.placements:
		var at := Vector2i(p.x, p.y)
		if p.kind == "bush" and content.has(at):
			decor[at] = int(p.variant) + 1

	spawn = ground.spawn()
	var safe := {spawn: true}
	for n in ground.steps_from(spawn):
		safe[n] = true

	var total := tiles.size()
	var eligible: Array[Vector2i] = []
	for c in tiles:
		if not safe.has(c):
			eligible.append(c)

	var dist := _steps_from(spawn)
	var furthest := 1
	for d in dist.values():
		furthest = maxi(furthest, d)

	var bomb_count := int(floor(total * float(tier.bombDensity)))
	var carrots := int(floor(total * float(tier.carrotDensity)))
	var golden := int(floor(carrots * float(tier.goldenShare)))
	var max_touching := int(tune.ISLAND.BOMB_MAX_TOUCHING)

	# LES BOMBES D'ABORD, ponderees par la marche depuis le depart — plus
	# denses au loin — et ETALEES : une candidate qui touche deja trop de
	# bombes passe son tour (un amas eclaire moins de cases que les memes
	# bombes a part). Differee, pas perdue : l'ile n'est jamais servie courte.
	var bombs := 0
	var deferred: Array[Vector2i] = []
	for c in _weighted_order(rng, eligible, dist, furthest, tune.RISK_GRADIENT.BOMB):
		if bombs >= bomb_count:
			break
		var touching := 0
		for n in _neighbours(c):
			if content[n] == Content.BOMB:
				touching += 1
		if touching > max_touching:
			deferred.append(c)
			continue
		content[c] = Content.BOMB
		bombs += 1
	for c in deferred:
		if bombs >= bomb_count:
			break
		content[c] = Content.BOMB
		bombs += 1

	var free := func() -> Array[Vector2i]:
		var out: Array[Vector2i] = []
		for c in eligible:
			if content[c] == Content.EMPTY:
				out.append(c)
		return out

	var gold := _weighted_order(rng, free.call(), dist, furthest, tune.RISK_GRADIENT.GOLDEN)
	for k in range(mini(golden, gold.size())):
		content[gold[k]] = Content.GOLDEN

	# LES COFFRES AVANT LES CAROTTES, et sur le pourtour : ils sont la ligne
	# d'arrivee de l'ile, donc leur place EST la forme du niveau. Chacun tire
	# son palier sur le rng des CONTENUS — le palier se voit, mais lequel a eu
	# la couronne ne doit pas se deduire de la graine publique.
	var chest_count := int(round(total * float(tune.ISLAND.CHEST_DENSITY)))
	for c in _rim_tiles(free.call(), dist, furthest, chest_count):
		content[c] = Content.CHEST
		chest_tier[c] = String(pick_weighted(rng, tune.CHEST_TIER_WEIGHTS).kind)

	var pool: Array = free.call()
	IslandGround._shuffle(rng, pool)
	for k in range(mini(carrots - golden, pool.size())):
		content[pool[k]] = Content.CARROT

	recompute_adjacent()
	# ON ATTERRIT QUELQUE PART OU L'ON PEUT LIRE : le depart et ses voisines
	# sont ouverts, puis leurs zeros s'ouvrent — BORNES au rayon, comme un
	# lapin debout sur le depart le verrait.
	for c in safe:
		state[c] = State.DUG
	cascade_hints(safe.keys(), spawn)


## island.ts `stepsFrom` : la distance en PAS, pas en cases — une case de
## l'autre cote d'une falaise est loin, si proche que son index paraisse.
func _steps_from(from: Vector2i) -> Dictionary:
	var dist := {from: 0}
	var queue: Array[Vector2i] = [from]
	var head := 0
	while head < queue.size():
		var here := queue[head]
		head += 1
		for n in ground.steps_from(here):
			if not content.has(n) or dist.has(n):
				continue
			dist[n] = dist[here] + 1
			queue.append(n)
	return dist


## island.ts `weightedOrder` : un echantillon pondere SANS remise par horloges
## exponentielles — chaque case sonne a -ln(u)/w, la plus tot d'abord. UN
## tirage par case, dans l'ordre d'entree.
##
## Le tri de JS est STABLE et `sort_custom` ne l'est pas : le rang d'entree
## departage, sans quoi deux horloges egales pourraient s'inverser.
func _weighted_order(rng: Rng, items: Array, dist: Dictionary, furthest: int,
		g: Dictionary) -> Array[Vector2i]:
	var near := float(g.NEAR)
	var far := float(g.FAR)
	var rows: Array = []
	for k in range(items.size()):
		var c: Vector2i = items[k]
		var depth := float(dist.get(c, furthest)) / float(furthest)
		var w := near + (far - near) * depth
		rows.append([-log(1.0 - rng.next()) / maxf(w, 1e-6), k, c])
	rows.sort_custom(func(a: Array, b: Array) -> bool:
		return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	var out: Array[Vector2i] = []
	for r in rows:
		out.append(r[2])
	return out


## island.ts `rimTiles` : `count` cases du BORD, aussi loin les unes des
## autres que la cote le permet — un parcours du point le plus lointain.
##
## Seule la bande exterieure concourt (`CHEST_MIN_DEPTH` de la marche la plus
## longue) ; on part de la case la plus loin du depart, puis on prend chaque
## fois la candidate dont le coffre le plus proche est le plus loin. Chaque
## choix est le tronçon de cote le plus vide qui reste : les coffres font le
## tour de l'ile sans qu'on dise ou sont les points cardinaux.
func _rim_tiles(candidates: Array[Vector2i], dist: Dictionary, furthest: int,
		count: int) -> Array[Vector2i]:
	var picked: Array[Vector2i] = []
	if count <= 0:
		return picked
	var floor_d := furthest * float(_tuning().ISLAND.CHEST_MIN_DEPTH)
	var pool: Array[Vector2i] = []
	for c in candidates:
		if dist.has(c) and dist[c] >= floor_d:
			pool.append(c)
	if pool.is_empty():
		return picked

	var head: Vector2i = pool[0]
	for c in pool:
		if dist[c] > dist[head]:
			head = c
	picked.append(head)
	var near: Array[float] = []
	for c in pool:
		near.append(Vector2(c - head).length())

	while picked.size() < count:
		var best_at := -1
		var best_gap := -1.0
		for k in range(pool.size()):
			if near[k] > best_gap:
				best_gap = near[k]
				best_at = k
		# La cote n'a plus de place : l'ile est servie courte plutot que de
		# coller deux coffres pour un compte que personne ne voit.
		if best_at < 0 or best_gap <= 0.0:
			break
		var chosen := pool[best_at]
		picked.append(chosen)
		for k in range(pool.size()):
			near[k] = minf(near[k], Vector2(pool[k] - chosen).length())
	return picked


## island.ts `chestProgress` : combien de coffres dorment encore. Une ile sans
## coffre compte comme finie.
func chest_progress() -> Dictionary:
	var total := 0
	var left := 0
	for c in content:
		if content[c] != Content.CHEST:
			continue
		total += 1
		if state.get(c) != State.DUG:
			left += 1
	var fraction := 1.0 if total == 0 else 1.0 - float(left) / float(total)
	return {"left": left, "total": total, "fraction": fraction}


## CE QUE CONTIENT UN COFFRE — tire de `<graine>:<case>` (server/index.ts), donc
## le meme pour quiconque l'ouvre. `{kind, amount, tier, announced, nft}`.
func chest_loot(c: Vector2i) -> Dictionary:
	var tune := _tuning()
	var tier: String = chest_tier.get(c, "")
	var table: Array = tune.CHEST_LOOT_BY_TIER.get(tier, tune.CHEST_LOOT) if tier != "" \
		else tune.CHEST_LOOT
	var rng := Rng.from_seed("%s:%d" % [seed_text, index_of(c)])
	var e := pick_weighted(rng, table)
	var amount := rand_int(rng, int(e.get("min", 1)), int(e.get("max", 1)))
	# LA COURONNE PEUT CACHER UNE PIECE GENESIS, tiree APRES le butin sur le
	# meme rng (run.ts) : l'ordre des tirages fait partie du coffre.
	var nft := tier == "crown" and rng.next() < float(tune.CHEST_NFT_ODDS.inCrown)
	return {"kind": String(e.kind), "amount": amount, "tier": tier,
		"announced": tier != "", "nft": nft}


# ================================================================ l'ile en ligne
#
# Ce que le serveur montre d'une ile (`publicView` / `snapshot`) : les cases
# creusees avec leur contenu, les chiffres que la cascade a ecrits, les coffres
# qui dorment (case et palier), les X justes. RIEN d'autre — le reste est
# enterre, et ce plateau ne le devine pas : une case non creusee a le contenu
# EMPTY, ce qui veut dire « inconnu » ici, et aucun chiffre n'est recalcule.

const CONTENT_OF := {
	"empty": Content.EMPTY, "carrot": Content.CARROT, "golden": Content.GOLDEN,
	"bomb": Content.BOMB, "chest": Content.CHEST,
}


## La case d'un index du fil (`toIndex` : ligne d'abord).
func cell_of(index: int) -> Vector2i:
	return Vector2i(index % map.width, index / map.width)


## POSE L'INSTANTANE DU SERVEUR sur le plateau de `p_ground`.
func apply_public(p_ground: IslandGround, snap: Dictionary) -> void:
	ground = p_ground
	seed_text = String(snap.get("seed", ""))
	teaching = false
	content.clear()
	state.clear()
	adjacent.clear()
	flagged.clear()
	chest_tier.clear()
	decor.clear()
	for c in ground.farmable_cells():
		content[c] = Content.EMPTY
		state[c] = State.BURIED
	for p in ground.placements:
		var at := Vector2i(p.x, p.y)
		if p.kind == "bush" and content.has(at):
			decor[at] = int(p.variant) + 1
	for ch in snap.get("chests", []):
		var c := cell_of(int(ch.get("tile", -1)))
		content[c] = Content.CHEST
		chest_tier[c] = String(ch.get("tier", "bronze"))
	for r in snap.get("revealed", []):
		reveal_remote(int(r.get("tile", -1)), String(r.get("content", "empty")), int(r.get("adjacent", 0)))
	for h in snap.get("hinted", []):
		hint_remote(int(h.get("tile", -1)), int(h.get("adjacent", 0)))
	for f in snap.get("flagged", []):
		flagged[cell_of(int(f))] = true


## POSE L'INSTANTANE D'UNE PREMIERE ILE (`first:<id>`) : le sol dessine du
## tutoriel, sans contenus — c'est le serveur qui les tient, et qui tient la
## lecon (`taughtBomb`, `learn-first`). Le decor dessine est garde : il est au
## SOL, pas au tirage.
func apply_public_first(snap: Dictionary) -> void:
	ground = null
	seed_text = String(snap.get("seed", ""))
	teaching = false
	content.clear()
	state.clear()
	adjacent.clear()
	flagged.clear()
	chest_tier.clear()
	decor.clear()
	for c in playable():
		content[c] = Content.EMPTY
		state[c] = State.BURIED
	for cell in TUTORIAL_DECOR:
		if content.has(cell):
			decor[cell] = TUTORIAL_DECOR[cell]
	for ch in snap.get("chests", []):
		var c := cell_of(int(ch.get("tile", -1)))
		content[c] = Content.CHEST
		chest_tier[c] = String(ch.get("tier", "bronze"))
	for r in snap.get("revealed", []):
		reveal_remote(int(r.get("tile", -1)), String(r.get("content", "empty")), int(r.get("adjacent", 0)))
	for h in snap.get("hinted", []):
		hint_remote(int(h.get("tile", -1)), int(h.get("adjacent", 0)))
	for f in snap.get("flagged", []):
		flagged[cell_of(int(f))] = true


## `tile_revealed` : la case est creusee, son contenu et son chiffre sont dits.
func reveal_remote(index: int, what: String, count: int) -> Vector2i:
	var c := cell_of(index)
	content[c] = CONTENT_OF.get(what, Content.EMPTY)
	state[c] = State.DUG
	adjacent[c] = count
	flagged.erase(c)
	return c


## `hints_revealed` : un chiffre sur une case encore enterree.
func hint_remote(index: int, count: int) -> Vector2i:
	var c := cell_of(index)
	adjacent[c] = count
	if state.get(c) != State.DUG:
		state[c] = State.HINTED
	return c
