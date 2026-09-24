extends Node
## LA SOCKET DU JEU — l'île en direct.
##
## Portée de src/components/use-game-socket.ts, dont elle garde les décisions
## qui comptent. Le serveur ne change pas d'une ligne : c'est le même
## Socket.IO v4 que le client web, le même JWT au handshake, les mêmes
## événements.
##
## LE TRANSPORT EST EMPRUNTÉ, LA POLITIQUE EST À NOUS. addons/godot-socketio
## (MIT, vendorisé) sait parler Engine.IO v4 et Socket.IO v5 ; il ne sait pas
## qu'une reconnexion doit rejouer un jeton ni qu'une souscription meurt avec
## la socket. Ces deux règles-là sont propres au jeu, donc elles vivent ici
## plutôt que dans du code tiers qu'on aurait à re-patcher à chaque mise à jour.
##
## CE QUI EST REJOUÉ À CHAQUE (RE)CONNEXION, et pourquoi :
##   • le JWT, parce que le CONNECT est ce qui authentifie ;
##   • la place demandée, parce qu'un siège tenu avant la coupure se reprend ;
##   • les présences suivies, parce qu'un abonnement vit sur la socket du
##     SERVEUR — une reconnexion le perd, et le journal des raids se fige sur
##     ce qu'il a entendu en dernier.

## Là où vit le jeu. Le client web lit cette adresse de /api/config, qui répond
## "" — c'est-à-dire "la même origine que moi". Un client natif n'a pas
## d'origine, donc il nomme l'hôte, et c'est le même que celui de Net.
##
## HTTPS, PAS WSS, et ce n'est pas une inattention : Engine.IO ouvre par un
## handshake HTTP en long-polling, puis demande lui-même l'upgrade vers le
## WebSocket en réécrivant le schéma. Donner "wss://" ici fait échouer ce
## premier appel sur "Invalid URL scheme" — HTTPRequest ne connaît pas ce
## schéma — et la socket ne s'ouvre jamais.
## Celui de Net, qui sait lire `--server=` pour un serveur local.
var HOST: String = Net.HOST

## L'attente avant de retenter, et son plafond.
##
## Elle DOUBLE à chaque échec : un serveur qui redémarre n'a pas besoin d'être
## martelé, et un téléphone qui a vraiment perdu le réseau ne doit pas vider sa
## batterie à réessayer chaque seconde. Le plafond existe pour qu'un joueur qui
## retrouve du signal au bout d'une heure revienne en trente secondes, pas en
## une demi-heure de plus.
const RETRY_FIRST_SECONDS := 1.0
const RETRY_MAX_SECONDS := 30.0

signal connected
signal dropped
## Un événement du serveur, nom et charge utile déjà déballés.
signal event(name: String, data: Variant)

var _io: SocketIO
var _retry_seconds := RETRY_FIRST_SECONDS
var _retry_timer: Timer
var _live := false
## Le CONNECT Socket.IO a-t-il été accepté ? Voir `is_live()`.
var _namespace_ready := false

## CE QUI DOIT SURVIVRE À UNE COUPURE. Rejoué dans cet ordre au `connect`.
var _want_seat := false
var _seat_choice: Variant = null
var _spectating := ""
var _followed: Array = []


func _ready() -> void:
	_io = SocketIO.new()
	# Pas de connexion au montage : elle a besoin d'un jeton, et à cette
	# seconde la session n'est pas encore restaurée.
	_io.autoconnect = false
	_io.base_url = HOST
	_io.socket_path = "/socket.io"
	add_child(_io)

	_io.socket_connected.connect(_on_connected)
	_io.socket_disconnected.connect(_on_disconnected)
	_io.event_received.connect(_on_event)
	_io.namespace_connection_error.connect(_on_refused)

	_retry_timer = Timer.new()
	_retry_timer.one_shot = true
	_retry_timer.timeout.connect(_attempt)
	add_child(_retry_timer)

	# Une session qui change — connexion, déconnexion, invité qui lie son
	# wallet — est une socket à refaire : le jeton du handshake n'est plus
	# celui que le serveur nous connaît.
	Session.changed.connect(_on_session_changed)


## Ouvre la socket avec le jeton de la session. Sans jeton il n'y a rien à
## ouvrir : le serveur refuserait le CONNECT.
func start() -> void:
	if Session.token.is_empty():
		return
	_live = true
	_retry_seconds = RETRY_FIRST_SECONDS
	_attempt()


## Ferme, et ne retente pas. C'est une fermeture VOULUE — une déconnexion, un
## changement de compte — par opposition à une coupure, qui elle rappelle.
func stop() -> void:
	_live = false
	_namespace_ready = false
	_retry_timer.stop()
	if _io.state == EngineIO.State.CONNECTED:
		_io.disconnect_socket()


## Peut-on ÉMETTRE, là, maintenant ?
##
## Le transport connecté ne suffit pas : Engine.IO peut être ouvert alors que
## le CONNECT Socket.IO n'a pas encore été accepté, et dans cette fenêtre
## `emit` refuse le paquet avec "namespace is not connected" — sans rien dire
## à l'appelant. Un `join` lancé juste après `start()` tombait donc dans le
## vide, et le joueur restait devant une île où il ne s'asseyait jamais.
##
## La question qui compte est celle du NAMESPACE, et c'est le signal
## `socket_connected` qui la tranche — d'où le drapeau plutôt qu'une lecture
## de l'état du transport.
func is_live() -> bool:
	return _io != null and _namespace_ready


func _attempt() -> void:
	if not _live or Session.token.is_empty():
		return
	if _io.state == EngineIO.State.CONNECTED:
		return
	# LE JETON EST LU MAINTENANT, pas mémorisé au premier appel : entre la
	# coupure et cette reprise, un invité a pu lier son wallet, et le serveur a
	# alors réémis un jeton. Rejouer l'ancien ferait refuser le CONNECT.
	_io.connect_socket({"token": Session.token})


## Reconnecté. Tout ce que le serveur a oublié est renvoyé ici.
func _on_connected(_ns: String) -> void:
	_namespace_ready = true
	_retry_seconds = RETRY_FIRST_SECONDS
	connected.emit()

	if not _spectating.is_empty():
		# On regarde, on ne joue pas : le siège voulu avant ne l'est plus.
		_want_seat = false
		_io.emit("spectate", {"playerId": _spectating})
	elif _want_seat:
		_io.emit("join", _seat_choice)

	# L'abonnement vit sur la socket du SERVEUR, donc il est mort avec elle.
	if not _followed.is_empty():
		_io.emit("watch_presence", _followed)


func _on_disconnected() -> void:
	_namespace_ready = false
	dropped.emit()
	_schedule_retry()


## Un CONNECT refusé, ce qui veut presque toujours dire un jeton mort.
##
## Sans jeton neuf, réessayer est inutile : le refus ne se guérit pas tout
## seul. On demande à la session de se vérifier — si le jeton est vraiment
## refusé elle l'oubliera, et le joueur repassera par la porte.
func _on_refused(_ns: String, data: Variant) -> void:
	push_warning("[socket] CONNECT refusé: %s" % str(data))
	_namespace_ready = false
	dropped.emit()
	await Session.restore()
	if Session.signed_in():
		_schedule_retry()
	else:
		_live = false


func _schedule_retry() -> void:
	if not _live:
		return
	_retry_timer.start(_retry_seconds)
	_retry_seconds = minf(_retry_seconds * 2.0, RETRY_MAX_SECONDS)


## L'addon livre TOUJOURS un tableau d'arguments, même pour un seul. Le jeu
## veut la valeur, donc elle est déballée ici une fois pour toutes plutôt que
## par chaque écran qui écoute.
func _on_event(name: String, data: Variant, _ns: String) -> void:
	var payload: Variant = null
	if data is Array and not (data as Array).is_empty():
		payload = (data as Array)[0]
	event.emit(name, payload)


func _on_session_changed() -> void:
	if Session.signed_in():
		if not is_live():
			start()
	else:
		stop()


## DEMANDER UNE PLACE sur une île.
##
## Le souhait est retenu même sans socket : `_on_connected` l'enverra. C'est ce
## qui rend une reprise transparente — le joueur qui a perdu le réseau en
## pleine partie retrouve son siège sans rien retoucher.
func join(choice: Variant = null) -> void:
	_want_seat = true
	_spectating = ""
	_seat_choice = choice
	if is_live():
		_io.emit("join", choice)


func leave() -> void:
	_want_seat = false
	_seat_choice = null
	# Un spectateur qui s'en va ne doit pas etre rejoue a la reconnexion.
	_spectating = ""
	if is_live():
		_io.emit("leave")


## Un pas, un drapeau, un éclair, une bombe : tout ce qui se joue à la tuile.
## Aucun n'attend de réponse directe — le serveur répond par un événement à
## tout le monde, ce qui est exactement ce qu'il faut pour que les autres
## lapins voient le coup.
func act(what: String, tile: int) -> void:
	if is_live():
		_io.emit(what, {"tile": tile})


## SUIVRE DES PRÉSENCES. La liste est gardée pour être rejouée après une
## coupure — sans quoi les points du journal des raids se figent.
func watch_presence(ids: Array) -> void:
	_followed = ids.duplicate()
	if is_live() and not _followed.is_empty():
		_io.emit("watch_presence", _followed)


func unwatch_presence() -> void:
	_followed.clear()
	if is_live():
		_io.emit("unwatch_presence")


func spectate(player_id: String) -> void:
	_spectating = player_id
	_want_seat = false
	if is_live():
		_io.emit("spectate", {"playerId": player_id})
