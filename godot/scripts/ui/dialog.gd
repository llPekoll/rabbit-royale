class_name Dialog
extends Control
## UN DIALOGUE : le parchemin a cadre de feuilles, son titre, son [x], et un
## corps que chaque ecran remplit.
##
## Le web a neuf dialogues qui portaient neuf mises en page, « none of them
## chosen » (px-dialogs.css). Ici il n'y en a qu'une : un cadre de Kit.PAD
## d'air, un en-tete d'une ligne dont le [x] est A CHEVAL SUR LE COIN du
## cadre (runtime.css, -20 / -16), et un corps qui prend le reste. Un ecran
## qui veut autre chose le fait dans son corps, pas dans le cadre.
##
## LE DIALOGUE NE S'OUVRE PAS LUI-MEME : `Chrome.current.open(dialog)` le pose
## sur un voile, centre, et le retire quand `closed` part. C'est le chrome qui
## sait qu'un seul dialogue vit a la fois et ou est le voile.

## Le dialogue demande a se fermer — par le [x], par le voile, par Echap, ou
## parce qu'il a fini (un achat conclu). Le chrome le retire ensuite.
signal closed

## Le [x] du web deborde du cadre de ces deux offsets.
const CLOSE_OVER_TOP := -20.0
const CLOSE_OVER_RIGHT := -16.0

## Ce que l'ecran remplit. Un VBox par defaut ; l'ecran peut y mettre
## n'importe quoi ou le remplacer par `set_body`.
var body: Control
var title_label: Label
var close_button: TextureButton

var _frame: NineSlice
var _inset: MarginContainer
var _column: VBoxContainer
var _header: HBoxContainer


func _init(title: String = "", width: float = 420.0, height: float = 0.0) -> void:
	custom_minimum_size = Vector2(width, height)
	mouse_filter = Control.MOUSE_FILTER_STOP

	_frame = Kit.parchment()
	Kit.fill(_frame)
	add_child(_frame)

	var edge := _frame.inset()
	# Le HAUT a la bordure du web, 36px (runtime.css `fill / 36px`), pas a
	# la proportion de la source (110/90, 44px) : 8px de plus sous chaque
	# titre, sur des ecrans de 400px.
	_inset = Kit.margin(edge.x + Kit.PAD, minf(edge.y, Kit.LEAF_EDGE) + Kit.PAD, edge.z + Kit.PAD, edge.w + Kit.PAD)
	Kit.fill(_inset)
	add_child(_inset)
	# Le minimum du dialogue EST celui de son contenu (`_get_minimum_size`) :
	# quand l'un change, l'autre doit le dire, ou le chrome ne recentre pas.
	_inset.minimum_size_changed.connect(update_minimum_size)

	_column = Kit.vbox(Kit.PAD)
	_inset.add_child(_column)

	_header = Kit.hbox(Kit.PAD)
	_column.add_child(_header)
	title_label = Kit.title(title, 20, Palette.CREAM)
	# LE TITRE DE PANNEAU du web (`PanelTitle`, la face du kit) : lettres
	# claires dans un cerne d'encre epais, et une ombre d'un pixel. En encre
	# sur le parchemin, il se lisait comme une ligne du corps.
	title_label.add_theme_color_override("font_outline_color", Palette.INK)
	title_label.add_theme_constant_override("outline_size", 4)
	title_label.add_theme_color_override("font_shadow_color", Palette.INK)
	title_label.add_theme_constant_override("shadow_offset_x", 0)
	title_label.add_theme_constant_override("shadow_offset_y", 2)
	if not I18N.pixel_face():
		# Fusion Pixel (hors anglais) est une face BITMAP : Godot ne sait pas
		# lui tracer de cerne ni d'ombre (l'ombre porte un cerne d'un pixel),
		# et les deux la dechiquetaient (« QUELLE ÎLE » illisible). En encre
		# pleine, a 24 — le double exact de ses 12.
		title_label.add_theme_font_size_override("font_size", 24)
		title_label.add_theme_constant_override("outline_size", 0)
		title_label.add_theme_color_override("font_color", Palette.INK)
		title_label.add_theme_color_override("font_shadow_color", Color.TRANSPARENT)
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_label.clip_text = true
	_header.add_child(title_label)
	# L'en-tete cede la colonne du [x], pour qu'un titre long finisse avant
	# lui au lieu de passer dessous.
	var reserve := Control.new()
	reserve.custom_minimum_size = Vector2(30.0, 0.0)
	_header.add_child(reserve)
	_header.visible = not title.is_empty()

	body = Kit.vbox(Kit.PAD)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_column.add_child(body)

	close_button = Kit.close_button()
	close_button.pressed.connect(func() -> void: closed.emit())
	add_child(close_button)
	# PAS d'ancre a droite : `_place_close` le repose en coordonnees a chaque
	# redimensionnement, et les deux ensemble l'envoyaient hors de l'ecran
	# quand le chrome retrecissait le dialogue (x = 987 sur 890).
	close_button.position = Vector2(width - Kit.CLOSE_TAP - CLOSE_OVER_RIGHT, CLOSE_OVER_TOP)
	resized.connect(_place_close)


## LE DIALOGUE MESURE SON CONTENU. Le cadre et la marge sont ancres, pas
## mesures : sans ceci un dialogue a hauteur libre valait 0px de haut, son
## parchemin ne se dessinait pas et son corps debordait sous le voile (la
## liste des iles, 2026-09-23). La boutique le faisait deja pour elle seule.
func _get_minimum_size() -> Vector2:
	return _inset.get_combined_minimum_size() if _inset != null else Vector2.ZERO


## LE [x] AU-DESSUS DE TOUT. Un ecran qui ajoute ses noeuds dans son
## `_ready` (le profil) les posait PAR-DESSUS lui, et le [x] disparaissait.
## NOTIFICATION_READY arrive a chaque classe, apres le `_ready` de l'ecran.
func _notification(what: int) -> void:
	if what == NOTIFICATION_READY and close_button != null:
		move_child(close_button, get_child_count() - 1)


func _place_close() -> void:
	close_button.position = Vector2(size.x - Kit.CLOSE_TAP - CLOSE_OVER_RIGHT, CLOSE_OVER_TOP)


## Remplace le corps par un noeud de l'ecran (un ScrollContainer, une grille).
##
## A LA PLACE de l'ancien, pas au bout : un ecran qui pose son pied dans
## `_ready` puis reconstruit son corps (le codex, a chaque langue) le
## voyait passer SOUS le pied.
func set_body(node: Control) -> void:
	var at := _column.get_child_count()
	if body != null:
		at = body.get_index()
		_column.remove_child(body)
		body.queue_free()
	body = node
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_column.add_child(body)
	_column.move_child(body, at)


func set_title(text: String) -> void:
	title_label.text = I18N.shout(text)
	_header.visible = not text.is_empty()


## Un pied sous le corps — un bouton, une ligne de solde.
func add_footer(node: Control) -> void:
	_column.add_child(node)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		closed.emit()
		get_viewport().set_input_as_handled()
