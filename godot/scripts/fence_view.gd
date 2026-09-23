extends Node2D
class_name FenceView
## LES CLOTURES DU POTAGER — une planche par arete exposee.
##
## Portee de src/game/burrow/FenceView.ts et de src/game/burrow/fence.ts.
##
## UNE CLOTURE EST UNE ARETE, PAS UNE CASE. C'est la difference qui commande
## tout le fichier. Les pieges, les indices, la maison : tout le reste du
## terrier s'adresse par CASE, et une case a un centre ou l'on pose les choses.
## Une planche se tient entre deux cases, sur l'une des quatre faces du
## losange, et un potager en coin expose deux ou trois faces de la meme case.
## Un systeme indexe par case nommerait donc trois planches d'un seul nom.
##
## D'ou le couple (case, cote) : la case du CHAMP dont la planche est le bord,
## et la face. Jamais la case d'en face, qui au creux d'une encoche est la
## voisine de deux cases du champ et nommerait deux aretes a la fois.
##
## UNE PLANCHE NE TOURNE JAMAIS. Elle est dessinee le long d'une diagonale iso
## et MIROITEE sur l'autre par une echelle en x negative. Une rotation
## coucherait les poteaux — ils doivent rester debout, et l'art est deja cuit
## dans la pente 2:1 des faces de tuile. C'est aussi pourquoi l'echelle est
## UNIFORME : une echelle par axe etirerait les poteaux avec la traverse.

## LA TEXTURE, partagee mot pour mot avec le web (segment-v2.png, 192x128).
const PLANK := preload("res://assets/deco/fence.png")

## LES DEUX ANCRES DU SPRITE, dans les pixels de l'image.
##
## v2 fait exactement un huitieme de la v1 generee, et ces nombres sont ceux de
## la v1 divises par huit — d'ou leur partie fractionnaire, QU'IL FAUT GARDER.
## Les arrondir sort les poteaux du treillis, et le joint entre deux planches
## s'ouvre d'un pixel qui se voit beaucoup au zoom du terrier.
##
## `FOOT` est le PIVOT : le sprite est place par la ou ses poteaux se tiennent,
## jamais par sa boite transparente. `SPAN` est la distance entre les deux
## pieds, ce par quoi on divise la longueur d'une arete pour avoir l'echelle.
const FOOT := Vector2(469.0 / 8.0, 610.0 / 8.0)
const SPAN := Vector2(594.0 / 8.0, 246.0 / 8.0)

## LES QUATRE FACES, et le voisin que chacune regarde.
##
## `NE` est la face vers les `row` decroissants, et elles tournent dans le sens
## horaire a partir de la — le meme ordre que lisent les panneaux de la story.
const STEP := {
	"NE": Vector2i(0, -1),
	"SE": Vector2i(1, 0),
	"SW": Vector2i(0, 1),
	"NW": Vector2i(-1, 0),
}
const SIDES := ["NE", "SE", "SW", "NW"]

## LE BIAIS DE PROFONDEUR, ET SON SIGNE — le piege documente de ce portage.
##
## Une planche pend a l'une des quatre aretes de sa case, et DEUX D'ENTRE ELLES
## SONT DERRIERE. Biaisees en avant pour les quatre, les rails du bord arriere
## du jardin etaient dessines PAR-DESSUS les carottes et la terre devant
## lesquelles ils ne se tiennent pas.
##
## Les aretes proches (SE, SW) gardent le biais avant, pour que leurs poteaux
## passent devant le champ ; les lointaines (NE, NW) font le meme pas en
## arriere, la ou le sol les met deja.
##
## LE WEB DIT ±0.3 D'UN PAS DE CASE. Ici `Iso.depth` multiplie le pas par 16 et
## `z_index` est un entier : ces trois dixiemes valent donc CINQ. Les ecrire
## `0.3` dans ce repere les arrondirait a zero, et les deux biais deviendraient
## le meme — soit exactement le bug d'origine, en silence.
const PLANK_BIAS := 5
const PLANK_BEHIND := -5

## LES CIBLES, dans la langue du plateau (FenceView.ts) : le losange bleu
## des cases minables, pose sur la case de l'AUTRE cote de l'arete, et l'or
## du survol. Une cloture n'a pas de couleur a elle — un cinquieme ton serait
## un second vocabulaire pour dire « tape ici ».
const OFFER_TINT := Color("#8fd6ff")
const OFFER_ALPHA := 0.42
const HOVER_TINT := Color("#ffd45c")
const HOVER_ALPHA := 0.85

var map: BurrowMap
## Une entree par arete exposee : {seg, key, plank, mark, mid, at}. `mid` est
## le milieu de l'arete, `at` le centre du losange — les deux dans le repere
## du plateau, ou `pick` mesure.
var _drawn: Array[Dictionary] = []
var _planks: Array[Node2D] = []
var _built := {}
var _offered := {}
var _hovered := ""
var _placing := false


static func key_of(seg: Dictionary) -> String:
	return "%d:%s" % [int(seg.get("tile", -1)), String(seg.get("side", ""))]


## Pose TOUTES les aretes du champ, invisibles : ce qui se voit est decide par
## `set_state`, d'apres la liste du serveur. Le premier portage dressait ici
## chaque planche d'office — un potager clos des la premiere partie, alors
## que le joueur en a trois a poser lui-meme (Paul, 2026-09-23).
##
## Le champ arrive du dehors — c'est le terrier du serveur (BurrowLayout) qui
## le tient, et les clotures ne sauraient pas le redeviner sans refaire ce
## choix a l'identique. Deux tirages de la meme graine qui divergent d'une
## case, et la cloture borde un champ qui n'est pas la.
func build(field: Array[Vector2i], terrain: BurrowTerrain = null) -> void:
	clear()
	if map == null or field.is_empty():
		return

	# LE CHAMP EN ENSEMBLE, pour demander « celle-la en est-elle ? » d'un coup.
	var occupied := {}
	for cell in field:
		occupied[cell] = true

	for cell in field:
		for side in SIDES:
			# UNE FACE EST EXPOSEE quand la voisine de ce cote n'est PAS du
			# champ. C'est ce qui fait tenir un potager de forme quelconque :
			# un parcours de rectangle emettrait des aretes au milieu d'un
			# champ concave et raterait celles de son encoche.
			var step: Vector2i = STEP[side]
			if occupied.has(cell + step):
				continue
			var plank := _paint(cell, side)
			plank.visible = false
			var outer: Vector2i = cell + step
			var mark := _paint_mark(outer, terrain)
			var seg := {"tile": BurrowLayout.index(cell), "side": side}
			var corner := _corners(side)
			_drawn.append({
				"seg": seg,
				"key": key_of(seg),
				"plank": plank,
				"mark": mark,
				"mid": _ground_of(cell) + _project((corner[0] + corner[1]) * 0.5),
				"at": _ground_of(outer),
			})
	_restyle()


func clear() -> void:
	# Les noeuds et leur liste meurent ensemble — voir BurrowTerrain.clear. Les
	# losanges vivent dans les blocs du terrain : ils partent avec lui, mais
	# la liste, elle, garderait des references mortes.
	for plank in _planks:
		plank.queue_free()
	_planks.clear()
	for d in _drawn:
		var mark: Node2D = d["mark"]
		if is_instance_valid(mark):
			mark.queue_free()
	_drawn.clear()
	_hovered = ""


## CE QUI TIENT DEBOUT, et ce qui peut encore se poser — les deux du serveur
## (/api/fences `placed` et `offers`) : la regle du portail est la sienne.
func set_state(built: Array, offered: Array) -> void:
	_built.clear()
	_offered.clear()
	for seg in built:
		if seg is Dictionary:
			_built[key_of(seg)] = true
	for seg in offered:
		if seg is Dictionary:
			_offered[key_of(seg)] = true
	_restyle()


func set_placing(on: bool) -> void:
	if _placing == on:
		return
	_placing = on
	if not on:
		_hovered = ""
	_restyle()


func set_hovered(seg: Dictionary) -> void:
	var key := key_of(seg) if not seg.is_empty() else ""
	if key == _hovered:
		return
	_hovered = key
	_restyle()


func is_built(seg: Dictionary) -> bool:
	return _built.has(key_of(seg))


## L'ARETE SOUS UN POINT DU PLATEAU, ou {} — FenceView.ts `pick`.
##
## PAR LA DISTANCE, et non par la case : le losange d'une encoche est la case
## d'en face de DEUX aretes, et une planche se tient entre deux cases. Le plus
## proche du milieu de l'arete OU du centre de son losange gagne ; seules les
## aretes qu'on peut toucher (offertes, ou debout pour les retirer) comptent.
func pick(at: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_score := Iso.half_w() * 0.9
	var best_edge := INF
	for d in _drawn:
		var key: String = d["key"]
		if not _offered.has(key) and not _built.has(key):
			continue
		var to_edge := at.distance_to(d["mid"])
		var to_mark := at.distance_to(d["at"])
		var score := minf(to_edge, to_mark)
		if score < best_score or (score == best_score and to_edge < best_edge):
			best_score = score
			best_edge = to_edge
			best = d["seg"]
	return best.duplicate()


func _restyle() -> void:
	for d in _drawn:
		var key: String = d["key"]
		var plank: Node2D = d["plank"]
		var mark: Node2D = d["mark"]
		var built := _built.has(key)
		var offered := _placing and _offered.has(key)
		var hovered := _placing and key == _hovered and (offered or built)
		plank.visible = built
		# LA PLANCHE EN OR au survol : c'est « tape pour la retirer ».
		plank.modulate = HOVER_TINT if built and hovered else Color.WHITE
		var alpha := 0.0
		if _placing and not built:
			alpha = HOVER_ALPHA if hovered else (OFFER_ALPHA if offered else 0.0)
		if is_instance_valid(mark):
			var tint := HOVER_TINT if hovered else OFFER_TINT
			mark.modulate = Color(tint, alpha)
			mark.visible = alpha > 0.0


## LE LOSANGE d'une arete, sur la case d'en face. Monte dans le bloc de sa
## case comme ceux de la pose (placement_hints.gd) ; la mer n'a pas de bloc,
## il se pose alors a plat, trie a sa profondeur.
func _paint_mark(outer: Vector2i, terrain: BurrowTerrain) -> Sprite2D:
	var mark := Sprite2D.new()
	mark.texture = PlacementHints._diamond_texture()
	mark.centered = true
	mark.visible = false
	if terrain != null and terrain.mount_veil(outer, mark):
		return mark
	mark.position = _ground_of(outer)
	mark.z_index = Iso.depth(outer.x, outer.y) + 1
	add_child(mark)
	return mark


## UNE PLANCHE, sur une face d'une case.
func _paint(cell: Vector2i, side: String) -> Sprite2D:
	var corner := _corners(side)
	var centre := _ground_of(cell)

	var a := centre + _project(corner[0])
	var b := centre + _project(corner[1])
	# LE POINT LE PLUS HAUT D'ABORD : la planche est toujours dessinee du haut
	# vers le bas, et c'est alors la GEOMETRIE qui decide du miroir, pas l'ordre
	# dans lequel la boucle a visite les cases. Deux cases voisines partageant
	# une face doivent sortir deux sprites eclaires pareil.
	if a.y > b.y:
		var swap := a
		a = b
		b = swap

	var plank := Sprite2D.new()
	plank.texture = PLANK
	plank.centered = false

	# L'ECHELLE : la longueur de l'arete divisee par celle de l'art.
	var k := a.distance_to(b) / SPAN.length()
	# UN X NEGATIF EST LE MIROIR sur l'autre diagonale. Jamais `rotation` : ca
	# coucherait les poteaux, qui doivent rester debout.
	plank.scale = Vector2(-k if (b.x - a.x) < 0.0 else k, k)

	# ANCREE AU PIED. `offset` est applique AVANT l'echelle par Godot, donc il
	# s'ecrit dans les pixels de l'image — et le miroir le renvoie tout seul du
	# bon cote, ce qui est precisement pourquoi le pivot est un pied et non le
	# milieu de la traverse.
	plank.offset = -FOOT
	plank.position = a

	# LA PLANCHE VA DANS LE PLATEAU, PAS DANS LE BLOC DE SA CASE.
	#
	# Le web a paye cette lecon : `mountVeil` ECRASE la position du sprite avec
	# le centre de sa case — c'est son contrat, il existe pour les recouvrements
	# EN FORME DE CASE. Une planche n'a pas cette forme : elle est ancree sur le
	# pied d'un poteau, sur l'arete entre deux cases. Montee, chaque cloture
	# etait tiree au milieu de sa tuile et perdait le lift qui posait ses pieds
	# sur le palier — les rails s'enfoncaient dans le sol. Paul, 2026-09-21 :
	# « j'ai l'impression que les barriere sont en dessous ».
	var behind := side == "NE" or side == "NW"
	plank.z_index = (Iso.depth(cell.x, cell.y) + map.level_at(cell.x, cell.y)
		+ (PLANK_BEHIND if behind else PLANK_BIAS))
	add_child(plank)
	_planks.append(plank)
	return plank


## LES DEUX PIEDS D'UNE ARETE, en offsets de demi-case depuis le centre.
##
## Toujours dans le MEME sens de parcours, pour que le miroir du sprite soit
## decide par le COTE et non par la case visitee en premier : une arete dont
## les extremites auraient permute retournerait l'une des deux planches.
func _corners(side: String) -> Array[Vector2]:
	match side:
		"NE": return [Vector2(-0.5, -0.5), Vector2(0.5, -0.5)]
		"SE": return [Vector2(0.5, -0.5), Vector2(0.5, 0.5)]
		"SW": return [Vector2(-0.5, 0.5), Vector2(0.5, 0.5)]
		_: return [Vector2(-0.5, -0.5), Vector2(-0.5, 0.5)]


## UN COIN EN DEMI-CASES VERS L'ECRAN — la meme projection que tout le reste.
##
## En demi-cases et non en pixels : c'est ce qui permet a une arete d'etre
## posee relativement a sa case, sans jamais connaitre l'origine du plateau.
func _project(p: Vector2) -> Vector2:
	return Vector2((p.x - p.y) * Iso.half_w(), (p.x + p.y) * Iso.half_h())


## LE CENTRE DU SOL D'UNE CASE — son losange, palier compris.
##
## `map.screen_of` donne le coin haut de la case ; les pieds d'une cloture se
## posent au MILIEU du losange, comme la maison. Le lift du palier est deja
## dans `screen_of`, et c'est ce qui met les pieds sur la terrasse plutot que
## sur le treillis a plat.
func _ground_of(cell: Vector2i) -> Vector2:
	return map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
