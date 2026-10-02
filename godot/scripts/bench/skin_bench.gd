extends Control
## Offline profile/wardrobe preview. No wallet, network, or real purchase.
## -- --owned | --equipped | --pending | --guest | --purchase | --ticket
var profile: Profile


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var selected := "solana"
	for arg in args:
		if arg.begins_with("--skin="):
			selected = arg.trim_prefix("--skin=")
		if arg.begins_with("--locale="):
			I18N.locale = arg.trim_prefix("--locale=")
			I18N._apply_theme_face()
	var owned := "--owned" in args or "--equipped" in args
	var equipped: Variant = "kuro-violet" if "--ticket" in args else (selected if "--equipped" in args else null)
	var fake := SkinState.shared()
	var skins := []
	for key in SkinState.SALE_NAMES:
		skins.append({"key": key, "kind": "skin_" + key.replace("-", "_"),
			"usdCents": 99,
			"owned": owned and key == selected, "equipped": equipped == key,
			"pending": "--pending" in args and key == selected})
	fake.fake({
		"skins": skins,
		"owned": [selected] if owned else (["kuro-violet"] if "--ticket" in args else []),
		"equipped": equipped, "look": equipped if equipped != null else "white",
		"paymentsEnabled": true, "tokens": ["usdc", "sol", "skr"], "rates": {"usdc": 1.0, "sol": 152.4, "skr": 0.031},
	})
	PassState.shared().fake({})
	ShopState.shared().fake([], {})
	var back := ColorRect.new()
	back.color = Palette.NIGHT
	Kit.fill(back)
	add_child(back)
	DeskScale.follow(get_window())
	profile = Profile.new()
	profile._offline = true
	profile.show_player({"id": "skin-bench", "name": "Peko", "avatar": "white", "look": fake.catalog["look"],
		"equippedSkin": equipped, "guest": "--guest" in args, "wallet": "Preview only"})
	profile.show_history({"days": [], "runs": [], "purchases": [], "raids": {"against": [], "by": [], "unseen": 0}})
	add_child(profile)
	# `--reveal` : la fete d'un skin achete (purchase_reveal.gd), qui reste.
	if "--reveal" in args:
		(func() -> void:
			var party := PurchaseReveal.announce_skin(selected, String(SkinState.SALE_NAMES.get(selected, I18N.t("pass.skin"))))
			party.linger = true).call_deferred()
	if "--purchase" in args:
		profile._show_skin_offer(selected)
		for arg in args:
			if arg.begins_with("--rail="):
				var offer: SkinWardrobe = profile.find_children("*", "SkinWardrobe", true, false)[0]
				offer._rail = arg.trim_prefix("--rail=")
				offer._render.call_deferred()
	var place := func() -> void:
		var rect := Dialog.screen_rect(get_viewport_rect().size, profile.hug_size())
		profile.position = rect.position
		profile.size = rect.size
	profile.minimum_size_changed.connect(place)
	get_viewport().size_changed.connect(place)
	place.call_deferred()
	DevShot.arm(self)
