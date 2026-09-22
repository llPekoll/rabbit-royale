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

var map: BurrowMap
var _planks: Array[Node2D] = []


## Pose les clotures d'apres le relief et le champ qu'on lui donne.
##
## Le champ arrive du dehors — c'est BurrowProps qui choisit ou la maison se
## pose et ou le potager s'etend, et les clotures ne sauraient pas le redeviner
## sans refaire ce choix a l'identique. Deux tirages de la meme graine qui
## divergent d'une case, et la cloture borde un champ qui n'est pas la.
func build(field: Array[Vector2i]) -> void:
	clear()
	if map == null or field.is_empty():
		return

	# LE CHAMP EN ENSEMBLE, pour demander « celle-la en est-elle ? » d'un coup.
	# La liste suffirait a dix-neuf sur dix-neuf, mais la question est posee
	# quatre fois par case et c'est la boucle qui decide de la forme du contour.
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
			_paint(cell, side)


func clear() -> void:
	# Les noeuds et leur liste meurent ensemble — voir BurrowTerrain.clear.
	for plank in _planks:
		plank.queue_free()
	_planks.clear()


## UNE PLANCHE, sur une face d'une case.
func _paint(cell: Vector2i, side: String) -> void:
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
