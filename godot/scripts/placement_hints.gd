extends Node2D
class_name PlacementHints
## LES LOSANGES DE PLACEMENT — « ici, tu peux ».
##
## Porte de src/game/scenes/BurrowScene.ts (buildBoard) et de
## src/game/services/TileTextures.ts.
##
## MONTRES SEULEMENT PENDANT QU'ON POSE. Le reste du temps cet ecran est une
## IMAGE DE CHEZ SOI, pas une grille. Une ferme quadrillee en permanence se lit
## comme un editeur de niveau, et le terrier doit d'abord se lire comme un lieu.
##
## LE CORPS PLEIN PLUTOT QUE LE CONTOUR, et c'est la lecon la plus chere du
## fichier. Le contour — 30 % de blanc plus un trait de 2 px — est superbe sur
## l'eau libre et DISPARAIT COMPLETEMENT sur une prairie ensoleillee. Or un
## pillard se tient sur l'herbe, pas sur l'eau. Le web l'a appris deux fois :
## une premiere au placement (« le premier essai a 16 % de blanc disparaissait
## simplement dans l'herbe »), une seconde sur les cases franchissables d'un
## raid. Le fond est du pixel art charge dans les MEMES VERTS : une cible qu'on
## ne voit pas est une cible qu'on ne peut pas choisir, et c'est toute
## l'interaction.
##
## D'ou : un losange PLEIN, teinte, a 42 % — assez pour se detacher, assez peu
## pour qu'on voie encore le sol qu'on choisit.

## LE LOSANGE EST CUIT UNE FOIS, pas dessine a chaque image.
##
## 19 cases sur 19 font 361 losanges ; un Polygon2D par case coute 361 noeuds
## et autant d'appels de dessin. Une seule texture, posee dans 361 Sprite2D,
## se groupe par le moteur.
##
## L'INSET DE 0,88 EST DELIBEREMENT CONSERVE : c'est lui qui laisse le cheveu
## entre deux cases voisines, et sans lui la grille devient un aplat continu ou
## l'on ne distingue plus une case de sa voisine.
const INSET := 0.88

## LES TEINTES, et le fait qu'aucune n'est choisie a l'oeil.
##
## Chaque couleur de ce plateau veut deja dire quelque chose, et en ajouter une
## cinquieme pour le meme geste serait un second langage visuel :
##
##   • BLEU  = « tu pourrais poser ici »
##   • OR    = « celle-ci est a toi si tu cliques » — la couleur que porte
##             deja un piege pose, et celle du ghost qui se tient dessus
##   • ROUGE = « ceci defait quelque chose » : un clic RELEVE cette bombe
##   • ORANGE= le paillasson, les cases qu'un pillard traverse avant qu'une
##             bombe puisse etre sous lui
const PLACEABLE_TINT := Color("#8fd6ff")
const PLACEABLE_ALPHA := 0.42
const HOVER_TINT := Color("#ffd45c")
const HOVER_ALPHA := 0.85
const LIFT_TINT := Color("#ff6b4a")
const DOOR_TINT := Color("#ff8a3d")
const DOORSTEP_ALPHA := 0.55

## LA DUREE DU FONDU. Les losanges ARRIVENT, ils ne clignotent pas : entrer en
## mode pose est un changement d'etat, et un changement d'etat qui claque se
## lit comme un bug d'affichage.
const FADE_SECONDS := 0.18

var map: BurrowMap
var terrain: BurrowTerrain

var _hints: Dictionary = {}
var _shown := false
var _hovered := Vector2i(-1, -1)
var _fade: Tween

static var _diamond: ImageTexture


## Construit un losange par case de terre. Invisibles jusqu'a `show_hints`.
func build() -> void:
	clear()
	if map == null or terrain == null:
		return

	for row in range(map.height):
		for col in range(map.width):
			var cell := Vector2i(col, row)
			if not map.is_land(col, row):
				continue

			var hint := Sprite2D.new()
			hint.texture = _diamond_texture()
			hint.centered = true
			hint.modulate = PLACEABLE_TINT
			# INVISIBLE ET TRANSPARENT : les deux. `visible = false` seul
			# laisserait un noeud que le moteur continue de trier ; `alpha = 0`
			# seul laisserait un sprite qui repond aux clics.
			hint.modulate.a = 0.0
			hint.visible = false

			# MONTE DANS LE BLOC DE SA CASE — jamais en frere libre.
			#
			# C'est ce qui le trie AVEC le sol qu'il recouvre : sur un plateau
			# en terrasses, un losange d'une case haute est dessine avant celui
			# de la case basse qu'elle domine, exactement comme les tuiles le
			# sont. Un frere libre, lui, se trierait contre des PROFONDEURS DE
			# CASE et passerait sous la falaise d'a cote.
			#
			# Le z LOCAL vaut 2 (`Z_VEIL`), au-dessus du sol qui vaut 1 — et
			# c'est precisement le nombre que le web avait rate en ecrivant
			# 0,05, lu sur la regle du plateau : les losanges se dessinaient
			# alors SOUS l'herbe.
			if not terrain.mount_veil(cell, hint):
				continue
			_hints[cell] = hint


func clear() -> void:
	if _fade != null and _fade.is_valid():
		_fade.kill()
	# Les noeuds meurent avec leur liste — voir BurrowTerrain.clear. Ici ils
	# sont enfants des BLOCS du terrain, donc detruire le terrain les detruit
	# deja ; le dictionnaire, lui, survivrait et garderait des references
	# mortes. C'est exactement la panne des « bombes fantomes » du web.
	for hint in _hints.values():
		if is_instance_valid(hint):
			hint.queue_free()
	_hints.clear()
	_hovered = Vector2i(-1, -1)
	_shown = false


## ALLUME OU ETEINT LA GRILLE.
##
## En fondu, et sur les DEUX proprietes : un sprite invisible ne doit pas
## seulement etre transparent, il doit cesser de repondre.
func show_hints(on: bool) -> void:
	if _shown == on:
		return
	_shown = on
	if _fade != null and _fade.is_valid():
		_fade.kill()
	_fade = create_tween().set_parallel(true)
	for cell in _hints:
		var hint: Sprite2D = _hints[cell]
		if on:
			hint.visible = true
		_fade.tween_property(hint, "modulate:a", _alpha_for(cell) if on else 0.0,
			FADE_SECONDS)
	if not on:
		_fade.chain().tween_callback(_hide_all)


func _hide_all() -> void:
	for hint in _hints.values():
		hint.visible = false


## LA CASE SOUS LE DOIGT — celle qui montre ce qu'elle VA DEVENIR.
##
## L'OR N'EST PAS UN BLEU PLUS VIF, et c'est la raison d'etre de la couleur :
## bleu dit « tu pourrais », or dit « celle-ci est a toi si tu cliques ». Le
## ghost de bombe qui se tiendra dessus racontera la meme chose.
func set_hovered(cell: Vector2i) -> void:
	if _hovered == cell:
		return
	var was := _hovered
	_hovered = cell
	for c in [was, cell]:
		if _hints.has(c):
			var hint: Sprite2D = _hints[c]
			hint.modulate = _tint_for(c)
			hint.modulate.a = _alpha_for(c) if _shown else 0.0


func _tint_for(cell: Vector2i) -> Color:
	if cell == _hovered:
		return HOVER_TINT
	return PLACEABLE_TINT


func _alpha_for(cell: Vector2i) -> float:
	if cell == _hovered:
		return HOVER_ALPHA
	return PLACEABLE_ALPHA


## LE LOSANGE, cuit une fois pour toutes.
##
## Dessine A LA MAIN dans une Image plutot que par un Polygon2D : on veut des
## pixels francs, sans anticrenelage — le reste du plateau est du pixel art, et
## un bord adouci sur une grille de pixel art se voit comme une tache.
##
## LE TEST EST CELUI DU LOSANGE : |dx|/hw + |dy|/hh <= 1. C'est l'equation de
## la tuile elle-meme, donc le voile epouse exactement la forme du sol.
static func _diamond_texture() -> ImageTexture:
	if _diamond != null:
		return _diamond
	var w := int(Iso.BURROW_TILE_W * INSET)
	var h := int(Iso.BURROW_TILE_H * INSET)
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var hw := w * 0.5
	var hh := h * 0.5
	for y in range(h):
		for x in range(w):
			# +0.5 : on teste le CENTRE du pixel, pas son coin. Sans ca le
			# losange sort d'un demi-pixel trop haut et trop a gauche.
			var dx := absf(x + 0.5 - hw) / hw
			var dy := absf(y + 0.5 - hh) / hh
			if dx + dy <= 1.0:
				img.set_pixel(x, y, Color(1, 1, 1, 1))
	_diamond = ImageTexture.create_from_image(img)
	return _diamond
