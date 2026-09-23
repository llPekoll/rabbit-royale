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

	# `-- --only=shop|popup|panel` : UN panneau, pose comme le chrome le
	# pose (plein ecran, ou centre a Kit.EDGE des bords sous le debord du
	# [x]), sur la vue de reference ou celle que `--size` donne. C'est ce
	# qu'une capture juge : le banc cote a cote chevauche les panneaux.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--only="):
			_only(arg.trim_prefix("--only="))
			# `--bought=<kind>` : la fete d'un achat sur cette carte, une seconde
			# apres l'ouverture (a capturer avec `--after=1.1`). Rien n'est
			# achete : seul le signal part.
			for other in OS.get_cmdline_user_args():
				if other.begins_with("--bought="):
					var kind := other.trim_prefix("--bought=")
					get_tree().create_timer(1.0).timeout.connect(func() -> void: state.bought.emit(kind, 1))
			DevShot.arm(self)
			return

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


## UN PANNEAU SEUL, place par la regle de `Chrome._center_dialog` (sans le
## chrome, qui lirait le reseau) : plein ecran pour l'etal, centre pour les
## deux autres, a la largeur que leur `open` leur donne.
func _only(which: String) -> void:
	DeskScale.follow(get_window())
	var dialog: Dialog
	match which:
		"shop":
			dialog = Shop.new()
		"popup":
			dialog = EnergyPopup.new()
		_:
			dialog = EnergyPanel.new()
	add_child(dialog)
	var place := func() -> void:
		var view := get_viewport_rect().size
		if dialog.fullscreen:
			var screen := Dialog.screen_rect(view, dialog.hug_size())
			dialog.position = screen.position
			dialog.size = screen.size
			return
		if dialog is EnergyPopup:
			dialog.custom_minimum_size.x = minf(EnergyPopup.WIDTH, view.x - 2.0 * Kit.EDGE)
		elif dialog is EnergyPanel:
			var wide := EnergyPanel.WIDTH_SHORT if view.y < 520.0 else EnergyPanel.WIDTH
			dialog.custom_minimum_size.x = minf(wide, view.x - 2.0 * Kit.EDGE)
		var slack := (Kit.CLOSE_TAP - Chrome.CLOSE_ART) * 0.5
		var side := maxf(Kit.EDGE, -Dialog.CLOSE_OVER_RIGHT - slack + 4.0)
		var top := maxf(Kit.EDGE, -Dialog.CLOSE_OVER_TOP - slack + 4.0)
		var wanted := dialog.get_combined_minimum_size()
		dialog.size = Vector2(minf(wanted.x, view.x - 2.0 * side), minf(wanted.y, view.y - top - Kit.EDGE))
		var at := ((view - dialog.size) * 0.5).floor()
		at.y = maxf(at.y, top)
		dialog.position = at
	(func() -> void:
		place.call()
		dialog.minimum_size_changed.connect(place)
		get_viewport().size_changed.connect(place)).call_deferred()
