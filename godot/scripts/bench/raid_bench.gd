extends Control
## LE BANC DES PANNEAUX DU RAID : la liste des cibles, la barre du raid, la
## barre de defense et la ceremonie, sur des donnees factices, pour les voir
## en une capture sans compte ni serveur.
##
##   godot --path godot scenes/bench/raid_bench.tscn -- --shot=raid.png
##   godot --path godot scenes/bench/raid_bench.tscn -- --shot=won.png --panel=victory
##   ... --panel=list | hud | defend | floor | arrange | refused
##       # une piece seule, A SA PLACE :
##       la liste centree comme Chrome.open la centre, les barres et la
##       rangee du kit dans un sol epingle en bas comme %Floor — pour mesurer
##       les bords et les debordements, que le montage a plat ne montre pas.
##
## `RaidState.fake` coupe le reseau : rien ici ne touche ws.rabbit.rip, et
## surtout aucun raid ni aucun eclair ne part contre le vrai serveur.
##
## Pas un ecran du jeu — un outil, comme ui_bench.tscn.


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	RaidState.current.fake({
		"targets": [
			{"id": "t1", "name": "Thistle", "avatar": "gray", "stock": 4820, "garden": 1260,
				"shielded": false, "shieldedFor": 0, "presence": "away"},
			{"id": "t2", "name": "Bramblewick the Long-Named", "avatar": "orange", "stock": 2210, "garden": 640,
				"shielded": false, "shieldedFor": 0, "presence": "home"},
			{"id": "t3", "name": "Clover", "avatar": "white", "stock": 980, "garden": 320,
				"shielded": true, "shieldedFor": 4.0 * 3600000.0, "presence": "digging"},
			{"id": "t4", "name": "Moss", "avatar": null, "stock": 120, "garden": 0,
				"shielded": false, "shieldedFor": 0, "digging": true},
		],
		"raid": {
			"raidId": "r1", "defender": {"id": "t1", "name": "Thistle", "avatar": "gray", "level": 3},
			"tile": 210, "energy": 61, "tank": 61, "trapsSprung": 2, "view": [], "walked": [200, 201, 210],
			"steps": [211, 220], "smoked": true, "finished": false, "succeeded": false, "carrotsLooted": 0,
		},
		"incoming": {
			"raidId": "r2", "attacker": {"id": "a1", "name": "Nettle", "avatar": "brown"},
			"tile": 45, "energy": 58, "walked": [40, 41, 45], "trapsSprung": 1,
			"finished": false, "succeeded": false, "struck": false, "carrotsLooted": 0, "startedAt": "",
		},
		"lightning": 2,
	})

	var panel := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--panel="):
			panel = arg.trim_prefix("--panel=")

	var won := {"defender": "Thistle", "carrots": 4820, "avatar": "white", "trapsSprung": 1, "refunded": 12}

	if panel in ["list", "hud", "defend", "floor", "arrange", "refused"]:
		_stage(panel)
	elif panel == "victory":
		# La ceremonie seule, plein cadre, comme le chrome la pose.
		var stage := RaidVictory.present(won)
		add_child(stage)
		Kit.fill(stage)
	else:
		# La liste a gauche ; les deux barres, l'une sous l'autre, au milieu ;
		# la ceremonie en reduction a droite.
		var list: TargetList = preload("res://scenes/ui/target_list.tscn").instantiate()
		list.position = Vector2(16, 16)
		list.size = Vector2(420, 360)
		add_child(list)

		_box(preload("res://scenes/ui/raid_hud.tscn").instantiate(), Rect2(450, -50, 430, 190))
		_box(preload("res://scenes/ui/defend_hud.tscn").instantiate(), Rect2(450, 130, 430, 210))

		var stage := RaidVictory.new()
		stage.outcome = won
		stage.size = Vector2(430, 260)
		_box(stage, Rect2(450, 320, 430, 260))

	DevShot.arm(self)


## Un cadre de taille fixe, comme l'etage du chrome qu'un panneau remplit.
## Les barres se posent sous TOPBAR_H de leur cadre : le cadre est remonte
## d'autant pour qu'elles se lisent en haut du banc.
func _box(node: Control, rect: Rect2) -> void:
	var box := Control.new()
	box.position = rect.position
	box.size = rect.size
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(box)
	box.add_child(node)
	Kit.fill(node)


## UNE PIECE A SA PLACE DE JEU. Le sol est la bande de hauteur nulle
## epinglee en bas de chrome.tscn (%Floor) ; la liste est centree comme
## `Chrome._center_dialog` la centre (sans le [x] qui deborde : la marge du
## haut et des cotes est reprise ici).
func _stage(panel: String) -> void:
	var floor_host := Control.new()
	floor_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	floor_host.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	add_child(floor_host)
	match panel:
		"hud":
			floor_host.add_child(preload("res://scenes/ui/raid_hud.tscn").instantiate())
		"defend":
			# Le raid subi ne se montre pas par-dessus un raid mene.
			RaidState.current.raid = {}
			floor_host.add_child(preload("res://scenes/ui/defend_hud.tscn").instantiate())
		"floor":
			Home.burrow = {"level": 3, "stock": 1240, "energy": 35, "maxEnergy": 300,
				"crossingCost": Tuning.i("ENERGY.CROSSING_COST"), "shieldMs": 18000000}
			var kit: KitRow = preload("res://scenes/ui/kit_row.tscn").instantiate()
			kit.bench_mode = true
			kit.state.offline = true
			floor_host.add_child(kit)
			kit.state.adopt_shop({
				"stock": 1240,
				"items": [
					{"kind": "trap", "price": 150, "held": 4, "cap": 12, "canBuy": true, "hasRoom": true},
					{"kind": "shield", "price": 400, "held": 1, "cap": 3, "canBuy": true, "hasRoom": true},
					{"kind": "fence", "price": 300, "held": 3, "cap": 20, "canBuy": true, "hasRoom": true},
				],
				"traps": {"held": 4, "placed": 3, "armed": 2, "rearming": 1, "nextRearmAt": null,
					"maxPlaced": 8, "drain": 8, "freePerDay": 3},
			})
			kit.open("placing")
			var back: BackButton = preload("res://scenes/ui/back_button.tscn").instantiate()
			back.bench_mode = true
			floor_host.add_child(back)
			back.show_for("placing")
		"arrange", "refused":
			# Le bandeau de ce qu'on tient, et la legende qui pointe un arbre.
			var bar := ArrangeBar.new()
			floor_host.add_child(bar)
			bar.show_state({"what": I18N.t("arrange.things.field"),
				"why": I18N.t("arrange.refused.field_unreachable") if panel == "refused" else "", "touch": true})
			var tip := ArrangeTip.new()
			add_child(tip)
			(func() -> void: tip.point(Vector2(get_viewport_rect().size.x * 0.5, 190.0))).call_deferred()
		"list":
			var list := TargetList.new()
			add_child(list)
			var fit := func() -> void:
				var view := get_viewport_rect().size
				var side := maxf(Kit.EDGE, -Dialog.CLOSE_OVER_RIGHT - (Kit.CLOSE_TAP - 30.0) * 0.5 + 4.0)
				var top := maxf(Kit.EDGE, -Dialog.CLOSE_OVER_TOP - (Kit.CLOSE_TAP - 30.0) * 0.5 + 4.0)
				var wanted := list.get_combined_minimum_size()
				list.size = Vector2(minf(wanted.x, view.x - 2.0 * side), minf(wanted.y, view.y - top - Kit.EDGE))
				var at := ((view - list.size) * 0.5).floor()
				at.y = maxf(at.y, top)
				list.position = at
			list.minimum_size_changed.connect(fit)
			get_viewport().size_changed.connect(fit)
			fit.call_deferred()
