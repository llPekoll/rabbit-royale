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

## Les serveurs de test (branche `stage`), hors des regions : un par monde,
## chacun dans son projet Coolify (2026-11-01). La page web3 du stage est
## stage-sol.rabbit.rip, celle du web2 stage.rabbit.rip.
const STAGE_HOST := "https://ws-stage.rabbit.rip"
const WEB2_STAGE_HOST := "https://ws2-stage.rabbit.rip"

## LES REGIONS : un serveur de jeu sur chaque continent (deploy/region).
## Elles etaient des jeux entiers, chacune ses comptes (2026-10-02) ; depuis
## l'unification (2026-10-23) elles partagent UNE base : un compte, un
## terrier, un classement, et le serveur ne decide plus que du ping — et de
## qui partage l'ile, des voisins. Le plus proche est repris avant chaque
## ile (`settle_for_island`), sauf serveur force dans les reglages.
##
## DEUX MONDES (2026-10-18) : le web3 (Seeker, sol.rabbit.rip/play) et le web2
## (Google Play, App Store, CrazyGames, itch.io) ne se croisent jamais — chaque
## monde a ses serveurs, ses bases, ses comptes, dans les trois regions
## (src/lib/world.ts cote serveur). Un build web2 porte la marque `web2` dans
## les « custom features » de son preset ; SANS marque c'est le web3, donc la
## coque Seeker deja installee n'a rien a changer.
const WEB3_REGIONS: Array[Dictionary] = [
	{"code": "eu", "host": "https://ws.rabbit.rip"},
	{"code": "sg", "host": "https://ws-sg.rabbit.rip"},
	{"code": "us", "host": "https://ws-us.rabbit.rip"},
]
## Les serveurs du monde web2 : conteneurs a part sur les memes machines
## (eu : projet Coolify rabbit-royale-web2 ; sg/us : services *-web2 de
## deploy/region/compose.yml).
const WEB2_REGIONS: Array[Dictionary] = [
	{"code": "eu", "host": "https://ws2.rabbit.rip"},
	{"code": "sg", "host": "https://ws2-sg.rabbit.rip"},
	{"code": "us", "host": "https://ws2-us.rabbit.rip"},
]
## Le monde de CE build. Lu avant `_init` (initialiseur de membre) : `_host`
## en a besoin.
var WORLD := _world()
var REGIONS: Array[Dictionary] = WEB2_REGIONS if WORLD == "web2" else WEB3_REGIONS
const REGION_PATH := "user://region.cfg"
## Une region qui ne repond pas en ce temps-la est hors course a la sonde.
const PROBE_SECONDS := 2.5
## Avant une ile, on n'attend pas si longtemps : une region muette ne doit pas
## retenir le joueur sur la plage.
const ISLAND_PROBE_SECONDS := 1.2
## Une mesure plus jeune que ca sert telle quelle avant une ile.
const PROBE_FRESH_MSEC := 60_000
## LA PRESELECTION NE SAUTE PAS pour trois millisecondes : une autre region
## ne la remplace que si elle repond nettement plus vite que celle-ci.
const SWITCH_RATIO := 0.7

signal region_changed(code: String)

## La region jouee. Vide contre un serveur nomme a la main (`--server=`) :
## ce serveur-la n'est aucune des regions.
var region := ""
## Le joueur l'a forcee dans les reglages (« Serveur ») : la sonde ne la
## change plus. Faux = Auto.
var region_manual := false
## Ce que la derniere sonde a trouve de mieux : le lancement suivant y va,
## sans attendre une nouvelle mesure.
var region_best := ""
## Le dernier aller-retour mesure vers chaque region, en ms ; -1 = muette.
var pings: Dictionary = {}
## Quand la derniere sonde est revenue (ticks ms), -1 = jamais.
var probed_at := -1


func _init() -> void:
	# `-- --regions=eu=http://localhost:3041,sg=http://localhost:3042` : des
	# serveurs locaux en guise de regions, pour voir le jeu en changer. Outil,
	# pas comportement : rien sans l'argument.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--regions="):
			var local: Array[Dictionary] = []
			for pair in arg.trim_prefix("--regions=").split(","):
				local.append({"code": pair.get_slice("=", 0), "host": pair.get_slice("=", 1)})
			REGIONS = local
	HOST = _host()


static func _override() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--server="):
			return arg.trim_prefix("--server=").trim_suffix("/")
	# LE STAGE (2026-10-16) : une page servie par stage.rabbit.rip (web2) ou
	# stage-sol.rabbit.rip (web3) parle au serveur de stage de SON monde, sur
	# sa propre base. L'APK de stage, lui, passe `--server=` dans ses arguments.
	if OS.has_feature("web") and str(JavaScriptBridge.eval("location.hostname", true)).begins_with("stage"):
		return WEB2_STAGE_HOST if _world() == "web2" else STAGE_HOST
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


## `manual` : le joueur l'a forcee (`set_server_pick`). Sinon c'est la sonde
## qui choisit, et elle pourra rechoisir plus tard.
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
	# UN CHOIX FAIT SUR L'ANCIENNE PLANCHE disait « quel monde, quel compte » ;
	# depuis l'unification (2026-10-23) il ne dit plus que le ping. Il repart
	# en Auto, une fois — le reglage « Serveur » le refige si on veut.
	if not bool(cfg.get_value("region", "unified", false)):
		region_manual = false


func _save_region() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("region", "code", region)
	cfg.set_value("region", "manual", region_manual)
	cfg.set_value("region", "best", region_best)
	cfg.set_value("region", "unified", true)
	cfg.save(REGION_PATH)


## LE REGLAGE « SERVEUR » (2026-10-23) : `auto`, le plus proche avant chaque
## ile, ou le code d'une region, forcee — si la mesure se trompe (un reseau
## qui ment sur le ping, un VPN).
func server_pick() -> String:
	return region if region_manual and region != "" else "auto"


func set_server_pick(pick: String) -> void:
	if _override() != "":
		return
	if pick != "auto":
		region_manual = true
		choose_region(pick, true)
		return
	# Auto : le plus proche sera repris a la prochaine ile, ou tout de suite
	# par qui appelle `settle_for_island`.
	region_manual = false
	_save_region()


## AVANT CHAQUE ILE (2026-10-23) : en Auto, le serveur le plus proche a cet
## instant. Une mesure de moins d'une minute sert telle quelle ; plus vieille,
## on remesure, en ne laissant qu'ISLAND_PROBE_SECONDS a chaque region. Les
## comptes etant communs, changer de serveur ne change que l'ile : la socket
## suit (game_socket.gd), le terrier reste le meme. Vrai si le serveur change.
func settle_for_island() -> bool:
	if _override() != "" or region_manual:
		return false
	if probed_at < 0 or Time.get_ticks_msec() - probed_at > PROBE_FRESH_MSEC:
		await probe(ISLAND_PROBE_SECONDS)
	if region_manual or region_best == "" or region_best == region:
		return false
	choose_region(region_best)
	return true


## LA SONDE : chaque region chronometree en meme temps. Remplit `pings`,
## retient la meilleure dans `region_best` et la rend ("" si aucune n'a
## repondu). Une region pas encore ouverte reste a -1 et ne gagne jamais.
##
## La meilleure ne detrone celle d'aujourd'hui que nettement plus rapide
## (`SWITCH_RATIO`) : un joueur a mi-chemin ne doit pas changer de monde a
## chaque lancement.
func probe(seconds := PROBE_SECONDS) -> String:
	var pending := {"n": REGIONS.size()}
	for r in REGIONS:
		_ping_into(String(r.code), String(r.host), pending, seconds)
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
	probed_at = Time.get_ticks_msec()
	return best


## UN PING, PAS UNE POIGNEE DE MAIN. La premiere requete paie le DNS, le TCP
## et le TLS — trois ou quatre allers-retours, un serveur a 50 ms y lisait
## 200. On en fait donc deux sur la MEME connexion et on garde la seconde.
##
## Hors du web, dans un thread qui regarde toutes les millisecondes : relever
## une fois par image ajoutait deux ou trois images (50 ms lus 88). Le web n'a
## pas toujours de threads ; il relève par image, un client par requete, et
## le navigateur garde la connexion de la premiere.
func _ping_into(code: String, host: String, pending: Dictionary, seconds: float) -> void:
	pings[code] = -1
	if OS.has_feature("web"):
		pings[code] = await _ping_by_frame(host, seconds)
	else:
		var box := {"ms": -1, "done": false}
		var worker := Thread.new()
		worker.start(func() -> void:
			box.ms = _ping_blocking(host, seconds)
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
func _ping_blocking(host: String, seconds: float) -> int:
	var c := _open(host)
	if c == null:
		return -1
	var deadline := Time.get_ticks_msec() + int(seconds * 1000.0)
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
func _ping_by_frame(host: String, seconds: float) -> int:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000.0)
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


## GET, with the session token if there is one. `timeout` only for a route
## that holds the request open on purpose (/api/auth/handoff, ~20 s).
func get_json(path: String, token: String = "", timeout: float = TIMEOUT_SECONDS) -> Answer:
	return await _send(path, HTTPClient.METHOD_GET, {}, token, timeout)


## POST, with the session token if there is one. An empty `payload` still sends
## `{}` rather than no body: the routes parse JSON and a missing body reads as
## a malformed one.
func post_json(path: String, payload: Dictionary = {}, token: String = "") -> Answer:
	return await _send(path, HTTPClient.METHOD_POST, payload, token)


## PUT / PATCH / DELETE, with a JSON body where the method carries one.
func send_json(path: String, method: int, payload: Dictionary = {}, token: String = "") -> Answer:
	return await _send(path, method, payload, token)


func _send(path: String, method: int, payload: Dictionary, token: String,
		timeout: float = TIMEOUT_SECONDS) -> Answer:
	# LE MODE VOYAGEUR repond lui-meme, sans reseau (voyageur.gd).
	if Voyageur.active:
		return await Voyageur.serve(path, method, payload)
	var request := HTTPRequest.new()
	request.timeout = timeout
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


## La marque du build, ou `--world=web2` sur le bureau pour essayer le monde
## web2 sans exporter (avec `--server=https://ws2.rabbit.rip`).
static func _world() -> String:
	if OS.has_feature("web2") or "--world=web2" in OS.get_cmdline_user_args():
		return "web2"
	return "web3"
