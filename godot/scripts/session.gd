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

const TOKEN_PATH := "user://session.cfg"

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
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--token="):
			token = arg.trim_prefix("--token=")
			_from_args = true
			return
	token = _load_token()


func signed_in() -> bool:
	return not player.is_empty()


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
		DirAccess.remove_absolute(TOKEN_PATH)


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
		_:
			return reason


func _load_token() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(TOKEN_PATH) != OK:
		return ""
	return String(cfg.get_value("session", "token", ""))


func _save_token(value: String) -> void:
	if _from_args:
		return
	var cfg := ConfigFile.new()
	cfg.set_value("session", "token", value)
	cfg.save(TOKEN_PATH)
