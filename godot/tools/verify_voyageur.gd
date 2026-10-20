extends SceneTree
## LE SERVEUR DU MODE VOYAGEUR (voyageur.gd), contre ce que burrow.ts,
## regen.ts et la route /api/burrow decident.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_voyageur.gd
##
## ATTENDU : chaque ligne `ok`, puis `VOYAGEUR : OK`. La sonde ecrit dans
## sa propre sauvegarde (user://voyageur-verify.cfg), jamais dans la vraie.

const TEST_SAVE := "user://voyageur-verify.cfg"

var _ok := true
var V: GDScript


func _check(label: String, cond: bool) -> void:
	print("   %s %s" % ["ok  " if cond else "FAUX", label])
	_ok = _ok and cond


func _initialize() -> void:
	_run.call_deferred()


func _ask(url: String, method: int, payload: Dictionary = {}) -> Answer:
	return await V.serve(url, method, payload)


func _run() -> void:
	# Charge a l'execution : les autoloads (Tuning, Session) ne sont connus
	# du compilateur qu'une fois l'arbre monte.
	# LA SAUVEGARDE DE LA SONDE, jamais la vraie (voyageur.gd `save_path`).
	OS.set_environment("RR_VOYAGEUR_SAVE", TEST_SAVE)
	V = load("res://scripts/voyageur.gd")
	var Tun: Node = root.get_node("Tuning")
	if String(V.save_path()) != TEST_SAVE:
		print("SONDE ARRETEE : elle ecrirait dans la vraie sauvegarde")
		quit(1)
		return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(TEST_SAVE))
	V.reload()
	var cfg: ConfigFile = V._load()
	V._born(cfg)
	V._save()

	# 1. UNE SAUVEGARDE NEUVE.
	var b: Dictionary = V.burrow_view()
	_check("neuf : terrier 1, lapin 1, 0 carotte",
		int(b.level) == 1 and int(V.player().level) == 1 and int(b.stock) == 0)
	_check("pas d'attente : reservoir plein, traversee gratuite",
		int(b.energy) == int(b.maxEnergy) and int(b.runCost) == 0 and b.nextRunInMs == null)

	# 2. LE POTAGER : 2 h a 20/h au niveau 1 = 40 (regen.ts gardenYield).
	var now: float = V._now()
	V._put("garden_at", now - 2.0 * 3600.0)
	_check("2 h de potager = 40", int(V.garden_ready()) == 40)
	V._put("garden_at", now - 30.0 * 3600.0)
	var cap: int = int(Tun.n("GARDEN.CAP_HOURS") * Tun.n("GARDEN.YIELD_PER_HOUR_BASE"))
	_check("30 h = plafonne a %d" % cap, int(V.garden_ready()) == cap)
	var a := await _ask("/api/burrow", HTTPClient.METHOD_POST, {"action": "harvest"})
	_check("recolte : %d carottes" % cap, a.ok and int(a.body.harvested) == cap and int(V.burrow_view().stock) == cap)
	_check("les carottes de toujours suivent", int(V.burrow_view().lifetime) == cap)
	a = await _ask("/api/burrow", HTTPClient.METHOD_POST, {"action": "harvest"})
	_check("recolte a vide refusee", not a.ok and a.error() == "nothing_to_harvest")

	# 3. LA MAISON : 500 au niveau 1 (tuning.ts upgradeCost).
	V._put("stock", 400)
	a = await _ask("/api/burrow", HTTPClient.METHOD_POST, {"action": "upgrade"})
	_check("400 < 500 : refuse, il manque 100",
		not a.ok and a.error() == "insufficient_carrots" and int(a.body.need) - int(a.body.have) == 100)
	V._put("stock", 600)
	a = await _ask("/api/burrow", HTTPClient.METHOD_POST, {"action": "upgrade"})
	_check("600 : terrier 2, reste 100", a.ok and int(a.body.spent) == 500
		and int(V.burrow_view().level) == 2 and int(V.burrow_view().stock) == 100)

	# 4. LA PAIE D'UNE MANCHE.
	var before := int(V.burrow_view().stock)
	var r: Dictionary = V.bank(120, 30, 2, false)
	_check("manche non videe : +120, pas de niveau", int(V.burrow_view().stock) == before + 120
		and not bool(r.leveledUp) and int(r.level) == 1)
	r = V.bank(10, 5, 3, true)
	_check("ile videe : niveau 2", bool(r.leveledUp) and int(r.level) == 2 and int(V.player().runsPlayed) == 2)
	V._put("level", 10)
	r = V.bank(0, 0, 0, true)
	_check("au niveau 10 on y reste", not bool(r.leveledUp) and int(r.level) == 10)

	# 5. LA LECON : niveau 2 + la recompense, une seule fois.
	V._put("level", 1)
	V._put("stock", 0)
	V.finish_tutorial()
	var reward: int = Tun.i("TUTORIAL_REWARD.CARROTS")
	_check("lecon : niveau 2 et %d carottes" % reward, int(V.player().level) == 2 and int(V.burrow_view().stock) == reward)
	V.finish_tutorial()
	_check("la lecon ne paie qu'une fois", int(V.burrow_view().stock) == reward)

	# 6. L'AMENAGEMENT ET LE PROFIL.
	var edits := {"moved": {"house": [3, 4]}}
	a = await _ask("/api/burrow/layout", HTTPClient.METHOD_PUT, {"edits": edits})
	a = await _ask("/api/burrow", HTTPClient.METHOD_GET)
	_check("l'amenagement revient tel quel", JSON.stringify(a.body.edits) == JSON.stringify(edits))
	a = await _ask("/api/player", HTTPClient.METHOD_PATCH, {"name": "  Lapinou  ", "avatar": "white"})
	_check("nom et pelage gardes", String(V.player().name) == "Lapinou" and String(V.player().avatar) == "white")

	# 7. LES ROUTES EN LIGNE SEULEMENT REFUSENT, SANS RESEAU.
	for route in ["/api/raid", "/api/shop", "/api/snack", "/api/pass", "/api/leaderboard"]:
		a = await _ask(route, HTTPClient.METHOD_GET)
		_check("%s : voyageur" % route, a.status == 403 and a.error() == "voyageur")

	# 8. LA RELECTURE DEPUIS LE DISQUE.
	V.reload()
	_check("la sauvegarde se relit", String(V.player().name) == "Lapinou" and int(V.player().level) == 2)

	# 9. SUPPRIMER.
	a = await _ask("/api/auth/delete", HTTPClient.METHOD_POST)
	_check("supprimee : le fichier est parti", a.ok and not FileAccess.file_exists(TEST_SAVE))

	print("VOYAGEUR : %s" % ("OK" if _ok else "ECHEC"))
	quit(0 if _ok else 1)
