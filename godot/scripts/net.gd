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
## ses comptes, ses saisons, ses raids (deploy/region). Singapour est partie
## d'une COPIE de l'Europe ce jour-la, avec le meme secret de session : un
## compte d'avant la copie existe des deux cotes, puis chacun vit sa vie.
##
## `eu` est l'ancien et unique serveur : un jeton enregistre avant les regions
## est un jeton `eu`, que les autres regions peuvent essayer (session.gd).
const REGIONS: Array[Dictionary] = [
	{"code": "eu", "host": "https://ws.rabbit.rip"},
	{"code": "sg", "host": "https://ws-sg.rabbit.rip"},
	{"code": "us", "host": "https://ws-us.rabbit.rip"},
]
const REGION_PATH := "user://region.cfg"
## Une region qui ne repond pas en ce temps-la est hors course a la sonde.
const PROBE_SECONDS := 2.5
## LA PRESELECTION NE SAUTE PAS pour trois millisecondes : une autre region
## ne la remplace que si elle repond nettement plus vite que celle-ci.
const SWITCH_RATIO := 0.7

signal region_changed(code: String)

## La region jouee. Vide contre un serveur nomme a la main (`--server=`) :
## ce serveur-la n'est aucune des regions.
var region := ""
## Le joueur l'a choisie lui-meme sur l'accueil : la sonde ne la change plus.
var region_manual := false
## Ce que la derniere sonde a trouve de mieux : le lancement suivant y va,
## sans attendre une nouvelle mesure.
var region_best := ""
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
	_load_region()
	return host_of(region if region != "" else "eu")


func host_of(code: String) -> String:
	for r in REGIONS:
		if r.code == code:
			return r.host
	return REGIONS[0].host


## Une region a-t-elle deja ete retenue sur cet appareil ?
func region_chosen() -> bool:
	return region != "" or _override() != ""


## `manual` : le joueur a tape la planche. Sinon c'est la sonde qui choisit,
## et elle pourra rechoisir plus tard.
func choose_region(code: String, manual := false) -> void:
	if _override() != "":
		return
	var moved := code != region
	region = code
	region_manual = region_manual or manual
	HOST = host_of(code)
	_save_region()
	if moved:
		region_changed.emit(code)


func _load_region() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(REGION_PATH) != OK:
		return
	var code := String(cfg.get_value("region", "code", ""))
	for r in REGIONS:
		if r.code == code:
			region = code
	region_manual = bool(cfg.get_value("region", "manual", false))
	region_best = String(cfg.get_value("region", "best", ""))


func _save_region() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("region", "code", region)
	cfg.set_value("region", "manual", region_manual)
	cfg.set_value("region", "best", region_best)
	cfg.save(REGION_PATH)


## LA SONDE : chaque region chronometree en meme temps. Remplit `pings`,
## retient la meilleure dans `region_best` et la rend ("" si aucune n'a
## repondu). Une region pas encore ouverte reste a -1 et ne gagne jamais.
##
## La meilleure ne detrone celle d'aujourd'hui que nettement plus rapide
## (`SWITCH_RATIO`) : un joueur a mi-chemin ne doit pas changer de monde a
## chaque lancement.
func probe() -> String:
	var pending := {"n": REGIONS.size()}
	for r in REGIONS:
		_ping_into(String(r.code), String(r.host), pending)
	while pending.n > 0:
		await get_tree().process_frame
	var best := ""
	for code in pings:
		if int(pings[code]) >= 0 and (best == "" or int(pings[code]) < int(pings[best])):
			best = code
	var here := int(pings.get(region, -1))
	if best != "" and region != "" and here >= 0 and int(pings[best]) > here * SWITCH_RATIO:
		best = region
	if best != "" and _override() == "":
		region_best = best
		_save_region()
	return best


## UN PING, PAS UNE POIGNEE DE MAIN. La premiere requete paie le DNS, le TCP
## et le TLS — trois ou quatre allers-retours, un serveur a 50 ms y lisait
## 200. On en fait donc deux sur la MEME connexion et on garde la seconde.
##
## Hors du web, dans un thread qui regarde toutes les millisecondes : relever
## une fois par image ajoutait deux ou trois images (50 ms lus 88). Le web n'a
## pas toujours de threads ; il relève par image, un client par requete, et
## le navigateur garde la connexion de la premiere.
func _ping_into(code: String, host: String, pending: Dictionary) -> void:
	pings[code] = -1
	if OS.has_feature("web"):
		pings[code] = await _ping_by_frame(host)
	else:
		var box := {"ms": -1, "done": false}
		var worker := Thread.new()
		worker.start(func() -> void:
			box.ms = _ping_blocking(host)
			box.done = true)
		while not box.done:
			await get_tree().process_frame
		worker.wait_to_finish()
		pings[code] = box.ms
	pending.n -= 1


## L'hote, le port et le TLS d'une adresse de region.
func _open(host: String) -> HTTPClient:
	var tls := TLSOptions.client() if host.begins_with("https://") else null
	var bare := host.trim_prefix("https://").trim_prefix("http://")
	var port := 443 if tls != null else 80
	if bare.contains(":"):
		port = int(bare.get_slice(":", 1))
		bare = bare.get_slice(":", 0)
	var c := HTTPClient.new()
	return c if c.connect_to_host(bare, port, tls) == OK else null


## Dans le thread : pas d'arbre, pas d'await — une boucle serree.
func _ping_blocking(host: String) -> int:
	var c := _open(host)
	if c == null:
		return -1
	var deadline := Time.get_ticks_msec() + int(PROBE_SECONDS * 1000.0)
	var ms := -1
	while c.get_status() in [HTTPClient.STATUS_RESOLVING, HTTPClient.STATUS_CONNECTING] \
			and Time.get_ticks_msec() < deadline:
		c.poll()
		OS.delay_usec(1000)
	for i in 2:
		if c.get_status() != HTTPClient.STATUS_CONNECTED:
			break
		var sent := Time.get_ticks_usec()
		if c.request(HTTPClient.METHOD_GET, "/health", []) != OK:
			break
		while c.get_status() == HTTPClient.STATUS_REQUESTING and Time.get_ticks_msec() < deadline:
			c.poll()
			OS.delay_usec(500)
		var got := Time.get_ticks_usec()
		if not c.has_response() or c.get_response_code() != 200:
			break
		while c.get_status() == HTTPClient.STATUS_BODY and Time.get_ticks_msec() < deadline:
			c.poll()
			c.read_response_body_chunk()
			OS.delay_usec(500)
		if i == 1:
			ms = int((got - sent) / 1000)
	c.close()
	return ms


## LE CLIENT WEB SE FERME APRES CHAQUE REPONSE (http_client_web.cpp : fin du
## corps = STATUS_DISCONNECTED), une seconde requete sur le meme client ne
## partait jamais : toutes les regions restaient muettes et la planche
## « Serveur » ne sortait pas. Un client neuf par requete ; c'est le
## navigateur qui garde la connexion, la seconde mesure reste un vrai ping.
func _ping_by_frame(host: String) -> int:
	var deadline := Time.get_ticks_msec() + int(PROBE_SECONDS * 1000.0)
	var ms := -1
	for i in 2:
		var c := _open(host)
		if c == null:
			break
		while c.get_status() in [HTTPClient.STATUS_RESOLVING, HTTPClient.STATUS_CONNECTING] \
				and Time.get_ticks_msec() < deadline:
			c.poll()
			await get_tree().process_frame
		if c.get_status() != HTTPClient.STATUS_CONNECTED:
			c.close()
			break
		var sent := Time.get_ticks_msec()
		if c.request(HTTPClient.METHOD_GET, "/health", []) != OK:
			c.close()
			break
		while c.get_status() == HTTPClient.STATUS_REQUESTING and Time.get_ticks_msec() < deadline:
			c.poll()
			await get_tree().process_frame
		var got := Time.get_ticks_msec()
		if not c.has_response() or c.get_response_code() != 200:
			c.close()
			break
		while c.get_status() == HTTPClient.STATUS_BODY and Time.get_ticks_msec() < deadline:
			c.poll()
			c.read_response_body_chunk()
			await get_tree().process_frame
		c.close()
		if i == 1:
			ms = got - sent
	return ms

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
## Le numero de la derniere ecriture partie : `end` rend sa marque au bouton
## qui l'a demandee (ui/press_ack.gd).
var _ticket := 0
var _ack: PressAck


func _ready() -> void:
	_ack = PressAck.new()
	add_child(_ack)


## TRACE DU BANC : une ligne sur la sortie standard, seulement contre un
## serveur local (`--server=http://localhost...`), jamais contre la prod.
## tools/scenarios/playground.ts la recopie dans out/godot.log.
func trace(msg: String) -> void:
	if HOST.begins_with("http://localhost") or HOST.begins_with("http://127."):
		print("[trace %d] %s" % [Time.get_ticks_msec(), msg])


## Une ecriture part. A appeler par tout HTTPRequest fait a la main (la
## boutique, le raid, le profil), et appariee a `end(ticket)` quoi qu'il
## arrive. Le bouton sous le doigt se marque TOUT DE SUITE (press_ack.gd).
func begin() -> int:
	_ticket += 1
	_in_flight += 1
	if _ack != null:
		_ack.claim(_ticket)
	if _in_flight == 1:
		busy_changed.emit(true)
	return _ticket


func end(ticket: int = 0) -> void:
	if _ack != null:
		_ack.release(ticket)
	_in_flight = maxi(0, _in_flight - 1)
	if _in_flight == 0:
		busy_changed.emit(false)


## L'attente se voit deja sur le bouton qui l'a demandee : la moulinette du
## coin n'a pas a la redire.
func acked() -> bool:
	return _ack != null and _ack.showing()


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
	var ticket := begin() if writes else 0
	var started := request.request(HOST + path, headers, method, body)
	if started != OK:
		request.queue_free()
		if writes:
			end(ticket)
		return Answer.new(0, {})

	var result: Array = await request.request_completed
	request.queue_free()
	if writes:
		end(ticket)

	# result is [result, response_code, headers, body]. A transport failure
	# (no network, DNS, TLS) arrives as a non-OK result with code 0, which
	# Answer reports as "offline" — distinct from a server that refused.
	var code: int = result[1]
	var raw: PackedByteArray = result[3]
	var parsed: Variant = JSON.parse_string(raw.get_string_from_utf8())
	var dict: Dictionary = parsed if parsed is Dictionary else {}
	return Answer.new(code, dict)
