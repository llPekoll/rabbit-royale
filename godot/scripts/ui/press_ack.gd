class_name PressAck
extends CanvasLayer
## LE BOUTON REPOND TOUT DE SUITE — meme quand le serveur prend son temps.
##
## « Tous les appels API sont un peu longs, donne toujours un retour
## instantane pendant que ca charge, partout » (2026-10-01). La moulinette du
## coin (busy_spinner.gd) attendait 200 ms et se montrait loin du doigt : on
## tapait CLAIM, rien ne bougeait sous le pouce, on retapait.
##
## ICI, PAS DANS CHAQUE ECRAN. Tout bouton du jeu (BaseButton) est suivi des
## qu'il entre dans l'arbre. Quand une ecriture part (`Net.begin`) pendant
## que le doigt est sur un bouton — ou dans les HOLD_MS qui suivent son
## relachement —, c'est CE bouton qui l'a demandee : il se grise d'un cran,
## une carotte qui se remplit se pose dessus, et il ne se represse plus tant
## que la reponse n'est pas la. Ses MOTS s'effacent (tout Label, toute
## rangee qu'il porte) : la carotte prend leur place, au lieu de se poser sur
## « CLAIM » et d'en manger deux lettres. Un bouton ajoute demain est couvert
## sans y penser.
##
## La marque vit sur une couche a elle et SUIT le bouton (il s'enfonce, la
## carte glisse). Un bouton LIBERE garde sa marque la ou il etait : c'est le
## plus souvent une carte qui se reconstruit sur `Home.changed` (sa remplacante
## est au meme endroit), ou un panneau ferme au geste — la carotte reste sous
## le doigt jusqu'a la reponse. Un bouton seulement CACHE (un autre onglet)
## la cache, et la moulinette du coin reprend la parole (`Net.acked`).

## Apres le relachement, combien de temps une ecriture qui part est encore
## « celle du bouton » : un geste qui attend une image avant d'appeler.
const HOLD_MS := 400
## Le grise du bouton en attente : assez pour dire « pris », pas assez pour
## dire « eteint ».
const DIM := Color(0.78, 0.78, 0.78)
const PILL := Color(0.09, 0.05, 0.02, 0.35)
## Ce qui reste des mots du bouton en attente.
const WORDS_ALPHA := 0.0
const PAD := 5.0

var _down: BaseButton
var _released: BaseButton
var _released_ms := 0
## ticket (Net) -> Mark
var _marks := {}


func _ready() -> void:
	layer = 120
	get_tree().node_added.connect(_watch)
	_watch_all(get_tree().root)


func _watch_all(node: Node) -> void:
	_watch(node)
	for child in node.get_children():
		_watch_all(child)


func _watch(node: Node) -> void:
	if not node is BaseButton or node.has_meta("_press_ack"):
		return
	node.set_meta("_press_ack", true)
	var button := node as BaseButton
	button.button_down.connect(_on_down.bind(button))
	button.button_up.connect(_on_up.bind(button))


func _on_down(button: BaseButton) -> void:
	_down = button


## `button_up` part APRES `pressed` (base_button.cpp) : l'ecriture lancee
## par le geste a deja vu `_down`.
func _on_up(button: BaseButton) -> void:
	if _down == button:
		_down = null
	_released = button
	_released_ms = Time.get_ticks_msec()


## Le bouton qui vient de demander, ou null.
func _asker() -> BaseButton:
	if is_instance_valid(_down) and _down.is_inside_tree():
		return _down
	if is_instance_valid(_released) and _released.is_inside_tree() \
			and Time.get_ticks_msec() - _released_ms <= HOLD_MS:
		return _released
	return null


## Une ecriture part : la marquer sur le bouton qui l'a demandee.
func claim(ticket: int) -> void:
	var button := _asker()
	if button == null:
		return
	for mark: Mark in _marks.values():
		if mark.button == button:
			mark.held += 1
			_marks[ticket] = mark
			return
	var mark := Mark.new(button)
	add_child(mark)
	_marks[ticket] = mark


## Elle est rentree. `ticket` 0 : la plus vieille (un appelant sans ticket).
func release(ticket: int) -> void:
	if ticket == 0:
		if _marks.is_empty():
			return
		ticket = _marks.keys().min()
	var mark: Mark = _marks.get(ticket)
	if mark == null:
		return
	_marks.erase(ticket)
	mark.held -= 1
	if mark.held <= 0:
		mark.done()


## Une marque se voit sur un bouton en ce moment.
func showing() -> bool:
	for mark: Mark in _marks.values():
		if mark.visible:
			return true
	return false


class Mark extends Control:
	var button: BaseButton
	var held := 1
	var _carrot: CarrotLoader
	var _modulate := Color.WHITE
	var _filter := Control.MOUSE_FILTER_STOP
	## Les mots effaces, et leur alpha d'avant.
	var _words := {}

	func _init(on: BaseButton) -> void:
		button = on
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_modulate = on.modulate
		_filter = on.mouse_filter
		on.modulate = _modulate * DIM
		# Pas de second geste pendant que le premier est en route.
		on.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_hide_words(on)
		_carrot = CarrotLoader.new()
		add_child(_carrot)
		_follow()
		_carrot.restart()

	func _process(_delta: float) -> void:
		_follow()

	func _follow() -> void:
		if not is_instance_valid(button):
			return
		if not button.is_visible_in_tree():
			visible = false
			return
		var box := button.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, button.size)
		var h := clampf(box.size.y * 0.72, 18.0, 34.0)
		# La carotte se regle par sa LARGEUR ; on la veut d'une hauteur.
		_carrot.side = roundf(h * 0.75)
		var pill := _carrot.size + Vector2(PAD, PAD) * 2.0
		size = pill
		position = (box.get_center() - pill * 0.5).round()
		_carrot.position = Vector2(PAD, PAD)
		visible = true
		queue_redraw()

	func _draw() -> void:
		var style := StyleBoxFlat.new()
		style.bg_color = PILL
		style.set_corner_radius_all(int(size.y * 0.5))
		draw_style_box(style, Rect2(Vector2.ZERO, size))

	## Les mots, pas la planche : un Label, ou une rangee (le prix et son
	## icone). L'art du bouton reste, c'est lui qui dit « bouton ».
	func _hide_words(node: Node) -> void:
		# `true` : la planche peinte range son mot en enfant INTERNE.
		for child in node.get_children(true):
			if child is Label or child is BoxContainer:
				_words[child] = (child as CanvasItem).modulate.a
				(child as CanvasItem).modulate.a = WORDS_ALPHA
			else:
				_hide_words(child)

	func done() -> void:
		if is_instance_valid(button):
			button.modulate = _modulate
			button.mouse_filter = _filter
		for word: Variant in _words:
			if is_instance_valid(word):
				(word as CanvasItem).modulate.a = _words[word]
		queue_free()
