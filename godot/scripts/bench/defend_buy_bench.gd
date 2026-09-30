extends "res://scripts/demo/raid_film_bench.gd"
## LE BANC DE LA DEFENSE SANS ECLAIR : Kuro pille le terrier de Shiro, et la
## poche est vide. Le bouton de la barre de defense ne dit plus
## « FRAPPER · 0 » grise : il dit « ACHETER ET FOUDROYER · 500 🥕 », et le
## meme tap achete et frappe (RaidState.buy_and_strike). Taper le lapin fait
## pareil.
##
##   godot --path godot scenes/bench/defend_buy_bench.tscn
##   godot --path godot scenes/bench/defend_buy_bench.tscn -- --auto-take --shot=buy.png --after=5
##
## Sans reponse, Kuro marche jusqu'au potager et le raid se perd. `--auto-take` :
## la main tape le bouton au 4e pas. Rien ne part vers le serveur
## (`RaidState.fake`, `ShopState.fake`).

var _hud: DefendHud


## La barre de defense TOUJOURS montee, sans le fondu du tournage : c'est
## elle qu'on regarde ici.
func _mount_ui(side: String) -> void:
	super._mount_ui(side)
	if "--hud" in OS.get_cmdline_user_args():
		return
	_hud = preload("res://scenes/ui/defend_hud.tscn").instantiate()
	_ui.add_child(_hud)
	Kit.fill(_hud)


func _init() -> void:
	default_side = "defend"


func _defend(layout: BurrowLayout, path: Array[int]) -> void:
	# L'ETAL : l'eclair a son vrai prix, la poche vide, de quoi payer.
	var shop := ShopState.shared()
	shop.shop["items"] = [{"kind": "lightning", "price": int(Tuning.table("SHOP.PRICES").get("lightning", 0)),
		"held": 0, "cap": Tuning.i("SHOP.MAX_HELD"), "hasRoom": true, "canBuy": true}]
	shop.shop["stock"] = Home.burrow.get("stock", 0)
	shop.changed.emit()

	var inc := {"raidId": "bench", "attacker": {"id": KURO, "name": "Kuro", "avatar": "brown"},
		"tile": layout.entrance, "energy": 110, "walked": [layout.entrance], "trapsSprung": 0,
		"finished": false, "succeeded": false, "struck": false, "carrotsLooted": 0}
	var state := RaidState.current
	state.fake({"incoming": inc.duplicate(true), "lightning": 0})
	await get_tree().process_frame
	_paint_kuro(_burrow.get("_raider"))
	await _wait(1.2)
	for i in range(0, path.size() - 1):
		# Foudroye (bouton ou lapin tape) : le raid est fini, on s'arrete.
		if bool(state.incoming.get("finished", false)):
			break
		inc.tile = path[i]
		(inc.walked as Array).append(path[i])
		inc.energy = int(inc.energy) - 6
		state.fake({"incoming": inc.duplicate(true)})
		if i == 3 and "--auto-take" in OS.get_cmdline_user_args() and _hud != null:
			var button: Control = _hud.get("_strike")
			await _hand.tap(button.get_global_rect().get_center(), func() -> void: button.pressed.emit())
		await _wait(STEP_S * 1.6)
	if bool(state.incoming.get("struck", false)):
		await _wait(2.4)
		_stamp(RaidedStamp.announce({"by": "Kuro", "others": 0, "carrots": 0, "defended": true, "count": 1}))
		return
	# Personne n'a frappe : il atteint le potager.
	inc.finished = true
	inc.succeeded = true
	inc.carrotsLooted = 340
	state.fake({"incoming": inc.duplicate(true)})
