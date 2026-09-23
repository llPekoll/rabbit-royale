extends Node2D
class_name TileView
## LE VOILE ET LES CHIFFRES — ce qu'on voit d'une case.
##
## Porte de src/game/entities/Tile.ts, la partie qui sert le socle : le couvercle
## d'une case non creusee, et le chiffre qui dit combien de bombes la touchent.
##
## CE QU'UNE CASE CREUSEE MONTRE (Tile.ts `revealContent`) : la carotte sort
## et se ramasse d'un meme geste — creuser une carotte, c'est la prendre ; la
## bombe se montre puis laisse un cratere ; le coffre pris s'envole. Pas
## encore : la carotte doree, l'eclat et la poutre des coffres d'une vraie
## ile — la lecon n'en a pas.
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
## Le X rouge par-dessus tout : il annote une case ENTERREE, donc il couvre
## son voile, et rien ne doit passer devant.
const Z_X := 4

## LE X ROUGE — `Tile.setFlag` du web, trait pour trait : deux traits epais
## a bord sombre, bouts ronds, ecrases a la proportion du losange (1.5 x 0.75)
## pour qu'il soit COUCHE sur le sol et non debout dessus. Il doit se lire
## d'un bout du plateau a l'autre comme « pas la », sur l'herbe comme sur le
## sable. La premiere version etait une croix de pixels de deux de large : elle
## se lisait comme un trait de grille.
##
## Les mesures du web sont en unites de SA tuile (HALF_H = 12) ; celle d'ici a
## la meme demi-hauteur, donc les chiffres passent tels quels.
const X_RED := Color("#ff5a4a")
const X_EDGE := Color("#3a0d0d")
const X_REACH := 0.62
const X_EDGE_WIDTH := 7.0
const X_RED_WIDTH := 4.0
const X_SQUASH := Vector2(1.5, 0.75)
## L'arrivee (`back.out(3)`, 0,3 s) : le X claque en place.
const X_POP_SECONDS := 0.3

## LE BATTEMENT DE LA CASE ENSEIGNEE, en secondes — le meme que le bouton du
## web (`TEACH_BEAT_SECONDS`, 0,9 s) : c'est la cadence commune qui lie le
## bouton et la case, ce qu'une legende qui les nomme tous deux ne peut pas.
const TEACH_BEAT_SECONDS := 0.9
const GHOST_LOW := 0.2
const GHOST_HIGH := 0.75

## LE COFFRE — l'atlas `loot-box` du web (public/assets/fx), ses cinq frames
## d'attente (`highlight`, 23x14, 100 ms chacune), a CHEST_SCALE comme la-bas :
## une ECHELLE sur les pixels natifs, jamais une largeur cible, parce que
## l'atlas rogne chaque frame a son contenu.
const CHEST_SHEET := preload("res://assets/fx/loot-box.png")
const CHEST_FRAMES: Array[Rect2] = [
	Rect2(0, 0, 23, 14), Rect2(23, 0, 23, 14), Rect2(46, 0, 23, 14),
	Rect2(0, 14, 23, 14), Rect2(23, 14, 23, 14),
]
const CHEST_SCALE := 1.25
const CHEST_FPS := 10.0
## De combien le pied du coffre descend sous le centre du losange, pour que la
## boite se lise POSEE dans la case et non flottant sur son bord haut.
const CHEST_SIT := 4.0

## LA FLECHE PLANTEE SUR LE COFFRE — fx/ChestPointer.ts : le chevron du kit
## (`d8-arrow-down.png`, 22x25), le meme or, le meme battement que celle du
## terrier. ANCREE A SA POINTE, qui est ce avec quoi une fleche pointe : ancree
## au centre, le battement enfoncerait la pointe dans le couvercle.
##
## LA HAUTEUR EST EN DEMI-CASES, pas en pixels : le groupe vit dans le monde mis
## a l'echelle par la camera. « Deliberement PRES de la boite » — sous le mot
## du palier elle semblait pointer le mot ; au-dessus, elle sortait de l'ecran.
## Sur l'ile du tutoriel le mot s'efface pour elle (`Tile.hideChestTier`).
const ARROW := preload("res://assets/ui/d8-arrow-down.png")
const ARROW_TINT := Color("#ffd45c")
const ARROW_LIFT := 2.4
const ARROW_SCALE := 0.7
const ARROW_BOB := 5.0
const ARROW_BOB_SECONDS := 0.9

## L'ILE DU TUTORIEL : la fleche se plante sur le coffre, et le mot du palier
## lui laisse la place. Pose par l'ile avant `build`.
var tutorial := false

## LES BUISSONS DU PACK (public/assets/deco/bushes), ceux de CETTE carte —
## island/tileset.ts : huit images de 128 dans une bande de 1024x128, le pied a
## y=79, mesure comme chaque nombre de ce fichier. Ils se balancent a
## DEFAULT_FRAME_MS par image. Pas ceux de world/decor, qui sont l'autre carte.
const BUSHES: Array[Texture2D] = [
	preload("res://assets/deco/bushes/bushe1.png"),
	preload("res://assets/deco/bushes/bushe2.png"),
	preload("res://assets/deco/bushes/bushe3.png"),
	preload("res://assets/deco/bushes/bushe4.png"),
]
const BUSH_FRAME := 128
const BUSH_FRAMES := 8
const BUSH_FOOT_PX := 79.0
const BUSH_FRAME_MS := 130.0
## L'echelle des decors de l'ile : `DECO_SCALE = 0.4` de
## services/TerrainBackground.ts, reprise telle quelle — un buisson de 128 px
## fait une case et demie de haut. (Le terrier a la sienne, 0,44, voir
## burrow_props.gd.)
const BUSH_SCALE := 0.4

## LE HALO, L'ANNEAU, L'OMBRE, LE FAISCEAU, LES PARTICULES, LE MOT — tout ce
## que Tile.ts pose autour d'un coffre, par palier (CHEST_TIER_FLAIR). Le
## tutoriel distribue le premier palier : BRONZE.
##
## DELIBEREMENT BRUYANT : « le coffre doit se reperer depuis l'autre bout d'une
## ile de 36 cases sur de l'herbe pixel-art chargee, et la premiere passe — un
## faisceau de 7 px a 22 % — etait invisible a la taille ou le jeu dessine le
## plateau. Tout ce qui est subtil ici se lit comme rien du tout. »
const CHEST_TIER := "bronze"
const CHEST_TIER_COLOR := {
	"bronze": Color("#b87333"), "silver": Color("#c9d3dd"),
	"gold": Color("#ffd54f"), "crown": Color("#ba68c8"),
}
const CHEST_FLAIR := {
	"bronze": {"beam": 26.0, "width": 11.0, "motes": 3, "glow": 0.75},
	"silver": {"beam": 40.0, "width": 13.0, "motes": 5, "glow": 0.85},
	"gold": {"beam": 58.0, "width": 15.0, "motes": 7, "glow": 0.95},
	"crown": {"beam": 78.0, "width": 18.0, "motes": 10, "glow": 1.0},
}
const CHEST_SHADOW_ALPHA := 0.32
## L'eclat : l'animation jouee UNE fois, sur horloge — un scintillement permanent
## cesse de se lire comme un evenement. Entre 4,5 et 8 s ; a 21 i/s (0,35 par
## tick de 60 sur le web).
const CHEST_SHINE_EVERY := Vector2(4.5, 8.0)
const CHEST_SHINE_FPS := 21.0
## La secousse : toutes les 2,6 a 5,5 s, ±2 px et ±0,05 rad en un quart de
## seconde.
const CHEST_SHAKE_EVERY := Vector2(2.6, 5.5)

## Au-dessus du X et de l'anneau (5-6) : ce qui SE TIENT sur la case.
const Z_PROP := 7
const Z_ARROW := 8

## LA CAROTTE D'UNE CASE (le kit d'arcade, 13x29), a 0,7, pied au sol, un peu
## relevee ; son ombre de contact dessous. `CARROT_POP` est la montee depuis
## le sol, `CARROT_RISE` l'envol une fois prise.
const CARROT := preload("res://assets/fx/carrot-tile.png")
const CARROT_SCALE := 0.7
const CARROT_REST_Y := -6.0
const CARROT_POP := 12.0
const CARROT_RISE := 26.0
const SHADOW_ALPHA := 0.3

## LA BOMBE DECOUVERTE, a 20 pixels de large, puis son cratere : un bord brun
## et un fond presque noir, sous le X (le cratere est dans le sol).
const BOMB := preload("res://assets/ui/icons/bomb.png")
const BOMB_W := 20.0
const CRATER_RIM := Color(0x1a / 255.0, 0x10 / 255.0, 0x0a / 255.0, 0.55)
const CRATER_PIT := Color(0x05 / 255.0, 0x03 / 255.0, 0x02 / 255.0, 0.75)
const Z_CRATER := 3

var board: IslandBoard
var terrain: BurrowTerrain

var _fog: Dictionary = {}
var _hints: Dictionary = {}
var _x: Dictionary = {}
var _chest: Dictionary = {}
var _arrow: Dictionary = {}
## Tout ce qui entoure un coffre, par case : le porteur qu'on cache d'un coup.
var _flair: Dictionary = {}
var _props: Array[Node] = []
var _bobs: Array[Tween] = []
var _timers: Array[SceneTreeTimer] = []
var _rng := RandomNumberGenerator.new()

## Les cases deja vues creusees : une case qui y entre vient de s'ouvrir, et
## son contenu se joue. Pas au premier dessin — un plateau repris n'ouvre rien.
var _dug := {}
var _primed := false

## LA CASE QUI BAT — le X fantome de la lecon, ou (-1,-1).
var _pulsed := Vector2i(-1, -1)
var _pulse: Tween

static var _diamond: ImageTexture


func build() -> void:
	clear()
	if board == null or terrain == null:
		return

	for cell in board.playable():
		if not terrain.has_block(cell):
			continue

		var fog := Sprite2D.new()
		fog.texture = _diamond_texture()
		fog.centered = true
		fog.modulate = FOG_COLOR
		terrain.mount_veil(cell, fog, Z_FOG)
		_fog[cell] = fog

		# LE X, cache tant que la case n'est ni marquee ni enseignee. Un sprite
		# par case plutot que cree a la pose : vingt-huit sprites invisibles ne
		# coutent rien, et « montrer » est plus sur que « monter » au moment ou
		# le doigt vient de taper.
		var x := FlagMark.new()
		x.scale = X_SQUASH
		x.visible = false
		terrain.mount_veil(cell, x, Z_X)
		_x[cell] = x

		# LE CHIFFRE : UN GLYPHE CUIT, EN SPRITE, RENDU EN MULTIPLY.
		#
		# Le web multiplie ses comptes, et c'est ce qui les fait TEINTER l'herbe
		# au lieu de la couvrir. Un `Label` ne pouvait pas le faire : c'est un
		# Control avec une BOITE, et le mode MUL teintait la boite entiere —
		# chaque chiffre sortait comme un losange vert sombre. Un Sprite2D n'a de
		# pixels que la ou est le chiffre, donc seul le chiffre multiplie.
		#
		# Le glyphe est dessine a la main, 3x5 pixels doubles : des chiffres de
		# demineur en pixel art, francs, qui n'ont besoin d'aucune police et se
		# lisent en diagonale par leur couleur avant leur forme.
		var glyph := Sprite2D.new()
		glyph.centered = true
		glyph.z_index = Z_HINT
		glyph.material = _mul_material()
		glyph.visible = false
		var holder := Node2D.new()
		holder.add_child(glyph)
		# COUCHE SUR LE LOSANGE : ses deux axes suivent les diagonales de la
		# tuile — (22, 12) et (-22, 12) — donc il partage les lignes de fuite du
		# sol et se tient DANS l'image au lieu d'etre pose dessus. C'est le skew
		# du web (`HINT_SKEW_X/Y`), derive plutot que trouve a l'oeil.
		terrain.mount_veil(cell, holder, Z_HINT)
		# APRES `mount_veil` : son contrat ECRASE la position du noeud avec le
		# centre du losange, donc une matrice posee avant serait effacee. On garde
		# son origine et on n'incline que les deux axes.
		holder.transform = Transform2D(
			Vector2(Iso.half_w(), Iso.half_h()) / Iso.half_w(),
			Vector2(-Iso.half_w(), Iso.half_h()) / Iso.half_w(),
			holder.position)
		_hints[cell] = glyph

		# LE COFFRE, visible des la premiere image — « il le voit et choisit d'y
		# aller ». Au-dessus du voile : la boite n'est pas enterree, elle attend.
		if board.content.get(cell) == IslandBoard.Content.CHEST:
			_mount_chest(cell)

		# LE BUISSON : le pied sur le centre de la case, et il se balance.
		if board.decor.has(cell):
			var variant: int = int(board.decor[cell])
			var bush := AnimatedSprite2D.new()
			bush.sprite_frames = _bush_frames(variant)
			bush.centered = false
			bush.scale = Vector2(BUSH_SCALE, BUSH_SCALE)
			bush.offset = Vector2(-BUSH_FRAME * 0.5, -BUSH_FOOT_PX)
			# Chacun part d'une image differente : deux buissons qui se
			# balancent a l'unisson se lisent comme une copie.
			bush.frame = variant % BUSH_FRAMES
			bush.play("sway")
			terrain.mount_veil(cell, bush, Z_PROP)
			_props.append(bush)

	refresh()


## LE COFFRE ET TOUT CE QUI L'ENTOURE, dans l'ordre de Tile.ts `setChest` :
## le halo au sol, l'anneau, l'ombre de contact, le faisceau derriere la boite,
## la boite, les particules, le mot du palier — et la fleche du tutoriel.
##
## TOUT DANS UN PORTEUR, monte une fois dans le bloc de la case : les z_index
## des enfants sont relatifs a lui, donc l'ordre de Tile.ts se recopie tel quel
## sans se disputer avec les couches du voile.
##
## LE PALIER EST PORTE PAR LE HALO ET L'ANNEAU, jamais par une teinte sur la
## boite : une teinte MULTIPLIE l'art, deja brun-rouge sombre, et commun et
## legendaire sortaient du meme brun boueux.
func _mount_chest(cell: Vector2i) -> void:
	var tint: Color = CHEST_TIER_COLOR[CHEST_TIER]
	var flair: Dictionary = CHEST_FLAIR[CHEST_TIER]
	var holder := Node2D.new()
	terrain.mount_veil(cell, holder, Z_PROP)
	_flair[cell] = holder

	# LE HALO : presque opaque, il doit RECOUVRIR ce que porte la case (voile,
	# surbrillance), pas s'y fondre — translucide, il se lit comme la couleur du
	# sol et non comme celle du palier. Il respire ensuite entre son plein et
	# 47 % de son plein, en 0,75 s.
	var peak: float = 0.95 * float(flair["glow"])
	var glow := Sprite2D.new()
	glow.texture = _diamond_texture()
	glow.modulate = Color(tint.r, tint.g, tint.b, peak)
	glow.z_index = 0
	holder.add_child(glow)
	var breath := create_tween().set_loops()
	breath.tween_property(glow, "modulate:a", peak * 0.47, 0.75)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	breath.tween_property(glow, "modulate:a", peak, 0.75)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_bobs.append(breath)

	# L'ANNEAU : un peu plus large que le losange, pour se lire comme un rebord ;
	# il s'elargit jusqu'a 1,16 et revient, en 1,1 s.
	var ring := Sprite2D.new()
	ring.texture = MoveRing._outline_texture()
	ring.modulate = tint
	ring.scale = Vector2(1.06, 1.06)
	ring.z_index = 1
	holder.add_child(ring)
	var rim := create_tween().set_loops()
	rim.tween_property(ring, "scale", Vector2(1.16, 1.16), 1.1)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	rim.tween_property(ring, "scale", Vector2(1.06, 1.06), 1.1)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_bobs.append(rim)

	# L'OMBRE DE CONTACT, sous la boite et sur le halo.
	var shadow := Sprite2D.new()
	shadow.texture = _ellipse_texture()
	shadow.modulate = Color(0, 0, 0, CHEST_SHADOW_ALPHA)
	shadow.position.y = 2
	shadow.z_index = 2
	holder.add_child(shadow)

	# LE FAISCEAU, derriere la boite : un cone dans la couleur du palier, plus un
	# coeur blanc plus clair — c'est le coeur qui le fait lire comme de la
	# LUMIERE et non comme un triangle plat. Il respire de 0,72 a 1 en 1,3 s.
	var beam_h: float = flair["beam"]
	var half: float = float(flair["width"]) * 0.5
	var beam := Node2D.new()
	beam.position.y = -6
	beam.z_index = 3
	var outer := Polygon2D.new()
	outer.polygon = PackedVector2Array([
		Vector2(-half, 0), Vector2(half, 0),
		Vector2(half * 0.45, -beam_h), Vector2(-half * 0.45, -beam_h)])
	outer.color = Color(tint.r, tint.g, tint.b, 0.5)
	beam.add_child(outer)
	var core := Polygon2D.new()
	core.polygon = PackedVector2Array([
		Vector2(-half * 0.42, 0), Vector2(half * 0.42, 0),
		Vector2(half * 0.16, -beam_h * 0.92), Vector2(-half * 0.16, -beam_h * 0.92)])
	core.color = Color(1, 1, 1, 0.28)
	beam.add_child(core)
	beam.modulate.a = 0.72
	holder.add_child(beam)
	var pulse := create_tween().set_loops()
	pulse.tween_property(beam, "modulate:a", 1.0, 1.3)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse.tween_property(beam, "modulate:a", 0.72, 1.3)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_bobs.append(pulse)

	# LA BOITE. Ancree a (0.5, 0.8) comme sur le web : le pied un peu sous le
	# centre, pour se lire POSEE dans la case.
	var chest := AnimatedSprite2D.new()
	chest.sprite_frames = _chest_frames()
	chest.centered = false
	chest.scale = Vector2(CHEST_SCALE, CHEST_SCALE)
	chest.offset = Vector2(-CHEST_FRAMES[0].size.x * 0.5, -CHEST_FRAMES[0].size.y * 0.8)
	chest.z_index = 4
	chest.stop()
	chest.frame = 0
	holder.add_child(chest)
	_chest[cell] = chest
	_schedule_shine(chest)
	_schedule_shake(chest)

	# LES PARTICULES : chacune monte sur sa propre boucle, decalee, pour qu'elles
	# ne marchent jamais au pas. Une sur trois est grande et blanche.
	for i in range(int(flair["motes"])):
		var big := i % 3 == 0
		var mote := Sprite2D.new()
		mote.texture = _square_texture(3 if big else 2)
		mote.modulate = Color(1, 1, 1, 0.9) if big else Color(tint.r, tint.g, tint.b, 0.9)
		mote.position = Vector2((_rng.randf() - 0.5) * float(flair["width"]) * 1.6, -4)
		mote.z_index = 5
		holder.add_child(mote)
		var rise := create_tween().set_loops()
		rise.tween_interval(i * 0.22 + _rng.randf() * 0.4)
		rise.tween_callback(func() -> void: mote.position.y = -4; mote.modulate.a = 0.9)
		rise.set_parallel(true)
		var secs := 1.1 + _rng.randf() * 0.8
		rise.tween_property(mote, "position:y", -beam_h * (0.8 + _rng.randf() * 0.4), secs)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		rise.tween_property(mote, "modulate:a", 0.0, secs)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		_bobs.append(rise)

	if tutorial:
		# LA FLECHE DU TUTORIEL, a la place du mot : ChestPointer.ts tel quel.
		var arrow := Sprite2D.new()
		arrow.texture = ARROW
		arrow.centered = false
		arrow.offset = Vector2(-ARROW.get_width() * 0.5, -ARROW.get_height())
		var k := Iso.half_w() * ARROW_SCALE / float(ARROW.get_width())
		arrow.scale = Vector2(k, k)
		arrow.modulate = ARROW_TINT
		var tip := -Iso.half_h() * ARROW_LIFT
		arrow.position.y = tip
		arrow.z_index = 7
		holder.add_child(arrow)
		var bob := create_tween().set_loops()
		bob.tween_property(arrow, "position:y", tip - ARROW_BOB, ARROW_BOB_SECONDS)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		bob.tween_property(arrow, "position:y", tip, ARROW_BOB_SECONDS)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_bobs.append(bob)
		_arrow[cell] = arrow
		return

	# LE MOT DU PALIER, au-dessus du faisceau : le halo dit « ca vaut », le mot
	# dit combien, et personne n'a a apprendre un code de couleurs. Lisere
	# sombre, parce que les glyphes nus mesuraient 1,8:1 sur l'herbe.
	var word := Label.new()
	word.text = CHEST_TIER.to_upper()
	word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	word.add_theme_font_size_override("font_size", 8)
	word.add_theme_color_override("font_color", tint)
	word.add_theme_color_override("font_outline_color", Color("#0c0a12"))
	word.add_theme_constant_override("outline_size", 2)
	word.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	word.size = Vector2(60, 12)
	word.position = Vector2(-30, -beam_h - 12 - 6)
	word.scale = Vector2(1.1, 1.1)
	word.z_index = 6
	holder.add_child(word)
	var hover := create_tween().set_loops()
	hover.tween_property(word, "position:y", word.position.y - 2, 1.1)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	hover.tween_property(word, "position:y", word.position.y, 1.1)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_bobs.append(hover)


## L'ECLAT, une fois, puis on reserve le suivant.
func _schedule_shine(chest: AnimatedSprite2D) -> void:
	var t := get_tree().create_timer(_rng.randf_range(CHEST_SHINE_EVERY.x, CHEST_SHINE_EVERY.y))
	_timers.append(t)
	t.timeout.connect(func() -> void:
		if not is_instance_valid(chest) or not chest.visible:
			return
		chest.sprite_frames.set_animation_loop("idle", false)
		chest.sprite_frames.set_animation_speed("idle", CHEST_SHINE_FPS)
		chest.play("idle")
		chest.animation_finished.connect(func() -> void:
			chest.stop()
			chest.frame = 0
			_schedule_shine(chest), CONNECT_ONE_SHOT))


## LA SECOUSSE : deux coups a gauche-droite, un plus petit, retour.
func _schedule_shake(chest: AnimatedSprite2D) -> void:
	var t := get_tree().create_timer(_rng.randf_range(CHEST_SHAKE_EVERY.x, CHEST_SHAKE_EVERY.y))
	_timers.append(t)
	t.timeout.connect(func() -> void:
		if not is_instance_valid(chest):
			return
		var x0 := chest.position.x
		var s := create_tween()
		s.tween_property(chest, "position:x", x0 - 2, 0.045)
		s.parallel().tween_property(chest, "rotation", -0.05, 0.045)
		s.tween_property(chest, "position:x", x0 + 2, 0.05)
		s.parallel().tween_property(chest, "rotation", 0.05, 0.05)
		s.tween_property(chest, "position:x", x0 - 1.4, 0.045)
		s.parallel().tween_property(chest, "rotation", -0.035, 0.045)
		s.tween_property(chest, "position:x", x0 + 1.4, 0.045)
		s.parallel().tween_property(chest, "rotation", 0.035, 0.045)
		s.tween_property(chest, "position:x", x0, 0.05).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		s.parallel().tween_property(chest, "rotation", 0.0, 0.05)
		s.tween_callback(func() -> void: _schedule_shake(chest)))


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

		var glyph: Sprite2D = _hints[cell]
		if board.shows_number(cell):
			var n: int = board.adjacent[cell]
			glyph.texture = _digit_texture(n)
			glyph.visible = true
		else:
			glyph.visible = false

		var opened: bool = st == IslandBoard.State.DUG and not _dug.has(cell)
		if opened:
			_dug[cell] = true
			if _primed:
				_reveal(cell)

		# LE COFFRE S'EN VA AVEC LA CASE CREUSEE : pris, il est parti avec le
		# joueur, et la fleche n'a plus rien a designer. Il s'envole si on le
		# voit partir, il n'est simplement plus la sinon.
		if _flair.has(cell):
			var taken: bool = st == IslandBoard.State.DUG
			if opened and _primed:
				_clear_chest(cell)
			elif (_flair[cell] as Node2D).modulate.a > 0.0:
				(_flair[cell] as Node2D).visible = not taken

		# LE X : plein quand la case est marquee, fantome et battant quand c'est
		# la case enseignee, absent sinon.
		var x: Node2D = _x[cell]
		if board.is_flagged(cell):
			if cell == _pulsed:
				_stop_pulse()
			# POSE A L'INSTANT : il claque. Un plateau repris, lui, l'a deja.
			var fresh := _primed and (not x.visible or x.modulate.a < 1.0)
			x.modulate.a = 1.0
			x.visible = true
			if fresh:
				x.scale = Vector2.ZERO
				create_tween().tween_property(x, "scale", X_SQUASH, X_POP_SECONDS) \
					.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		elif cell == _pulsed:
			x.visible = true
			if _pulse == null:
				x.modulate.a = GHOST_LOW
				_pulse = create_tween().set_loops()
				_pulse.tween_property(x, "modulate:a", GHOST_HIGH, TEACH_BEAT_SECONDS * 0.5)\
					.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
				_pulse.tween_property(x, "modulate:a", GHOST_LOW, TEACH_BEAT_SECONDS * 0.5)\
					.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		else:
			x.visible = false
	_primed = true


## CE QUE LA CASE CACHAIT, au moment ou elle s'ouvre.
func _reveal(cell: Vector2i) -> void:
	match board.content.get(cell, IslandBoard.Content.EMPTY):
		IslandBoard.Content.CARROT:
			_take_carrot(cell)
		IslandBoard.Content.BOMB:
			_blast(cell)


## LA CAROTTE SORT ET SE PREND (`addCarrot` puis `collectCarrot`) : elle monte
## du sol en rebondissant, grossit d'un coup quand on la prend, puis s'envole
## en s'effacant. Son ombre reste au sol et s'eteint.
func _take_carrot(cell: Vector2i) -> void:
	var holder := Node2D.new()
	if not terrain.mount_veil(cell, holder, Z_PROP):
		holder.free()
		return
	var shadow := _ellipse(5.0, 2.5, Color(0, 0, 0, SHADOW_ALPHA))
	shadow.position = Vector2(0, 4)
	shadow.scale = Vector2.ONE * 0.3
	holder.add_child(shadow)
	var carrot := Sprite2D.new()
	carrot.texture = CARROT
	carrot.centered = false
	carrot.offset = Vector2(-CARROT.get_width() * 0.5, -CARROT.get_height())
	carrot.scale = Vector2.ONE * CARROT_SCALE
	carrot.position.y = CARROT_REST_Y + CARROT_POP
	carrot.modulate.a = 0.0
	holder.add_child(carrot)

	var t := create_tween().set_parallel(true)
	t.tween_property(carrot, "position:y", CARROT_REST_Y, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(carrot, "modulate:a", 1.0, 0.18)
	t.tween_property(shadow, "scale", Vector2.ONE, 0.28)
	t.tween_property(carrot, "scale", Vector2.ONE * CARROT_SCALE * 1.5, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(shadow, "modulate:a", 0.0, 0.3).set_delay(0.3)
	t.tween_property(carrot, "position:y", CARROT_REST_Y - CARROT_RISE, 0.34).set_delay(0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.tween_property(carrot, "modulate:a", 0.0, 0.34).set_delay(0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.chain().tween_callback(holder.queue_free)


## LA BOMBE SE MONTRE, PUIS LE CRATERE (`markBombSite`) : la boite noire sur
## la case, remplacee par un trou qui se creuse en 0,4 s apres un quart de
## seconde. Le cratere reste — la case a saute.
func _blast(cell: Vector2i) -> void:
	var bomb := Sprite2D.new()
	bomb.texture = BOMB
	bomb.scale = Vector2.ONE * BOMB_W / BOMB.get_width()
	if not terrain.mount_veil(cell, bomb, Z_PROP):
		bomb.free()
		return
	var crater := Node2D.new()
	terrain.mount_veil(cell, crater, Z_CRATER)
	var rim := _diamond_node(CRATER_RIM, 1.0)
	var pit := _diamond_node(CRATER_PIT, 0.72)
	pit.position.y = 1.0
	crater.add_child(rim)
	crater.add_child(pit)
	crater.modulate.a = 0.0
	_props.append(crater)
	var t := create_tween()
	t.tween_interval(0.25)
	t.tween_callback(bomb.queue_free)
	t.tween_property(crater, "modulate:a", 1.0, 0.4)


## LE COFFRE PRIS S'ENVOLE (`clearChest`) : la boite grossit en reculant et
## s'efface, le halo, le faisceau et la fleche s'eteignent avec elle.
func _clear_chest(cell: Vector2i) -> void:
	var chest: Node2D = _chest[cell]
	var holder: Node2D = _flair[cell]
	var t := create_tween().set_parallel(true)
	t.tween_property(chest, "scale", chest.scale * 1.5, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	t.tween_property(chest, "modulate:a", 0.0, 0.25)
	t.tween_property(holder, "modulate:a", 0.0, 0.3)
	t.chain().tween_callback(func() -> void: holder.visible = false)


func _ellipse(rx: float, ry: float, color: Color) -> Node2D:
	var node := Node2D.new()
	node.draw.connect(func() -> void:
		var pts := PackedVector2Array()
		for i in 16:
			var a := TAU * i / 16.0
			pts.append(Vector2(cos(a) * rx, sin(a) * ry))
		node.draw_colored_polygon(pts, color))
	return node


## Un losange de case plein, a une part de sa taille.
func _diamond_node(color: Color, share: float) -> Sprite2D:
	var d := Sprite2D.new()
	d.texture = _diamond_texture()
	d.centered = true
	d.modulate = color
	d.scale = Vector2.ONE * share
	return d


## LES CHIFFRES S'EFFACENT AVEC L'ILE. Ils sont rendus en MULTIPLY, et un
## multiply ignore l'opacite : l'ile coulait en s'effacant, ses chiffres
## restaient pleins par-dessus la mer. Le temps d'un fondu, ils repassent en
## melange normal — ils suivent alors l'alpha de l'ile — et `restore_blend`
## les rend a leur teinte.
func plain_blend() -> void:
	for cell in _hints:
		(_hints[cell] as Sprite2D).material = null


func restore_blend() -> void:
	for cell in _hints:
		(_hints[cell] as Sprite2D).material = _mul_material()


## FAIT BATTRE LE X FANTOME SUR UNE CASE — celle que la lecon demande de
## marquer — ou l'eteint avec (-1,-1).
##
## « Maintenant touche la case qui clignote » : la legende designe la case par
## son battement, et rien d'autre a l'ecran ne la designe. C'est le X fantome
## du web, celui auquel `beside` repond deja.
func set_pulse(cell: Vector2i) -> void:
	if cell == _pulsed:
		return
	_stop_pulse()
	_pulsed = cell
	refresh()


func _stop_pulse() -> void:
	if _pulse != null and _pulse.is_valid():
		_pulse.kill()
	_pulse = null
	if _x.has(_pulsed):
		(_x[_pulsed] as Node2D).modulate.a = 1.0
	_pulsed = Vector2i(-1, -1)


func clear() -> void:
	_stop_pulse()
	for t in _bobs:
		if t != null and t.is_valid():
			t.kill()
	_bobs.clear()
	# LES HORLOGES MEURENT AVEC LE COFFRE : un SceneTreeTimer garde sa connexion
	# vivante apres la mort du noeud, et reveillerait un eclat sur une boite
	# liberee.
	for t in _timers:
		if t != null:
			for c in t.timeout.get_connections():
				t.timeout.disconnect(c["callable"])
	_timers.clear()
	for cell in _flair:
		(_flair[cell] as Node).queue_free()
	for p in _props:
		p.queue_free()
	_flair.clear()
	_chest.clear()
	_arrow.clear()
	_props.clear()
	for cell in _fog:
		(_fog[cell] as Node).queue_free()
	for cell in _x:
		(_x[cell] as Node).queue_free()
	for cell in _hints:
		var g: Sprite2D = _hints[cell]
		if g.get_parent() != null:
			g.get_parent().queue_free()
	_fog.clear()
	_x.clear()
	_hints.clear()
	_dug.clear()
	_primed = false


## LES CHIFFRES, 3x5 en pixel art — les glyphes de demineur.
##
## Chaque ligne est une rangee de trois pixels, de haut en bas. Un `1` est la
## barre avec son pied, un `7` son crochet : la forme la plus courte qui se
## distingue des autres a un coup d'oeil, ce que demande un plateau qu'on lit
## en diagonale.
const DIGITS := {
	1: ["010", "110", "010", "010", "111"],
	2: ["111", "001", "111", "100", "111"],
	3: ["111", "001", "111", "001", "111"],
	4: ["101", "101", "111", "001", "001"],
	5: ["111", "100", "111", "001", "111"],
	6: ["111", "100", "111", "101", "111"],
	7: ["111", "001", "001", "001", "001"],
	8: ["111", "101", "111", "101", "111"],
}
## Chaque pixel du glyphe fait DIGIT_PX pixels de tuile : a 2, un chiffre fait
## 6x10 dans un losange de 44x24 — la place qu'occupait le label a 11.
const DIGIT_PX := 2

static var _digits: Dictionary = {}
static var _mul: CanvasItemMaterial


## LE MATERIAU MULTIPLY, partage par tous les chiffres.
static func _mul_material() -> CanvasItemMaterial:
	if _mul == null:
		_mul = CanvasItemMaterial.new()
		_mul.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
	return _mul


## CE QUE LE MULTIPLY COUTE A LA TEINTE, et l'anneau qui rend son bord.
##
## Repris de Tile.ts : `HINT_DEEPEN = 0.75` — chaque canal a 75 %, meme teinte,
## plus de poids une fois multiplie sur l'herbe ; a 1,0 le bleu du 1 mesurait
## 1,2-1,6:1 de contraste. Et `HINT_RING_TINT = 0xf2f4ff` : l'anneau des huit
## voisins (`outlinedPixelText`), lui aussi multiplie. PAS blanc pur : a
## #ffffff l'anneau est l'identite et disparait ; un souffle en dessous laisse
## un leger assombrissement qui separe encore le glyphe d'un sol pale. C'est le
## « petit halo » qu'on voit autour du 1 sur le web.
const HINT_DEEPEN := 0.75
const HINT_RING := Color("#f2f4ff")


## UN CHIFFRE, cuit une fois par valeur, AVEC SA COULEUR : la face en teinte
## approfondie, l'anneau en quasi-blanc. Deux teintes dans une texture, donc
## le `modulate` reste blanc.
static func _digit_texture(n: int) -> ImageTexture:
	var key := clampi(n, 1, 8)
	if _digits.has(key):
		return _digits[key]
	var rows: Array = DIGITS[key]
	var tint: Color = TINTS[mini(key, TINTS.size() - 1)]
	var face := Color(tint.r * HINT_DEEPEN, tint.g * HINT_DEEPEN, tint.b * HINT_DEEPEN, 1.0)
	# Un pixel de marge tout autour, pour l'anneau.
	var w := 3 * DIGIT_PX + 2
	var h := rows.size() * DIGIT_PX + 2
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	# L'ANNEAU D'ABORD, la face par-dessus : un pixel de face voisin d'un autre
	# ne doit pas etre repeint en anneau.
	for y in range(rows.size()):
		var row: String = rows[y]
		for x in range(3):
			if row[x] != "1":
				continue
			for dy in range(-1, DIGIT_PX + 1):
				for dx in range(-1, DIGIT_PX + 1):
					img.set_pixel(1 + x * DIGIT_PX + dx, 1 + y * DIGIT_PX + dy, HINT_RING)
	for y in range(rows.size()):
		var row: String = rows[y]
		for x in range(3):
			if row[x] != "1":
				continue
			for dy in range(DIGIT_PX):
				for dx in range(DIGIT_PX):
					img.set_pixel(1 + x * DIGIT_PX + dx, 1 + y * DIGIT_PX + dy, face)
	var tex := ImageTexture.create_from_image(img)
	_digits[key] = tex
	return tex


static var _chest_sf: SpriteFrames
static var _bush_sf: Dictionary = {}
static var _ellipse_tex: ImageTexture
static var _squares: Dictionary = {}


## LES HUIT IMAGES D'UN BUISSON, decoupees dans sa bande.
static func _bush_frames(variant: int) -> SpriteFrames:
	var v := clampi(variant, 1, BUSHES.size())
	if _bush_sf.has(v):
		return _bush_sf[v]
	var sf := SpriteFrames.new()
	sf.remove_animation("default")
	sf.add_animation("sway")
	sf.set_animation_speed("sway", 1000.0 / BUSH_FRAME_MS)
	sf.set_animation_loop("sway", true)
	for i in range(BUSH_FRAMES):
		var at := AtlasTexture.new()
		at.atlas = BUSHES[v - 1]
		at.region = Rect2(i * BUSH_FRAME, 0, BUSH_FRAME, BUSH_FRAME)
		sf.add_frame("sway", at)
	_bush_sf[v] = sf
	return sf


## L'OMBRE DE CONTACT : une ellipse de 26x10, en pixels francs.
static func _ellipse_texture() -> ImageTexture:
	if _ellipse_tex != null:
		return _ellipse_tex
	var w := 26
	var h := 10
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	for y in range(h):
		for x in range(w):
			var dx := (x + 0.5 - w * 0.5) / (w * 0.5)
			var dy := (y + 0.5 - h * 0.5) / (h * 0.5)
			if dx * dx + dy * dy <= 1.0:
				img.set_pixel(x, y, Color(1, 1, 1, 1))
	_ellipse_tex = ImageTexture.create_from_image(img)
	return _ellipse_tex


## Un carre plein de `n` pixels — une particule.
static func _square_texture(n: int) -> ImageTexture:
	if _squares.has(n):
		return _squares[n]
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 1))
	var tex := ImageTexture.create_from_image(img)
	_squares[n] = tex
	return tex


## LES FRAMES DU COFFRE, decoupees dans l'atlas une fois pour toutes.
static func _chest_frames() -> SpriteFrames:
	if _chest_sf != null:
		return _chest_sf
	var sf := SpriteFrames.new()
	sf.remove_animation("default")
	sf.add_animation("idle")
	sf.set_animation_speed("idle", CHEST_FPS)
	sf.set_animation_loop("idle", true)
	for r in CHEST_FRAMES:
		var at := AtlasTexture.new()
		at.atlas = CHEST_SHEET
		at.region = r
		sf.add_frame("idle", at)
	_chest_sf = sf
	return sf


## LE X, dessine : le trait sombre d'abord, le rouge par-dessus, chacun avec
## ses bouts ronds. Le meme dessin sert au X fantome de la lecon, a un tiers
## d'opacite (le web : « literally setFlag's drawing »).
class FlagMark extends Node2D:
	func _draw() -> void:
		var r := Iso.half_h() * X_REACH
		for pass_ in [[X_EDGE_WIDTH, X_EDGE], [X_RED_WIDTH, X_RED]]:
			var w: float = pass_[0]
			var c: Color = pass_[1]
			for seg in [[Vector2(-r, -r), Vector2(r, r)], [Vector2(r, -r), Vector2(-r, r)]]:
				draw_line(seg[0], seg[1], c, w, true)
				draw_circle(seg[0], w * 0.5, c, true, -1.0, true)
				draw_circle(seg[1], w * 0.5, c, true, -1.0, true)


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
