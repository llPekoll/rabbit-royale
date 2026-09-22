class_name Chrome
extends Control
## LE CHROME — ce qui survit AU-DESSUS du monde : la barre du haut, la
## colonne du terrier, le sol aux trois verbes, les pastilles, les dialogues.
##
## Il vit dans l'etage `Chrome` de main.tscn, entre le monde et le rideau,
## pour la raison que ce fichier-la donne : un dialogue ouvert ne meurt pas
## parce que le sol a change dessous. Il est monte UNE FOIS par la racine et
## ne se recharge jamais ; ce sont ses pieces qui apparaissent et
## disparaissent avec le lieu.
##
## CINQ ETAGES, dans l'ordre ou ils se dessinent, comme main.tscn :
##
##   Column    la colonne du terrier (quete, jardin, terrier) — a gauche.
##   Floor     le sol : DIG · DEFEND · RAID, ou ce que le lieu y met.
##   TopBar    le joueur a gauche, la pastille au centre, le rail a droite.
##   Toasts    ce que le terrier dit, sous la pastille.
##   Overlays  les tampons plein ecran (niveau, raid subi, victoire).
##   Dialogs   un voile et UN dialogue a la fois, centre.
##
## CHAQUE ETAGE LAISSE PASSER LES CLICS qu'il ne couvre pas (mouse_filter
## IGNORE sur les conteneurs) : le sol du terrier se tape a travers eux. Seuls
## les panneaux prennent les leurs.
##
## LES PIECES NE SONT PAS ICI. Chaque panneau est sa propre scene sous
## scenes/ui/, et ce fichier les monte a leur etage dans `_mount`. Un panneau
## qui n'existe pas encore est une ligne de moins, pas un trou.

## Le chrome vivant, pour qui doit lui parler : `Chrome.current.toast(...)`,
## `Chrome.current.open(dialog)`.
static var current: Chrome

## Combien de temps une pastille reste, et son fondu.
const TOAST_SECONDS := 3.2
const TOAST_FADE := 0.35

@onready var column: Control = %Column
@onready var floor_host: Control = %Floor
@onready var top_bar: Control = %TopBar
@onready var toasts: VBoxContainer = %Toasts
@onready var overlays: Control = %Overlays
@onready var dialogs: Control = %Dialogs

var _scrim: ColorRect
var _dialog: Control


func _ready() -> void:
	current = self
	visible = Screens.in_world()
	Screens.world_shown.connect(_on_world_shown)
	Screens.moved.connect(_on_moved)
	Home.noted.connect(toast)
	get_viewport().size_changed.connect(_measure)
	_measure()
	_mount()


## LES PANNEAUX, a leur etage. Chacun est une scene sous scenes/ui/ ; il
## lit Home, Session, GameSocket et Screens lui-meme, et se cache tout seul
## quand le lieu ne le concerne pas.
func _mount() -> void:
	pass


func _on_world_shown(shown: bool) -> void:
	visible = shown
	if not shown:
		close_dialog()


func _on_moved(_place: int) -> void:
	# Un dialogue ouvert sur un lieu ne suit pas le joueur sur l'autre.
	close_dialog()


## LA MISE EN PAGE (globals.css) : la barre du haut est une bande epinglee
## de TOPBAR_H ; la colonne prend max(25vw, 220px) a gauche, sous la barre ;
## le sol est une bande en bas ; les pastilles se centrent sous la barre.
func _measure() -> void:
	var view := get_viewport_rect().size
	top_bar.offset_bottom = Kit.TOPBAR_H

	var column_w := maxf(view.x * 0.25, 220.0)
	column.offset_left = Kit.EDGE
	column.offset_top = Kit.TOPBAR_H
	column.offset_right = Kit.EDGE + column_w
	column.offset_bottom = -Kit.EDGE

	toasts.offset_top = Kit.TOPBAR_H + Kit.PAD_TIGHT
	var toast_w := minf(560.0, view.x - 2.0 * (column_w + 24.0))
	toasts.offset_left = -toast_w * 0.5
	toasts.offset_right = toast_w * 0.5


# ── Les pastilles ────────────────────────────────────────────────────────────

## CE QUE LE TERRIER DIT, sous la pastille : une legende sombre, rouge a
## l'encre si c'est un refus. Une seule a la fois — la nouvelle remplace
## l'ancienne, comme `setNote` sur le web.
func toast(text: String, refused: bool = false) -> void:
	for old in toasts.get_children():
		old.queue_free()
	if text.is_empty():
		return
	var note := Kit.caption(text, refused)
	note.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	toasts.add_child(note)
	var tween := create_tween()
	tween.tween_interval(TOAST_SECONDS)
	tween.tween_property(note, "modulate:a", 0.0, TOAST_FADE)
	tween.tween_callback(note.queue_free)


# ── Les dialogues ────────────────────────────────────────────────────────────

## OUVRIR UN DIALOGUE : un voile sur tout l'ecran, le dialogue centre dessus,
## a Kit.EDGE du bord au moins. Un dialogue deja ouvert est ferme d'abord —
## un seul a la fois, comme le web.
##
## `dismiss` : le voile ferme au clic. Vrai pour tout ce qu'on consulte, faux
## pour ce qui attend une reponse (un paiement en cours).
func open(dialog: Control, dismiss: bool = true) -> void:
	close_dialog()
	_scrim = ColorRect.new()
	_scrim.color = Palette.SCRIM
	_scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(_scrim)
	dialogs.add_child(_scrim)
	if dismiss:
		_scrim.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed:
				close_dialog())

	_dialog = dialog
	dialogs.add_child(dialog)
	dialog.set_anchors_preset(Control.PRESET_CENTER)
	_center_dialog()
	dialog.resized.connect(_center_dialog)
	if dialog.has_signal("closed"):
		dialog.connect("closed", close_dialog)
	dialogs.mouse_filter = Control.MOUSE_FILTER_STOP

	# L'arrivee du web (`rr-shop-in`, 140 ms) : le voile et le dialogue
	# montent en fondu ensemble.
	dialogs.modulate.a = 0.0
	create_tween().tween_property(dialogs, "modulate:a", 1.0, 0.14)


func _center_dialog() -> void:
	if _dialog == null:
		return
	var view := get_viewport_rect().size
	var wanted := _dialog.get_combined_minimum_size()
	var w := minf(wanted.x, view.x - 2.0 * Kit.EDGE)
	var h := minf(maxf(wanted.y, _dialog.size.y), view.y - 2.0 * Kit.EDGE)
	_dialog.size = Vector2(w, h)
	_dialog.position = ((view - _dialog.size) * 0.5).floor()


func close_dialog() -> void:
	if _dialog != null:
		_dialog.queue_free()
		_dialog = null
	if _scrim != null:
		_scrim.queue_free()
		_scrim = null
	dialogs.mouse_filter = Control.MOUSE_FILTER_IGNORE


func dialog_open() -> bool:
	return _dialog != null


## Un tampon plein ecran (niveau gagne, raid subi) : pose sur l'etage des
## overlays, il se retire lui-meme.
func stamp(node: Control) -> void:
	overlays.add_child(node)
	Kit.fill(node)
