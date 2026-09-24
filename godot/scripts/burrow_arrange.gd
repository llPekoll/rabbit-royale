extends RefCounted
class_name BurrowArrange
## AMENAGER SON TERRIER — deplacer ses arbres, sa maison, son potager.
##
## Le brouillon d'un amenagement (generate.ts `BurrowEdits`), tenu ici
## pendant que le joueur deplace les choses, et juge a chaque geste par LA
## MEME REGLE que le serveur (BurrowLayout.edited, verifiee contre
## `editBurrow` par tools/verify_burrow_layout.gd). C'est ce qui permet
## d'allumer les cases ou une chose peut aller : une case allumee est une
## case que le serveur acceptera.
##
## TOUCHER, PUIS TOUCHER. Pas de glisser : sur un telephone, le doigt qui
## glisse promene deja le plateau, et un meme geste ne peut pas vouloir dire
## les deux. Une tape PREND (la chose se souleve, ses cases possibles
## s'allument), une seconde tape POSE — ou relache, sur la chose elle-meme.
## La souris fait pareil, avec en plus le survol qui montre ou ca tomberait.
##
## Rien ne part au serveur avant « valider » : le brouillon est local, et un
## « annuler » rend le terrier tel qu'il etait.

enum Held { NONE, THING, HOUSE, FIELD }

var seed_text := ""
## Le terrier pousse de la graine, sans amenagement : ce que `moves` nomme.
var base: BurrowLayout
## Ce qui est enregistre, et le brouillon par-dessus.
var saved: Dictionary = {}
var draft: Dictionary = {}
## Le terrier du brouillon, tel qu'on le dessine.
var layout: BurrowLayout

var held := Held.NONE
## THING : le rang de la chose dans `base.placements`. PAS dans
## `layout.placements` : le fouillis qu'une chose couvre s'efface du terrier
## amenage (BurrowLayout.gives_way), et les rangs s'y decalent — on l'y
## retrouve par son `id` (`placed`). FIELD : la case du potager qu'on a prise,
## qui suit le doigt. HOUSE : inutilise.
var held_index := -1
var held_cell := Vector2i(-1, -1)
## Les cases ou une tape pose ce qu'on tient.
var targets: Dictionary = {}
## LES CASES ENCORE A JUGER. Remesurer le terrier pour chaque case coute
## ~1,4 ms sur un poste de dev, et un arbre en a 150 : 200 ms d'un bloc a la
## prise, bien plus sur un telephone. Les cases s'allument donc d'apres le
## tri bon marche (`_cheap_refusal`), et la regle entiere passe ensuite
## quelques millisecondes par image (`settle`) pour eteindre celles qu'elle
## refuse — rarement plus d'une poignee. Une tape n'attend pas : `drop`
## juge sa case lui-meme.
var _pending: Array[Vector2i] = []
## `id` -> rang dans `base.placements`.
var _rank_of: Dictionary = {}


func _init(seed_value: String, edits: Dictionary) -> void:
	seed_text = seed_value
	base = BurrowLayout.of(seed_value)
	for i in range(base.placements.size()):
		_rank_of[String(base.placements[i].get("id", ""))] = i
	saved = edits.duplicate(true)
	draft = edits.duplicate(true)
	layout = BurrowLayout.of(seed_text, draft)


## Le brouillon differe-t-il de ce qui est enregistre ?
func dirty() -> bool:
	return JSON.stringify(_clean(draft)) != JSON.stringify(_clean(saved))


## Le decalage du potager du brouillon par rapport a celui enregistre — les
## planches le suivent a l'affichage, comme le serveur les deplacera.
func field_shift() -> Vector2i:
	return _shift_of(draft) - _shift_of(saved)


## LA CHOSE QUE LA TAPE PREND, ou NONE. La maison et les arbres sont hauts :
## une tape sur leur feuillage tombe sur une case DERRIERE eux. On regarde
## donc la case tapee, puis les trois devant elle (plus bas a l'ecran).
func grab(cell: Vector2i) -> bool:
	var hit := find(cell)
	if hit.is_empty():
		return false
	_hold(hit[0], hit[1], hit[2])
	return true


## Ce qu'une tape sur `cell` prendrait — `[Held, rang, case]` —, sans le
## prendre. Vide s'il n'y a rien.
func find(cell: Vector2i) -> Array:
	var home := BurrowLayout.house_cells(layout.building)
	for c in [cell, cell + Vector2i(1, 0), cell + Vector2i(0, 1), cell + Vector2i(1, 1)]:
		# LA MAISON TIENT QUATRE CASES : prise par n'importe laquelle, elle
		# suit le doigt par CETTE case-la (`held_cell`), comme le potager.
		if home.has(c):
			return [Held.HOUSE, -1, c]
		var i := _thing_at(c)
		if i >= 0:
			return [Held.THING, i, c]
	if layout.kind(BurrowLayout.index(cell)) == BurrowLayout.Cell.FIELD:
		return [Held.FIELD, -1, cell]
	return []


func release() -> void:
	held = Held.NONE
	held_index = -1
	held_cell = Vector2i(-1, -1)
	targets = {}
	_pending.clear()


## JUGER des cases en attente, pendant au plus `budget_usec`. Vrai si une
## case vient de s'eteindre (les losanges sont a repeindre).
func settle(budget_usec: int) -> bool:
	var until := Time.get_ticks_usec() + budget_usec
	var changed := false
	while not _pending.is_empty() and Time.get_ticks_usec() < until:
		var c: Vector2i = _pending.pop_back()
		if not targets.has(c):
			continue
		var next := _candidate(c)
		if BurrowLayout.has_edits(next) and BurrowLayout.edited(base, next) is String:
			targets.erase(c)
			changed = true
	return changed


func settling() -> bool:
	return not _pending.is_empty()


## POSER sur `cell`. Rend "" si c'est fait, sinon la raison du refus (les
## noms du serveur, plus "occupied" pour une case deja prise).
func drop(cell: Vector2i) -> String:
	if not targets.has(cell):
		return _why_not(cell)
	var next := _candidate(cell)
	var out: Variant = BurrowLayout.edited(base, next) if BurrowLayout.has_edits(next) else base
	if out is String:
		targets.erase(cell)
		return out
	draft = next
	layout = BurrowLayout.of(seed_text, draft)
	release()
	return ""


## Tout remettre comme au terrier genere.
func reset() -> void:
	release()
	draft = {}
	layout = BurrowLayout.of(seed_text, draft)


## Les cases que le potager couvrirait si on le posait la — pour le survol.
func footprint(cell: Vector2i) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	if held == Held.FIELD:
		var d := cell - held_cell
		for t in layout.field:
			out.append(BurrowLayout.cell_of(t) + d)
	elif held == Held.HOUSE:
		return BurrowLayout.house_cells(_house_anchor(cell))
	elif held != Held.NONE:
		out.append(cell)
	return out


## Les cases de ce qu'on tient, la ou il est.
func source_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	match held:
		Held.FIELD:
			for t in layout.field:
				out.append(BurrowLayout.cell_of(t))
		Held.HOUSE:
			out = BurrowLayout.house_cells(layout.building)
		Held.THING:
			var p := placed(held_index)
			if not p.is_empty():
				out.append(Vector2i(int(p.x), int(p.y)))
	return out


## La chose de rang `rank` (dans `base.placements`) telle que le terrier
## amenage la pose, ou vide si elle s'y est effacee.
func placed(rank: int) -> Dictionary:
	if rank < 0 or rank >= base.placements.size():
		return {}
	var id := String(base.placements[rank].get("id", ""))
	for p in layout.placements:
		if String(p.get("id", "")) == id:
			return p
	return {}


## Le fouillis de rang `rank` s'efface-t-il sous ce qu'on y pose ? Oui tant
## que le joueur ne l'a pas deplace lui-meme (generate.ts `givesWay`).
func gives_way(rank: int) -> bool:
	var bp: Dictionary = base.placements[rank]
	if not BurrowLayout.gives_way(String(bp.kind)):
		return false
	var from := BurrowLayout.index(Vector2i(int(bp.x), int(bp.y)))
	for m in draft.get("moves", []):
		if int(m[0]) == from and int(m[1]) != from:
			return false
	return true


# ---------------------------------------------------------------- le dedans

func _hold(what: Held, index: int, cell: Vector2i) -> void:
	held = what
	held_index = index
	held_cell = cell
	if what == Held.THING:
		var p := placed(index)
		held_cell = Vector2i(int(p.x), int(p.y))
	targets = {}
	_pending.clear()
	# Une chose qui ne bloque pas (un buisson, une touffe) et la maison ne
	# changent pas le sol : le tri bon marche suffit.
	var rules := what == Held.FIELD
	if what == Held.THING:
		rules = bool(IslandGround.BLOCKS.get(base.placements[index].kind, false))
	var n := BurrowLayout.COLS * BurrowLayout.ROWS
	for t in range(n):
		var c := BurrowLayout.cell_of(t)
		if c == held_cell:
			continue
		if _cheap_refusal(c) != "":
			continue
		targets[c] = true
		if rules:
			_pending.append(c)
	# Les plus proches d'abord (juges en dernier sortent de la pile en
	# premier) : c'est la qu'on posera, le plus souvent.
	var at := held_cell
	_pending.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return a.distance_squared_to(at) > b.distance_squared_to(at))


## Le rang (dans `base.placements`) de la chose posee sur `cell`, ou -1.
func _thing_at(cell: Vector2i) -> int:
	for p in layout.placements:
		if int(p.x) == cell.x and int(p.y) == cell.y:
			return int(_rank_of.get(String(p.get("id", "")), -1))
	return -1


## Ce qu'on peut refuser sans remesurer le terrier.
func _cheap_refusal(c: Vector2i) -> String:
	if layout.map.level_at(c.x, c.y) <= 0:
		return "thing_off_ground"
	var t := BurrowLayout.index(c)
	match held:
		Held.THING:
			# L'ENTREE n'a pas de dessin hors raid : « quelque chose occupe deja
			# cette case » se lisait faux sur une case vide. Elle a son mot.
			if t == layout.entrance:
				return "entrance"
			if BurrowLayout.house_cells(layout.building).has(c):
				return "occupied"
			if layout.kind(t) == BurrowLayout.Cell.FIELD:
				return "occupied"
			var there := _thing_at(c)
			if there >= 0 and there != held_index and not gives_way(there):
				return "occupied"
		Held.HOUSE:
			# Quatre cases de sol nu, aucune au bord de l'eau. Les siennes
			# comptent pour du sol : la maison est solide (2026-09-24), ses
			# cases sont BLOCKED tant qu'elle y est, et libres des qu'elle part.
			var square := BurrowLayout.house_cells(_house_anchor(c))
			if square.is_empty():
				return "house_off_ground"
			var own := BurrowLayout.house_cells(layout.building)
			var tier := layout.map.level_at(square[0].x, square[0].y)
			for q in square:
				var there := _thing_at(q)
				var kind := BurrowLayout.Cell.GROUND if own.has(q) else layout.kind(BurrowLayout.index(q))
				if kind != BurrowLayout.Cell.GROUND \
						or (there >= 0 and not gives_way(there)) or layout.sea_distance(q) < 1 \
						or layout.map.level_at(q.x, q.y) != tier:
					return "house_off_ground"
	return ""


## Le brouillon, avec ce qu'on tient pose sur `cell`.
func _candidate(cell: Vector2i) -> Dictionary:
	var next := draft.duplicate(true)
	match held:
		Held.FIELD:
			var s := _shift_of(draft) + (cell - held_cell)
			next["field"] = [s.x, s.y]
		Held.HOUSE:
			next["house"] = BurrowLayout.index(_house_anchor(cell))
		Held.THING:
			var bp: Dictionary = base.placements[held_index]
			var from := BurrowLayout.index(Vector2i(int(bp.x), int(bp.y)))
			var to := BurrowLayout.index(cell)
			var moves: Array = []
			for m in draft.get("moves", []):
				if int(m[0]) != from:
					moves.append([int(m[0]), int(m[1])])
			if to != from:
				moves.append([from, to])
			next["moves"] = moves
	return _clean(next)


func _why_not(cell: Vector2i) -> String:
	if held == Held.NONE:
		return ""
	var cheap := _cheap_refusal(cell)
	if cheap != "":
		return cheap
	var next := _candidate(cell)
	if not BurrowLayout.has_edits(next):
		return ""
	var out: Variant = BurrowLayout.edited(base, next)
	return out if out is String else ""


## La case d'ancrage de la maison si la case tenue tombe sur `cell` : elle
## garde son ecart a l'ancre, comme le potager.
func _house_anchor(cell: Vector2i) -> Vector2i:
	return cell - (held_cell - layout.building)


static func _shift_of(edits: Dictionary) -> Vector2i:
	var f: Variant = edits.get("field")
	if f is Array and f.size() == 2:
		return Vector2i(int(f[0]), int(f[1]))
	return Vector2i.ZERO


## Sans les cles vides : `{}` est le terrier genere, au serveur comme ici.
static func _clean(edits: Dictionary) -> Dictionary:
	var out := {}
	var s := _shift_of(edits)
	if s != Vector2i.ZERO:
		out["field"] = [s.x, s.y]
	if edits.get("house") != null:
		out["house"] = int(edits["house"])
	var moves: Array = []
	for m in edits.get("moves", []):
		if int(m[0]) != int(m[1]):
			moves.append([int(m[0]), int(m[1])])
	if not moves.is_empty():
		out["moves"] = moves
	return out
