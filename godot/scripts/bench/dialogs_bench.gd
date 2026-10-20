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

	# `-- --only=season|profile|history|genesis|lang|codex|email|email-code` : UN dialogue, a sa taille
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
			"raid": _fake_doors().get("p%d" % i) if i != 4 else null,
		})
	return out


## `--doors` : les verdicts de raid (RaidDoor) sur le tableau et le journal —
## ouvert, en jeu, bouclier, delai, rien a prendre, trop jeune.
func _fake_doors() -> Dictionary:
	if not "--doors" in OS.get_cmdline_user_args():
		return {}
	var h := 3600000
	return {
		"p0": {"state": "shield", "waitMs": 3 * h + 12 * 60000, "presence": "away"},
		"p1": {"state": "open", "waitMs": 0, "presence": "digging"},
		"p2": {"state": "open", "waitMs": 0, "presence": "home"},
		"p3": {"state": "bare", "waitMs": 0, "presence": "away"},
		"p5": {"state": "shield", "waitMs": 25 * 60000, "presence": "home"},
		"p6": {"state": "locked", "waitMs": 0, "presence": "away"},
		"p7": {"state": "shield", "waitMs": 5 * h, "presence": "digging"},
		"p8": {"state": "open", "waitMs": 0, "presence": "away"},
		"p9": {"state": "asleep", "waitMs": 0, "presence": "away"},
		"p10": {"state": "open", "waitMs": 0, "presence": "away"},
		"p11": {"state": "solo", "waitMs": 0, "presence": "away"},
	}


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
			"doors": _fake_doors() if not _fake_doors().is_empty() else null,
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
		"profile", "history", "settings", "genesis":
			# `settings` : l'onglet des reglages. `--ticket` (solo grise),
			# `--solo` (allume), `--low` (niveau 1, pas de ligne solo),
			# `--pretty`, `--off` : rien n'est sauve.
			var args := OS.get_cmdline_user_args()
			Home.player = {"avatar": "orange", "level": 1 if "--low" in args else 6, "solo": "--solo" in args}
			if "--off" in args:
				AudioSettings.restore()
				AudioSettings.music_muted = true
			if "--pretty" in args:
				PlaySettings.restore()
				PlaySettings.pretty = true
			if "--ticket" in args:
				PassState.shared().fake({"on": true, "mine": {"holder": true}})
			var profile := Profile.new()
			# `--account` : un compte Google (portes de retour, SUPPRIMER LE
			# COMPTE) au lieu d'un invite.
			if "--account" in args:
				profile.show_player({"id": "acct:bench", "name": "Thistle", "wallet": null, "guest": false,
					"avatar": "orange", "identities": [{"provider": "google", "email": "thistle@gmail.com"}]})
			else:
				profile.show_player({"id": "guest:bench", "name": "Thistle", "wallet": null, "guest": true, "avatar": "orange"})
			profile.show_history(_fake_history())
			# `genesis` : l'onglet des pieces ; `--empty` sans aucune piece,
			# `--nowallet` un joueur sans wallet ; `--piece=<png>` l'image.
			profile.show_genesis([] if "--empty" in args or "--nowallet" in args else _fake_genesis(),
				"" if "--nowallet" in args else "7fAvPhZnGi4UuwoiAoDhzDtjjv2ZZF8CxQkBfNxbZ3FR")
			d = profile
		"email", "email-code":
			var mail := EmailDialog.new()
			if which == "email-code":
				mail.ready.connect(func() -> void:
					mail._email = "thistle@gmail.com"
					mail._show_code())
			d = mail
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
		"snack-claim":
			# La prise jouee a une seconde, avec une pastille pour cible.
			Home.burrow = {"stock": 294, "level": 3}
			var pill := CarrotPill.new()
			pill.position = Vector2(360, 16)
			add_child(pill)
			SnackState.shared().fake(_fake_snack("snack"))
			d = SnackDialog.new()
			get_tree().create_timer(1.0).timeout.connect(_fake_claim.bind(d))
		_:
			d = LanguageSelect.new()
	add_child(d)
	if which == "history":
		(d as Profile)._show_tab(Profile.Tab.HISTORY)
	if which == "settings":
		(d as Profile)._show_tab(Profile.Tab.SETTINGS)
	if which == "genesis":
		(d as Profile)._show_tab(Profile.Tab.GENESIS)
	for i in 3:
		await get_tree().process_frame
		_place(d)
	d.minimum_size_changed.connect(_place.bind(d))
	if "--dbg" in OS.get_cmdline_user_args():
		_dump(d, 0)
	get_viewport().size_changed.connect(_place.bind(d))


## Ce que fait SnackState.claim a la reponse, sans reseau : le tap vise,
## le lendemain adopte, `claimed`, puis le stock.
func _fake_claim(d: SnackDialog) -> void:
	d._aim()
	var next := _fake_snack("snack")
	next["day"] = 4
	next["taken"] = 3
	next["ready"] = false
	next["readyAt"] = Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 9 * 3600) + ".000Z"
	var state := SnackState.shared()
	state.fake(next)
	var reward := {"day": 3, "carrots": 100, "pack": null, "items": []}
	state.claimed.emit(reward)
	Home.burrow["stock"] = int(Home.burrow["stock"]) + 100
	if not reward.get("flown", false):
		Home.burst.emit(100)
	Home.changed.emit()


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
		var board_w := minf(clampf(view.x * 0.3, Chrome.BOARD_MIN, Chrome.BOARD_MAX), view.x * 0.86)
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


## Des pieces RR Genesis : envoyees, sauf la plus recente, en route.
func _fake_genesis() -> Array:
	var image := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--piece="):
			image = Marshalls.raw_to_base64(FileAccess.get_file_as_bytes(arg.trim_prefix("--piece=")))
	var now := int(Time.get_unix_time_from_system())
	var out := []
	var rarities := ["rare", "common", "epic", "common", "legendary", "rare", "common"]
	for i in rarities.size():
		out.append({"id": "g%d" % i, "assetId": "5Bg3M1MMRCfQZn5ymHrqjeLD3kYTLKnZNuid5kuUQ6ts",
			"name": "RR Genesis #0%d" % (129 + i * 37), "rarity": rarities[i], "image": image,
			"status": "sending" if i == 0 else "sent",
			"wonAt": Time.get_datetime_string_from_unix_time(now - i * 2 * 86400) + ".000Z"})
	return out
