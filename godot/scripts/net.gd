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
## Pose dans `_init` et non a la declaration : `_host` lit la region
## enregistree dans `region`, que son propre initialiseur, plus bas, remettrait
## a vide.
var HOST := ""

## LES REGIONS (2026-10-02), facon LoL : chacune est un jeu ENTIER — sa base,
## ses comptes, ses saisons, ses raids. Rien ne passe de l'une a l'autre ; un
## joueur qui change de region y trouve un autre terrier (deploy/region).
##
## `eu` est l'ancien et unique serveur : un jeton enregistre avant les regions
## est un jeton `eu` (session.gd).
const REGIONS: Array[Dictionary] = [
	{"code": "eu", "host": "https://ws.rabbit.rip"},
	{"code": "sg", "host": "https://ws-sg.rabbit.rip"},
	{"code": "us", "host": "https://ws-us.rabbit.rip"},
]
const REGION_PATH := "user://region.cfg"
## Une region qui ne repond pas en ce temps-la est hors course a la sonde.
const PROBE_SECONDS := 2.5

signal region_changed(code: String)

## La region jouee. Vide contre un serveur nomme a la main (`--server=`) :
## ce serveur-la n'est aucune des regions.
var region := ""
## Le dernier aller-retour mesure vers chaque region, en ms ; -1 = muette.
var pings: Dictionary = {}


func _init() -> void:
	HOST = _host()


static func _override() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--server="):
			return arg.trim_prefix("--server=").trim_suffix("/")
	return OS.get_environment("RR_SERVER").trim_suffix("/")


func _host() -> String:
	var forced := _override()
	if forced != "":
		return forced
	region = _saved_region()
	return host_of(region if region != "" else "eu")


func host_of(code: String) -> String:
	for r in REGIONS:
		if r.code == code:
			return r.host
	return REGIONS[0].host


## Le joueur (ou la sonde du premier lancement) a-t-il deja choisi ?
func region_chosen() -> bool:
	return region != "" or _override() != ""


func choose_region(code: String) -> void:
	if _override() != "" or code == region:
		return
	region = code
	HOST = host_of(code)
	var cfg := ConfigFile.new()
	cfg.set_value("region", "code", code)
	cfg.save(REGION_PATH)
	region_changed.emit(code)


func _saved_region() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(REGION_PATH) != OK:
		return ""
	var code := String(cfg.get_value("region", "code", ""))
	for r in REGIONS:
		if r.code == code:
			return code
	return ""


## LA SONDE : un `/health` vers chaque region, en meme temps, chronometre.
## Remplit `pings` et rend la region la plus proche qui a repondu ("" si
## aucune). Une region pas encore ouverte reste a -1 et ne gagne jamais.
func probe() -> String:
	var pending := {"n": REGIONS.size()}
	var done := func() -> void: pending.n -= 1
	for r in REGIONS:
		var code := String(r.code)
		pings[code] = -1
		var request := HTTPRequest.new()
		request.timeout = PROBE_SECONDS
		add_child(request)
		var sent := Time.get_ticks_msec()
		request.request_completed.connect(func(result: int, status: int, _h: PackedStringArray, _b: PackedByteArray) -> void:
			if result == HTTPRequest.RESULT_SUCCESS and status == 200:
				pings[code] = Time.get_ticks_msec() - sent
			request.queue_free()
			done.call())
		if request.request(String(r.host) + "/health") != OK:
			request.queue_free()
			done.call()
	while pending.n > 0:
		await get_tree().process_frame
	var best := ""
	for code in pings:
		if int(pings[code]) >= 0 and (best == "" or int(pings[code]) < int(pings[best])):
			best = code
	return best

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
