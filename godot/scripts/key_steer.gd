class_name KeySteer
extends Node
## LE CLAVIER DU BUREAU : fleches / WASD pour un pas, 1 2 3 pour les actions.
##
## Porte de src/game/services/KeyboardControls.ts (client Pixi, archive le
## 2026-10-01), qui le tenait lui-meme de RR-casino. Ce qu'il avait decide, et
## qu'on garde :
##
##   • LE JOUEUR PRESSE UNE DIRECTION QU'IL VOIT, pas un axe de la grille. Les
##     pas sont a huit voisins, donc c'est exact : une DIAGONALE de grille est
##     un pas DROIT a l'ecran (`col-1,row-1` tombe pile au-dessus), et les axes
##     de la grille sont les diagonales de l'ecran. Quatre touches seules, et
##     quatre accords de deux touches (haut + gauche) pour les entre-deux.
##   • L'ACCORD ATTEND 60 ms la seconde touche : assez pour que deux doigts
##     posent UNE diagonale, bien moins que le saut et l'aller-retour serveur
##     qui suivent — ca se lit comme instantane.
##   • LA TOUCHE PHYSIQUE (`physical_keycode`), pas la lettre : sur AZERTY le
##     carre ZQSD tombe sous les memes doigts sans rien faire.
##   • PAS DE REPETITION : chaque pas coute de l'energie, et la repetition de
##     l'OS en tirerait une rafale.
##
## WEB ET BUREAU SEULEMENT : une appli Android ou iOS n'a pas de clavier, et
## le noeud ne s'y monte meme pas utilement (`enabled`). Un navigateur de
## telephone n'envoie simplement aucune touche.

## Un pas a l'ecran, y vers le bas : (0, -1) est « en haut ».
signal step(dir: Vector2)

## LA DERNIERE MAIN etait-elle au clavier ? Vrai a la touche, faux au clic ou
## au doigt. Le mode X arme au clavier vise tout de suite une case ; arme a la
## souris, il ne surligne rien que le pointeur n'a pas montre.
static var keyboard_last := false

const CHORD_MS := 0.06
## Un candidat a plus de ~72° de la touche pressee est refuse : mieux vaut ne
## rien faire que sauter de cote.
const TOLERANCE := 0.3

const DIRECTIONS := {
	KEY_UP: Vector2(0, -1),
	KEY_W: Vector2(0, -1),
	KEY_DOWN: Vector2(0, 1),
	KEY_S: Vector2(0, 1),
	KEY_LEFT: Vector2(-1, 0),
	KEY_A: Vector2(-1, 0),
	KEY_RIGHT: Vector2(1, 0),
	KEY_D: Vector2(1, 0),
}

const NEIGHBOURS: Array[Vector2i] = [
	Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1),
	Vector2i(-1, 0), Vector2i(1, 0),
	Vector2i(-1, 1), Vector2i(0, 1), Vector2i(1, 1),
]

var _held := {}
## Les touches pressees PENDANT la fenetre de l'accord, meme deja relachees :
## une frappe seche dure parfois moins de 60 ms, et le pas ne doit pas se perdre.
var _pressed := {}
var _chord: Timer


func _ready() -> void:
	_chord = Timer.new()
	_chord.one_shot = true
	_chord.wait_time = CHORD_MS
	_chord.timeout.connect(_commit)
	add_child(_chord)


## Le clavier compte-t-il ici et maintenant ? Pas sur une appli mobile, pas
## sous un dialogue (le plateau est derriere le voile).
static func enabled() -> bool:
	if OS.has_feature("android") or OS.has_feature("ios"):
		return false
	return Chrome.current == null or not Chrome.current.dialog_open()


## LA TOUCHE D'ACTION : 1, 2 ou 3 (rangee du haut ou pave), sinon 0.
static func digit(event: InputEvent) -> int:
	if not (event is InputEventKey) or not enabled():
		return 0
	var key := event as InputEventKey
	if not key.pressed or key.echo or key.ctrl_pressed or key.meta_pressed or key.alt_pressed:
		return 0
	match key.physical_keycode:
		KEY_1, KEY_KP_1: return 1
		KEY_2, KEY_KP_2: return 2
		KEY_3, KEY_KP_3: return 3
	return 0


## LA VOISINE de `from` dans la direction ECRAN `dir`, parmi celles que
## `ok(cell)` accepte ; (-1,-1) si rien n'y va. Le score est le produit
## scalaire avec le vrai vecteur ecran de chaque pas : au bord, quand la case
## exacte est refusee, la plus proche du cap gagne.
static func neighbour(from: Vector2i, dir: Vector2, ok: Callable, tolerance := TOLERANCE) -> Vector2i:
	if dir == Vector2.ZERO:
		return Vector2i(-1, -1)
	var want := dir.normalized()
	var best := Vector2i(-1, -1)
	var best_dot := tolerance
	for d in NEIGHBOURS:
		var cell := from + d
		if not ok.call(cell):
			continue
		var screen := Vector2((d.x - d.y) * Iso.half_w(), (d.x + d.y) * Iso.half_h()).normalized()
		var dot := screen.dot(want)
		if dot > best_dot:
			best_dot = dot
			best = cell
	return best


## La voisine EXACTE dans ce cap, sans filtre — pour dire NON sur la bonne case.
static func straight(from: Vector2i, dir: Vector2) -> Vector2i:
	return neighbour(from, dir, func(_c: Vector2i) -> bool: return true)


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		keyboard_last = true
	elif (event is InputEventMouseButton or event is InputEventScreenTouch) and event.pressed:
		keyboard_last = false


## LA TOUCHE DE CONFIRMATION : Entree, ou 3 — la touche du X, qui le pose
## une fois arme.
static func confirm(event: InputEvent) -> bool:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo or not enabled():
		return false
	return key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER or digit(event) == 3


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key := event as InputEventKey
	var code := key.physical_keycode if DIRECTIONS.has(key.physical_keycode) else key.keycode
	if not DIRECTIONS.has(code):
		return
	if not key.pressed:
		_held.erase(code)
		return
	if not enabled() or key.ctrl_pressed or key.meta_pressed or key.alt_pressed:
		return
	get_viewport().set_input_as_handled()
	if key.echo:
		return
	_held[code] = true
	_pressed[code] = true
	if _chord.is_stopped():
		_chord.start()


func _commit() -> void:
	var keys := _held.duplicate()
	keys.merge(_pressed)
	_pressed.clear()
	var dir := Vector2.ZERO
	for c in keys:
		dir += DIRECTIONS[c]
	# Deux touches opposees s'annulent : rien a faire.
	if dir != Vector2.ZERO:
		step.emit(dir)


## Une fenetre qui perd le focus perd aussi ses touches relachees : sans ce
## menage, une direction resterait « tenue » et fausserait l'accord suivant.
func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		_held.clear()
		_pressed.clear()
