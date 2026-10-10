extends Control
## The woodland shop (forest_shop.gd) on fixtures, offline. Nothing is bought
## or authenticated: the shop runs in `demo`, so a price fakes the purchase
## on the fixture stall and plays the real celebration (PurchaseReveal).
## Godot --path godot scenes/bench/forest_shop_bench.tscn --
##   --size=1280x720 --ui-scale=1 --verify --out=/private/tmp/forest-shop
##   [--page=packs|items|skins] [--lang=fr]
const ITEMS := ["energy", "trap", "lightning", "shield", "bloop", "fence", "smoke"]
const COUNTS := {"energy": 2, "trap": 3, "lightning": 0, "shield": 4, "bloop": 0, "fence": 4, "smoke": 0}
const RATES := {"usdc": 1.0, "sol": 152.4, "skr": 0.031}
const STOCK := 1240

var _shop: ForestShop
var _out := "/private/tmp/forest-shop"
var _failures := 0


func _ready() -> void:
	var page := "packs"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			_out = arg.trim_prefix("--out=")
		elif arg.begins_with("--page="):
			page = arg.trim_prefix("--page=")
		elif arg.begins_with("--lang="):
			I18N.locale = arg.trim_prefix("--lang=")
			I18N._apply_theme_face()
	# The purchase reveal lands on this root: keep it on the pixel.
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_fixtures()
	_shop = ForestShop.new()
	_shop.demo = true
	_shop._page = page
	Kit.fill(_shop)
	add_child(_shop)
	_shop.closed.connect(func() -> void: get_tree().quit())
	DeskScale.follow(get_window())
	DevShot.arm(self)
	if "--verify" in OS.get_cmdline_user_args():
		_verify.call_deferred()


## The stall as the server would send it, priced from tuning, with every
## money rail open. Shared states are fixtures, so nothing reaches the net.
func _fixtures() -> void:
	var items: Array = []
	for kind: String in ITEMS:
		items.append({"kind": kind, "price": Tuning.i("SHOP.PRICES." + kind),
			"usdc": float(Tuning.table("SHOP.USDC_PRICES")[kind]),
			"held": COUNTS[kind], "cap": 20, "hasRoom": COUNTS[kind] < 20})
	var packs: Array = []
	for key: String in ShopState.PACKS:
		var lines := ShopState.pack_items(key)
		var total := 0
		var usd := 0.0
		for line: Dictionary in lines:
			var kind := String(line["kind"])
			total += Tuning.i("SHOP.PRICES." + kind) * int(line["qty"])
			usd += float(Tuning.table("SHOP.USDC_PRICES")[kind]) * int(line["qty"])
		packs.append({"kind": key, "price": roundi(total * 0.8 / 10.0) * 10, "usdc": snappedf(usd * 0.8, 0.01),
			"discount": 0.2, "items": lines, "hasRoom": true})
	var shop := ShopState.shared()
	shop.fake(items, {}, true, packs)
	shop.shop["stock"] = STOCK
	shop.shop["rates"] = RATES
	PassState.shared().fake({})
	SkinState.shared().fake({
		"skins": [
			{"key": "solana", "kind": "skin_solana", "usdCents": 99},
			{"key": "carrot", "kind": "skin_carrot", "usdCents": 99},
			{"key": "solflare", "kind": "skin_solflare", "usdCents": 99},
		],
		"owned": [], "tokens": ["usdc", "sol", "skr"], "rates": RATES, "paymentsEnabled": true,
	})


func _settle() -> void:
	# Long enough for the cards to land before a shot.
	await get_tree().create_timer(0.7).timeout


func _tap(name: String) -> void:
	await _press(find_child(name, true, false) as Control, name)


func _tap_in(parent: Node, name: String) -> void:
	await _press(parent.find_child(name, true, false) as Control if parent != null else null, name)


func _press(control: Control, name: String) -> void:
	_check(control != null, "control exists: " + name)
	if control == null:
		return
	var at := control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = at
	motion.global_position = at
	get_viewport().push_input(motion)
	await get_tree().process_frame
	for down in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.position = at
		e.global_position = at
		e.pressed = down
		get_viewport().push_input(e)
		await get_tree().process_frame
	await _settle()


func _shot(key: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(_out.path_join(key + ".png"))


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
		push_error("[forest] " + label)


func _check_bounds() -> void:
	for b in find_children("*", "BaseButton", true, false):
		_check(get_viewport_rect().encloses(b.get_global_rect()), "button fits: " + b.name)
	for label in find_children("*", "Label", true, false):
		var measured: float = label.get_theme_font("font").get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, label.get_theme_font_size("font_size")).x
		_check(measured <= label.size.x + 1, "label fits: " + label.text)


func _held(kind: String) -> int:
	return int(ShopState.shared().item(kind).get("held", 0))


func _verify() -> void:
	DirAccess.make_dir_recursive_absolute(_out)
	await _settle()
	_check_bounds()
	_check(find_children("Pack_*", "Control", true, false).size() == 4, "four packs")
	await _shot("packs")
	await _tap("Tab_items")
	_check(_shop._page == "items", "items tab responds to pointer")
	_check(find_children("Item_*", "Control", true, false).size() == 7, "seven individual items")
	_check_bounds()
	await _shot("items")
	await _tap("Rail_sol")
	_check(_shop._rail == "sol", "currency selector responds")
	_check_bounds()
	await _shot("items-sol")
	await _tap("Tab_skins")
	_check(_shop._page == "skins" and find_child("Rail_carrots", true, false) == null, "skins have money rails only")
	_check_bounds()
	await _shot("skins")
	await _tap("Skin_carrot")
	_check(_shop._skin == "carrot" and _shop._rabbit.sprite_frames.get_frame_texture("idle", 0).atlas == Look.sheet("carrot"), "preview uses real selected sprite sheet")
	await _tap("Pose_happy")
	_check(is_instance_valid(_shop._rabbit) and _shop._rabbit.animation == "happy", "pose selector plays actual animation")
	_check_bounds()
	await _shot("skins-carrot")
	await _tap("Skin_solflare")
	_check(_shop._skin == "solflare" and _shop._rabbit.sprite_frames.get_frame_texture("idle", 0).atlas == Look.sheet("solflare"), "Flary preview uses its own sprite sheet")
	_check_bounds()
	await _shot("skins-flary")
	await _tap("Tab_packs")
	await _tap("ViewSkins")
	_check(_shop._page == "skins", "pack showcase links to skins")
	await _tap("Tab_items")
	await _tap("Rail_carrots")
	var state := ShopState.shared()
	var price := Tuning.i("SHOP.PRICES.trap")
	await _tap_in(find_child("Item_trap", true, false), "Price")
	_check(state.stock() == STOCK and _shop._armed == "trap", "first press only arms the price")
	await _shot("armed")
	await _tap_in(find_child("Item_trap", true, false), "Price")
	_check(state.stock() == STOCK - price and _held("trap") == COUNTS["trap"] + 1, "second press spends and stocks")
	_check(find_children("*", "PurchaseReveal", true, false).size() == 1, "purchase is celebrated")
	await get_tree().create_timer(0.5).timeout
	await _shot("bought-item")
	await get_tree().create_timer(2.6).timeout
	await _tap("Tab_packs")
	var poor := find_child("Pack_" + ShopState.PACKS[0], true, false)
	_check(poor != null and (poor.find_child("Price", true, false) as Button).disabled, "a pack beyond the purse is off")
	await _tap("Rail_usdc")
	await _tap_in(find_child("Pack_" + ShopState.PACKS[0], true, false), "Price")
	_check(find_children("*", "PurchaseReveal", true, false).size() == 1, "cash pack is celebrated")
	await get_tree().create_timer(0.5).timeout
	await _shot("bought-pack")
	await get_tree().create_timer(2.6).timeout
	await _tap("Tab_skins")
	await _tap("SkinPrice")
	_check(_shop._armed == "skin:" + _shop._skin, "a skin asks for confirmation")
	await _tap("SkinPrice")
	_check(SkinState.shared().owns(_shop._skin), "confirmed skin is owned")
	await get_tree().create_timer(1.6).timeout
	await _shot("bought-skin")
	print("[forest] ", "PASS" if _failures == 0 else "FAIL", " failures=", _failures, " viewport=", get_viewport_rect().size)
	get_tree().quit(0 if _failures == 0 else 1)
