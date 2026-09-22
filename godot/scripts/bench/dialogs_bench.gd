extends Control
## LE BANC DES TROIS DIALOGUES — saison, profil, langue — cote a cote sur la
## nuit, avec des donnees factices, pour les voir sans compte ni reseau :
##
##   godot --path godot scenes/bench/dialogs_bench.tscn -- --shot=dialogs.png
##
## Pas un ecran du jeu — un outil, comme ui_bench.tscn. Les dialogues sont
## poses a plat (pas par le chrome), a la taille qu'ils demandent ; le
## tableau et le profil recoivent leurs lignes par `show_rows` /
## `show_history`, la porte que le reseau prend aussi.

const GAP := 12.0


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	var root := Kit.hbox(GAP)
	root.position = Vector2(GAP, GAP + 20.0)
	# Les trois font 1040 de large et la vue de reference en fait 890 : le
	# banc les reduit d'un cinquieme pour les voir cote a cote.
	root.scale = Vector2(0.8, 0.8)
	add_child(root)

	# LE TABLEAU : un podium de trois, dont un qui creuse, et la ligne du
	# joueur au 5e rang — avec `me` pour la ligne de la pastille.
	var board := SeasonBoard.new()
	board.show_rows(_fake_entries(), {"rank": 5, "score": 4210, "toPass": 640},
		{"endsAt": Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 12 * 86400)})
	board.me_changed.connect(func(rank: int, to_pass: int) -> void:
		print("[bench] me_changed rank=%d to_pass=%d" % [rank, to_pass]))
	board.spectate.connect(func(id: String) -> void: print("[bench] spectate ", id))
	root.add_child(board)

	# LE PROFIL : un invite, un historique avec une dette ouverte, une dette
	# reglee et un raid a lui, deux non lus.
	var profile := Profile.new()
	profile.show_player({"id": "guest:bench", "name": "Thistle", "wallet": null, "guest": true, "avatar": "orange"})
	profile.show_history(_fake_history())
	profile.revenge.connect(func(id: String) -> void: print("[bench] revenge ", id))
	root.add_child(profile)

	# LA LANGUE.
	var lang := LanguageSelect.new()
	root.add_child(lang)

	# Le profil s'ouvre sur l'historique au bout d'une seconde, pour que la
	# capture montre les deux onglets sur deux lancements (--after=0.5 pour le
	# profil, --after=2 pour l'historique).
	get_tree().create_timer(1.0).timeout.connect(func() -> void: profile._show_tab(Profile.Tab.HISTORY))

	DevShot.arm(self)
	await get_tree().process_frame
	await get_tree().process_frame
	for d in [board, profile, lang]:
		print("DBG ", d, " close vis=", d.close_button.visible, " pos=", d.close_button.position, " gpos=", d.close_button.global_position, " size=", d.close_button.size, " idx=", d.close_button.get_index(), "/", d.get_child_count(), " dsize=", d.size, " modulate=", d.close_button.modulate, " parentvis=", d.close_button.get_parent().visible)


func _fake_entries() -> Array:
	var names := ["Bramble", "Clover", "Nettle", "Sorrel", "Thistle", "Moss", "Fern", "Rue", "Yarrow", "Dock", "Tansy", "Vetch"]
	var avatars := ["white", "gray", "brown", "yellow", "orange", "brown", "gray", "white", "yellow", "brown", "orange", "gray"]
	var out := []
	for i in names.size():
		out.append({
			"rank": i + 1,
			"playerId": "p%d" % i if i != 4 else "guest:bench",
			"name": names[i],
			"score": 9000 - i * 700,
			"lifetime": 20000 - i * 900,
			"burrowLevel": 6 - (i / 3),
			"avatar": avatars[i],
			"crowned": i == 0,
			"digging": i == 1 or i == 7,
		})
	return out


func _fake_history() -> Dictionary:
	var now := int(Time.get_unix_time_from_system())
	var iso := func(seconds_ago: int) -> String:
		return Time.get_datetime_string_from_unix_time(now - seconds_ago)
	var today := Time.get_date_string_from_system()
	return {
		"days": [
			{"day": today, "carrots": 320, "runs": 3, "tilesDug": 120},
			{"day": "2026-09-21", "carrots": 860, "runs": 5, "tilesDug": 300},
			{"day": "2026-09-19", "carrots": 140, "runs": 1, "tilesDug": 40},
		],
		"runs": [],
		"purchases": [
			{"id": "b1", "kind": "trap", "qty": 2, "currency": "carrots", "cost": 300, "createdAt": iso.call(3 * 3600)},
			{"id": "b2", "kind": "bomb", "qty": 1, "currency": "usdc", "cost": 400000, "createdAt": iso.call(2 * 86400)},
		],
		"raids": {
			"against": [
				{"id": "r1", "kind": "burrow", "result": "looted", "damage": 3, "carrotsLooted": 210,
					"createdAt": iso.call(40 * 60), "otherId": "p2", "otherName": "Nettle", "otherAvatar": "brown", "direction": "against"},
				{"id": "r2", "kind": "shove", "result": "damaged", "damage": 0, "carrotsLooted": 0,
					"createdAt": iso.call(5 * 3600), "otherId": "p1", "otherName": "Clover", "otherAvatar": "gray", "direction": "against"},
				{"id": "r3", "kind": "burrow", "result": "looted", "damage": 2, "carrotsLooted": 90,
					"createdAt": iso.call(3 * 86400), "otherId": "p0", "otherName": "Bramble", "otherAvatar": "white", "direction": "against"},
			],
			"by": [
				{"id": "r4", "kind": "burrow", "result": "looted", "damage": 4, "carrotsLooted": 150,
					"createdAt": iso.call(2 * 86400), "otherId": "p0", "otherName": "Bramble", "otherAvatar": "white", "direction": "by"},
				{"id": "r5", "kind": "burrow", "result": "blocked", "damage": 0, "carrotsLooted": 0,
					"createdAt": iso.call(6 * 86400), "otherId": "p3", "otherName": "Sorrel", "otherAvatar": "yellow", "direction": "by"},
			],
			"unseen": 2,
		},
	}
