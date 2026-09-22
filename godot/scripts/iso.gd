extends RefCounted
class_name Iso
## LA PROJECTION ISOMETRIQUE, et rien d'autre.
##
## Portee de src/config/burrowConfig.ts. Un fichier a part parce que l'ile, le
## terrier, le raid et le tutoriel projettent tous de la meme facon : seules
## les dimensions de leur grille changent. Dupliquer ces quatre lignes quatre
## fois, c'est se garantir qu'une correction n'en atteindra que trois.
##
## LA LOSANGE. Une tuile est un diamant deux fois plus large que haut : on
## avance d'une demi-largeur vers la droite quand la colonne monte, d'une
## demi-largeur vers la gauche quand la rangee monte, et d'une demi-hauteur
## vers le bas dans les deux cas. D'ou (col - row) sur x et (col + row) sur y.

## Le terrier : 19x19 cases de 44x24 pixels.
##
## L'ILE FAIT 32x32 AVEC LA MEME TUILE DE 44x24 (gridConfig.ts:27-40) — elle
## est plus GRANDE, pas plus grosse. Ce commentaire a d'abord annonce du 16x16
## en 88x48, « le double », ce qui etait faux dans les deux nombres : une ile
## batie la-dessus aurait eu le quart des cases et des tuiles deux fois trop
## grandes. Verifie dans la source le 2026-09-22.
##
## Seules les DIMENSIONS DE GRILLE changent donc entre les deux plateaux ; la
## projection, le lift de palier (6 des deux cotes) et l'echelle du lapin (1.5)
## sont partages. C'est ce qui permet a ce fichier de servir les deux.
const BURROW_COLS := 19
const BURROW_ROWS := 19
const BURROW_TILE_W := 44
const BURROW_TILE_H := 24

## L'ORIGINE DU TERRIER, en coordonnees du monde.
##
## `y` est PLUS HAUT que le centre, et c'est voulu : une tuile surelevee pousse
## vers le haut depuis sa case, donc un plateau centre sur sa projection a plat
## se retrouve trop bas des qu'il a des paliers.
const BURROW_ORIGIN := Vector2(480, 96)

## ⚠ LES QUATRE CONSTANTES CI-DESSUS SONT CELLES DU TERRIER, ET RIEN QUE LUI.
##
## Elles servent de VALEURS PAR DEFAUT aux fonctions de ce fichier, ce qui est
## commode et a coute cher : pendant tout le portage du terrier, aucun appelant
## n'a jamais rien passe, parce que le defaut etait toujours juste. Le jour ou
## l'ile est arrivee — 32x32, une autre origine — elle a herite en silence de la
## grille du terrier. Mesure le 2026-09-22 : `BurrowPick` ne retrouvait que
## 324 des 1024 cases, exactement le coin 18x18 qui tient dans la borne 19x19.
## Les 700 autres etaient MUETTES AU DOIGT, et pas une ligne n'avait l'air
## fausse.
##
## LA REGLE, DEPUIS : la grille et l'origine sont portees par la CARTE
## (`BurrowMap.width/height/origin`) et passees explicitement. Un appel sans
## origine est un appel qui parle du terrier ; partout ailleurs, c'est un bug
## qui ne se verra que sur l'appareil.


static func half_w() -> float:
	return BURROW_TILE_W * 0.5


static func half_h() -> float:
	return BURROW_TILE_H * 0.5


## Une case vers un point a l'ecran, a plat.
static func project(col: int, row: int, origin: Vector2 = BURROW_ORIGIN) -> Vector2:
	return Vector2(
		origin.x + float(col - row) * half_w(),
		origin.y + float(col + row) * half_h()
	)


## LA PROFONDEUR D'UNE TUILE — la diagonale qui s'eloigne de la camera.
##
## Multipliee par 16 pour laisser de la place au palier entre deux cases : une
## tuile et l'arbre pose dessus doivent se trier sur LA MEME regle, sinon un
## rocher proche passe derriere une falaise lointaine. Ils sont freres dans un
## seul conteneur trie, et c'est ce qui rend l'ordre correct sans y penser.
static func depth(col: int, row: int) -> int:
	return (col + row) * 16


## UN POINT A L'ECRAN VERS UNE CASE, a plat.
##
## L'inverse de `project` au palier zero. Sur un terrain en terrasses, ca
## repond la case que le point toucherait si le sol etait plat — ce qui n'est
## pas ce que voit l'oeil. La scene devra parcourir les paliers du haut vers le
## bas, comme le fait le regard, et c'est pour ca que cette fonction n'est
## qu'une brique et pas la reponse.
static func unproject(point: Vector2, cols: int = BURROW_COLS, rows: int = BURROW_ROWS,
		origin: Vector2 = BURROW_ORIGIN) -> Vector2i:
	var d := point - origin
	var col := int(round((d.x / half_w() + d.y / half_h()) * 0.5))
	var row := int(round((d.y / half_h() - d.x / half_w()) * 0.5))
	if col < 0 or col >= cols or row < 0 or row >= rows:
		return Vector2i(-1, -1)
	return Vector2i(col, row)


## L'index d'une case dans la grille, et son inverse.
static func index(col: int, row: int, cols: int = BURROW_COLS) -> int:
	return row * cols + col


static func cell(idx: int, cols: int = BURROW_COLS) -> Vector2i:
	return Vector2i(idx % cols, idx / cols)
