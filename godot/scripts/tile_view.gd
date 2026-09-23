extends Node2D
class_name TileView
## LA MOTTE ET LES CHIFFRES — ce qu'on voit d'une case.
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

## LE VOILE D'UNE CASE NON CREUSEE — celui du plateau de RAID (`raid_board.gd`) ;
## l'ile a troque le sien pour la motte, plus bas.
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

## LA MOTTE — ce qu'on voit d'une case non creusee, a la place du voile.
##
## Une plaque de gazon levee, peinte par `tools/paint_dig_tile.py` au format
## des feuilles du terrain (case de 64, losange 44x24), une rangee par palier
## taillee dans SA palette : case 0 ENTERREE,
## levee de 4 px sur sa tranche de terre ; case 1 INDICEE, enfoncee a 1 px et
## plus claire pour que le chiffre se lise dessus. Creusee, elle s'en va et
## c'est le pre qui reste.
##
## POURQUOI PLUS UN VOILE : un losange sombre a 45 % disait « pas encore
## creuse » par une tache. Sur un plateau en terrasses les losanges se
## recouvraient en coutures et assombrissaient la falaise en dessous. Une
## motte le dit par la FORME — c'est une case qu'on va retourner.
##
## LA TRANCHE RESTE DANS SA CASE : c'est le dessus qui monte, pas la terre qui
## pend. Une tranche pendue sous le losange tomberait sur la case de devant, et
## le sol de celle-ci, un bloc plus pres de la camera, la recouvrirait.
const DIG_TILE := preload("res://assets/terrain/dig-tile.png")
## Une rangee par palette de palier (palette-1 a palette-4), puis le potager
## du terrier (`BurrowTerrain.paint_field`).
const DIG_TILE_TIERS := 4
const DIG_TILE_GARDEN_ROW := 4
## De combien le dessus d'une motte LEVEE est au-dessus du sol, en pixels
## d'ecran (4 px peints x l'echelle du sol) : ce qui pousse dessus s'y pose.
const RAISED_RISE := 4.2
## LA MOTTE VARIE UN PEU D'UNE CASE A L'AUTRE : clarte et chaleur, jamais la
## teinte. Vingt mottes identiques se lisent comme un carrelage ; un pre
## decoupe a la beche n'est jamais deux fois du meme vert.
const SOD_LIGHT_SPREAD := 0.06
const SOD_WARM_SPREAD := 0.035

## LE BROUILLARD SUR LES MOTTES QU'ON N'A PAS APPROCHEES.
##
## Tout en mottes, le plateau etait un damier uniforme : « on sait pas ou on
## doit aller » (Paul, 2026-09-23). Le voile revient donc, mais PAR-DESSUS la
## motte et plus leger qu'avant (0,4 contre 0,45) : la forme dit « pas encore
## creuse », le voile dit « pas encore explore ».
##
## LE FRONT RESTE CLAIR : une motte qui touche du sol deja lu ou creuse (ses
## huit voisines) n'a pas de voile. La limite de ce qu'on connait se lit alors
## d'un coup d'oeil, clair contre sombre, et c'est exactement la ou l'on va.
const UNEXPLORED_FOG := 0.4
## Le voile se leve ou tombe en douceur, pas d'un claquement de case en case.
const FOG_FADE_SECONDS := 0.3
const NEIGHBOURS: Array[Vector2i] = [
	Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1), Vector2i(-1, 0),
	Vector2i(1, 0), Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1),
]
enum Look { COVERED, HINTED, DUG }
## Ou le dessus de la motte INDICEE se tient au-dessus du sol, en pixels
## d'ecran (1 px peint x l'echelle du sol) : le chiffre s'y pose.
const PRESSED_RISE := 1.05
## Le coup de beche : la motte saute et s'efface.
const POP_RISE := 10.0
const POP_SECONDS := 0.22

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

## LE X ROUGE — PEINT EN PIXELS (tools/paint_flag_x.py), a la taille de
## pixel du sol : les traits lisses du web (`Tile.setFlag`) se lisaient comme
## de l'encre vectorielle posee sur un plateau en pixel art (Paul,
## 2026-09-23). Memes mesures et memes encres que le web : deux traits epais a
## bord sombre, COUCHES sur le losange (des lignes iso 2:1) et non debout
## dessus. Il doit se lire d'un bout du plateau a l'autre comme « pas la », sur
## l'herbe comme sur le sable. La toute premiere version etait une croix de
## pixels de deux de large : elle se lisait comme un trait de grille.
##
## `X_SQUASH` reste l'echelle du noeud, pour les tampons qui l'animent ; le
## dessin la defait, l'image etant deja couchee.
const X_ART := preload("res://assets/fx/flag-x.png")
## Le centre du X dans l'image, et un pixel peint en pixels du plateau : la
## motte peint 42 px sur les 44 de la case.
const X_ART_CENTRE := Vector2(15.0, 8.5)
const X_ART_SCALE := 44.0 / 42.0
const X_RED := Color("#ff5a4a")
const X_EDGE := Color("#3a0d0d")
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
## L'OUVERTURE : les images `jump front` puis `jumpback` de l'atlas, a 100 ms ;
## le cadre source de 64, et ou l'image FERMEE y est posee (21, 50).
const CHEST_ATLAS := preload("res://assets/misc/loot-box.json")
const CHEST_OPEN_FRAMES := [6, 7, 8, 9, 10, 17, 18, 19, 20, 21]
const CHEST_CELL := 64.0
const CHEST_CLOSED_AT := Vector2i(21, 50)
## Quand le couvercle saute (3e image), et quand l'ouverture est finie.
const CHEST_POP_AT := 0.25
## Le saut qui la sort de derriere le lapin : 30 px plus haut, 2x, en 0,18 s.
const CHEST_JUMP_SECONDS := 0.18
const CHEST_OPEN_LIFT := 30.0
const CHEST_OPEN_SCALE := 2.0
const Z_CHEST_OPEN := 12
## Les dix images a 100 ms, puis toute la scene sur la case : le saut,
## l'ouverture, l'effacement — ce que la ceremonie attend.
const CHEST_ANIM_SECONDS := 1.0
const CHEST_OPEN_SECONDS := 1.5
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

## LES COFFRES TOMBENT-ILS A LA CONSTRUCTION ? Oui a l'arrivee sur une ile
## (`showChests(…, drop = true)`), non a une reprise : les revoir tomber
## dirait qu'ils viennent d'apparaitre. Pose par l'ile avant `build`.
var drop_chests := false

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
## Le halo a 0,88 du losange (`TileTextures.diamondFill`).
const CHEST_GLOW_INSET := 0.88
## D'ou tombe la boite a l'arrivee, en pixels du monde (`CHEST_DROP_HEIGHT`).
const CHEST_DROP_HEIGHT := 90.0
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
const GOLDEN_SCALE := 1.35
const GOLDEN_TINT := Color("#ffe066")

## LE CRATERE PEINT, quand le terrain ne peut pas poser le trou dessine : un
## bord brun et un fond presque noir, sous le X (le cratere est dans le sol).
const CRATER_RIM := Color(0x1a / 255.0, 0x10 / 255.0, 0x0a / 255.0, 0.55)
const CRATER_PIT := Color(0x05 / 255.0, 0x03 / 255.0, 0x02 / 255.0, 0.75)
const Z_CRATER := 3

var board: IslandBoard
var terrain: BurrowTerrain
## LE DELAI DU FEU D'UNE BOMBE, en secondes : le saut du lapin qui l'a
## creusee, jusqu'a ce que ses pattes touchent (chaque case se creuse en y
## sautant) ; zero, il saute a la tape.
var blast_delay := IslandRabbit.BLAST_AT

var _fog: Dictionary = {}
## Les deux mottes de chaque case (enterree, indicee), deja deformees si la
## case est une rampe, et celle qu'on montre.
var _looks: Dictionary = {}
var _look: Dictionary = {}
## Les mottes sous le brouillard, et les fondus en vol.
var _fogged: Dictionary = {}
var _fog_fades: Dictionary = {}
var _hints: Dictionary = {}
var _x: Dictionary = {}
var _chest: Dictionary = {}
var _arrow: Dictionary = {}
## Tout ce qui entoure un coffre, par case : le porteur qu'on cache d'un coup.
var _flair: Dictionary = {}
## Le palier monte sur chaque case, pour la boussole.
var _tier_of: Dictionary = {}
## Le buisson de chaque case, pour le trou de profondeur : un buisson est
## « assez haut pour cacher le joueur ».
var _bush_at: Dictionary = {}
var _drops: Array[Tween] = []
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

static var _open_sf: SpriteFrames
static var _diamond: ImageTexture


func build() -> void:
	clear()
	if board == null or terrain == null:
		return

	for cell in board.playable():
		if not terrain.has_block(cell):
			continue

		var fog := Sprite2D.new()
		var looks: Array[Texture2D] = []
		# LA MOTTE DE SON PALIER : une rangee par palette, comme le sol
		# (`BurrowTerrain.build`, `tier - 1` borne a la derniere).
		var tier_row := clampi(terrain.map.level_at(cell.x, cell.y) - 1, 0, DIG_TILE_TIERS - 1)
		for i in 2:
			looks.append(terrain.sod_texture(cell, tier_row, i))
		_looks[cell] = looks
		fog.texture = looks[Look.COVERED]
		fog.modulate = sod_tint(cell)
		terrain.mount_tile(cell, fog, Z_FOG)
		# LEVEE DES LA POSE : tout ce qu'on monte ensuite sur la case (X,
		# chiffre, coffre, buisson) part de son dessus.
		_look[cell] = Look.COVERED
		terrain.set_rise(cell, RAISED_RISE)
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
		_rest_y[cell] = Vector2(fog.position.y, 0.0)

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
			_bush_at[cell] = bush

	refresh()


## LE COFFRE ET TOUT CE QUI L'ENTOURE, dans l'ordre de Tile.ts `setChest` :
## le halo au sol, l'anneau, l'ombre de contact, le faisceau derriere la boite,
## la boite, le mot du palier, les particules — et la fleche du tutoriel.
##
## TOUT DANS UN PORTEUR, monte une fois dans le bloc de la case : les z_index
## des enfants sont relatifs a lui, donc l'ordre de Tile.ts se recopie tel quel
## sans se disputer avec les couches du voile.
##
## LE PALIER EST PORTE PAR LE HALO ET L'ANNEAU, jamais par une teinte sur la
## boite : une teinte MULTIPLIE l'art, deja brun-rouge sombre, et commun et
## legendaire sortaient du meme brun boueux.
##
## LE PALIER EST CELUI DE LA CASE (`board.chest_tier`), le bronze a defaut —
## `showChests` fait pareil d'un palier qu'il ne connait pas.
func _mount_chest(cell: Vector2i) -> void:
	var tier: String = board.chest_tier.get(cell, CHEST_TIER)
	if not CHEST_TIER_COLOR.has(tier):
		tier = CHEST_TIER
	var tint: Color = CHEST_TIER_COLOR[tier]
	var flair: Dictionary = CHEST_FLAIR[tier]
	var holder := Node2D.new()
	terrain.mount_veil(cell, holder, Z_PROP)
	_flair[cell] = holder
	_tier_of[cell] = tier

	# LE HALO : presque opaque, il doit RECOUVRIR ce que porte la case (voile,
	# surbrillance), pas s'y fondre — translucide, il se lit comme la couleur du
	# sol et non comme celle du palier. A 0,88 du losange, comme `diamondFill` :
	# plein, il mangeait le liseré de la case voisine.
	var peak: float = 0.95 * float(flair["glow"])
	var glow := Sprite2D.new()
	glow.texture = _diamond_texture()
	glow.modulate = Color(tint.r, tint.g, tint.b, peak)
	glow.scale = Vector2.ONE * CHEST_GLOW_INSET
	glow.z_index = 0
	holder.add_child(glow)

	# L'ANNEAU : un peu plus large que le losange, pour se lire comme un rebord.
	var ring := Sprite2D.new()
	ring.texture = MoveRing._outline_texture()
	ring.modulate = tint
	ring.scale = Vector2(1.06, 1.06)
	ring.z_index = 1
	holder.add_child(ring)

	# L'OMBRE DE CONTACT, sous la boite et sur le halo.
	var shadow := Sprite2D.new()
	shadow.texture = _ellipse_texture()
	shadow.modulate = Color(0, 0, 0, CHEST_SHADOW_ALPHA)
	shadow.position.y = 2
	shadow.z_index = 2
	holder.add_child(shadow)

	# LE FAISCEAU, derriere la boite : un cone dans la couleur du palier, plus un
	# coeur blanc plus clair — c'est le coeur qui le fait lire comme de la
	# LUMIERE et non comme un triangle plat. Il respire de 0,72 a 1 en 1,3 s,
	# des la creation (le web ne l'attend pas).
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

	# LE MOT DU PALIER, au-dessus du faisceau : le halo dit « ca vaut », le mot
	# dit combien, et personne n'a a apprendre un code de couleurs. Lisere
	# sombre, parce que les glyphes nus mesuraient 1,8:1 sur l'herbe. Jamais
	# sur le tutoriel : la fleche prend sa place, et un palier dont personne
	# n'a encore l'echelle crierait a cote de la seule croix a regarder.
	var word: Label = null
	if not tutorial:
		word = Label.new()
		word.text = tier.to_upper()
		word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		word.add_theme_font_size_override("font_size", 8)
		word.add_theme_color_override("font_color", tint)
		word.add_theme_color_override("font_outline_color", Color("#0c0a12"))
		word.add_theme_constant_override("outline_size", 2)
		word.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
		word.size = Vector2(60, 12)
		word.position = Vector2(-30, -beam_h - 12 - 6)
		word.scale = Vector2(1.1, 1.1)
		word.z_index = 5
		holder.add_child(word)
		var hover := create_tween().set_loops()
		hover.tween_property(word, "position:y", word.position.y - 2, 1.1)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		hover.tween_property(word, "position:y", word.position.y, 1.1)\
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_bobs.append(hover)

	# LES PARTICULES, APRES le mot comme sur le web : elles montent a travers
	# lui. Chacune sur sa propre boucle, decalee, pour qu'elles ne marchent
	# jamais au pas. Une sur trois est grande et blanche.
	var motes: Array[Sprite2D] = []
	for i in range(int(flair["motes"])):
		var big := i % 3 == 0
		var mote := Sprite2D.new()
		mote.texture = _square_texture(3 if big else 2)
		mote.modulate = Color(1, 1, 1, 0.9) if big else Color(tint.r, tint.g, tint.b, 0.9)
		mote.position = Vector2((_rng.randf() - 0.5) * float(flair["width"]) * 1.6, -4)
		mote.z_index = 6
		holder.add_child(mote)
		motes.append(mote)
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

	# LE COFFRE TOMBE SUR L'ILE avec le plateau (`drop`, a l'arrivee
	# seulement) : le joueur le voit ARRIVER plutot que de le trouver deja la.
	# Chute, ecrasement a l'impact, puis l'attente. Halo, anneau, faisceau et
	# mot s'allument A L'ATTERRISSAGE — montrer le palier en plein vol
	# donnerait l'issue avant que la boite ait touche terre.
	if not drop_chests:
		_chest_ambience(chest, glow, ring, peak)
		return

	var rest_y := chest.position.y
	chest.position.y = rest_y - CHEST_DROP_HEIGHT
	glow.modulate.a = 0.0
	ring.modulate.a = 0.0
	beam.modulate.a = 0.0
	shadow.scale = Vector2.ONE * 0.35
	shadow.modulate.a = 0.12
	if word != null:
		word.modulate.a = 0.0
	for m in motes:
		m.visible = false
	var sy := chest.scale.y
	var t := create_tween()
	t.tween_property(chest, "position:y", rest_y, 0.45)\
		.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(shadow, "scale", Vector2.ONE, 0.45)\
		.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(shadow, "modulate:a", CHEST_SHADOW_ALPHA, 0.45)\
		.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	# L'ECRASEMENT a l'impact, puis le rebond du couvercle. (Le web l'avance
	# de 0,02 s ; un Tween de Godot n'a pas de delai negatif, et vingt
	# millisecondes ne se voient pas.)
	t.tween_property(chest, "scale:y", sy * 0.72, 0.08)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(chest, "scale:y", sy, 0.22)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(glow, "modulate:a", peak, 0.25)
	t.parallel().tween_property(ring, "modulate:a", 1.0, 0.25)
	t.parallel().tween_property(beam, "modulate:a", 0.72, 0.25)
	if word != null:
		t.parallel().tween_property(word, "modulate:a", 1.0, 0.25)
	t.tween_callback(func() -> void:
		for m in motes:
			m.visible = true
		_chest_ambience(chest, glow, ring, peak))
	_drops.append(t)


## L'ATTENTE D'UN COFFRE POSE (`startChestAmbience` + `scheduleChestShake`) :
## le halo respire entre son plein et 47 % en 0,75 s, l'anneau s'elargit
## jusqu'a 1,16 et revient en 1,1 s, l'eclat et la secousse sur horloge.
func _chest_ambience(chest: AnimatedSprite2D, glow: Sprite2D, ring: Sprite2D, peak: float) -> void:
	var breath := create_tween().set_loops()
	breath.tween_property(glow, "modulate:a", peak * 0.47, 0.75)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	breath.tween_property(glow, "modulate:a", peak, 0.75)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_bobs.append(breath)
	var rim := create_tween().set_loops()
	rim.tween_property(ring, "scale", Vector2(1.16, 1.16), 1.1)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	rim.tween_property(ring, "scale", Vector2(1.06, 1.06), 1.1)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_bobs.append(rim)
	_schedule_shine(chest)
	_schedule_shake(chest)


## LE BUISSON D'UNE CASE, ou null.
func bush_at(cell: Vector2i) -> Node2D:
	return _bush_at.get(cell, null)


## LES COFFRES QUI DORMENT ENCORE, pour la boussole : `{cell, node, tint}`.
## Le noeud est le porteur monte dans le bloc — sa position globale est celle
## de la case a l'ecran, camera comprise.
func chest_targets() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for cell in _flair:
		if board.state.get(cell) == IslandBoard.State.DUG:
			continue
		out.append({"cell": cell, "node": _flair[cell],
			"tint": CHEST_TIER_COLOR[_tier_of[cell]]})
	return out


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
		var st = board.state.get(cell)
		# UNE CASE QUE LA VAGUE N'A PAS ENCORE ATTEINTE garde son voile plein et
		# son chiffre cache : l'etat a tourne, le dessin attend le front
		# (`ripple`). Creusee entre-temps, elle ne l'attend plus.
		if _ripple_draw.has(cell) and st != IslandBoard.State.DUG:
			_show_look(cell, Look.COVERED)
			(_hints[cell] as Sprite2D).visible = false
		else:
			_paint(cell)

		var opened: bool = st == IslandBoard.State.DUG and not _dug.has(cell)
		if opened:
			_dug[cell] = true
			if _primed:
				_pop_tile(cell)
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
				_stamp_x(x)
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
	_refresh_fog()
	_primed = true


## LE VOILE ET LE CHIFFRE d'une case, tels que le plateau les tient.
func _paint(cell: Vector2i) -> void:
	var st = board.state.get(cell)
	if st == IslandBoard.State.DUG:
		_show_look(cell, Look.DUG)
	elif st == IslandBoard.State.HINTED:
		_show_look(cell, Look.HINTED)
	else:
		_show_look(cell, Look.COVERED)

	var glyph: Sprite2D = _hints[cell]
	if board.shows_number(cell):
		var n: int = board.adjacent[cell]
		glyph.texture = _digit_texture(n)
		glyph.visible = true
	else:
		glyph.visible = false


# ── La vague d'une zone qui s'ouvre (IslandScene.ts `openZone`) ──────────────

## Ou le voile et le chiffre se reposent, lus apres `mount_veil` qui les pose.
var _rest_y: Dictionary = {}
## Les dessins que le front n'a pas encore atteints, par case.
var _ripple_draw: Dictionary = {}
## Les levees en vol, par case.
var _ripple_lift: Dictionary = {}


## UNE ZONE VIENT DE S'OUVRIR : ses chiffres arrivent dans l'ordre de la
## distance a `from`, et le VOILE de chaque case se souleve et retombe au
## passage du front — jamais le terrain. « la c'est instant ca serait bien que
## ca fasse comme une wave » (Paul).
##
## A appeler AVANT `refresh`, avec l'etat deja tourne : le plateau sait tout
## de suite que ces cases sont connues (l'anneau, le mode X), seul le dessin
## attend. Pas pour un instantane de reconnexion : un sol ouvert avant qu'on
## arrive n'est pas une nouvelle.
func ripple(from: Vector2i, cells: Array) -> void:
	var tune: Dictionary = IslandBoard._tuning().RIPPLE
	var fresh: Array[Vector2i] = []
	var far := 0.0
	for c in cells:
		var cell: Vector2i = c
		if not _fog.has(cell):
			continue
		fresh.append(cell)
		far = maxf(far, Vector2(cell - from).length())
	# UNE ZONE D'UNE CASE n'a pas de front a faire courir : elle s'ouvre a plat.
	if fresh.is_empty() or not (far > 0.0):
		return
	var per_step: float = float(tune.PER_STEP)
	var cap: float = float(tune.MAX_DELAY)
	var scale := cap / (far * per_step) if far * per_step > cap else 1.0
	for cell in fresh:
		var delay: float = Vector2(cell - from).length() * per_step * scale
		# LE CHIFFRE est l'affaire de sa case : une zone qui en chevauche une
		# autre ne recoupe pas un dessin deja en attente.
		if not _ripple_draw.has(cell) and board.state.get(cell) != IslandBoard.State.DUG \
				and _still_fogged(cell):
			var draw := create_tween()
			draw.tween_interval(delay)
			draw.tween_callback(_land_hint.bind(cell))
			_ripple_draw[cell] = draw
		_lift(cell, delay, float(tune.HEIGHT), float(tune.TIME))


## LA MOTTE EST-ELLE ENCORE LEVEE a l'ecran ?
func _still_fogged(cell: Vector2i) -> bool:
	return _look.get(cell, Look.COVERED) == Look.COVERED


## MONTRE UNE MOTTE — ou plus rien, la case creusee.
func _show_look(cell: Vector2i, look: int) -> void:
	var was: int = _look.get(cell, -1)
	_look[cell] = look
	var fog: Sprite2D = _fog[cell]
	fog.visible = look != Look.DUG
	if look != Look.DUG:
		fog.texture = (_looks[cell] as Array)[look]
	if was != look:
		terrain.set_rise(cell, _rise_of(look))


## POSE OU LEVE LE BROUILLARD de chaque motte, d'apres ce qui est MONTRE (la
## vague n'a pas encore lu une case qu'elle n'a pas atteinte).
func _refresh_fog() -> void:
	for cell in _fog:
		var fogged := int(_look.get(cell, Look.COVERED)) == Look.COVERED \
			and not _touches_open(cell)
		if _fogged.has(cell) and bool(_fogged[cell]) == fogged:
			continue
		_fogged[cell] = fogged
		var fog: Sprite2D = _fog[cell]
		var target := sod_tint(cell) * _fog_shade(fogged)
		var old: Tween = _fog_fades.get(cell)
		if old != null and old.is_valid():
			old.kill()
		if not _primed:
			fog.modulate = target
			continue
		_fog_fades[cell] = create_tween()
		(_fog_fades[cell] as Tween).tween_property(fog, "modulate", target, FOG_FADE_SECONDS) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


## UNE VOISINE EST-ELLE DEJA OUVERTE a l'ecran (lue ou creusee) ?
func _touches_open(cell: Vector2i) -> bool:
	for d in NEIGHBOURS:
		var n := cell + d
		if _look.has(n) and int(_look[n]) != Look.COVERED:
			return true
	return false


## LE VOILE D'AVANT, EN MULTIPLICATION : la motte tiree vers `FOG_COLOR` de
## `UNEXPLORED_FOG`. Un multiply ne peut qu'assombrir, et c'est ce qu'on veut —
## un sprite de plus par case pour le meme effet couterait 500 dessins.
static func _fog_shade(fogged: bool) -> Color:
	if not fogged:
		return Color.WHITE
	var k := UNEXPLORED_FOG
	return Color(1.0 - k + k * FOG_COLOR.r, 1.0 - k + k * FOG_COLOR.g,
		1.0 - k + k * FOG_COLOR.b)


## DE COMBIEN LE DESSUS D'UNE CASE EST AU-DESSUS DE SON SOL, en pixels
## d'ecran : la motte levee, enfoncee, ou rien. Tout ce qui se pose SUR une
## case — l'anneau de marche, le X, un coffre — s'y pose a cette hauteur, sinon
## il s'enfonce dans la motte.
##
## LA HAUTEUR VIT DANS LE TERRAIN (`BurrowTerrain.set_rise`) : c'est lui qui
## la fait suivre a tout ce qui est monte sur la case.
func rise_at(cell: Vector2i) -> float:
	return terrain.rise_at(cell) if terrain != null else 0.0


static func _rise_of(look: int) -> float:
	match look:
		Look.COVERED:
			return RAISED_RISE
		Look.HINTED:
			return PRESSED_RISE
	return 0.0


## LA NUANCE D'UNE MOTTE, tiree de sa case : la meme a chaque dessin, sans
## RNG a tenir. Deux hachages differents pour que la clarte et la chaleur ne
## bougent pas ensemble.
static func sod_tint(cell: Vector2i) -> Color:
	var a := float(hash(cell) % 1000) / 999.0 * 2.0 - 1.0
	var b := float(hash(Vector2i(cell.y * 31 + 7, cell.x)) % 1000) / 999.0 * 2.0 - 1.0
	var light := 1.0 + a * SOD_LIGHT_SPREAD
	return Color(light * (1.0 + b * SOD_WARM_SPREAD), light,
		light * (1.0 - b * SOD_WARM_SPREAD))


## LE COUP DE BECHE : la motte qu'on vient de retourner saute et s'efface.
## Une copie, pas la vraie : la vraie est deja cachee par `_paint`, et une
## reprise du plateau ne doit rien trouver en vol.
func _pop_tile(cell: Vector2i) -> void:
	var fog: Sprite2D = _fog[cell]
	var clod := Sprite2D.new()
	clod.texture = (_looks[cell] as Array)[Look.COVERED]
	clod.centered = false
	clod.scale = fog.scale
	clod.position = fog.position
	clod.z_index = fog.z_index
	clod.modulate = fog.modulate
	fog.get_parent().add_child(clod)
	var tw := clod.create_tween().set_parallel()
	tw.tween_property(clod, "position:y", clod.position.y - POP_RISE, POP_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(clod, "modulate:a", 0.0, POP_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(clod.queue_free)


## Le front atteint la case : la motte s'enfonce, le chiffre sort.
func _land_hint(cell: Vector2i) -> void:
	_ripple_draw.erase(cell)
	if not _fog.has(cell):
		return
	_paint(cell)
	_refresh_fog()


## LE VOILE MONTE ET REDESCEND, le chiffre avec lui — ce sont deux noeuds
## freres et rien d'autre ne les tient ensemble. Une levee deja en vol sur la
## case est coupee : deux zones qui se chevauchent ne l'envoient pas deux fois
## plus haut.
func _lift(cell: Vector2i, delay: float, height: float, seconds: float) -> void:
	_stop_lift(cell)
	var tw := create_tween()
	tw.tween_interval(delay)
	tw.tween_method(func(t: float) -> void: _set_lift(cell, height * sin(PI * t)), 0.0, 1.0, seconds)
	tw.tween_callback(_stop_lift.bind(cell))
	_ripple_lift[cell] = tw


func _set_lift(cell: Vector2i, lift: float) -> void:
	if not _rest_y.has(cell):
		return
	var rest: Vector2 = _rest_y[cell]
	(_fog[cell] as Node2D).position.y = rest.x - lift
	# Le chiffre est monte sur la case : son repos est le dessus de la motte,
	# tel que le terrain le tient a cet instant.
	((_hints[cell] as Node2D).get_parent() as Node2D).position.y = \
		Iso.half_h() - rise_at(cell) - lift


## Pose la case EXACTEMENT sur sa grille : un voile laisse a un centieme de
## pixel a quitte la grille, et les vagues s'additionnent.
func _stop_lift(cell: Vector2i) -> void:
	var tw: Tween = _ripple_lift.get(cell)
	if tw != null and tw.is_valid():
		tw.kill()
	_ripple_lift.erase(cell)
	_set_lift(cell, 0.0)


## CE QUE LA CASE CACHAIT, au moment ou elle s'ouvre.
func _reveal(cell: Vector2i) -> void:
	match board.content.get(cell, IslandBoard.Content.EMPTY):
		IslandBoard.Content.CARROT:
			_take_carrot(cell)
		IslandBoard.Content.GOLDEN:
			_take_carrot(cell, true)
		IslandBoard.Content.BOMB:
			# LE FEU ATTEND QUE LE LAPIN SE POSE sur la case (`blast_back`).
			if blast_delay > 0.0:
				get_tree().create_timer(blast_delay).timeout.connect(func() -> void:
					if is_inside_tree():
						_blast(cell))
			else:
				_blast(cell)


## LA CAROTTE SORT ET SE PREND (`addCarrot` puis `collectCarrot`) : elle monte
## du sol en rebondissant, grossit d'un coup quand on la prend, puis s'envole
## en s'effacant. Son ombre reste au sol et s'eteint.
##
## LA DOREE EST LA MEME CAROTTE, plus grande et plus claire (`addCarrot`) :
## 1,35 fois, teintee #ffe066 — le web n'a pas d'autre art pour elle.
func _take_carrot(cell: Vector2i, golden: bool = false) -> void:
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
	var size := CARROT_SCALE * (GOLDEN_SCALE if golden else 1.0)
	carrot.scale = Vector2.ONE * size
	if golden:
		carrot.self_modulate = GOLDEN_TINT
	carrot.position.y = CARROT_REST_Y + CARROT_POP
	carrot.modulate.a = 0.0
	holder.add_child(carrot)

	var t := create_tween().set_parallel(true)
	t.tween_property(carrot, "position:y", CARROT_REST_Y, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(carrot, "modulate:a", 1.0, 0.18)
	t.tween_property(shadow, "scale", Vector2.ONE, 0.28)
	t.tween_property(carrot, "scale", Vector2.ONE * size * 1.5, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(shadow, "modulate:a", 0.0, 0.3).set_delay(0.3)
	t.tween_property(carrot, "position:y", CARROT_REST_Y - CARROT_RISE, 0.34).set_delay(0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.tween_property(carrot, "modulate:a", 0.0, 0.34).set_delay(0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.chain().tween_callback(holder.queue_free)


## LA BOMBE SAUTE, ET LE TROU RESTE (IslandScene `reveal` : `markBombSite`
## puis `playExplosion`).
##
## LE TROU D'ABORD, parce qu'il decide d'une couche de l'explosion : quand le
## terrain peut remplacer l'herbe de la case par le cratere PEINT (la colonne
## 10 de la planche plate), c'est lui la trace, et l'explosion saute sa
## brulure — un trou et une brulure qui s'efface par-dessus diraient deux fois
## la meme chose. Sinon (rampe, case sans sol plat), le cratere en losanges,
## qui monte SOUS le feu plutot qu'apres lui : apparu a sa derniere image, il
## se lirait comme un second evenement.
func _blast(cell: Vector2i) -> void:
	var dug := terrain.dig_cell(cell)
	if not dug:
		var crater := Node2D.new()
		if terrain.mount_veil(cell, crater, Z_CRATER):
			var rim := _diamond_node(CRATER_RIM, 1.0)
			var pit := _diamond_node(CRATER_PIT, 0.72)
			pit.position.y = 1.0
			crater.add_child(rim)
			crater.add_child(pit)
			crater.modulate.a = 0.0
			_props.append(crater)
			create_tween().tween_property(crater, "modulate:a", 1.0, 0.4).set_delay(0.25)
		else:
			crater.free()
	# LE BUISSON DE LA CASE PART AVEC LE SOL : les buissons ne bloquent pas, le
	# serveur enterre donc des bombes dessous — sans ca, il resterait plante
	# dans son propre cratere.
	var bush: Node2D = _bush_at.get(cell, null)
	if bush != null and is_instance_valid(bush):
		bush.queue_free()
		_bush_at.erase(cell)
	Blast.play(self, terrain, cell, dug)


## LE COFFRE S'OUVRE SUR SA CASE, PUIS S'EN VA.
##
## Le web ne l'ouvre que dans la ceremonie (`ChestOpening`) ; sur le plateau
## il s'envolait ferme. Ici le couvercle saute LA OU on l'a trouve — les dix
## images `jump front` + `jumpback` de la planche (6-10, 17-21, 100 ms), les
## memes que la ceremonie —, une gerbe dans la couleur du palier jaillit au
## moment ou il s'ouvre, puis la boite recule et s'efface comme avant
## (`clearChest` : x1,5, retour arriere, 0,25 s). La ceremonie attend la fin
## (`CHEST_OPEN_SECONDS`) : posee tout de suite, elle cachait l'ouverture.
func _clear_chest(cell: Vector2i) -> void:
	var chest: AnimatedSprite2D = _chest[cell]
	var holder: Node2D = _flair[cell]
	var tint: Color = CHEST_TIER_COLOR[_tier_of.get(cell, CHEST_TIER)]
	if _arrow.has(cell):
		(_arrow[cell] as Node2D).visible = false

	# LA BOITE QUI S'OUVRE remplace la boite fermee, au meme pixel : les images
	# d'ouverture sont posees dans leur cadre de 64 (`spriteSourceSize`), et le
	# cadre est cale pour que l'image fermee tombe ou etait l'ancienne.
	var opener := AnimatedSprite2D.new()
	opener.sprite_frames = _open_frames()
	opener.centered = false
	opener.offset = chest.offset - Vector2(CHEST_CLOSED_AT)
	opener.scale = chest.scale
	opener.position = chest.position
	opener.z_index = chest.z_index
	holder.add_child(opener)
	chest.visible = false

	# ELLE SAUTE AU-DESSUS DU LAPIN pour s'ouvrir. Le lapin vient d'arriver sur
	# la case et se tient DEVANT elle : une boite de 29 pixels derriere un
	# lapin de 48, l'ouverture ne se voyait pas du tout. Le porteur passe
	# au-dessus du lapin de sa case (DEPTH_BIAS 10) sans atteindre la rangee
	# suivante (16).
	holder.z_index = Z_CHEST_OPEN
	# LE MOT DU PALIER S'EFFACE : la boite sautee passe exactement ou il flotte.
	for child in holder.get_children():
		if child is Label:
			create_tween().tween_property(child, "modulate:a", 0.0, CHEST_JUMP_SECONDS)
	var up := create_tween().set_parallel(true)
	up.tween_property(opener, "position:y", opener.position.y - CHEST_OPEN_LIFT, CHEST_JUMP_SECONDS) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	up.tween_property(opener, "scale", Vector2.ONE * CHEST_OPEN_SCALE, CHEST_JUMP_SECONDS) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	up.chain().tween_callback(func() -> void: opener.play("open"))

	# LE COUVERCLE SAUTE a la 3e image : la gerbe part a ce moment-la, du
	# couvercle et non plus du sol.
	var t := create_tween()
	t.tween_interval(CHEST_JUMP_SECONDS + CHEST_POP_AT)
	t.tween_callback(func() -> void: _chest_burst(holder, tint, -CHEST_OPEN_LIFT))
	# PUIS ON LAISSE L'OUVERTURE FINIR avant d'effacer. Les trois fondus sont
	# `parallel()` ENTRE EUX seulement : un `set_parallel(true)` sur tout le
	# tween les rendait paralleles a l'attente aussi — la boite s'effacait
	# des le couvercle.
	t.tween_interval(CHEST_ANIM_SECONDS - CHEST_POP_AT)
	t.tween_property(opener, "scale", Vector2.ONE * CHEST_OPEN_SCALE * 1.5, 0.25) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(opener, "modulate:a", 0.0, 0.25)
	t.parallel().tween_property(holder, "modulate:a", 0.0, 0.3)
	t.tween_callback(func() -> void: holder.visible = false)


## LA GERBE : un eclair doux dans la couleur du palier, et des etincelles
## projetees en cloche — plus nombreuses et plus hautes a mesure que le palier
## monte, comme les particules du faisceau (`motes`).
func _chest_burst(holder: Node2D, tint: Color, lift: float = 0.0) -> void:
	var glow := Sprite2D.new()
	glow.texture = Blast._soft_disc()
	glow.modulate = Color(tint, 0.9)
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	glow.material = add
	glow.position.y = lift - 10
	glow.scale = Vector2.ONE * 0.3
	glow.z_index = 8
	holder.add_child(glow)
	var g := create_tween().set_parallel(true)
	g.tween_property(glow, "scale", Vector2.ONE * 1.1, 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	g.tween_property(glow, "modulate:a", 0.0, 0.35)
	g.chain().tween_callback(glow.queue_free)

	var tier: String = CHEST_TIER
	for k in CHEST_TIER_COLOR:
		if CHEST_TIER_COLOR[k] == tint:
			tier = k
	var flair: Dictionary = CHEST_FLAIR[tier]
	var count := 6 + int(flair["motes"]) * 2
	for i in count:
		var big := i % 3 == 0
		var spark := Sprite2D.new()
		spark.texture = _square_texture(3 if big else 2)
		spark.modulate = Color.WHITE if big else tint
		var from := lift - 10.0
		spark.position = Vector2(0, from)
		spark.z_index = 9
		holder.add_child(spark)
		var ang := -PI * 0.5 + (_rng.randf() - 0.5) * PI * 1.1
		var dist := 14.0 + _rng.randf() * 22.0
		var rise := float(flair["beam"]) * (0.5 + _rng.randf() * 0.5)
		var secs := 0.55 + _rng.randf() * 0.35
		var end := Vector2(cos(ang) * dist, sin(ang) * dist * 0.3)
		var fly := create_tween().set_parallel(true)
		fly.tween_property(spark, "position:x", end.x, secs)
		var arc := create_tween()
		arc.tween_property(spark, "position:y", from - rise, secs * 0.45) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		arc.tween_property(spark, "position:y", end.y + 6.0, secs * 0.55) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		var fade := create_tween()
		fade.tween_interval(secs * 0.6)
		fade.tween_property(spark, "modulate:a", 0.0, secs * 0.4)
		fade.tween_callback(spark.queue_free)


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
	for cell in _ripple_lift.keys():
		_stop_lift(cell)
	for t in _ripple_draw.values():
		if t != null and (t as Tween).is_valid():
			(t as Tween).kill()
	_ripple_draw.clear()
	_rest_y.clear()
	for t in _bobs:
		if t != null and t.is_valid():
			t.kill()
	_bobs.clear()
	for t in _drops:
		if t != null and t.is_valid():
			t.kill()
	_drops.clear()
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
	_tier_of.clear()
	_bush_at.clear()
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
	_looks.clear()
	_look.clear()
	for cell in _fog_fades:
		var t: Tween = _fog_fades[cell]
		if t != null and t.is_valid():
			t.kill()
	_fog_fades.clear()
	_fogged.clear()
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
## LES IMAGES D'OUVERTURE, chacune remise dans son cadre de 64 : l'atlas rogne
## chaque image a son contenu, et c'est `spriteSourceSize` qui dit ou elle se
## pose — la marge de l'AtlasTexture la replace.
static func _open_frames() -> SpriteFrames:
	if _open_sf != null:
		return _open_sf
	var sf := SpriteFrames.new()
	sf.remove_animation("default")
	sf.add_animation("open")
	sf.set_animation_speed("open", 10.0)
	sf.set_animation_loop("open", false)
	var raw: Array = (CHEST_ATLAS as JSON).data["frames"]
	for i in CHEST_OPEN_FRAMES:
		var e: Dictionary = raw[i]
		var f: Dictionary = e["frame"]
		var src: Dictionary = e["spriteSourceSize"]
		var at := AtlasTexture.new()
		at.atlas = CHEST_SHEET
		at.region = Rect2(f.x, f.y, f.w, f.h)
		at.margin = Rect2(src.x, src.y, CHEST_CELL - float(f.w), CHEST_CELL - float(f.h))
		sf.add_frame("open", at)
	_open_sf = sf
	return sf


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
	## Ou en est le tampon : `drop` le tient au-dessus de sa case (en pixels du
	## plateau), `ring` est l'onde qu'il leve en touchant, de 0 a 1 (< 0 : rien).
	var drop := 0.0:
		set(v):
			drop = v
			queue_redraw()
	var ring := -1.0:
		set(v):
			ring = v
			queue_redraw()

	func _draw() -> void:
		# L'ONDE, dans le repere de la case : on defait l'ecrasement du X pour
		# que le losange garde la proportion du sol pendant que le X rebondit.
		if ring >= 0.0 and scale.x > 0.001 and scale.y > 0.001:
			var k := Vector2(X_SQUASH.x / scale.x, X_SQUASH.y / scale.y)
			draw_set_transform(Vector2.ZERO, 0.0, k)
			var d := Iso.half_h() * lerpf(0.7, 1.9, ring)
			var pts := PackedVector2Array([Vector2(0, -d), Vector2(d, 0), Vector2(0, d),
				Vector2(-d, 0), Vector2(0, -d)])
			var a := (1.0 - ring) * 0.9
			draw_polyline(pts, Color(X_EDGE, a * 0.7), 6.0)
			draw_polyline(pts, Color(X_RED, a), 3.0)
		# L'image est deja couchee : on defait X_SQUASH, et ce que le tampon
		# ajoute par-dessus (l'ecrasement a l'impact) s'applique tel quel.
		var k := Vector2(X_ART_SCALE / X_SQUASH.x, X_ART_SCALE / X_SQUASH.y)
		draw_set_transform(Vector2(0, -drop / maxf(scale.y, 0.001)), 0.0, k)
		draw_texture(X_ART, -X_ART_CENTRE)


## LE X TOMBE COMME UN TAMPON : il arrive d'au-dessus, deux fois trop grand,
## ecrase la case en la touchant, rebondit a sa taille, et le coup leve une
## onde rouge sur le sol. Le `back.out` seul du web se voyait a peine sur une
## case de telephone.
const X_STAMP_FROM := 2.2
const X_STAMP_DROP := 16.0
const X_STAMP_FALL := 0.14
const X_STAMP_RING := 0.45

func _stamp_x(x: FlagMark) -> void:
	x.scale = X_SQUASH * X_STAMP_FROM
	x.drop = X_STAMP_DROP
	x.modulate.a = 0.0
	x.ring = -1.0
	var tw := x.create_tween().set_parallel()
	tw.tween_property(x, "modulate:a", 1.0, X_STAMP_FALL * 0.6)
	tw.tween_property(x, "scale", X_SQUASH * Vector2(1.25, 0.7), X_STAMP_FALL) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_property(x, "drop", 0.0, X_STAMP_FALL) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_property(x, "scale", X_SQUASH, X_POP_SECONDS) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(x, "ring", 1.0, X_STAMP_RING).from(0.0) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.chain().tween_callback(func() -> void: x.ring = -1.0)


## UN X FAUX : il se pose quand meme, tremble « non » et s'efface — la case
## montre ensuite son chiffre, ce que le X a paye. Un X a part, pas celui de
## la case : `refresh` cache ce dernier des que la case n'est pas marquee.
func deny_x(cell: Vector2i) -> void:
	if not _fog.has(cell):
		return
	var x := FlagMark.new()
	x.scale = X_SQUASH * 1.6
	x.modulate = Color(1, 1, 1, 0)
	# Au-dessus de la case qui s'allume en jaune a l'instant ou il tombe.
	if not terrain.mount_veil(cell, x, Z_FLOAT - 1):
		x.free()
		return
	x.position.y -= rise_at(cell)
	var tw := x.create_tween()
	tw.set_parallel()
	tw.tween_property(x, "modulate:a", 1.0, 0.08)
	tw.tween_property(x, "scale", X_SQUASH, 0.14).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.set_parallel(false)
	var home := x.position.x
	for i in 6:
		var a := 4.0 * (1.0 - i / 6.0) * (1.0 if i % 2 == 0 else -1.0)
		tw.tween_property(x, "position:x", home + a, 0.045)
	tw.tween_property(x, "position:x", home, 0.04)
	tw.tween_property(x, "modulate:a", 0.0, 0.3).set_delay(0.1)
	tw.tween_callback(x.queue_free)


# ── Les chiffres qui montent d'une case (IslandScene.ts `floatText`) ─────────

## Le jaune de la barre d'energie, pour un gain d'energie dit sur le plateau.
const ENERGY_YELLOW := Color("#ffd60a")
## Les pixels allumes de l'eclair, par rangee [premiere, derniere] colonne —
## ceux de energy-bar.tsx : le chiffre se lit ENERGIE, pas une carotte de plus.
const BOLT_ROWS := [[4, 6], [3, 5], [2, 4], [1, 6], [3, 6], [3, 5], [2, 4], [1, 3], [1, 2], [1, 1]]
## Au-dessus de tout le plateau, eclairs compris : c'est le fait le plus frais
## de l'ile pendant la seconde ou il vit.
const Z_FLOAT := 40
const FLOAT_FONT := 8


## UNE LIGNE QUI MONTE D'UNE CASE : « +12 » jaune avec l'eclair pour
## l'energie, rouge si elle s'en va ; les carottes en blanc (or au plafond de
## la serie). `dy` decale les lignes d'une meme reponse.
func float_text(cell: Vector2i, text: String, tint: Color, sc: float, dy: float, bolt := false) -> void:
	var holder := Node2D.new()
	if not terrain.mount_veil(cell, holder, Z_FLOAT):
		holder.free()
		return
	holder.position.y -= rise_at(cell) + 18.0 - dy
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", FLOAT_FONT)
	label.add_theme_color_override("font_color", tint)
	label.add_theme_color_override("font_outline_color", Color("#0c0a12"))
	label.add_theme_constant_override("outline_size", 3)
	label.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	holder.add_child(label)
	var font := label.get_theme_font("font")
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, FLOAT_FONT).x
	var h := font.get_height(FLOAT_FONT)
	var bolt_w := 9.0 if bolt else 0.0
	label.size = Vector2(w + 2, h)
	label.position = Vector2(-(w + bolt_w) * 0.5, -h * 0.5)
	if bolt:
		var b := BoltGlyph.new()
		b.tint = tint
		b.position = Vector2(label.position.x + w + 2, -5)
		holder.add_child(b)
	holder.scale = Vector2.ZERO
	var y0 := holder.position.y
	var tw := holder.create_tween().set_parallel()
	tw.tween_property(holder, "scale", Vector2(sc, sc), 0.22) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(holder, "position:y", y0 - 30.0, 1.2) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(holder, "modulate:a", 0.0, 0.3).set_delay(0.9) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(holder.queue_free)


class BoltGlyph extends Node2D:
	var tint := Color.WHITE

	func _draw() -> void:
		for row in BOLT_ROWS.size():
			var r: Array = BOLT_ROWS[row]
			draw_rect(Rect2(r[0] - 1, row - 1, r[1] - r[0] + 3, 3), Color("#3a2a00"))
		for row in BOLT_ROWS.size():
			var r: Array = BOLT_ROWS[row]
			draw_rect(Rect2(r[0], row, r[1] - r[0] + 1, 1), tint)


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
