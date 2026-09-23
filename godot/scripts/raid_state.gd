class_name RaidState
extends Node
## LE RAID, DES DEUX COTES DE LA PORTE — ce que le serveur en dit, et ce
## qu'on lui demande.
##
## Porte de src/components/use-raid.ts (l'attaquant : la liste des cibles,
## entrer, avancer, partir) et de use-incoming-raid.ts (le defenseur : le
## raid qu'on subit, et l'eclair), plus le bout de page.tsx qui decide ce
## qu'un raid fini declenche (la ceremonie, ou le retour muet). UN SEUL
## exemplaire, partage : la liste, le HUD du raid, le HUD de defense et le
## plateau lisent tous ce noeud, et une lecture les met d'accord d'un coup.
##
## LE CLIENT NE TIENT AUCUN ETAT DE JEU A LUI. Chaque reponse porte le raid
## ENTIER — ou l'on est, ce qu'on voit, ou l'on peut aller — et le client
## dessine ce qu'on lui a dit en dernier, sans jamais rien avancer lui-meme.
## C'est la regle de l'ile aussi : un raid decide qui perd des carottes, et
## un client qui pourrait deplacer son propre lapin irait au champ gratis.
##
## POUSSE, JAMAIS SONDE. Un raid n'est pas relu en boucle : la seule chose
## qui puisse lui arriver entre deux de nos requetes — l'eclair du defenseur
## — arrive sur la socket (`raid_struck`), et on relit UNE fois dessus. Cote
## defenseur, chaque changement du raid qu'on subit est pousse en
## `raid_incoming` ; la seule lecture qu'on fait seul est celle de l'arrivee
## sur le terrier, pour le cas qu'une poussee ne couvre pas.
##
## CREE A LA DEMANDE, pas en autoload : project.godot n'est pas a nous, et un
## noeud qui s'accroche a la racine la premiere fois qu'on le nomme rend le
## meme service. `RaidState.current` suffit partout.

## Le raid en cours, la liste ou `busy` ont change. Un ecouteur relit ce
## qu'il veut sur `raid`, `targets`, `busy`, `note`.
signal changed

## La liste des cibles vient d'etre relue (le compte a rebours des boucliers
## repart de zero — raid-panel.tsx `setElapsed(0)`).
signal targets_changed

## Un piege vient de sauter sous le raider, sur cette case — pour que le
## plateau joue l'explosion une fois.
signal sprung(tile: int)

## Le raid vient de finir (gagne, a sec, ou foudroye). `outcome` est vide
## apres une relecture : il ne voyage que sur la reponse qui a fini le raid.
signal finished(raid: Dictionary, outcome: Dictionary)

## Le raid qu'on SUBIT a change (arrive, avance, fini, disparu), ou le compte
## d'eclairs en poche.
signal incoming_changed

## Une phrase a montrer, et si c'est un refus. Le chrome la pose en pastille ;
## la liste et le HUD la gardent aussi sous la main (`note`).
signal noted(text: String, refused: bool)

## Combien de temps un raid fini reste sur le plateau avant le retour — la
## danse du lapin sur le champ, ou sa chute (page.tsx RAID_OVER_MS).
const RAID_OVER_SECONDS := 2.0
## Le meme, pour un raid fini par l'eclair du defenseur : le temps que le
## choc se joue — eclair, arret, chute, le corps laisse un instant
## (page.tsx RAID_STRUCK_OVER_MS).
const RAID_STRUCK_OVER_SECONDS := 4.4
## A SEC : le coup, le sommeil, le gris et « OUT OF ENERGY » (burrow.gd,
## drain.gd) ont besoin d'un peu plus que la danse pour se lire.
const RAID_DRY_OVER_SECONDS := 2.9

## Les trois presences d'un proprietaire, dans l'ordre ou un raider les
## classe : `away` est une promenade, `home` la porte a eviter, `digging` la
## chasse (use-raid.ts `Presence`).
const AWAY := "away"
const HOME := "home"
const DIGGING := "digging"

static var _instance: RaidState

## L'exemplaire vivant, cree et accroche a la racine la premiere fois qu'on
## le lit. `call_deferred`, parce que le premier a le nommer est souvent un
## `_ready` — et la racine refuse un `add_child` pendant qu'elle installe
## ses propres enfants.
static var current: RaidState:
	get:
		if _instance == null:
			_instance = RaidState.new()
			_instance.name = "RaidState"
			var tree := Engine.get_main_loop() as SceneTree
			if tree != null:
				tree.root.add_child.call_deferred(_instance)
		return _instance

## Le raid en cours (use-raid.ts `RaidState`), ou vide : raidId, defender
## {id, name, avatar, level}, tile, energy, tank, trapsSprung, view, walked,
## steps, smoked, finished, succeeded, carrotsLooted, struck.
var raid: Dictionary = {}
## Les cibles (use-raid.ts `Target`) : id, name, avatar, stock, garden,
## shielded, shieldedFor, presence, digging. Classees par le serveur.
var targets: Array = []
## Ce que la reponse qui a fini le raid a dit : reachedField, refunded, loot,
## damage, progress. Vide le reste du temps.
var outcome: Dictionary = {}
## Le dernier refus, dans les mots du joueur — ce que le pied de la liste et
## le HUD affichent a la place du brief. Vide quand il n'y a rien a dire.
var note := ""
## Vrai pendant une requete — les boutons qui entrent ou avancent se grisent.
var busy := false

## Le raid qu'on SUBIT (lib/game/defence.ts `DefenderRaidView`), ou vide :
## raidId, attacker {id, name, avatar}, tile, energy, walked, trapsSprung,
## finished, succeeded, struck, carrotsLooted, startedAt.
var incoming: Dictionary = {}
## Vrai pendant qu'un eclair part.
var striking := false
## Le code du dernier refus d'eclair, deja traduit (defend-hud `note`).
var refusal := ""
## Les eclairs en poche — la boutique (`/api/shop` items) est la seule a les
## compter ; relus quand un raid arrive et apres chaque eclair.
var lightning_held := 0

## Ou se tiennent les cibles suivies, par id, tenu a jour par la socket
## (`presence_all` repond a l'abonnement, `presence` le corrige un id a la
## fois). Un id absent se lit `away`, ce qu'est un inconnu.
var presence: Dictionary = {}

## Le raid foudroye que le joueur a deja quitte. Le serveur continue de le
## repondre un moment (RAID_RUN.STRUCK_SHOWN_MS) pour etre sur que le raider
## le voie ; une fois vu, la meme reponse ne doit pas le remettre sur ce
## plateau a chaque relecture de la liste.
var _dismissed := ""
## Le raid dont la fin a deja ete jouee, pour qu'une relecture ne la rejoue pas.
var _finished_seen := ""
## Le banc : rien ne touche au reseau.
var _faked := false
## Le raid subi fini reste affiche le temps d'etre vu, puis s'efface.
var _ended_timer: Timer


func _ready() -> void:
	_ended_timer = Timer.new()
	_ended_timer.one_shot = true
	_ended_timer.timeout.connect(_forget_ended)
	add_child(_ended_timer)

	GameSocket.event.connect(_on_socket_event)
	Session.changed.connect(_on_session_changed)
	Screens.moved.connect(_on_moved)
	I18N.locale_changed.connect(_on_locale_changed)
	# Ce que le raid dit va la ou le terrier pose ses phrases : la pastille
	# sous la barre du haut. Le chrome n'a pas a nous connaitre.
	noted.connect(_toast)


func _toast(text: String, refused: bool) -> void:
	if Chrome.current != null:
		Chrome.current.toast(text, refused)


# ── L'attaquant ──────────────────────────────────────────────────────────────

func has_raid() -> bool:
	return not raid.is_empty()


## RELIRE ce qui est vrai maintenant : un raid en cours, ou la liste des
## cibles (`GET /api/raid`). Silencieux sur une panne — ce qu'on a a l'ecran
## reste vrai.
func refresh() -> void:
	if _faked or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/raid", Session.token)
	if not answer.ok or answer.body.has("error"):
		return
	var next: Dictionary = answer.body.get("raid", {}) if answer.body.get("raid") is Dictionary else {}
	if bool(next.get("finished", false)) and String(next.get("raidId", "")) == _dismissed:
		_adopt_raid({})
	elif not _same_raid(raid, next):
		_adopt_raid(next)
	if answer.body.get("targets") is Array:
		targets = answer.body["targets"]
		targets_changed.emit()
		changed.emit()
		# Les cibles sont SUIVIES : la liste dit ou chacune se tient au moment
		# de la lecture, la socket le corrige tant que la liste vit.
		var ids: Array = []
		for t in targets:
			ids.append(String(t.get("id", "")))
		GameSocket.watch_presence(ids)


## ENTRER dans un terrier (`POST /api/raid {defenderId}`).
func enter(defender_id: String) -> void:
	if _faked or busy or not Session.signed_in():
		return
	busy = true
	note = ""
	outcome = {}
	changed.emit()
	var answer: Answer = await Net.post_json("/api/raid", {"defenderId": defender_id}, Session.token)
	busy = false
	var res := answer.body
	if res.has("error") or not answer.ok:
		_refuse(answer)
		# Un raid deja en cours revient AVEC ce raid : le joueur y est remis
		# plutot que sermonne et laisse nulle part.
		if res.get("raid") is Dictionary:
			_adopt_raid(res["raid"])
		changed.emit()
		return
	_adopt_raid(res.get("raid", {}) if res.get("raid") is Dictionary else {})


## AVANCER d'une case (`PATCH /api/raid {tile}`). Le plateau appelle ceci ;
## la reponse porte le raid entier, et l'issue s'il vient de finir.
func step(tile: int) -> void:
	if _faked or busy or not Session.signed_in():
		return
	busy = true
	note = ""
	changed.emit()
	var answer: Answer = await _send("/api/raid", HTTPClient.METHOD_PATCH, {"tile": tile})
	busy = false
	var res := answer.body
	if res.has("error") or not answer.ok:
		_refuse(answer)
		changed.emit()
		return
	if bool(res.get("sprungTrap", false)):
		sprung.emit(tile)
	if res.get("outcome") is Dictionary:
		outcome = res["outcome"]
	_adopt_raid(res.get("raid", {}) if res.get("raid") is Dictionary else {})


## PARTIR — fini, ou abandonne a mi-chemin (`DELETE /api/raid`).
##
## Le DELETE est ce qui manquait au web : n'effacer que l'etat local laissait
## la course ouverte cote serveur, et le raid suivant repondait
## `raid_in_progress` pour toujours. L'etat local est efface D'ABORD pour que
## le plateau redescende tout de suite — la requete est une formalite que le
## joueur n'a pas a regarder. `refresh` recharge ensuite la liste, la ou
## partir est cense atterrir.
func leave() -> void:
	if bool(raid.get("struck", false)):
		_dismissed = String(raid.get("raidId", ""))
	# LE PREMIER PAS A PAYE LA TRAVERSEE (api/raid PATCH, `payCrossing`) : un
	# repli apres lui rentre avec une jauge plus basse, qu'il faut aller lire
	# (page.tsx `raidCharged`). Sans pas, rien n'a ete pris.
	var paid := (raid.get("walked", []) as Array).size() >= 2
	raid = {}
	outcome = {}
	note = ""
	changed.emit()
	if _faked or not Session.signed_in():
		return
	await _send("/api/raid", HTTPClient.METHOD_DELETE, {})
	if paid:
		Home.refresh()
	refresh()


## La liste se ferme : son refus n'a plus a etre garde (page.tsx
## `raid.setNote(null)` a la fermeture).
func clear_note() -> void:
	note = ""
	changed.emit()


## Ou se tient le proprietaire d'une cible, quel que soit l'age du serveur
## (use-raid.ts `presenceOf`), corrige par la socket si elle a parle depuis.
func presence_of(target: Dictionary) -> String:
	var id := String(target.get("id", ""))
	if presence.has(id):
		return String(presence[id])
	var where := String(target.get("presence", ""))
	if not where.is_empty():
		return where
	return DIGGING if bool(target.get("digging", false)) else AWAY


## Le refus, dans les mots du joueur : le serveur envoie un code, jamais une
## phrase, parce qu'il ne sait pas laquelle des quatre langues on lit.
func _refuse(answer: Answer) -> void:
	var code := answer.error()
	if code == "offline":
		note = I18N.t("err_offline")
	else:
		var path := "raidErrors." + code
		var words := I18N.t(path)
		note = words if words != path else I18N.t("raidErrors.fallback")
	noted.emit(note, true)


## Deux lectures du meme raid dessinent-elles le meme plateau ? Une relecture
## qui rend une copie identique ne doit pas reconstruire ce que le joueur
## regarde (use-raid.ts `sameRaid`).
func _same_raid(a: Dictionary, b: Dictionary) -> bool:
	if a.is_empty() or b.is_empty():
		return a.is_empty() and b.is_empty()
	for key in ["raidId", "tile", "energy", "trapsSprung", "finished", "succeeded", "smoked"]:
		if a.get(key) != b.get(key):
			return false
	if bool(a.get("struck", false)) != bool(b.get("struck", false)):
		return false
	for key in ["view", "walked", "steps"]:
		if (a.get(key, []) as Array).size() != (b.get(key, []) as Array).size():
			return false
	return true


func _adopt_raid(next: Dictionary) -> void:
	raid = next
	changed.emit()
	if next.is_empty() or not bool(next.get("finished", false)):
		return
	var id := String(next.get("raidId", ""))
	if id == _finished_seen:
		return
	_finished_seen = id
	_on_finished(next)


## CE QU'UN RAID FINI DECLENCHE (page.tsx, l'effet sur `finishedRaidId`).
##
## LA VICTOIRE A SA CEREMONIE ; une defaite garde la sortie discrete. Le
## plateau joue sa danse, puis la scene monte par-dessus ; le retour attend
## que le joueur la congedie — rentrer tout seul sous une ceremonie qu'il lit
## encore est l'interruption que la scene existe pour eviter. Une DEFAITE
## rentre seule, avec la nouvelle en pastille : dire JUSQU'OU, parce qu'un
## raid se note a la profondeur et « rien pris » seul se lit comme si rien ne
## s'etait passe.
func _on_finished(r: Dictionary) -> void:
	var id := String(r.get("raidId", ""))
	finished.emit(r, outcome)
	# Le butin est en base — aller lire le total. Le compteur du terrier est
	# lu, pas pousse, et un raid fini ne le relisait jamais.
	Home.refresh()

	var won := bool(r.get("succeeded", false))
	var defender: Dictionary = r.get("defender", {}) if r.get("defender") is Dictionary else {}
	var name := String(defender.get("name", ""))
	if won:
		await get_tree().create_timer(RAID_OVER_SECONDS).timeout
		# Parti entre-temps : la scene n'a plus rien a celebrer.
		if String(raid.get("raidId", "")) != id:
			return
		var stage := RaidVictory.present({
			"defender": name,
			"carrots": int(r.get("carrotsLooted", 0)),
			"trapsSprung": int(r.get("trapsSprung", 0)),
			"refunded": int(outcome.get("refunded", 0)),
			"avatar": _my_avatar(),
		})
		# Pas de pastille au retour : la scene vient de passer un plein ecran
		# a dire ce qui a ete pris.
		stage.dismissed.connect(leave)
		return

	var looted := int(r.get("carrotsLooted", 0))
	var haul := ""
	if looted > 0:
		haul = I18N.f("raid.stolen", [I18N.group_digits(looted), name])
	elif bool(r.get("struck", false)):
		haul = I18N.f("raid.struckBy", [name])
	else:
		haul = I18N.f("raid.fellShort", [int(round(float(outcome.get("progress", 0.0)) * 100.0)), name])
	var over := RAID_STRUCK_OVER_SECONDS if bool(r.get("struck", false)) else RAID_DRY_OVER_SECONDS
	await get_tree().create_timer(over).timeout
	if String(raid.get("raidId", "")) != id:
		return
	leave()
	noted.emit(haul, false)


## Le lapin du joueur, pour la scene : `players.avatar`, tel que /api/auth/me
## le rend dans `player`. Vide -> le brun, celui de qui n'a jamais choisi.
func _my_avatar() -> String:
	var key: Variant = Home.player.get("avatar", Session.player.get("avatar", ""))
	return String(key) if key is String else ""


# ── Le defenseur ─────────────────────────────────────────────────────────────

func has_incoming() -> bool:
	return not incoming.is_empty()


## UNE LECTURE A L'ARRIVEE sur le terrier (`GET /api/raid/incoming`), pour le
## cas qu'une poussee ne couvre pas : le proprietaire qui ouvre son terrier
## alors qu'un raid est deja en cours. Pas un sondage : aucun intervalle.
func refresh_incoming() -> void:
	if _faked or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/raid/incoming", Session.token)
	if not answer.ok or answer.body.has("error"):
		return
	_accept_incoming(answer.body.get("raid", {}) if answer.body.get("raid") is Dictionary else {})


## Hors du terrier, l'image est perimee par definition : on l'oublie, pour
## que revenir n'ouvre pas sur un raid fini pendant qu'on etait ailleurs.
func forget_incoming() -> void:
	_ended_timer.stop()
	if incoming.is_empty():
		return
	incoming = {}
	incoming_changed.emit()


## APPELER L'ECLAIR (`POST /api/raid/strike`). Vrai si le coup a porte. La
## reponse porte le raid tel qu'il est maintenant (fini, foudroye), prise
## comme une lecture parmi les autres.
func strike() -> bool:
	if _faked or striking or not Session.signed_in():
		return false
	striking = true
	refusal = ""
	incoming_changed.emit()
	var answer: Answer = await Net.post_json("/api/raid/strike", {}, Session.token)
	striking = false
	if answer.body.has("error") or not answer.ok:
		var code := answer.error()
		if code == "offline":
			refusal = I18N.t("err_offline")
		else:
			var words := I18N.t("raidErrors." + code)
			refusal = words if words != "raidErrors." + code else I18N.t("raidErrors.fallback")
		noted.emit(refusal, true)
		incoming_changed.emit()
		return false
	_accept_incoming(answer.body.get("raid", {}) if answer.body.get("raid") is Dictionary else {})
	refresh_holdings()
	return true


## Les eclairs en poche, relus a la boutique : c'est la seule qui les compte
## (page.tsx `shop.shop.items.find(kind === 'lightning').held`).
func refresh_holdings() -> void:
	if _faked or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/shop", Session.token)
	if not answer.ok or not (answer.body.get("items") is Array):
		return
	for item in answer.body["items"]:
		if item is Dictionary and String(item.get("kind", "")) == "lightning":
			lightning_held = int(item.get("held", 0))
	incoming_changed.emit()


## Prendre une lecture, d'ou qu'elle vienne (use-incoming-raid.ts `accept`).
## Un raid fini reste le temps d'etre vu finir, puis s'en va — le meme
## battement que la lecture unique honore cote serveur (ENDED_SHOWN_MS).
## Le dernier raid subi dont la fin a sonne : une fin se relit plusieurs fois
## (le sondage, la socket), elle ne sonne qu'une.
var _ended_heard := ""


func _accept_incoming(next: Dictionary) -> void:
	_ended_timer.stop()
	var arrived := incoming.is_empty() and not next.is_empty()
	if not _same_incoming(incoming, next):
		incoming = next
		incoming_changed.emit()
	if not next.is_empty() and bool(next.get("finished", false)):
		_ended_timer.start(Tuning.i("RAID_RUN.ENDED_SHOWN_MS", 10000) / 1000.0)
		# LA FIN, UNE FOIS par raid, et elle s'entend (page.tsx) : le pillard
		# a pris, ca tombe ; il est reparti les mains vides, ca carillonne.
		var id := String(next.get("raidId", ""))
		if id != _ended_heard:
			_ended_heard = id
			Sound.play("die" if bool(next.get("succeeded", false)) else "chime")
	if arrived:
		# Quelqu'un entre chez soi : ca saute.
		Sound.play("explosion")
		# Le proprietaire apprend qu'on entre chez lui, et combien d'eclairs
		# il lui reste pour repondre.
		var attacker: Dictionary = next.get("attacker", {}) if next.get("attacker") is Dictionary else {}
		noted.emit(I18N.f("defend.incoming", [String(attacker.get("name", ""))]), false)
		refresh_holdings()


func _forget_ended() -> void:
	if incoming.is_empty() or not bool(incoming.get("finished", false)):
		return
	incoming = {}
	incoming_changed.emit()


func _same_incoming(a: Dictionary, b: Dictionary) -> bool:
	if a.is_empty() or b.is_empty():
		return a.is_empty() and b.is_empty()
	for key in ["raidId", "tile", "energy", "trapsSprung", "finished", "succeeded", "struck"]:
		if a.get(key) != b.get(key):
			return false
	return (a.get("walked", []) as Array).size() == (b.get("walked", []) as Array).size()


# ── La socket, la session, le lieu ───────────────────────────────────────────

func _on_socket_event(name: String, data: Variant) -> void:
	match name:
		"presence_all":
			if data is Array:
				presence.clear()
				for row in data:
					if row is Dictionary:
						presence[String(row.get("id", ""))] = String(row.get("where", AWAY))
				changed.emit()
		"presence":
			if data is Dictionary:
				presence[String(data.get("id", ""))] = String(data.get("where", AWAY))
				changed.emit()
		"raid_incoming":
			if data is Dictionary and _defending_here():
				_accept_incoming(data)
		"raid_struck":
			# L'eclair du defenseur a fini NOTRE raid : une relecture, qui
			# revient en raid fini, foudroye, et joue le choc.
			refresh()


## Le raid subi ne se regarde que de chez soi : sur l'ile, ou en plein raid
## chez un autre, l'image n'a pas de plateau ou se poser.
func _defending_here() -> bool:
	if has_raid():
		return false
	return not Screens.in_world() or Screens.place == Screens.Place.BURROW


func _on_moved(place: int) -> void:
	if place == Screens.Place.BURROW:
		refresh_incoming()
	else:
		forget_incoming()


## Une session qui change est un raid a oublier : rien d'une session
## n'atteint la suivante (page.tsx, la remise a zero sur le joueur).
func _on_session_changed() -> void:
	if _faked:
		return
	raid = {}
	targets = []
	outcome = {}
	note = ""
	incoming = {}
	presence.clear()
	_dismissed = ""
	_finished_seen = ""
	_ended_timer.stop()
	changed.emit()
	targets_changed.emit()
	incoming_changed.emit()
	if Session.signed_in():
		refresh()


## Une note gardee dans l'ancienne langue se relirait faux : on l'efface,
## le prochain refus parlera la bonne.
func _on_locale_changed(_code: String) -> void:
	note = ""
	refusal = ""
	changed.emit()
	incoming_changed.emit()


# ── Le banc ──────────────────────────────────────────────────────────────────

## DES DONNEES FACTICES, et plus jamais de reseau : `{"raid", "targets",
## "incoming", "outcome", "lightning", "presence", "note"}`, chaque cle
## facultative.
func fake(state: Dictionary) -> void:
	_faked = true
	raid = state.get("raid", raid)
	targets = state.get("targets", targets)
	incoming = state.get("incoming", incoming)
	outcome = state.get("outcome", outcome)
	lightning_held = int(state.get("lightning", lightning_held))
	presence = state.get("presence", presence)
	note = String(state.get("note", note))
	changed.emit()
	targets_changed.emit()
	incoming_changed.emit()


# ── Les deux verbes que Net n'a pas ──────────────────────────────────────────

## PATCH et DELETE, tels que net.gd envoie GET et POST : un HTTPRequest par
## appel, libere quand il repond. Ici et pas dans Net parce que Net evolue
## par une seule main (README) — le jour ou il apprend ces deux verbes, ceci
## s'efface.
func _send(path: String, method: HTTPClient.Method, payload: Dictionary) -> Answer:
	if not is_inside_tree():
		await tree_entered
	var request := HTTPRequest.new()
	request.timeout = Net.TIMEOUT_SECONDS
	add_child(request)
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"Authorization: Bearer %s" % Session.token,
	])
	var body := JSON.stringify(payload) if method == HTTPClient.METHOD_PATCH else ""
	var started := request.request(Net.HOST + path, headers, method, body)
	if started != OK:
		request.queue_free()
		return Answer.new(0, {})
	var result: Array = await request.request_completed
	request.queue_free()
	var code: int = result[1]
	var raw: PackedByteArray = result[3]
	var parsed: Variant = JSON.parse_string(raw.get_string_from_utf8())
	return Answer.new(code, parsed if parsed is Dictionary else {})
