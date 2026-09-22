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
	return true

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
