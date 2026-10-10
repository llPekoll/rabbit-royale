class_name ForestShop
extends Control
## L'ECHOPPE DE LA FORET — la boutique depuis le 2026-10-08.
##
## Remplace l'etal en rangee (shop.gd) a l'ecran. shop.gd garde ce que tout le
## jeu partage : le paiement en argent (`Shop.UsdcPay`), les rails et leurs
## prix (`Shop.money_label`), l'art d'une sorte (`Shop._art`).
##
##   • TROIS ONGLETS : PACKS (les quatre affaires, et l'appel vers les skins),
##     OBJETS (les sept sortes, deux rangees) et SKINS (la garde-robe a
##     vendre, le lapin en grand sur sa souche).
##   • UN RAIL POUR TOUT L'ONGLET, comme l'etal : carottes ou argent pour les
##     packs et les objets, l'argent seul pour les skins. Un rail que le
##     deploiement ne prend pas est dessine eteint, avec sa raison.
##   • L'ACHAT EN CAROTTES EN DEUX PRESSIONS, comme l'etal (un achat est
##     parti sur un clic egare, 2026-09-24). L'argent n'en a pas besoin : le
##     wallet demande deja.
##   • UN PLATEAU DE 1280x620 mis a l'echelle de la vue : le decor peint est
##     une seule image, les mots et les boutons sont de vrais noeuds dessus.
##   • LE DECOR VIT : la lanterne respire, des lucioles passent, les cartes
##     tombent sur l'etagere a chaque onglet et flottent.
##
## Banc : scenes/bench/forest_shop_bench.tscn (`demo`, achats factices).

## Le chrome le retire quand il part (le [x], Echap, le voile).
signal closed

const DESIGN := Vector2(1280, 620)
## Ce que le plateau occupe vraiment : le titre monte a -18, le pied descend a
## 618. La mise a l'echelle tient sur cette boite, pas sur DESIGN — au Seeker
## (890x400) le titre sortait par le haut.
const DRAWN := Rect2(0, -18, 1280, 640)
## Le verre de la lanterne dans l'image du decor, en pixels de l'image.
const LANTERN := Vector2(75, 187)
const LANTERN_GLOW := Color("#ffc36b")
const ARM_SECONDS := 3.0
const SKINS := ["solana", "carrot", "solflare"]
const MONEY := ["usdc", "sol", "skr"]

## Lu par le chrome (`_center_dialog`) : la boutique prend la vue.
var fullscreen := true
## BANC SEULEMENT : les achats sont faits sur place et fetes, rien ne part.
var demo := false

var _state: ShopState
var _skin_state: SkinState
var _pay: Shop.UsdcPay
var _board: Control
var _lantern: TextureRect
var _purse: Label
var _rabbit: AnimatedSprite2D
var _page := "packs"
var _rail := "carrots"
var _skin := "solana"
var _pose := "idle"
## La sorte dont le prix demande confirmation ("skin:<cle>" pour un skin).
var _armed := ""
var _arm_ticket := 0
var _t := 0.0
## L'onglet et le skin dont l'entree a deja joue : changer de rail refait le
## plateau, et ne doit pas refaire tomber les cartes.
var _shown := ""
var _shown_skin := ""
## Ce que le dernier rendu a dessine : un Home relu sans rien de neuf ne
## refait pas le plateau (et ne coupe pas la fete d'un achat).
var _drawn := ""
var _queued := false


static func open() -> ForestShop:
	var shop := ForestShop.new()
	if Chrome.current != null:
		Chrome.current.open(shop)
	return shop


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	# Le decor peint est lisse ; les sprites du jeu restent au pixel, et la
	# fete d'un achat aussi quand elle se pose ici (banc).
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func _ready() -> void:
	_state = ShopState.shared()
	_skin_state = SkinState.shared()
	_pay = Shop.UsdcPay.new()
	var bg := ForestShopStyle.picture(ForestShopStyle.BACKDROP, false)
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	Kit.fill(bg)
	add_child(bg)
	_lantern = TextureRect.new()
	_lantern.texture = Shop._glow_texture(LANTERN_GLOW, 0.55)
	_lantern.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_lantern.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lantern.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_lantern.material = add
	add_child(_lantern)
	var flies := Fireflies.new()
	Kit.fill(flies)
	add_child(flies)
	_board = Control.new()
	_board.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_board.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_board.size = DESIGN
	add_child(_board)
	resized.connect(_layout)
	for source: Signal in [_state.changed, Home.changed, _pay.changed, _skin_state.changed, PassState.shared().changed]:
		source.connect(_queue)
	I18N.locale_changed.connect(func(_code: String) -> void: _queue())
	_state.bought.connect(_celebrate)
	closed.connect(func() -> void:
		_state.clear_note()
		_pay.error = "")
	if not demo:
		Analytics.track("shop_open")
		# Relire a chaque ouverture : les avoirs ont pu bouger (bombe posee,
		# eclair lance, coffre). Le rattrapage des paiements, une fois.
		_state.refresh()
		_state.claim()
		_skin_state.refresh()
	_layout()
	_render()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		accept_event()
		closed.emit()


func _process(delta: float) -> void:
	_t += delta
	# Deux vagues lentes et une rapide : une flamme, pas un metronome.
	_lantern.modulate.a = 0.78 + 0.12 * sin(_t * 2.1) + 0.06 * sin(_t * 5.3 + 1.0) + 0.04 * sin(_t * 13.0)


func _layout() -> void:
	if _board == null:
		return
	var k := minf(size.x / DRAWN.size.x, size.y / DRAWN.size.y)
	_board.scale = Vector2.ONE * k
	_board.position = ((size - DRAWN.size * k) * 0.5 - DRAWN.position * k).floor()
	var art := Vector2(ForestShopStyle.BACKDROP.get_size())
	var cover := maxf(size.x / art.x, size.y / art.y)
	_lantern.size = Vector2.ONE * 190.0 * cover
	_lantern.position = (size - art * cover) * 0.5 + LANTERN * cover - _lantern.size * 0.5


# ── Les pieces ──────────────────────────────────────────────────────────────

func _put(node: Control, rect: Rect2, parent: Control = null) -> Control:
	node.position = rect.position + (Vector2(0, 32) if parent == null else Vector2.ZERO)
	node.size = rect.size
	(parent if parent != null else _board).add_child(node)
	return node


func _label(words: String, rect: Rect2, px := 16, color: Color = ForestShopStyle.CREAM, parent: Control = null) -> Label:
	var font := ThemeDB.get_project_theme().default_font
	while px > 10 and font.get_string_size(words, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x > rect.size.x - 8:
		px -= 1
	var text := ForestShopStyle.words(words, px, color)
	_put(text, rect, parent)
	return text


func _picture(tex: Texture2D, rect: Rect2, parent: Control = null) -> TextureRect:
	return _put(ForestShopStyle.picture(tex), rect, parent) as TextureRect


## Un sprite du jeu (objet, carotte) : au pixel, jamais lisse par l'echoppe.
func _pixel(tex: Texture2D, rect: Rect2, parent: Control = null) -> TextureRect:
	var node := _picture(tex, rect, parent)
	node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	return node


func _panel(rect: Rect2, selected := false, parent: Control = null) -> NineSlice:
	return _put(ForestShopStyle.panel("selected" if selected else "panel", 28), rect, parent) as NineSlice


func _button(words: String, rect: Rect2, face := "tab-off", px := 16, parent: Control = null) -> Button:
	var font := ThemeDB.get_project_theme().default_font
	while px > 9 and font.get_string_size(words, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x > rect.size.x - 32:
		px -= 1
	var button := ForestShopStyle.button(words, face, px)
	_put(button, rect, parent)
	return button


func _nameplate(words: String, rect: Rect2, parent: Control = null) -> void:
	_put(ForestShopStyle.panel("nameplate", 16), rect, parent)
	_label(I18N.shout(words), Rect2(rect.position + Vector2(15, 0), rect.size - Vector2(30, 0)), 16, ForestShopStyle.INK, parent)


func _animated(key: String, at: Vector2, scale_px: float, parent: Node = null) -> AnimatedSprite2D:
	var rabbit := AnimatedSprite2D.new()
	rabbit.sprite_frames = SkinWardrobe.frames(key)
	rabbit.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	rabbit.centered = false
	rabbit.offset = Vector2(-16, -32)
	rabbit.scale = Vector2.ONE * scale_px
	rabbit.position = at + (Vector2(0, 32) if parent == null else Vector2.ZERO)
	(parent if parent != null else _board).add_child(rabbit)
	rabbit.play("idle")
	return rabbit


# ── Le rendu ────────────────────────────────────────────────────────────────

func _queue() -> void:
	if _queued:
		return
	_queued = true
	_render.call_deferred()


## Les rails d'argent que l'etal prend : pas de tresorerie, ou un invite (pas
## de wallet d'ou payer), et il n'y en a aucun.
func _live_tokens() -> Array:
	if not bool(_state.shop.get("usdcEnabled", false)):
		return []
	if bool(Session.player.get("guest", false)):
		return []
	var listed: Variant = _state.shop.get("tokens", [])
	return listed if listed is Array else []


func _skin_tokens() -> Array:
	var listed: Variant = _skin_state.catalog.get("tokens", [])
	return listed if listed is Array and not listed.is_empty() else MONEY


## Le rail suit l'onglet : les skins ne se paient qu'en argent, et un rail
## qui n'est plus pris revient aux carottes.
func _fix_rail() -> void:
	if _page == "skins":
		var tokens := _skin_tokens()
		if not tokens.has(_rail):
			_rail = String(tokens[0])
	elif _rail != "carrots" and not _live_tokens().has(_rail):
		_rail = "carrots"


func _render() -> void:
	_queued = false
	_fix_rail()
	var drawn := var_to_str([_page, _rail, _skin, _pose, _armed, I18N.locale, _state.shop, _state.stock(),
		_state.busy, _state.note, _state.load_failed, _pay.stage, _pay.error, _skin_state.catalog,
		_skin_state.busy, _skin_state.note, _skin_state.loading, PassState.shared().on()])
	if drawn == _drawn:
		return
	_drawn = drawn
	_rabbit = null
	for child in _board.get_children():
		_board.remove_child(child)
		child.queue_free()
	_head()
	match _page:
		"items": _items()
		"skins": _skins()
		_: _packs()
	_foot()
	if _page != _shown:
		_shown = _page
		_enter()


## L'en-tete : le titre (le decor n'a aucun mot), le pass, la bourse, le [x],
## les onglets et les rails.
func _head() -> void:
	_label(I18N.shout(I18N.t("shop.title")), Rect2(116, -50, 320, 72), 38)
	if PassState.shared().on():
		var pass_entry := _button(I18N.shout(I18N.t("pass.short")), Rect2(600, -20, 260, 52), "action", 17)
		pass_entry.name = "Pass"
		pass_entry.tooltip_text = I18N.t("pass.title")
		pass_entry.pressed.connect(func() -> void: PassDialog.open())
	_put(ForestShopStyle.panel("tab-off", 20), Rect2(911, -22, 214, 56))
	_pixel(Kit.ICONS["carrot"], Rect2(940, -15, 36, 34))
	_purse = _label(I18N.group_digits(_state.stock()), Rect2(987, -20, 118, 54), 22)
	_purse.name = "Purse"
	var close := TextureButton.new()
	close.name = "Close"
	close.texture_normal = ForestShopStyle.texture("close")
	close.ignore_texture_size = true
	close.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	close.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_put(close, Rect2(1133, -24, 56, 60))
	close.pressed.connect(func() -> void: closed.emit())
	var tabs := ["packs", "items", "skins"]
	var names := [I18N.t("shop.tabPacks"), I18N.t("shop.tabItems"), I18N.t("shop.tabSkins")]
	for i in tabs.size():
		var key: String = tabs[i]
		var tab := _button(I18N.shout(names[i]), Rect2(112 + i * 183, 57, 174, 56), "tab-on" if key == _page else "tab-off", 19)
		tab.name = "Tab_" + key
		tab.pressed.connect(func() -> void:
			_page = key
			_armed = ""
			_queue())
	var rails: Array = MONEY if _page == "skins" else ["carrots"] + MONEY
	var live: Array = _skin_tokens() if _page == "skins" else ["carrots"] + _live_tokens()
	for i in rails.size():
		var key: String = rails[i]
		var b := _button("" if key == "carrots" else key.to_upper(), Rect2(704 + i * 116, 62, 110, 46), "tab-on" if key == _rail else "tab-off", 13)
		b.name = "Rail_" + key
		if key == "carrots":
			_pixel(Kit.ICONS["carrot"], Rect2(42, 9, 27, 28), b)
		if not live.has(key):
			b.disabled = true
			b.modulate.a = 0.5
			b.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN
			b.tooltip_text = _dead_reason()
		b.pressed.connect(func() -> void:
			_rail = key
			_armed = ""
			_queue())


## Pourquoi les rails d'argent sont eteints (la meme paire que le pied).
func _dead_reason() -> String:
	if _state.loaded() and not bool(_state.shop.get("usdcEnabled", false)):
		return I18N.t("shop.cardsOff")
	return I18N.t("shop.connectForCard")


## Tant que le premier /api/shop n'est pas rentre : le mot, pas un etal vide.
func _waiting() -> bool:
	if _state.loaded():
		return false
	var words := I18N.t("err_offline") if _state.load_failed else I18N.shout(I18N.t("chrome.loading")) + "..."
	_label(words, Rect2(112, 260, 1060, 80), 26)
	return true


func _packs() -> void:
	if _waiting():
		return
	var packs := _state.packs()
	for i in mini(packs.size(), 4):
		var it: Dictionary = packs[i]
		var key := String(it.get("kind", ""))
		var panel := _panel(Rect2(109 + i * 269, 137, 254, 333))
		panel.name = "Pack_" + key
		var art: Control
		if ForestShopStyle.REGIONS.data.has(key):
			art = _picture(ForestShopStyle.texture(key), Rect2(13, 48, 228, 200), panel)
		else:
			art = Shop._art(key, I18N.t("items." + key + ".name"), ForestShopStyle.GOLD, 180)
			_put(art, Rect2(37, 58, 180, 180), panel)
		_bob(art)
		panel.set_meta("art", art)
		_nameplate(I18N.t("items." + key + ".name"), Rect2(12, 14, 230, 36), panel)
		var lines: Array = it.get("items", ShopState.pack_items(key))
		var at := (254.0 - lines.size() * 68.0) * 0.5
		for j in lines.size():
			var kind := String(lines[j].get("kind", ""))
			if ShopState.ART.has(kind):
				_pixel(ShopState.ART[kind], Rect2(at + j * 68, 239, 29, 27), panel)
			_label("x%d" % int(lines[j].get("qty", 1)), Rect2(at + 31 + j * 68, 239, 35, 27), 13, ForestShopStyle.CREAM, panel)
		_price(it, Rect2(17, 271, 220, 52), panel)
		var cut := roundi(float(it.get("discount", 0.0)) * 100.0)
		if cut > 0:
			var ribbon := _picture(ForestShopStyle.texture("discount"), Rect2(196, 47, 60, 38), panel)
			_label("-%d%%" % cut, Rect2(1, 6, 52, 23), 10, ForestShopStyle.CREAM, ribbon)
			_pulse(ribbon, i * 0.15)
		_card(panel)
	# L'appel vers les skins, sous les packs.
	_put(ForestShopStyle.panel("tab-off", 22), Rect2(112, 479, 1060, 76))
	_label(I18N.shout(I18N.t("shop.tabSkins")), Rect2(136, 490, 156, 52), 22)
	# Le pas tient tous les skins entre le titre et le bouton (a 895).
	var step := minf(256.0, 540.0 / SKINS.size())
	for i in SKINS.size():
		var key: String = SKINS[i]
		var bunny := _animated(key, Vector2(346 + i * step, 530), 2.2)
		# De temps en temps l'un d'eux fait la fete, jamais deux ensemble :
		# chacun a son tour, 3 s apres le precedent.
		var cheer := bunny.create_tween().set_loops()
		cheer.tween_interval(2.0 + i * 3.0)
		cheer.tween_callback(bunny.play.bind("happy"))
		cheer.tween_interval(1.2)
		cheer.tween_callback(bunny.play.bind("idle"))
		cheer.tween_interval(3.0 * SKINS.size() - 0.2 - i * 3.0)
		_label(String(SkinState.SALE_NAMES.get(key, key)).to_upper(), Rect2(374 + i * step, 491, step - 64, 48), 17)
	var open := _button(I18N.shout(I18N.t("shop.viewSkins")), Rect2(895, 490, 246, 53), "tab-on", 17)
	open.name = "ViewSkins"
	_pulse(open, 1.0, 1.05)
	open.pressed.connect(func() -> void:
		_page = "skins"
		_armed = ""
		_queue())


func _items() -> void:
	if _waiting():
		return
	# L'energie mene, comme sur l'etal : « Out of energy » envoie ici pour elle.
	var list: Array = []
	for it in _state.items():
		if it.get("kind", "") == "energy":
			list.push_front(it)
		else:
			list.push_back(it)
	list = list.slice(0, 8)
	for i in list.size():
		var it: Dictionary = list[i]
		var kind := String(it.get("kind", ""))
		var row := i / 4
		var col := i % 4
		var in_row := mini(4, list.size() - row * 4)
		var x := 110 + col * 269 + (4 - in_row) * 134
		var panel := _panel(Rect2(x, 136 + row * 212, 252, 207))
		panel.name = "Item_" + kind
		var item_name := I18N.t("items." + kind + ".name")
		_nameplate(item_name, Rect2(12, 12, 228, 33), panel)
		# Un petit sprite prend un multiple entier de ses pixels : aucun ne
		# double de travers.
		var px := 86.0
		if ShopState.ART.has(kind) and ShopState.ART[kind].get_height() <= 48:
			var h: float = ShopState.ART[kind].get_height()
			px = h * roundf(px / h)
		var art := Shop._art(kind, item_name, ForestShopStyle.GOLD, px)
		art.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_put(art, Rect2(127 - px * 0.5, 94 - px * 0.5, px, px), panel)
		_bob(art)
		panel.set_meta("art", art)
		var held := ShopState.held_label(kind, int(it.get("held", 0)), int(it.get("cap", 0)))
		var count := _label(held, Rect2(163, 106, 72, 26), 13, ForestShopStyle.MUTED, panel)
		count.name = "Held"
		_price(it, Rect2(22, 144, 210, 51), panel)
		panel.tooltip_text = I18N.t("items." + kind + ".blurb")
		_card(panel)


## LE PRIX EST LE BOUTON. En carottes : or quand on peut payer, bois eteint
## sinon, « MAX » (ou ACTIF, SAC PLEIN) quand il n'y a plus de place ; une
## premiere pression demande confirmation. En argent : vert, le wallet
## demande lui-meme.
func _price(it: Dictionary, rect: Rect2, parent: Control) -> void:
	var kind := String(it.get("kind", ""))
	var item_name := I18N.t("items." + kind + ".name")
	var pack := ShopState.PACKS.has(kind)
	var money := _rail != "carrots" and _live_tokens().has(_rail)
	var full := not bool(it.get("hasRoom", true))
	var can_buy := _state.can_buy(it)
	var dead := _state.busy or _pay.stage != Shop.UsdcPay.Stage.IDLE or (full if money else not can_buy)
	var capped := full and not money
	var armed := _armed == kind and not dead
	var words := I18N.group_digits(int(it.get("price", 0))) + "  "
	if money:
		words = Shop.money_label(float(it.get("usdc", 0.0)), _rail, _state.shop.get("rates", null))
	elif capped:
		var running := String(ShopState.COUNTS.get(kind, "carried")) == "time"
		words = I18N.shout(I18N.t("shop.bagFull" if pack else ("shop.active" if running else "shop.max")))
	if armed:
		words = I18N.shout(I18N.t("shop.confirmBuy"))
	var face := "tab-on" if money or armed else ("tab-off" if dead else "action")
	var b := _button(words, rect, face, 20, parent)
	b.name = "Price"
	b.disabled = dead
	if dead:
		b.modulate.a = 0.75
	if not money and not capped and not armed:
		_pixel(Kit.ICONS["carrot"], Rect2(rect.size.x - 39, 11, 23, 25), b)
	var carrot_price := I18N.f("shop.priceLabel", [I18N.group_digits(int(it.get("price", 0)))])
	if money:
		b.tooltip_text = "$%.2f" % float(it.get("usdc", 0.0))
	elif full:
		b.tooltip_text = I18N.f("shop.capped", [item_name, carrot_price])
	elif can_buy:
		b.tooltip_text = I18N.f("shop.buy", [item_name, carrot_price])
	else:
		b.tooltip_text = I18N.f("shop.tooPoor", [item_name, carrot_price])
	b.pressed.connect(func() -> void:
		if money:
			_pay_money(kind)
		elif _armed == kind:
			_armed = ""
			_buy(kind)
		else:
			_arm(kind))


func _arm(key: String) -> void:
	_armed = key
	_arm_ticket += 1
	var ticket := _arm_ticket
	get_tree().create_timer(ARM_SECONDS).timeout.connect(func() -> void:
		if ticket == _arm_ticket and is_instance_valid(self):
			_armed = ""
			_queue())
	_queue()


func _buy(kind: String) -> void:
	if demo:
		_fake_buy(kind)
		return
	await _state.buy(kind)
	_queue()


func _pay_money(kind: String) -> void:
	if demo:
		_state.bought.emit(kind, 1)
		return
	await _pay.pay(kind, 1, _rail)
	if not _pay.error.is_empty():
		_state.noted.emit(_pay.error, true)
	_queue()


## BANC : l'achat en carottes fait sur l'etal factice, puis fete.
func _fake_buy(kind: String) -> void:
	var paid := false
	for it: Dictionary in _state.items() + _state.packs():
		if it.get("kind", "") != kind or not _state.can_buy(it):
			continue
		_state.shop["stock"] = _state.stock() - int(it.get("price", 0))
		var lines: Array = it.get("items", [{"kind": kind, "qty": 1}])
		for line: Dictionary in lines:
			var held := _state.item(String(line.get("kind", "")))
			if not held.is_empty():
				held["held"] = mini(int(held.get("held", 0)) + int(line.get("qty", 1)), int(held.get("cap", 0)))
				held["hasRoom"] = int(held["held"]) < int(held.get("cap", 0))
		paid = true
	if paid:
		_state.changed.emit()
		_state.bought.emit(kind, 1)


## UN ACHAT SE FETE sur tout l'ecran (purchase_reveal.gd), et sur sa carte :
## l'art saute et jette une gerbe d'eclats dores, la bourse tressaute.
func _celebrate(kind: String, qty: int) -> void:
	if not ShopState.KINDS.has(kind) and not ShopState.PACKS.has(kind):
		return
	PurchaseReveal.announce(kind, qty)
	# Le plateau se refait D'ABORD sur le nouvel etal, pour que la fete joue
	# sur les cartes qui restent.
	_render()
	_purse.pivot_offset = _purse.size * 0.5
	var tick := _purse.create_tween()
	tick.tween_property(_purse, "scale", Vector2.ONE * 1.2, 0.08)
	tick.tween_property(_purse, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	var card := _board.find_child(("Pack_" if ShopState.PACKS.has(kind) else "Item_") + kind, false, false)
	if card == null or not card.has_meta("art"):
		return
	var art: Control = card.get_meta("art")
	art.pivot_offset = art.size * 0.5
	var pop := art.create_tween()
	pop.tween_property(art, "scale", Vector2(1.3, 1.3), 0.09).set_ease(Tween.EASE_OUT)
	pop.tween_property(art, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	var from := art.position + art.size * 0.5
	for i in 12:
		var spark := ColorRect.new()
		var s := 4.0 if i % 3 else 6.0
		spark.size = Vector2(s, s)
		spark.color = ForestShopStyle.GOLD if i % 2 else ForestShopStyle.CREAM
		spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spark.position = from - spark.size * 0.5
		card.add_child(spark)
		var to := from + Vector2.from_angle(TAU * i / 12.0 + randf() * 0.3) * (40.0 + randf() * 22.0)
		var fly := spark.create_tween().set_parallel()
		fly.tween_property(spark, "position", to - spark.size * 0.5, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		fly.tween_property(spark, "modulate:a", 0.0, 0.45).set_delay(0.12)
		fly.chain().tween_callback(spark.queue_free)


# ── Les skins ───────────────────────────────────────────────────────────────

## « Invite » veut dire sans wallet d'ou payer.
func _guest() -> bool:
	return bool(Session.player.get("guest", false)) and not _skin_state._fake


func _skins() -> void:
	# La colonne (417 de haut, comme la scene) se partage entre les skins :
	# a deux, le lapin trone au-dessus de son nom ; au-dela, il passe a cote.
	var tall := SKINS.size() <= 2
	var h := (417.0 - 9.0 * (SKINS.size() - 1)) / SKINS.size()
	for i in SKINS.size():
		var key: String = SKINS[i]
		var b := Button.new()
		b.name = "Skin_" + key
		b.flat = true
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		_put(b, Rect2(112, 136 + i * (h + 9.0), 282, h))
		_panel(Rect2(0, 0, 282, h), key == _skin, b)
		var plate := String(SkinState.SALE_NAMES.get(key, key))
		if tall:
			_animated(key, Vector2(140, 141), 7.2, b)
			_nameplate(plate, Rect2(37, 155, 208, 36), b)
		else:
			_animated(key, Vector2(80, h - 14), 5.4, b)
			_nameplate(plate, Rect2(142, h * 0.5 - 24, 124, 36), b)
		if _skin_state.owns(key):
			var tag := Rect2(150, 14, 120, 26) if tall else Rect2(146, h * 0.5 + 14, 116, 26)
			_label(I18N.shout(I18N.t("skins.owned")), tag, 12, ForestShopStyle.GOLD, b)
		b.pressed.connect(func() -> void:
			_skin = key
			_armed = ""
			_queue())
		_card(b)
	_panel(Rect2(405, 136, 414, 417))
	_picture(ForestShopStyle.texture("pedestal"), Rect2(435, 330, 352, 130))
	_rabbit = _animated(_skin, Vector2(610, 350), 11.0)
	_rabbit.play(_pose)
	if _skin != _shown_skin or _page != _shown:
		# Un nouveau skin saute sur la souche.
		_shown_skin = _skin
		var rest := _rabbit.position.y
		_rabbit.position.y = rest - 60.0
		_rabbit.modulate.a = 0.0
		var hop := _rabbit.create_tween().set_parallel()
		hop.tween_property(_rabbit, "position:y", rest, 0.45).set_delay(0.12).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
		hop.tween_property(_rabbit, "modulate:a", 1.0, 0.15).set_delay(0.12)
	var poses := ["idle", "move", "happy"]
	for i in poses.size():
		var pose: String = poses[i]
		var b := _button(I18N.shout(I18N.t("skins." + pose)), Rect2(422 + i * 128, 476, 124, 56), "tab-on" if pose == _pose else "tab-off", 13)
		b.name = "Pose_" + pose
		b.pressed.connect(func() -> void:
			_pose = pose
			_queue())
	_panel(Rect2(830, 136, 342, 417))
	_label(String(SkinState.SALE_NAMES.get(_skin, _skin)).to_upper(), Rect2(855, 159, 294, 59), 29)
	_label(I18N.t("skins.permanent"), Rect2(853, 229, 298, 28), 13)
	_label(I18N.t("skins.cosmetic"), Rect2(853, 263, 298, 28), 13, ForestShopStyle.MUTED)
	var item := _skin_state.item(_skin)
	if item.is_empty():
		_label(I18N.t("skins.loadFailed") if _skin_state.failed else I18N.t("profile.loading"), Rect2(853, 328, 298, 57), 16)
		if _skin_state.failed:
			var retry := _button(I18N.shout(I18N.t("skins.retry")), Rect2(854, 408, 294, 66), "action", 21)
			retry.pressed.connect(_skin_state.refresh)
		return
	var owned := _skin_state.owns(_skin)
	var equipped: bool = _skin_state.catalog.get("equipped") == _skin
	var pending := bool(item.get("pending", false)) and not owned
	var price := Shop.money_label(float(item.get("usdCents", 0)) / 100.0, _rail, _skin_state.catalog.get("rates", null))
	_label(I18N.t("skins.owned") if owned else price, Rect2(853, 328, 298, 57), 28)
	var guest := _guest()
	var armed := _armed == "skin:" + _skin
	var words := I18N.t("skins.equipped") if equipped else I18N.t("skins.equip")
	if not owned:
		words = I18N.t("skins.check") if pending else I18N.t("skins.confirm" if armed else "skins.buy")
		if guest:
			words = I18N.t("auth.connect")
	if _skin_state.busy:
		var stage := _skin_state.stage_text()
		words = stage if not stage.is_empty() else I18N.t("skins.wait")
	var action := _button(I18N.shout(words), Rect2(854, 408, 294, 66), "tab-on" if owned else "action", 21)
	action.name = "SkinPrice"
	action.disabled = _skin_state.busy or equipped
	if not owned and not pending and not guest and not _skin_state._fake:
		action.disabled = action.disabled or not bool(_skin_state.catalog.get("paymentsEnabled", false)) or not Wallet.available()
	if action.disabled:
		action.modulate.a = 0.75
	var key := _skin
	action.pressed.connect(func() -> void:
		if guest and not owned:
			# Le wallet se connecte au profil.
			closed.emit()
			Profile.open()
		elif owned:
			_skin_state.equip(key)
		elif pending:
			_skin_state.recover(key)
		elif _armed == "skin:" + key:
			_armed = ""
			_skin_state.buy(key, _rail)
		else:
			_arm("skin:" + key))
	var restore := _button(I18N.t("skins.check"), Rect2(854, 483, 294, 44), "tab-off", 12)
	restore.name = "RestoreSkin"
	restore.disabled = _skin_state.busy
	restore.pressed.connect(_skin_state.recover.bind(key))


# ── Le pied ─────────────────────────────────────────────────────────────────

## CE QUI VIENT D'ARRIVER, ou la devise : le paiement en vol, un refus, un
## recu — sinon pourquoi il y a ou non un rail d'argent.
func _foot() -> void:
	var words := ""
	var bad := false
	if _page == "skins":
		var item := _skin_state.item(_skin)
		var owned := _skin_state.owns(_skin)
		words = _skin_state.note
		bad = _skin_state.failed
		if words.is_empty() and not owned and not item.is_empty():
			if bool(item.get("pending", false)):
				words = I18N.t("skins.pending")
			elif _guest():
				words = I18N.t("skins.guest")
			elif not _skin_state._fake and not bool(_skin_state.catalog.get("paymentsEnabled", false)):
				words = I18N.t("skins.unavailable")
			elif not _skin_state._fake and not Wallet.available():
				words = I18N.t("pay.noWallet")
	elif not _pay.error.is_empty():
		words = _pay.error
		bad = true
	elif _pay.stage != Shop.UsdcPay.Stage.IDLE and _pay.stage != Shop.UsdcPay.Stage.DONE:
		words = Shop.UsdcPay.stage_line(_pay.stage)
	elif not _state.note.is_empty():
		words = _state.note
		bad = _state.refused
	elif _state.loaded() and not bool(_state.shop.get("usdcEnabled", false)):
		words = I18N.t("shop.cardsOff")
	elif _state.loaded() and _live_tokens().is_empty():
		words = I18N.t("shop.connectForCard")
	else:
		words = I18N.t("shop.eitherWay")
	if words.is_empty():
		return
	var line := _label(words, Rect2(112, 558, 1060, 28), 15, Color("#ff9a7a") if bad else ForestShopStyle.CREAM)
	line.name = "Foot"


# ── Ce qui bouge ────────────────────────────────────────────────────────────

## LES CARTES TOMBENT sur l'etagere l'une apres l'autre, a chaque onglet.
func _enter() -> void:
	var i := 0
	for card in _board.get_children():
		if not card.has_meta("rest_y"):
			continue
		var rest: float = card.get_meta("rest_y")
		card.position.y = rest - 18.0
		card.modulate.a = 0.0
		var tween := card.create_tween().set_parallel()
		tween.tween_property(card, "position:y", rest, 0.32).set_delay(0.045 * i) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.tween_property(card, "modulate:a", 1.0, 0.18).set_delay(0.045 * i)
		i += 1


## Une carte : elle tombe a l'entree et se souleve sous le pointeur.
func _card(card: Control) -> void:
	card.set_meta("rest_y", card.position.y)
	card.mouse_filter = Control.MOUSE_FILTER_PASS
	card.mouse_entered.connect(_hover.bind(card, true))
	card.mouse_exited.connect(_hover.bind(card, false))


func _hover(card: Control, on: bool) -> void:
	if not is_instance_valid(card) or not card.is_inside_tree():
		return
	var rest: float = card.get_meta("rest_y")
	var tween := card.create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(card, "position:y", rest - 6.0 if on else rest, 0.16)


## L'ART FLOTTE sur sa carte, chacun a son temps.
func _bob(art: Control, px := 3.0) -> void:
	var rest := art.position.y
	var bob := art.create_tween().set_loops()
	bob.tween_interval(float(str(art.get_parent().name).hash() & 0xff) / 255.0 * 0.8)
	bob.tween_property(art, "position:y", rest - px, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	bob.tween_property(art, "position:y", rest, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## UN BATTEMENT toutes les quelques secondes : le ruban -20% et l'appel des skins.
func _pulse(node: Control, delay: float, peak := 1.12) -> void:
	node.pivot_offset = node.size * 0.5
	var beat := node.create_tween().set_loops()
	beat.tween_interval(2.6 + delay)
	beat.tween_property(node, "scale", Vector2.ONE * peak, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	beat.tween_property(node, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	beat.tween_interval(maxf(0.0, 0.6 - delay))


## DES LUCIOLES sur le decor : quelques points chauds qui errent et clignent.
class Fireflies extends Control:
	var _flies: Array[Dictionary] = []
	var _t := 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		for i in 18:
			_flies.append({"at": Vector2(randf(), randf()), "phase": randf() * TAU, "speed": 0.5 + randf() * 0.7, "px": 2.0 + float(i % 3)})

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var k := size.y / 720.0
		for f: Dictionary in _flies:
			var speed: float = f["speed"]
			var phase: float = f["phase"]
			var at: Vector2 = f["at"] * size + Vector2(sin(_t * speed * 0.6 + phase) * 46.0, cos(_t * speed * 0.45 + phase * 1.7) * 34.0) * k
			var blink := clampf(0.5 + 0.7 * sin(_t * speed * 1.8 + phase), 0.0, 1.0)
			var px: float = f["px"] * k
			draw_circle(at, px * 4.0, Color(1.0, 0.86, 0.45, 0.07 * blink))
			draw_circle(at, px * 2.0, Color(1.0, 0.9, 0.5, 0.16 * blink))
			draw_rect(Rect2(at - Vector2.ONE * px * 0.5, Vector2.ONE * px), Color(1.0, 0.96, 0.7, 0.95 * blink))
