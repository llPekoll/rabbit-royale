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
const HOST := "https://ws.rabbit.rip"

## How long a call waits before it is called dead.
##
## Matches the web client's RESTORE_WAIT_MS on purpose: a doorstep that hangs
## is worse than a doorstep that shows the buttons it could not skip.
const TIMEOUT_SECONDS := 10.0

## GET, with the session token if there is one.
func get_json(path: String, token: String = "") -> Answer:
	return await _send(path, HTTPClient.METHOD_GET, {}, token)


## POST, with the session token if there is one. An empty `payload` still sends
## `{}` rather than no body: the routes parse JSON and a missing body reads as
## a malformed one.
func post_json(path: String, payload: Dictionary = {}, token: String = "") -> Answer:
	return await _send(path, HTTPClient.METHOD_POST, payload, token)


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

	var body := JSON.stringify(payload) if method == HTTPClient.METHOD_POST else ""
	var started := request.request(HOST + path, headers, method, body)
	if started != OK:
		request.queue_free()
		return Answer.new(0, {})

	var result: Array = await request.request_completed
	request.queue_free()

	# result is [result, response_code, headers, body]. A transport failure
	# (no network, DNS, TLS) arrives as a non-OK result with code 0, which
	# Answer reports as "offline" — distinct from a server that refused.
	var code: int = result[1]
	var raw: PackedByteArray = result[3]
	var parsed: Variant = JSON.parse_string(raw.get_string_from_utf8())
	var dict: Dictionary = parsed if parsed is Dictionary else {}
	return Answer.new(code, dict)
