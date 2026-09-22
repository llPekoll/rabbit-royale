extends Node2D
class_name TileView
## LE VOILE ET LES CHIFFRES — ce qu'on voit d'une case.
##
## Porte de src/game/entities/Tile.ts, la partie qui sert le socle : le couvercle
## d'une case non creusee, et le chiffre qui dit combien de bombes la touchent.
##
## CE QUI N'EST PAS ENCORE LA : les carottes, les coffres, les cratères, le X
## rouge, les animations d'ouverture. Le socle d'abord, et il se voit.
##
## LES LOSANGES SONT MONTES DANS LES BLOCS DU TERRAIN, comme les losanges de
## placement — c'est `mount_veil` qui le fait. Un voile pose en frere libre se
## trierait entre deux profondeurs et un plateau en terrasses le montrerait
## au-dessus de la mauvaise tuile. C'est le piege que `burrow_terrain.gd`
## raconte au long, et la raison pour laquelle ce noeud ne porte presque rien
## lui-meme : il est un chef d'orchestre.

## LE COUVERCLE D'UNE CASE NON CREUSEE.
##
## Vert sombre a un tiers, pas un bleu nuit a 55 % — et le web a paye la
## difference : « navy at 55% over the generated grass turned the whole board a
## bruised olive checkerboard: the ground the island is drawn to show was the
## least legible thing on it ». Un tiers de vert sombre se lit comme DE L'HERBE
## DANS L'OMBRE, ce qui dit « pas encore creuse » sans effacer le terrain.
const FOG_COLOR := Color("#10241a")
##
## 0,45 ET PAS LE 0,32 DU WEB. Son chiffre est regle contre un fond PEINT, plus
## sombre et plus charge ; sur le terrain genere de ce portage — un vert clair
## et uniforme — un tiers se voyait a peine et la difference entre une case
## creusee et une case enterree se devinait au lieu de se lire. Meme famille que
## les tailles de l'eau et du ciel : garder l'intention du web (« l'herbe dans
## l'ombre », surtout pas une tache), re-mesurer le chiffre sur l'ecran reel.
const FOG_ALPHA := 0.45

## CE QU'UNE CASE INDICEE GARDE DE SON COUVERCLE.
##
## Assez pour se lire comme non creusee a cote d'une case creusee, assez peu
## pour se lire comme CONNUE a cote d'une case enterree. Trois etats, trois
## opacites — c'est ce qui fait qu'on lit le plateau d'un coup d'oeil.
const HINTED_SHARE := 0.45

## LES TEINTES DES CHIFFRES, une par compte.
##
## Reprises telles quelles du web (`HINT_TINTS`). Un 1 bleu, un 2 vert, un 3
## rouge : le joueur apprend la couleur avant le glyphe, et c'est ce qui rend un
## plateau lisible en diagonale.
const TINTS := [
	Color("#ffffff"), Color("#4aa3ff"), Color("#3ecf7f"), Color("#ff6b6b"),
	Color("#b46bff"), Color("#ffb03a"), Color("#3ecfcf"), Color("#dddddd"),
	Color("#888888"),
]

## LA TAILLE DU CHIFFRE, en pixels de police.
##
## Un losange fait 44x24 : a 16 le glyphe occupait les deux tiers de la hauteur
## d'une case et se lisait comme pose DESSUS plutot que dedans. 11 le rend a sa
## place — assez grand pour se lire a la volee, assez petit pour que le sol
## respire autour.
const HINT_SIZE := 11

## LA PROFONDEUR DANS LE BLOC. Le sol d'un bloc est a 1 ; le voile se pose donc
## au-dessus (2), et le chiffre au-dessus de lui (3).
##
## C'est le piege n°31 du web, raconte dans `burrow_terrain.gd` : les losanges
## livres a 0,05 — un chiffre lu sur la regle du PLATEAU et non sur celle de
## l'interieur d'un bloc — se sont retrouves dessines SOUS l'herbe. « visibles »
## pour chaque sonde, invisibles pour l'oeil.
const Z_FOG := 2
const Z_HINT := 3

var board: IslandBoard
var terrain: BurrowTerrain

var _fog: Dictionary = {}
var _hints: Dictionary = {}

static var _diamond: ImageTexture


func build() -> void:
	clear()
	if board == null or terrain == null:
		return

	# UN SEUL MATERIAU POUR TOUS LES CHIFFRES : le mode de fusion est le meme
	# partout, et en donner un par Label multiplierait les changements d'etat du
	# rendu pour rien.
	var mult := CanvasItemMaterial.new()
	mult.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL

	for cell in board.playable():
		if not terrain.has_block(cell):
			continue

		var fog := Sprite2D.new()
		fog.texture = _diamond_texture()
		fog.centered = true
		fog.modulate = FOG_COLOR
		terrain.mount_veil(cell, fog, Z_FOG)
		_fog[cell] = fog

		var label := Label.new()
		label.add_theme_font_size_override("font_size", HINT_SIZE)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		# `size` ET PAS SEULEMENT `custom_minimum_size`, et c'est ce qui a fait
		# deriver les chiffres au premier essai : sans taille EXPLICITE, un
		# Label se dimensionne sur son contenu, donc le centrage porte sur une
		# boite plus petite que la case et le glyphe sort en haut a droite de
		# son losange. Sur la capture du Seeker ils flottaient a cote du sol au
		# lieu d'etre poses dessus.
		var box := Vector2(Iso.BURROW_TILE_W, Iso.BURROW_TILE_H)
		label.custom_minimum_size = box
		label.size = box
		label.position = -box * 0.5
		label.z_index = Z_HINT
		label.material = mult
		# LE FOND DU LABEL DOIT ETRE TRANSPARENT, sinon MULTIPLY assombrit
		# TOUTE SA BOITE et pas le glyphe : sur la capture, chaque chiffre
		# sortait comme un losange vert sombre. Un Label porte un StyleBox de
		# theme — invisible en fusion normale, fatal en multiply, ou le
		# transparent n'est pas neutre.
		var clear := StyleBoxEmpty.new()
		label.add_theme_stylebox_override("normal", clear)
		var holder := Node2D.new()
		holder.add_child(label)
		# LE CHIFFRE EST COUCHE SUR LE LOSANGE, ET RENDU EN MULTIPLY.
		#
		# COUCHE : ses deux axes suivent les diagonales de la tuile — (22, 12) et
		# (-22, 12) — donc il partage les lignes de fuite du sol et se tient DANS
		# l'image au lieu d'etre pose dessus. C'est le skew du web
		# (`HINT_SKEW_X/Y`), derive plutot que trouve a l'oeil.
		#
		# MULTIPLY, ET C'EST CE QUI LE REND LISIBLE UNE FOIS COUCHE. Premier essai,
		# incline mais OPAQUE : le glyphe aplati devenait un trait bleu franc qu'on
		# ne lisait plus comme un chiffre. Multiplie, il TEINTE l'herbe au lieu de
		# la couvrir — le sol transparait a travers, la forme reste. Paul : « met le
		# en multiply ca ira tres bien ». Le web multiplie ses comptes pour la meme
		# raison.
		terrain.mount_veil(cell, holder, Z_HINT)
		# APRES `mount_veil` : son contrat ECRASE la position du noeud avec le
		# centre du losange, donc une matrice posee avant serait effacee. On garde
		# son origine et on n'incline que les deux axes.
		holder.transform = Transform2D(
			Vector2(Iso.half_w(), Iso.half_h()) / Iso.half_w(),
			Vector2(-Iso.half_w(), Iso.half_h()) / Iso.half_w(),
			holder.position)
		_hints[cell] = label

	refresh()


## RELIT TOUT LE PLATEAU. Appelable a chaque coup : vingt-huit cases, c'est
## moins cher que de tenir une liste de ce qui a change.
func refresh() -> void:
	if board == null:
		return
	for cell in _fog:
		var fog: Sprite2D = _fog[cell]
		var st = board.state.get(cell)
		if st == IslandBoard.State.DUG:
			fog.modulate.a = 0.0
		elif st == IslandBoard.State.HINTED:
			fog.modulate.a = FOG_ALPHA * HINTED_SHARE
		else:
			fog.modulate.a = FOG_ALPHA

		var label: Label = _hints[cell]
		if board.shows_number(cell):
			var n: int = board.adjacent[cell]
			label.text = str(n)
			label.add_theme_color_override("font_color", TINTS[mini(n, TINTS.size() - 1)])
			label.visible = true
		else:
			label.visible = false


func clear() -> void:
	for cell in _fog:
		(_fog[cell] as Node).queue_free()
	for cell in _hints:
		var l: Label = _hints[cell]
		if l.get_parent() != null:
			l.get_parent().queue_free()
	_fog.clear()
	_hints.clear()


## LE LOSANGE, cuit une fois — le meme que les losanges de placement.
##
## Dessine a la main dans une Image plutot que par un Polygon2D : on veut des
## pixels francs, sans anticrenelage. Le reste du plateau est du pixel art, et
## un bord adouci sur une grille de pixel art se voit comme une tache.
static func _diamond_texture() -> ImageTexture:
	if _diamond != null:
		return _diamond
	var w := Iso.BURROW_TILE_W
	var h := Iso.BURROW_TILE_H
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var hw := w * 0.5
	var hh := h * 0.5
	for y in range(h):
		for x in range(w):
			# +0,5 : on teste le CENTRE du pixel, pas son coin. Sans ca le
			# losange sort d'un demi-pixel trop haut et trop a gauche.
			var dx := absf(x + 0.5 - hw) / hw
			var dy := absf(y + 0.5 - hh) / hh
			if dx + dy <= 1.0:
				img.set_pixel(x, y, Color(1, 1, 1, 1))
	_diamond = ImageTexture.create_from_image(img)
	return _diamond
