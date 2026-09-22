extends RefCounted
class_name Autotile
## LE CHOIX DE LA TUILE D'APRES SES VOISINES.
##
## Porte de src/game/island/autotile.ts, qui dit de lui-meme etre « la seule
## piece de l'ile qui soit de l'arithmetique pure, donc la seule qui se teste
## sans moteur de rendu ». Ce portage garde cette propriete : aucun noeud,
## aucune texture, rien que des entiers.
##
## LE JEU « BLOB » DE QUATRE DE LARGE. Les feuilles Tiny Swords rangent seize
## combinaisons dans une grille 4x4 : la COLONNE est choisie par la presence
## d'une voisine a l'ouest et a l'est, la RANGEE par le nord et le sud.
##
##      col 0 = bord ouest   col 1 = milieu   col 2 = bord est   col 3 = les deux
##      rang 0 = bord nord   rang 1 = milieu  rang 2 = bord sud  rang 3 = les deux
##
## Pas de coins interieurs — c'est ce que l'art dessine, et c'est pourquoi les
## plateaux de ce pack se lisent comme des etageres carrees plutot que comme un
## littoral adouci.
##
## PIOCHER AU HASARD DANS CES SEIZE CASES EST UNE ERREUR, et elle se voit tout
## de suite : on obtient des bords de falaise au milieu d'un champ. Chaque case
## a une signification, et c'est cette fonction qui la donne.

## Les quatre voisines orthogonales d'une case, dans la meme region.
class Mask extends RefCounted:
	var n: bool
	var e: bool
	var s: bool
	var w: bool

	func _init(p_n: bool, p_e: bool, p_s: bool, p_w: bool) -> void:
		n = p_n
		e = p_e
		s = p_s
		w = p_w


## Lit une region comme un predicat. Hors bornes DOIT repondre faux, sinon les
## tuiles du pourtour croient avoir des voisines et perdent leur bord.
static func mask_at(in_region: Callable, x: int, y: int) -> Mask:
	return Mask.new(
		in_region.call(x, y - 1),
		in_region.call(x + 1, y),
		in_region.call(x, y + 1),
		in_region.call(x - 1, y)
	)


## La colonne : 1 quand la case est encadree, 0 ou 2 sur un bord, 3 quand elle
## est large d'une seule case.
static func blob_col(m: Mask) -> int:
	if m.w and m.e:
		return 1
	if m.e:
		return 0
	if m.w:
		return 2
	return 3


## La rangee, sur le meme principe en vertical.
static func blob_row(m: Mask) -> int:
	if m.n and m.s:
		return 1
	if m.s:
		return 0
	if m.n:
		return 2
	return 3


## LA FEUILLE D'ELEVATION EST 4x8, PAS 4x4.
##
## Ses rangees de SURFACE sont 0, 1 et 2, et le cas « haut d'une seule case »
## est relegue en rangee 4 — parce que les rangees 3 et 5 portent les FACES DE
## FALAISE qui vont sous chacun de ces deux cas.
const ELEVATION_SURFACE_ROW := {0: 0, 1: 1, 2: 2, 3: 4}
