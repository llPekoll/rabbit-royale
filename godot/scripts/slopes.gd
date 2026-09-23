extends RefCounted
class_name Slopes
## LES RAMPES — joindre un palier au suivant SANS falaise.
##
## Porte de src/game/island/slopes.ts.
##
## LE PROBLEME QU'IL RESOUT, et c'est celui que le portage trainait. Une case
## surelevee est un BLOC : sa tuile cuite porte une bande de rocher sous ses
## deux bords visibles, et le losange de la voisine basse vient buter contre
## cette bande. Chaque bord de terrasse est donc une MARCHE. Or le jeu laisse un
## lapin la franchir : l'art dit « mur » la ou les regles disent « chemin ».
##
## LA RAMPE DEPLACE LES HAUTEURS DES CASES VERS LES SOMMETS. Un sommet prend la
## plus haute des quatre cases qui l'entourent, donc une case basse contre un
## plateau a un ou plusieurs coins leves et son losange se DEFORME pour rejoindre
## le bord du plateau ; le plateau, lui, reste plat. Les pixels de la tuile sont
## deplaces verticalement par le melange bilineaire de ses coins, et ombres par
## la pente qu'ils font.
##
## POURQUOI CE FICHIER MANQUAIT, ET CE QUE CA COUTAIT. Le portage calculait bien
## les coins d'une rampe (`BurrowMap.corner_lifts`) et levait sa tuile de leur
## moyenne, mais il posait un LOSANGE PLAT. Entre deux tuiles plates a des
## hauteurs differentes, il reste forcement un coin ouvert — et la mer passait
## au travers. Paul, sur la capture : « je comprends pas, la c'est plat partout,
## pourquoi y a des trous ? quand y a une elevation met une slope ».
##
## Le web decrit ce coin mot pour mot dans `ensure_band` : « where it meets a
## CLIFF along the same edge, its lifted corner leaves a wedge open under its
## lower edge ».
##
## TOUT EST DE L'ARITHMETIQUE SUR LES PIXELS d'une case de 64 portant un losange
## de 44x24 — la geometrie a laquelle les feuilles sont cuites.

## Le losange auquel les feuilles sont cuites, dans leur case de 64.
const DIAMOND_W := 44
const DIAMOND_H := 24
const TILE := 64
const OX := (TILE - DIAMOND_W) / 2
const OY := (TILE - DIAMOND_H) / 2

## LA HAUTEUR DE LA BANDE DE ROCHER cuite sous chaque tuile — le `LIFT` du
## cuiseur. Au-dela, une case doit raccrocher la sienne.
const BAKED_LIFT := 6

## COMMENT UNE RAMPE EST OMBREE : par la DIRECTION qu'elle regarde, et rien
## d'autre.
##
## Pas une surface eclairee : un ombrage lambertien rendait une piece de coin —
## plus raide que les deux rampes droites qu'elle joint — plus sombre que les
## deux, et le coin se lisait comme un bout de mur. Un tileset dessine a la main
## ombre une pente par le cote qu'elle regarde, donc c'est ce qu'on fait.
##
## Toute pente est d'un cran plus sombre que le sol plat (l'anneau autour d'un
## plateau se lit comme son ombre, comme le fait deja le rocher de la cote), une
## pente face a la camera plus sombre qu'une pente qui s'en detourne — les
## falaises du pack sont sombres sur les faces qu'on voit — et une pente au
## sud-est un rien plus claire qu'une au sud-ouest, la convention du pack pour
## les deux faces d'un bloc.
const SLOPE_SHADE := 0.79
const SLOPE_FACING := 0.07
const SLOPE_SIDE := 0.03

## De combien les deux faces visibles s'assombrissent — le `FACE_SHADE` du
## cuiseur, mot pour mot.
const FACE_SHADE_SW := 0.62
const FACE_SHADE_SE := 0.8

## LES TUILES DEFORMEES, GARDEES. Deformer une tuile coute 4096 pixels lus et
## ecrits ; une ile en a 557, et beaucoup partagent la meme combinaison
## (texture, coins, cotes). On ne le fait donc qu'une fois par combinaison.
static var _cache: Dictionary = {}


## LA RANGEE DU BORD BAS du losange a la colonne `col` (0..43), dans la case.
##
## Meme formule que `add_volume` / `trim_iso_lift.py`, pour qu'une bande trouvee
## ici soit celle que ces outils ont ecrite.
static func edge_y(col: int) -> int:
	var t := absf(float(col) - DIAMOND_W / 2.0) / (DIAMOND_W / 2.0)
	return OY + int(floor(DIAMOND_H - 1 - t * (DIAMOND_H / 2.0 - 1)))


## LA TUILE D'UNE RAMPE : sa bande raccrochee, puis ses pixels deformes.
##
## `lifts` est en PIXELS (les coins multiplies par la hauteur d'un palier).
## `sides` dit de quels cotes la bande doit pendre — vers la mer, le rivage est
## le bord et pas une falaise, donc on n'y pend rien.
static func ramp_texture(src: Texture2D, lifts: Array, rock: Texture2D,
		band_rows: int, sw: bool, se: bool) -> Texture2D:
	# Une AtlasTexture repond le RID de SA PLANCHE : sans la region, deux
	# cases du meme jeu blob partageraient une entree du cache.
	var region := (src as AtlasTexture).region if src is AtlasTexture else Rect2()
	var key := "%d@%s:%d,%d,%d,%d:%d:%d:%s%s" % [
		src.get_rid().get_id(), region, lifts[0], lifts[1], lifts[2], lifts[3],
		band_rows, rock.get_rid().get_id() if rock != null else 0,
		"1" if sw else "0", "1" if se else "0"]
	if _cache.has(key):
		return _cache[key]

	var img := src.get_image()
	if img == null:
		return src
	img = img.duplicate()
	img.convert(Image.FORMAT_RGBA8)

	var rows: int = band_rows
	for l in lifts:
		rows = maxi(rows, int(l))
	if rock != null and rows > 0 and (sw or se):
		var rock_img := rock.get_image()
		if rock_img != null:
			rock_img = rock_img.duplicate()
			rock_img.convert(Image.FORMAT_RGBA8)
			img = _ensure_band(img, rows, rock_img, sw, se)

	img = _warp_to_ramp(img, lifts)
	var out := ImageTexture.create_from_image(img)
	_cache[key] = out
	return out


## RACCROCHE `rows` DE ROCHER sous les deux bords bas de la case.
##
## Les feuilles livrees sont INEGALES : les palettes de plateau portent une
## bande de six rangees sous chaque tuile, la palette au niveau de la mer AUCUNE
## (son bord est la plage, pas une falaise). Une rampe en veut une quelle que
## soit sa palette : la ou elle rencontre une FALAISE le long du meme bord, son
## coin leve laisse un COIN OUVERT sous son bord bas, et la bande est ce qui le
## remplit.
##
## ON PEND DEPUIS LA DERNIERE RANGEE PEINTE, pas depuis le bord calcule : l'art
## peint environ 42 des 44 px et s'arrete une rangee avant la formule sur ses
## cotes. Une bande pendue depuis la formule laissait cette rangee ouverte — une
## FENTE D'UN PIXEL de mer le long de chaque rampe qui rencontrait une voisine
## plate. C'est exactement le symptome qu'on avait.
static func _ensure_band(src: Image, rows: int, rock: Image, sw: bool, se: bool) -> Image:
	var out := src.duplicate()
	var h := src.get_height()
	for col in range(DIAMOND_W):
		# Vers la mer, le rivage est le bord : on n'y pend rien.
		var keep := sw if col < DIAMOND_W / 2 else se
		if not keep:
			continue
		var x := OX + col
		var edge := edge_y(col)

		var last := -1
		var start := mini(h, edge + rows + 1) - 1
		for y in range(start, OY - 1, -1):
			if out.get_pixel(x, y).a > 0.0:
				last = y
				break
		if last < 0:
			continue

		var shade := FACE_SHADE_SW if col < DIAMOND_W / 2 else FACE_SHADE_SE
		for y in range(last + 1, mini(edge + rows + 1, h)):
			# La face est cuite a la largeur du losange dans la meme boite de
			# 64, donc la meme colonne sert ; la rangee est la profondeur de la
			# bande.
			var ry := mini(rock.get_height() - 1, y - last - 1)
			var c := rock.get_pixel(x, ry)
			if c.a == 0.0:
				continue
			out.set_pixel(x, y, Color(c.r * shade, c.g * shade, c.b * shade, c.a))
	return out


## LA DEFORMATION ELLE-MEME.
##
## Chaque pixel de sortie cherche la rangee SOURCE qui se deplace sur lui : on
## balaie vers le bas jusqu'au lift maximal et on garde celle dont la hauteur
## de facette ramene le plus pres. C'est une recherche et non une formule
## inverse parce que le deplacement n'est pas inversible analytiquement — la
## facette change selon le cote de la diagonale ou l'on tombe.
static func _warp_to_ramp(src: Image, lifts: Array) -> Image:
	var w := src.get_width()
	var h := src.get_height()
	var out := Image.create_empty(w, h, false, Image.FORMAT_RGBA8)
	out.fill(Color(0, 0, 0, 0))

	var n: float = float(lifts[0])
	var e: float = float(lifts[1])
	var s: float = float(lifts[2])
	var west: float = float(lifts[3])
	var max_lift: int = int(maxf(maxf(n, e), maxf(s, west)))
	var cx := TILE / 2.0
	var cy := TILE / 2.0

	# On coupe le long de la diagonale dont les BOUTS S'ACCORDENT : haut-bas
	# quand ils le font (ou quand aucune paire ne le fait), gauche-droite sinon.
	var cut_tb := is_equal_approx(n, s) or not is_equal_approx(e, west)

	for Y in range(h):
		for X in range(w):
			var best := -1
			var best_err := INF
			var best_u := 0.0
			var best_v := 0.0
			for ys in range(Y, mini(Y + max_lift + 2, h)):
				var sx := float(X) + 0.5 - cx
				var sy := float(ys) + 0.5 - cy
				var u := sx / DIAMOND_W + sy / DIAMOND_H + 0.5
				var v := sy / DIAMOND_H - sx / DIAMOND_W + 0.5
				var f := _facet(u, v, n, e, s, west, cut_tb)
				var err: float = absf(float(ys) - float(f[0]) - float(Y))
				if err < best_err:
					best_err = err
					best = ys
					best_u = u
					best_v = v
			if best < 0 or best_err > 0.75:
				continue
			var c := src.get_pixel(X, best)
			if c.a == 0.0:
				continue

			# OMBRE PAR LA PENTE DE SA FACETTE. Le rocher et tout ce qui est
			# hors du losange gardent leur couleur.
			var k := 1.0
			if best_u >= 0.0 and best_u <= 1.0 and best_v >= 0.0 and best_v <= 1.0:
				var f := _facet(best_u, best_v, n, e, s, west, cut_tb)
				var g: float = sqrt(float(f[1]) * float(f[1]) + float(f[2]) * float(f[2]))
				if g > 0.0:
					# La normale de la facette, partie horizontale, en direction
					# unitaire : elle pointe VERS LE BAS DE LA PENTE.
					var nx: float = -f[1] / g
					var ny: float = -f[2] / g
					k = SLOPE_SHADE - SLOPE_FACING * (nx + ny) + SLOPE_SIDE * (nx - ny)
			out.set_pixel(X, Y, Color(c.r * k, c.g * k, c.b * k, c.a))
	return out


## LA HAUTEUR ET LE GRADIENT de la facette sous (u, v).
##
## Un losange se decoupe en DEUX triangles, et lequel depend de la diagonale
## choisie : c'est ce qui fait qu'un coin mitre se pose entre ses deux voisins
## au lieu de faire une bosse.
static func _facet(u0: float, v0: float, n: float, e: float, s: float,
		w: float, cut_tb: bool) -> Array:
	var u := clampf(u0, 0.0, 1.0)
	var v := clampf(v0, 0.0, 1.0)
	if cut_tb:
		# Diagonale haut-bas (u = v). A droite d'elle vit le coin droit.
		if u >= v:
			return [n + (e - n) * u + (s - e) * v, e - n, s - e]
		return [n + (s - w) * u + (w - n) * v, s - w, w - n]
	# Diagonale gauche-droite (u + v = 1). Au-dessus d'elle vit le coin haut.
	if u + v <= 1.0:
		return [n + (e - n) * u + (w - n) * v, e - n, w - n]
	return [s + (s - w) * (u - 1.0) + (s - e) * (v - 1.0), s - w, s - e]
