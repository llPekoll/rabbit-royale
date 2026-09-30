extends SceneTree
## LE CONSENTEMENT (consent.gd, consent_dialog.gd) ET LE RELEVE DES ERREURS
## (crash_report.gd), sans reseau ni SDK.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_consent.gd
##
## ATTENDU : chaque ligne finit par « ok ».
##
## Ce qu'il garde : qui doit repondre (la decision par pays et fuseau), que le
## refus soit aussi simple que l'accord (deux planches jumelles), qu'un refus
## n'envoie RIEN, que le oui envoie `consent_shown` + `consent_answer`, et que
## le releve des erreurs dedoublonne et plafonne.
##
## Tout par `load()` et par noeud : nommer ConsentDialog ici le compilerait
## avant que les autoloads (Analytics, I18N) existent.

var _fails := 0


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("%s %s" % [label, "ok" if ok else "ECHEC"])


func _init() -> void:
	_run.call_deferred()


func _frames(n: int = 2) -> void:
	for i in n:
		await process_frame


func _run() -> void:
	await _frames()
	var C: GDScript = load("res://scripts/consent.gd")
	var D: GDScript = load("res://scripts/ui/consent_dialog.gd")
	var analytics: Node = root.get_node("Analytics")

	# ── Qui doit repondre ────────────────────────────────────────────────────
	var cases := [
		["fr_FR", "", "", 0, true, "langue fr_FR"],
		["en_US", "Europe/Paris", "", 120, true, "fuseau Europe/Paris"],
		["en_US", "Asia/Nicosia", "", 180, true, "Chypre (Asia/Nicosia)"],
		["en_US", "Atlantic/Canary", "", 0, true, "Canaries"],
		["en_US", "America/New_York", "EDT", -240, false, "New York"],
		["pt_BR", "America/Sao_Paulo", "", -180, false, "Sao Paulo"],
		["zh_Hans_CN", "Asia/Shanghai", "", 480, false, "Shanghai"],
		["en_US", "", "CEST", 120, true, "abreviation CEST"],
		["en_US", "", "IST", 330, false, "IST de l'Inde"],
		["en_US", "", "WAT", 60, false, "Lagos (WAT)"],
		["en_US", "", "+03", 180, true, "abreviation illisible pres de l'Europe"],
		["en_US", "", "EDT", -240, false, "abreviation americaine"],
		["en_GB", "America/New_York", "EDT", -240, true, "langue en_GB a New York"],
	]
	for c in cases:
		_check("decide : %s -> %s" % [c[5], "demande" if c[4] else "pas de question"],
			C.decide(c[0], c[1], c[2], c[3]) == c[4])
	_check("region_of en-GB", C.region_of("en-GB") == "GB")
	_check("region_of fr", C.region_of("fr") == "")
	_check("region_of en_US.UTF-8", C.region_of("en_US.UTF-8") == "US")

	# ── Hors d'Europe : accorde, pas d'ecran ─────────────────────────────────
	C.setup(true, PackedStringArray(["--consent=reset", "--consent=world"]))
	_check("monde : pas de question", not C.pending() and C.analytics and C.ads)

	# ── En Europe : la premiere question, puis un refus ──────────────────────
	C.setup(true, PackedStringArray(["--consent=reset", "--consent=eu"]))
	_check("europe : question en attente, rien d'accorde", C.pending() and not C.analytics and not C.ads)
	var events: Array[String] = []
	analytics.tracked.connect(func(e: String, _p: Dictionary) -> void: events.append(e))

	var host := Control.new()
	host.size = Vector2(890, 400)
	root.add_child(host)
	var d: Node = D.ask_on(host)
	await _frames(3)
	var refuse: Control = d.find_child("ConsentRefuse", true, false)
	var accept: Control = d.find_child("ConsentAccept", true, false)
	_check("deux planches", refuse != null and accept != null)
	_check("jumelles : meme taille", refuse.size == accept.size)
	_check("jumelles : meme bois", refuse.get("board") == accept.get("board"))
	_check("premiere fois : pas de [x]", not d.close_button.visible)
	d.close_requested()
	await _frames()
	_check("premiere fois : Echap ne ferme pas", is_instance_valid(d) and d.is_inside_tree())
	var view: Vector2 = d.get_viewport_rect().size
	_check("centre dans la vue (%dx%d)" % [view.x, view.y],
		Rect2(Vector2.ZERO, view).encloses(d.get_rect()) and absf(d.get_rect().get_center().x - view.x * 0.5) <= 1.0)

	refuse.emit_signal("pressed")
	await _frames()
	_check("refus : garde", C.answered and not C.analytics and not C.pending())
	_check("refus : aucun evenement du dialogue",
		not events.has("consent_shown") and not events.has("consent_answer"))
	_check("refus : le voile part avec", host.get_child_count() == 0)
	var cfg := ConfigFile.new()
	_check("refus : ecrit sur l'appareil", cfg.load(C.PATH) == OK
		and cfg.get_value("consent", "analytics") == false and int(cfg.get_value("consent", "version")) == C.VERSION)
	C.setup(true, PackedStringArray(["--consent=eu"]))
	_check("relance : la reponse tient", C.answered and not C.analytics and not C.pending())

	# ── Rouvert depuis le profil : [x], puis oui ─────────────────────────────
	events.clear()
	var again: Node = D.new(true)
	host.add_child(again)
	await _frames()
	_check("profil : le [x] est la", again.close_button.visible)
	(again.find_child("ConsentAccept", true, false) as Control).emit_signal("pressed")
	await _frames()
	_check("profil : oui garde", C.analytics and C.ads)
	_check("profil : consent_answer seul", events.has("consent_answer") and not events.has("consent_shown"))
	again.queue_free()

	# ── Une premiere question acceptee : les deux evenements ─────────────────
	C.setup(true, PackedStringArray(["--consent=reset", "--consent=eu"]))
	events.clear()
	var first: Node = D.ask_on(host)
	await _frames()
	(first.find_child("ConsentAccept", true, false) as Control).emit_signal("pressed")
	await _frames()
	_check("oui : consent_shown puis consent_answer",
		events.find("consent_shown") >= 0 and events.find("consent_shown") < events.find("consent_answer"))

	# ── Le releve des erreurs ────────────────────────────────────────────────
	var R: GDScript = load("res://scripts/crash_report.gd")
	var logger: Logger = R.new()
	OS.add_logger(logger)
	for i in 3:
		push_error("[verify] la meme erreur")
	push_error("[verify] une autre")
	push_warning("[verify] un avertissement")
	var got: Array = logger.call("take")
	_check("dedoublonne : 3 fois la meme = 1 rapport, + l'autre", got.size() == 2)
	_check("l'endroit est le .gd, pas variant_utility.cpp",
		got.size() > 0 and String(got[0]["where"]).begins_with("tools/verify_consent.gd:"))
	_check("la pile est celle du script", got.size() > 0 and String(got[0]["stack"]).contains("verify_consent.gd"))
	for i in 40:
		push_error("[verify] erreur %d" % i)
	_check("plafond : 20 par session", int(logger.call("count")) == 20)
	OS.remove_logger(logger)

	# L'appareil de dev retrouve son etat : pas de reponse gardee.
	DirAccess.remove_absolute(ProjectSettings.globalize_path(C.PATH))
	host.queue_free()
	print("%d echec(s)" % _fails)
	quit(1 if _fails > 0 else 0)
