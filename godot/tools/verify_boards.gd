extends SceneTree
## LE BALAYAGE COMPLET : chaque case des deux plateaux, contre le sol peint.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_boards.gd
##
## ATTENDU — et chaque nombre a coute un bug :
##
##   1. RNG : OK
##   2. ILE    32x32 tiers=3 terre=557 PICK=557/557 sans bloc=0 en dessous=0
##   3. TERRIER 19x19 tiers=2 terre=148 PICK=148/148 sans bloc=0 en dessous=0
##   4. TUTO   32x32 tiers=1 terre=28  PICK=28/28   sans bloc=0 en dessous=0
##      couloir : 1 voisine au depart, coffre atteignable bombe=mur, meme sol
##
## CE QUE CHAQUE LIGNE GARDE :
##
##   1. LE RNG. mulberry32 et seedFrom sont portes BIT POUR BIT du web, et ces
##      quatre graines l'epinglent. GDScript compte en 64 bits la ou JS tronque
##      a 32 : sans le masquage explicite de rng.gd, la suite diverge vers le
##      troisieme tirage — assez tard pour que les premieres cases coincident et
##      qu'on croie le portage bon. Si cette ligne casse, l'ile du Seeker n'est
##      plus celle du serveur, et le desaccord ne se verra qu'au moment ou un
##      lapin marchera sur une falaise que le serveur croit plate.
##
##   2. et 3. LE TAP, MESURE CONTRE LE SOL PEINT. On construit le terrain pour
##      de vrai et on tape le point ou chaque bloc est POSE — jamais la formule
##      qu'on vient d'ecrire. C'est la lecon des trois sondes qui annoncaient
##      « ecart nul » sur un lapin visiblement decale de 24 px.
##
##      `sans bloc` et `en dessous` valent zero ou le plateau ment : une case
##      sans bloc est muette au doigt, une case qui repond « celle d'en dessous »
##      pose la bombe sur l'herbe quand on visait l'etagere.
##
##      LE TERRIER EST LA POUR LA NON-REGRESSION : il partage le terrain, le
##      picker et la camera avec l'ile. Ses 148/148 disent qu'une correction
##      faite pour l'ile ne lui a rien casse.
##
## ATTENTION : `_ready` ne se declenche pas a l'ajout dans un script de
## SceneTree — il attend une image. D'ou le compteur `_frames` : poser `map` et
## batir avant cette image donne un terrain d'UN bloc, et on croit a un bug de
## geometrie.
const IslandMapS := preload("res://scripts/island_map.gd")
const TerrainS := preload("res://scripts/burrow_terrain.gd")
const PickS := preload("res://scripts/burrow_pick.gd")
const RngS := preload("res://scripts/rng.gd")

var _frames := 0

func _init() -> void:
	pass

func _process(_d: float) -> bool:
	_frames += 1
	if _frames < 2:
		return false

	# 1. LE PIN DU RNG — si ces valeurs bougent, l'ile du Seeker n'est plus
	#    celle du serveur.
	var want := {
		"default": 2470140894, "island:7": 1864397135,
		"content:abc": 1999781656, "shape:first": 746721546,
	}
	var rng_ok := true
	for s in want:
		if RngS.seed_from(s) != want[s]:
			rng_ok = false
			print("RNG MISMATCH %s -> %d (attendu %d)" % [s, RngS.seed_from(s), want[s]])
	var first: float = RngS.from_seed("default").next()
	if absf(first - 0.146438641) > 1e-9:
		rng_ok = false
		print("RNG first=%.9f attendu 0.146438641" % first)
	print("1. RNG : %s" % ("OK" if rng_ok else "CASSE"))

	# 2. L'ILE
	var isle = IslandMapS.new()
	isle.grow("default")
	_sweep("2. ILE   ", isle)

	# 3. LE TERRIER — non-regression
	var burrow = BurrowMap.new()
	burrow.generate(1)
	_sweep("3. TERRIER", burrow)

	# 4. L'ILE DU TUTORIEL — le couloir dessine a la main.
	var tuto = IslandMapS.new()
	tuto.grow(FirstIsland.seed_for("verify"))
	_sweep("4. TUTO  ", tuto)
	_tutorial_invariants(tuto)
	return true


## CE QUE LE COULOIR DOIT RESTER, quoi qu'il arrive au generateur.
##
## Ces quatre faits sont la lecon elle-meme, pas de la decoration :
##
##   • 28 CASES AU PALIER 1. Plat expres — une falaise en travers d'un couloir
##     large d'une case est un mur.
##   • UNE SEULE VOISINE AU DEPART. C'est la mer qui enseigne : il n'y a pas de
##     mauvais tournant parce qu'il n'y a pas de tournant.
##   • LE COFFRE RESTE ATTEIGNABLE QUAND LA BOMBE EST UN MUR. Une bombe marquee
##     refuse le pas (un doigt qui glisse ne doit pas couter une manche), donc
##     un couloir passant PAR `B` se murerait au moment ou la lecon est apprise.
##     Le web l'a mesure avant nous ; on le re-mesure plutot que de le croire.
##   • LE MEME SOL POUR TOUS. La graine nomme le joueur, le sol non.
func _tutorial_invariants(m) -> void:
	var spawn: Vector2i = TutorialMap.spawn()
	var bomb: Vector2i = TutorialMap.bomb()
	var chest: Vector2i = TutorialMap.chest()

	var neighbours := 0
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0:
				continue
			if m.is_land(spawn.x + dx, spawn.y + dy):
				neighbours += 1

	# Parcours en 8 voisins, la bombe traitee comme un mur.
	var seen := {spawn: true}
	var queue: Array[Vector2i] = [spawn]
	while not queue.is_empty():
		var c: Vector2i = queue.pop_back()
		for dy in [-1, 0, 1]:
			for dx in [-1, 0, 1]:
				if dx == 0 and dy == 0:
					continue
				var n := c + Vector2i(dx, dy)
				if seen.has(n) or n == bomb or not m.is_land(n.x, n.y):
					continue
				seen[n] = true
				queue.append(n)

	var alice = IslandMapS.new()
	alice.grow(FirstIsland.seed_for("alice"))
	var bob = IslandMapS.new()
	bob.grow(FirstIsland.seed_for("bob"))

	print("   couloir : %d voisines au depart (1), coffre atteignable bombe=mur : %s, meme sol pour tous : %s"
		% [neighbours, str(seen.has(chest)), str(alice.level == bob.level)])

func _sweep(label: String, m) -> void:
	var terrain = TerrainS.new()
	get_root().add_child(terrain)
	terrain.map = m
	terrain.build()
	var land := 0
	var hits := 0
	var below := 0
	var noblock := 0
	for row in range(m.height):
		for col in range(m.width):
			if not m.is_land(col, row):
				continue
			land += 1
			var cell := Vector2i(col, row)
			if not terrain.has_block(cell):
				noblock += 1
				continue
			var block: Node2D = terrain._block_at[cell]
			var got = PickS.at(m, block.position + Vector2(0, Iso.half_h()))
			if got == cell:
				hits += 1
			elif got.x >= 0 and m.level_at(got.x, got.y) < m.level_at(col, row):
				below += 1
	print("%s grille=%dx%d tiers=%d terre=%d  PICK=%d/%d  sans bloc=%d  en dessous=%d"
		% [label, m.width, m.height, m.tiers, land, hits, land, noblock, below])
	terrain.queue_free()
