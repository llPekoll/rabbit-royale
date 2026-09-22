extends RefCounted
class_name BurrowCamera
## LES CADRAGES DU TERRIER — quatre prises, resolues par le relief.
##
## Portee de src/game/scenes/burrowCamera.ts.
##
## UNE SEULE TRANSFORMATION, SUR LE CONTENEUR DE LA SCENE. Jamais un rescale
## par objet : le terrain, les decors, les clotures et le lapin doivent bouger
## ensemble, et redimensionner chacun d'eux ferait deriver leurs positions
## relatives — sans parler du cout.
##
## ARITHMETIQUE PURE, aucun noeud, comme BurrowMap. Un cadrage est une reponse
## a « ou est la terre », et la terre se calcule. Ca permet aussi de mesurer
## les quatre prises en headless, sans ouvrir de fenetre, ce qui est exactement
## ce qu'on veut pour un portage qui se verifie sur un telephone.
##
## LES QUATRE PRISES :
##   • home  — la ferme dans ce que le chrome laisse de libre, en fond d'ecran
##   • board — la ferme entiere, centree : la prise de DECISION (un raid)
##   • place — le meme, rapproche, pour choisir une case ou poser une bombe
##   • wall  — le meme zoom que `place`, mais VISE SUR LE POTAGER

## L'ESPACE DE DESIGN — celui du Seeker, et c'est le viewport du projet.
##
## `window/stretch/mode = canvas_items` etire ce repere jusqu'a l'ecran reel :
## les nombres ci-dessous sont donc des pixels de DESIGN, et ils gardent leur
## sens sur un telephone plus grand comme sur un plus petit.
const GAME_W := 890.0
const GAME_H := 400.0

## L'AIR AUTOUR DU PLATEAU dans la prise reculee, en part du cadre.
##
## 0.82 et non l'ancien 0.94, qui remplissait le cadre d'un bord a l'autre. Le
## placement est le seul ecran ou tout le plateau doit etre LISIBLE ET
## CLIQUABLE a la fois — le joueur cherche une case ou creuser, il n'admire pas
## sa ferme — et un plateau plaque contre le cadre laisse ses cases du pourtour
## a moitie sous les bords de la fenetre.
const BOARD_MARGIN := 0.82

## LA FENETRE DE LA PRISE « MAISON » : ce que le chrome laisse de nu, en parts
## du canevas de design.
##
## A la maison la ferme est un DECOR DE FOND. Les cartes du terrier se tiennent
## sur le quart gauche, la barre du haut prend la premiere bande et celle de la
## boucle la derniere. Une ferme cadree sur tout le canevas mettait sa cote
## ouest sous les cartes et sa cote sud sous DIG / DEFEND / RAID — sur le
## Seeker la terre courait jusqu'a y 498 d'un canevas de 431 pixels. Paul, le
## 2026-09-16 : « la ferme du joueur est trop grosse ».
##
## DES PARTS plutot qu'une mesure passee par le chrome : c'est le seul endroit
## ou le plateau doit savoir ou se tient l'interface, et un decor de fond peut
## se permettre l'approximation qu'une cible de pouce ne pourrait pas.
## 25vw + 10px de bord + 12px de marge = 0.27 de la largeur ; une barre de 56px
## = 0.14 et une de 48px sur un bord de 10px = 0.145 de la hauteur.
const HOME_LEFT := 0.27
const HOME_TOP := 0.14
const HOME_BOTTOM := 0.145

## L'air autour de la terre DANS cette fenetre, en part d'elle.
const HOME_MARGIN := 0.9

## LE PLAFOND DU ZOOM DE PLACEMENT, en multiple du fit.
##
## UN MULTIPLE DU FIT et non une taille de tuile : le fit absorbe deja la forme
## de la graine et celle de l'ecran ; une taille fixe reintroduirait le
## probleme de cadrage par graine que le fit existe pour resoudre.
##
## POURQUOI LE PLAFOND EST AU-DESSUS DE L'OUVERTURE. Les deux ont ete le meme
## nombre, et c'est ce qui rendait le pincement casse : l'ecran s'ouvrait AU
## plafond, donc la moitie de chaque pincement — celle qui rapproche — ne
## bougeait rien du tout. Un geste qui ne repond que dans un sens se lit comme
## un plateau bloque, pas comme une limite.
const PLACE_ZOOM_MAX := 3.0

## A QUELLE DISTANCE LE PLACEMENT S'OUVRE, en multiple du fit.
##
## 1.5 et non le 2 des debuts : a 2, le plateau est un trou de serrure sur un
## telephone — les cases du pourtour sont hors ecran, donc la premiere chose
## que l'ecran demande au joueur est un glissement, avant meme qu'il ait vu
## entre quoi il choisit.
const PLACE_ZOOM_OPEN := 1.5

## DE COMBIEN LE PLATEAU PEUT DEPASSER son bord, en part du cadre.
##
## Epingler la cote au bord de l'ecran met les cases du pourtour sous le rebord
## de la fenetre, la ou un pouce doit aller chercher derriere la bordure.
const PAN_SLACK := 0.25


## UN CADRAGE : une echelle et une position, rien d'autre.
##
## C'est exactement ce qu'on pose sur un Node2D — `scale` et `position` — et
## c'est pourquoi la structure est si maigre : la camera ne DESSINE pas, elle
## repond a « ou et a quelle taille ».
class Shot extends RefCounted:
	var scale: float
	var at: Vector2

	func _init(p_scale: float, p_at: Vector2) -> void:
		scale = p_scale
		at = p_at


## LA BOITE DE LA TERRE JOUEE, en coordonnees de la scene.
##
## SEULEMENT LES CASES PRATICABLES : la mer et le decor autour sont du cadre,
## et ajuster sur tout le treillis 19x19 depenserait l'ecran en eau.
##
## LES TUILES SONT PRISES A LEUR POSITION LEVEE (`screen_of` porte deja le
## lift du palier), pour qu'une etagere en haut de la ferme ne soit pas coupee.
static func board_bounds(map: BurrowMap) -> Rect2:
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	var hw := Iso.half_w()
	var hh := Iso.half_h()
	for row in range(map.height):
		for col in range(map.width):
			if not map.is_land(col, row):
				continue
			# Le centre du losange — `screen_of` le rend deja.
			var at := map.screen_of(col, row)
			lo.x = minf(lo.x, at.x - hw)
			hi.x = maxf(hi.x, at.x + hw)
			lo.y = minf(lo.y, at.y - hh)
			hi.y = maxf(hi.y, at.y + hh)
	if lo.x > hi.x:
		return Rect2()
	return Rect2(lo, hi - lo)


## LA PRISE « MAISON » : la ferme ajustee dans la fenetre que le chrome laisse,
## centree dedans, JAMAIS PLUS PRES QUE LE 1:1 mis en page.
##
## Ce `min(1, ...)` est la regle : se rapprocher est le travail du placement.
## A la maison la ferme est un fond, et un fond qui grossit passe devant son
## propre chrome.
static func home(map: BurrowMap, w: float = GAME_W, h: float = GAME_H) -> Shot:
	var b := board_bounds(map)
	if b.size == Vector2.ZERO:
		return Shot.new(1.0, Vector2.ZERO)
	var win := Rect2(
		w * HOME_LEFT, h * HOME_TOP,
		w * (1.0 - HOME_LEFT), h * (1.0 - HOME_TOP - HOME_BOTTOM)
	)
	var scale := minf(1.0, minf(
		(win.size.x * HOME_MARGIN) / b.size.x,
		(win.size.y * HOME_MARGIN) / b.size.y
	))
	return Shot.new(scale, win.position + win.size * 0.5 - scale * b.get_center())


## LA PRISE DE DECISION : toute la ferme, centree.
##
## UN FIT, PAS UNE CONSTANTE — et c'est l'inverse de ce que faisait le terrier
## peint, pour une raison qui a change sous lui. A l'epoque le plateau etait
## une image 19x19 figee et une camera ajustee annulait EXACTEMENT chaque
## changement de taille de tuile : des cases de 34, 48, 64 et 80 pixels
## sortaient toutes a 46,8 a l'ecran, seule l'echelle de la camera bougeait.
##
## Aujourd'hui chaque ferme a une FORME differente, et une constante ne peut
## pas les cadrer toutes — une ferme large sortirait de l'ecran, une compacte
## se tiendrait dans un coin. Les deux reglages ne se battent plus parce qu'ils
## ne repondent plus a la meme question.
static func board(map: BurrowMap, w: float = GAME_W, h: float = GAME_H) -> Shot:
	var b := board_bounds(map)
	if b.size == Vector2.ZERO:
		return Shot.new(1.0, Vector2.ZERO)
	var scale := minf((w * BOARD_MARGIN) / b.size.x, (h * BOARD_MARGIN) / b.size.y)
	return Shot.new(scale, Vector2(w, h) * 0.5 - scale * b.get_center())


## LES BORNES DU ZOOM DE PLACEMENT, pour cette ferme sur cet ecran.
##
## `x` est le fit — toute la ferme au cadre. `y` est le plafond, confortablement
## AU-DESSUS de l'ouverture, pour qu'un pincement reponde dans les deux sens
## des le depart. Le `max` garde l'ecran degenere ou le fit depasse deja le
## plafond : la plage ne peut jamais revenir a l'envers.
static func zoom_limits(map: BurrowMap, w: float = GAME_W, h: float = GAME_H) -> Vector2:
	var lo := board(map, w, h).scale
	return Vector2(lo, maxf(lo * PLACE_ZOOM_MAX, lo))


## TIENT UN AXE DANS LE CADRE : centre tant que le plateau est plus petit que
## l'ecran, sinon retenu pour que son bord ne depasse celui de l'ecran que du
## jeu accorde.
static func _clamp_axis(pos: float, scale: float, lo: float, hi: float, size: float) -> float:
	var span := (hi - lo) * scale
	if span <= size:
		return size * 0.5 - scale * (lo + hi) * 0.5
	var slack := size * PAN_SLACK
	return clampf(pos, size - slack - scale * hi, slack - scale * lo)


## Ramene un cadrage de placement dans sa plage de zoom et ses bornes de pan.
static func clamp_place(shot: Shot, map: BurrowMap,
		w: float = GAME_W, h: float = GAME_H) -> Shot:
	var limits := zoom_limits(map, w, h)
	var scale := clampf(shot.scale, limits.x, limits.y)
	var b := board_bounds(map)
	if b.size == Vector2.ZERO:
		return Shot.new(scale, shot.at)
	return Shot.new(scale, Vector2(
		_clamp_axis(shot.at.x, scale, b.position.x, b.end.x, w),
		_clamp_axis(shot.at.y, scale, b.position.y, b.end.y, h)
	))


## LA PRISE SUR LAQUELLE LE PLACEMENT S'OUVRE : le fit, rapproche, centre.
##
## CENTRE et non vise : contrairement a l'ile, qui s'ouvre sur la case
## d'apparition, une ferme n'a pas de case depuis laquelle le joueur est sur le
## point d'agir. Toutes les cases minables sont egalement candidates, donc le
## milieu est le depart le plus juste et le glissement atteint le reste.
static func place(map: BurrowMap, w: float = GAME_W, h: float = GAME_H) -> Shot:
	var b := board_bounds(map)
	if b.size == Vector2.ZERO:
		return Shot.new(1.0, Vector2.ZERO)
	var limits := zoom_limits(map, w, h)
	# BORNE plutot que suppose dans la plage : sur un ecran dont le fit depasse
	# deja le plafond, les deux se rejoignent, et la prise d'ouverture doit
	# rester une echelle que le pincement peut quitter dans les deux sens.
	var scale := clampf(limits.x * PLACE_ZOOM_OPEN, limits.x, limits.y)
	return clamp_place(
		Shot.new(scale, Vector2(w, h) * 0.5 - scale * b.get_center()), map, w, h
	)


## LA PRISE DU MODE CLOTURE : le zoom du placement, VISE SUR LE POTAGER.
##
## Pas `place`, bien que ce soit le meme zoom. Le placement centre tout le
## plateau parce que chaque case minable est egalement candidate ; le mode
## cloture a EXACTEMENT UN SUJET, le champ — et sur un ecran large, `place`
## laissait celui-ci au bord lointain, sous le badge de bouclier et le nom du
## proprietaire. La seule chose dont le mode parle, a moitie hors cadre.
## Constate au pilotage Playwright le 2026-09-21, apres le rapport de Paul
## « rien ne se passe comme il faut ».
##
## Un champ vide REPLIE sur la prise de placement plutot que de renvoyer des
## bornes infinies — c'est le `!Number.isFinite(minX)` du web.
static func wall(map: BurrowMap, field: Array[Vector2i],
		w: float = GAME_W, h: float = GAME_H) -> Shot:
	if field.is_empty():
		return place(map, w, h)
	var limits := zoom_limits(map, w, h)
	var scale := clampf(limits.x * PLACE_ZOOM_OPEN, limits.x, limits.y)

	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	var hw := Iso.half_w()
	var hh := Iso.half_h()
	for cell in field:
		var at := map.screen_of(cell.x, cell.y)
		lo.x = minf(lo.x, at.x - hw)
		hi.x = maxf(hi.x, at.x + hw)
		lo.y = minf(lo.y, at.y - hh)
		hi.y = maxf(hi.y, at.y + hh)

	var centre := (lo + hi) * 0.5
	return clamp_place(
		Shot.new(scale, Vector2(w, h) * 0.5 - scale * centre), map, w, h
	)


## ZOOMER AUTOUR D'UN POINT, en laissant EN PLACE ce qui est dessous.
##
## Cet invariant est ce qui fait qu'un pincement se sent comme une prise sur le
## plateau plutot que comme un curseur qu'on tire : on resout le point de scene
## sous le doigt AVANT le changement, puis on remet ce meme point sous lui
## APRES.
static func zoom_at(shot: Shot, factor: float, at: Vector2, map: BurrowMap,
		w: float = GAME_W, h: float = GAME_H) -> Shot:
	var limits := zoom_limits(map, w, h)
	var scale := clampf(shot.scale * factor, limits.x, limits.y)
	var scene := (at - shot.at) / shot.scale
	return clamp_place(Shot.new(scale, at - scene * scale), map, w, h)
