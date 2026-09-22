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


func _init(p_map: BurrowMap) -> void:
	map = p_map


## LES CASES JOUABLES. De la terre, et rien d'autre pour l'instant.
##
## Le web y retire aussi celles qui portent un arbre ou un rocher
## (`farmableTiles`) ; ce portage n'a pas encore de decor sur l'ile, et le
## couloir du tutoriel est nettoye de toute facon — « pas un arbre », parce
## qu'un seul pin coupait l'ile en deux.
func playable() -> Array[Vector2i]:
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
	content.clear()
	state.clear()
	for cell in playable():
		content[cell] = Content.CARROT
		state[cell] = State.BURIED

	content[TutorialMap.bomb()] = Content.BOMB
	content[TutorialMap.chest()] = Content.CHEST
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
func dig(cell: Vector2i) -> void:
	if not content.has(cell):
		return
	if state.get(cell) == State.DUG:
		return
	state[cell] = State.DUG
	if adjacent.get(cell, 0) == 0 and content.get(cell) != Content.BOMB:
		_cascade(cell)


## Le pourtour d'un zero s'ouvre, et ses zeros continuent.
##
## En largeur plutot qu'en recursion : un couloir de 28 cases ne poserait pas de
## probleme, mais une vraie ile de 557 cases creuserait une pile profonde.
func _cascade(from: Vector2i) -> void:
	var queue: Array[Vector2i] = [from]
	var seen := {from: true}
	while not queue.is_empty():
		var cell: Vector2i = queue.pop_front()
		for n in _neighbours(cell):
			if seen.has(n) or not content.has(n):
				continue
			seen[n] = true
			if content[n] == Content.BOMB:
				continue
			# Deja creusee a la main : on ne la retrograde pas.
			if state.get(n) == State.DUG:
				continue
			state[n] = State.HINTED
			if adjacent.get(n, 0) == 0:
				queue.append(n)


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
			if map.is_land(n.x, n.y):
				out.append(n)
	return out
