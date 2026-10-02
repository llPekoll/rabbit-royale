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

	# `-- --only=season|profile|history|lang|codex` : UN dialogue, a sa taille
	# de jeu, place comme le chrome le place (plein ecran, ou centre sous le
	# debord du [x]) — pour juger une mise en page, pas un inventaire.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--only="):
			_only(arg.trim_prefix("--only="))
			DevShot.arm(self)
			return

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


func _only(which: String) -> void:
	# Le bureau a l'echelle 1, comme le jeu (DeskScale) : sans lui, un banc a
	# la taille d'un bureau etirait le canevas du telephone.
	DeskScale.follow(get_window())
	var d: Dialog
	match which:
		"season":
			var board := SeasonBoard.new()
			board.show_rows(_fake_entries(), {"rank": 5, "score": 4210, "toPass": 640},
				{"endsAt": Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 12 * 86400)})
			d = board
		"profile", "history":
			var profile := Profile.new()
			profile.show_player({"id": "guest:bench", "name": "Thistle", "wallet": null, "guest": true, "avatar": "orange"})
			profile.show_history(_fake_history())
			d = profile
		"codex":
			Home.burrow = {"lifetime": 2350.0, "level": 3}
			var codex := LoreCodex.new()
			codex.read_marks = false
			d = codex
		"pass", "pass-holder", "pass-closed":
			ShopState.shared().fake([], {}, true)
			ShopState.shared().shop["rates"] = {"sol": 142.5, "skr": 0.031, "usdc": 1.0}
			PassState.shared().fake(_fake_pass(which))
			d = PassDialog.new()
		"snack", "snack-taken", "snack-pack":
			SnackState.shared().fake(_fake_snack(which))
			d = SnackDialog.new()
		_:
			d = LanguageSelect.new()
	add_child(d)
	if which == "history":
		(d as Profile)._show_tab(Profile.Tab.HISTORY)
	for i in 3:
		await get_tree().process_frame
		_place(d)
	d.minimum_size_changed.connect(_place.bind(d))
	if "--dbg" in OS.get_cmdline_user_args():
		_dump(d, 0)
	get_viewport().size_changed.connect(_place.bind(d))


## SNACK TIME : jour 3 qui attend, jour 4 pris (prochain dans 9 h), ou le
## septieme a choisir.
func _fake_snack(which: String) -> Dictionary:
	var week := []
	for i in 6:
		week.append({"day": i + 1, "carrots": [50, 75, 100, 125, 150, 200][i], "packs": null})
	week.append({"day": 7, "carrots": 0, "packs": {
		"magic_hat": [{"kind": "lightning", "qty": 1}, {"kind": "bloop", "qty": 1}],
		"lucky_foot": [{"kind": "trap", "qty": 2}, {"kind": "fence", "qty": 1}]}})
	var later := Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 9 * 3600) + ".000Z"
	match which:
		"snack-taken":
			return {"day": 5, "ready": false, "readyAt": later, "taken": 4, "weeks": 0, "week": week}
		"snack-pack":
			return {"day": 7, "ready": true, "readyAt": null, "taken": 6, "weeks": 0, "week": week}
	return {"day": 3, "ready": true, "readyAt": null, "taken": 2, "weeks": 0, "week": week}


## Chrome._center_dialog, recopie : le banc n'a pas de chrome.
## UNE SAISON A PASS, a mi-course : 212 pass vendus, dix detenteurs classes.
func _fake_pass(which: String) -> Dictionary:
	var now := int(Time.get_unix_time_from_system())
	var iso := func(t: int) -> String: return Time.get_datetime_string_from_unix_time(t) + ".000Z"
	var names := ["Kuro", "Thistle", "BitterSnare15", "VelvetDoe8", "HollowFang19", "Shiro", "Moss", "Pip", "Clover", "Bramble"]
	var shares := [0.40, 0.24, 0.16, 0.2 / 7, 0.2 / 7, 0.2 / 7, 0.2 / 7, 0.2 / 7, 0.2 / 7, 0.2 / 7]
	var pool := 528.94
	var top := []
	for i in names.size():
		top.append({"rank": i + 1, "playerId": "p%d" % i, "name": names[i], "score": 48210 - i * 3900,
			"prizeUsd": snappedf(pool * shares[i], 0.01)})
	var holder := which == "pass-holder"
	return {
		"on": which != "pass-closed",
		"season": {"id": 4, "startedAt": iso.call(now - 12 * 86400), "endsAt": iso.call(now + 18 * 86400)},
		"priceUsd": 4.99, "potUsd": 1057.88, "prizePoolUsd": pool, "potShare": 0.5, "holders": 212,
		"rewards": {"skin": "kuro-violet", "shares": shares},
		"top": top,
		"mine": {"holder": holder, "rank": 2 if holder else null, "prizeUsd": 126.95 if holder else 0.0,
			"skin": "kuro-violet" if holder else null, "blocker": null if not holder else "pass_owned"},
	}


func _place(d: Dialog) -> void:
	var view := get_viewport_rect().size
	if d.fullscreen:
		var screen := Dialog.screen_rect(view, d.hug_size())
		d.position = screen.position
		d.size = screen.size
		return
	if d is SeasonBoard:
		# Le tableau s'ouvre en panneau a droite (`placement == "board"`).
		var board_top := clampf(view.y * 0.13, 52.0, 100.0)
		var board_bottom := clampf(view.y * 0.08, 12.0, 60.0)
		var board_w := minf(maxf(view.x * 0.26, 220.0), view.x * 0.86)
		d.custom_minimum_size = Vector2(board_w, 0.0)
		d.size = Vector2(board_w, view.y - board_top - board_bottom)
		d.position = Vector2(view.x - Kit.EDGE - board_w, board_top)
		return
	var side := Kit.EDGE
	var top := Kit.EDGE
	var wanted := d.get_combined_minimum_size()
	d.size = Vector2(minf(wanted.x, view.x - 2.0 * side), minf(wanted.y, view.y - top - Kit.EDGE))
	var at := ((view - d.size) * 0.5).floor()
	at.y = maxf(at.y, top)
	d.position = at


func _dump(n: Node, depth: int) -> void:
	if n is Control and depth < 9:
		var c := n as Control
		print("  ".repeat(depth), c.get_class(), " ", c.name, " min=", c.get_combined_minimum_size(), " size=", c.size, " ", (c as Label).text if c is Label else "")
	for ch in n.get_children():
		_dump(ch, depth + 1)
