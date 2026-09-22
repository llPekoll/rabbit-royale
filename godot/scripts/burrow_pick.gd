extends RefCounted
class_name BurrowPick
## QUELLE CASE LE DOIGT TOUCHE — et pourquoi ce n'est pas une simple inversion.
##
## Porte de src/game/burrow/screen.ts (`burrowTileAt`) et de la note de
## BurrowScene sur les aires de hit.
##
## LE WEB NE FAIT PAS CE CALCUL, ET C'EST DELIBERE CHEZ LUI. Chaque losange y
## est un objet interactif portant une aire de hit polygonale, monte dans le
## bloc de terrain de sa case : « l'ordre de dessin de Pixi lui-meme donne la
## reponse et il n'y a pas de seconde projection a tenir en phase avec la
## premiere ». Cette fonction existe la-bas pour les TESTS et pour le serveur,
## qui n'ont pas de scene a interroger.
##
## ICI ELLE EST LE CHEMIN PRINCIPAL, parce que Godot ne donne pas l'equivalent :
## un Sprite2D n'a pas d'aire de hit, et le faire repondre demanderait un
## Area2D avec un CollisionPolygon2D par case — 148 corps physiques pour
## repondre a une question de geometrie pure qu'on sait resoudre en vingt
## lignes. On prend donc la voie geometrique, MAIS en gardant les deux raisons
## qui ont fait choisir l'autre :
##
##   • ON BALAIE LES PALIERS DU HAUT VERS LE BAS, comme le regard. Une simple
##     inversion de la projection plate repond avec la case DEVANT celle qu'on
##     regarde : « tapez une etagere et le piege atterrit sur l'herbe en
##     dessous ».
##
##   • ON TESTE LE VRAI LOSANGE, jamais une boite. Une boite englobante
##     recouvre ses quatre voisines diagonales, donc c'est l'ordre de dessin
##     qui deciderait quelle case repond au lieu du doigt.

## LE LOSANGE COMPLET, PAS L'INCRUSTE QUE DESSINE LA TEXTURE.
##
## Les losanges de placement sont peints a 0,88 pour laisser un cheveu entre
## deux cases voisines — mais ce cheveu appartient a l'une d'elles plutot qu'a
## ce qui transparait a travers. Un doigt qui tombe dessus doit obtenir une
## case, pas un trou.
const FULL := 1.0


## LA CASE SOUS UN POINT, en coordonnees du TERRAIN.
##
## Rend (-1,-1) quand le point ne touche aucune terre.
##
## L'appelant convertit d'abord l'ecran vers cet espace — c'est lui qui connait
## la transformation de la camera, et la refaire ici obligerait cette fonction
## a la connaitre aussi.
static func at(map: BurrowMap, point: Vector2) -> Vector2i:
	if map == null:
		return Vector2i(-1, -1)

	# DU PALIER LE PLUS HAUT VERS LE PLUS BAS — l'ordre du regard.
	#
	# Une case haute est dessinee PLUS HAUT a l'ecran que sa position a plat :
	# pour savoir si le doigt la touche, on redescend le point de son lift et
	# on demande au treillis plat. La premiere case qui se reconnait gagne,
	# exactement comme la premiere surface rencontree par l'oeil.
	#
	# LE LIFT EST CELUI DE LA CARTE, JAMAIS UN LIFT RECALCULE — et c'est un bug
	# que ce fichier a eu. `tier * lift_px` semble evident et il est FAUX :
	# `lift_at` ajoute `surface_lift`, le lissage par sommet, donc une case de
	# palier 1 peut se dessiner a 10,5 et non a 6. Le balayage cherchait alors
	# des hauteurs auxquelles aucune case ne se trouve, et sur un bord de
	# terrasse le doigt tombait dans le vide.
	#
	# C'est le piege que le web enonce en toutes lettres : « burrowLift, le
	# renderer et le resolveur de tap doivent lire le MEME lift — un desaccord
	# met le marqueur d'un pillard a cote de la tuile ou il se tient ». On
	# demande donc a la carte, case par case, plutot que de refaire son calcul.
	for tier in range(BurrowMap.TIERS, 0, -1):
		var cell := _at_tier(map, point, tier)
		if cell.x >= 0:
			return cell
	return Vector2i(-1, -1)


## LA CASE DE CE PALIER SOUS LE POINT, ou (-1,-1).
##
## On essaie les lifts REELS de ce palier. Ils varient d'une case a l'autre
## (le lissage par sommet), donc plutot qu'un lift unique on teste les valeurs
## distinctes que le palier porte vraiment — en general une ou deux.
static func _at_tier(map: BurrowMap, point: Vector2, tier: int) -> Vector2i:
	for lift in _lifts_of(map, tier):
		var cell := _flat_at(point + Vector2(0, lift))
		if cell.x < 0:
			continue
		# Elle doit VRAIMENT etre a ce palier ET porter ce lift : sinon on a lu
		# la case d'un autre etage a travers le decalage de celui-ci.
		if map.level_at(cell.x, cell.y) != tier:
			continue
		if not is_equal_approx(map.lift_at(cell.x, cell.y), lift):
			continue
		return cell
	return Vector2i(-1, -1)


## LES HAUTEURS DISTINCTES qu'un palier porte, de la plus haute a la plus
## basse — l'ordre du regard, la encore.
static func _lifts_of(map: BurrowMap, tier: int) -> Array[float]:
	var seen := {}
	for row in range(map.height):
		for col in range(map.width):
			if map.level_at(col, row) != tier:
				continue
			seen[map.lift_at(col, row)] = true
	var out: Array[float] = []
	for lift in seen:
		out.append(lift)
	out.sort()
	out.reverse()
	return out


## L'INVERSE DE LA PROJECTION PLATE, avec le test du losange.
##
## `Iso.unproject` arrondit vers la case la plus proche, ce qui rend TOUJOURS
## une case tant qu'on est dans la grille — y compris quand le point tombe dans
## le coin d'un rectangle, hors du losange. On refait donc le test nous-memes :
## |dx|/hw + |dy|/hh <= 1, l'equation de la tuile, la meme que celle qui cuit
## la texture du losange dans placement_hints.gd.
static func _flat_at(point: Vector2) -> Vector2i:
	var cell := Iso.unproject(point)
	if cell.x < 0:
		return cell
	# Le centre du losange de cette case — `unproject` raisonne sur le coin
	# haut, et le losange est centre une demi-hauteur plus bas.
	var centre := Iso.project(cell.x, cell.y)
	var d := point - centre
	var inside := absf(d.x) / (Iso.half_w() * FULL) + absf(d.y) / (Iso.half_h() * FULL)
	if inside > 1.0:
		# LE DOIGT EST DANS LE COIN DU RECTANGLE, hors du losange : la vraie
		# case est l'une des voisines diagonales.
		return _nearest_diamond(point, cell)
	return cell


## LA CASE DONT LE LOSANGE CONTIENT VRAIMENT LE POINT, cherchee autour.
##
## Appelee seulement quand l'arrondi a repondu une case dont le losange ne
## contient pas le point — donc le doigt est dans un coin, et la bonne reponse
## est l'une des huit voisines. On les essaie toutes plutot que de deduire
## laquelle : huit tests d'inegalite coutent moins qu'un raisonnement sur les
## signes qu'on relira trois fois sans etre sur.
static func _nearest_diamond(point: Vector2, near: Vector2i) -> Vector2i:
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var c := near + Vector2i(dx, dy)
			var centre := Iso.project(c.x, c.y)
			var d := point - centre
			if absf(d.x) / Iso.half_w() + absf(d.y) / Iso.half_h() <= 1.0:
				return c
	return Vector2i(-1, -1)
