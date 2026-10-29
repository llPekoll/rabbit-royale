extends Node
## WHO IS PLAYING, and the one token that proves it.
##
## Ported from the web client's src/components/use-wallet-login.tsx, keeping
## the decisions that file argues for:
##
##   • ONE session, shared. Every screen reads this autoload rather than each
##     holding its own copy. The web version learned this the hard way: two
##     independent copies meant signing out cleared one of them, and the burrow
##     stayed on screen for a signed-out player.
##   • TWO DOORS, one session. A wallet sign-in and a guest sign-in hand back
##     the SAME kind of token, read the same way by every route and by the WS
##     handshake. Nothing downstream branches on how the player got in.
##   • A REFUSED TOKEN IS DISCARDED, a failed call is not. See `restore()`.
##
## The token is what the socket will hand over at handshake time, so it lives
## here rather than in the doorstep: the screen that signs in is not the screen
## that connects.

## UN FICHIER PAR MONDE (2026-10-19). Le web2 a ses propres comptes, signes
## d'un autre secret : s'il lisait le fichier du web3, ws2 refuserait le jeton
## et `_forget` effacerait celui du joueur web3 sur cet appareil (le bureau
## avec `--world=web2`, et rabbit.rip/play/ quand le web2 y sera).
var _token_path := "user://session.cfg"

## Fires when the player changes — signed in, signed out, or restored. Screens
## follow this rather than polling, and it carries no argument: a listener asks
## `Session.player` for whatever it needs.
signal changed

## Fires when a sign-in attempt fails, with a message already fit to show.
signal failed(message: String)

## The signed-in player, or an empty Dictionary when nobody is. Shaped exactly
## like the server's `player` object: id, name, wallet, guest, runsPlayed.
var player: Dictionary = {}

## The session JWT. Empty when signed out. This is what the socket wants.
var token: String = ""

## True until `restore()` has answered. `player.is_empty()` alone cannot tell
## "signed out" from "not asked yet", and the doorstep read as the first shows
## the sign-in buttons to a returning player for a frame.
var checking := true

## True while a sign-in is in flight, so the doorstep can disable both doors
## without tracking which one was pressed.
var busy := false


## Un jeton passe en ligne de commande (`-- --token=...`, banc de scenarios
## contre un serveur local) : utilise tel quel, JAMAIS ecrit ni efface sur le
## disque — sinon le serveur local refuserait le jeton de prod et `_forget`
## deconnecterait le vrai compte.
var _from_args := false

func _ready() -> void:
	if Net.WORLD == "web2":
		_token_path = "user://session-web2.cfg"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--token="):
			token = arg.trim_prefix("--token=")
			_from_args = true
			return
	if OS.has_feature("web"):
		_import_moved_session()
	token = _load_token()


func signed_in() -> bool:
	return not player.is_empty()


## Un wallet d'ou payer. Pas la meme question que `guest` depuis Google et
## l'email : un compte Google n'est pas un invite, et n'a pas de wallet.
func has_wallet() -> bool:
	return player.get("wallet") != null and not String(player["wallet"]).is_empty()


## A GUEST BURROW: play now, decide about a wallet later.
##
## No proof to give, so this is one POST. The session it returns is ordinary —
## the same signature, the same thirty days — and `link_wallet()` later attaches
## a proven address to this very account, keeping everything built meanwhile.
func play_as_guest() -> bool:
	if busy:
		return false
	busy = true
	var answer: Answer = await Net.post_json("/api/auth/guest")
	busy = false

	if not answer.ok:
		failed.emit(_explain(answer.error()))
		return false
	_adopt(answer.body)
	return true


## SIGN IN WITH A WALLET, in the two calls the server's flow requires:
## ask for a challenge for this address, then post the signature over it.
##
## The signing itself is NOT done here — it belongs to whatever can reach a
## wallet on this platform (the MWA plugin on Android). This takes the address
## and a `signer` that turns the challenge message into a base58 signature, so
## the flow is testable without a wallet and the same on every platform.
##
## `signer` is a Callable taking the message String and returning a base58
## signature String, or "" if the player refused.
func sign_in_with_wallet(address: String, signer: Callable) -> bool:
	if busy:
		return false
	busy = true
	var signature := await _sign_challenge(address, signer)
	if signature.is_empty():
		busy = false
		return false

	var answer: Answer = await Net.post_json(
		"/api/auth/verify", {"address": address, "signature": signature}
	)
	busy = false

	if not answer.ok:
		failed.emit(_explain(answer.error()))
		return false
	_adopt(answer.body)
	return true


## A GUEST CLAIMS THEIR BURROW. Same two calls as a sign-in, but posted to
## /link with the session attached: the server needs BOTH the token (which
## burrow) and a fresh signature (who owns the wallet).
##
## The token is REISSUED by that route, because `wallet` is one of its claims —
## keeping the old one would keep describing this player as walletless.
func link_wallet(address: String, signer: Callable) -> bool:
	if busy or not signed_in():
		return false
	busy = true
	var signature := await _sign_challenge(address, signer)
	if signature.is_empty():
		busy = false
		return false

	var answer: Answer = await Net.post_json(
		"/api/auth/link", {"address": address, "signature": signature}, token
	)
	busy = false

	if not answer.ok:
		failed.emit(_explain(answer.error(), answer.body))
		return false
	_adopt(answer.body)
	return true


## The two steps every wallet flow shares: mint a challenge, have it signed.
## Returns "" when either step fails, having already reported why.
func _sign_challenge(address: String, signer: Callable) -> String:
	var challenge: Answer = await Net.post_json("/api/auth/challenge", {"address": address})
	if not challenge.ok:
		failed.emit(_explain(challenge.error()))
		return ""

	# The message is taken from the ANSWER, never rebuilt here. The server pins
	# the exact bytes (lib/auth/message.ts) and a client that composes its own
	# copy signs the wrong string the day that file changes.
	var message := String(challenge.body.get("message", ""))
	if message.is_empty():
		failed.emit(_explain("bad_challenge"))
		return ""

	var signature := await signer.call(message) as String
	# Empty is a REFUSAL, not a failure: the player closed the wallet sheet.
	# Nothing to report — they know what they just did.
	return signature


## GOOGLE, OU UN EMAIL (2026-10-08) : les portes de ceux qui n'ont pas de
## wallet. Les deux rendent le MEME jeton que les autres ; `link` les attache
## au joueur connecte (un invite qui sauve son terrier) au lieu de connecter.

## Vrai pendant qu'une connexion Google attend son navigateur.
var google_waiting := false
var _google_cancelled := false

## Combien de temps on attend le navigateur avant d'abandonner : celui du
## serveur (HANDOFF_TTL_MS, 10 min).
const GOOGLE_WAIT_SECONDS := 600.0


## « CONTINUER AVEC GOOGLE », fait par le serveur (lib/auth/google.ts) : on
## ouvre le navigateur du systeme sur l'adresse qu'il donne, puis on attend
## sa reponse sur /api/auth/handoff, une requete tenue ~20 s, relancee jusqu'a
## ce que le navigateur ait fini. Le jeton passe TOUJOURS par cette attente.
##
## L'APP iOS (2026-10-29) non plus : la page Google s'ouvre dans une feuille
## ASWebAuthenticationSession (plugin RabbitApple) qui se referme seule, et
## « Continuer avec Apple » a la sienne, sans page (continue_with_apple).
##
## L'APP PLAY (web2 Android, 2026-10-29) NE PASSE PAS PAR LE NAVIGATEUR : la
## feuille de comptes d'Android s'ouvre au-dessus du jeu (_google_native).
## Chrome, lui, restait ouvert derriere chaque connexion. Le navigateur ne sert
## plus qu'en repli, quand la feuille ne peut pas s'ouvrir ; le serveur y
## renvoie alors Chrome DANS l'app une fois Google passe (`return: android`,
## ReturnToGameActivity du plugin RabbitFirebase).
##
## Une requete ratee pendant l'attente (l'app passee en arriere-plan le temps
## du navigateur, le reseau qui change) n'arrete RIEN : on redemande, et le
## serveur garde la reponse jusqu'a ce que le relais expire.
func continue_with_google(link := false) -> bool:
	if busy:
		return false
	if Net.WORLD == "web2" and Engine.has_singleton(FIREBASE):
		var native := await _google_native(link)
		if native != "browser":
			return native == "ok"
	busy = true
	google_waiting = true
	_google_cancelled = false
	var body := {"link": link}
	var apple = _apple()
	if apple != null:
		body["return"] = "ios"
	elif Net.WORLD == "web2" and OS.get_name() == "Android":
		body["return"] = "android"
	var start: Answer = await Net.post_json("/api/auth/google/start", body, token if link else "")
	if not start.ok:
		busy = false
		google_waiting = false
		failed.emit(_explain(start.error()))
		return false

	var handoff := String(start.body.get("handoff", ""))
	var url := String(start.body.get("url", ""))
	var scheme := String(start.body.get("scheme", ""))
	if apple != null and not scheme.is_empty():
		# iOS : la page Google dans une feuille qui se referme seule quand le
		# serveur redirige vers `scheme://` ; la fermer a la main = annuler.
		apple.web_done.connect(_on_google_sheet, CONNECT_ONE_SHOT)
		apple.open_auth_session(url, scheme)
	else:
		OS.shell_open(url)
	var until := Time.get_ticks_msec() + int(GOOGLE_WAIT_SECONDS * 1000.0)
	var outcome: Dictionary = {}
	while not _google_cancelled and Time.get_ticks_msec() < until:
		var answer: Answer = await Net.get_json("/api/auth/handoff?id=" + handoff, "", 30.0)
		if _google_cancelled:
			break
		if answer.status == 404 or (answer.ok and String(answer.body.get("status", "")) == "done"):
			outcome = answer.body if answer.ok else {"error": "expired"}
			break
		if not answer.ok:
			# Hors ligne un instant : on ne martele pas le serveur.
			await get_tree().create_timer(2.0).timeout
	busy = false
	google_waiting = false

	if _google_cancelled or outcome.is_empty():
		return false
	if outcome.has("error"):
		var why := String(outcome["error"])
		# Un relais expire n'est pas un CODE expire : la connexion a echoue.
		failed.emit(_explain("google_failed" if why == "expired" else why, outcome))
		return false
	_adopt(outcome)
	return true


const FIREBASE := "RabbitFirebase"

## Le plugin iOS RabbitApple (plugin-src/apple), garde le temps de la session :
## une feuille ouverte doit retrouver qui l'attend.
var _apple_auth: RefCounted


## L'objet AppleAuth sur l'app iOS du monde web2, null partout ailleurs (la
## classe n'existe que dans l'export iOS).
func _apple() -> RefCounted:
	if Net.WORLD != "web2" or not ClassDB.class_exists("AppleAuth"):
		return null
	if _apple_auth == null:
		_apple_auth = ClassDB.instantiate("AppleAuth")
	return _apple_auth


## « CONTINUER AVEC APPLE » existe-t-il ici ? L'app iOS seulement — et la
## regle 4.8 de l'App Store l'y exige, a cote de Google.
func apple_available() -> bool:
	return _apple() != null


## LA FEUILLE APPLE (ASAuthorizationController) : aucun navigateur. Apple rend
## un identityToken signe, que /api/auth/apple/native verifie.
func continue_with_apple(link := false) -> bool:
	var apple = _apple()
	if busy or apple == null:
		return false
	busy = true
	apple.sign_in_with_apple()
	var sheet: Array = await apple.apple_done
	var identity_token := String(sheet[0])
	var error := String(sheet[3])
	if error == "cancelled" or identity_token.is_empty():
		busy = false
		if error != "cancelled":
			failed.emit(_explain("apple_failed"))
		return false
	var answer: Answer = await Net.post_json("/api/auth/apple/native", {
		"identityToken": identity_token,
		"authorizationCode": String(sheet[1]),
		"link": link,
	}, token if link else "")
	busy = false
	if not answer.ok:
		failed.emit(_explain(answer.error(), answer.body))
		return false
	_adopt(answer.body)
	return true

signal _google_sheet_closed(id_token: String, error: String)


## LA FEUILLE GOOGLE D'ANDROID (RabbitFirebase.googleSignIn, Credential
## Manager) : un id_token adresse au client WEB du serveur, que
## /api/auth/google/native verifie et echange contre une session.
## Rend "ok", "stop" (refus deja dit, ou le joueur a ferme la feuille) ou
## "browser" : la feuille ne peut pas servir ici (client Android pas declare
## chez Google, aucun compte, serveur trop vieux) et le navigateur prend le
## relais — la raison exacte est au logcat (tag du plugin).
func _google_native(link: bool) -> String:
	busy = true
	var conf: Answer = await Net.get_json("/api/auth/google/native")
	var client_id := String(conf.body.get("clientId", "")) if conf.ok else ""
	if client_id.is_empty():
		busy = false
		return "browser"

	var plugin := Engine.get_singleton(FIREBASE)
	plugin.connect("google_signed_in",
		func(id_token: String, error: String) -> void: _google_sheet_closed.emit(id_token, error),
		CONNECT_ONE_SHOT)
	plugin.googleSignIn(client_id)
	var sheet: Array = await _google_sheet_closed
	var id_token := String(sheet[0])
	var error := String(sheet[1])
	if error == "cancelled":
		busy = false
		return "stop"
	if id_token.is_empty():
		push_warning("[session] feuille Google : %s, repli navigateur" % error)
		busy = false
		return "browser"

	var answer: Answer = await Net.post_json("/api/auth/google/native",
		{"idToken": id_token, "link": link}, token if link else "")
	busy = false
	if not answer.ok:
		failed.emit(_explain(answer.error(), answer.body))
		return "stop"
	_adopt(answer.body)
	return "ok"


## La feuille Google d'iOS s'est fermee : seule (le serveur a fini, la
## reponse arrive par l'attente), ou a la main, et c'est une annulation.
func _on_google_sheet(_url: String, error: String) -> void:
	if not error.is_empty():
		cancel_google()


## Le joueur a presse ANNULER : la boucle s'arrete a la reponse suivante. La
## connexion entamee dans le navigateur meurt seule (10 min, serveur).
func cancel_google() -> void:
	_google_cancelled = true


## ENVOIE LE CODE A 6 CHIFFRES. Rend "" si le mail est parti, sinon le refus
## deja dit en mots ; rien n'est emis sur `failed`, le dialogue l'affiche
## sous le champ.
func send_email_code(email: String, link := false) -> String:
	var answer: Answer = await Net.post_json("/api/auth/email/start",
		{"email": email, "link": link}, token if link else "")
	return "" if answer.ok else _explain(answer.error())


## LE CODE TAPE. Rend "" et adopte la session si c'est le bon, sinon le refus.
func verify_email_code(email: String, code: String) -> String:
	var answer: Answer = await Net.post_json("/api/auth/email/verify",
		{"email": email, "code": code}, token)
	if not answer.ok:
		return _explain(answer.error(), answer.body)
	_adopt(answer.body)
	return ""


## SUPPRIMER LE COMPTE (profil, deux pressions) : le serveur efface la ligne
## et tout ce qui y pend, puis la session est oubliee ici.
func delete_account() -> bool:
	var answer: Answer = await Net.post_json("/api/auth/delete", {}, token)
	if answer.ok:
		sign_out()
	return answer.ok


## RESTORE a stored session, or decide it is dead.
##
## Awaited by the doorstep before it shows anything, so a returning player never
## sees the sign-in buttons flash.
func restore() -> bool:
	if token.is_empty():
		checking = false
		changed.emit()
		return false

	var answer: Answer = await Net.get_json("/api/auth/me", token)
	checking = false

	if answer.ok:
		# /me answers with the player at the top level, not wrapped. It mints no
		# token for us — we sent the header, so we already hold one.
		_save_token(token)
		_adopt({"player": answer.body.get("player", answer.body), "token": token})
		return true

	if _discard(answer.status):
		_forget()
	changed.emit()
	return false


## WHAT TO DO WITH A STORED TOKEN after the server has answered. Ported
## literally from restoreDecision() in use-wallet-login.tsx, which is the
## decision that broke there once already.
##
## A refusal is final: the token is expired, forged, signed with a secret this
## deployment no longer has, or names a player who no longer exists. Keeping it
## pins the player on the doorstep and makes the next sign-in write a second
## dead token behind the first.
##
## Anything else — a 500, a proxy hiccup, being offline — says NOTHING about
## the token. Throwing it away there signs the player out over a blip.
func _discard(status: int) -> bool:
	return status == 401 or status == 403 or status == 404


## SIGN OUT. Local only: the server has no session to destroy, the token simply
## stops being presented. Emitted so every screen drops the player at once.
func sign_out() -> void:
	# HORS LIGNE : on quitte le mode, et le compte en ligne de cet appareil
	# reste tel quel (son jeton n'a jamais ete touche).
	if Voyageur.active:
		Voyageur.stop()
		player = {}
		token = _load_token()
		changed.emit()
		return
	_forget()
	changed.emit()


func _adopt(body: Dictionary) -> void:
	player = body.get("player", {})
	var fresh := String(body.get("token", ""))
	if not fresh.is_empty():
		token = fresh
		_save_token(token)
	changed.emit()


func _forget() -> void:
	player = {}
	token = ""
	if not _from_args:
		var cfg := ConfigFile.new()
		cfg.load(_token_path)
		cfg.set_value(_section(), "token", "")
		cfg.save(_token_path)


## The server's refusal, in words the player can act on.
##
## Anything not listed falls through to the raw reason rather than a friendly
## lie: an unrecognised error the player reports verbatim is worth more than a
## polished message that hides which route said it.
func _explain(reason: String, body: Dictionary = {}) -> String:
	match reason:
		"offline":
			return I18N.t("err_offline")
		"invalid signature", "invalid_signature":
			return I18N.t("auth.signInFailed")
		"wallet_taken":
			var holder := String(body.get("takenBy", ""))
			# The refusal ends somewhere the player can go: they just proved
			# they own this wallet, so naming the burrow it belongs to reveals
			# nothing that is not already theirs.
			return I18N.f("auth.walletDigsFor", [holder]) if not holder.is_empty() \
				else I18N.t("auth.walletTaken")
		"already_linked":
			return I18N.t("auth.alreadyLinked")
		"provider_linked":
			return I18N.t("auth.alreadyLinkedProvider")
		"identity_taken":
			var owner := String(body.get("takenBy", ""))
			return I18N.f("auth.identityDigsFor", [owner]) if not owner.is_empty() \
				else I18N.t("auth.identityTaken")
		"invalid_email":
			return I18N.t("auth.invalidEmail")
		"too_soon":
			return I18N.t("auth.tooSoon")
		"mail_failed":
			return I18N.t("auth.mailFailed")
		"wrong_code", "invalid_code":
			return I18N.t("auth.wrongCode")
		"expired":
			return I18N.t("auth.codeExpired")
		"too_many":
			return I18N.t("auth.tooManyTries")
		"cancelled":
			return I18N.t("auth.signInCancelled")
		"google_unavailable", "email_unavailable":
			return I18N.t("auth.unavailable")
		"google_failed", "apple_failed":
			return I18N.t("auth.signInFailed")
		_:
			return reason


## UN SEUL JETON POUR TOUTES LES REGIONS (2026-10-23) : elles partagent leurs
## comptes, le meme terrier repond partout. La section `session` est celle
## d'avant les regions. Un serveur nomme a la main (`--server=`) range le sien
## a part.
func _section() -> String:
	return "local" if Net._override() != "" else "session"


## LE JOUR DE L'UNIFICATION, un appareil peut garder un jeton par region
## (`session`, `session-sg`, `session-us`) : celui de la region ou l'on jouait
## est le compte que le joueur connait, il devient le seul. Une fois ; les
## anciennes sections restent, plus lues.
func _load_token() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(_token_path) != OK:
		return ""
	if _section() == "session" and not bool(cfg.get_value("session", "unified", false)):
		if Net.region != "" and Net.region != "eu":
			var here := String(cfg.get_value("session-" + Net.region, "token", ""))
			if not here.is_empty():
				cfg.set_value("session", "token", here)
		cfg.set_value("session", "unified", true)
		cfg.save(_token_path)
	return String(cfg.get_value(_section(), "token", ""))


func _save_token(value: String) -> void:
	if _from_args:
		return
	var cfg := ConfigFile.new()
	cfg.load(_token_path)
	cfg.set_value(_section(), "token", value)
	cfg.save(_token_path)


## LE DEMENAGEMENT DU WEB3 (2026-10-19) : le jeu du navigateur est passe de
## rabbit.rip/play/ a sol.rabbit.rip/play/, une autre origine, donc un autre
## stockage. La page laissee a l'ancienne adresse (site/play/index.html) y lit
## nos fichiers et les passe ici dans le fragment,
## #rr_move=<base64url d'un JSON {nom: texte}>, que le navigateur n'envoie a
## aucun serveur. Deux fichiers seulement : la session et la reponse au
## consentement (Analytics la lit apres nous, la question ne revient pas).
## On ne prend que les cles qu'on n'a pas : un joueur deja connecte ici le
## reste.
const _MOVED_FILES: Array[String] = ["session.cfg", "consent.cfg"]

func _import_moved_session() -> void:
	var frag := str(JavaScriptBridge.eval("location.hash", true))
	if not frag.begins_with("#rr_move="):
		return
	# Hors de la barre d'adresse tout de suite : un jeton n'a rien a faire
	# dans l'historique ni dans un lien copie.
	JavaScriptBridge.eval("history.replaceState(null, '', location.pathname + location.search)", true)
	import_moved(frag, "user://")


## Le coeur de `_import_moved_session`, sans le navigateur : le fragment tel
## quel, le dossier ou ecrire. Rend les fichiers repris ; public pour pouvoir
## le verifier hors navigateur.
func import_moved(frag: String, dir: String) -> PackedStringArray:
	var taken := PackedStringArray()
	var b64 := frag.trim_prefix("#rr_move=").replace("-", "+").replace("_", "/")
	while b64.length() % 4 != 0:
		b64 += "="
	var files = JSON.parse_string(Marshalls.base64_to_utf8(b64))
	if not files is Dictionary:
		return taken
	for fname: String in _MOVED_FILES:
		if not files.has(fname):
			continue
		var moved := ConfigFile.new()
		if moved.parse(str(files[fname])) != OK:
			continue
		var path := dir + fname
		var cfg := ConfigFile.new()
		cfg.load(path)
		var took := false
		for section in moved.get_sections():
			for key in moved.get_section_keys(section):
				if str(cfg.get_value(section, key, "")) == "":
					cfg.set_value(section, key, moved.get_value(section, key))
					took = true
		if took:
			cfg.save(path)
			taken.append(fname)
			print("[session] %s repris de rabbit.rip/play/" % fname)
	return taken
