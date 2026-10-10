extends RefCounted
class_name BigIsland
## LES GRANDES ILES — une ile a elle des le niveau 7 (BIG_ISLANDS).
##
## Porte de src/lib/game/big-island.ts, A LA LETTRE : le serveur et le client
## taillent la cote depuis la seule graine, donc chaque tirage, chaque arrondi
## et chaque comparaison doivent tomber pareil des deux cotes. Les nombres
## viennent de tuning.json (la meme table que le serveur), jamais d'ici.
##
## L'ORDRE DES TIRAGES EST LE CONTRAT : `plan` tire toujours ses six nombres,
## dans cet ordre, quoi qu'il en fasse ensuite.


static func _table() -> Dictionary:
	return (load("res://assets/tuning.json") as JSON).data.BIG_ISLANDS


static func _lerp(range_pair: Array, t: float) -> float:
	var lo := float(range_pair[0])
	var hi := float(range_pair[1])
	return lo + (hi - lo) * t


## LE PLAN d'une graine de l'echelle, ou {} quand son niveau partage le sol.
## Cles : target, shape (String, vide = cote libre), parts (Array), ragged,
## land, aspect.
static func plan(seed_value: String, level: int) -> Dictionary:
	if level <= 0:
		return {}
	var row := FirstIsland.level_row(level)
	if not row.has("big") or row.big == null:
		return {}
	var big: Dictionary = _table()
	var rng := Rng.from_seed(seed_value + ":plan")
	var target := roundi(_lerp(row.big, rng.next()))
	var shaped := rng.next() < float(big.SHAPE_CHANCE)
	var pick := rng.next()
	var ragged := _lerp(big.RAGGED, rng.next())
	var land := _lerp(big.LAND, rng.next())
	var aspect := _lerp(big.ASPECT, rng.next())
	var shapes: Array = big.SILHOUETTES
	var shape_name := ""
	var parts: Array = []
	if shaped:
		var s: Dictionary = shapes[mini(shapes.size() - 1, floori(pick * shapes.size()))]
		shape_name = String(s.name)
		parts = s.parts
	return {
		"target": target, "shape": shape_name, "parts": parts,
		"ragged": ragged, "land": land, "aspect": aspect,
	}


## La boite sur laquelle on mesure d'abord la couverture d'une silhouette.
const PROBE_SIDE := 48


static func _clamp_side(n: int) -> int:
	var big: Dictionary = _table()
	return mini(int(big.MAX_SIDE), maxi(int(big.MIN_SIDE), n))


static func _land_cells(map: IslandMap) -> int:
	var n := 0
	for t in map.level:
		if t > 0:
			n += 1
	return n


## La part de la boite que couvre la silhouette : la terre qu'elle demande.
static func _silhouette_share(width: int, height: int, parts: Array) -> float:
	var probe := IslandMap.new(width, height)
	probe.silhouette = parts
	var field := probe._silhouette_field()
	var inside := 0
	var floor_value := float(_table().SHAPE_INSIDE)
	for v in field:
		if v > floor_value:
			inside += 1
	return float(inside) / float(field.size())


static func _cut_for(p: Dictionary, width: int, height: int) -> Dictionary:
	if not (p.parts as Array).is_empty():
		return {
			"width": width, "height": height,
			"land": _silhouette_share(width, height, p.parts),
			"ragged": float(_table().SHAPE_RAGGED),
			"silhouette": p.parts,
		}
	return {"width": width, "height": height, "land": p.land, "ragged": p.ragged, "silhouette": []}


## LA BOITE A LA TAILLE DU PLAN : on taille, on compte, et on retaille une boite
## grandie de la racine de ce qui manque (deux cases au moins) jusqu'a tenir
## MIN_FILL du compte, toucher MAX_SIDE ou epuiser MAX_TRIES. `sizeBigGround`.
static func size(seed_value: String, p: Dictionary, rise: float) -> Dictionary:
	var big: Dictionary = _table()
	var shaped := not (p.parts as Array).is_empty()
	var width: int
	var height: int
	if shaped:
		# Depuis la couverture de la silhouette elle-meme, mesuree sur une
		# boite d'essai : un serpent maigre demande plus grand qu'une etoile.
		var share := _silhouette_share(PROBE_SIDE, PROBE_SIDE, p.parts)
		width = _clamp_side(ceili(sqrt(float(p.target) / (share * 0.9))))
		height = width
	else:
		var area := float(p.target) / float(p.land)
		width = _clamp_side(roundi(sqrt(area * float(p.aspect))))
		height = _clamp_side(roundi(sqrt(area / float(p.aspect))))
	var cut := _cut_for(p, width, height)
	for tries in range(1, int(big.MAX_TRIES)):
		# UN SEUL PALIER SUFFIT A COMPTER : les plateaux viennent apres la cote,
		# de tirages suivants, et ne changent jamais quelles cases sont terre.
		var map := IslandMap.new(width, height)
		map.silhouette = cut.silhouette
		map.shape(seed_value, cut.land, rise, cut.ragged, 1)
		var cells := _land_cells(map)
		if float(cells) >= float(p.target) * float(big.MIN_FILL):
			break
		if width >= int(big.MAX_SIDE) and height >= int(big.MAX_SIDE):
			break
		var grow := sqrt(float(p.target) / float(maxi(1, cells)))
		width = _clamp_side(maxi(width + 2, ceili(width * grow)))
		height = width if shaped else _clamp_side(maxi(height + 2, ceili(height * grow)))
		cut = _cut_for(p, width, height)
	return cut
