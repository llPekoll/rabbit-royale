class_name RevengeOffer
extends Control
## LA RIPOSTE : quelqu'un vient de me pousser, de me foudroyer ou de m'encrer,
## son nom est encore rouge au-dessus de sa tete — et l'eclair est offert LA,
## sur lui, en un tap.
##
## Ce qu'il a decide (2026-09-30) :
##
##   • C'EST UN ACHAT PLAISIR, PAS UN ACHAT QUI FAIT GAGNER. Foudroyer celui
##     qui vient de nous noyer ne rapporte rien ; ca fait du bien. D'ou une
##     offre franche, a chaud, sans quota : c'est le moment ou le joueur en a
##     le plus envie, et un bouton grise a cet instant etait un achat perdu.
##   • UN TAP, PAS DEUX. Sac vide : le tap achete ET tire. Dans le sac : il
##     tire. Pas de visee — la cible est celui qui a frappe, la ou il se
##     tient maintenant (le serveur foudroie le carre autour de la case).
##   • ELLE PASSE. Une riposte vaut tant que le coup est frais : la bande
##     s'use sous le bouton et l'offre s'en va avec elle. Un nouveau coup la
##     relance, sur le nouveau coupable.
##   • PAS DE BOUTON MORT : sans eclair en sac ET sans de quoi en payer un,
##     l'offre ne se montre pas — la meme regle que l'etal.
##
## Le HUD de manche la pose (run_hud.gd) ; le banc (revenge_bench.gd) remplace
## `strike` pour jouer l'eclair sans serveur.

## Combien de temps la riposte reste offerte.
const OFFER_SECONDS := 6.0
const WIDTH := 300.0
const BLAME := Color("#ff6b5e")

## La riposte vient d'etre prise (achat compris) sur ce rival.
signal taken(by_id: String)

## LE COUP LUI-MEME, remplacable : par defaut, acheter si le sac est vide
## puis `RunState.lightning` sur la case du coupable. Rend vrai si l'eclair est
## parti. Le banc y met sa propre mise en scene.
var strike: Callable = _strike_for_real

var _by := ""
var _plate: PanelContainer
var _say: Label
var _button: PlankButton
var _wear: ProgressBar
var _left := 0.0
var _busy := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	visible = false
	set_process(false)
	ShopState.shared().changed.connect(_relabel)
	RunState.current.bag_changed.connect(_relabel)
	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())


func _build() -> void:
	# En bas, au milieu, au-dessus du bouton MARK A BOMB qui tient le coin
	# droit : le pouce est deja la.
	_plate = Kit.panel(Kit.style_glass())
	_plate.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_plate.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_plate.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_plate.custom_minimum_size.x = WIDTH
	add_child(_plate)
	var col := Kit.vbox(Kit.PAD_TIGHT)
	_plate.add_child(col)

	_say = Kit.label("", 14, BLAME, true)
	_say.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_say)

	_button = Kit.button("", "gold", 0, 48)
	_button.label_size = 14
	_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button.pressed.connect(_on_take)
	col.add_child(_button)

	# L'USURE : la riposte a un temps, et il se voit.
	_wear = ProgressBar.new()
	_wear.show_percentage = false
	_wear.custom_minimum_size = Vector2(0, 4)
	_wear.max_value = 1.0
	_wear.step = 0.0
	var fill := StyleBoxFlat.new()
	fill.bg_color = BLAME
	fill.set_corner_radius_all(2)
	_wear.add_theme_stylebox_override("fill", fill)
	var track := StyleBoxFlat.new()
	track.bg_color = Color(0, 0, 0, 0.35)
	track.set_corner_radius_all(2)
	_wear.add_theme_stylebox_override("background", track)
	col.add_child(_wear)
	_place()
	get_viewport().size_changed.connect(_place)


func _place() -> void:
	var view := get_viewport_rect().size
	var w := minf(WIDTH, view.x - 2.0 * Kit.EDGE)
	_plate.custom_minimum_size.x = w
	_plate.offset_left = -w * 0.5
	_plate.offset_right = w * 0.5
	# Sur un telephone etroit, le bouton MARK A BOMB occupe le coin : on monte
	# d'une rangee pour ne pas s'y poser dessus.
	var lift := Kit.EDGE + (64.0 if view.x < WIDTH + 2.0 * 190.0 else 0.0)
	_plate.offset_bottom = -lift
	_plate.offset_top = -lift - _plate.get_combined_minimum_size().y


# ── L'offre ──────────────────────────────────────────────────────────────────

## `how` : "shove" | "bolt" | "bloop". Rend vrai si l'offre s'est montree.
func offer(by_id: String, how: String) -> bool:
	var run := RunState.current
	if not may_offer(run, by_id):
		return false
	var name := run.name_of(by_id)
	if name.is_empty():
		name = I18N.t("raid.aRival")
	match how:
		"bolt":
			_say.text = I18N.f("revenge.struck", [name])
		"bloop":
			_say.text = I18N.f("revenge.inked", [name])
		_:
			_say.text = I18N.f("shove.by", [name])
	_by = by_id
	_busy = false
	_left = OFFER_SECONDS
	_relabel()
	if not visible:
		visible = true
		_plate.pivot_offset = _plate.size * 0.5
		_plate.scale = Vector2(0.6, 0.6)
		_plate.modulate.a = 0.0
		var t := create_tween().set_parallel(true)
		t.tween_property(_plate, "scale", Vector2.ONE, 0.28).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t.tween_property(_plate, "modulate:a", 1.0, 0.15)
	set_process(true)
	return true


## PEUT-ON OFFRIR ? Une ile ou l'on se bat, en jouant (pas en regardant), un
## coupable encore debout sur l'ile, et un eclair en sac ou de quoi le payer.
static func may_offer(run: RunState, by_id: String) -> bool:
	if by_id.is_empty() or by_id == run.my_id() or not run.spectating.is_empty():
		return false
	if not run.may_fight_here():
		return false
	var r: Variant = run.rabbits.get(by_id)
	if not (r is Dictionary) or not bool(r.get("alive", true)):
		return false
	var mine: Variant = run.rabbits.get(run.my_id())
	if mine is Dictionary and not bool(mine.get("alive", true)):
		return false
	if int(run.bag.get("lightning", 0)) > 0:
		return true
	var shop := ShopState.shared()
	return shop.can_buy(shop.item("lightning"))


## L'offre est a l'ecran, et dit donc deja qui a frappe.
func showing() -> bool:
	return visible and not _by.is_empty()


func dismiss() -> void:
	set_process(false)
	_by = ""
	if not visible:
		return
	var t := create_tween()
	t.tween_property(_plate, "modulate:a", 0.0, 0.2)
	t.tween_callback(func() -> void: visible = false)


func _process(delta: float) -> void:
	if _busy:
		return
	_left -= delta
	_wear.value = clampf(_left / OFFER_SECONDS, 0.0, 1.0)
	if _left <= 0.0:
		dismiss()


## « FOUDROIE-LE · 1 » quand il y en a en sac, « FOUDROIE-LE · 150 🥕 » sinon.
func _relabel() -> void:
	if _button == null:
		return
	var held := int(RunState.current.bag.get("lightning", 0))
	var words := I18N.shout(I18N.t("revenge.strike"))
	var carrot: TextureRect = _button._ink.get_node_or_null("Carrot")
	if held > 0:
		_button.relabel("%s · %d" % [words, held])
		if carrot != null:
			carrot.visible = false
	else:
		var price := int(ShopState.shared().item("lightning").get("price", 0))
		_button.relabel("%s · %s   " % [words, I18N.group_digits(price)])
		_carrot()
	_button.disabled = _busy


## La carotte au bout du prix — la meme que l'offre d'energie.
func _carrot() -> void:
	var ink: Label = _button._ink
	var icon: TextureRect = ink.get_node_or_null("Carrot")
	if icon == null:
		icon = Kit.icon(Kit.ICONS["carrot"], 14)
		icon.name = "Carrot"
		ink.add_child(icon)
		_button.resized.connect(func() -> void:
			if int(RunState.current.bag.get("lightning", 0)) <= 0:
				_carrot())
	icon.visible = true
	var font := ink.get_theme_font("font")
	var fs := ink.get_theme_font_size("font_size")
	var w := font.get_string_size(ink.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	icon.position = Vector2(floor(ink.size.x * 0.5 + w * 0.5 - 14.0), floor((ink.size.y - 14.0) * 0.5))


func _on_take() -> void:
	if _busy or _by.is_empty():
		return
	_busy = true
	_relabel()
	var by := _by
	var bought := int(RunState.current.bag.get("lightning", 0)) <= 0
	var ok: bool = await strike.call(by)
	_busy = false
	if ok:
		Analytics.track("revenge_strike", {"bought": bought})
		taken.emit(by)
		dismiss()
	else:
		_relabel()


## LE VRAI COUP : acheter s'il le faut (le recu passe par le toast de
## l'etal, un refus aussi), puis l'eclair sur la case ou le coupable se tient
## MAINTENANT — il a pu bouger depuis la poussee.
func _strike_for_real(by: String) -> bool:
	var run := RunState.current
	if int(run.bag.get("lightning", 0)) <= 0:
		var res: Dictionary = await ShopState.shared().buy("lightning")
		if res.is_empty():
			return false
	var r: Variant = run.rabbits.get(by)
	if not (r is Dictionary) or not bool(r.get("alive", true)):
		return false
	run.lightning(int(r.get("tile", 0)))
	return true
