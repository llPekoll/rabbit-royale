class_name RunState
extends Node
## L'ETAT D'UNE RUN, COTE CLIENT — ce que la socket a dit de l'ile, et ce que
## le chrome en montre.
##
## Porte de la moitie REACT de src/components/use-game-socket.ts. Le web y
## separe deux consommateurs, et la separation est gardee :
##
##   • LA SCENE recoit les reveals et les pas directement (`toScene`) : ils
##     tombent plusieurs fois par seconde et chacun lance une animation. L'ile
##     n'est pas encore portee ici, donc ces evenements sont RELAYES tels
##     quels par `board` — la scene a venir s'y abonnera sans que ce fichier
##     bouge, et rien n'est perdu d'ici la : le dernier instantane est garde
##     dans `island` pour etre rejoue (`resync` sur le web).
##   • L'ETAT DU HUD (energie, carottes, recap, avertissements) change rarement
##     et vit ici, avec UN SIGNAL PAR CHANGEMENT : chaque panneau se redessine
##     sur le sien et pas sur tout, ce que React faisait par des `useState`
##     separes.
##
## Rien ici n'est une seconde source de verite : chaque nombre est arrive par
## un evenement, et ce noeud ne devine jamais ce qu'il ne sait pas (le web :
## « it never guesses what is under an unrevealed one »).
##
## UN SEUL EXEMPLAIRE, CREE A LA DEMANDE. `RunState.current` se fabrique a la
## premiere lecture et s'ajoute a la racine de l'arbre : pas d'autoload, donc
## pas de ligne a ajouter dans project.godot, qu'une seule main edite.

## Le dernier instantane d'ile, entier — pour la scene qui voudra le rejouer.
signal island_changed(snapshot: Dictionary)
## MON lapin a change (energie, carottes, case) — ou le lapin regarde.
signal me_changed
## La liste des lapins a change (arrivee, depart, deplacement, poussee).
signal rabbits_changed
## Le volcan : stage, fraction creusee, coffres pris/total.
signal volcano_changed
## LA MANCHE EST FINIE (`run_over`), videe ou a sec. Plus de carte : l'ile
## joue la fin du tutoriel — le lapin saute, l'ile coule, le terrier.
signal run_ended(result: Dictionary)
## Le recap est la (non vide) ou vient d'etre retire (vide).
signal recap_changed(recap: Dictionary)
## Un record battu sur un palier (`run_record`).
signal record_changed(record: Dictionary)
## On vient d'etre pousse — survivant ou pas (`shove-toast` lit le premier).
signal shoved_changed(note: Dictionary)
## La socket est tombee (vrai) ou revenue (faux).
signal dropped_changed(dropped: bool)
## La legende du premier voyage : l'ID du temps (`firstRun.<id>`), ou "".
signal caption_changed(beat: String)
## Le mode X est arme ou desarme.
signal flag_mode_changed(armed: bool)
## Le mode X a refuse de s'armer : rien a marquer autour (quelques secondes).
signal flag_nothing_changed(nothing: bool)
## L'ile tient son propre MARK A BOMB (tutoriel hors ligne, banc) : celui du
## HUD s'efface, sinon les deux planches se superposent au meme coin.
signal island_mark_changed(owns: bool)
## L'ile coule : la duree du temps serveur, ou 0 quand c'est fini.
signal erupting_changed(ms: int)
## Combien de rivaux regardent NOTRE run.
signal watchers_changed(count: int)
## On vient d'etre frappe (eclair) ou de marcher sur une bombe enterree.
signal hit_changed(hit: Dictionary)
## Ce que la traversee a coute au terrier (vide = rien de facture).
signal bank_changed(bank: Dictionary)
## Le serveur a refuse une place : {code, energy, need, nextRunInMs}.
signal refused(why: Dictionary)
## Le serveur dit qu'une run a nous tient encore (apres un rechargement).
signal seat_held(seed: String)
## Les carottes sont EN BASE : le terrier peut se relire (`Banked`).
signal banked(carrots: int)
## Un coffre qui merite une ceremonie : {kind, amount, nft, announced}.
signal chest_prize(prize: Dictionary)
## La lecon du tutoriel : la bombe enseignee (-1 = aucune) et si on est a cote.
signal teach_changed
## Le mode de visee du spectateur : "" / "strike" / "plant".
signal aiming_changed(mode: String)
## Un eclair ou une bombe refuse par le serveur : ("strike"|"plant", raison).
signal arm_refused(kind: String, reason: String)
## Le sac (eclairs, bombes) a change — pose par la boutique.
signal bag_changed
## Les presences suivies : {id: where}.
signal presence_changed
## Un raid sur NOTRE terrier (pousse par le serveur), et la foudre du defenseur.
signal raid_incoming(raid: Dictionary)
signal raid_struck
## TOUT evenement de la socket, dans l'ordre, pour la scene de l'ile.
signal board(name: String, data: Variant)

## Le recap attend apres le dernier coeur : `run_over` tombe dans la meme
## seconde que `rabbit_died`, et la carte couvrait l'affaissement du lapin
## avant qu'on l'ait vu. Une ile videe n'attend pas : l'eruption a deja tenu
## son temps (ERUPTION.SEQUENCE_MS).
const RECAP_BEAT_MS := 900
## Le mode X arme sur rien : le refus s'affiche ce temps-la.
const FLAG_NOTHING_MS := 3000
## Une legende du premier voyage qui n'est pas collante reste ce temps-la.
const CAPTION_MS := 4500

## L'ARC DU PREMIER VOYAGE (config/first-run.ts), dans l'ordre d'enseignement :
## un nombre, puis le X, puis le coffre. Le DERNIER temps dont la condition
## tient est celui qu'on montre — un temps saute ne parle jamais. `sticky`
## tient jusqu'au temps suivant au lieu de s'effacer a l'horloge.
const FIRST_RUN_BEATS: Array[Dictionary] = [
	{"id": "tap", "sticky": true},
	{"id": "numbers", "sticky": true},
	{"id": "counts"},
	{"id": "prove"},
	{"id": "mark", "sticky": true},
	{"id": "aim", "sticky": true},
	{"id": "marked"},
	{"id": "fetch"},
	{"id": "bomb"},
	{"id": "golden"},
	{"id": "chest"},
	{"id": "clock"},
]

const NO_DIGS := {"tiles": 0, "bombs": 0, "goldens": 0, "chests": 0, "flags": 0}

static var _current: RunState = null

## L'exemplaire vivant, fabrique a la premiere lecture.
static var current: RunState:
	get:
		if _current == null:
			_current = RunState.new()
			_current.name = "RunState"
			var tree := Engine.get_main_loop() as SceneTree
			if tree != null:
				# En differe : la premiere lecture arrive souvent depuis le
				# `_ready` d'un panneau, pendant que la racine installe ses
				# enfants, et un `add_child` direct y est refuse.
				tree.root.add_child.call_deferred(_current)
		return _current

# ── L'ile ────────────────────────────────────────────────────────────────────
## Le dernier instantane, entier (IslandSnapshot) — pour le rejouer.
var island: Dictionary = {}
var seed: String = ""
## Bumpe a CHAQUE instantane, meme pour la meme graine : la graine seule ne
## dit pas « le serveur a repondu a ce join », un rejoin peut retomber sur
## l'ile qu'on a quittee.
var island_key := 0
## Les lapins par id (ClientRabbit), dans l'ordre d'arrivee — cet ordre est
## la feuille que chaque lapin porte.
var rabbits: Dictionary = {}
var warn_stage := 0
var dug_fraction := 0.0
var chests_taken := 0
var chests_total := 0
var first_run := false
## La bombe enseignee tant que la lecon est ouverte, -1 sinon.
var taught_bomb := -1
## Le lapin est A COTE de la bombe enseignee : le X peut etre pose. Dit par la
## scene (qui sait ou est le lapin), jamais devine ici.
var teach_ready := false
## Ce que CE lapin a creuse sur cette ile (MyDigs) — compte sur `move_result`,
## jamais sur `tile_revealed` : la bombe d'un inconnu n'est pas ma lecon.
var digs: Dictionary = NO_DIGS.duplicate()
var bank: Dictionary = {}
var erupting_ms := 0

# ── La run ───────────────────────────────────────────────────────────────────
var recap: Dictionary = {}
var record: Dictionary = {}
var shoved: Dictionary = {}
var refusal: Dictionary = {}
var held_seat: Dictionary = {}
var watchers := 0
## Le dernier coup recu : {by, kind: "bolt"|"bomb", at}.
var hit: Dictionary = {}
var casts := 0
var plants := 0
var banked_count := 0
var banked_carrots := 0
var presence: Dictionary = {}
var dropped := false
var connected := false

# ── Les modes ────────────────────────────────────────────────────────────────
var flag_mode := false
var flag_nothing := false
var island_owns_mark := false
## Qui l'on regarde, ou "" quand on joue.
var spectating := ""
var aiming := ""
## Le sac : {"lightning": n, "bombs": n}. La boutique le pose (`set_bag`).
var bag: Dictionary = {"lightning": 0, "bombs": 0}
## LA SCENE REPOND ICI combien de cases un X peut marquer autour du lapin
## (`IslandScene.setFlagMode` sur le web). Vide tant qu'il n'y a pas de scene :
## on arme sans verifier.
var markable_probe: Callable

## La legende affichee (ID de temps), et le dernier temps calcule.
var _caption := ""
var _last_beat := ""
var _caption_timer: Timer
var _recap_timer: Timer
var _recap_pending: Dictionary = {}
var _flag_nothing_timer: Timer
var _fake_me := ""
var _wired := false


func _init() -> void:
	_caption_timer = _timer(_on_caption_timeout)
	_recap_timer = _timer(_on_recap_timeout)
	_flag_nothing_timer = _timer(_on_flag_nothing_timeout)
	_wire()


func _timer(on_timeout: Callable) -> Timer:
	var t := Timer.new()
	t.one_shot = true
	t.timeout.connect(on_timeout)
	add_child(t)
	return t


## Les minuteries ne demarrent qu'une fois dans l'arbre ; avant, le temps
## est pris comme ecoule — un banc qui fabrique l'etat avant la racine ne
## doit pas rester coince sur une attente qui ne partira jamais.
func _start(t: Timer, ms: int) -> bool:
	if not is_inside_tree():
		return false
	t.start(ms / 1000.0)
	return true


func _wire() -> void:
	if _wired:
		return
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		return
	var socket: Node = tree.root.get_node_or_null("GameSocket")
	if socket == null:
		return
	_wired = true
	socket.event.connect(_on_event)
	socket.connected.connect(_on_connected)
	socket.dropped.connect(_on_dropped)


# ── Ce que le HUD lit ────────────────────────────────────────────────────────

func my_id() -> String:
	if not _fake_me.is_empty():
		return _fake_me
	return String(Session.player.get("id", ""))


## Mon lapin, ou vide si je n'en ai pas sur l'ile.
func me() -> Dictionary:
	var found: Variant = rabbits.get(my_id(), null)
	return found if found is Dictionary else {}


## LE LAPIN DONT LA RUN EST LUE : le mien, ou celui que je regarde. Un
## spectateur n'a pas de lapin sur l'ile, et un HUD qui lisait `me` lui
## montrait une barre vide et zero carotte — la run de personne (run-hud.tsx).
func subject() -> Dictionary:
	if spectating.is_empty():
		return me()
	var found: Variant = rabbits.get(spectating, null)
	return found if found is Dictionary else {}


func name_of(player_id: String) -> String:
	var r: Variant = rabbits.get(player_id, null)
	return String(r.get("name", "")) if r is Dictionary else ""


func caption() -> String:
	return _caption


## Ce que la scene doit rejouer apres un changement d'ile (`resync`) : les
## lapins tels qu'ils sont MAINTENANT, pas tels que l'instantane les avait.
func roster() -> Array:
	return rabbits.values()


func stun_left(r: Dictionary) -> int:
	return maxi(0, int(r.get("stunUntil", 0)) - Time.get_ticks_msec())


# ── Ce que le joueur fait ────────────────────────────────────────────────────

## PRENDRE UNE PLACE. Sans choix : le serveur assoit au niveau du lapin.
## Une nouvelle traversee ne montre jamais la carte de la run d'avant, ni sa
## rancune, ni son public : le serveur ne pousse un compte de spectateurs
## qu'a un CHANGEMENT, donc une ile ou personne n'est encore ne dirait rien.
func join(_pick: Variant = null) -> void:
	spectating = ""
	GameSocket.join(null)
	_recap_timer.stop()
	_recap_pending = {}
	_set_recap({})
	_set_shoved({})
	_set_watchers(0)


## RENTRER DEPUIS LE RECAP (page.tsx « Home ») : la carte se retire, la place
## est rendue, et l'ile finie est oubliee — sinon la prochaine ile, montee
## avant l'instantane du prochain `join`, reposerait celle-ci.
func go_home() -> void:
	if erupting_ms != 0:
		erupting_ms = 0
		erupting_changed.emit(0)
	_recap_timer.stop()
	_recap_pending = {}
	_set_recap({})
	leave()
	island = {}
	rabbits = {}
	rabbits_changed.emit()
	me_changed.emit()


## RENDRE LA PLACE ET ENCAISSER : le serveur banque sur `leave`, donc rentrer
## avec un sac plein vaut exactement vider le reservoir.
func leave() -> void:
	held_seat = {}
	GameSocket.leave()


## Un pas — ou, si le mode X est arme, une marque. La decision est prise ICI
## pour que le chemin du tap reste un seul chemin ; le mode tombe apres UN
## X, juste ou faux, sinon le prochain « va la » serait un pari.
func move(tile: int) -> void:
	if flag_mode:
		GameSocket.act("flag", tile)
		set_flag_mode(false)
		return
	GameSocket.act("move", tile)


func flag(tile: int) -> void:
	GameSocket.act("flag", tile)


func lightning(tile: int) -> void:
	GameSocket.act("lightning", tile)


func plant(tile: int) -> void:
	GameSocket.act("plant", tile)


func spectate(player_id: String) -> void:
	spectating = player_id
	# Une autre ile, un autre public : rien de la run d'avant ne reste a l'ecran.
	_recap_timer.stop()
	_recap_pending = {}
	_set_recap({})
	_set_shoved({})
	GameSocket.spectate(player_id)
	me_changed.emit()


## ARRETER DE REGARDER (page.tsx `stopSpectating`) : quitter la salle, sans
## rien encaisser — un spectateur n'a pas de run.
func stop_watching() -> void:
	if spectating.is_empty():
		return
	spectating = ""
	set_aiming("")
	GameSocket.leave()
	me_changed.emit()


func watch_presence(ids: Array) -> void:
	if ids.is_empty():
		GameSocket.unwatch_presence()
	else:
		GameSocket.watch_presence(ids)


func set_island_owns_mark(owns: bool) -> void:
	if island_owns_mark == owns:
		return
	island_owns_mark = owns
	island_mark_changed.emit(owns)


## LE MODE X. `markable` est ce que la scene repond (-1 : on ne sait pas).
## Armer sur rien allumait un anneau vide et n'expliquait rien : le mode
## refuse, et dit pourquoi quelques secondes.
func set_flag_mode(on: bool, markable: int = -1) -> void:
	if on and markable < 0 and markable_probe.is_valid():
		markable = int(markable_probe.call(true))
	if on and markable == 0:
		if markable_probe.is_valid():
			markable_probe.call(false)
		if flag_mode:
			flag_mode = false
			flag_mode_changed.emit(false)
		flag_nothing = true
		flag_nothing_changed.emit(true)
		_start(_flag_nothing_timer, FLAG_NOTHING_MS)
		_refresh_caption()
		return
	if flag_nothing:
		flag_nothing = false
		flag_nothing_changed.emit(false)
	if flag_mode != on:
		flag_mode = on
		flag_mode_changed.emit(on)
	_refresh_caption()


## La visee du spectateur : "strike", "plant", ou "" — armer celle qui l'est
## deja la desarme.
func set_aiming(mode: String) -> void:
	var next := "" if aiming == mode else mode
	if next == aiming:
		return
	aiming = next
	aiming_changed.emit(aiming)


func set_bag(items: Dictionary) -> void:
	bag = {"lightning": int(items.get("lightning", 0)), "bombs": int(items.get("bombs", 0))}
	bag_changed.emit()


## Le public a fini de voir la ceremonie du coffre.
func clear_chest_prize() -> void:
	pass


# ── La socket ────────────────────────────────────────────────────────────────

func _on_connected() -> void:
	connected = true
	if dropped:
		dropped = false
		dropped_changed.emit(false)


func _on_dropped() -> void:
	connected = false
	if not dropped:
		dropped = true
		dropped_changed.emit(true)


func _on_event(name: String, data: Variant) -> void:
	# La scene d'abord : la foudre est la cause, le sol ouvert la consequence,
	# et un eclair qui arrive apres son propre resultat se lit comme un
	# effet retarde.
	board.emit(name, data)
	var d: Dictionary = data if data is Dictionary else {}
	match name:
		"island":
			_on_island(d)
		"error_msg":
			_on_error(d)
		"seat_held":
			held_seat = {"seed": String(d.get("seed", "")), "at": Time.get_ticks_msec()}
			seat_held.emit(String(d.get("seed", "")))
		"bomb_flagged":
			# LA LECON FINIT ICI : la bombe enseignee porte son X, la run est
			# libre — sans attendre le prochain instantane, un pas plus loin.
			if taught_bomb >= 0 and int(d.get("tile", -1)) == taught_bomb:
				taught_bomb = -1
				teach_ready = false
				teach_changed.emit()
				_refresh_caption()
		"rabbit_energy":
			_patch_rabbit(String(d.get("playerId", "")), {"energy": int(d.get("energy", 0)), "carrots": int(d.get("carrots", 0))})
		"flag_result":
			if bool(d.get("correct", false)):
				digs["flags"] = int(digs["flags"]) + 1
				_refresh_caption()
		"move_result":
			_on_move_result(d)
		"lightning_struck":
			if String(d.get("castBy", "")) == my_id() and not my_id().is_empty():
				casts += 1
				bag_changed.emit()
		"rabbit_struck":
			var who := String(d.get("playerId", ""))
			_patch_rabbit(who, {"energy": int(d.get("energy", 0)), "alive": not bool(d.get("runOver", false)),
				"stunUntil": Time.get_ticks_msec() + int(d.get("stunMs", 0))})
			if who == my_id():
				_set_hit({"by": String(d.get("by", "")), "kind": "bolt", "at": Time.get_ticks_msec()})
		"lightning_rejected":
			arm_refused.emit("strike", String(d.get("reason", "")))
		"watchers":
			_set_watchers(maxi(0, int(d.get("count", 0))))
		"presence_all":
			presence = {}
			if data is Array:
				for row in data:
					if row is Dictionary:
						presence[String(row.get("id", ""))] = row.get("where")
			presence_changed.emit()
		"presence":
			presence[String(d.get("id", ""))] = d.get("where")
			presence_changed.emit()
		"bomb_planted":
			plants += 1
			bag_changed.emit()
		"plant_rejected":
			arm_refused.emit("plant", String(d.get("reason", "")))
		"raid_incoming":
			raid_incoming.emit(d)
		"raid_struck":
			raid_struck.emit()
		"rabbit_moved":
			_put_rabbit(d)
		"rabbit_pushed":
			_on_pushed(d)
		"rabbit_joined":
			_put_rabbit(_with_stun(d))
		"rabbit_left":
			# Quelqu'un dans la fenetre de reconnexion recharge, il n'est pas
			# parti : faire clignoter son lapin serait pire que le laisser.
			if not bool(d.get("grace", false)):
				rabbits.erase(String(d.get("playerId", "")))
				rabbits_changed.emit()
		"bomb_hit":
			var patch := {"tile": int(d.get("tile", 0))}
			if d.has("stunMs"):
				patch["stunUntil"] = Time.get_ticks_msec() + int(d["stunMs"])
			_patch_rabbit(String(d.get("playerId", "")), patch)
		"volcano":
			warn_stage = int(d.get("stage", warn_stage))
			if d.get("dugFraction") is float or d.get("dugFraction") is int:
				dug_fraction = float(d["dugFraction"])
			if d.has("chestsTaken"):
				chests_taken = int(d["chestsTaken"])
			if d.has("chestsTotal"):
				chests_total = int(d["chestsTotal"])
			volcano_changed.emit()
			_refresh_caption()
		"eruption":
			erupting_ms = int(d.get("durationMs", 0))
			erupting_changed.emit(erupting_ms)
		"run_record":
			record = {"tier": String(d.get("tier", "")), "carrots": int(d.get("carrots", 0)),
				"previous": int(d.get("previous", 0)), "at": Time.get_ticks_msec()}
			record_changed.emit(record)
		"run_over":
			_on_run_over(d)
		"banked":
			banked_carrots = int(d.get("carrots", 0))
			banked_count += 1
			banked.emit(banked_carrots)


func _on_island(snap: Dictionary) -> void:
	island = snap
	refusal = {}
	held_seat = {}
	seed = String(snap.get("seed", ""))
	island_key += 1
	warn_stage = int(snap.get("warnStage", 0))
	dug_fraction = float(snap.get("dugFraction", 0.0))
	chests_taken = int(snap.get("chestsTaken", 0))
	chests_total = int(snap.get("chestsTotal", 0))
	first_run = bool(snap.get("first", false))
	# La case qui bat du tutoriel : absente partout ailleurs, et sur cette
	# ile-ci des que la bombe est marquee — l'instantane dit simplement la
	# verite a chaque fois.
	taught_bomb = int(snap.get("taughtBomb", -1)) if snap.has("taughtBomb") else -1
	if taught_bomb < 0:
		teach_ready = false
	digs = NO_DIGS.duplicate()
	bank = snap.get("bank", {}) if snap.get("bank") is Dictionary else {}
	erupting_ms = 0
	rabbits = {}
	for r in snap.get("rabbits", []):
		if r is Dictionary:
			rabbits[String(r.get("playerId", ""))] = _with_stun(r)
	_recap_timer.stop()
	_recap_pending = {}
	_set_recap({})
	_caption = ""
	_last_beat = ""
	island_changed.emit(snap)
	volcano_changed.emit()
	teach_changed.emit()
	bank_changed.emit(bank)
	erupting_changed.emit(0)
	rabbits_changed.emit()
	me_changed.emit()
	_refresh_caption()


## Le serveur a dit non a une place. Seul `no_energy` porte des chiffres :
## c'est le refus sur lequel le joueur peut agir (attendre, ou acheter).
func _on_error(e: Dictionary) -> void:
	var code := String(e.get("code", ""))
	match code:
		"island_gone", "tier_locked":
			refusal = {"code": code, "energy": 0, "need": 0, "nextRunInMs": null, "at": Time.get_ticks_msec()}
			refused.emit(refusal)
		"no_energy":
			refusal = {"code": code, "energy": int(e.get("energy", 0)), "need": int(e.get("need", 0)),
				"nextRunInMs": e.get("nextRunInMs", null), "at": Time.get_ticks_msec()}
			refused.emit(refusal)
		_:
			push_warning("[run] %s" % (code if not code.is_empty() else "error"))


## LA MOITIE PRIVEE D'UN CREUSEMENT, envoyee au creuseur seul. Ce que la case
## a PAYE n'est pas un fait partage : seul le premier est credite, et le
## contenu d'un coffre est a lui — la ceremonie part d'ici, jamais de
## `tile_revealed`, sinon toute l'ile regarderait un prix que quelqu'un
## d'autre a gagne.
func _on_move_result(r: Dictionary) -> void:
	var dig: Dictionary = r.get("dig", {}) if r.get("dig") is Dictionary else {}
	if dig.has("plantedBy"):
		_set_hit({"by": String(dig["plantedBy"]), "kind": "bomb", "at": Time.get_ticks_msec()})
	if not dig.is_empty():
		var c := String(dig.get("content", ""))
		digs["tiles"] = int(digs["tiles"]) + 1
		if c == "bomb":
			digs["bombs"] = int(digs["bombs"]) + 1
		elif c == "golden":
			digs["goldens"] = int(digs["goldens"]) + 1
		elif c == "chest":
			digs["chests"] = int(digs["chests"]) + 1
		_refresh_caption()
	var loot: Dictionary = dig.get("loot", {}) if dig.get("loot") is Dictionary else {}
	if loot.is_empty():
		return
	# Les carottes atterrissent deja sur le lapin : une prise d'ecran pour
	# une poignee d'entre elles arreterait la run plusieurs fois par minute.
	var nft := bool(dig.get("nft", false))
	if String(loot.get("kind", "")) == "carrots" and not nft:
		return
	chest_prize.emit({"kind": String(loot.get("kind", "")), "amount": int(loot.get("amount", 0)),
		"nft": nft, "announced": loot.get("announced", true) != false, "at": Time.get_ticks_msec()})


## NOMMER LE COUPABLE, pendant qu'il est encore a cote (docs/bumping.md,
## regle 7). Le fil ne porte que des ids : le nom est resolu sur la liste,
## AVANT qu'elle bouge. Seules MES poussees font une note — etre prevenu de
## chaque bousculade dans une salle a quatre lapins, c'est du bruit.
func _on_pushed(p: Dictionary) -> void:
	var who := String(p.get("playerId", ""))
	if who == my_id():
		_set_shoved({"byId": String(p.get("pushedBy", "")), "byName": name_of(String(p.get("pushedBy", ""))),
			"fatal": bool(p.get("runOver", false)), "at": Time.get_ticks_msec()})
	_patch_rabbit(who, {"tile": int(p.get("to", 0)), "energy": int(p.get("energy", 0)),
		"alive": not bool(p.get("runOver", false)),
		"stunUntil": (Time.get_ticks_msec() + int(p["stunMs"])) if p.has("stunMs") and int(p.get("stunMs", 0)) > 0 else 0})


func _on_run_over(r: Dictionary) -> void:
	# LE SIEGE EST DEPENSE : un rejoin depuis le recap ne doit pas redemander
	# — ce serait payer une run que le joueur n'a pas choisie. Pas `leave()`,
	# qui emettrait sur une run deja banquee : seul le souhait est oublie.
	# (game_socket.gd n'a pas encore de porte pour ca ; son drapeau est ecrit
	# ici en attendant qu'une main lui en donne une.)
	GameSocket._want_seat = false
	_recap_timer.stop()
	# PAS DE MORT, PAS DE CARTE (2026-09-23) : l'ile videe finit comme le
	# tutoriel — le lapin saute, l'ile coule, on rentre ; a sec, le lapin
	# s'endort et le monde passe au gris (island.gd `_end_run`). `erupting_ms`
	# n'est PAS remis a zero ici : l'ile l'entendrait comme « pas d'eruption »
	# et se remettrait debout sous le lapin qui saute ; `go_home` le fait.
	#
	# LE NIVEAU vient avec : `level` (celui d'apres la manche) et `leveledUp`.
	# Home le garde tout de suite, pour que le terrier le dise en arrivant.
	if r.has("level"):
		Home.player["level"] = int(r["level"])
	run_ended.emit(r)


func _on_recap_timeout() -> void:
	if _recap_pending.is_empty():
		return
	var r := _recap_pending
	_recap_pending = {}
	_set_recap(r)


# ── Les petites mecaniques ───────────────────────────────────────────────────

## Un lapin tel que le serveur le decrit, son etourdissement mis sur NOTRE
## horloge : le fil ne porte que des durees, pour qu'un client desaccorde
## assombrisse l'anneau le bon temps.
func _with_stun(r: Dictionary) -> Dictionary:
	var out := r.duplicate()
	var stun := int(r.get("stunMs", 0))
	out["stunUntil"] = (Time.get_ticks_msec() + stun) if stun > 0 else 0
	return out


func _put_rabbit(r: Dictionary) -> void:
	var id := String(r.get("playerId", ""))
	var was: Variant = rabbits.get(id, null)
	if was is Dictionary:
		var merged: Dictionary = (was as Dictionary).duplicate()
		merged.merge(r, true)
		rabbits[id] = merged
	else:
		rabbits[id] = r
	rabbits_changed.emit()
	if id == my_id() or id == spectating:
		me_changed.emit()


func _patch_rabbit(id: String, patch: Dictionary) -> void:
	var was: Variant = rabbits.get(id, null)
	if not (was is Dictionary):
		return
	var next: Dictionary = (was as Dictionary).duplicate()
	next.merge(patch, true)
	rabbits[id] = next
	rabbits_changed.emit()
	if id == my_id() or id == spectating:
		me_changed.emit()


func _set_recap(r: Dictionary) -> void:
	recap = r
	recap_changed.emit(recap)


func _set_shoved(note: Dictionary) -> void:
	shoved = note
	shoved_changed.emit(shoved)


func _set_watchers(n: int) -> void:
	watchers = n
	watchers_changed.emit(n)


func _set_hit(h: Dictionary) -> void:
	hit = h
	hit_changed.emit(h)


func _on_flag_nothing_timeout() -> void:
	if flag_nothing:
		flag_nothing = false
		flag_nothing_changed.emit(false)


## LA LEGENDE DU PREMIER VOYAGE (first-run-caption.tsx). L'ID du temps est
## garde, pas ses mots : la phrase suit la langue au moment ou on la lit.
## Un temps qui n'est pas collant s'efface apres CAPTION_MS ; la minuterie
## est cle sur le TEMPS, pas sur le compte — une carotte de plus creusee
## pendant que « le nombre compte les bombes » est a l'ecran ne relance pas
## son horloge.
func _refresh_caption() -> void:
	var beat := first_run_beat(digs, warn_stage, flag_mode, teach_ready) if first_run else {}
	var id := String(beat.get("id", ""))
	if id == _last_beat:
		return
	_last_beat = id
	_caption_timer.stop()
	_caption = id
	caption_changed.emit(_caption)
	if not id.is_empty() and not bool(beat.get("sticky", false)):
		_start(_caption_timer, CAPTION_MS)


func _on_caption_timeout() -> void:
	if _caption == _last_beat and not _caption.is_empty():
		_caption = ""
		caption_changed.emit("")


## Le temps a montrer pour un etat : le DERNIER dont la condition tient
## (config/first-run.ts `firstRunBeat`). `beside` est le lapin a cote de la
## bombe enseignee — ou trois cases creusees sur un plateau qui ne sait pas
## le dire.
static func first_run_beat(tally: Dictionary, stage: int, armed: bool, beside: bool) -> Dictionary:
	var tiles := int(tally.get("tiles", 0))
	var flags := int(tally.get("flags", 0))
	var at_bomb := beside or tiles >= 3
	var holds := {
		"tap": true,
		"numbers": tiles >= 1,
		"counts": tiles >= 2,
		"prove": at_bomb,
		"mark": at_bomb and not armed,
		"aim": armed,
		"marked": flags >= 1,
		"fetch": flags >= 1 and int(tally.get("chests", 0)) < 1,
		"bomb": int(tally.get("bombs", 0)) >= 1,
		"golden": int(tally.get("goldens", 0)) >= 1,
		"chest": int(tally.get("chests", 0)) >= 1,
		"clock": stage >= 1,
	}
	var found: Dictionary = {}
	for beat in FIRST_RUN_BEATS:
		if bool(holds.get(beat["id"], false)):
			found = beat
	return found


## La scene dit si le lapin est a cote de la bombe enseignee.
func set_teach_ready(ready: bool) -> void:
	if teach_ready == ready:
		return
	teach_ready = ready
	teach_changed.emit()
	_refresh_caption()


# ── Le banc ──────────────────────────────────────────────────────────────────

## DES DONNEES FACTICES, pour voir les panneaux sans ile ni compte. Les cles
## sont celles des variables (snake_case) ; `me_id` dit qui je suis, et
## `rabbits` est une liste de ClientRabbit. Tout est resignale d'un coup.
func fake(state: Dictionary) -> void:
	if state.has("me_id"):
		_fake_me = String(state["me_id"])
	if state.has("rabbits"):
		rabbits = {}
		for r in state["rabbits"]:
			rabbits[String(r.get("playerId", ""))] = r
	for key in ["seed", "warn_stage", "dug_fraction", "chests_taken", "chests_total", "first_run",
			"taught_bomb", "teach_ready", "digs", "bank", "erupting_ms", "recap", "record", "shoved",
			"watchers", "hit", "spectating", "aiming", "bag", "dropped", "flag_mode", "flag_nothing"]:
		if state.has(key):
			set(key, state[key])
	island_changed.emit(island)
	rabbits_changed.emit()
	me_changed.emit()
	volcano_changed.emit()
	teach_changed.emit()
	bank_changed.emit(bank)
	erupting_changed.emit(erupting_ms)
	recap_changed.emit(recap)
	record_changed.emit(record)
	shoved_changed.emit(shoved)
	watchers_changed.emit(watchers)
	hit_changed.emit(hit)
	aiming_changed.emit(aiming)
	bag_changed.emit()
	dropped_changed.emit(dropped)
	flag_mode_changed.emit(flag_mode)
	flag_nothing_changed.emit(flag_nothing)
	_last_beat = ""
	_refresh_caption()
