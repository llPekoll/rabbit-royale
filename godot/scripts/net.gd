extends Node
## WHERE THE SERVER IS, and how to ask it something.
##
## The game's API does NOT live with the web page. The 21 routes and socket.io
## both run in rr-ws, reachable at ws.rabbit.rip; the web client only proxies
## to it. A native client has no page to proxy through, so it talks to that
## host directly and there is no second hop to get wrong.
##
## Every call is one-shot: a fresh HTTPRequest per request, freed when it
## answers. Godot's HTTPRequest cannot be reused while in flight, and a shared
## one silently drops the second caller — with the doorstep firing `/me` and a
## sign-in at once, that is a bug waiting rather than a saving worth having.

## The API's origin. Prod, because that is where the game is played: the user
## tests on the server, never locally, so a localhost default would only ever
## be wrong on the device.
##
## POUR JOUER CONTRE UN SERVEUR LOCAL, sans rien changer au defaut :
##   godot --path godot -- --server=http://localhost:3011
## ou la variable d'environnement RR_SERVER. Lu une fois, au chargement.
var HOST := _host()


static func _host() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--server="):
			return arg.trim_prefix("--server=").trim_suffix("/")
	var env := OS.get_environment("RR_SERVER")
	return env.trim_suffix("/") if env != "" else "https://ws.rabbit.rip"

## How long a call waits before it is called dead.
##
## Matches the web client's RESTORE_WAIT_MS on purpose: a doorstep that hangs
## is worse than a doorstep that shows the buttons it could not skip.
const TIMEOUT_SECONDS := 10.0

## UN GESTE EST EN ROUTE VERS LE SERVEUR — la moulinette du chrome s'y
## accroche (ui/busy_spinner.gd). Seules les ECRITURES comptent : poser,
## acheter, enregistrer, avancer d'un pas. Les relectures de fond (le terrier
## toutes les minutes) ne sont pas un geste du joueur et n'ont rien a dire.
signal busy_changed(busy: bool)

var _in_flight := 0


## TRACE DU BANC : une ligne sur la sortie standard, seulement contre un
## serveur local (`--server=http://localhost...`), jamais contre la prod.
## tools/scenarios/playground.ts la recopie dans out/godot.log.
func trace(msg: String) -> void:
	if HOST.begins_with("http://localhost") or HOST.begins_with("http://127."):
		print("[trace %d] %s" % [Time.get_ticks_msec(), msg])


## Une ecriture part. A appeler par tout HTTPRequest fait a la main (la
## boutique, le raid, le profil), et appariee a `end()` quoi qu'il arrive.
func begin() -> void:
	_in_flight += 1
	if _in_flight == 1:
		busy_changed.emit(true)


func end() -> void:
	_in_flight = maxi(0, _in_flight - 1)
	if _in_flight == 0:
		busy_changed.emit(false)


func busy() -> bool:
	return _in_flight > 0


## GET, with the session token if there is one.
func get_json(path: String, token: String = "") -> Answer:
	return await _send(path, HTTPClient.METHOD_GET, {}, token)


## POST, with the session token if there is one. An empty `payload` still sends
## `{}` rather than no body: the routes parse JSON and a missing body reads as
## a malformed one.
func post_json(path: String, payload: Dictionary = {}, token: String = "") -> Answer:
	return await _send(path, HTTPClient.METHOD_POST, payload, token)


## PUT / PATCH / DELETE, with a JSON body where the method carries one.
func send_json(path: String, method: int, payload: Dictionary = {}, token: String = "") -> Answer:
	return await _send(path, method, payload, token)


func _send(path: String, method: int, payload: Dictionary, token: String) -> Answer:
	var request := HTTPRequest.new()
	request.timeout = TIMEOUT_SECONDS
	add_child(request)

	var headers := PackedStringArray(["Content-Type: application/json"])
	if not token.is_empty():
		# BEARER, not the cookie. The cookie is httpOnly and belongs to the
		# browser; `/me` reads this header and, seeing it, does NOT mint a
		# replacement token — which is right, we already hold one.
		headers.append("Authorization: Bearer %s" % token)

	var carries := method == HTTPClient.METHOD_POST or method == HTTPClient.METHOD_PUT \
		or method == HTTPClient.METHOD_PATCH
	var body := JSON.stringify(payload) if carries else ""
	var writes := method != HTTPClient.METHOD_GET
	if writes:
		begin()
	var started := request.request(HOST + path, headers, method, body)
	if started != OK:
		request.queue_free()
		if writes:
			end()
		return Answer.new(0, {})

	var result: Array = await request.request_completed
	request.queue_free()
	if writes:
		end()

	# result is [result, response_code, headers, body]. A transport failure
	# (no network, DNS, TLS) arrives as a non-OK result with code 0, which
	# Answer reports as "offline" — distinct from a server that refused.
	var code: int = result[1]
	var raw: PackedByteArray = result[3]
	var parsed: Variant = JSON.parse_string(raw.get_string_from_utf8())
	var dict: Dictionary = parsed if parsed is Dictionary else {}
	return Answer.new(code, dict)
