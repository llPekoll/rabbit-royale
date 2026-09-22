extends Control
## LE BANC DE LA BOUTIQUE ET DE L'ENERGIE : l'etal, « out of energy » et le
## registre, cote a cote sur la nuit, avec des donnees factices — pour les
## voir sans compte et sans reseau.
##
##   godot --path godot scenes/bench/shop_bench.tscn -- --shot=shop.png
##
## Pas un ecran du jeu — un outil, comme ui_bench.tscn. ShopState est mis en
## `fake`, et Home.burrow recoit un terrier invente : rien ici ne parle au
## serveur, et surtout rien n'y achete.

## Un etal a la maniere du serveur (ShopState.items du web) : prix de
## SHOP.PRICES, plafond de SHOP.MAX_HELD, et un joueur qui peut se payer les
## petits objets mais pas les gros.
func _fake_items(stock: int) -> Array:
	var prices := Tuning.table("SHOP.PRICES")
	var usdc := Tuning.table("SHOP.USDC_PRICES")
	var held := {"trap": 3, "bomb": 1, "lightning": 0, "shield": 20, "energy": 1, "smoke": 2, "mirage": 0, "fence": 4}
	var caps := {"energy": 3, "smoke": 1}
	var out: Array = []
	for kind in ShopState.KINDS:
		var cap: int = caps.get(kind, Tuning.i("SHOP.MAX_HELD"))
		var h: int = held[kind]
		out.append({
			"kind": kind,
			"price": int(prices.get(kind, 0)),
			"usdc": float(usdc.get(kind, 0.0)),
			"held": h,
			"cap": cap,
			"hasRoom": h < cap,
			"canBuy": h < cap and stock >= int(prices.get(kind, 0)),
		})
	return out


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	# Un terrier invente, presque a sec : 40 d'energie sur 300, niveau 3.
	Home.burrow = {
		"level": 3, "stock": 1240, "energy": 40, "maxEnergy": Tuning.i("ENERGY.MAX"),
		"nextEnergyInMs": 92000, "runCost": Tuning.i("ENERGY.MIN_TO_CROSS"),
		"nextRunInMs": null, "crossingCost": Tuning.i("ENERGY.CROSSING_COST"),
		"regenPerHour": Tuning.regen_per_hour(3),
		"next": {"regenPerHour": Tuning.regen_per_hour(4), "yieldPerHour": 0},
	}
	var state := ShopState.shared()
	state.fake(_fake_items(1240), {"held": 3, "placed": 2, "armed": 2, "rearming": 0, "maxPlaced": 8})
	Home.changed.emit()

	# Plus de place que le 890x400 de reference : l'etal a la taille du
	# Seeker, et les deux autres dialogues en dessous, a leur taille.
	get_window().content_scale_size = Vector2i(1400, 760)
	var gap := 24.0

	# L'etal, en haut, a la taille du Seeker (870 x 380).
	var shop := Shop.new()
	shop.custom_minimum_size = Vector2(870.0, 380.0)
	shop.position = Vector2(gap, 64.0)
	add_child(shop)

	# En dessous : le petit dialogue, puis le registre, cote a cote.
	var popup := EnergyPopup.new()
	popup.position = Vector2(gap, 64.0 + 380.0 + gap + 16.0)
	add_child(popup)
	var panel := EnergyPanel.new()
	panel.position = Vector2(gap + EnergyPopup.WIDTH + gap, popup.position.y)
	add_child(panel)
	# Leur taille est leur minimum, mesure une fois le contenu pose.
	(func() -> void:
		popup.size = popup.get_combined_minimum_size()
		panel.size = panel.get_combined_minimum_size()
		shop.size = shop.get_combined_minimum_size()).call_deferred()

	DevShot.arm(self)
