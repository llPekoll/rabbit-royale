extends SceneTree
## LE TUTORIEL SE JOUE-T-IL JUSQU'AU COFFRE ? Une manche entiere, sans rendu.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_tutorial.gd
##
## ATTENDU — et chaque ligne garde un bug qui a coute :
##
##   1. retenue : la bombe enseignee, et elle LACHE une fois marquee
##   2. la marche : le lapin atteint la case a cote de la bombe
##   3. les douze beats : tap → numbers → counts → prove/mark → aim → marked
##                        → fetch → chest
##   4. les quatre langues ont les douze legendes
##
## POURQUOI CE FICHIER EXISTE. Le 2026-09-22, sur le web : « i can't progress
## past the second checkpoint ». La lecon du X etait appelee par le COMPTE de
## cases creusees, alors que la retenue refuse justement tout creusage tant que
## la bombe n'est pas marquee — le compte ne pouvait donc jamais monter, et le
## joueur restait devant « le chiffre compte les bombes » pour toujours. Un
## tutoriel INFINISSABLE, et rien dans le jeu ne le disait : l'ile s'affichait,
## le doigt repondait, les chiffres etaient justes.
##
## C'est exactement le genre de panne qu'un APK ne montre pas et qu'une heure de
## diagnostic a l'oeil ne trouve pas. On la mesure donc ici : on JOUE la manche,
## et on exige que la derniere legende soit celle du coffre.
##
## CE QU'IL NE COUVRE PAS : le dessin. Qu'un bandeau soit lisible, bien place et
## assez contraste ne se decide pas dans une sonde — ca se regarde sur
## l'appareil.

const MAX_STEPS := 40


func _initialize() -> void:
	var ok := true
	ok = _check_hold() and ok
	ok = _check_walk_and_beats() and ok
	ok = _check_words() and ok
	print("")
	print("TUTORIEL : ", "OK" if ok else "ECHEC")
	quit(0 if ok else 1)


func _board() -> IslandBoard:
	var map := IslandMap.new()
	map.grow(FirstIsland.seed_for("probe"))
	var board := IslandBoard.new(map)
	board.deal_tutorial()
	return board


## 1. LA RETENUE DESIGNE LA BOMBE ENSEIGNEE, ET ELLE LACHE UNE FOIS MARQUEE.
func _check_hold() -> bool:
	var board := _board()
	var bomb := TutorialMap.bomb()
	var held := board.teaching_hold()
	var ok := held == bomb
	print("1. retenue : tenue=%s bombe=%s  %s" % [held, bomb, "OK" if ok else "ECHEC"])

	# LA RETENUE REFUSE-T-ELLE VRAIMENT ? Le coffre ne doit pas etre joignable
	# d'un pas tant que la lecon n'est pas faite — c'est tout son objet.
	var spawn := TutorialMap.spawn()
	var leaks := 0
	for cell in board.content.keys():
		if board.state.get(cell) == IslandBoard.State.DUG:
			continue
		if board.may_step(spawn, cell) and board._steps_between(spawn, cell) == 1:
			leaks += 1
	print("   depuis l'apparition, cases neuves ouvertes au pas : ", leaks)

	board.flagged[bomb] = true
	var freed := board.teaching_hold().x < 0
	print("   marquee → l'ile lache : ", freed)
	return ok and freed


## 2. et 3. LA MARCHE ENTIERE, beat par beat.
##
## On joue betement : a chaque tour, le pas permis qui rapproche du but. Si la
## retenue se referme sur le joueur, cette boucle n'arrive nulle part et le
## test le dit — c'est precisement le symptome du 2026-09-22.
func _check_walk_and_beats() -> bool:
	var board := _board()
	var bomb := TutorialMap.bomb()
	var chest := TutorialMap.chest()
	var at := TutorialMap.spawn()

	var s := FirstRun.State.new()
	s.tiles = 0
	## Les beats VUS a l'ecran, dans l'ordre : le bandeau change quand le
	## dernier beat vrai change.
	var seen: Array[String] = []
	## Les beats qui ont TENU sans forcement etre affiches — un beat qu'un
	## suivant recouvre aussitot, comme `marked` sous `fetch`.
	var flashed: Array[String] = []

	## LA POSITION SE PASSE EN ARGUMENT, elle n'est pas capturee.
	##
	## Un lambda GDScript capture un `Vector2i` PAR VALEUR : la fermeture garde
	## la case du depart et ne voit jamais le lapin bouger. `s` est un objet,
	## donc capture par reference, et ses compteurs montaient bien — ce qui
	## masquait la panne : seul `beside`, calcule sur la position gelee, restait
	## faux, et `mark` ne parlait jamais. Mesure avant correction.
	var _note := func(here: Vector2i) -> void:
		s.beside = board._neighbours(here).has(bomb)
		var id := FirstRun.beat_id(s)
		if id != "" and (seen.is_empty() or seen[-1] != id):
			seen.append(id)
	_note.call(at)

	# VERS LA BOMBE. La retenue n'ouvre qu'une porte : la case indiquee qui
	# rapproche. On la suit.
	var steps := 0
	while not board._neighbours(at).has(bomb) and steps < MAX_STEPS:
		var best := Vector2i(-1, -1)
		var best_d := 1 << 30
		for n in board._neighbours(at):
			if not board.may_step(at, n):
				continue
			var d: int = board._steps_between(n, bomb)
			if d < best_d:
				best_d = d
				best = n
		if best.x < 0:
			break
		at = best
		if not board.is_dug(at):
			board.dig(at)
			s.tiles += 1
		steps += 1
		_note.call(at)

	var beside := board._neighbours(at).has(bomb)
	print("2. la marche : %d pas → a cote de la bombe : %s" % [steps, beside])
	if not beside:
		print("   ECHEC — la retenue s'est refermee : le joueur ne peut pas atteindre la lecon.")
		return false

	# LE X, EN DEUX TEMPS, ET LE TEMPS MORT COMPTE.
	#
	# Arrive a cote de la bombe, le mode n'est PAS encore arme : c'est la que
	# `mark` parle — « presse MARQUER UNE BOMBE ». Une sonde qui armait dans le
	# meme tour sautait ce beat et le croyait muet ; le joueur, lui, met une
	# seconde a trouver le bouton. On modelise donc ce temps mort, parce que
	# c'est lui qui porte la consigne.
	_note.call(at)
	s.armed = true
	_note.call(at)
	var right := board.flag(at, bomb)
	s.armed = false
	if right:
		s.flags += 1
	# `marked` ET `fetch` tiennent tous deux des que le X est pose, et « le
	# dernier qui tient gagne » donne `fetch`. C'EST VOULU : `marked` est un
	# eclair qui repond au geste, `fetch` est la consigne qui reste. On note
	# donc que `marked` a bien tenu, sans exiger qu'il reste a l'ecran.
	if FirstRun._holds("marked", s):
		flashed.append("marked")
	_note.call(at)
	print("3. le X : pose sur la bombe, juste=%s" % right)

	# VERS LE COFFRE, l'ile ayant lache.
	steps = 0
	while at != chest and steps < MAX_STEPS:
		var best := Vector2i(-1, -1)
		var best_d := 1 << 30
		for n in board._neighbours(at):
			if not board.may_step(at, n):
				continue
			var d: int = board._steps_between(n, chest)
			if d < best_d:
				best_d = d
				best = n
		if best.x < 0:
			break
		at = best
		if not board.is_dug(at):
			board.dig(at)
			s.tiles += 1
		steps += 1
		_note.call(at)

	var got := at == chest
	if got:
		s.chests = 1
		_note.call(at)
	print("   le coffre, %d pas plus loin : %s" % [steps, got])
	print("   beats affiches : ", ", ".join(seen))
	print("   beats couverts aussitot : ", ", ".join(flashed))

	# CE QUE LA MANCHE DOIT AVOIR DIT. Pas l'ordre exact — un joueur peut sauter
	# un beat, c'est prevu — mais ces quatre-la sont l'arc lui-meme : la
	# premiere tape, la consigne du bouton, la consigne de la case, et l'accuse
	# de reception du X.
	var must := ["tap", "mark", "aim", "marked"]
	var missing: Array[String] = []
	for id in must:
		if not seen.has(id) and not flashed.has(id):
			missing.append(id)
	var last_ok := not seen.is_empty() and seen[-1] == "chest"
	if not missing.is_empty():
		print("   ECHEC — beats jamais dits : ", ", ".join(missing))
	if not last_ok:
		print("   ECHEC — la manche ne finit pas sur le coffre.")
	return got and right and missing.is_empty() and last_ok


## 4. LES QUATRE LANGUES ONT LES DOUZE LEGENDES.
##
## Une legende manquante est muette a l'ecran, pas bruyante : elle ne se voit
## que dans la langue ou elle manque, et personne ne joue le tutoriel en
## portugais avant de livrer.
## `i18n.gd` est l'autoload `I18N` et n'a pas de `class_name` : on instancie
## donc le script, plutot que de nommer une classe qui n'existe pas. Un
## SceneTree --script ne monte pas les autoloads.
func _check_words() -> bool:
	var script: GDScript = load("res://scripts/i18n.gd")
	var i18n: Node = script.new()
	var ok := true
	for loc in script.LOCALES:
		var code: String = loc["code"]
		i18n.locale = code
		var missing: Array[String] = []
		for b in FirstRun.BEATS:
			var word: String = i18n.first_run(b["id"])
			if word.strip_edges() == "":
				missing.append(b["id"])
		if not missing.is_empty():
			ok = false
			print("4. %s : MANQUE %s" % [code, ", ".join(missing)])
	if ok:
		print("4. les quatre langues : douze legendes chacune")
	return ok
