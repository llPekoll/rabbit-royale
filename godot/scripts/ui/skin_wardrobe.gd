class_name SkinWardrobe
extends HBoxContainer
## Purchase detail opened from the locked rabbit in the profile.
signal connect_wallet
var state: SkinState
var skin_key := "solana"
var _right: VBoxContainer
var _rabbit: AnimatedSprite2D
var _stage: Control
var _rail := "usdc"
var _armed := false
var _animation := "idle"


func _ready() -> void:
	if state == null:
		state = SkinState.shared()
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 24)
	var left := Kit.vbox(8)
	left.custom_minimum_size.x = 240
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(left)
	var surface := Kit.style_well()
	surface.bg_color = Color("#2d2140")
	surface.border_color = Color("#765397")
	var panel := Kit.panel(surface)
	left.add_child(panel)
	_stage = Control.new()
	_stage.custom_minimum_size = Vector2(220, 150)
	panel.add_child(_stage)
	_rabbit = AnimatedSprite2D.new()
	_rabbit.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_rabbit.sprite_frames = SkinWardrobe.frames(skin_key)
	_rabbit.scale = Vector2.ONE * 7.0
	_rabbit.centered = false
	_rabbit.offset = Vector2(-16, -32)
	_stage.add_child(_rabbit)
	_stage.resized.connect(_place_rabbit)
	_place_rabbit.call_deferred()
	_rabbit.play(_animation)
	var poses := Kit.hbox(4)
	left.add_child(poses)
	for anim in ["idle", "move", "happy"]:
		var button := Kit.button(I18N.t("skins." + anim), "wood", 0, 36)
		button.label_size = 11
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(func() -> void:
			_animation = anim
			_rabbit.play(anim))
		poses.add_child(button)
	var scale_note := Kit.note(I18N.t("skins.preview"), Palette.BARK, 10)
	scale_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	left.add_child(scale_note)
	_right = Kit.vbox(8)
	_right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_right.size_flags_stretch_ratio = 1.25
	add_child(_right)
	state.changed.connect(_render)
	_render()


func _place_rabbit() -> void:
	_rabbit.position = Vector2(floorf(_stage.size.x * 0.5), _stage.size.y - 12)


static func frames(key: String) -> SpriteFrames:
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for anim in ["idle", "move", "happy"]:
		var def: Array = HomeRabbit.ANIMS[anim]
		frames.add_animation(anim)
		frames.set_animation_speed(anim, def[2])
		frames.set_animation_loop(anim, true)
		for index in range(def[0], def[1] + 1):
			var atlas := AtlasTexture.new()
			atlas.atlas = Look.sheet(key)
			atlas.region = Rect2((index % 8) * 32, (index / 8) * 32, 32, 32)
			atlas.filter_clip = true
			frames.add_frame(anim, atlas)
	return frames


func _render() -> void:
	for child in _right.get_children():
		_right.remove_child(child)
		child.queue_free()
	if not SkinState.SALE_NAMES.has(skin_key):
		_render_ticket_skin()
		return
	var item := state.item(skin_key)
	var display_name := String(SkinState.SALE_NAMES.get(skin_key, skin_key))
	_right.add_child(Kit.wrapped(Kit.title(display_name, 20 if display_name.length() > 20 else 28, Palette.INK)))
	var description := {"solana": "description", "carrot": "carrotDescription"}
	_right.add_child(Kit.note(I18N.t("skins." + String(description.get(skin_key, "description"))), Palette.BARK, 12))
	_right.add_child(Kit.note(I18N.t("skins.permanent"), Palette.BARK, 11))
	if item.is_empty():
		_right.add_child(Kit.note(I18N.t("skins.loadFailed") if state.failed else I18N.t("shop.loading"), Palette.BARK))
		if state.failed:
			var retry := Kit.button(I18N.t("skins.retry"), "gold", 0, 44)
			retry.pressed.connect(state.refresh)
			_right.add_child(retry)
		return
	var owned := state.owns(skin_key)
	var equipped: bool = state.catalog.get("equipped") == skin_key
	var pending := bool(item.get("pending", false)) and not owned
	var tokens: Array = state.catalog.get("tokens", [])
	if not tokens.has(_rail) and not tokens.is_empty():
		_rail = String(tokens[0])
	var price := Shop.money_label(float(item.get("usdCents", 0)) / 100.0, _rail, state.catalog.get("rates", null))
	var price_row := Kit.hbox(10)
	_right.add_child(price_row)
	price_row.add_child(Kit.title(I18N.t("skins.owned") if owned else price, 22, Palette.INK))
	var small := Kit.note(I18N.t("skins.cosmetic"), Palette.BARK, 10)
	small.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	price_row.add_child(small)
	if not owned and not pending and not tokens.is_empty():
		var rails := Kit.hbox(4)
		_right.add_child(rails)
		for token in tokens:
			var rail := Kit.button(String(token).to_upper(), "green" if token == _rail else "wood", 0, 32)
			rail.label_size = 11
			rail.disabled = state.busy
			rail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			rail.pressed.connect(func() -> void:
				_rail = String(token)
				_armed = false
				_render())
			rails.add_child(rail)
	var label := I18N.t("skins.equipped") if equipped else I18N.t("skins.equip")
	if not owned:
		label = I18N.t("skins.check") if pending else (I18N.t("skins.confirm") if _armed else I18N.t("skins.buy")) + " " + price
	var guest := bool(Session.player.get("guest", false)) and not state._fake
	if guest and not owned:
		label = I18N.t("auth.connect")
	var stage := state.stage_text()
	if state.busy:
		label = stage if not stage.is_empty() else I18N.t("skins.wait")
	var action := Kit.button(label, "green" if owned else "gold", 0, 44)
	action.name = "SkinAction"
	action.label_size = 13
	action.disabled = state.busy or equipped
	if not owned and not pending:
		action.disabled = action.disabled or (not bool(state.catalog.get("paymentsEnabled", false)) and not state._fake)
		if not Wallet.available() and not state._fake:
			action.disabled = true
	action.pressed.connect(func() -> void:
		if guest and not owned:
			connect_wallet.emit()
		elif owned:
			state.equip(skin_key)
		elif pending:
			state.recover(skin_key)
		elif _armed:
			_armed = false
			state.buy(skin_key, _rail)
		else:
			_armed = true
			_render())
	_right.add_child(action)
	var message := state.note
	if message.is_empty() and pending:
		message = I18N.t("skins.pending")
	elif message.is_empty() and guest and not owned:
		message = I18N.t("skins.guest")
	elif message.is_empty() and not owned and not bool(state.catalog.get("paymentsEnabled", false)):
		message = I18N.t("skins.unavailable")
	elif message.is_empty() and not owned and not Wallet.available() and not state._fake:
		message = I18N.t("pay.noWallet")
	if not message.is_empty():
		_right.add_child(Kit.note(message, Palette.BAD_ON_PARCHMENT if state.failed else Palette.BARK, 10))
	var collection := Kit.hbox(6)
	_right.add_child(collection)
	var restore := Kit.button(I18N.t("skins.check"), "wood", 0, 36)
	restore.name = "RestoreSkin"
	restore.label_size = 10
	restore.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	restore.disabled = state.busy
	restore.pressed.connect(state.recover.bind(skin_key))
	collection.add_child(restore)


## LE LAPIN DORE : il ne s'achete pas, il vient avec le ticket. Pas de prix
## ni de rails ; possede, il s'equipe comme les autres.
func _render_ticket_skin() -> void:
	_right.add_child(Kit.wrapped(Kit.title(I18N.t("pass.skin"), 28, Palette.INK)))
	var owned := state.owns(skin_key)
	if not owned:
		var only := Kit.note(I18N.t("skins.ticketOnly"), Palette.BARK, 12)
		only.name = "TicketOnly"
		_right.add_child(only)
		return
	_right.add_child(Kit.note(I18N.t("pass.skinWhat"), Palette.BARK, 11))
	var equipped: bool = state.catalog.get("equipped") == skin_key
	var action := Kit.button(I18N.t("skins.equipped") if equipped else I18N.t("skins.equip"), "green", 0, 44)
	action.name = "SkinAction"
	action.label_size = 13
	action.disabled = state.busy or equipped
	action.pressed.connect(state.equip.bind(skin_key))
	_right.add_child(action)
	if not state.note.is_empty():
		_right.add_child(Kit.note(state.note, Palette.BAD_ON_PARCHMENT if state.failed else Palette.BARK, 10))
