class_name PassDialog
extends Dialog
## LA FENETRE DU PASS DE SAISON.
##
## A gauche, l'offre : le prix, la duree, ce que le pass donne (lu dans la
## reponse du serveur, pas recopie ici — PASS.DAILY et PASS.PAYOUT_SHARES
## dans config/tuning.ts), puis UN bouton : acheter (bleu, l'argent), ou,
## pour qui l'a, ouvrir le coffre du jour (or) — eteint jusqu'a minuit UTC.
## A droite, la course : la cagnotte, les dix premiers detenteurs et ce
## qu'ils toucheraient si la saison finissait maintenant, et ma place.
##
## L'achat est celui de la boutique (Shop.UsdcPay, kind `season_pass`) : le
## meme devis, la meme signature, la meme confirmation.

const WIDTH := 680.0
const HEIGHT := 0.0
## La largeur que le contenu veut. Sur un bureau la fenetre s'arrete la et se
## centre ; sur le Seeker (890x400) elle ne tient pas avec son cadre, et
## Dialog.screen_rect la passe en plein ecran.
const HUG_W := 760.0
const LEFT_W := 290.0
const GOLD_ON_PAPER := Color("#9a6400")
const ACTIVE_GREEN := Color("#3d7a1f")
const BUY_H := 48.0

var _state: PassState
var _shop: ShopState
var _pay: Shop.UsdcPay
var _rail := "usdc"
var _busy := false

var _days: Label
var _columns: HBoxContainer
var _left: VBoxContainer
var _right: VBoxContainer


func _init() -> void:
	super(I18N.t("pass.title"), WIDTH, HEIGHT)
	# PLEIN ECRAN SUR LE SEEKER, a sa taille sur un bureau : `hug_size` dit
	# ce que le contenu veut, et screen_rect ne resserre que si ca tient.
	go_fullscreen()


func hug_size() -> Vector2:
	if _columns == null:
		return Vector2(HUG_W, 0.0)
	return Vector2(HUG_W, _inset.get_combined_minimum_size().y + _columns.get_combined_minimum_size().y)


static func open() -> PassDialog:
	var dialog := PassDialog.new()
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	Analytics.track("pass_open")
	_state = PassState.shared()
	_shop = ShopState.shared()
	_pay = Shop.UsdcPay.new()

	var header := title_label.get_parent()
	title_label.text = I18N.shout(I18N.t("pass.title"))
	var ticket := Kit.icon(PassState.GOLDEN_CARROT, 20)
	header.add_child(ticket)
	header.move_child(ticket, 0)
	_days = Kit.label("", 13, Palette.BARK)
	header.add_child(_days)
	header.move_child(_days, header.get_child_count() - 2)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	set_body(scroll)
	_columns = Kit.hbox(Kit.PAD * 2)
	_columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_columns)
	_left = Kit.vbox(Kit.PAD)
	_left.custom_minimum_size = Vector2(LEFT_W, 0)
	_columns.add_child(_left)
	_right = Kit.vbox(Kit.PAD_TIGHT)
	_right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_columns.add_child(_right)

	_state.changed.connect(_rebuild)
	_shop.changed.connect(_rebuild)
	_pay.changed.connect(_rebuild)
	I18N.locale_changed.connect(func(_c: String) -> void: _rebuild())
	closed.connect(func() -> void: _pay.error = "")
	_rebuild()
	_state.refresh()
	_shop.refresh()


func _rebuild() -> void:
	if _left == null:
		return
	for box in [_left, _right]:
		for child in box.get_children():
			box.remove_child(child)
			child.queue_free()
	var s := _state.state
	var days := _state.days_left()
	_days.text = "%d%s" % [days, I18N.t("units.d")] if _state.on() else ""
	_build_offer(s)
	_build_race(s)
	# Le contenu a pu grandir (dix lignes au lieu de trois) : le plein ecran
	# se remesure, et le chrome le recentre.
	refit.call_deferred()


# ── L'offre ──────────────────────────────────────────────────────────────────

func _build_offer(s: Dictionary) -> void:
	# LA TETE : le prix et la duree tant qu'on ne l'a pas ; une fois achete,
	# « PASS ACTIF » en vert et les jours qui restent — le prix n'a plus
	# rien a dire a qui a paye.
	var hero := Kit.hbox(Kit.PAD)
	hero.add_child(Kit.icon(PassState.GOLDEN_CARROT, 40))
	var season: Variant = s.get("season", null)
	if _state.holder():
		var col := Kit.vbox(0)
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		col.add_child(Kit.title(I18N.shout(I18N.t("pass.active")), 22, ACTIVE_GREEN))
		col.add_child(Kit.label(I18N.f("pass.left", [_state.days_left()]), 13, Palette.BARK))
		hero.add_child(col)
	else:
		var price := Kit.title(PassState.dollars(float(s.get("priceUsd", 4.99))), 28, Palette.INK)
		price.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		hero.add_child(price)
		var length := _season_days(season if season is Dictionary else {})
		var span := Kit.label("/ " + I18N.f("pass.days", [length]), 14, Palette.BARK)
		span.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		hero.add_child(span)
	_left.add_child(hero)

	var rewards: Dictionary = s.get("rewards", {}) if s.get("rewards", {}) is Dictionary else {}
	var daily: Dictionary = rewards.get("daily", {}) if rewards.get("daily", {}) is Dictionary else {}
	var shares: Array = rewards.get("shares", []) if rewards.get("shares", []) is Array else []
	var pot_share := "%d%%" % int(round(float(s.get("potShare", 0.5)) * 100.0))
	_left.add_child(_reward(PassState.chest_icon(), I18N.t("pass.daily"),
		I18N.f("pass.dailyWhat", [int(daily.get("trap", 1)), int(daily.get("bloop", 1))])))
	_left.add_child(_reward(Kit.CUP, I18N.t("pass.race"),
		I18N.f("pass.raceWhat", [pot_share, maxi(1, shares.size())])))
	_left.add_child(_reward(Kit.CROWN, I18N.t("pass.tag"), I18N.t("pass.tagWhat")))

	_left.add_child(Kit.spacer())
	_left.add_child(_action())
	var line := _pay_line()
	if not line.is_empty():
		_left.add_child(Kit.note(line, Palette.BAD_ON_PARCHMENT if not _pay.error.is_empty() else Palette.BARK, 12))


func _reward(tex: Texture2D, head: String, sub: String) -> Control:
	var row := Kit.hbox(Kit.PAD)
	var icon := Kit.icon(tex, 20)
	icon.custom_minimum_size = Vector2(28, 20)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	var text := Kit.vbox(0)
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.add_child(Kit.label(head, 13, Palette.INK))
	text.add_child(Kit.wrapped(Kit.label(sub, 11, Palette.BARK)))
	row.add_child(text)
	return row


## LE BOUTON UNIQUE, selon ou en est le joueur.
func _action() -> Control:
	var box := Kit.vbox(Kit.PAD_TIGHT)
	if not _state.on():
		box.add_child(Kit.note(I18N.t("pass.closed"), Palette.BARK, 13))
		return box

	if _state.holder():
		var ready := _state.can_claim()
		var wait := _state.next_chest_in()
		var label := I18N.t("pass.claim") if ready or wait.is_empty() else I18N.f("pass.next", [wait])
		var claim := Kit.button(label, "gold" if ready else "wood", LEFT_W, BUY_H)
		claim.label_size = 15
		claim.disabled = not ready or _busy
		claim.pressed.connect(_on_claim)
		box.add_child(claim)
		return box

	var tokens := _live_tokens()
	if tokens.is_empty():
		box.add_child(Kit.note(I18N.t("pass.connect"), Palette.BARK, 13))
		return box
	if not tokens.has(_rail):
		_rail = "usdc" if tokens.has("usdc") else String(tokens[0])

	var rails := Kit.hbox(Kit.PAD_TIGHT)
	for id in Shop.RAILS:
		if not tokens.has(id):
			continue
		var chip := Kit.button(String(Shop.RAILS[id]), "blue" if id == _rail else "wood", 0.0, 28.0)
		chip.label_size = 11
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		chip.disabled = _paying()
		chip.pressed.connect(func() -> void:
			_rail = id
			_rebuild())
		rails.add_child(chip)
	box.add_child(rails)

	var blocked: Variant = _state.mine().get("blocker", null)
	var blocker := "" if blocked == null else String(blocked)
	# « ACHETER  $4.99 » : le verbe ET le prix, en bleu (l'argent, comme l'etal).
	var buy := Kit.button(I18N.shout(I18N.t("pass.buy")) + "  " + _money_label(float(_state.state.get("priceUsd", 4.99))),
		"blue", LEFT_W, BUY_H)
	buy.label_size = 16
	buy.disabled = _paying() or not blocker.is_empty()
	if not blocker.is_empty():
		buy.tooltip_text = PassState.error_text(blocker)
	buy.pressed.connect(_on_buy)
	box.add_child(buy)
	if not blocker.is_empty() and blocker != "pass_closed":
		box.add_child(Kit.note(PassState.error_text(blocker), Palette.BAD_ON_PARCHMENT, 12))
	return box


func _paying() -> bool:
	return _pay.stage != Shop.UsdcPay.Stage.IDLE and _pay.stage != Shop.UsdcPay.Stage.DONE


func _pay_line() -> String:
	if not _pay.error.is_empty():
		return _pay.error
	return Shop.UsdcPay.stage_line(_pay.stage)


## Les rails vivants, comme l'etal : pas de tresorerie, ou un invite, pas de rail.
func _live_tokens() -> Array:
	if not bool(_shop.shop.get("usdcEnabled", false)):
		return []
	if bool(Session.player.get("guest", false)):
		return []
	var listed: Variant = _shop.shop.get("tokens", [])
	return listed if listed is Array else []


## Le prix dans le rail choisi, arrondi vers le haut (voir Shop._money_label).
func _money_label(usd: float) -> String:
	if _rail == "usdc":
		return PassState.dollars(usd)
	var rates: Variant = _shop.shop.get("rates", null)
	var rate := float(rates.get(_rail, 0.0)) if rates is Dictionary else 0.0
	if rate <= 0.0 or not is_finite(rate):
		return PassState.dollars(usd)
	var places: int = Shop.RAIL_PLACES.get(_rail, 2)
	var scale := pow(10.0, places)
	return String.num(ceilf(usd / rate * scale) / scale, places) + " " + String(Shop.RAILS[_rail])


func _season_days(season: Dictionary) -> int:
	var start := PassState.unix_of(String(season.get("startedAt", "")))
	var end := PassState.unix_of(String(season.get("endsAt", "")))
	if start <= 0.0 or end <= start:
		return 30
	return int(round((end - start) / 86400.0))


func _on_buy() -> void:
	await _pay.pay(PassState.KIND, 1, _rail)
	if not _pay.error.is_empty() and Chrome.current != null:
		Chrome.current.toast(_pay.error, true)
	_rebuild()


func _on_claim() -> void:
	if _busy:
		return
	_busy = true
	_rebuild()
	await _state.claim()
	_busy = false
	_rebuild()


# ── La course ────────────────────────────────────────────────────────────────

func _build_race(s: Dictionary) -> void:
	var pool_head := Kit.hbox(Kit.PAD_TIGHT)
	pool_head.add_child(Kit.icon(Kit.CUP, 24))
	pool_head.add_child(Kit.label(I18N.shout(I18N.t("pass.pool")), 14, Palette.BARK))
	_right.add_child(pool_head)
	_right.add_child(Kit.title(PassState.dollars(float(s.get("prizePoolUsd", 0.0))), 34, GOLD_ON_PAPER))
	var pot_share := "%d%%" % int(round(float(s.get("potShare", 0.5)) * 100.0))
	_right.add_child(Kit.label(I18N.f("pass.poolLine",
		[pot_share, PassState.dollars(float(s.get("potUsd", 0.0))), int(s.get("holders", 0))]), 12, Palette.BARK))

	var top: Array = s.get("top", []) if s.get("top", []) is Array else []
	var me := String(Session.player.get("id", ""))
	var list := Kit.vbox(0)
	for i in top.size():
		var e: Variant = top[i]
		if e is Dictionary:
			list.add_child(_race_row(e, i, me))
	if top.is_empty():
		list.add_child(Kit.note(I18N.t("pass.empty"), Palette.BARK, 12))
	_right.add_child(list)

	if _state.holder():
		var m := _state.mine()
		var rank: Variant = m.get("rank", null)
		var you := I18N.f("pass.you", [int(rank), PassState.dollars(float(m.get("prizeUsd", 0.0)))]) \
			if (rank is int or rank is float) else I18N.t("pass.unranked")
		_right.add_child(Kit.label(you, 13, Palette.INK))
	_right.add_child(Kit.note(I18N.t("pass.terms"), Palette.BARK, 11))


func _race_row(e: Dictionary, index: int, me: String) -> Control:
	var mine := String(e.get("playerId", "")) == me and not me.is_empty()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(GOLD_ON_PAPER, 0.18) if mine else (Color(Palette.BARK, 0.08) if index % 2 == 0 else Color.TRANSPARENT)
	style.set_corner_radius_all(4)
	style.set_content_margin_all(3)
	style.content_margin_left = 6
	style.content_margin_right = 6
	var panel := Kit.panel(style)
	var row := Kit.hbox(8)
	panel.add_child(row)
	var rank := int(e.get("rank", index + 1))
	var rank_label := Kit.label(str(rank), 13, GOLD_ON_PAPER if rank <= 3 else Color(Palette.BARK, 0.7))
	rank_label.custom_minimum_size = Vector2(20, 0)
	rank_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(rank_label)
	var name := Kit.label(String(e.get("name", "")), 13, Palette.INK)
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	row.add_child(name)
	row.add_child(Kit.label(I18N.group_digits(float(e.get("score", 0))), 13, Palette.CARROT))
	var prize := Kit.label(PassState.dollars(float(e.get("prizeUsd", 0.0))), 13, GOLD_ON_PAPER)
	prize.custom_minimum_size = Vector2(62, 0)
	prize.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(prize)
	return panel
