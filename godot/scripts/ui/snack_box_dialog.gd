class_name SnackBoxDialog
extends SnackDialog
## BROUILLON (2026-10-08) — le Snack Time refait : une BOITE SURPRISE par
## jour au lieu de +50 carottes, un BONUS DU JOUR qui joue dans la partie, et
## une COLLECTION qui ne s'obtient qu'en revenant. Rien n'est branche : la vue
## vient de `view` (pose par le banc), le tirage se fait ici avec `BOX` —
## le jour ou on valide, `BOX` part dans SNACK (config/tuning.ts) et le
## tirage sur le serveur, la fenetre ne fait plus que montrer la reponse.
##
##   godot --path godot scenes/bench/snack_box_bench.tscn
##
## Pourquoi : la semaine entiere de l'ancien snack valait UNE run (~725
## carottes). Ici le montant suit le niveau, la surprise vient du tirage, et
## la piste du haut donne une raison de revenir le 30e jour.
##
## Herite du comptoir (SnackDialog) pour ses outils de dessin seulement :
## `_ready` et `_rebuild` sont refaits, SnackState n'est jamais lu.

## Le tirage, cotes AFFICHEES (obligatoire en boutique pour une boite a
## hasard, et c'est ce qui la rend honnete). Une boite sur 7 est DOREE : plus
## de commun, l'epique et le jackpot montent.
const BOX := {
	"odds": {"common": 72, "rare": 22, "epic": 5, "jackpot": 1},
	"golden_odds": {"common": 0, "rare": 60, "epic": 32, "jackpot": 8},
	"tiers": {
		# Les carottes suivent le niveau : 40 au niveau 1, 400 au niveau 10.
		"common": [["carrots", 0], ["water", 2], ["fertiliser", 1]],
		"rare": [["lightning", 1], ["shield", 1], ["energy", 1]],
		"epic": [["magic_hat", 1], ["lucky_foot", 1]],
		"jackpot": [["coat", 1], ["genesis", 1]],
	},
	"carrots_per_level": 40,
}
const TIER_TINT := {
	"common": Color("#fff0cb"),
	"rare": Color("#5aa9e6"),
	"epic": Color("#a86ee0"),
	"jackpot": Color("#ffc83d"),
}
const TIER_NAME := {"common": "Common", "rare": "Rare", "epic": "Epic", "jackpot": "Jackpot"}
## LA PISTE : ce qu'on gagne a force de revenir, jamais en vente. Un jour
## rate ne remet rien a zero, il fait juste arriver la piece un jour plus tard.
const TRACK_LEN := 30
const MILESTONES := [
	{"at": 7, "name": "Giant Mushroom", "what": "burrow decoration", "art": "res://assets/deco/props/prop-03.png"},
	{"at": 14, "name": "Lucky Pumpkin", "what": "burrow decoration", "art": "res://assets/deco/props/prop-13.png"},
	{"at": 21, "name": "Carrot Statue", "what": "burrow decoration", "art": "res://assets/deco/carrote.png"},
	{"at": 30, "name": "Caramel Coat", "what": "rabbit coat", "art": "res://assets/bunnies/bunny-yellowish.webp"},
]
const ART := {
	"carrots": "res://assets/ui/icons/carrot.webp",
	"water": "res://assets/ui/icons/water.webp",
	"fertiliser": "res://assets/ui/icons/fertiliser.webp",
	"lightning": "res://assets/ui/icons/bolt.webp",
	"shield": "res://assets/ui/icons/shield.webp",
	"energy": "res://assets/gauge/dial-icon.webp",
	"magic_hat": "res://assets/ui/snack/hat.png",
	"lucky_foot": "res://assets/ui/snack/basket.png",
	"coat": "res://assets/bunnies/bunny-yellowish.webp",
	"genesis": "res://assets/nft/genesis-sealed.webp",
}
## Les planches : on n'en montre qu'une case (le lapin assis, la carotte
## la plus grande).
const REGIONS := {
	"res://assets/bunnies/bunny-yellowish.webp": Rect2(4, 9, 24, 23),
	"res://assets/deco/carrote.png": Rect2(100, 106, 34, 52),
	"res://assets/deco/props/prop-03.png": Rect2(14, 12, 38, 37),
	"res://assets/deco/props/prop-13.png": Rect2(5, 10, 56, 45),
}
const NAMES := {
	"carrots": "Carrots", "water": "Watering can", "fertiliser": "Fertiliser",
	"lightning": "Lightning", "shield": "Shield", "energy": "Full tank",
	"magic_hat": "Magic Hat", "lucky_foot": "Lucky Foot",
	"coat": "Caramel Coat", "genesis": "Genesis piece",
}

## {count, level, ready, wait, buff} — count = snacks deja pris, tout compte.
## buff : "idle" (s'allume a l'ouverture), "active", "used".
var view := {"count": 12, "level": 4, "ready": true, "wait": "9h 12m", "buff": "idle"}
## Le resultat montre ({} : boite fermee). Le banc peut le forcer.
var result: Dictionary = {}
## Pour le banc : le prochain tirage sort ce rang au lieu de rouler.
var force_tier := ""

var _chest: LootChest
var _chest_glow: TextureRect
var _open_button: PlankButton
var _buff_card: Control
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_canvas = Control.new()
	_canvas.name = "Cabinet"
	_canvas.size = DESIGN
	add_child(_canvas)
	_picture(_canvas, CABINET, Rect2(Vector2.ZERO, DESIGN), false)
	resized.connect(_layout)
	_rebuild()
	_layout()


func golden() -> bool:
	return (int(view["count"]) + 1) % 7 == 0


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
	_label(_content, I18N.shout("Snack Time"), Rect2(55, 11, 640, 34), 24, Palette.CREAM)
	_build_track()
	_build_box()
	_build_buff()
	_build_odds()
	_build_hint()
	move_child(close_button, get_child_count() - 1)


# ── La piste ────────────────────────────────────────────────────────────────

## LA PISTE PARLE EN JOURS, un seul compteur : « jour 13 » = le 13e jour ou
## tu es revenu. A gauche le jour, au milieu les jours jusqu'au prochain
## cadeau (une case par jour, son numero dedans, le cadeau dans la derniere),
## a droite les quatre cadeaux « JOUR 7 / 14 / 21 / 30 ». Deux versions
## rejetees le 2026-10-08 : silhouettes sur une barre de 30 (« on comprend
## pas trop »), puis « 5/7 » + « SNACK 14 » — lus comme une semaine ET un
## autre compteur (« c'est les jours de la semaine ? apres c'est les
## semaines ? »).
func _build_track() -> void:
	var panel := _panel(_content, Rect2(35, 58, 820, 74), false)
	panel.name = "Track"
	var count := int(view["count"])
	var waiting := result.is_empty() and bool(view["ready"])
	# Le jour a montrer : celui qu'on prend aujourd'hui, ou celui qu'on a pris.
	var today := count + 1 if waiting else count
	_label(panel, "DAY", Rect2(8, 6, 80, 16), 12, Palette.GOLD)
	_label(panel, str(today), Rect2(8, 18, 80, 34), 30, Palette.CREAM).name = "TodayNumber"
	_label(panel, "today" if waiting else ("taken ✓" if not result.is_empty() else "done"), Rect2(8, 50, 80, 16), 11, Palette.PARCHMENT)
	var next := _next_milestone(count)
	if next.is_empty():
		_label(panel, "Every gift collected!", Rect2(100, 0, 370, 74), 14, Palette.GOLD)
	else:
		var gift_day := int(next["at"])
		var from := _previous_at(gift_day)
		var title := _label(panel, "DAY %d GIFT:  %s  (%s)" % [gift_day, I18N.shout(String(next["name"])), next["what"]], Rect2(100, 4, 372, 18), 12, Palette.GOLD)
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var n := gift_day - from
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
				var edge := Palette.GOLD
				for r in [Rect2(0, 0, w, 2), Rect2(0, 42, w, 2), Rect2(0, 0, 2, 44), Rect2(w - 2, 0, 2, 44)]:
					_rect(cell, r, edge)
			if is_gift:
				var art := _picture(cell, _tex(String(next["art"])), Rect2(3, 2, w - 6, 28))
				if not taken:
					art.modulate = Color(1, 1, 1, 0.9)
				_label(cell, str(day), Rect2(0, 28, w, 14), 11, Palette.GOLD)
			else:
				_label(cell, str(day), Rect2(0, 4, w, 16), 13, Palette.CREAM if taken or is_today else Palette.CHALK_DIM)
				if taken:
					_tick(cell, Vector2(w * 0.5 - 7, 24))
				elif is_today:
					_label(cell, "TODAY", Rect2(0, 24, w, 14), 8, Palette.GOLD)
	# Les quatre cadeaux, en couleur, chacun avec SON jour.
	for i in MILESTONES.size():
		var m: Dictionary = MILESTONES[i]
		var at := int(m["at"])
		var got := count >= at
		var is_next := not next.is_empty() and at == int(next["at"])
		var card := Control.new()
		card.name = "Milestone_%d" % at
		card.position = Vector2(488 + i * 82, 6)
		card.size = Vector2(76, 62)
		panel.add_child(card)
		_rect(card, Rect2(0, 0, 76, 62), Color(Palette.GOLD, 0.22) if is_next else Color(Palette.SOIL_DEEP, 0.45))
		if is_next:
			for r in [Rect2(0, 0, 76, 2), Rect2(0, 60, 76, 2), Rect2(0, 0, 2, 62), Rect2(74, 0, 2, 62)]:
				_rect(card, r, Palette.GOLD)
		var art := _picture(card, _tex(String(m["art"])), Rect2(10, 4, 56, 38))
		if not got and not is_next:
			art.modulate = Color(1, 1, 1, 0.6)
		_label(card, "DAY %d" % at, Rect2(0, 43, 76, 16), 11, Palette.GOLD if is_next else (Palette.LEAF if got else Palette.PARCHMENT))
		if got:
			_tick(card, Vector2(58, 4))


func _next_milestone(count: int) -> Dictionary:
	for m in MILESTONES:
		if int(m["at"]) > count:
			return m
	return {}


func _previous_at(at: int) -> int:
	var from := 0
	for m in MILESTONES:
		if int(m["at"]) < at:
			from = int(m["at"])
	return from


# ── La boite ────────────────────────────────────────────────────────────────

func _build_box() -> void:
	var ready_now := bool(view["ready"])
	var open := not result.is_empty()
	var head := "Your snack box is ready!"
	var head_color := Palette.PARCHMENT
	if open:
		var tier := String(result["tier"])
		head = I18N.shout(TIER_NAME[tier]) + "!"
		head_color = TIER_TINT[tier]
	elif not ready_now:
		head = "Tomorrow's box"
	elif golden():
		head = "GOLDEN BOX — better odds!"
		head_color = Palette.GOLD
	_label(_content, head, Rect2(54, 140, 434, 23), 17, head_color)
	_picture(_content, PLINTH, Rect2(138, 235, 265, 83))
	var stage := Control.new()
	stage.name = "BoxStage"
	stage.position = Vector2(139, 150)
	stage.size = Vector2(264, 124)
	_content.add_child(stage)
	if ready_now or open:
		_reward_light(stage, Vector2(132, 70), 190, Palette.GOLD if golden() and not open else (TIER_TINT[result["tier"]] if open else Palette.CARROT))
	_chest_glow = _picture(stage, Shop._glow_texture(Palette.CREAM, 0.0), Rect2(42, -20, 180, 180), false)
	_chest = LootChest.new()
	_chest.crop = LootChest.Crop.OPENING
	_chest.width = 150.0
	_chest.size = _chest.custom_minimum_size
	_chest.position = Vector2(132 - 75, 112 - _chest.size.y)
	_chest.pivot_offset = Vector2(_chest.size.x * 0.5, _chest.size.y)
	stage.add_child(_chest)
	if golden() and not open:
		_chest.modulate = Color(1.35, 1.1, 0.45)
	if not ready_now and not open:
		var grey := ShaderMaterial.new()
		grey.shader = GREY
		_chest.material = grey
		_chest.shine = false
	if open:
		_chest.shine = false
		_chest.modulate = Color(1, 1, 1, 0.35)
		_chest.pop()
		_show_reward(stage, false)
	elif ready_now:
		_sparkles(stage, Rect2(14, 0, 236, 116))
	var text := "Open"
	if open or not ready_now:
		text = "Next box in " + String(view["wait"])
	_open_button = Kit.button(text, "gold", 224, 44)
	_open_button.name = "Open"
	_open_button.position = Vector2(159, 312)
	_open_button.size = Vector2(224, 44)
	_open_button.label_size = 18 if text.length() < 8 else 14
	_content.add_child(_open_button)
	_open_button.set_deferred("size", Vector2(224, 44))
	if open or not ready_now:
		_grey_out(_open_button)
	else:
		_open_button.pressed.connect(_open)


## Le butin qui sort de la boite. `animate` faux : pose a sa place (banc).
func _show_reward(stage: Control, animate: bool) -> void:
	var tier := String(result["tier"])
	var kind := String(result["kind"])
	var tex := _tex(ART[kind])
	var side := 76.0 if kind == "genesis" else 84.0
	var at := Vector2(132 - side * 0.5, 18.0 + (84.0 - side) * 0.5)
	var rays := Shop._rays(TIER_TINT[tier], side * 2.1)
	rays.position = at + Vector2.ONE * side * 0.5 - rays.size * 0.5
	stage.add_child(rays)
	var floating := FloatingItem.new()
	floating.name = "Reward"
	floating.position = at
	floating.size = Vector2(side, side)
	floating.amplitude = 3.0
	stage.add_child(floating)
	var art := _picture(floating, tex, Rect2(Vector2.ZERO, Vector2(side, side)))
	floating.add_floating(art)
	var amount := _label(stage, _reward_text(), Rect2(0, 124, 264, 32), 22, TIER_TINT[tier] if tier != "common" else Palette.GOLD)
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
	var kind := String(result["kind"])
	var qty := int(result["qty"])
	if kind == "carrots":
		return "+%d" % qty
	return NAMES[kind] + (" x%d" % qty if qty > 1 else "")


# ── L'ouverture ─────────────────────────────────────────────────────────────

func _open() -> void:
	if not result.is_empty():
		return
	_open_button.disabled = true
	result = roll()
	var tint: Color = TIER_TINT[result["tier"]]
	# LA COULEUR PARLE AVANT L'OBJET : la boite tremble de plus en plus fort,
	# et sa lueur vire a la teinte du rang — on sait que c'est rare une
	# demi-seconde avant de savoir quoi.
	var tw := _chest.create_tween()
	for i in 3:
		var swing := deg_to_rad(4.0 + i * 4.0)
		tw.tween_property(_chest, "rotation", swing, 0.07)
		tw.tween_property(_chest, "rotation", -swing, 0.1)
		tw.tween_property(_chest, "rotation", 0.0, 0.07)
		tw.tween_interval(0.12 - i * 0.03)
		tw.tween_callback(Sound.play.bind("coin", 0.9 + i * 0.15))
	_chest_glow.texture = Shop._glow_texture(tint, 0.7)
	_chest_glow.modulate.a = 0.0
	var glow := _chest_glow.create_tween()
	glow.tween_property(_chest_glow, "modulate:a", 1.0, 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await tw.finished
	_chest.pop()
	_chest.create_tween().tween_property(_chest, "modulate", Color(1, 1, 1, 0.35), 0.4)
	_flash(0.5 if result["tier"] == "common" else 0.85)
	Sound.play("match")
	_claim_at = Vector2(270, 200)
	_celebrate()
	var stage := _content.get_node("BoxStage") as Control
	_show_reward(stage, true)
	_relabel_head()
	_grey_out(_open_button)
	_open_button.relabel("Next box in " + String(view["wait"]))
	_open_button.label_size = 14
	await get_tree().create_timer(0.6).timeout
	view["buff"] = "active"
	_light_buff()
	_advance_track()


func _relabel_head() -> void:
	var tier := String(result["tier"])
	for child in _content.get_children():
		if child is Label and child.position == Vector2(54, 140):
			(child as Label).text = I18N.shout(TIER_NAME[tier]) + "!"
			(child as Label).add_theme_color_override("font_color", TIER_TINT[tier])


## Un tirage, avec les cotes affichees.
func roll() -> Dictionary:
	var odds: Dictionary = BOX["golden_odds"] if golden() else BOX["odds"]
	var tier := force_tier
	if tier.is_empty():
		var total := 0
		for t in odds:
			total += int(odds[t])
		var pick := _rng.randi_range(1, total)
		for t in odds:
			pick -= int(odds[t])
			if pick <= 0:
				tier = t
				break
	var options: Array = BOX["tiers"][tier]
	var entry: Array = options[_rng.randi_range(0, options.size() - 1)]
	var qty := int(entry[1])
	if entry[0] == "carrots":
		qty = int(BOX["carrots_per_level"]) * int(view["level"])
	return {"tier": tier, "kind": entry[0], "qty": qty}


func _advance_track() -> void:
	var before := int(view["count"])
	view["count"] = before + 1
	var count := int(view["count"])
	var next := _next_milestone(before)
	if not next.is_empty() and int(next["at"]) == count:
		_unlock(next)
		return
	# La case du jour se coche d'un saut.
	_redraw_track()
	var cell := _content.find_child("Day_%d" % count, true, false) as Control
	if cell != null:
		cell.pivot_offset = cell.size * 0.5
		cell.scale = Vector2.ONE * 1.3
		cell.create_tween().tween_property(cell, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_refresh_hint()


func _redraw_track() -> void:
	var old := _content.get_node("Track")
	_content.remove_child(old)
	old.queue_free()
	_build_track()
	_content.move_child(_content.get_node("Track"), 1)


func _refresh_hint() -> void:
	var hint := _content.get_node("Hint") as Label
	hint.text = _hint_text()


## UN PALIER ATTEINT : la piece saute hors de sa carte, la piste passe au
## cadeau suivant, et le pied le dit en vert.
func _unlock(m: Dictionary) -> void:
	_redraw_track()
	var card := _content.get_node("Track/Milestone_%d" % int(m["at"])) as Control
	card.pivot_offset = card.size * 0.5
	card.scale = Vector2.ONE * 0.3
	var tw := card.create_tween()
	tw.tween_property(card, "scale", Vector2.ONE * 1.25, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(card, "scale", Vector2.ONE, 0.25)
	Sound.play("coin", 1.4)
	var hint := _content.get_node("Hint") as Label
	hint.text = "UNLOCKED: %s — it's in your burrow!" % m["name"]
	hint.add_theme_color_override("font_color", Palette.LEAF)


func _flash(strength: float) -> void:
	var flash := ColorRect.new()
	flash.color = Color(1, 1, 1, strength)
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash.size = DESIGN
	_canvas.add_child(flash)
	var tw := flash.create_tween()
	tw.tween_property(flash, "color:a", 0.0, 0.35)
	tw.tween_callback(flash.queue_free)


# ── Le bonus du jour ────────────────────────────────────────────────────────

func _build_buff() -> void:
	var state := String(view["buff"])
	_buff_card = _panel(_content, Rect2(490, 140, 348, 92), state == "active")
	_buff_card.name = "Buff"
	_fill_buff()


func _fill_buff() -> void:
	for child in _buff_card.get_children():
		if child is Label or child.name == "BuffArt":
			child.queue_free()
	var state := String(view["buff"])
	var art := Control.new()
	art.name = "BuffArt"
	art.position = Vector2(12, 14)
	art.size = Vector2(64, 64)
	_buff_card.add_child(art)
	_picture(art, Kit.ICONS["carrot"], Rect2(4, 6, 52, 52))
	var times := _label(art, "x2", Rect2(30, 34, 40, 28), 20, Palette.GOLD)
	times.add_theme_constant_override("outline_size", 6)
	times.add_theme_color_override("font_outline_color", Palette.SOIL_DEEP)
	if state == "used":
		art.modulate = Color(1, 1, 1, 0.45)
	var title := _label(_buff_card, "BONUS OF THE DAY · BELLY FULL", Rect2(84, 10, 256, 20), 12, Palette.GOLD)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	var body := _label(_buff_card, "Your first run today pays double carrots.", Rect2(84, 30, 256, 34), 12, Palette.CREAM)
	body.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var status := "Starts when you open the box"
	var color := Palette.PARCHMENT.darkened(0.2)
	match state:
		"active":
			status = "ACTIVE until midnight — go dig!"
			color = Palette.LEAF
		"used":
			status = "Used today ✓  +312 carrots"
			color = Palette.PARCHMENT
	var line := _label(_buff_card, status, Rect2(84, 64, 256, 18), 11, color)
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT


func _light_buff() -> void:
	var at := _buff_card.position
	_buff_card.queue_free()
	_buff_card = _panel(_content, Rect2(at, Vector2(348, 92)), true)
	_buff_card.name = "Buff"
	_fill_buff()
	_buff_card.pivot_offset = _buff_card.size * 0.5
	_buff_card.scale = Vector2.ONE * 1.08
	_buff_card.create_tween().tween_property(_buff_card, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


# ── Les cotes ───────────────────────────────────────────────────────────────

func _build_odds() -> void:
	var panel := _panel(_content, Rect2(490, 240, 348, 118), false)
	var gold := golden() and result.is_empty()
	_label(panel, "WHAT'S INSIDE" + ("  ·  GOLDEN BOX" if gold else ""), Rect2(0, 6, 348, 18), 11, Palette.GOLD)
	var odds: Dictionary = BOX["golden_odds"] if gold else BOX["odds"]
	var y := 26.0
	for tier in ["common", "rare", "epic", "jackpot"]:
		var pct := int(odds[tier])
		var dim := pct == 0
		var name_label := _label(panel, TIER_NAME[tier], Rect2(14, y, 70, 20), 12, TIER_TINT[tier] if not dim else Palette.CHALK_DIM.darkened(0.3))
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var x := 92.0
		for entry in BOX["tiers"][tier]:
			var icon := _picture(panel, _tex(ART[entry[0]]), Rect2(x, y, 20, 20))
			if dim:
				icon.modulate.a = 0.3
			x += 24.0
		var detail := ""
		match tier:
			"common":
				detail = "+%d at Lv %d" % [int(BOX["carrots_per_level"]) * int(view["level"]), int(view["level"])]
			"rare":
				detail = "item"
			"epic":
				detail = "pack"
			"jackpot":
				detail = "coat / NFT"
		var d := _label(panel, detail, Rect2(x + 4, y, 120, 20), 11, Palette.PARCHMENT if not dim else Palette.CHALK_DIM.darkened(0.3))
		d.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var p := _label(panel, "%d%%" % pct, Rect2(280, y, 54, 20), 13, Palette.CREAM if not dim else Palette.CHALK_DIM.darkened(0.3))
		p.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		y += 22.0


# ── Le pied ─────────────────────────────────────────────────────────────────

func _build_hint() -> void:
	var hint := _label(_content, _hint_text(), Rect2(66, 369, 760, 20), 12, Palette.PARCHMENT)
	hint.name = "Hint"


func _hint_text() -> String:
	var count := int(view["count"])
	var waiting := result.is_empty() and bool(view["ready"])
	var lead := ""
	if waiting and golden():
		lead = "Today's box is GOLDEN"
	else:
		var gold := 7 - (count % 7)
		lead = "Golden box every 7th day — next in %d day%s" % [gold, "" if gold == 1 else "s"]
	return lead + "  ·  missing a day never resets your progress"


# ── Petits outils ───────────────────────────────────────────────────────────

func _tex(path: String) -> Texture2D:
	var tex: Texture2D = load(path)
	if not REGIONS.has(path):
		return tex
	var crop := AtlasTexture.new()
	crop.atlas = tex
	crop.region = REGIONS[path]
	crop.filter_clip = true
	return crop


func _rect(parent: Control, rect: Rect2, color: Color) -> ColorRect:
	var r := ColorRect.new()
	r.color = color
	r.position = rect.position
	r.size = rect.size
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(r)
	return r


func _grey_out(button: PlankButton) -> void:
	button.disabled = true
	button.focus_mode = Control.FOCUS_NONE
	button.mouse_default_cursor_shape = Control.CURSOR_ARROW
	var grey := ShaderMaterial.new()
	grey.shader = GREY
	grey.set_shader_parameter("dim", 0.85)
	button._plank.material = grey
