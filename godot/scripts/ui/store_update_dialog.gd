class_name StoreUpdateDialog
extends Dialog
## « UNE NOUVELLE VERSION EST SUR LE STORE » (iOS, StoreUpdate) : le bouton ouvre
## la page de l'app dans l'App Store. Se ferme au [x] ou au voile : le jeu
## d'avant marche encore, on le redit au lancement suivant.

const WIDTH := 380.0
const BUTTON_H := 44.0

var _url := ""


func _init(url: String) -> void:
	super(I18N.t("update.title"), WIDTH, 0.0)
	_url = url


func _ready() -> void:
	ink_title()
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	body.add_child(Kit.note(I18N.t("update.storeBody"), Palette.INK, 12))
	var b := Kit.button(I18N.shout(I18N.t("update.storeButton")), "wood", 0.0, BUTTON_H)
	b.name = "StoreUpdate"
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(func() -> void: OS.shell_open(_url))
	add_footer(b)


## SUR L'ACCUEIL, qui n'a pas de chrome : un voile a nous, le dialogue centre
## dessus (meme montage qu'EmailDialog.ask_on).
static func ask_on(host: Control, url: String) -> StoreUpdateDialog:
	var layer := Control.new()
	layer.name = "StoreUpdateLayer"
	layer.z_index = 200
	layer.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(layer)
	var scrim := ColorRect.new()
	scrim.color = Palette.SCRIM
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(scrim)
	layer.add_child(scrim)
	var dialog := StoreUpdateDialog.new(url)
	layer.add_child(dialog)
	host.add_child(layer)
	dialog.closed.connect(layer.queue_free)
	scrim.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed:
			dialog.close_requested())
	dialog.get_viewport().size_changed.connect(dialog._center)
	dialog.minimum_size_changed.connect(dialog._center)
	dialog._center.call_deferred()
	return dialog


## La regle du chrome (`_center_dialog`), comme EmailDialog.
func _center() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var want := get_combined_minimum_size()
	size = Vector2(minf(want.x, view.x - 2.0 * Kit.EDGE), minf(want.y, view.y - 2.0 * Kit.EDGE))
	position = ((view - size) * 0.5).floor().max(Vector2(Kit.EDGE, Kit.EDGE))
