extends Node2D
class_name HomeRabbit
## LE LAPIN, CHEZ LUI, A NE RIEN FAIRE DE PARTICULIER.
##
## Porte de src/game/burrow/HomeRabbit.ts et entities/PlayerRabbit.ts.
##
## Le terrier est l'ecran qu'un joueur regarde ENTRE deux parties, et la seule
## chose qu'il ne montrait pas, c'etait le lapin lui-meme : on voyait ses
## champs, ses pieges et ses carottes, mais le personnage dont tout le jeu
## parle n'existait que sur l'ile. La ferme se lisait donc comme un ecran de
## proprietaire, pas comme un endroit ou quelqu'un habite.
##
## CE N'EST DELIBEREMENT PAS UNE ENTITE DE JEU. Il n'a pas de case a defendre,
## il ne peut etre ni pille, ni tape, ni marche dessus, et rien de lui n'est
## envoye au serveur : il erre sur quelques cases, s'arrete pour manger, se
## rassoit. Ce qui compte est L'OCCUPATION — un terrier avec un lapin dedans
## est une maison, un terrier sans lapin est une carte.
##
## FRERE DU DECOR, PAS ENFANT DU PLATEAU — et c'est LE piege de ce fichier.
##
## Le web a vecu l'inverse : le lapin vivait dans `board`, qui siege a une
## profondeur fixe parmi les blocs de terrain. Il passait donc DERRIERE chaque
## pin et derriere la maison quelle que soit sa case, et le `DepthHole` — la
## fenetre percee dans ce qui le recouvre — n'avait rien a percer, puisque ce
## qui le couvrait n'etait jamais son FRERE. Un lapin doit se trier contre les
## tuiles et les decors sur la meme regle qu'eux : `Iso.depth`.

const SHEET := preload("res://assets/bunnies/bunny-white.png")

## LA PLANCHE : 8 colonnes sur 8 rangees de 32x32.
const FRAME := 32
const SHEET_COLS := 8

## LES ANIMATIONS, en [premiere image, derniere image, images/seconde, boucle].
## Reprises telles quelles de BUNNY_ANIM_DEFS (AssetLoader.ts:299) : le lapin de
## l'ile et celui du terrier DOIVENT etre le meme animal, et une seconde table
## ecrite a la main est la facon dont deux lapins finissent par differer.
const ANIMS := {
	"idle": [0, 7, 8, true],
	"move": [8, 15, 12, true],
	"eat": [16, 23, 8, false],
	"sleep": [32, 39, 4, true],
	"happy": [40, 47, 10, false],
	"damage": [48, 55, 12, false],
	"death": [56, 61, 8, false],
}

## L'ECHELLE DU LAPIN, partagee avec l'ile (gridConfig.ts:87).
##
## PAS D'ECHELLE A LUI. Il a ete dessine 1,8x un temps, au motif qu'il etait
## seul sur une ferme vue de loin — mais les deux plateaux partagent le losange
## de 44, donc ca le faisait presque aussi haut qu'une case ici et moitie moins
## sur DIG. Paul, le 2026-09-18 : la taille de DIG est la bonne, les autres
## suivent.
const RABBIT_SCALE := 1.5

## L'ANCRE : les PIEDS au centre de la case, pas le centre de la boite.
##
## MESURE SUR L'ALPHA, PAS REPRISE DU WEB — et c'est un bug que ce portage a
## eu. Le web ancre a 0,9 de la frame ; recopie ici tel quel, ca posait le
## point de contact a y=28,8 d'une frame de 32 alors que LES PATTES SONT A
## y=32. Trois pixels d'art de trop, multiplies par l'echelle 1,5 : le lapin
## flottait CINQ pixels au-dessus de sa case, soit 40 % d'une demi-tuile —
## Paul l'a vu tout de suite, « le lapin ne se met pas sur les tiles ».
##
## Le 0,9 du web est juste CHEZ EUX, ou le conteneur du lapin porte d'autres
## decalages. La regle qui se transporte n'est pas le nombre, c'est
## l'intention : les pieds touchent le sol. Ici ca fait 1,0, et c'est ce que
## dit l'alpha des trois animations posees (idle, move, eat : bbox jusqu'a 32).
##
## Meme lecon que le pied des batiments dans burrow_props.gd — un ancrage se
## mesure sur les bornes alpha de l'art, jamais devine ni recopie.
const ANCHOR := Vector2(0.5, 1.0)

## LE TEMPS ENTRE DEUX GESTES, en secondes.
##
## Lent, et deliberement : c'est du decor a cote d'une interface que le joueur
## essaie de lire. Un lapin qui bouge chaque seconde tire l'oeil hors du
## panneau qu'on vient d'ouvrir — c'est le mode de panne de la vie ambiante,
## elle cesse d'etre une atmosphere pour devenir une distraction.
const BEAT_MIN := 2.6
const BEAT_MAX := 6.2

## JUSQU'OU IL S'ELOIGNE DE SON POINT DE DEPART, en cases.
##
## Garde pres du milieu pour qu'il reste la ou le joueur le voit, et hors des
## coins ou se tient le chrome. C'est un lapin qui flane dans sa cour, pas un
## lapin qui traverse la propriete.
const ROAM := 3

## LA PART DES GESTES QUI SONT UN REPAS plutot qu'un pas.
const EAT_CHANCE := 0.3

## LA DUREE D'UN SAUT, en secondes.
const HOP_SECONDS := 0.32

## DE COMBIEN IL SE TRIE DEVANT LE SOL DE SA CASE.
##
## Le web dit +0.6 d'un pas de case ; ici `Iso.depth` multiplie le pas par 16,
## donc c'est DIX. Entre les carottes (+1 case, soit 16) et le sol : un lapin
## passe devant la terre qu'il foule et derriere ce qui pousse plus pres de la
## camera. Voir le meme calcul dans fence_view.gd — l'ecrire 0.6 ici
## l'arrondirait a zero et le lapin s'enfoncerait dans le sol.
const DEPTH_BIAS := 10

var map: BurrowMap

## ERRE-T-IL ? Vrai au terrier, ou l'errance EST le comportement. Faux sur
## l'ile : la, le lapin est le JOUEUR, il se tient ou on l'a mene et n'en bouge
## que d'une tape — un lapin qui partirait manger pendant la lecon du X
## quitterait la case d'ou le X se pose.
var roam := true

var _sprite: AnimatedSprite2D
var _at: Vector2i
var _home: Vector2i
var _rng := RandomNumberGenerator.new()
var _beat: SceneTreeTimer
var _hop: Tween
var _walkable: Array[Vector2i] = []
## LES CASES OU IL A LE DROIT D'ALLER, quand la carte ne suffit pas : le
## terrier du serveur (burrow_layout.gd) — pas dans un arbre, pas hors du
## domaine. Vide = toute la terre.
var only: Dictionary = {}


## Pose le lapin au milieu de son terrain et le laisse vivre.
##
## `start` : la case ou le poser, quand elle n'est pas le milieu — l'apparition
## du tutoriel, `S` sur la carte dessinee. (-1,-1) ou une case impraticable
## retombe sur le milieu.
func build(seed_value: int, start: Vector2i = Vector2i(-1, -1)) -> void:
	clear()
	if map == null:
		return

	_rng.seed = seed_value * 101 + 13
	_walkable = _walkable_cells()
	if _walkable.is_empty():
		return
	_home = start if _walkable.has(start) else _middle_of()
	_at = _home

	_sprite = AnimatedSprite2D.new()
	_sprite.sprite_frames = _frames()
	_sprite.scale = Vector2(RABBIT_SCALE, RABBIT_SCALE)
	# NON CENTRE, ET C'EST LA LIGNE QUI MANQUAIT. AnimatedSprite2D est
	# `centered = true` par defaut : la frame est d'abord posee autour de
	# l'origine, PUIS l'offset s'ajoute. Avec un offset ecrit pour un coin
	# haut-gauche, le lapin sortait 24 px a gauche et 24 px trop haut — une
	# demi-tuile en diagonale, « entre 2 tiles ». Paul l'a dit trois fois.
	#
	# Toutes les sondes disaient zero, parce qu'elles calculaient les pattes
	# avec la formule d'un sprite non centre : elles mesuraient l'hypothese, pas
	# le dessin. La regle : mesurer le rectangle que Godot dessine, jamais celui
	# qu'on croit lui avoir demande.
	_sprite.centered = false
	# L'ANCRE EST UN OFFSET dans Godot : on decale de la part voulue de la
	# boite, en pixels de l'image (l'echelle s'applique apres).
	_sprite.offset = -Vector2(FRAME * ANCHOR.x, FRAME * ANCHOR.y)
	_sprite.play("idle")
	add_child(_sprite)

	_place()
	_schedule()


func clear() -> void:
	_happy = false
	if _hop != null and _hop.is_valid():
		_hop.kill()
	# LE BATTEMENT MEURT AVEC LE LAPIN. Un SceneTreeTimer garde sa connexion
	# vivante apres la mort du noeud : sans ca, un `show_ground` sur une autre
	# graine laisserait l'ancien battement reveiller un lapin detruit.
	if _beat != null and _beat.timeout.is_connected(_on_beat):
		_beat.timeout.disconnect(_on_beat)
	_beat = null
	if _sprite != null:
		_sprite.queue_free()
		_sprite = null
	_walkable.clear()


## FAIT ATTERRIR UN SAUT EN COURS, avant d'en lancer un autre.
##
## LE BUG QUE CECI CORRIGE : `_hop.kill()` abandonne le tween LA OU IL EN EST,
## donc a mi-chemin entre deux cases. Le saut suivant repartait de ce
## demi-point et l'erreur s'accumulait — mesure, dix gestes sur trente
## laissaient le lapin desaligne, jusqu'a trente-cinq pixels. Paul : « le lapin
## est entre 2 tile », et il l'a dit deux fois avant que je regarde au bon
## endroit.
##
## LA POSITION APPARTIENT A LA CASE, PAS AU TWEEN. Un saut interrompu doit donc
## se terminer d'abord : on tue l'animation ET on pose la case ou le lapin est
## cense etre. `_place()` relit `_at`, qui est deja a jour — c'est la seule
## verite.
func _land() -> void:
	if _hop != null and _hop.is_valid():
		_hop.kill()
	_hop = null
	_place()


## OU IL SE TIENT, a l'ecran — et a quelle profondeur.
##
## Les pieds au centre du losange, comme la maison et les clotures : c'est le
## meme sol, et trois facons differentes de le toucher se verraient.
func _place() -> void:
	position = map.screen_of(_at.x, _at.y) + Vector2(0, Iso.half_h())
	z_index = Iso.depth(_at.x, _at.y) + map.level_at(_at.x, _at.y) + DEPTH_BIAS


## UN GESTE : manger sur place, ou faire UN pas.
##
## Un pas a la fois plutot qu'un chemin, parce que le lapin n'a nulle part ou
## aller. L'errance EST le comportement : une destination lui donnerait l'air
## de se rendre quelque part, puis de s'arreter sans raison.
func _on_beat() -> void:
	if _sprite == null:
		return
	if _rng.randf() < EAT_CHANCE:
		_eat()
	else:
		_step()
	_schedule()


## OU IL SE TIENT, en cases. La seule verite — voir `_land`.
func at() -> Vector2i:
	return _at


func _schedule() -> void:
	if _sprite == null or not is_inside_tree() or not roam:
		return
	_beat = get_tree().create_timer(_rng.randf_range(BEAT_MIN, BEAT_MAX))
	_beat.timeout.connect(_on_beat)


func _eat() -> void:
	_sprite.play("eat")
	# `eat` ne boucle pas : on revient au repos quand elle est finie. Se
	# reconnecter a chaque fois plutot qu'une fois pour toutes, parce que le
	# retour depend de ce qu'on vient de jouer.
	if not _sprite.animation_finished.is_connected(_rest):
		_sprite.animation_finished.connect(_rest, CONNECT_ONE_SHOT)


func _rest() -> void:
	if _sprite == null:
		return
	_sprite.play("happy" if _happy else "idle")


## IL EST CONTENT : la rangee `happy` (le saut sur place), en boucle, une fois
## pose — `PlayerRabbit.celebrate` du web (`whenLanded` puis `happy` boucle).
## Un saut en cours se termine d'abord : il fete sur la case du coffre, pas a
## mi-chemin. `happy` ne boucle pas dans la table (le web ne la boucle qu'ici),
## donc on la relance a chaque fin tant que la fete dure.
var _happy := false


func celebrate() -> void:
	if _sprite == null or _happy:
		return
	_happy = true
	_sprite.animation_finished.connect(_on_happy_done)
	if _hop == null or not _hop.is_valid():
		_sprite.play("happy")


func _on_happy_done() -> void:
	if _happy and _sprite != null and _sprite.animation == "happy":
		_sprite.play("happy")


## IL PREND LA BOMBE (`playDamage` + `knockBack` de Blast.ts) : la rangee
## `damage`, et le corps souffle loin du point d'impact puis retombe en
## rebondissant — 14 px de cote, 10 vers le haut, en 0,12 s, retour en 0,3.
##
## SUR LE SPRITE, pas sur le noeud : la position du noeud appartient a la case
## (`_land`), et un recul qui l'ecrirait se disputerait avec le saut. Un saut
## en cours se termine d'abord — il prend la bombe EN ARRIVANT sur la case.
func take_hit(from: Vector2) -> void:
	if _sprite == null:
		return
	if _hop != null and _hop.is_valid():
		_hop.finished.connect(func() -> void: take_hit(from), CONNECT_ONE_SHOT)
		return
	_sprite.play("damage")
	if not _sprite.animation_finished.is_connected(_rest):
		_sprite.animation_finished.connect(_rest, CONNECT_ONE_SHOT)
	var home := _sprite.position
	var ang := atan2(position.y - from.y, position.x - from.x)
	var knock := create_tween()
	knock.tween_property(_sprite, "position",
		home + Vector2(cos(ang) * 14.0, sin(ang) * 8.0 - 10.0), 0.12) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	knock.tween_property(_sprite, "position", home, 0.3) \
		.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)


## A BOUT DE FORCES (`playExhausted`) : le trebuchement de `damage` puis le
## sommeil, en boucle, une fois pose. Rien ne l'a frappe — c'est le seul rang
## « epuise » qui finit debout, d'ou le sommeil apres.
func exhaust() -> void:
	if _sprite == null:
		return
	if _hop != null and _hop.is_valid():
		_hop.finished.connect(exhaust, CONNECT_ONE_SHOT)
		return
	_sprite.play("damage")
	_sprite.animation_finished.connect(func() -> void:
		if _sprite != null:
			_sprite.play("sleep"), CONNECT_ONE_SHOT)


## A TERRE ET QUI Y RESTE (`playDeath`) : `death` finit sur une image pleine,
## le corps a plat, et tient seul. `done` a la fin du rang.
func die(done: Callable = Callable()) -> void:
	if _sprite == null:
		if done.is_valid():
			done.call()
		return
	_sprite.play("death")
	if done.is_valid():
		_sprite.animation_finished.connect(done, CONNECT_ONE_SHOT)


## L'ART DU LAPIN S'ETEINT sans que le lapin parte : l'electrocution pose sa
## propre image a la place, puis le rend.
func hide_sprite(hidden: bool) -> void:
	if _sprite != null:
		_sprite.visible = not hidden


## Un saut en cours ? L'eclair attend qu'il se pose.
func hopping() -> bool:
	return _hop != null and _hop.is_valid()


## ENVOIE LE LAPIN SUR UNE CASE — provisoire, pour voir une tape aboutir.
##
## Il y va d'un seul bond, ce qu'un lapin ne fait pas sur dix cases : c'est une
## SONDE, pas un deplacement de jeu. Elle prouve que la case resolue par le
## doigt est bien celle qu'on visait, ce qu'un signal seul ne montre pas. Elle
## s'en ira quand une bombe se posera a la place.
##
## Le foyer suit, sinon le lapin rentrerait aussitot chez lui.
func send_to(cell: Vector2i) -> void:
	if _sprite == null or not _walkable.has(cell):
		return
	# On atterrit AVANT de changer `_at` — voir `_land` et `_step`.
	_land()
	_home = cell
	if cell.x != _at.x:
		_sprite.flip_h = cell.x < _at.x
	_at = cell
	var to_at := map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	z_index = Iso.depth(cell.x, cell.y) + map.level_at(cell.x, cell.y) + DEPTH_BIAS
	_sprite.play("move")
	_hop = create_tween()
	_hop.tween_property(self, "position", to_at, HOP_SECONDS)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_hop.tween_callback(_rest)


## UN PAS VERS UNE CASE VOISINE, s'il en trouve une qui lui va.
##
## LES HUIT VOISINES, pas les quatre : c'est la grille sur laquelle un lapin
## marche vraiment, et c'est aussi pourquoi murer les quatre faces d'une case
## ne la ferme pas — la diagonale passe au coin.
func _step() -> void:
	var options: Array[Vector2i] = []
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			if dx == 0 and dy == 0:
				continue
			var next := _at + Vector2i(dx, dy)
			if not _walkable.has(next):
				continue
			# IL NE S'ELOIGNE PAS DE PLUS DE `ROAM` DE CHEZ LUI — distance de
			# Chebyshev, la grille qu'il marche.
			var apart := maxi(absi(next.x - _home.x), absi(next.y - _home.y))
			if apart > ROAM:
				continue
			options.append(next)
	if options.is_empty():
		return

	var to: Vector2i = options[_rng.randi() % options.size()]
	# ON ATTERRIT D'ABORD, TANT QUE `_at` NOMME ENCORE LA CASE DE DEPART.
	# Apres l'affectation ci-dessous, `_place()` teleporterait a l'arrivee au
	# lieu de terminer le saut en cours — et le saut ne se verrait plus.
	_land()
	# IL REGARDE OU IL VA. Un miroir en x, jamais une rotation.
	if to.x != _at.x:
		_sprite.flip_h = to.x < _at.x
	_at = to
	_sprite.play("move")

	# LE SAUT : la position s'anime, la PROFONDEUR SAUTE tout de suite.
	#
	# C'est voulu. Trier a mi-chemin entre deux cases n'a pas de sens — le
	# lapin appartient a l'une ou a l'autre — et le web recoupe son DepthHole a
	# CHAQUE image pour cette raison : « un trou place a l'arrivee resterait une
	# cellule en arriere pendant toute la duree du saut ».
	var to_at := map.screen_of(to.x, to.y) + Vector2(0, Iso.half_h())
	z_index = Iso.depth(to.x, to.y) + map.level_at(to.x, to.y) + DEPTH_BIAS
	_hop = create_tween()
	_hop.tween_property(self, "position", to_at, HOP_SECONDS)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_hop.tween_callback(_rest)


## LES CASES OU UN LAPIN PEUT SE TENIR : la terre, restreinte a `only` quand
## l'appelant la connait — au terrier, `walkableTiles` du serveur
## (burrow_layout.gd) : ni dans un arbre, ni hors du domaine.
func _walkable_cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for row in range(map.height):
		for col in range(map.width):
			if not map.is_land(col, row):
				continue
			if not only.is_empty() and not only.has(Vector2i(col, row)):
				continue
			out.append(Vector2i(col, row))
	return out


## LA CASE PRATICABLE LA PLUS PROCHE DU MILIEU DU TERRAIN.
##
## DEUX CORRECTIONS, et les deux sont necessaires.
##
## Le milieu est pris sur LES CASES PRATICABLES et non sur la grille : la
## grille est une boite englobante et la ferme est une ile irreguliere dedans,
## en general loin de son centre — viser le milieu du 19x19 garait donc le
## lapin contre le bord de la ferme le plus proche de ce point.
##
## Et la case RENDUE est la praticable la plus proche de ce centre : le vrai
## centre est souvent un rocher, un trou ou la bouche du terrier, et on ne se
## tient sur aucun des trois.
func _middle_of() -> Vector2i:
	var sum := Vector2.ZERO
	for cell in _walkable:
		sum += Vector2(cell)
	var centre := sum / float(_walkable.size())

	var best: Vector2i = _walkable[0]
	var best_d := INF
	for cell in _walkable:
		var d := Vector2(cell).distance_squared_to(centre)
		if d < best_d:
			best_d = d
			best = cell
	return best


## LA PLANCHE DECOUPEE, une animation par ligne de la table.
func _frames() -> SpriteFrames:
	var out := SpriteFrames.new()
	# SpriteFrames arrive avec un "default" dont on ne veut pas : le laisser
	# donnerait une animation vide qui joue si un nom est mal ecrit.
	out.remove_animation("default")
	for name in ANIMS:
		var def: Array = ANIMS[name]
		out.add_animation(name)
		out.set_animation_speed(name, def[2])
		out.set_animation_loop(name, def[3])
		for i in range(def[0], def[1] + 1):
			var frame := AtlasTexture.new()
			frame.atlas = SHEET
			frame.region = Rect2(
				(i % SHEET_COLS) * FRAME, (i / SHEET_COLS) * FRAME, FRAME, FRAME
			)
			out.add_frame(name, frame)
	return out
