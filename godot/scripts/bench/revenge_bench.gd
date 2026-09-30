extends "res://scripts/demo/trailer_bench.gd"
## LE BANC DE LA RIPOSTE (revenge_offer.gd) : Kuro arrive, me frappe — une
## poussee, un eclair, puis de l'encre, a tour de role — et l'offre
## « FOUDROIE-LE » monte en bas de l'ecran. Un tap : l'eclair tombe sur lui.
## Sans reponse, l'offre s'use et s'en va ; le coup suivant la relance.
##
##   godot --path godot scenes/bench/revenge_bench.tscn
##   godot --path godot scenes/bench/revenge_bench.tscn -- --auto-take --shot=revenge.png --after=4
##
## `--auto-take` : la main tape le bouton toute seule. Le sac commence vide
## (le bouton dit le prix en carottes) ; apres un achat il reste un eclair,
## et le tour suivant montre le bouton « · 1 ». Pas de serveur : l'achat est
## joue sur un etal factice, l'eclair par la mise en scene du plateau.

const ME := "me"
const ROUNDS := ["shove", "bolt", "bloop"]

var _round := 0
var _kuro: IslandRabbit
var _kuro_at := Vector2i(-1, -1)
var _stock := 1240


func _ready() -> void:
	super._ready()
	# UNE ILE OU L'ON SE BAT : niveau 10, quatre sieges.
	var state := RunState.current
	state._fake_me = ME
	state.first_run = false
	state.island = {"level": 10}
	state.island_changed.emit(state.island)
	state.set_bag({"lightning": 0, "bloop": 0})
	_fake_shop(0)
	_island._rabbit.set_plate("Shiro", true)
	_lift_plate(_island._rabbit, 13.0)
	# Le panneau du bac a sable (seed, NEW, RETRY) couvrait l'offre.
	_panel.visible = false
	_hud.revenge.strike = _bench_strike
	_hud.revenge.taken.connect(func(_by: String) -> void: _next_round(3.5))
	_next_round(0.6)


## L'ETAL FACTICE : l'eclair a son vrai prix, et assez de carottes pour lui.
func _fake_shop(lightning_held: int) -> void:
	var price := int(Tuning.table("SHOP.PRICES").get("lightning", 0))
	Home.burrow = {"stock": _stock}
	ShopState.shared().fake([{
		"kind": "lightning", "price": price, "held": lightning_held,
		"cap": Tuning.i("SHOP.MAX_HELD"), "hasRoom": true, "canBuy": _stock >= price,
	}], {})


func _next_round(after: float) -> void:
	await _wait(after)
	var how: String = ROUNDS[_round % ROUNDS.size()]
	_round += 1
	await _strike_me(how)
	# Sans reponse, l'offre s'use : le coup suivant arrive apres elle.
	if not _flag("auto-take"):
		var round_now := _round
		await _wait(RevengeOffer.OFFER_SECONDS + 1.0)
		if round_now == _round and not _hud.revenge.visible:
			_next_round(0.5)


## KURO FRAPPE. Il tombe a deux cases s'il n'est pas deja la, puis pousse,
## foudroie ou encre — par les memes portes que la socket.
func _strike_me(how: String) -> void:
	var state := RunState.current
	var me: Vector2i = _island.local_run.at
	if _kuro == null or not is_instance_valid(_kuro):
		_kuro_at = _rival_near(me)
		_kuro = _spawn_rival(_kuro_at)
		await _wait(1.0)
	_sync_roster()
	match how:
		"shove":
			# Il saute sur ma case, je vole d'une case a l'oppose.
			var dir := Vector2i(signi(me.x - _kuro_at.x), signi(me.y - _kuro_at.y))
			var to := me + dir
			if not _board().content.has(to):
				to = me - dir
			_kuro.send_to(me)
			Sound.play("hop")
			await _wait(0.25)
			_kuro_at = me
			_island._on_pushed({"playerId": ME, "from": _board().index_of(me), "to": _board().index_of(to),
				"stunMs": 1200, "pushedBy": RIVAL})
			_island.local_run.at = to
			_sync_roster()
			state._set_shoved({"byId": RIVAL, "byName": "Kuro", "fatal": false, "at": Time.get_ticks_msec()})
		"bolt":
			await _strike_on(_island._rabbit, me, 1800)
			state._set_hit({"by": RIVAL, "kind": "bolt", "at": Time.get_ticks_msec()})
		"bloop":
			_island._rabbit.inked(2200)
			_hud._on_ink(2200)
			Sound.play("hop", 0.6)
			state._set_hit({"by": RIVAL, "kind": "bloop", "at": Time.get_ticks_msec()})
	if _flag("auto-take"):
		await _wait(1.4)
		var button: Control = _hud.revenge.get("_button")
		await _hand_tap(button.get_global_rect().get_center(), func() -> void: button.pressed.emit())


## Qui est sur l'ile, pour l'offre (`RevengeOffer.may_offer`) — sans
## `rabbits_changed`, que l'ile du bac a sable rebatirait.
func _sync_roster() -> void:
	RunState.current.rabbits = {
		ME: {"playerId": ME, "name": "Shiro", "tile": _board().index_of(_island.local_run.at), "alive": true},
		RIVAL: {"playerId": RIVAL, "name": "Kuro", "tile": _board().index_of(_kuro_at), "alive": true},
	}


## LE COUP DU BANC, a la place du serveur : sac vide, l'etal factice encaisse
## (et garde un eclair en reserve pour montrer le bouton « · 1 » au tour
## suivant) ; puis l'eclair tombe sur Kuro.
func _bench_strike(_by: String) -> bool:
	var state := RunState.current
	var held := int(state.bag.get("lightning", 0))
	if held <= 0:
		_stock -= int(Tuning.table("SHOP.PRICES").get("lightning", 0))
		held = 2
		if Chrome.current != null:
			Chrome.current.toast(I18N.t("items.lightning.name"), false)
	await _wait(0.2)
	held -= 1
	state.set_bag({"lightning": held, "bloop": 0})
	_fake_shop(held)
	await _strike_on(_kuro, _kuro_at, 2600)
	_kuro.blame()
	# Au tour d'apres, le sac repart vide : on revoit le prix.
	if held <= 0:
		_stock = 1240
	return true
