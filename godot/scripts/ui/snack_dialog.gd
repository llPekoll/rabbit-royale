class_name SnackDialog
extends Dialog
## Le comptoir de Snack Time. Les jours 1–6 gardent leur rail et mettent
## la récolte du jour au premier plan. Le rail et les packs restent à la
## même place au jour 7 : seule la récolte disparaît, les choix s’activent.
## Le décor ne porte aucun texte ni objet : chaque récompense est un
## sprite indépendant, les boutons et les socles ne bougent jamais.

const CABINET := preload("res://assets/ui/snack/cabinet.png")
const PLINTH := preload("res://assets/ui/snack/plinth.png")
const GREY := preload("res://shaders/grey.gdshader")
## La prise : les carottes du socle sautent et filent a la pastille, comme
## la recolte du potager (burrow_props.gd `_fly`).
const FLY_STAGGER := 0.07
const FLY_SIDE := 34.0
const DESIGN := Vector2(890, 400)

var _state: SnackState
var _canvas: Control
var _content: Control
var _last: Dictionary = {}
var _buttons: Array[BaseButton] = []
var _wait_labels: Array[Label] = []
## Les planches grisees du snack qui vient : elles portent le compte a rebours.
var _wait_buttons: Array[PlankButton] = []
var _clock := 0.0
var _claim_at := Vector2(270, 214)
## Les carottes posees sur le socle : d'ou partent celles qui volent, et
## celles du lendemain qui arrivent apres elles.
var _harvest_items: Array[FloatingItem] = []
var _fly_from: Array[Vector2] = []


func _init() -> void:
	super("", 0.0, 0.0)
	go_fullscreen()
	_frame.hide()
	_inset.hide()


func _get_minimum_size() -> Vector2:
	return Vector2.ZERO


func hug_size() -> Vector2:
	return DESIGN * 1.2


static func open() -> SnackDialog:
	var dialog := SnackDialog.new()
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	Analytics.track("snack_open")
	# Un banc peut poser son propre etat avant l'entree dans l'arbre.
	if _state == null:
		_state = SnackState.shared()
	_canvas = Control.new()
	_canvas.name = "Cabinet"
	_canvas.size = DESIGN
	add_child(_canvas)
	_picture(_canvas, CABINET, Rect2(Vector2.ZERO, DESIGN), false)
	_state.changed.connect(_rebuild)
	_state.claimed.connect(_on_claimed)
	I18N.locale_changed.connect(func(_c: String) -> void: _rebuild())
	resized.connect(_layout)
	_rebuild()
	_layout()
	_state.refresh()


func _layout() -> void:
	if _canvas == null:
		return
	var k := minf(size.x / DESIGN.x, size.y / DESIGN.y)
	_canvas.scale = Vector2.ONE * k
	_canvas.position = ((size - DESIGN * k) * 0.5).floor()
	_place_close()


func _place_close() -> void:
	if _canvas == null or close_button == null:
		return
	close_button.scale = _canvas.scale
	close_button.position = _canvas.position + Vector2(836, 12) * _canvas.scale


func _rebuild() -> void:
	if _canvas == null:
		return
	_buttons.clear()
	_wait_labels.clear()
	_wait_buttons.clear()
	_harvest_items.clear()
	if _content != null:
		_canvas.remove_child(_content)
		_content.queue_free()
	_content = Control.new()
	_content.name = "Rewards"
	_content.size = DESIGN
	_canvas.add_child(_content)
	_label(_content, I18N.shout(I18N.t("snack.title")), Rect2(55, 11, 640, 34), 24, Palette.CREAM)
	_label(_content, I18N.f("snack.dayOf", [_state.day()]) if _state.known() else "", Rect2(692, 14, 134, 28), 14, Palette.PARCHMENT)
	if not _state.known():
		var spinner := CarrotLoader.new()
		spinner.side = 36
		spinner.position = Vector2(427, 175)
		_content.add_child(spinner)
		return
	_build_rail()
	if not _state.is_pack_day():
		_build_harvest()
	else:
		_label(_content, I18N.t("snack.pick") if _state.ready() else I18N.t("snack.tomorrowPack"), Rect2(64, 189, 410, 38), 22, Palette.GOLD)
		if not _state.ready():
			_wait_labels.append(_label(_content, "", Rect2(64, 236, 410, 28), 13, Palette.PARCHMENT))
			_update_wait()
	# Mêmes positions, tailles et socles pendant toute la semaine.
	_label(_content, I18N.f("snack.day", [7]), Rect2(490, 133, 348, 23), 17, Palette.GOLD)
	_pack_face(Rect2(490, 161, 168, 197), "magic_hat", _state.is_pack_day() and _state.ready())
	_pack_face(Rect2(670, 161, 168, 197), "lucky_foot", _state.is_pack_day() and _state.ready())
	_build_footer()
	move_child(close_button, get_child_count() - 1)


func _build_rail() -> void:
	for d in range(1, 7):
		var x := 35.0 + (d - 1) * 137.0
		var today := d == _state.day() and _state.ready()
		var card := _panel(_content, Rect2(x, 63, 128, 62), today)
		_label(card, I18N.f("snack.day", [d]), Rect2(4, 9, 118, 16), 11, Palette.GOLD if today else Palette.PARCHMENT)
		_rail_reward(card, d)
		if d <= _state.taken():
			_tick(card, Vector2(108, 9))
		elif today:
			card.tooltip_text = I18N.t("snack.today")


## UNE CAROTTE DE PLUS CHAQUE JOUR : le tas grandit le long de la semaine,
## et le tas + le montant restent centres sur la carte.
func _rail_reward(card: Control, d: int) -> void:
	const SIDE := 20.0
	const STEP := 8.0
	var text := "+%d" % int(_state.day_info(d).get("carrots", 0))
	var amount := _label(card, text, Rect2(0, 29, 66, 23), 17, Palette.CREAM)
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	var px := amount.get_theme_font_size("font_size")
	var text_w := amount.get_theme_font("font").get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x + 4.0
	var pile_w := SIDE + (d - 1) * STEP
	var x := roundf((card.size.x - (pile_w + 3.0 + text_w)) * 0.5)
	for i in d:
		_picture(card, Kit.ICONS["carrot"], Rect2(x + i * STEP, 30 - (i % 2) * 3, SIDE, SIDE))
	amount.position.x = x + pile_w + 3.0
	amount.size.x = text_w
	card.move_child(amount, card.get_child_count() - 1)


func _build_harvest() -> void:
	var ready_now := _state.ready()
	var amount := int(_state.day_info(_state.day()).get("carrots", 0))
	_label(_content, I18N.t("snack.ready") if ready_now else I18N.f("snack.tomorrow", [amount]), Rect2(54, 132, 434, 23), 16, Palette.PARCHMENT)
	_picture(_content, PLINTH, Rect2(138, 235, 265, 83))
	var harvest := Control.new()
	harvest.name = "CarrotHarvest"
	harvest.position = Vector2(139, 156)
	harvest.size = Vector2(264, 118)
	_content.add_child(harvest)
	if ready_now:
		_reward_light(harvest, Vector2(132, 60), 185, Palette.CARROT)
	# Le nombre de sprites suit le montant, pas le numéro du jour.
	var count := clampi(int(ceil(amount / 25.0)), 1, 12)
	var cols := mini(count, 4)
	var rows := int(ceil(float(count) / cols))
	for i in count:
		var row := i / cols
		var in_row := mini(cols, count - row * cols)
		var x := 132.0 + (i % cols - (in_row - 1) * 0.5) * 38.0
		var y := 18.0 + row * 34.0 - (rows - 1) * 8.0
		var carrot := _float_picture(harvest, Kit.ICONS["carrot"], Rect2(x - 30, y, 60, 60), ready_now, i * 1.15)
		# Celles de demain se voient, mais en gris : pas encore a toi.
		if not ready_now:
			var grey := ShaderMaterial.new()
			grey.shader = GREY
			carrot.art.material = grey
		_harvest_items.append(carrot)
	if ready_now:
		_sparkles(harvest, Rect2(14, 0, 236, 116))
	_label(_content, "+%d" % amount, Rect2(147, 274, 245, 36), 27, Palette.GOLD if ready_now else Palette.PARCHMENT.darkened(0.25))
	# Demain : la meme planche, grisee, qui compte les heures.
	_action(_content, I18N.t("snack.take"), Rect2(159, 312, 224, 44), "", ready_now)


func _pack_face(rect: Rect2, pack: String, active: bool) -> void:
	var face := Control.new()
	face.name = pack
	face.position = rect.position
	face.size = rect.size
	_content.add_child(face)
	var w := rect.size.x
	var heading := I18N.shout(SnackState.pack_name(pack))
	_label(face, heading, Rect2(0, 0, w, 25), 14, Palette.CREAM)
	_label(face, I18N.t("snack.hatWhat") if pack == "magic_hat" else I18N.t("snack.footWhat"), Rect2(0, 24, w, 18), 11, Palette.PARCHMENT)
	var art_top := 50.0
	var art_height := 66.0
	var plinth_rect := Rect2(0, 107, w, 64)
	if active:
		_reward_light(face, Vector2(w * 0.5, 84), 140, Palette.GOLD)
	_picture(face, PLINTH, plinth_rect)
	var items := _state.pack_items(pack)
	for i in items.size():
		var item: Variant = items[i]
		if not item is Dictionary:
			continue
		var kind := String(item.get("kind", ""))
		var h := art_height * 0.9
		var art := ItemSlot.art_for(kind, h)
		var aw: float = art.custom_minimum_size.x
		var fraction := float(i + 1) / float(items.size() + 1)
		var at := Vector2(w * fraction - aw * 0.5, art_top + (7 if i == 0 else 0))
		var floating := FloatingItem.new()
		floating.name = "Float_" + kind
		floating.position = at
		floating.size = Vector2(aw, h + 20)
		floating.amplitude = 4.0 if active else 2.0
		floating.phase = i * 1.9 + (0.8 if pack == "lucky_foot" else 0.0)
		face.add_child(floating)
		art.position = Vector2.ZERO
		art.size = Vector2(aw, h)
		floating.add_floating(art)
		var qty := int(item.get("qty", 1))
		if qty > 1:
			var count := _label(art, "x%d" % qty, Rect2(aw - 24, h - 13, 33, 21), 13, Palette.CREAM)
			count.add_theme_constant_override("outline_size", 4)
			count.add_theme_color_override("font_outline_color", Palette.SOIL_DEEP)
	if active:
		_sparkles(face, Rect2(4, 44, w - 8, 85))
	_action(face, I18N.t("snack.choose"), Rect2(3, 153, w - 6, 44), pack, active)


func _build_footer() -> void:
	var text := I18N.t("snack.keepWeek")
	var color := Palette.PARCHMENT
	if not _last.is_empty():
		var pack: Variant = _last.get("pack")
		text = I18N.f("snack.gotPack", [SnackState.pack_name(pack)]) if pack is String and not pack.is_empty() else I18N.f("snack.got", [int(_last.get("carrots", 0))])
		if _state.day() == 1 and int(_last.get("day", 0)) == 7:
			text += "  " + I18N.t("snack.weekDone")
		color = Palette.LEAF
	_label(_content, text, Rect2(66, 369, 760, 20), 12, color)


func _on_claimed(reward: Dictionary) -> void:
	_last = reward
	var from := _fly_from
	_fly_from = []
	Sound.play("match")
	_rebuild()
	_celebrate()
	var carrots := int(reward.get("carrots", 0))
	var landing := 0.0
	if carrots > 0 and not from.is_empty():
		landing = _fly_home(from, carrots)
		reward["flown"] = landing > 0.0
	_arrive(landing)


## LES CAROTTES DU SOCLE FILENT A LA PASTILLE. Elle retient le montant
## (hold) et le compte a chaque arrivee (land), qui tinte un cran plus haut ;
## la rafale part avec la derniere — la recolte du potager, au mot pres.
## Rend la duree du vol (0 : pas de pastille, rien ne vole).
func _fly_home(from: Array[Vector2], amount: int) -> float:
	var pill: CarrotPill = Chrome.current.carrot_pill() if Chrome.current != null else _bench_pill()
	if pill == null:
		return 0.0
	pill.hold(amount)
	var to_local := get_global_transform_with_canvas().affine_inverse()
	var side := 60.0 * _canvas.scale.x
	var n := from.size()
	var landed := {"n": 0}
	for i in n:
		var c := TextureRect.new()
		c.texture = Kit.ICONS["carrot"]
		c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		c.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		c.size = Vector2.ONE * side
		c.pivot_offset = c.size * 0.5
		add_child(c)
		var start := to_local * from[i] - c.size * 0.5
		var peak := start + Vector2(randf_range(-18.0, 18.0), -randf_range(30.0, 46.0)) * _canvas.scale.x
		var spin := deg_to_rad(randf_range(-40.0, 40.0))
		var bend := signf(peak.x - start.x) * FLY_SIDE
		c.position = start
		var tw := c.create_tween()
		tw.tween_interval(i * FLY_STAGGER)
		# LE SAUT hors du socle, puis LE VOL : la cible est relue a chaque
		# image, l'arc tire sur le cote ou la carotte penchait.
		tw.set_parallel(true)
		tw.tween_property(c, "position", peak, 0.26).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "scale", Vector2.ONE * 1.15, 0.26).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "rotation", spin, 0.26)
		tw.set_parallel(false)
		tw.tween_interval(0.06)
		tw.tween_method(func(t: float) -> void:
			if not is_instance_valid(pill):
				return
			var e := t * t
			var to := to_local * pill.carrot_target() - c.size * 0.5
			c.position = peak.lerp(to, e) + Vector2(bend * sin(t * PI), 0.0)
			c.scale = Vector2.ONE * lerpf(1.15, 0.3, e)
			c.rotation = lerpf(spin, spin * 3.0, t), 0.0, 1.0, 0.5)
		tw.tween_callback(func() -> void:
			landed["n"] = int(landed["n"]) + 1
			var k := int(landed["n"])
			if is_instance_valid(pill):
				# Les parts tombent juste : leur somme fait `amount`.
				pill.land(amount * k / n - amount * (k - 1) / n)
			Sound.play("coin", 1.0 + 0.5 * float(k) / float(n))
			if k == n:
				Home.burst.emit(amount))
		tw.tween_callback(c.queue_free)
	return (n - 1) * FLY_STAGGER + 0.26 + 0.06 + 0.5


## Hors du jeu (banc) : la premiere pastille visible de l'arbre.
func _bench_pill() -> CarrotPill:
	for pill in get_tree().root.find_children("*", "CarrotPill", true, false):
		if (pill as CarrotPill).is_visible_in_tree():
			return pill
	return null


## CELLES DE DEMAIN ARRIVENT, une a une et en gris, une fois le socle vide.
func _arrive(delay: float) -> void:
	for i in _harvest_items.size():
		var item := _harvest_items[i]
		item.pivot_offset = item.size * 0.5
		item.scale = Vector2.ZERO
		var tw := item.create_tween()
		tw.tween_interval(delay + 0.15 + i * 0.08)
		tw.tween_property(item, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _take(pack: String) -> void:
	if _state.pending or not _state.ready():
		return
	_claim_at = Vector2(270, 214) if pack.is_empty() else Vector2(574 if pack == "magic_hat" else 754, 247)
	for button in _buttons:
		button.disabled = true
	_aim()
	await _state.claim(pack)
	# Après une erreur réseau on rend les boutons ; après une réussite
	# _rebuild a déjà remplacé la vue par le lendemain.
	for button in _buttons:
		if is_instance_valid(button):
			button.disabled = false


## Les points de depart du vol, lus au tap : la reponse adopte le lendemain
## (`changed`) et refait la vue AVANT `claimed`.
func _aim() -> void:
	_fly_from = []
	for item in _harvest_items:
		if is_instance_valid(item.art):
			_fly_from.append(item.art.get_global_transform_with_canvas() * (item.art.size * 0.5))


func _process(delta: float) -> void:
	_clock += delta
	if _clock >= 1.0:
		_clock = 0.0
		_update_wait()


func _update_wait() -> void:
	for label in _wait_labels:
		if is_instance_valid(label):
			label.text = I18N.f("snack.nextIn", [I18N.wait(_state.wait_ms())])
	for button in _wait_buttons:
		if is_instance_valid(button):
			button.relabel(I18N.wait(_state.wait_ms()))


## `live` faux : la planche est la, a sa place, mais grisee et morte — ce
## qui vient plus tard, pas encore a toi. Hors de `_buttons`, que `_take`
## rallume apres une erreur.
func _action(parent: Control, text: String, rect: Rect2, pack: String, live := true) -> void:
	var button := Kit.button(text, "gold", rect.size.x, rect.size.y)
	button.name = "Claim_" + (pack if not pack.is_empty() else "carrots")
	button.position = rect.position
	button.size = rect.size
	button.label_size = 18
	parent.add_child(button)
	button.set_deferred("size", rect.size)
	if not live:
		button.disabled = true
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_default_cursor_shape = Control.CURSOR_ARROW
		var grey := ShaderMaterial.new()
		grey.shader = GREY
		grey.set_shader_parameter("dim", 0.85)
		button._plank.material = grey
		# La planche du jour attendu dit dans combien de temps.
		if pack.is_empty() and not _state.ready():
			_wait_buttons.append(button)
			_update_wait()
		return
	button.focus_mode = Control.FOCUS_ALL
	button.disabled = _state.pending
	button.pressed.connect(func() -> void: _take(pack))
	_buttons.append(button)


func _label(parent: Control, text: String, rect: Rect2, px: int, color: Color) -> Label:
	var label := Kit.label(text, Shop._fit(text, px, rect.size.x - 4), color, true)
	label.position = rect.position
	label.size = rect.size
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label


func _picture(parent: Control, texture: Texture2D, rect: Rect2, aspect := true) -> TextureRect:
	var picture := TextureRect.new()
	picture.texture = texture
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED if aspect else TextureRect.STRETCH_SCALE
	picture.position = rect.position
	picture.size = rect.size
	picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(picture)
	return picture


func _float_picture(parent: Control, texture: Texture2D, rect: Rect2, active: bool, phase: float) -> FloatingItem:
	var floating := FloatingItem.new()
	floating.position = rect.position
	floating.size = rect.size
	floating.amplitude = 3.0 if active else 2.0
	floating.phase = phase
	parent.add_child(floating)
	var art := _picture(floating, texture, Rect2(Vector2.ZERO, rect.size))
	floating.add_floating(art)
	return floating


func _panel(parent: Control, rect: Rect2, selected: bool) -> Control:
	var panel := Control.new()
	panel.name = "Day_%d" % (parent.get_child_count())
	panel.position = rect.position
	panel.size = rect.size
	parent.add_child(panel)
	# La vraie texture du comptoir, découpée en neuf : grain, biseaux,
	# rivets et coins conservés au lieu d'un rectangle à trait fin.
	var frame := NineSlice.make(CABINET, Vector4i(124, 125, 124, 148), Vector4(10, 9, 10, 10), true)
	frame.size = rect.size
	panel.add_child(frame)
	if selected:
		frame.tint = Color(1.35, 1.15, 0.75)
		var light := _picture(panel, Shop._glow_texture(Palette.GOLD, 0.32), Rect2(8, 7, rect.size.x - 16, rect.size.y - 14), false)
		var pulse := light.create_tween().set_loops()
		pulse.tween_property(light, "modulate:a", 0.45, 1.1).set_trans(Tween.TRANS_SINE)
		pulse.tween_property(light, "modulate:a", 1.0, 1.1).set_trans(Tween.TRANS_SINE)
	return panel


func _reward_light(parent: Control, centre: Vector2, side: float, tint: Color) -> void:
	var rays := Shop._rays(Palette.GOLD, side)
	rays.position = centre - rays.size * 0.5
	parent.add_child(rays)
	_picture(parent, Shop._glow_texture(tint.lightened(0.2), 0.55), Rect2(centre - Vector2.ONE * side * 0.5, Vector2.ONE * side), false)


func _sparkles(parent: Control, rect: Rect2) -> void:
	var sparks := Sparkles.new()
	sparks.position = rect.position
	sparks.size = rect.size
	parent.add_child(sparks)


func _celebrate() -> void:
	# Même gerbe de pixels que l'achat du shop, seulement après succès.
	for i in 14:
		var spark := ColorRect.new()
		spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spark.color = Palette.GOLD if i % 2 else Palette.CREAM
		spark.size = Vector2.ONE * (3 + i % 3)
		spark.position = _claim_at
		_content.add_child(spark)
		var to := _claim_at + Vector2.from_angle(TAU * i / 14.0) * (48 + i % 4 * 12)
		var burst := spark.create_tween().set_parallel()
		burst.tween_property(spark, "position", to, 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		burst.tween_property(spark, "modulate:a", 0.0, 0.4).set_delay(0.15)
		burst.chain().tween_callback(spark.queue_free)


func _tick(parent: Control, at: Vector2) -> void:
	var tick := Tick.new()
	tick.position = at
	tick.size = Vector2(14, 14)
	tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(tick)


class Tick extends Control:
	func _draw() -> void:
		var points := PackedVector2Array([Vector2(2, 7), Vector2(6, 11), Vector2(13, 2)])
		draw_polyline(points, Palette.SOIL_DEEP, 5.0)
		draw_polyline(points, Palette.LEAF, 3.0)


class FloatingItem extends Control:
	var amplitude := 4.0
	var phase := 0.0
	var elapsed := 0.0
	var art: Control

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE


	func add_floating(node: Control) -> void:
		art = node
		if node.get_parent() == null:
			add_child(node)
		set_process(amplitude > 0.0)


	func _process(delta: float) -> void:
		elapsed += delta
		if is_instance_valid(art):
			art.position.y = sin(elapsed * TAU / 3.2 + phase) * amplitude


class Sparkles extends Control:
	var elapsed := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(delta: float) -> void:
		elapsed += delta
		queue_redraw()

	func _draw() -> void:
		for i in 6:
			var phase := elapsed * 1.8 + i * 2.4
			var alpha := pow(maxf(0.0, sin(phase)), 3.0)
			var at := Vector2((0.11 + fmod(i * 0.37, 0.82)) * size.x, (0.15 + fmod(i * 0.29, 0.7)) * size.y - sin(phase * 0.6) * 3)
			var color := Color(Palette.CREAM if i % 2 else Palette.GOLD, alpha)
			draw_rect(Rect2(at.floor() - Vector2(1, 4), Vector2(2, 8)), color)
			draw_rect(Rect2(at.floor() - Vector2(4, 1), Vector2(8, 2)), color)
