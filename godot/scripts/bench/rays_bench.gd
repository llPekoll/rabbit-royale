extends Control
## LE BANC DES RAYONS : l'etal plein ecran (les rayons de la carte de tete),
## et par-dessus la fete d'un achat qui se rejoue toute seule, une sorte
## apres l'autre — pour juger le fondu au bout des rayons, les deux a la fois.
##
##   godot --path godot scenes/bench/rays_bench.tscn
##
## Donnees factices comme shop_bench.gd : rien ne parle au serveur.

const EVERY_S := 3.4

var _next := 0


func _ready() -> void:
	DeskScale.follow(get_window())
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	Home.burrow = {
		"level": 3, "stock": 1240, "energy": 40, "maxEnergy": Tuning.i("ENERGY.MAX"),
		"nextEnergyInMs": 92000, "runCost": Tuning.i("ENERGY.MIN_TO_CROSS"),
		"nextRunInMs": null, "crossingCost": Tuning.i("ENERGY.CROSSING_COST"),
		"regenPerHour": Tuning.regen_per_hour(3),
		"next": {"regenPerHour": Tuning.regen_per_hour(4), "yieldPerHour": 0},
	}
	var prices := Tuning.table("SHOP.PRICES")
	var items: Array = []
	for kind in ShopState.KINDS:
		items.append({
			"kind": kind, "price": int(prices.get(kind, 0)), "usdc": 0.0,
			"held": 0, "cap": Tuning.i("SHOP.MAX_HELD"), "hasRoom": true, "canBuy": true,
		})
	ShopState.shared().fake(items, {"held": 3, "placed": 2, "armed": 2, "rearming": 0, "maxPlaced": 8})
	Home.changed.emit()

	var shop := Shop.new()
	add_child(shop)
	var place := func() -> void:
		var screen := Dialog.screen_rect(get_viewport_rect().size, shop.hug_size())
		shop.position = screen.position
		shop.size = screen.size
	place.call_deferred()
	get_viewport().size_changed.connect(place)

	# La fete, une sorte apres l'autre, sans rien acheter.
	var timer := Timer.new()
	timer.wait_time = EVERY_S
	timer.timeout.connect(_replay)
	add_child(timer)
	get_tree().create_timer(1.2).timeout.connect(func() -> void:
		_replay()
		timer.start())
	DevShot.arm(self)


func _replay() -> void:
	var kinds: Array = ShopState.KINDS
	PurchaseReveal.announce(kinds[_next % kinds.size()])
	_next += 1
