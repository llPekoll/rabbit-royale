extends Control
## LE BANC DU SOL : la barre DIG · DEFEND · RAID, la rangee du kit et le
## retour, sur des donnees factices, pour les voir sans compte.
##
##   godot --path godot scenes/bench/loop_bar_bench.tscn -- --shot=floor.png
##
## Sur le web ces trois-la ne coexistent jamais (la barre glisse quand la
## rangee monte) ; ici on les etage pour tout voir d'une capture : la barre
## a sa vraie place en bas, la rangee et le retour dans un hote plus haut.
## Le terrier factice est un BurrowView (lib/game/burrow.ts) pose sur
## l'autoload Home, comme le serveur le rendrait.

const LOOP_BAR := preload("res://scenes/ui/loop_bar.tscn")
const KIT_ROW := preload("res://scenes/ui/kit_row.tscn")
const BACK_BUTTON := preload("res://scenes/ui/back_button.tscn")


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	Home.burrow = {
		"level": 3, "maxLevel": 10, "stock": 1240, "lifetime": 5320,
		"gardenReady": 180, "energy": 35, "maxEnergy": 300, "nextEnergyInMs": 120000,
		"runCost": Tuning.i("ENERGY.MIN_TO_CROSS"), "crossingCost": Tuning.i("ENERGY.CROSSING_COST"),
		"nextRunInMs": 600000, "yieldPerHour": 60, "regenPerHour": 32, "capHours": 8,
		"gardenCapacity": 480, "gardenCeiling": 480,
		"boosts": {"water": {"held": 2, "activeMs": null}, "fertiliser": {"held": 0, "activeMs": 5400000}},
		"shieldMs": 18000000, "upgradeCost": 900, "canUpgrade": true,
		"next": {"yieldPerHour": 75, "regenPerHour": 33}, "runs": 4,
	}
	Home.changed.emit()

	# La rangee du kit et le retour, dans un hote dont le bas est a 300.
	var upper := Control.new()
	upper.mouse_filter = Control.MOUSE_FILTER_IGNORE
	upper.set_anchors_preset(Control.PRESET_TOP_WIDE)
	upper.offset_bottom = 296.0
	add_child(upper)

	var kit: KitRow = KIT_ROW.instantiate()
	kit.bench_mode = true
	kit.state.offline = true
	upper.add_child(kit)
	kit.state.adopt_shop({
		"stock": 1240,
		"items": [
			{"kind": "trap", "price": 150, "held": 4, "cap": 12, "canBuy": true, "hasRoom": true},
			{"kind": "bomb", "price": 200, "held": 2, "cap": 5, "canBuy": true, "hasRoom": true},
			{"kind": "lightning", "price": 300, "held": 0, "cap": 3, "canBuy": true, "hasRoom": true},
			{"kind": "shield", "price": 400, "held": 1, "cap": 3, "canBuy": true, "hasRoom": true},
			{"kind": "energy", "price": 100, "held": 1, "cap": 3, "canBuy": true, "hasRoom": true},
			{"kind": "smoke", "price": 250, "held": 2, "cap": 7, "canBuy": true, "hasRoom": true},
			{"kind": "mirage", "price": 350, "held": 0, "cap": 3, "canBuy": true, "hasRoom": true},
			{"kind": "fence", "price": 300, "held": 3, "cap": 20, "canBuy": true, "hasRoom": true},
		],
		"traps": {"held": 4, "placed": 3, "armed": 2, "rearming": 1, "nextRearmAt": null,
			"maxPlaced": 8, "drain": 8, "freePerDay": 3},
	})
	kit.state.adopt_fences({
		"placed": [{"tile": 12, "side": "n"}, {"tile": 13, "side": "n"}],
		"spans": [{"tile": 12, "side": "n"}, {"tile": 13, "side": "n"}, {"tile": 12, "side": "w"},
			{"tile": 20, "side": "s"}, {"tile": 21, "side": "s"}, {"tile": 13, "side": "e"}],
		"offers": [{"tile": 12, "side": "w"}, {"tile": 20, "side": "s"}, {"tile": 13, "side": "e"}],
		"held": 3, "maxHeld": 20,
	})
	kit.open("placing")

	var back: BackButton = BACK_BUTTON.instantiate()
	back.bench_mode = true
	upper.add_child(back)
	back.show_for("placing")

	# HOME de l'ile, dans un hote a droite, pour voir la seconde forme.
	var island := Control.new()
	island.mouse_filter = Control.MOUSE_FILTER_IGNORE
	island.set_anchors_preset(Control.PRESET_TOP_WIDE)
	island.offset_left = 600.0
	island.offset_bottom = 150.0
	add_child(island)
	var home: BackButton = BACK_BUTTON.instantiate()
	home.bench_mode = true
	island.add_child(home)
	home.show_for("island")
	home.note_run_cost(5, 35, 300)

	# La barre, a sa vraie place.
	var bar: LoopBar = LOOP_BAR.instantiate()
	bar.bench_mode = true
	add_child(bar)
	bar.set_defence(3, 4)
	bar.set_targets(7, false)
	bar.set_bombs(2)
	bar.show_haul(124)

	DevShot.arm(self)
