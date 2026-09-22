extends Control
## LE BANC DES PANNEAUX DU RAID : la liste des cibles, la barre du raid, la
## barre de defense et la ceremonie, sur des donnees factices, pour les voir
## en une capture sans compte ni serveur.
##
##   godot --path godot scenes/bench/raid_bench.tscn -- --shot=raid.png
##   godot --path godot scenes/bench/raid_bench.tscn -- --shot=won.png --panel=victory
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

	if panel == "victory":
		# La ceremonie seule, plein cadre, comme le chrome la pose.
		var stage := RaidVictory.show(won)
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
