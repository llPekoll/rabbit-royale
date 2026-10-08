class_name TouchScroll
extends Node
## UNE LISTE NE DEFILE AU DOIGT QUE SI L'APPUI LUI REMONTE. Godot arrete un
## evenement de pointeur au premier controle MOUSE_FILTER_STOP qu'il traverse
## (viewport.cpp `_gui_call_input`) : un bouton, un PanelContainer (STOP par
## defaut), une carte. Une liste faite de ces controles ne defile plus au
## Seeker, ou l'on ne touche que du contenu (le codex, 2026-10-08). Le
## bureau ne le voit pas : il defile a la molette.
##
## Ce noeud passe tout ce qui entre sous la liste en MOUSE_FILTER_PASS, et la
## liste elle-meme en STOP : l'appui monte jusqu'a elle puis s'arrete la,
## comme quand la ligne l'arretait — rien ne fuit vers le jeu derriere.
##
## UN BOUTON N'A RIEN A FAIRE : passe la zone morte, le ScrollContainer
## previent ses enfants (NOTIFICATION_SCROLL_BEGIN) et BaseButton abandonne
## son clic. Un controle qui reagit lui-meme a l'appui (`_gui_input`) doit
## choisir au relache, s'il n'a pas glisse : `TouchScroll.tapped`.
##
## A LA SOURIS, LA MEME CHOSE : le ScrollContainer ne tire la liste qu'au
## doigt (`is_touchscreen_available`), et le web au bureau n'avait que la
## molette. Sans ecran tactile, ce noeud tire lui-meme la liste au bouton
## gauche, passe le meme TAP_SLOP, et previent les boutons de la meme facon
## — comme l'etal de la boutique se tire deja.
##
## Gardent leur STOP : ce qui se tire ou s'ecrit (champ de texte, curseur,
## barre), une liste imbriquee, et ce qui porte la meta KEEP.

const KEEP := &"touch_scroll_keep"
## Au-dela, le doigt glisse : la liste defile et le tap ne compte pas. La
## zone morte du ScrollContainer est a 0 par defaut — le moindre tremblement
## d'un doigt pose sur un bouton defilait et annulait son clic.
const TAP_SLOP := 8.0
const _DOWN := &"touch_scroll_down"

var _scroll: ScrollContainer
## Le glisse a la souris : ou il a commence, et ou en etait la liste.
var _from := Vector2.INF
var _start := Vector2.ZERO
var _dragging := false


static func attach(scroll: ScrollContainer) -> TouchScroll:
	var node := TouchScroll.new()
	node._scroll = scroll
	scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	scroll.scroll_deadzone = int(TAP_SLOP)
	scroll.add_child(node, false, Node.INTERNAL_MODE_BACK)
	return node


## UN TAP, PAS UN GLISSE : vrai au relache du bouton gauche, si le doigt n'a
## pas bouge de plus de TAP_SLOP depuis l'appui sur `ctl`.
static func tapped(ctl: Control, event: InputEvent) -> bool:
	var mb := event as InputEventMouseButton
	if mb == null or mb.button_index != MOUSE_BUTTON_LEFT:
		return false
	if mb.pressed:
		ctl.set_meta(_DOWN, mb.global_position)
		return false
	if not ctl.has_meta(_DOWN):
		return false
	var at: Vector2 = ctl.get_meta(_DOWN)
	ctl.remove_meta(_DOWN)
	return mb.global_position.distance_to(at) <= TAP_SLOP


func _ready() -> void:
	get_tree().node_added.connect(_on_node_added)
	_open_tree.call_deferred(_scroll)
	if not DisplayServer.is_touchscreen_available():
		_scroll.gui_input.connect(_mouse_drag)


## Differe : un controle pose son propre filtre dans son `_ready`, apres
## `node_added`.
func _on_node_added(node: Node) -> void:
	if node is Control and _scroll.is_ancestor_of(node):
		_open.call_deferred(node)


func _open_tree(node: Node) -> void:
	for child in node.get_children(true):
		if child is Control:
			_open(child)
			_open_tree(child)


func _open(ctl: Control) -> void:
	if not is_instance_valid(ctl) or ctl.mouse_filter != Control.MOUSE_FILTER_STOP:
		return
	if ctl.has_meta(KEEP) or ctl is LineEdit or ctl is TextEdit or ctl is ScrollContainer \
			or (ctl is Range and not ctl is ProgressBar):
		return
	ctl.mouse_filter = Control.MOUSE_FILTER_PASS


## Le signal passe avant le `gui_input` du ScrollContainer, qui sans ecran
## tactile ne fait rien de ces evenements-la : la molette, elle, n'est pas
## touchee.
func _mouse_drag(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb != null:
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_from = mb.global_position if mb.pressed else Vector2.INF
			_start = Vector2(_scroll.scroll_horizontal, _scroll.scroll_vertical)
			_dragging = false
		return
	var mm := event as InputEventMouseMotion
	if mm == null or not _from.is_finite():
		return
	if not (mm.button_mask & MOUSE_BUTTON_MASK_LEFT):
		_from = Vector2.INF
		return
	var moved := mm.global_position - _from
	if not _dragging:
		if moved.length() <= TAP_SLOP:
			return
		_dragging = true
		# Le bouton sous le curseur abandonne son clic.
		_scroll.propagate_notification(Control.NOTIFICATION_SCROLL_BEGIN)
	if _scroll.horizontal_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED:
		_scroll.scroll_horizontal = roundi(_start.x - moved.x)
	if _scroll.vertical_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED:
		_scroll.scroll_vertical = roundi(_start.y - moved.y)
	_scroll.accept_event()
