class_name BurrowColumn
extends Control
## LA COLONNE DU TERRIER — la quete (ou la ligne « et maintenant »), le
## jardin, le terrier, empiles a gauche du plateau (page.tsx `.rr-burrow`).
##
## PAS DE CROISSANCE : la colonne est aussi haute que ses cartes, et aussi
## haute que l'ecran seulement quand elles le depassent. Elle etait un drap
## sur toute la hauteur avec les cartes en haut, et le drap vide sous elles
## avalait les taps destines au sol — LEVER une bombe sous la colonne ne
## faisait rien, sans requete ni trace. Sur iPhone, rendre le drap
## transparent au doigt cassait le defilement (iOS cherche le scroller sous
## le doigt). Alors la boite ne grandit plus : il n'y a plus de drap vide.
##
## 25 % DE LA LARGEUR, ce que la maquette tient constant (342 px de 1376),
## avec un plancher de 220 pour qu'un telephone droit garde ses cartes
## lisibles. Un 400 fixe etait la meme erreur que les hauteurs des cartes :
## juste a la fenetre de la maquette, et 45 % du Seeker.
##
## LA COLONNE S'EFFACE PENDANT QU'ON POSE : ce sont des releves d'un terrier
## qu'on n'est pas en train de gerer, sur le tiers gauche d'un plateau qu'il
## faut TAPER case par case. Le sol appelle `set_editing`.
##
## « PLUS EN DESSOUS » : sur un telephone couche, la derniere carte butait
## sur la barre du sol sans rien dire, et une carte coupee par le plancher se
## lit comme la fin de la colonne. Le pied FOND sur sa derniere bande, tant
## qu'il y a plus bas (scroll-fade.tsx). C'etait une fleche sur une pastille,
## qui couvrait les chiffres du terrier sur un telephone ; un fondu ne prend
## pas de place et dit la meme chose — le signe de toute liste qui defile.
## Ici c'est un shader sur la boite, herite par tout ce qu'elle contient,
## qui eteint l'alpha sur les 36 derniers pixels d'ecran.
##
## LES CARTES ARRIVENT EN CASCADE (UiEntrance, un pas d'ecart, en meme
## temps que la barre du haut et le sol) : toute la colonne est en place en une demi-seconde, parce
## qu'une entree qu'on attend a chaque retour chez soi cesse d'etre charmante
## a la troisieme.

## La ligne « et maintenant » a ete pressee ; `door` est ce qu'elle disait.
signal next_action(door: String)

const QUEST_CARD := preload("res://scenes/ui/quest_card.tscn")
const NEXT_STRIP := preload("res://scenes/ui/next_strip.tscn")
const GARDEN_CARD := preload("res://scenes/ui/garden_card.tscn")
const BURROW_PANEL := preload("res://scenes/ui/burrow_panel.tscn")

## `padding-right: 12px` : la colonne laisse un peu d'air a sa droite.
const PAD_RIGHT := 12.0
## L'ecart entre deux cartes ; 4 sur un ecran court, ou les 10 px de
## gouttiere coupaient la derniere carte d'exactement autant.
const GAP := 10.0
const GAP_SHORT := 4.0
## Le fondu du pied : court, pour que les chiffres du terrier restent
## lisibles jusqu'a une bande du plancher.
const FADE := 36.0
## La marge sous laquelle « au bout » vaut « au bout » (END_SLACK).
const END_SLACK := 4.0
## La reserve du sol au pied de la colonne (`--rr-col-floor`) : 108 sur un
## grand ecran ; la barre du sol (clamp(52px, 10.4svh, 80px)) plus l'air sur
## un ecran court. Kit.EDGE en moins, que le chrome retranche deja.
const FLOOR_TALL := 108.0
## L'entree : 380 ms, -32 px puis +5, (0.86, 1.08) puis (1.04, 0.96).

const FADE_SHADER := """
shader_type canvas_item;
uniform float foot_px = 1000000.0;
uniform float fade_px = 36.0;
void fragment() {
	float y = SCREEN_UV.y / SCREEN_PIXEL_SIZE.y;
	COLOR.a *= clamp((foot_px - y) / max(fade_px, 1.0), 0.0, 1.0);
}
"""

## Le banc n'a pas de monde : il force l'affichage.
@export var always_shown := false

var _scroll: ScrollContainer
var _stack: VBoxContainer
var _slots: Array[Control] = []
var _cards: Array[Control] = []
var _material: ShaderMaterial
var _editing := false
var _floor_override := -1.0
var _shown := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_scroll.clip_contents = true
	_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	_scroll.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_scroll.offset_right = -PAD_RIGHT
	add_child(_scroll)

	var shader := Shader.new()
	shader.code = FADE_SHADER
	_material = ShaderMaterial.new()
	_material.shader = shader
	_scroll.material = _material
	# Tout ce qui entre sous la boite herite du fondu — y compris ce que les
	# cartes ajouteront plus tard en se reecrivant.
	get_tree().node_added.connect(_inherit_fade)

	_stack = Kit.vbox(GAP)
	_stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_stack)

	for scene in [QUEST_CARD, NEXT_STRIP, GARDEN_CARD, BURROW_PANEL]:
		var card: Control = scene.instantiate()
		var slot := Control.new()
		slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_stack.add_child(slot)
		slot.add_child(card)
		Kit.fill(card)
		card.minimum_size_changed.connect(_fit_slot.bind(slot, card))
		card.visibility_changed.connect(_fit_slot.bind(slot, card))
		_slots.append(slot)
		_cards.append(card)
		_fit_slot(slot, card)
	_cards[1].connect("next_action", func(door: String) -> void: next_action.emit(door))

	_stack.minimum_size_changed.connect(_layout)
	_scroll.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void: _update_fade())
	resized.connect(_layout)
	get_viewport().size_changed.connect(_layout)
	Screens.changed.connect(_update_visible)
	_update_visible()
	_layout()


## Le sol pose ou leve le mode placement : la colonne s'efface pendant.
func set_editing(on: bool) -> void:
	_editing = on
	_update_visible()


## Ce que le sol prend au pied, en pixels, si le chrome le sait mieux que la
## regle du web. Negatif : la regle du web.
func set_floor_reserve(px: float) -> void:
	_floor_override = px
	_layout()


func _update_visible() -> void:
	var shown := always_shown or (Screens.in_world() and Screens.place == Screens.Place.BURROW)
	shown = shown and not _editing
	if shown == visible and _shown:
		return
	visible = shown
	if shown:
		_shown = true
		if not OS.has_environment("RR_NO_TOON"):
			# LA POSE DE DEPART TOUT DE SUITE, l'animation a la reouverture :
			# sinon les cartes, montees sous le noir, etaient en place quand
			# l'iris s'ouvrait, puis disparaissaient pour entrer.
			_toon_pose()
			Screens.on_reveal(_toon_in)


## Ce que les cartes occupent vraiment a l'ecran (la boite, pas l'hote qui
## descend jusqu'au sol) : ce qui se pose en bas l'evite (ArrangeBar).
func cards_rect() -> Rect2:
	if _scroll == null or not visible:
		return Rect2()
	return _scroll.get_global_rect()


func _floor_reserve() -> float:
	if _floor_override >= 0.0:
		return _floor_override
	var view := get_viewport_rect().size
	if view.y < HubCard.SHORT_VIEW:
		return clampf(view.y * 0.104, 52.0, 80.0) + Kit.PAD_TIGHT
	return FLOOR_TALL - Kit.EDGE


func _fit_slot(slot: Control, card: Control) -> void:
	slot.visible = card.visible
	slot.custom_minimum_size = Vector2(0, card.get_combined_minimum_size().y)


## LA BOITE : aussi haute que ses cartes, au plus jusqu'a la reserve du sol.
func _layout() -> void:
	if _scroll == null:
		return
	var short := get_viewport_rect().size.y < HubCard.SHORT_VIEW
	_stack.add_theme_constant_override("separation", int(GAP_SHORT if short else GAP))
	var wanted := _stack.get_combined_minimum_size().y
	var room := maxf(0.0, size.y - _floor_reserve())
	_scroll.offset_bottom = minf(wanted, room)
	_stack.custom_minimum_size = Vector2(maxf(0.0, size.x - PAD_RIGHT), 0)
	_update_fade.call_deferred()


## Le fondu, seulement tant qu'il y a plus bas ; le pied est le bas de la
## boite, en pixels d'ECRAN, puisque c'est la que le shader regarde.
func _update_fade() -> void:
	if _scroll == null or not is_inside_tree():
		return
	var more := _scroll.scroll_vertical + _scroll.size.y < _stack.size.y - END_SLACK
	if not more:
		_material.set_shader_parameter("foot_px", 1000000.0)
		return
	var to_screen := get_viewport().get_final_transform() * _scroll.get_global_transform_with_canvas()
	var foot := to_screen * Vector2(0.0, _scroll.size.y)
	var k := to_screen.get_scale().y
	_material.set_shader_parameter("foot_px", foot.y)
	_material.set_shader_parameter("fade_px", FADE * k)


func _inherit_fade(node: Node) -> void:
	if node is CanvasItem and _scroll != null and _scroll.is_ancestor_of(node):
		(node as CanvasItem).use_parent_material = true


## La premiere image de l'entree, au montage : les cartes eteintes.
func _toon_pose() -> void:
	UiEntrance.pose(_cards)


## L'ENTREE EN CASCADE (UiEntrance), de haut en bas, un pas d'ecart.
func _toon_in() -> void:
	var rank := UiEntrance.COLUMN_FIRST
	for card in _cards:
		# Kit.fill a la fin : la carte est ancree plein cadre dans son
		# emplacement, et la course a ecrit sa `position`.
		UiEntrance.play(card, UiEntrance.FROM_LEFT, rank, Kit.fill.bind(card))
		if card.visible:
			rank += 1
