extends Node
## TOUT CE QUE LE JOUEUR FAIT, ENVOYE A FIREBASE ANALYTICS (GA4).
##
## LA REGLE : « on log tout, on filtre apres » (le user, 2026-09-30). La
## question a laquelle ceci repond est double — OU les joueurs decrochent
## (l'entonnoir : session, connexion, tutoriel, premiere run, raid...) et OU
## ils tapent le plus (chaque tape, normalisee, avec le controle sous le
## doigt). Un evenement de trop ne coute rien ; celui qui manque le jour ou
## l'on cherche pourquoi la moitie part au deuxieme beat du tuto, si.
##
## TROIS PORTES, un seul appel. Chaque crochet du jeu est UNE ligne,
## `Analytics.track("…", {…})`, et ne sait pas ou elle part :
##
##   • ANDROID : le plugin `RabbitFirebase` (godot/addons/RabbitFirebase,
##     plugin-src/firebase), qui parle au SDK Firebase natif. Les parametres
##     voyagent en JSON : un Dictionary ne traverse pas JNI, une chaine si.
##   • WEB : `window.rrFirebase` (web/shell.html), qui parle au SDK JS
##     (gtag). Meme contrat, memes noms.
##   • BUREAU / EDITEUR : rien — sauf `-- --analytics-debug`, qui imprime
##     chaque evenement sur la console. C'est la sonde pour verifier un
##     crochet sans compte Firebase.
##
## LE CONSENTEMENT PASSE AVANT TOUT (consent.gd). Un joueur europeen qui n'a
## pas dit oui : Android envoie en mode « refuse » (sans identifiant, le SDK
## le gere), le web n'envoie RIEN — le morceau Analytics du SDK n'est meme
## pas charge (shell.html). Le choix se change au profil (profile.gd).
##
## LES ERREURS AUSSI PASSENT PAR ICI (crash_report.gd) : un Logger note
## celles du moteur et des scripts, `_process` les envoie — Crashlytics sur
## Android, `exception` sur le web.
##
## UNE PORTE ABSENTE NE CASSE RIEN. Plugin pas embarque, config web encore
## en placeholders, SDK bloque par un bloqueur de pub : tout se tait. Un
## evenement perdu vaut mieux qu'un jeu qui plante pour le compter.
##
## RIEN N'EST GROUPE ICI. Chaque appel part tout de suite, sans attendre de
## reponse : les deux SDK groupent deja eux-memes (Android toutes les ~heures
## ou a la mise en arriere-plan, gtag par lot de page), et un second tampon
## ici perdrait ce qu'il tient a la fermeture de l'app.
##
## LES REGLES DE GA4 SONT APPLIQUEES ICI, pas chez l'appelant (`_name`,
## `_params`) : un nom invalide est jete EN SILENCE par Firebase — on ne le
## saurait qu'en cherchant l'evenement des semaines plus tard. Donc on le
## repare avant qu'il parte.

## Le nom du singleton du plugin Android (getPluginName() cote Kotlin).
const SINGLETON := "RabbitFirebase"

## GA4 : noms d'evenement et de parametre, 40 caracteres ; 25 parametres par
## evenement ; une valeur texte, 100 caracteres.
const NAME_MAX := 40
const PARAMS_MAX := 25
const VALUE_MAX := 100
## GA4 : propriete utilisateur, nom de 24 caracteres, valeur de 36.
const PROP_NAME_MAX := 24
const PROP_VALUE_MAX := 36
## Les prefixes que Firebase se reserve : un nom qui les porte est refuse.
const RESERVED_PREFIXES := ["firebase_", "google_", "ga_"]
## LES NOMS D'EVENEMENT QUE FIREBASE SE RESERVE (FirebaseAnalytics.Event,
## « reserved names »). Envoyes tels quels, ils sont jetes : on les prefixe
## de `rr_`. `session_start` en fait partie — d'ou `rr_session_start`.
const RESERVED_EVENTS := [
	"ad_activeview", "ad_click", "ad_exposure", "ad_impression", "ad_query",
	"ad_reward", "adunit_exposure", "app_background", "app_clear_data",
	"app_exception", "app_remove", "app_store_refund",
	"app_store_subscription_cancel", "app_store_subscription_convert",
	"app_store_subscription_renew", "app_update", "app_upgrade",
	"dynamic_link_app_open", "dynamic_link_app_update",
	"dynamic_link_first_open", "error", "first_open", "first_visit",
	"in_app_purchase", "notification_dismiss", "notification_foreground",
	"notification_open", "notification_receive", "os_update",
	"session_start", "session_start_with_rollout", "user_engagement",
]

## Chaque evenement parti, APRES nettoyage. Pour qui veut reagir a un moment
## du jeu sans poser un crochet de plus : Push attend ici la premiere run
## finie pour demander les notifications (push.gd).
signal tracked(event: String, params: Dictionary)

var _android: Object = null
var _web: JavaScriptObject = null
var _debug := false

## Tenu tant que le JS peut rappeler (visibilitychange) : un rappel libere
## par Godot ne rappelle jamais.
var _web_visibility: JavaScriptObject = null

## L'ecran a l'affiche (doorstep, burrow, island, tutorial, raid), et depuis
## quand. Porte par CHAQUE evenement (`screen`) : une tape, un achat, un
## refus se lisent tous « ou etait-il ».
var screen := "boot"
var _screen_since := 0
## Le terrier montre le sol d'un autre (chrome.gd `show_raid`).
var _raid := false

## Le dialogue ouvert (son nom de classe) et depuis quand — pour le temps
## passe dessus a la fermeture.
var _dialog := ""
var _dialog_since := 0

## LE TEMPS DE SESSION. `_launched` : le lancement ; `_fg_since` : la derniere
## remise au premier plan ; `_fg_total` : le temps de premier plan cumule
## avant elle. Une app en arriere-plan n'est pas « jouee ».
var _launched := 0
var _fg_since := 0
var _fg_total := 0
var _paused := false

## Les proprietes utilisateur deja envoyees, pour ne renvoyer que ce qui
## change (Home.changed tombe chaque minute).
var _props: Dictionary = {}
var _user_id := ""

## Une run ouverte : `run_start` parti, ni `run_end` ni `run_abandon`.
var _run_open := false
var _run_tutorial := false
## Le dernier beat du tutoriel envoye : la legende se recalcule a chaque
## tape, le beat ne part qu'a son changement.
var _last_beat := ""

## Le releve des erreurs (crash_report.gd), pose seulement s'il y a une porte
## ou la sonde : au bureau il n'aurait personne a qui parler.
var _crash: CrashReport = null
## Les parametres du lancement, gardes pour le rejouer apres un oui sur le
## web : avant, `rr_session_start` n'est parti nulle part.
var _session_params: Dictionary = {}
## Le dialogue de consentement s'est montre ce lancement ; `consent_shown` ne
## part qu'avec le oui qui le suit (un refus n'envoie rien, pas meme qu'on a
## demande).
var _consent_shown := false

## Les proprietes qui sont aussi des cles de Crashlytics : un plantage se lit
## avec le niveau et le build du joueur.
const CRASH_KEYS := ["platform", "build", "level"]
## Les drapeaux de test (Android : `adb shell am start -n
## rip.rabbit.royale/com.godot.game.GodotApp --esa command_line_params
## --test-crash`). Apres le demarrage, pour que Crashlytics soit pret et que
## l'ecran d'accueil soit monte.
const TEST_DELAY := 4.0


func _ready() -> void:
	# Toujours actif : les notifications de pause doivent nous parvenir meme
	# si l'arbre est un jour mis en pause.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_debug = "--analytics-debug" in OS.get_cmdline_user_args() \
		or "--analytics-debug" in OS.get_cmdline_args()
	if Engine.has_singleton(SINGLETON):
		_android = Engine.get_singleton(SINGLETON)
	if OS.has_feature("web"):
		_web = JavaScriptBridge.get_interface("rrFirebase")
		_watch_web_visibility()
	var args := OS.get_cmdline_args() + OS.get_cmdline_user_args()
	# LE CONSENTEMENT AVANT LE PREMIER EVENEMENT : c'est lui qui dit si
	# `rr_session_start`, trois lignes plus bas, porte un identifiant (Android)
	# ou part tout court (web).
	Consent.setup(_android != null or _web != null, args)
	_apply_consent()
	if _android != null or _web != null or _debug:
		_crash = CrashReport.new()
		OS.add_logger(_crash)
	set_process(_crash != null)
	_launched = Time.get_ticks_msec()
	_fg_since = _launched
	_screen_since = _launched

	# LA TAPE, LUE A LA SOURCE : le signal de la fenetre racine passe AVANT
	# toute propagation (Window `_window_input`), donc avant qu'un `_input`
	# quelque part la marque traitee — un `_input` d'autoload, lui, passe en
	# DERNIER et raterait tout ce qu'un panneau avale. On ne consomme rien :
	# on regarde, et l'evenement continue sa route intact.
	get_tree().root.window_input.connect(_on_window_input)

	Screens.changed.connect(_on_screens_changed)
	Session.changed.connect(_on_session_changed)
	Session.failed.connect(func(message: String) -> void:
		track("login_fail", {"reason": message}))
	Home.changed.connect(_refresh_props)
	I18N.locale_changed.connect(func(code: String) -> void:
		_set_prop("locale", code))

	_set_prop("platform", platform())
	_set_prop("locale", I18N.locale)
	_set_prop("build", version())
	_crash_key("screen", screen)
	_session_params = {
		"platform": platform(),
		"os": OS.get_name(),
		"locale": I18N.locale,
		"system_locale": OS.get_locale(),
		"build": version(),
		"engine": Engine.get_version_info().get("string", ""),
		"backend": backend(),
		"consent": "pending" if Consent.pending() else ("granted" if Consent.analytics else "denied"),
	}
	track("rr_session_start", _session_params)

	if "--test-error" in args:
		get_tree().create_timer(TEST_DELAY).timeout.connect(_test_error)
	if "--test-crash" in args:
		get_tree().create_timer(TEST_DELAY).timeout.connect(_test_crash)


func _exit_tree() -> void:
	# Le moteur appellerait encore le releve pendant sa fermeture, alors que
	# ce noeud n'est plus la pour le vider.
	if _crash != null:
		OS.remove_logger(_crash)
		_crash = null


## « android », « web », « ios » ou « desktop » — ce que le serveur de push
## et les rapports lisent.
static func platform() -> String:
	if OS.has_feature("web"):
		return "web"
	match OS.get_name():
		"Android":
			return "android"
		"iOS":
			return "ios"
	return "desktop"


## La version du build : `application/config/version` de project.godot, la
## meme que `version/name` de l'export Android. A monter ensemble.
static func version() -> String:
	return String(ProjectSettings.get_setting("application/config/version", "0.0.0"))


## Quelle porte est ouverte, pour le rapport de session.
func backend() -> String:
	if _android != null:
		return "android"
	if _web != null:
		return "web"
	return "debug" if _debug else "none"


# ── L'appel ──────────────────────────────────────────────────────────────────

## UN EVENEMENT. Le seul appel que le jeu fait. `screen` est ajoute seul s'il
## n'est pas donne ; le reste est nettoye aux regles de GA4.
func track(event: String, params: Dictionary = {}) -> void:
	var name := _name(event)
	var all := params.duplicate()
	if not all.has("screen"):
		all["screen"] = screen
	var clean := _params(all)
	if _debug:
		print("[analytics] %s %s%s" % [name, JSON.stringify(clean),
			"" if Consent.analytics else " (consent: %s)" % ("pending" if Consent.pending() else "denied")])
	var json := JSON.stringify(clean)
	if _android != null:
		# Android envoie meme sans oui : le SDK est en mode « refuse »
		# (`setConsent(false, false)`), sans identifiant ni stockage.
		_android.logEvent(name, json)
	elif _web != null and Consent.analytics:
		# Le web, lui, n'a meme pas charge Analytics : rien a appeler.
		_web.logEvent(name, json)
	# Emis quoi qu'il arrive : c'est un moment du jeu (Push attend la premiere
	# run finie ici), pas un envoi.
	tracked.emit(name, clean)


## UN ECRAN. GA4 lit `screen_view` + `screen_name` pour ses rapports
## d'ecrans ; le temps passe sur le precedent part avec (`prev_ms`), parce
## que « combien de temps avant de partir » est la question du decrochage.
func screen_view(name: String) -> void:
	if name == screen:
		return
	var now := Time.get_ticks_msec()
	var prev := screen
	var dwell := now - _screen_since
	screen = name
	_screen_since = now
	_crash_key("screen", name)
	_crash_log("screen " + name)
	track("screen_view", {"screen_name": name, "screen_class": name,
		"prev_screen": prev, "prev_ms": dwell})
	if name == "tutorial":
		_last_beat = ""
		track("tutorial_begin")


## L'ECRAN, RELU A CHAQUE CHANGEMENT DU GESTIONNAIRE (`Screens.changed`, qui
## part apres chaque montage — screens.gd `_mount` — et chaque fin de rideau).
## Ecoute d'ici plutot qu'appele de `_mount` : screens.gd ne nomme aucun
## autoload, et tools/verify_crossing.gd le precharge AVANT qu'ils existent —
## un `Analytics.` dedans ne compilait plus.
##
## L'ile de la lecon est un ecran a part, « tutorial » : c'est l'etape ou
## l'on perd le plus, elle doit se lire seule dans les rapports. Le raid est
## le terrier avec le sol d'un autre (`set_raid`) : un ecran a part aussi.
func _on_screens_changed() -> void:
	if not Screens.in_world():
		# Le chrome meurt a l'accueil : son `show_raid(false)` ne viendra pas.
		_raid = false
		screen_view("doorstep")
	elif Screens.place == Screens.Place.ISLAND:
		_raid = false
		screen_view("tutorial" if Island.tutorial_pending() else "island")
	else:
		screen_view("raid" if _raid else "burrow")


## LE PLATEAU DU RAID monte ou redescend (chrome.gd `show_raid`, au noir du
## rideau, en meme temps que le plateau).
func set_raid(on: bool) -> void:
	_raid = on
	_on_screens_changed()


## QUI JOUE : l'id du serveur, pour recoller Android, le web et les deux
## sessions d'un meme joueur. Vide a la deconnexion.
func set_user_id(id: String) -> void:
	if id == _user_id:
		return
	_user_id = id
	if _debug:
		print("[analytics] user_id=%s" % id)
	if _android != null:
		_android.setUserId(id)
	elif _web != null and Consent.analytics:
		_web.setUserId(id)


func _set_prop(key: String, value: Variant) -> void:
	var k := _clip(_ident(key), PROP_NAME_MAX)
	var v := _clip(str(value), PROP_VALUE_MAX)
	if _props.get(k, null) == v:
		return
	_props[k] = v
	if _debug:
		print("[analytics] prop %s=%s" % [k, v])
	if k in CRASH_KEYS:
		_crash_key(k, v)
	if _android != null:
		_android.setUserProperty(k, v)
	elif _web != null and Consent.analytics:
		_web.setUserProperty(k, v)


# ── Le consentement ──────────────────────────────────────────────────────────

## L'ETAT DE Consent, pose sur le SDK. Android : le mode de consentement de
## Firebase (les quatre signaux de Google). Web : charger Analytics ou non,
## et le mode de consentement de gtag s'il est deja la (shell.html).
func _apply_consent() -> void:
	if _debug:
		print("[analytics] consent analytics=%s ads=%s needed=%s answered=%s" % [
			Consent.analytics, Consent.ads, Consent.needed, Consent.answered])
	if _android != null:
		_jni("setConsent", [Consent.analytics, Consent.ads])
	elif _web != null:
		_web.setConsent(Consent.analytics, Consent.ads)


## LE DIALOGUE S'EST MONTRE (consent_dialog.gd). Rien ne part encore : on ne
## le dira qu'avec un oui.
func consent_shown() -> void:
	_consent_shown = true


## LA REPONSE DU JOUEUR, d'ou qu'elle vienne (l'accueil, le profil). Gardee,
## posee sur le SDK ; et SEULEMENT si c'est oui, les deux evenements du
## dialogue. `where` : "doorstep" ou "profile".
func set_consent(granted: bool, where: String) -> void:
	var was := Consent.analytics
	Consent.answer(granted)
	_apply_consent()
	if not granted:
		_consent_shown = false
		return
	if _web != null and not was:
		# LE WEB REPART DE ZERO : tout ce qui precedait le oui a ete jete, pas
		# mis de cote. On redit qui joue et d'ou, pour que ce lancement se
		# lise comme les autres.
		for k in _props:
			_web.setUserProperty(k, _props[k])
		if not _user_id.is_empty():
			_web.setUserId(_user_id)
		track("rr_session_start", _session_params.merged({"replayed": true}, true))
	if _consent_shown:
		track("consent_shown", {"where": where})
		_consent_shown = false
	track("consent_answer", {"analytics": true, "where": where})


# ── Les erreurs ──────────────────────────────────────────────────────────────

## LE RELEVE, VIDE SUR LE FIL PRINCIPAL. Une image sans erreur ne coute qu'un
## verrou pris et rendu.
func _process(_delta: float) -> void:
	if _crash == null:
		return
	for report in _crash.take():
		_report(report)


func _report(r: Dictionary) -> void:
	var message := String(r.get("message", ""))
	var where := String(r.get("where", ""))
	if _debug:
		print("[crash] %s %s: %s" % [r.get("type", "error"), where, message])
	if _android != null:
		# Crashlytics : une exception non fatale, groupee par sa pile. Le
		# message porte l'endroit — la pile d'un moteur seul est vide.
		_jni("recordError", ["%s (%s)" % [message, where], String(r.get("stack", ""))])
	elif _web != null:
		# GA4 `exception` (l'evenement standard de gtag : le rapport des
		# exceptions le lit). `app_exception` est reserve a Crashlytics.
		track("exception", {"description": message, "fatal": false, "where": where,
			"kind": r.get("type", "error")})


## Une cle de Crashlytics : ce qui se lit a cote de chaque plantage.
func _crash_key(key: String, value: String) -> void:
	if _android != null:
		_jni("setCrashKey", [key, value])


## Une miette de Crashlytics : les dernieres lignes avant le plantage.
func _crash_log(line: String) -> void:
	if _android != null:
		_jni("crashLog", [line])


## LES METHODES RECENTES DU PLUGIN, PAR `callv`. Un APK construit avec un
## plugin plus ancien n'a pas `setConsent` ni `recordError` : appelee
## directement, une methode absente d'un JNISingleton est une erreur de script
## qui ARRETE la fonction appelante (ici `_ready`, avant `rr_session_start`).
## Par `callv`, c'est une ligne d'erreur et la suite continue. Pas de
## has_method : il ment sur un JNISingleton (push.gd).
func _jni(method: String, args: Array) -> void:
	_android.callv(method, args)


## `--test-error` : trois fois la meme erreur AU MEME ENDROIT (une seule doit
## partir : le dedoublonnage) et une autre, par le chemin non fatal.
func _test_error() -> void:
	for i in 3:
		push_error("[crash-test] non-fatal test error")
	push_error("[crash-test] second test error")


## `--test-crash` : un vrai plantage, pour voir Crashlytics le recevoir au
## lancement suivant. Sur le web, l'abandon du moteur est simule par un
## RuntimeError de WebAssembly (shell.html le lit comme fatal).
func _test_crash() -> void:
	_crash_log("test crash requested")
	if _android != null:
		_jni("testCrash", [])
	elif OS.has_feature("web"):
		JavaScriptBridge.eval("setTimeout(function(){throw new WebAssembly.RuntimeError('rr test crash')},0)")
	else:
		print("[crash] --test-crash: pas de Crashlytics ici (Android seulement)")


# ── Les crochets qui demandent un peu d'etat ─────────────────────────────────
# Chacun reste UNE ligne chez l'appelant ; l'etat (dedoublonnage, duree)
# vit ici pour que l'appelant n'en porte aucun.

## Un dialogue monte (chrome.gd `open`).
func dialog_opened(dialog: Node) -> void:
	_dialog = kind_of(dialog)
	_dialog_since = Time.get_ticks_msec()
	_crash_log("dialog " + _dialog)
	track("dialog_open", {"dialog": _dialog})


## Le dialogue descend (chrome.gd `close_dialog`), avec le temps passe.
func dialog_closed() -> void:
	if _dialog.is_empty():
		return
	track("dialog_close", {"dialog": _dialog, "dwell_ms": Time.get_ticks_msec() - _dialog_since})
	_dialog = ""


## Une planche pressee (plank_button.gd). `button` : le nom du noeud s'il en
## a un a lui, sinon son libelle ; `in` : le panneau qui la porte.
func ui_click(button: Control) -> void:
	var label := String(button.get("text")) if button.get("text") != null else ""
	var id := String(button.name)
	if id.begins_with("@") or id.is_empty():
		id = label
	track("ui_click", {"button": id, "label": label, "panel": _panel_of(button),
		"dialog": _dialog})


## UNE RUN COMMENCE : le serveur a pose le plateau avec un lapin a moi
## (run_state.gd `_on_island`). Un instantane repete (reconnexion) ne
## rouvre pas une run deja ouverte.
func run_started(params: Dictionary) -> void:
	if _run_open:
		return
	_run_open = true
	_run_tutorial = bool(params.get("tutorial", false))
	track("run_start", params)


## LA RUN EST FINIE, par le serveur (run_state.gd `_on_run_over`). `result` :
## cleared (ile videe), tutorial (la lecon faite), killed_lightning /
## killed_shove, dry (a sec).
func run_ended(r: Dictionary, digs: Dictionary) -> void:
	var result := "dry"
	var killed: Variant = r.get("killedBy", null)
	if bool(r.get("tutorialDone", false)):
		result = "tutorial"
	elif bool(r.get("cleared", false)):
		result = "cleared"
	elif killed is Dictionary:
		result = "killed_" + String((killed as Dictionary).get("how", "other"))
	track("run_end", {
		"result": result,
		"tutorial": _run_tutorial or result == "tutorial",
		"carrots": int(r.get("carrots", 0)),
		"tiles_dug": int(r.get("tilesDug", digs.get("tiles", 0))),
		"bombs_hit": int(r.get("bombsHit", digs.get("bombs", 0))),
		"chests": int(digs.get("chests", 0)),
		"goldens": int(digs.get("goldens", 0)),
		"flags": int(digs.get("flags", 0)),
		"duration_ms": int(r.get("durationMs", 0)),
		"level": int(r.get("level", 0)),
		"leveled_up": bool(r.get("leveledUp", false)),
	})
	if result == "dry":
		track("energy_empty", {"where": "run"})
	if bool(r.get("leveledUp", false)):
		track("level_up", {"level": int(r.get("level", 0)), "character": "rabbit"})
	_run_open = false


## LE JOUEUR PART AVANT LA FIN (run_state.gd `leave`) : le retour au terrier
## en pleine run. Rien si la run etait deja finie.
func run_left(digs: Dictionary) -> void:
	if not _run_open:
		return
	_run_open = false
	track("run_abandon", {"tutorial": _run_tutorial, "tiles_dug": int(digs.get("tiles", 0)),
		"chests": int(digs.get("chests", 0))})


## UN BEAT DU TUTORIEL, a son changement seulement. `index` : son rang dans
## l'arc (first_run.gd BEATS) — l'entonnoir se lit dans cet ordre.
func tutorial_step(id: String, index: int) -> void:
	if id.is_empty() or id == _last_beat:
		return
	_last_beat = id
	track("tutorial_step", {"step": id, "step_index": index})


# ── La session ───────────────────────────────────────────────────────────────

func _on_session_changed() -> void:
	if not Session.signed_in():
		set_user_id("")
		return
	set_user_id(String(Session.player.get("id", "")))
	var guest := bool(Session.player.get("guest", false))
	_set_prop("auth", "guest" if guest else "wallet")
	_refresh_props()


## Le niveau du lapin et celui du terrier, relus a chaque changement du
## terrier ; seuls les changements partent (`_set_prop`).
func _refresh_props() -> void:
	var level: Variant = Home.player.get("level", Session.player.get("level", null))
	if level != null:
		_set_prop("level", int(level))
	if Home.burrow.has("level"):
		_set_prop("burrow_level", int(Home.burrow.get("level", 0)))


## LA PAUSE ET LE RETOUR. Android envoie PAUSED/RESUMED ; le web passe par
## `visibilitychange` (plus bas) ; la fermeture de fenetre par WM_CLOSE.
func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED:
			_on_pause()
		NOTIFICATION_APPLICATION_RESUMED:
			_on_resume()
		NOTIFICATION_WM_CLOSE_REQUEST:
			_on_pause("app_close")


func _on_pause(event: String = "app_pause") -> void:
	if _paused:
		return
	_paused = true
	var now := Time.get_ticks_msec()
	_fg_total += now - _fg_since
	track(event, {"fg_ms": now - _fg_since, "session_ms": _fg_total,
		"dialog": _dialog, "run_open": _run_open})


func _on_resume() -> void:
	if not _paused:
		return
	_paused = false
	_fg_since = Time.get_ticks_msec()
	track("app_resume", {"session_ms": _fg_total})


## Sur le web, la page cachee (onglet change, telephone verrouille) est la
## pause. Le rappel JS est SYNCHRONE : il part meme quand le navigateur a
## deja arrete la boucle de rendu de l'onglet cache.
func _watch_web_visibility() -> void:
	var document: JavaScriptObject = JavaScriptBridge.get_interface("document")
	if document == null:
		return
	_web_visibility = JavaScriptBridge.create_callback(func(_args: Array) -> void:
		if String(document.visibilityState) == "hidden":
			_on_pause()
		else:
			_on_resume())
	document.addEventListener("visibilitychange", _web_visibility)


# ── La tape ──────────────────────────────────────────────────────────────────

## UNE TAPE, D'OU QU'ELLE VIENNE. Le doigt (ScreenTouch, premier doigt
## seulement) ou la souris — mais JAMAIS l'emulation : sur un telephone
## Godot rejoue chaque toucher en clic (`emulate_mouse_from_touch`), et
## chaque tape compterait double. Les deux emulations portent
## DEVICE_ID_EMULATION.
func _on_window_input(event: InputEvent) -> void:
	if event.device == InputEvent.DEVICE_ID_EMULATION:
		return
	var at := Vector2(-1, -1)
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed and touch.index == 0:
			at = touch.position
	elif event is InputEventMouseButton:
		var click := event as InputEventMouseButton
		if click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
			at = click.position
	if at.x < 0.0:
		return
	# DIFFERE : le controle survole n'est a jour qu'une fois l'appui traite
	# par l'interface — lu tout de suite, il serait celui de la tape d'avant.
	_tap_done.call_deferred(at)


func _tap_done(at: Vector2) -> void:
	var root := get_tree().root
	# La position arrive en pixels de FENETRE (avant l'etirement) : on la
	# rapporte a la fenetre, ce qui donne 0..1 quel que soit l'ecran.
	var win := Vector2(root.size)
	if win.x <= 0.0 or win.y <= 0.0:
		return
	var view := root.get_visible_rect().size
	var hovered := root.gui_get_hovered_control()
	var control := "world"
	var path := ""
	var label := ""
	if hovered != null:
		control = _node_name(hovered)
		path = _short_path(hovered)
		if hovered is Button:
			label = (hovered as Button).text
	track("tap", {
		"x": snappedf(clampf(at.x / win.x, 0.0, 1.0), 0.001),
		"y": snappedf(clampf(at.y / win.y, 0.0, 1.0), 0.001),
		# Le seau de taille, en unites du jeu (apres etirement) arrondies a la
		# centaine : « 900x400 » regroupe les telephones couches, sans
		# multiplier les valeurs a l'infini.
		"vp": "%dx%d" % [int(round(view.x / 100.0) * 100.0), int(round(view.y / 100.0) * 100.0)],
		"control": control,
		"path": path,
		"label": label,
		"dialog": _dialog,
	})


# ── Les noms ─────────────────────────────────────────────────────────────────

## LE NOM D'UN PANNEAU pour les rapports : sa classe (`class_name`), sinon le
## nom de son script, sinon celui du premier enfant scripte (la carte de la
## maison est posee dans un Control nu, chrome.gd « upgrade »), sinon son nom.
static func kind_of(node: Node) -> String:
	var own := _script_name(node)
	if not own.is_empty():
		return own
	for child in node.get_children():
		var inner := _script_name(child)
		if not inner.is_empty():
			return inner
	return String(node.name)


static func _script_name(node: Node) -> String:
	var script := node.get_script() as Script
	if script == null:
		return ""
	var global := String(script.get_global_name())
	if not global.is_empty():
		return global
	return script.resource_path.get_file().get_basename()


## Le premier ancetre qui est un panneau (un script qui n'est pas un bouton).
static func _panel_of(node: Node) -> String:
	var at := node.get_parent()
	while at != null and at != node.get_tree().root:
		var n := _script_name(at)
		if not n.is_empty() and n != "PlankButton":
			return n
		at = at.get_parent()
	return ""


## Un nom lisible : les noms automatiques (`@Button@123`) ne disent rien et
## changent a chaque partie — on donne la classe a la place.
static func _node_name(node: Node) -> String:
	var n := String(node.name)
	if n.begins_with("@") or n.is_empty():
		var s := _script_name(node)
		return s if not s.is_empty() else node.get_class()
	return n


## Les trois derniers maillons lisibles du chemin : assez pour situer un
## bouton, assez court pour tenir dans les 100 caracteres.
static func _short_path(node: Node) -> String:
	var parts: Array[String] = []
	var at := node
	while at != null and parts.size() < 3:
		parts.push_front(_node_name(at))
		at = at.get_parent()
		if at == node.get_tree().root:
			break
	return "/".join(parts)


# ── Les regles de GA4 ────────────────────────────────────────────────────────

## Un identifiant GA4 : [a-zA-Z][a-zA-Z0-9_]*, sans prefixe reserve.
static func _ident(raw: String) -> String:
	var out := ""
	for ch in raw:
		var c := ch.unicode_at(0)
		var ok := (c >= 48 and c <= 57) or (c >= 65 and c <= 90) or (c >= 97 and c <= 122) or c == 95
		out += ch if ok else "_"
	if out.is_empty():
		return "x"
	var first := out.unicode_at(0)
	if not ((first >= 65 and first <= 90) or (first >= 97 and first <= 122)):
		out = "x_" + out
	for prefix in RESERVED_PREFIXES:
		if out.to_lower().begins_with(prefix):
			out = "x_" + out
	return out


static func _clip(text: String, n: int) -> String:
	return text if text.length() <= n else text.substr(0, n)


static func _name(event: String) -> String:
	var n := _clip(_ident(event), NAME_MAX)
	if n in RESERVED_EVENTS:
		n = _clip("rr_" + n, NAME_MAX)
	return n


## Les parametres aux regles : 25 au plus, noms reparés, textes coupes a 100.
## GA4 ne connait que texte et nombre : un booleen devient "true"/"false"
## (lisible dans les rapports, filtrable), un tableau ou un dictionnaire son
## JSON coupe, un null n'est pas envoye.
static func _params(params: Dictionary) -> Dictionary:
	var out := {}
	for key in params:
		if out.size() >= PARAMS_MAX:
			break
		var value: Variant = params[key]
		if value == null:
			continue
		var k := _clip(_ident(String(key)), NAME_MAX)
		match typeof(value):
			TYPE_INT, TYPE_FLOAT:
				out[k] = value
			TYPE_BOOL:
				out[k] = "true" if value else "false"
			TYPE_STRING, TYPE_STRING_NAME:
				out[k] = _clip(String(value), VALUE_MAX)
			TYPE_ARRAY, TYPE_DICTIONARY:
				out[k] = _clip(JSON.stringify(value), VALUE_MAX)
			_:
				out[k] = _clip(str(value), VALUE_MAX)
	return out
