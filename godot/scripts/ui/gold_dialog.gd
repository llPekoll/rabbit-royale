class_name GoldDialog
extends Dialog
## LES SACHETS DE GOLD (monde web2, StorePay) : la monnaie que le store vend,
## et qui paie ensuite tout l'etal — objets, packs, skins (lib/game/gold.ts).
##
## Une ligne par sachet : le Gold, le bonus sur le plus petit, et le prix de
## Play dans la monnaie du joueur. Ouvert par la bourse de la boutique, ou
## par un prix en Gold que la bourse ne paie pas (`need`). Hors du build Play
## (web, bureau) : le mot qui dit ou il s'achete, sans bouton mort.

const WIDTH := 400.0
const ROW_H := 36.0

var _store: StorePay
var _need := false
var _rows: VBoxContainer
var _purse: Label


func _init(need := false) -> void:
	super(I18N.t("gold.title"), WIDTH, 0.0)
	_need = need


func _ready() -> void:
	ink_title()
	_store = StorePay.shared()
	_store.changed.connect(_fill)
	_store.got_gold.connect(func(_qty: int) -> void: _fill())
	ShopState.shared().changed.connect(_fill)
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	var line := Kit.hbox()
	line.alignment = BoxContainer.ALIGNMENT_CENTER
	line.add_child(Kit.icon(Kit.ICONS["gold"], 26.0))
	_purse = Kit.title("", 20)
	_purse.name = "GoldPurse"
	line.add_child(_purse)
	body.add_child(line)
	body.add_child(Kit.wrapped(Kit.note(I18N.t("gold.need") if _need else I18N.t("gold.body"), Palette.INK, 12)))
	_rows = Kit.vbox(2.0)
	body.add_child(_rows)
	_fill()


func _fill() -> void:
	if not is_instance_valid(_rows):
		return
	_purse.text = I18N.group_digits(ShopState.shared().gold())
	for child in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	var sachets := _store.sachets()
	if sachets.is_empty():
		_rows.add_child(Kit.wrapped(Kit.note(I18N.t("gold.inApp"), Palette.INK, 12)))
		return
	for s: Dictionary in sachets:
		var id := String(s["id"])
		var row := Kit.hbox()
		row.name = "Sachet_" + id
		row.custom_minimum_size.y = ROW_H
		row.add_child(Kit.icon(Kit.ICONS["gold"], 22.0))
		var amount := Kit.title(I18N.f("gold.amount", [I18N.group_digits(int(s["qty"]))]), 16)
		amount.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		amount.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		row.add_child(amount)
		var extra := _store.bonus(id)
		if extra > 0:
			var tag := Kit.title(I18N.f("gold.bonus", [extra]), 13, Palette.BARK)
			tag.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			row.add_child(tag)
		var words := I18N.t("skins.wait") if _store.buying == id else String(s["price"])
		var b := Kit.button(words, "wood", 120.0, ROW_H - 4.0)
		b.name = "Buy_" + id
		b.disabled = not _store.buying.is_empty()
		b.pressed.connect(func() -> void: _store.buy(id))
		row.add_child(b)
		_rows.add_child(row)


## SUR LA BOUTIQUE (plein ecran, pas de chrome dessous) : un voile a nous, le
## dialogue centre dessus (meme montage que StoreUpdateDialog.ask_on).
static func ask_on(host: Control, need := false) -> GoldDialog:
	var layer := Control.new()
	layer.name = "GoldLayer"
	layer.z_index = 200
	layer.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(layer)
	var scrim := ColorRect.new()
	scrim.color = Palette.SCRIM
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(scrim)
	layer.add_child(scrim)
	var dialog := GoldDialog.new(need)
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


func _center() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var want := get_combined_minimum_size()
	size = Vector2(minf(want.x, view.x - 2.0 * Kit.EDGE), minf(want.y, view.y - 2.0 * Kit.EDGE))
	position = ((view - size) * 0.5).floor().max(Vector2(Kit.EDGE, Kit.EDGE))
