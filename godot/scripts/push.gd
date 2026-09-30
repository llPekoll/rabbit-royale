extends Node
## LES NOTIFICATIONS : la demande, le jeton, et la tape qui ramene au jeu.
##
## Firebase Cloud Messaging, par les deux memes portes qu'Analytics : le
## plugin `RabbitFirebase` sur Android, `window.rrFirebase` sur le web
## (web/shell.html + web/firebase-messaging-sw.js). Ailleurs, rien.
##
## QUAND DEMANDER — la decision (2026-09-30). PAS au premier lancement : un
## nouveau venu ne sait pas encore ce qu'on lui notifierait, et un refus est
## pour toujours (le navigateur ne redemande plus ; Android 13+ cesse
## d'afficher la feuille apres deux refus). On attend le RETOUR AU TERRIER
## APRES LA PREMIERE VRAIE RUN FINIE — pas le tutoriel :
##
##   • le joueur a fait la boucle entiere une fois (creuser, rentrer) et sait
##     ce qu'est son terrier — donc ce que « on te pille » veut dire ;
##   • il rentre le plus souvent A SEC : c'est exactement le moment ou
##     « on te previent quand ton energie est pleine » a un sens ;
##   • c'est un temps calme — pas de rideau en vol, pas de plateau a lire.
##
## Le retour au terrier apres le tutoriel etait l'autre candidat ; il arrive
## trop tot (une seule ile, dessinee, sans energie depensee) et il est deja
## charge (niveau, quete, ilots qui sortent de l'eau).
##
## SUR LE WEB, LA DEMANDE ATTEND UNE TAPE. Firefox et Safari refusent
## `Notification.requestPermission()` hors d'un geste du joueur, et Chrome
## le relegue en icone muette. Le moment venu, on arme ; la prochaine tape
## (n'importe ou) porte la demande, dans la fenetre d'activation du geste.
##
## LE JETON EST RENVOYE A CHAQUE LANCEMENT, une fois connecte : FCM le fait
## tourner sans prevenir, et le serveur garde le dernier (`/api/push/token`).

## Le meme singleton qu'analytics.gd.
const SINGLETON := "RabbitFirebase"
## Ce que l'appareil retient : si la question a deja ete posee.
const PATH := "user://push.cfg"
## Le temps de laisser le terrier s'installer avant la feuille systeme : le
## rideau rouvert, le lapin pose, les tampons partis.
const ASK_DELAY := 1.5

var _android: Object = null
var _web: JavaScriptObject = null
## Tenus tant que le JS peut rappeler (voir wallet.gd).
var _web_token_cb: JavaScriptObject = null
var _web_open_cb: JavaScriptObject = null

## La question a deja ete posee sur cet appareil (acceptee ou non).
var _asked := false
## Une run finie attend son retour au terrier pour poser la question.
var _due := false
## Web : la question attend la prochaine tape.
var _armed := false
## Le dernier jeton connu, et pour qui il a deja ete envoye ce lancement.
var _token := ""
var _sent_for := ""
## Une notification tapee qui attend que le monde soit la (lancement a froid,
## ou pendant un rideau). "" quand rien n'attend.
var _pending := ""
## Le JWT du joueur connecte, garde pour la DECONNEXION : quand
## `Session.changed` dit « parti », Session a deja oublie son jeton, et le
## DELETE du jeton FCM doit encore dire qui le retire. Le JWT reste valide
## cote serveur (rien n'y est detruit a la deconnexion, session.gd).
var _auth := ""


func _ready() -> void:
	_asked = _load_asked()
	if Engine.has_singleton(SINGLETON):
		_android = Engine.get_singleton(SINGLETON)
		# Pas de has_signal/has_method sur un JNISingleton (wallet.gd, le
		# paiement coupe le 2026-09-30) : on connecte, et un plugin sans ce
		# signal ne fait qu'une ligne d'erreur.
		_android.connect("push_token", _on_token)
		_android.connect("push_opened", func(path: String) -> void: _open(path, false))
		var launch: Variant = _android.consumeLaunchPath()
		_open(launch if launch is String else "", true)
	elif OS.has_feature("web"):
		_web = JavaScriptBridge.get_interface("rrFirebase")
		if _web != null:
			_web_token_cb = JavaScriptBridge.create_callback(func(args: Array) -> void:
				_on_token(String(args[0]) if args.size() > 0 and args[0] != null else ""))
			_web_open_cb = JavaScriptBridge.create_callback(func(args: Array) -> void:
				_open(String(args[0]) if args.size() > 0 and args[0] != null else "", false))
			_web.onPushOpened(_web_open_cb)
			var launch: Variant = _web.launchPath()
			_open(launch if launch is String else "", true)

	Session.changed.connect(_on_session_changed)
	Screens.moved.connect(_on_moved)
	Screens.changed.connect(_try_pending)
	Analytics.tracked.connect(_on_tracked)
	get_tree().root.window_input.connect(_on_window_input)


func available() -> bool:
	return _android != null or _web != null


# ── Le moment ────────────────────────────────────────────────────────────────

## La premiere VRAIE run finie (pas la lecon) rend la question due ; elle
## sera posee au retour au terrier.
func _on_tracked(event: String, params: Dictionary) -> void:
	if event == "run_end" and params.get("tutorial", "false") == "false":
		_due = true


func _on_session_changed() -> void:
	_sent_for = ""
	if not Session.signed_in():
		# DECONNECTE : cet appareil ne doit plus sonner pour ce terrier. Le
		# prochain joueur connecte reprendra le jeton (le POST le deplace).
		if not _auth.is_empty() and not _token.is_empty():
			_forget(_token, _auth)
		_auth = ""
		return
	_auth = Session.token
	# UN JOUEUR QUI A DEJA JOUE (runsPlayed compte la lecon : 2 = une vraie
	# run au moins) mais a qui l'on n'a jamais demande — une mise a jour, un
	# autre appareil : la question est due, au prochain terrier.
	if not _asked and int(Session.player.get("runsPlayed", 0)) >= 2:
		_due = true
	# Deja demande : on relit le jeton (il tourne), sans rien redemander.
	if _asked:
		_refresh_token()
	elif not _token.is_empty():
		_send(_token)


func _on_moved(place: Screens.Place) -> void:
	if place != Screens.Place.BURROW or not _due or _asked or not available():
		return
	Screens.on_reveal(func() -> void:
		get_tree().create_timer(ASK_DELAY).timeout.connect(_ask))


## POSER LA QUESTION — si rien ne s'y oppose encore. Un raid en cours, un
## dialogue ouvert, un autre lieu : on attend le prochain retour au terrier.
func _ask() -> void:
	if _asked or not _due or not Session.signed_in():
		return
	if not Screens.in_world() or Screens.place != Screens.Place.BURROW or Screens.crossing:
		return
	if RaidState.current.has_raid() or RaidState.current.has_incoming():
		return
	if Chrome.current != null and Chrome.current.dialog_open():
		return
	_due = false
	if _android != null:
		_mark_asked()
		Analytics.track("push_prompt", {"platform": "android"})
		_android.requestPushPermission()
		_android.fetchPushToken()
		return
	if _web != null:
		match String(_web.pushState()):
			"granted":
				_mark_asked()
				_web.requestPush(_web_token_cb)
			"default":
				_armed = true
			_:
				# « denied » ou « unsupported » (iOS hors ecran d'accueil, config
				# absente) : rien a demander, et on ne redemandera pas.
				_mark_asked()
				Analytics.track("push_unavailable", {"state": String(_web.pushState())})


## LA TAPE QUI PORTE LA DEMANDE WEB. Le signal de la fenetre passe pendant
## le traitement de l'evenement : la page est encore dans son activation.
func _on_window_input(event: InputEvent) -> void:
	if not _armed:
		return
	var pressed := (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed) \
		or (event is InputEventMouseButton and (event as InputEventMouseButton).pressed)
	if not pressed:
		return
	_armed = false
	_mark_asked()
	Analytics.track("push_prompt", {"platform": "web"})
	_web.requestPush(_web_token_cb)


# ── Le jeton ─────────────────────────────────────────────────────────────────

func _refresh_token() -> void:
	if _android != null:
		_android.fetchPushToken()
	elif _web != null and String(_web.pushState()) == "granted":
		# Deja accorde : getToken ne demande rien, pas besoin d'un geste.
		_web.requestPush(_web_token_cb)


func _on_token(token: String) -> void:
	Analytics.track("push_token", {"ok": not token.is_empty()})
	if token.is_empty():
		return
	_token = token
	_send(token)


## AU SERVEUR, une fois par joueur et par lancement.
func _send(token: String) -> void:
	if not Session.signed_in():
		return
	var key := "%s|%s" % [String(Session.player.get("id", "")), token]
	if key == _sent_for:
		return
	_sent_for = key
	var answer: Answer = await Net.post_json("/api/push/token", {
		"token": token,
		"platform": "web" if _web != null else "android",
		"locale": I18N.locale,
		"tzOffsetMin": _tz_offset_min(),
	}, Session.token)
	if not answer.ok:
		# Rate : le prochain lancement (ou la prochaine connexion) reessaie.
		_sent_for = ""
		push_warning("[push] /api/push/token -> %d" % answer.status)


## RETIRER le jeton au serveur (`DELETE /api/push/token {token}`), avec le JWT
## d'avant la deconnexion. A la main et pas par Net : Net n'envoie pas de
## corps sur un DELETE (net.gd `carries`), et Net evolue par une seule main.
## Le jeton part AUSSI dans l'URL : un proxy peut laisser tomber le corps
## d'un DELETE (shop_state.gd `remove_trap` l'a appris) — le serveur lit le
## corps, l'URL est la roue de secours s'il apprend a la lire.
func _forget(token: String, auth: String) -> void:
	var request := HTTPRequest.new()
	request.timeout = Net.TIMEOUT_SECONDS
	add_child(request)
	var headers := PackedStringArray(["Content-Type: application/json", "Authorization: Bearer %s" % auth])
	var url := Net.HOST + "/api/push/token?token=" + token.uri_encode()
	if request.request(url, headers, HTTPClient.METHOD_DELETE, JSON.stringify({"token": token})) != OK:
		request.queue_free()
		return
	var result: Array = await request.request_completed
	request.queue_free()
	Analytics.track("push_forget", {"status": int(result[1])})


## MINUTES A L'EST DE UTC (Paris l'ete : +120), ce que le serveur lit pour ses
## heures calmes. `bias` de Godot a deja ce signe ; sur le web on le prend au
## navigateur (`-getTimezoneOffset()`), qui connait le fuseau mieux que la
## libc d'Emscripten.
static func _tz_offset_min() -> int:
	if OS.has_feature("web"):
		var js: Variant = JavaScriptBridge.eval("-new Date().getTimezoneOffset()", true)
		if js is int or js is float:
			return int(js)
	return int(Time.get_time_zone_from_system().get("bias", 0))


# ── La tape sur une notification ─────────────────────────────────────────────

## UNE NOTIFICATION TAPEE. `cold` : c'est elle qui a lance l'app.
func _open(path: String, cold: bool) -> void:
	var p := path.strip_edges().trim_prefix("/").to_lower()
	if p.is_empty():
		return
	Analytics.track("push_open", {"path": p, "cold": cold})
	_pending = p
	_try_pending()


## LE CHEMIN, UNE FOIS LE MONDE LA : connecte, dans le monde, pas de rideau
## en vol. Au lancement a froid, l'accueil nous y amene seul (title.gd
## `_enter`) ; on attend `Screens.changed`.
func _try_pending() -> void:
	if _pending.is_empty() or not Session.signed_in():
		return
	if not Screens.in_world() or Screens.crossing:
		return
	var p := _pending
	_pending = ""
	match p.get_slice("/", 0):
		"defend", "burrow", "raid":
			# UN RAID SUR NOTRE TERRIER : la defense se joue au terrier, et
			# RaidState relit le raid subi en y arrivant (`_on_moved` →
			# `refresh_incoming`). En plein raid chez un autre, on ne coupe rien.
			if RaidState.current.has_raid():
				return
			if Screens.place == Screens.Place.ISLAND:
				# La tape vaut un « rentrer » : le serveur banque sur `leave`,
				# comme le bouton de retour et le recap (chrome.gd `go_home`).
				RunState.current.go_home()
				Screens.cross(Screens.Place.BURROW)
			else:
				RaidState.current.refresh_incoming()
		"island", "dig":
			# DIG par sa porte : le tutoriel, l'energie, le `join` — tout ce que
			# le batiment fait deja (chrome.gd `_dig`).
			if Screens.place == Screens.Place.BURROW and Chrome.current != null:
				Chrome.current.go("dig")


# ── L'appareil ───────────────────────────────────────────────────────────────

func _mark_asked() -> void:
	_asked = true
	var cfg := ConfigFile.new()
	cfg.load(PATH)
	cfg.set_value("push", "asked", true)
	cfg.save(PATH)


static func _load_asked() -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return false
	return bool(cfg.get_value("push", "asked", false))
