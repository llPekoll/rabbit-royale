extends BurrowMap
class_name IslandMap
## L'ILE — 32x32, trois paliers, taillee dans une graine.
##
## Porte de src/game/island/generate.ts (`generateIsland`), avec les reglages
## que src/lib/game/terrainBoard.ts:71-78 impose vraiment :
##
##   width 32, height 32, tiers 3, land 0.62, rise 0.42, raggedness 0.32
##
## et NON les valeurs par defaut de generate.ts (34x24, land 0.46, rise 0.55,
## raggedness 0.4), qui ne servent a personne : tout passe par TERRAIN_OPTIONS.
##
## POURQUOI CE N'EST PAS LE `generate` DU TERRIER AVEC DE PLUS GRANDS NOMBRES.
##
## Le terrier se contente d'un FastNoiseLite et d'une distance au centre. Ca
## fait une motte de terre convaincante pour une ferme, et ca ne peut pas faire
## une ile : le relief de l'ile est ce que le SERVEUR calcule de son cote, et
## les deux doivent tomber sur la meme terre a partir de la seule graine. Il
## faut donc la meme recette exactement, jusqu'a l'ordre des tirages.
##
## LA RECETTE, et ce que chaque etape achete :
##
##   • BRUIT DE VALEUR x FALLOFF ELLIPTIQUE — le bruit fait la cote decoupee,
##     l'ellipse ramene la terre au milieu de la boite. Sans l'ellipse, l'ile
##     sort par les bords ; sans le bruit, c'est une flaque ronde.
##   • SEUIL PAR RANG (quantile), pas par valeur fixe. « Quelle part doit etre
##     de la terre » devient alors une vraie molette : un seuil fixe repond a
##     une question differente des que le bruit ou l'ellipse changent.
##   • DESPECKLE — supprime les langues d'une case et les lacs d'une case, que
##     le tileur entoure sinon d'un bord arrondi complet, et qui se lisent
##     comme un bug.
##   • LE PLUS GRAND BLOC SEUL — un archipel est une belle chose, mais pas par
##     accident : chaque ilot de deux cases coute un bord et une frange d'ecume
##     pour zero jeu.
##   • EROSION AVANT CHAQUE PALIER — c'est elle qui garantit la rangee de terre
##     basse sur laquelle la falaise se tient. UNE SEULE FOIS : eroder deux
##     fois (la prudence evidente) affame le troisieme palier.
##
## LA CONVENTION DE CASE NE CHANGE PAS : `screen_of` rend le coin HAUT, et son
## centre est a + Vector2(0, Iso.half_h()). Voir burrow_map.gd.

## LA GRILLE DE L'ILE. 32x32 avec LA MEME TUILE 44x24 que le terrier : elle est
## plus GRANDE, pas plus grosse (gridConfig.ts:27-40).
const COLS := 32
const ROWS := 32

## LES REGLAGES REELS, ceux de TERRAIN_OPTIONS.
## RENOMMES AVEC LE PREFIXE `ISLAND_`, et ce n'est pas de la cosmetique :
## BurrowMap porte deja LAND/RISE/RAGGEDNESS, avec d'AUTRES valeurs (0.72 /
## 0.2 / 0.12 — « un terrier est une ferme, pas un fjord »). Deux plateaux,
## deux reglages ; les confondre donnerait une ile avec la cote d'une ferme.
const TIERS_WANTED := 3
const ISLAND_LAND := 0.62
const ISLAND_RISE := 0.42
const ISLAND_RAGGEDNESS := 0.32

## JUSQU'OU PORTE L'ELLIPSE, en part de la boite.
##
## Sous 1 volontairement : la terre n'est taillee qu'a l'interieur, donc la
## grille garde une marge de mer ouverte. Cette marge n'est pas decorative — une
## case de rivage sur le bord n'a nulle part ou poser son ecume, et un plateau
## sur le bord perd la rangee de terre sous sa falaise.
const FALLOFF_REACH := 0.92

## LA TAILLE DU TREILLIS DU BRUIT, en cases.
##
## Cinq pour la cote. SEPT pour les paliers, et c'est plus grossier a dessein :
## une etagere veut de longues lignes droites pour porter sa falaise, et un
## bruit fin les hache en moignons.
const COAST_CELL := 5
const SHELF_CELL := 7

## UN PLATEAU VEUT UN CORPS, pas un rebord : en dessous, on le jette.
const MIN_PLATEAU_CELLS := 10

## La graine texte dont cette ile est sortie — ce qui voyage sur le fil.
var seed_text := ""


func _init(p_width: int = COLS, p_height: int = ROWS,
		p_origin: Vector2 = Vector2.ZERO) -> void:
	super(p_width, p_height, p_origin)


## TAILLE L'ILE. Deterministe : meme graine, meme terre, ici et sur le serveur.
func grow(seed_value: String) -> void:
	seed_text = seed_value
	var rng := Rng.from_seed(seed_value)
	var cells := width * height

	var falloff := _falloff_field()

	# LA COTE : un bruit assez grossier pour se lire comme des baies plutot que
	# comme de la neige, tire vers le milieu de la boite par l'ellipse.
	var coast := _noise_field(rng, COAST_CELL)
	var shore := PackedFloat32Array()
	shore.resize(cells)
	for i in range(cells):
		shore[i] = coast[i] * ISLAND_RAGGEDNESS + falloff[i] * (1.0 - ISLAND_RAGGEDNESS)

	var everywhere := _filled_mask()
	_clear_border(everywhere)
	var sea := _quantile_threshold(shore, everywhere, ISLAND_LAND)

	var land := PackedByteArray()
	land.resize(cells)
	for i in range(cells):
		land[i] = 1 if everywhere[i] != 0 and shore[i] > sea else 0
	land = _despeckle(land)
	_clear_border(land)
	land = _largest_component(land)

	level = PackedByteArray()
	level.resize(cells)
	for i in range(cells):
		level[i] = land[i]

	# LES PALIERS, empiles sur celui d'en dessous.
	var below := land
	var highest := 1
	for tier in range(2, TIERS_WANTED + 1):
		# ERODER D'ABORD : c'est ce qui garantit la rangee de terre basse sur
		# laquelle la falaise se tient, de tous les cotes de l'etagere. Une case
		# est exactement ce qu'occupe une face, donc une erosion est exactement
		# ce qu'il faut.
		var room := _erode(below)
		if not _any(room):
			break

		var field := _noise_field(rng, SHELF_CELL)
		var threshold := _quantile_threshold(field, room, ISLAND_RISE)
		var shelf := PackedByteArray()
		shelf.resize(cells)
		for i in range(cells):
			shelf[i] = 1 if room[i] != 0 and field[i] > threshold else 0
		shelf = _despeckle(shelf)
		# Le despeckle peut remplir au-dela de la place erodee : on le ramene.
		for i in range(cells):
			if room[i] == 0:
				shelf[i] = 0
		shelf = _largest_component(shelf)

		var count := 0
		for i in range(cells):
			count += shelf[i]
		if count < MIN_PLATEAU_CELLS:
			break

		for i in range(cells):
			if shelf[i] != 0:
				level[i] = tier
		highest = tier
		below = shelf

	tiers = highest


## BRUIT DE VALEUR dans [0, 1] : des valeurs tirees sur un treillis grossier,
## interpolees en douceur. Bon marche, reproductible, et bien assez pour une
## cote — un Perlin n'achèterait ici rien qu'un joueur puisse voir.
##
## L'ORDRE DES TIRAGES EST LE CONTRAT : le treillis entier est tire d'abord,
## ligne par ligne, avant toute interpolation. Tirer ailleurs decalerait la
## suite et donnerait une autre ile que le serveur a partir de la meme graine.
func _noise_field(rng: Rng, cell: int) -> PackedFloat32Array:
	var cols := ceili(float(width) / float(cell)) + 2
	var rows := ceili(float(height) / float(cell)) + 2
	var lattice := PackedFloat32Array()
	lattice.resize(cols * rows)
	for i in range(cols * rows):
		lattice[i] = rng.next()

	var out := PackedFloat32Array()
	out.resize(width * height)
	for y in range(height):
		var gy := float(y) / float(cell)
		var y0 := int(floor(gy))
		var ty := _smooth(gy - float(y0))
		for x in range(width):
			var gx := float(x) / float(cell)
			var x0 := int(floor(gx))
			var tx := _smooth(gx - float(x0))
			var a := lattice[y0 * cols + x0]
			var b := lattice[y0 * cols + x0 + 1]
			var c := lattice[(y0 + 1) * cols + x0]
			var d := lattice[(y0 + 1) * cols + x0 + 1]
			var top := a + (b - a) * tx
			var bottom := c + (d - c) * tx
			out[y * width + x] = top + (bottom - top) * ty
	return out


## Smoothstep, pour que le bruit interpole n'ait pas de plis sur le treillis.
static func _smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)


## 1 au centre de la boite, 0 au bord de l'ellipse inscrite.
func _falloff_field() -> PackedFloat32Array:
	var cx := float(width - 1) * 0.5
	var cy := float(height - 1) * 0.5
	var rx := float(width) * 0.5 * FALLOFF_REACH
	var ry := float(height) * 0.5 * FALLOFF_REACH
	var out := PackedFloat32Array()
	out.resize(width * height)
	for y in range(height):
		for x in range(width):
			var dx := (float(x) - cx) / rx
			var dy := (float(y) - cy) / ry
			out[y * width + x] = maxf(0.0, 1.0 - sqrt(dx * dx + dy * dy))
	return out


## LA VALEUR QUI LAISSE PASSER `share` DES CASES ELIGIBLES.
##
## Seuiller par RANG plutot que par une coupure fixe est ce qui fait de « quelle
## part doit etre de la terre » une molette honnete. Une coupure fixe repond a
## une question differente des que le bruit ou l'ellipse changent, et la regler
## revient a regler un nombre qui ne veut rien dire tout seul.
func _quantile_threshold(field: PackedFloat32Array, eligible: PackedByteArray,
		share: float) -> float:
	var values := PackedFloat32Array()
	for i in range(field.size()):
		if eligible[i] != 0:
			values.append(field[i])
	if values.is_empty():
		return INF
	values.sort()
	var rank := int(floor((1.0 - clampf(share, 0.0, 1.0)) * float(values.size())))
	return values[mini(rank, values.size() - 1)]


## LISSE UN MASQUE COMME UN AUTOMATE CELLULAIRE : on laisse tomber les cases qui
## ne tiennent que par une voisine, on comble les poches cernees sur trois
## cotes. Sans ca le bruit laisse des langues d'une case et des lacs d'une case,
## et les deux se lisent comme des bugs des que le tileur leur dessine un bord
## arrondi complet.
func _despeckle(mask: PackedByteArray, passes: int = 2) -> PackedByteArray:
	var cur := mask
	for p in range(passes):
		var next := PackedByteArray()
		next.resize(cur.size())
		for y in range(height):
			for x in range(width):
				var i := y * width + x
				var n := _ortho_count(cur, x, y)
				if cur[i] != 0:
					next[i] = 1 if n >= 2 else 0
				else:
					next[i] = 1 if n >= 3 else 0
		cur = next
	return cur


func _ortho_count(mask: PackedByteArray, x: int, y: int) -> int:
	var n := 0
	if _inside(x, y - 1) and mask[(y - 1) * width + x] != 0:
		n += 1
	if _inside(x + 1, y) and mask[y * width + x + 1] != 0:
		n += 1
	if _inside(x, y + 1) and mask[(y + 1) * width + x] != 0:
		n += 1
	if _inside(x - 1, y) and mask[y * width + x - 1] != 0:
		n += 1
	return n


## Retrecit un masque d'une case dans toutes les directions. Le bord compte
## comme de l'exterieur.
func _erode(mask: PackedByteArray) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(mask.size())
	for y in range(height):
		for x in range(width):
			if mask[y * width + x] == 0:
				continue
			if _inside(x - 1, y) and mask[y * width + x - 1] != 0 \
					and _inside(x + 1, y) and mask[y * width + x + 1] != 0 \
					and _inside(x, y - 1) and mask[(y - 1) * width + x] != 0 \
					and _inside(x, y + 1) and mask[(y + 1) * width + x] != 0:
				out[y * width + x] = 1
	return out


## NE GARDE QUE LE PLUS GROS BLOC D'UN SEUL TENANT.
##
## Un archipel est une belle chose, mais pas par accident : le bruit laisse
## volontiers des ilots de deux cases dans les coins, et chacun coute un bord
## arrondi complet et une frange d'ecume pour zero jeu.
func _largest_component(mask: PackedByteArray) -> PackedByteArray:
	var seen := PackedInt32Array()
	seen.resize(mask.size())
	seen.fill(-1)
	var sizes := PackedInt32Array()
	var stack := PackedInt32Array()

	for start in range(mask.size()):
		if mask[start] == 0 or seen[start] >= 0:
			continue
		var id := sizes.size()
		var size := 0
		stack.append(start)
		seen[start] = id
		while not stack.is_empty():
			var i := stack[stack.size() - 1]
			stack.remove_at(stack.size() - 1)
			size += 1
			var x := i % width
			var y := i / width
			for step in [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]:
				var nx: int = x + step.x
				var ny: int = y + step.y
				if not _inside(nx, ny):
					continue
				var ni := ny * width + nx
				if mask[ni] != 0 and seen[ni] < 0:
					seen[ni] = id
					stack.append(ni)
		sizes.append(size)

	if sizes.is_empty():
		return mask
	var best := 0
	for i in range(1, sizes.size()):
		if sizes[i] > sizes[best]:
			best = i
	var out := PackedByteArray()
	out.resize(mask.size())
	for i in range(mask.size()):
		out[i] = 1 if seen[i] == best else 0
	return out


## RIEN NE SE BATIT DANS CETTE MARGE, pour que chaque rivage ait la place de son
## ecume.
func _clear_border(mask: PackedByteArray) -> void:
	for x in range(width):
		mask[x] = 0
		mask[(height - 1) * width + x] = 0
	for y in range(height):
		mask[y * width] = 0
		mask[y * width + width - 1] = 0


func _filled_mask() -> PackedByteArray:
	var mask := PackedByteArray()
	mask.resize(width * height)
	mask.fill(1)
	return mask


func _inside(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < width and y < height


static func _any(mask: PackedByteArray) -> bool:
	for v in mask:
		if v != 0:
			return true
	return false
