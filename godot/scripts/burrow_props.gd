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


## Pose la maison et le potager DU TERRIER DU SERVEUR (burrow_layout.gd) :
## la maison sur `buildingCell`, le potager sur `field`. Ils etaient devines
## ici d'apres le relief ; ils sont maintenant ceux que le serveur connait —
## un raid se gagne en atteignant CE potager, et une cloture se pose sur SES
## aretes.
func build(layout: BurrowLayout) -> void:
	clear()
	if map == null or layout == null:
		return
	var seed_value := hash(layout.seed_text)
	if layout.building.x >= 0:
		_place_home(layout.building)
	_sow_field(seed_value, layout.field_cells())


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
func _place_home(cell: Vector2i) -> void:
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


## LE POTAGER, seme en losange dans chaque case du champ.
##
## La dispersion n'est pas un carre : les plants sont tires dans un LOSANGE,
## pour qu'aucun ne deborde sur la case voisine. `v` est borne par `1 - abs(u)`,
## ce qui dessine exactement la forme d'une tuile.
func _sow_field(seed_value: int, cells: Array[Vector2i]) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value * 17 + 3

	var frames := _carrot_frames()
	field = cells
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
