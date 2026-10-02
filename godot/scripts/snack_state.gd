class_name SnackState
extends Node
## SNACK TIME, le cadeau du jour, tel que /api/snack le dit : la semaine, le
## snack qui attend ou celui qui vient, et quand. Les regles sont sur le
## serveur (src/lib/game/snack.ts) ; ici on lit, on prend, et on OUVRE la
## fenetre au retour au terrier quand un snack attend.
##
## Meme forme que PassState : pas un autoload, `SnackState.shared()` le cree
## au premier appel. Le lisent : la banniere du terrier et la fenetre.
##
## LE JOUR EST CELUI DU TELEPHONE : chaque appel porte son decalage
## (`Push._tz_offset_min`, le meme que les notifications), et le serveur
## compte minuit a cette heure-la.

signal changed
## Un snack vient d'etre pris : `reward` = {day, carrots, pack, items}.
signal claimed(reward: Dictionary)

static var current: SnackState

## Relire de temps en temps : minuit passe pendant qu'on regarde.
const POLL_SECONDS := 300.0
## Le terrier se pose, la demande de notifications passe (push.gd
## ASK_DELAY), PUIS la fenetre : elle ne doit pas lui voler son tour.
const OPEN_DELAY := 2.5
const PACKS := ["magic_hat", "lucky_foot"]

## La derniere reponse ({} tant qu'on ne sait pas) : `snack` de /api/snack.
var state: Dictionary = {}
var pending := false
var _fake := false
## Le snack (jour + semaine) pour lequel la fenetre s'est deja ouverte toute
## seule : une fois par snack et par lancement, pas a chaque retour.
var _auto_for := ""
## Quand `state` a ete lu, pour le compte a rebours entre deux lectures.
var _read_ms := 0


static func shared() -> SnackState:
	if current == null:
		current = SnackState.new()
		current.name = "SnackState"
		var root := (Engine.get_main_loop() as SceneTree).root
		root.call_deferred("add_child", current)
	return current


func _ready() -> void:
	Session.changed.connect(_on_session_changed)
	Screens.moved.connect(_on_moved)
	var timer := Timer.new()
	timer.wait_time = POLL_SECONDS
	timer.timeout.connect(refresh)
	add_child(timer)
	timer.start()
	if Session.signed_in() and not _fake:
		refresh()


## L'APP REVIENT AU PREMIER PLAN (une notification tapee, le telephone
## rallume) : minuit a pu passer, on relit — et la fenetre suit si un snack
## attend et qu'on est deja au terrier.
func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED or what == NOTIFICATION_APPLICATION_FOCUS_IN:
		if is_inside_tree() and Session.signed_in() and not _fake:
			refresh()


## Un banc : un etat pose a la main, pas de reseau.
func fake(s: Dictionary) -> void:
	_fake = true
	state = s
	_read_ms = Time.get_ticks_msec()
	changed.emit()


func _on_session_changed() -> void:
	if _fake:
		return
	_auto_for = ""
	if Session.signed_in():
		refresh()
	else:
		state = {}
		changed.emit()


func refresh() -> void:
	if _fake or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/snack?tz=%d" % Push._tz_offset_min(), Session.token)
	if answer.ok and answer.body.get("snack") is Dictionary:
		_adopt(answer.body["snack"])


func _adopt(s: Dictionary) -> void:
	var was_ready := ready()
	state = s
	_read_ms = Time.get_ticks_msec()
	changed.emit()
	# La premiere lecture, ou minuit passe pendant qu'on etait au terrier :
	# la fenetre aussi, apres le meme delai qu'a l'arrivee.
	if ready() and not was_ready and is_inside_tree():
		get_tree().create_timer(OPEN_DELAY).timeout.connect(_try_open)


# ── Lectures ────────────────────────────────────────────────────────────────

func known() -> bool:
	return not state.is_empty()


func ready() -> bool:
	return bool(state.get("ready", false))


## Le snack qui attend, ou celui qui vient : 1 … 7.
func day() -> int:
	return int(state.get("day", 1))


## Pris cette semaine : les coches de la bande.
func taken() -> int:
	return int(state.get("taken", 0))


func week() -> Array:
	var w: Variant = state.get("week", [])
	return w if w is Array else []


func is_pack_day() -> bool:
	return day() >= 7


## Ce que donne le jour `d` (1 … 7) : {day, carrots, packs}.
func day_info(d: int) -> Dictionary:
	for entry in week():
		if entry is Dictionary and int(entry.get("day", 0)) == d:
			return entry
	return {}


## Ce qu'il y a dans un pack du septieme jour : [{kind, qty}].
func pack_items(pack: String) -> Array:
	var packs: Variant = day_info(7).get("packs", null)
	if not packs is Dictionary:
		return []
	var items: Variant = (packs as Dictionary).get(pack, [])
	return items if items is Array else []


## Le temps avant le prochain snack, en ms (0 s'il attend deja).
func wait_ms() -> float:
	if ready():
		return 0.0
	var at := PassState.unix_of(String(state.get("readyAt", "")))
	if at <= 0.0:
		return 0.0
	return maxf(0.0, (at - Time.get_unix_time_from_system()) * 1000.0)


static func pack_name(pack: String) -> String:
	return I18N.t("snack.hat") if pack == "magic_hat" else I18N.t("snack.foot")


## LES PARTIES JOUEES, la lecon comprise. `Session.player` est fige a la
## connexion (un invite qui vient de finir la lecon y lit encore 0) ; le
## terrier, relu chaque minute et apres chaque partie, porte le vrai compte.
static func runs_played() -> int:
	var from_home := int(Home.burrow.get("runs", 0))
	return maxi(from_home, int(Session.player.get("runsPlayed", 0)))


# ── Prendre ─────────────────────────────────────────────────────────────────

## Prendre le snack du jour ; `pack` au septieme. Les carottes partent tout
## de suite vers la pastille (comme une quete) ; le serveur tranche ensuite.
func claim(pack: String = "") -> bool:
	if pending or not ready() or not Session.signed_in():
		return false
	if is_pack_day() and not PACKS.has(pack):
		return false
	pending = true
	var info := day_info(day())
	var carrots := int(info.get("carrots", 0))
	var payload := {"tz": Push._tz_offset_min()}
	if not pack.is_empty():
		payload["pick"] = pack
	var answer: Answer = await Net.post_json("/api/snack", payload, Session.token)
	pending = false
	var res := answer.body
	if answer.ok and res.get("reward") is Dictionary:
		var reward: Dictionary = res["reward"]
		carrots = int(reward.get("carrots", 0))
		if carrots > 0 and Home.loaded():
			Home.burrow["stock"] = int(Home.burrow.get("stock", 0)) + carrots
			Home.burst.emit(carrots)
			Home.changed.emit()
		# `pack` est null les jours a carottes : String(null) arrete le script
		# net, au milieu de la prise (vu en prod le 2026-10-02).
		var pack_v: Variant = reward.get("pack")
		Analytics.track("snack_claim", {"day": int(reward.get("day", 0)), "carrots": carrots, "pack": pack_v if pack_v is String else ""})
		if res.get("snack") is Dictionary:
			_adopt(res["snack"])
		claimed.emit(reward)
		# Les objets vivent dans l'etat de la boutique, les carottes dans
		# `Home` : les deux se relisent pour coller au serveur.
		if not (reward.get("items", []) as Array).is_empty():
			ShopState.shared().refresh()
		Home.refresh()
		return true
	var code := answer.error()
	if res.get("snack") is Dictionary:
		_adopt(res["snack"])
	if Chrome.current != null:
		var text := I18N.t("snack.notReady") if code == "not_ready" else (I18N.t("err_offline") if code == "offline" else code)
		Chrome.current.toast(text, true)
	return false


# ── La fenetre qui s'ouvre seule ─────────────────────────────────────────────

func _on_moved(place: Screens.Place) -> void:
	if place != Screens.Place.BURROW:
		return
	Screens.on_reveal(func() -> void:
		get_tree().create_timer(OPEN_DELAY).timeout.connect(_try_open))


## OUVRIR SNACK TIME si un snack attend et que rien ne s'y oppose : au
## terrier, apres la lecon, sans raid, sans autre fenetre. Une fois par
## snack ; la banniere reste la pour les autres fois.
func _try_open() -> void:
	if not ready() or _fake or not Session.signed_in():
		return
	var key := "%d/%d" % [day(), int(state.get("weeks", 0))]
	if _auto_for == key:
		return
	if not Screens.in_world() or Screens.place != Screens.Place.BURROW or Screens.crossing:
		return
	# PAS AU RETOUR DE LA LECON : l'arrivee qui suit la lecon est celle ou
	# les ilots sortent de l'eau, et la fenetre la cacherait. La banniere
	# respire deja ; la fenetre attend le retour d'une vraie partie.
	if runs_played() < 2:
		return
	if RaidState.current.has_raid() or RaidState.current.has_incoming():
		return
	if Chrome.current == null or Chrome.current.dialog_open():
		return
	_auto_for = key
	Analytics.track("snack_auto_open", {"day": day()})
	SnackDialog.open()
