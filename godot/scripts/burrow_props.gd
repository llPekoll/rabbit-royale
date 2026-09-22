extends Node2D
class_name BurrowProps
## CE QUI SE TIENT SUR LE SOL — la maison et le potager.
##
## Porte de src/game/burrow/buildings.ts et entities/CarrotCrop.ts.
##
## FRERES DU TERRAIN, PAS ENFANTS. Chaque chose posee ici se trie sur la meme
## regle que les tuiles — `Iso.depth` — et c'est ce qui permet a un pillard
## debout sur une case proche de passer DEVANT la maison d'une case lointaine.
## Si les decors vivaient dans une couche au-dessus du terrain, il faudrait
## arbitrer a la main a chaque ajout, et on se tromperait.
##
## ANCREES AU PIED, jamais a la boite. Un batiment mesure 128x192 mais son
## dessin ne touche le sol qu'a 173 pixels du haut : l'ancrer au bas de sa
## boite le ferait floter. Le pied est mesure sur les bornes alpha de l'art,
## pas devine.

## L'ECHELLE DES DECORS. La deco est coupee pour des tuiles de 64 ; celles du
## terrier font 44x24. Un peu plus gros que le 0.4 de l'ile, « parce que ce
## plateau est une ferme et non une nature sauvage : moins de choses s'y
## tiennent, donc chacune peut se permettre de se lire ».
const DECO_SCALE := 0.44

## L'ECHELLE DES PLANTES, plus petite que la deco : une carotte n'est pas un
## batiment.
const PLANT_SCALE := 0.34

## LA MAISON, par palier de terrier. Le pied est mesure sur l'alpha de chaque
## image, d'ou trois valeurs voisines mais distinctes.
const HOMES := [
	{"art": preload("res://assets/buildings/house-1.webp"), "h": 192.0, "foot": 173.0},
	{"art": preload("res://assets/buildings/house-2.webp"), "h": 192.0, "foot": 178.0},
	{"art": preload("res://assets/buildings/house-3.webp"), "h": 192.0, "foot": 172.0},
	{"art": preload("res://assets/buildings/castle.webp"), "h": 256.0, "foot": 249.0},
]

const CARROTS := preload("res://assets/deco/carrote.png")
## La planche de carottes : douze etapes de croissance sur une grille 4x3, en
## cellules de 31x50 avec deux pixels de marge.
const CARROT_CELL := Vector2(31, 50)
const CARROT_PAD := 2
const CARROT_COLS := 4

## Combien de plants par case de potager. Le web le fait croitre avec le
## niveau ; trois suffisent pour que le champ se lise.
const PLANTS_PER_CELL := 3

## LA FETE DU PASSAGE DE NIVEAU (BurrowTerrain.ts `celebrateLevel`) : la
## maison saute, un eclair doux s'ouvre derriere elle, dix bouffees de
## poussiere partent de son pied. Pas de camera, pas de son — le son est
## celui de l'achat (chrome.gd, `match`).
const POP_FROM := 0.8
const POP_SECONDS := 0.55
const FLASH_COLOR := Color("#ffe9a8")
const FLASH_RADIUS := 60.0
const FLASH_ALPHA := 0.7
const FLASH_LIFT := 30.0
const FLASH_SECONDS := 0.5
const DUST_COLOR := Color("#c9b48a")
const DUST_COUNT := 10
const DUST_SPREAD := 90.0

var map: BurrowMap
var _props: Array[Node2D] = []
## La maison, gardee pour changer d'image avec le niveau et pour sa fete.
var home: Sprite2D = null
var _level := 1

## LES CASES DU POTAGER, gardees apres le semis.
##
## Les clotures bordent CE champ-la et pas un autre. Les laisser le redeviner
## depuis la graine, c'est refaire le meme choix une seconde fois et parier que
## les deux tirages ne divergeront jamais — une case d'ecart, et la cloture
## borde un champ qui n'est pas celui qu'on voit.
var field: Array[Vector2i] = []


## Pose la maison et le potager d'apres le relief.
func build(seed_value: int) -> void:
	clear()
	if map == null:
		return
	# L'ORDRE COMPTE : la maison choisit sa case, puis le champ s'installe a
	# cote d'elle. Le web fait l'inverse et contraint la maison a se tenir a
	# une ou deux cases du potager — meme resultat, et dans ce sens il n'y a
	# rien a contraindre.
	var home := _place_home(seed_value)
	if home.x >= 0:
		_sow_field(seed_value, home)


func clear() -> void:
	# Les noeuds et leur liste meurent ensemble — voir BurrowTerrain.clear.
	for prop in _props:
		prop.queue_free()
	_props.clear()
	field.clear()
	home = null


## LA MAISON, sur la case qui la merite le plus.
##
## Le web SCORE les cases plutot que d'en chercher une exacte : deux cases de
## terre de chaque cote, pres du potager mais pas dessus, et un peu en retrait
## de la mer. Un score plutot qu'une condition, parce qu'un terrain genere ne
## garantit jamais qu'une case parfaite existe.
func _place_home(seed_value: int) -> Vector2i:
	var cell := _home_cell(seed_value)
	if cell.x < 0:
		return cell

	home = Sprite2D.new()
	home.centered = false
	home.scale = Vector2(DECO_SCALE, DECO_SCALE)
	_dress_home()

	# Posee au MILIEU de sa case (+0.5), pas sur son coin.
	var at := map.screen_of(cell.x, cell.y)
	home.position = at + Vector2(0, Iso.half_h())
	# Un cran devant le sol de sa propre case.
	home.z_index = Iso.depth(cell.x, cell.y) + map.level_at(cell.x, cell.y) + 1
	add_child(home)
	_props.append(home)
	return cell


## LA MAISON DU NIVEAU : l'image de son palier, ancree a son pied. Le
## chateau passe au niveau 4 et au-dela (buildings.ts).
func set_level(level: int) -> void:
	_level = maxi(level, 1)
	_dress_home()


## ANCREE AU PIED : le dessin touche le sol a `foot` pixels du haut, pas au
## bas de sa boite. Et centree horizontalement.
func _dress_home() -> void:
	if home == null:
		return
	var art: Dictionary = HOMES[clampi(_level, 1, HOMES.size()) - 1]
	home.texture = art["art"]
	home.offset = Vector2(-float(art["art"].get_width()) * 0.5, -float(art["foot"]))


## LA FETE. L'origine de la maison est son pied : le saut pivote sur le sol,
## comme le web qui l'ancre au pied.
func celebrate() -> void:
	if home == null:
		return
	var pop := create_tween()
	home.scale = Vector2.ONE * DECO_SCALE * POP_FROM
	pop.tween_property(home, "scale", Vector2.ONE * DECO_SCALE, POP_SECONDS) \
		.set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)

	# L'ECLAIR, derriere la maison, un peu au-dessus du pied.
	var flash := _blob(FLASH_RADIUS, Color(FLASH_COLOR, FLASH_ALPHA))
	flash.position = home.position + Vector2(0, -FLASH_LIFT)
	flash.z_index = home.z_index - 1
	flash.scale = Vector2.ONE * 0.2
	var grow := create_tween().set_parallel(true)
	grow.tween_property(flash, "scale", Vector2.ONE * 1.6, FLASH_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	grow.tween_property(flash, "modulate:a", 0.0, FLASH_SECONDS) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	grow.chain().tween_callback(flash.queue_free)

	# LA POUSSIERE, devant : dix bouffees en eventail, qui sautent et
	# retombent en s'eteignant.
	for i in DUST_COUNT:
		var puff := _blob(3.0 + randf() * 3.0, Color(DUST_COLOR, 0.9))
		var foot := home.position + Vector2(0, -2)
		puff.position = foot
		puff.z_index = home.z_index + 1
		var dx := (float(i) / (DUST_COUNT - 1) - 0.5) * DUST_SPREAD + (randf() - 0.5) * 10.0
		var t := create_tween().set_parallel(true)
		t.tween_property(puff, "position:x", foot.x + dx, 0.6) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		t.tween_property(puff, "position:y", foot.y - 18.0 - randf() * 14.0, 0.25) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.tween_property(puff, "position:y", foot.y + 4.0, 0.35).set_delay(0.25) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		t.tween_property(puff, "modulate:a", 0.0, 0.25).set_delay(0.35)
		t.chain().tween_callback(puff.queue_free)


## Un disque plein, pour l'eclair et la poussiere.
func _blob(radius: float, color: Color) -> Node2D:
	var blob := Node2D.new()
	blob.draw.connect(func() -> void: blob.draw_circle(Vector2.ZERO, radius, color))
	add_child(blob)
	return blob


## La case ou poser la maison : la plus interieure possible, au bord du champ.
func _home_cell(seed_value: int) -> Vector2i:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value * 31 + 7

	var best := Vector2i(-1, -1)
	var best_score := -1e9
	for row in range(map.height):
		for col in range(map.width):
			if map.level_at(col, row) == 0:
				continue
			# DEUX CASES DE TERRE DE CHAQUE COTE : une maison au bord de l'eau
			# aurait un pignon dans le vide.
			var inland := true
			for dy in range(-2, 3):
				for dx in range(-2, 3):
					if not map.is_land(col + dx, row + dy):
						inland = false
			if not inland:
				continue
			# On prefere le palier haut — c'est la que se tient une ferme — et
			# une position un peu au sud, ou elle ne masque rien.
			var score := float(map.level_at(col, row)) * 8.0 + float(row) * 0.5
			score += rng.randf() * 2.0
			if score > best_score:
				best_score = score
				best = Vector2i(col, row)
	return best


## LE POTAGER, seme en losange dans chaque case du champ.
##
## La dispersion n'est pas un carre : les plants sont tires dans un LOSANGE,
## pour qu'aucun ne deborde sur la case voisine. `v` est borne par `1 - abs(u)`,
## ce qui dessine exactement la forme d'une tuile.
func _sow_field(seed_value: int, home: Vector2i) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value * 17 + 3

	var frames := _carrot_frames()
	field = _field_cells(home)
	for cell in field:
		var centre := map.screen_of(cell.x, cell.y)
		for i in range(PLANTS_PER_CELL):
			var u := rng.randf() * 2.0 - 1.0
			var v := (rng.randf() * 2.0 - 1.0) * (1.0 - absf(u))

			var plant := Sprite2D.new()
			plant.texture = frames[rng.randi() % frames.size()]
			plant.centered = false
			plant.scale = Vector2(PLANT_SCALE, PLANT_SCALE)
			# Ancree BAS-CENTRE : la plante touche le sol par sa racine.
			plant.offset = Vector2(-CARROT_CELL.x * 0.5, -CARROT_CELL.y)
			plant.position = centre + Vector2(
				(u + v) * Iso.half_w() * 0.6,
				(v - u) * Iso.half_h() * 0.6
			)
			# Juste devant le sol de sa case, derriere ce qui marche dessus.
			plant.z_index = Iso.depth(cell.x, cell.y) + map.level_at(cell.x, cell.y) + 1
			add_child(plant)
			_props.append(plant)


## LES CASES DU POTAGER : une parcelle accolee a la maison.
##
## Un champ est une PARCELLE, pas des carottes eparpillees — c'est ce qui le
## fait lire comme cultive. Elle part d'a cote de la maison et s'etend vers le
## sud-est, du cote ou la camera regarde, en s'arretant des que le palier
## change : un potager ne monte pas une falaise.
func _field_cells(home: Vector2i) -> Array[Vector2i]:
	var tier := map.level_at(home.x, home.y)
	var out: Array[Vector2i] = []

	# LA PARCELLE CHERCHE SA PLACE AUTOUR DE LA MAISON, dans les quatre
	# directions, et garde la premiere ou elle tient entierement.
	#
	# Une seule direction ne suffisait pas : la maison se pose sur le plateau,
	# et deux cases a l'est le palier avait deja change — le champ tombait
	# alors sur des cases refusees et aucune carotte ne poussait.
	# Le tableau est TYPE : un litteral nu donne des elements sans type, et
	# GDScript refuse alors d'inferer ce qu'une addition avec eux produit.
	var steps: Array[Vector2i] = [
		Vector2i(2, 0), Vector2i(-4, 0), Vector2i(0, 2), Vector2i(0, -4)
	]
	for step in steps:
		var start: Vector2i = home + step
		var patch: Array[Vector2i] = []
		for dy in range(0, 3):
			for dx in range(0, 3):
				var c: Vector2i = start + Vector2i(dx, dy)
				# Le meme palier : un potager ne monte pas une falaise, et des
				# carottes a cheval sur deux hauteurs ne lisent pas comme un
				# champ.
				if map.level_at(c.x, c.y) == tier:
					patch.append(c)
		if patch.size() > out.size():
			out = patch
		# Neuf cases, c'est la parcelle entiere : inutile de chercher mieux.
		if out.size() == 9:
			break
	return out


## Les douze etapes de croissance, decoupees de la planche.
func _carrot_frames() -> Array[Texture2D]:
	var out: Array[Texture2D] = []
	for i in range(12):
		var frame := AtlasTexture.new()
		frame.atlas = CARROTS
		frame.region = Rect2(
			CARROT_PAD + (i % CARROT_COLS) * (CARROT_CELL.x + CARROT_PAD),
			CARROT_PAD + (i / CARROT_COLS) * (CARROT_CELL.y + CARROT_PAD),
			CARROT_CELL.x, CARROT_CELL.y
		)
		out.append(frame)
	return out
