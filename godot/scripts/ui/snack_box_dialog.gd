class_name SnackBoxDialog
extends SnackDialog
## SNACK TIME, LA BOITE SURPRISE (2026-10-08) — une boite par jour au lieu de
## +50 carottes, le bonus du jour qui joue dans la partie, et les cadeaux du
## terrier aux jours 7 / 14 / 21 / 28. Les regles sont au serveur
## (src/lib/game/snack.ts) : le tirage s'y fait, cette fenetre le montre.
##
##   godot --path godot scenes/bench/snack_box_bench.tscn
##
## Herite du comptoir (SnackDialog) pour ses outils de dessin et le vol des
## carottes a la pastille : `_ready` et `_rebuild` sont refaits.
##
## LA PISTE PARLE EN JOURS, un seul compteur : « jour 13 » = le 13e jour ou
## le joueur est venu. Deux versions rejetees le 2026-10-08 : silhouettes sur
## une barre de 30 (« on comprend pas trop »), puis « 5/7 » + « SNACK 14 »,
## lus comme une semaine ET un autre compteur.

const TIERS := ["common", "rare", "epic", "jackpot"]
const TIER_TINT := {
	"common": Color("#fff0cb"),
	"rare": Color("#5aa9e6"),
	"epic": Color("#a86ee0"),
	"jackpot": Color("#ffc83d"),
}
const ART := {
	"carrots": "res://assets/ui/icons/carrot.webp",
	"water": "res://assets/ui/icons/water.webp",
	"fertiliser": "res://assets/ui/icons/fertiliser.webp",
	"lightning": "res://assets/ui/icons/bolt.webp",
	"shield": "res://assets/ui/icons/shield.webp",
	"energy": "res://assets/gauge/dial-icon.webp",
	"magic_hat": "res://assets/ui/snack/hat.png",
	"lucky_foot": "res://assets/ui/snack/basket.png",
}
## Le lapin assis, dans une planche de skin.
const SKIN_SEAT := Rect2(4, 9, 24, 23)
## Les cadeaux, comme IslandScenery.GIFTS les pose au terrier, rognes a l'encre.
const GIFT_ART := {
	"mushroom": {"prop": 2, "region": Rect2(14, 12, 38, 37)},
	"pumpkin": {"prop": 12, "region": Rect2(5, 10, 56, 45)},
	"carrot": {"sheet": true, "region": Rect2(100, 106, 34, 52)},
	"scarecrow": {"prop": 17, "region": Rect2(54, 48, 87, 121), "tint": Color(1.35, 1.12, 0.5)},
}

## Le resultat montre ({} : boite fermee). Le banc peut le forcer.
var result: Dictionary = {}
## Pour le banc : le prochain tirage local sort ce rang.
var force_tier := ""

var _chest: LootChest
var _chest_glow: TextureRect
var _open_button: PlankButton
var _buff_card: Control
var _opening := false
var _rng := RandomNumberGenerator.new()


## Ouvrir la fenetre par-dessus le jeu.
static func show_box() -> SnackBoxDialog:
	var dialog := SnackBoxDialog.new()
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	Analytics.track("snack_open")
	_rng.randomize()
	if _state == null:
		_state = SnackState.shared()
	_canvas = Control.new()
	_canvas.name = "Cabinet"
	_canvas.size = DESIGN
	add_child(_canvas)
	_picture(_canvas, CABINET, Rect2(Vector2.ZERO, DESIGN), false)
	_state.changed.connect(_on_state_changed)
	_state.claimed.connect(_on_claimed)
	I18N.locale_changed.connect(func(_c: String) -> void: _rebuild())
	resized.connect(_layout)
	_rebuild()
	_layout()
	_state.refresh()


func _on_state_changed() -> void:
	# Pendant l'ouverture la fenetre se redessine elle-meme, morceau par morceau.
	if _opening or not result.is_empty():
		return
	_rebuild()


## La boite attend-elle d'etre ouverte, la, maintenant ?
func _waiting() -> bool:
	return result.is_empty() and _state.ready()


func _rebuild() -> void:
	if _canvas == null:
		return
	if _content != null:
		_canvas.remove_child(_content)
		_content.queue_free()
	_content = Control.new()
	_content.name = "Rewards"
	_content.size = DESIGN
	_canvas.add_child(_content)
	_label(_content, I18N.shout(I18N.t("snack.title")), Rect2(55, 11, 640, 34), 24, Palette.CREAM)
	if not _state.known():
		var spinner := CarrotLoader.new()
		spinner.side = 36
		spinner.position = Vector2(427, 175)
		_content.add_child(spinner)
		move_child(close_button, get_child_count() - 1)
		return
	_build_track()
	_build_box()
	_build_buff()
	_build_odds()
	_build_hint()
	move_child(close_button, get_child_count() - 1)


# ── La piste ────────────────────────────────────────────────────────────────

func _build_track() -> void:
	var panel := _panel(_content, Rect2(35, 58, 820, 74), false)
	panel.name = "Track"
	var count := _state.days()
	var waiting := _waiting()
	# Le jour a montrer : celui qu'on ouvre aujourd'hui, ou celui qu'on a ouvert.
	var today := count + 1 if waiting else count
	_label(panel, I18N.t("snack.box.day"), Rect2(8, 6, 80, 16), 12, Palette.GOLD)
	_label(panel, str(maxi(today, 1)), Rect2(8, 18, 80, 34), 30, Palette.CREAM)
	_label(panel, I18N.t("snack.box.today") if waiting else I18N.t("snack.box.taken"), Rect2(8, 50, 80, 16), 11, Palette.PARCHMENT)
	var gifts := _state.gifts()
	var next := {}
	var from := 0
	for g in gifts:
		if g is Dictionary and not bool(g.get("got", false)):
			next = g
			break
		if g is Dictionary:
			from = int(g.get("day", 0))
	if next.is_empty():
		_label(panel, I18N.t("snack.box.allGifts"), Rect2(100, 0, 370, 74), 14, Palette.GOLD)
	else:
		var gift_day := int(next.get("day", 0))
		var kind := String(next.get("kind", ""))
		var title := _label(panel, "%s  (%s)" % [I18N.f("snack.box.giftOn", [gift_day, I18N.shout(_gift_name(kind))]), I18N.t("snack.box.decoration")], Rect2(100, 4, 372, 18), 12, Palette.GOLD)
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var n := maxi(1, gift_day - from)
		var w := (372.0 - (n - 1) * 4.0) / n
		for i in n:
			var day := from + 1 + i
			var cell := Control.new()
			cell.name = "Day_%d" % day
			cell.position = Vector2(100 + i * (w + 4.0), 25)
			cell.size = Vector2(w, 44)
			panel.add_child(cell)
			var taken := day <= count
			var is_today := waiting and day == count + 1
			var is_gift := day == gift_day
			var face := Palette.CARROT_DEEP if taken else Palette.TRACK_FACE
			if is_today:
				face = Color("#7a5a1c")
			_rect(cell, Rect2(0, 0, w, 44), Palette.TRACK_RIM)
			_rect(cell, Rect2(2, 2, w - 4, 40), face)
			if is_today or is_gift:
				_outline(cell, Vector2(w, 44), Palette.GOLD)
			if is_gift:
				_gift_picture(cell, kind, Rect2(3, 2, w - 6, 28))
				_label(cell, str(day), Rect2(0, 28, w, 14), 11, Palette.GOLD)
			else:
				_label(cell, str(day), Rect2(0, 4, w, 16), 13, Palette.CREAM if taken or is_today else Palette.CHALK_DIM)
				if taken:
					_tick(cell, Vector2(w * 0.5 - 7, 24))
				elif is_today:
					_label(cell, I18N.shout(I18N.t("snack.today")), Rect2(0, 24, w, 14), 8, Palette.GOLD)
	# Les cadeaux, en couleur, chacun avec SON jour.
	for i in gifts.size():
		var g: Variant = gifts[i]
		if not g is Dictionary:
			continue
		var at := int(g.get("day", 0))
		var got := bool(g.get("got", false))
		var is_next := not next.is_empty() and at == int(next.get("day", 0))
		var card := Control.new()
		card.name = "Gift_%d" % at
		card.position = Vector2(488 + i * 82, 6)
		card.size = Vector2(76, 62)
		card.tooltip_text = _gift_name(String(g.get("kind", "")))
		panel.add_child(card)
		_rect(card, Rect2(0, 0, 76, 62), Color(Palette.GOLD, 0.22) if is_next else Color(Palette.SOIL_DEEP, 0.45))
		if is_next:
			_outline(card, Vector2(76, 62), Palette.GOLD)
		var art := _gift_picture(card, String(g.get("kind", "")), Rect2(10, 4, 56, 38))
		if not got and not is_next:
			art.modulate.a *= 0.6
		_label(card, I18N.f("snack.box.dayN", [at]), Rect2(0, 43, 76, 16), 11, Palette.GOLD if is_next else (Palette.LEAF if got else Palette.PARCHMENT))
		if got:
			_tick(card, Vector2(58, 4))


# ── La boite ────────────────────────────────────────────────────────────────

func _build_box() -> void:
	var waiting := _waiting()
	var open := not result.is_empty()
	var gold := waiting and _state.golden()
	var head := I18N.t("snack.box.ready")
	var head_color := Palette.PARCHMENT
	if open:
		var tier := String(result.get("tier", "common"))
		head = I18N.shout(I18N.t("snack.box.tier.%s" % tier)) + "!"
		head_color = TIER_TINT.get(tier, Palette.CREAM)
	elif not waiting:
		head = I18N.t("snack.box.tomorrow")
	elif gold:
		head = I18N.t("snack.box.golden")
		head_color = Palette.GOLD
	var head_label := _label(_content, head, Rect2(54, 140, 434, 23), 17, head_color)
	head_label.name = "Head"
	_picture(_content, PLINTH, Rect2(138, 235, 265, 83))
	var stage := Control.new()
	stage.name = "BoxStage"
	stage.position = Vector2(139, 150)
	stage.size = Vector2(264, 124)
	_content.add_child(stage)
	if waiting or open:
		var light: Color = Palette.GOLD if gold else (TIER_TINT.get(String(result.get("tier", "")), Palette.CARROT) if open else Palette.CARROT)
		_reward_light(stage, Vector2(132, 70), 190, light)
	_chest_glow = _picture(stage, Shop._glow_texture(Palette.CREAM, 0.0), Rect2(42, -20, 180, 180), false)
	_chest = LootChest.new()
	_chest.crop = LootChest.Crop.OPENING
	_chest.width = 150.0
	_chest.size = _chest.custom_minimum_size
	_chest.position = Vector2(132 - 75, 112 - _chest.size.y)
	_chest.pivot_offset = Vector2(_chest.size.x * 0.5, _chest.size.y)
	stage.add_child(_chest)
	if gold:
		_chest.modulate = Color(1.35, 1.1, 0.45)
	if not waiting and not open:
		var grey := ShaderMaterial.new()
		grey.shader = GREY
		_chest.material = grey
		_chest.shine = false
	if open:
		_chest.shine = false
		_chest.modulate = Color(1, 1, 1, 0.35)
		_chest.pop()
		_show_reward(stage, false)
	elif waiting:
		_sparkles(stage, Rect2(14, 0, 236, 116))
	var text := I18N.t("snack.box.open") if waiting else I18N.f("snack.box.next", [I18N.wait(_state.wait_ms())])
	_open_button = Kit.button(text, "gold", 224, 44)
	_open_button.name = "Open"
	_open_button.position = Vector2(159, 312)
	_open_button.size = Vector2(224, 44)
	_open_button.label_size = 18 if waiting else 14
	_content.add_child(_open_button)
	_open_button.set_deferred("size", Vector2(224, 44))
	if waiting:
		_open_button.focus_mode = Control.FOCUS_ALL
		_open_button.pressed.connect(_open)
	else:
		_grey_out(_open_button)


## Le butin qui sort de la boite. `animate` faux : pose a sa place.
func _show_reward(stage: Control, animate: bool) -> void:
	var tier := String(result.get("tier", "common"))
	var kind := String(result.get("kind", "carrots"))
	var tint: Color = TIER_TINT.get(tier, Palette.CREAM)
	var side := 84.0
	var at := Vector2(132 - side * 0.5, 18.0)
	var rays := Shop._rays(tint, side * 2.1)
	rays.position = at + Vector2.ONE * side * 0.5 - rays.size * 0.5
	stage.add_child(rays)
	var floating := FloatingItem.new()
	floating.name = "Reward"
	floating.position = at
	floating.size = Vector2(side, side)
	floating.amplitude = 3.0
	stage.add_child(floating)
	var art := _picture(floating, _prize_texture(kind), Rect2(Vector2.ZERO, Vector2(side, side)))
	floating.add_floating(art)
	var amount := _label(stage, _reward_text(), Rect2(0, 124, 264, 32), 22, tint if tier != "common" else Palette.GOLD)
	amount.add_theme_constant_override("outline_size", 6)
	amount.add_theme_color_override("font_outline_color", Palette.SOIL_DEEP)
	if not animate:
		return
	floating.pivot_offset = floating.size * 0.5
	floating.scale = Vector2.ONE * 0.2
	floating.position.y += 60
	rays.modulate.a = 0.0
	amount.modulate.a = 0.0
	var tw := floating.create_tween()
	tw.set_parallel(true)
	tw.tween_property(floating, "position:y", at.y, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(floating, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(rays, "modulate:a", 1.0, 0.3)
	tw.tween_property(amount, "modulate:a", 1.0, 0.3).set_delay(0.3)
	if tier == "jackpot":
		# LE JACKPOT SE FAIT DESIRER : silhouette qui tremble, puis l'eclair
		# blanc et les couleurs — la revelation des skins (purchase_reveal).
		art.modulate = Color(0.05, 0.03, 0.02)
		var tease := art.create_tween()
		tease.tween_interval(0.45)
		for i in 6:
			tease.tween_property(art, "position:x", 4.0 if i % 2 == 0 else -4.0, 0.06)
		tease.tween_property(art, "position:x", 0.0, 0.05)
		tease.tween_callback(func() -> void:
			_flash(0.9)
			art.modulate = Color.WHITE
			Sound.play("match"))


func _reward_text() -> String:
	var kind := String(result.get("kind", "carrots"))
	var qty := int(result.get("qty", 0))
	if kind == "carrots":
		return "+%d" % qty
	var name := _prize_name(kind)
	return name + (" x%d" % qty if qty > 1 else "")


# ── L'ouverture ─────────────────────────────────────────────────────────────

func _open() -> void:
	if _opening or not _waiting() or _state.pending:
		return
	_opening = true
	_open_button.disabled = true
	# LA BOITE TREMBLE PENDANT QUE LE SERVEUR TIRE : la reponse arrive au
	# milieu du tremblement, et la lueur vire a la teinte du rang avant qu'on
	# voie l'objet — on sait que c'est rare une demi-seconde avant de savoir quoi.
	var shake := _chest.create_tween().set_loops()
	shake.tween_property(_chest, "rotation", deg_to_rad(5.0), 0.07)
	shake.tween_property(_chest, "rotation", deg_to_rad(-5.0), 0.1)
	shake.tween_property(_chest, "rotation", 0.0, 0.07)
	shake.tween_interval(0.12)
	var reward: Dictionary
	if _state._fake:
		reward = await _fake_claim()
	else:
		reward = await _state.claim()
	if reward.is_empty():
		shake.kill()
		_chest.rotation = 0.0
		_opening = false
		if is_instance_valid(_open_button):
			_open_button.disabled = false
		return
	# `_on_claimed` a deja pose le resultat.
	shake.kill()
	var tint: Color = TIER_TINT.get(String(result.get("tier", "common")), Palette.CREAM)
	_chest_glow.texture = Shop._glow_texture(tint, 0.7)
	_chest_glow.modulate.a = 0.0
	var tw := _chest.create_tween()
	tw.set_parallel(true)
	tw.tween_property(_chest_glow, "modulate:a", 1.0, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.set_parallel(false)
	for i in 2:
		var swing := deg_to_rad(8.0 + i * 5.0)
		tw.tween_property(_chest, "rotation", swing, 0.06)
		tw.tween_property(_chest, "rotation", -swing, 0.09)
		tw.tween_property(_chest, "rotation", 0.0, 0.06)
		tw.tween_callback(Sound.play.bind("coin", 1.0 + i * 0.2))
	await tw.finished
	_chest.pop()
	_chest.create_tween().tween_property(_chest, "modulate", Color(1, 1, 1, 0.35), 0.4)
	_flash(0.5 if result.get("tier") == "common" else 0.85)
	Sound.play("match")
	_claim_at = Vector2(270, 200)
	_celebrate()
	_show_reward(_content.get_node("BoxStage") as Control, true)
	var head := _content.get_node("Head") as Label
	var tier := String(result.get("tier", "common"))
	head.text = I18N.shout(I18N.t("snack.box.tier.%s" % tier)) + "!"
	head.add_theme_color_override("font_color", tint)
	_grey_out(_open_button)
	_update_wait()
	await get_tree().create_timer(0.6).timeout
	if not is_inside_tree():
		return
	_after_reveal()
	_opening = false


## La reponse : on la garde pour la montrer. Les carottes montent a la
## pastille avec sa gerbe (Home.burst, SnackState) pendant que la boite
## s'ouvre — pas de vol depuis la boite, qui arriverait apres le chiffre.
func _on_claimed(reward: Dictionary) -> void:
	result = reward


## La piste avance, le bonus s'allume — et un cadeau sort de sa carte.
func _after_reveal() -> void:
	_redraw_track()
	var gift: Variant = result.get("gift")
	if gift is String and not String(gift).is_empty():
		var at := 0
		for g in _state.gifts():
			if g is Dictionary and String(g.get("kind", "")) == gift:
				at = int(g.get("day", 0))
		var card := _content.get_node_or_null("Track/Gift_%d" % at) as Control
		if card != null:
			card.pivot_offset = card.size * 0.5
			card.scale = Vector2.ONE * 0.3
			var tw := card.create_tween()
			tw.tween_property(card, "scale", Vector2.ONE * 1.25, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			tw.tween_property(card, "scale", Vector2.ONE, 0.25)
		Sound.play("coin", 1.4)
		var hint := _content.get_node("Hint") as Label
		hint.text = I18N.f("snack.box.unlocked", [_gift_name(String(gift))])
		hint.add_theme_color_override("font_color", Palette.LEAF)
	else:
		var cell := _content.find_child("Day_%d" % _state.days(), true, false) as Control
		if cell != null:
			cell.pivot_offset = cell.size * 0.5
			cell.scale = Vector2.ONE * 1.3
			cell.create_tween().tween_property(cell, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		(_content.get_node("Hint") as Label).text = _hint_text()
	_light_buff()


func _redraw_track() -> void:
	var old := _content.get_node("Track")
	_content.remove_child(old)
	old.queue_free()
	_build_track()
	_content.move_child(_content.get_node("Track"), 1)


func _flash(strength: float) -> void:
	var flash := ColorRect.new()
	flash.color = Color(1, 1, 1, strength)
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash.size = DESIGN
	_canvas.add_child(flash)
	var tw := flash.create_tween()
	tw.tween_property(flash, "color:a", 0.0, 0.35)
	tw.tween_callback(flash.queue_free)


## Le compte a rebours de la planche grisee (SnackDialog._process, chaque seconde).
func _update_wait() -> void:
	if is_instance_valid(_open_button) and not _waiting():
		_open_button.relabel(I18N.f("snack.box.next", [I18N.wait(_state.wait_ms())]))


# ── Le bonus du jour ────────────────────────────────────────────────────────

func _build_buff() -> void:
	var b := _state.buff()
	_buff_card = _panel(_content, Rect2(490, 140, 348, 92), String(b.get("state", "idle")) == "active")
	_buff_card.name = "Buff"
	_fill_buff()


func _fill_buff() -> void:
	var b := _state.buff()
	var state := String(b.get("state", "idle"))
	var art := Control.new()
	art.name = "BuffArt"
	art.position = Vector2(12, 14)
	art.size = Vector2(64, 64)
	_buff_card.add_child(art)
	_picture(art, Kit.ICONS["carrot"], Rect2(4, 6, 52, 52))
	var times := _label(art, "x%d" % int(b.get("mult", 2)), Rect2(30, 34, 40, 28), 20, Palette.GOLD)
	times.add_theme_constant_override("outline_size", 6)
	times.add_theme_color_override("font_outline_color", Palette.SOIL_DEEP)
	if state == "used":
		art.modulate = Color(1, 1, 1, 0.45)
	var title := _label(_buff_card, I18N.t("snack.box.buffTitle"), Rect2(84, 10, 256, 20), 12, Palette.GOLD)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	# Deux lignes, a la largeur de la carte : `_label` ajuste la taille pour
	# UNE ligne, et la phrase deborderait du cadre.
	var body := Kit.label(I18N.f("snack.box.buffBody", [int(b.get("max", 0))]), 11, Palette.CREAM, true)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.position = Vector2(84, 29)
	body.custom_minimum_size = Vector2(256, 0)
	body.size = Vector2(256, 36)
	_buff_card.add_child(body)
	var status := I18N.t("snack.box.buffIdle")
	var color := Palette.PARCHMENT.darkened(0.2)
	match state:
		"active":
			status = I18N.t("snack.box.buffActive")
			color = Palette.LEAF
		"used":
			status = I18N.f("snack.box.buffUsed", [int(b.get("bonus", 0))])
			color = Palette.PARCHMENT
	var line := _label(_buff_card, status, Rect2(84, 64, 256, 18), 11, color)
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT


func _light_buff() -> void:
	var at := _buff_card.position
	_buff_card.queue_free()
	_buff_card = _panel(_content, Rect2(at, Vector2(348, 92)), String(_state.buff().get("state", "")) == "active")
	_buff_card.name = "Buff"
	_fill_buff()
	_buff_card.pivot_offset = _buff_card.size * 0.5
	_buff_card.scale = Vector2.ONE * 1.08
	_buff_card.create_tween().tween_property(_buff_card, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


# ── Les cotes ───────────────────────────────────────────────────────────────

func _build_odds() -> void:
	var panel := _panel(_content, Rect2(490, 240, 348, 118), false)
	var gold := _waiting() and _state.golden()
	var head := I18N.t("snack.box.inside") + ("  ·  " + I18N.t("snack.box.goldenTag") if gold else "")
	_label(panel, head, Rect2(0, 6, 348, 18), 11, Palette.GOLD)
	var odds := _state.odds(gold)
	var box := _state.box()
	var dim_ink := Palette.CHALK_DIM.darkened(0.3)
	var y := 26.0
	for tier in TIERS:
		var pct := int(odds.get(tier, 0))
		var dim := pct == 0
		var name_label := _label(panel, I18N.t("snack.box.tier.%s" % tier), Rect2(14, y, 70, 20), 12, dim_ink if dim else TIER_TINT[tier])
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var x := 92.0
		var prizes: Array = box.get(tier, []) if box.get(tier) is Array else []
		var carrots := 0
		for p in prizes:
			if not p is Dictionary:
				continue
			var kind := String(p.get("kind", ""))
			if kind == "carrots":
				carrots = int(p.get("qty", 0))
			var icon := _picture(panel, _prize_texture(kind), Rect2(x, y, 20, 20))
			if dim:
				icon.modulate.a = 0.3
			x += 24.0
		var detail := I18N.f("snack.box.detail.carrots", [carrots]) if tier == "common" else I18N.t("snack.box.detail.%s" % tier)
		var d := _label(panel, detail, Rect2(x + 4, y, 280 - x - 4, 20), 11, dim_ink if dim else Palette.PARCHMENT)
		d.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var p_label := _label(panel, "%d%%" % pct, Rect2(280, y, 54, 20), 13, dim_ink if dim else Palette.CREAM)
		p_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		y += 22.0


# ── Le pied ─────────────────────────────────────────────────────────────────

func _build_hint() -> void:
	var hint := _label(_content, _hint_text(), Rect2(66, 369, 760, 20), 12, Palette.PARCHMENT)
	hint.name = "Hint"


func _hint_text() -> String:
	var lead := ""
	if _waiting() and _state.golden():
		lead = I18N.t("snack.box.goldenToday")
	else:
		# Pret : la doree est dans `goldenIn` boites. Deja ouverte aujourd'hui :
		# la prochaine boite est demain, donc un jour de plus.
		var n := _state.golden_in() + (0 if _waiting() else 1)
		lead = I18N.f("snack.box.goldenIn", [maxi(1, n)])
	return lead + "  ·  " + I18N.t("snack.box.neverResets")


# ── Les images et les noms ──────────────────────────────────────────────────

func _prize_texture(kind: String) -> Texture2D:
	if kind.begins_with("skin_"):
		var key := kind.trim_prefix("skin_")
		if Kit.SKINS.has(key):
			var crop := AtlasTexture.new()
			crop.atlas = Kit.SKINS[key]
			crop.region = SKIN_SEAT
			crop.filter_clip = true
			return crop
	return load(ART.get(kind, ART["carrots"]))


func _prize_name(kind: String) -> String:
	return I18N.t("snack.box.prize.%s" % kind)


static func _gift_name(kind: String) -> String:
	return I18N.t("snack.box.gift.%s" % kind)


static func gift_texture(kind: String) -> Texture2D:
	var g: Dictionary = GIFT_ART.get(kind, GIFT_ART["mushroom"])
	var crop := AtlasTexture.new()
	crop.atlas = IslandScenery.CARROT_SHEET if g.has("sheet") else IslandScenery.PROPS[int(g.prop)]
	crop.region = g.region
	crop.filter_clip = true
	return crop


func _gift_picture(parent: Control, kind: String, rect: Rect2) -> TextureRect:
	var pic := _picture(parent, gift_texture(kind), rect)
	var g: Dictionary = GIFT_ART.get(kind, {})
	if g.has("tint"):
		pic.modulate = g.tint
	return pic


# ── Petits outils ───────────────────────────────────────────────────────────

func _rect(parent: Control, rect: Rect2, color: Color) -> ColorRect:
	var r := ColorRect.new()
	r.color = color
	r.position = rect.position
	r.size = rect.size
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(r)
	return r


func _outline(parent: Control, box: Vector2, color: Color) -> void:
	for r in [Rect2(0, 0, box.x, 2), Rect2(0, box.y - 2, box.x, 2), Rect2(0, 0, 2, box.y), Rect2(box.x - 2, 0, 2, box.y)]:
		_rect(parent, r, color)


func _grey_out(button: PlankButton) -> void:
	button.disabled = true
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_default_cursor_shape = Control.CURSOR_ARROW
	var grey := ShaderMaterial.new()
	grey.shader = GREY
	grey.set_shader_parameter("dim", 0.85)
	button._plank.material = grey


# ── Le banc : un tirage local, sans serveur ─────────────────────────────────

## Ce que ferait le serveur, avec les cotes et le contenu de l'etat factice :
## l'etat d'apres, puis `claimed` — dans le meme ordre que SnackState.claim.
func _fake_claim() -> Dictionary:
	await get_tree().create_timer(0.5).timeout
	var gold := _state.golden()
	var odds := _state.odds(gold)
	var tier := force_tier
	if tier.is_empty():
		var total := 0
		for t in TIERS:
			total += int(odds.get(t, 0))
		var pick := _rng.randi_range(1, maxi(1, total))
		for t in TIERS:
			pick -= int(odds.get(t, 0))
			if pick <= 0:
				tier = t
				break
	var prizes: Array = _state.box().get(tier, [])
	var prize: Dictionary = prizes[_rng.randi_range(0, prizes.size() - 1)] if not prizes.is_empty() else {"kind": "carrots", "qty": 100}
	var next := _state.state.duplicate(true)
	var days := _state.days() + 1
	var gift: Variant = null
	if gold:
		for g in next.get("gifts", []):
			if not bool(g.get("got", false)):
				g["got"] = true
				gift = g.get("kind")
				break
	next["days"] = days
	next["day"] = days + 1
	next["ready"] = false
	next["readyAt"] = Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 9 * 3600 + 12 * 60) + ".000Z"
	next["golden"] = false
	next["goldenIn"] = 6 if gold else int(next.get("goldenIn", 0)) - 1
	next["buff"] = {"state": "active", "bonus": 0, "max": int(next.get("buff", {}).get("max", 75)), "mult": 2}
	var reward := {"day": days, "golden": gold, "tier": tier, "kind": prize.get("kind"), "qty": int(prize.get("qty", 1)), "items": [], "gift": gift}
	reward["carrots"] = int(reward.qty) if reward.kind == "carrots" else 0
	_state.fake(next)
	_state.claimed.emit(reward)
	return reward
