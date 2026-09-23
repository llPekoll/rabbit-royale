extends Node
## LE TERRIER DU JOUEUR tel que le serveur le decrit — et ce qu'on lui fait.
##
## Porte de la moitie « terrier » de src/app/page.tsx : `burrow`, `quest`,
## `refreshBurrow()`, `act()`, `claimQuest()`, et les phrases que chaque
## reponse fait dire au terrier. UN SEUL exemplaire, partage : la pastille,
## les cartes, le sol et les dialogues lisent tous ce noeud, et un
## rafraichissement les met d'accord d'un coup. Le web a appris a ses depens
## ce que coutent deux copies (session.gd raconte la meme lecon).
##
## CE QUE LE TERRIER DIT est un signal, pas un panneau : `noted` porte la
## phrase et si c'est un refus, et le chrome decide ou la poser (la pastille
## sous la barre du haut, voir chrome.gd). Un magasin qui refuse et une
## recolte qui reussit passent par la meme porte.

## Le terrier, la quete ou le joueur ont change. Sans argument : un ecouteur
## relit ce qu'il veut sur `burrow`, `quest`, `player`.
signal changed

## Une phrase a montrer, et si c'est un refus.
signal noted(text: String, refused: bool)

## L'amenagement du terrier a change (`edits`) : le sol se repousse.
signal edits_changed

## Des carottes viennent d'arriver dans la pile — pour la rafale de la
## pastille (recolte, recompense de quete).
signal burst(amount: int)

## Le terrier vient de monter d'un niveau.
signal level_up(level: int)

## Une quete vient d'etre prise ; `reward` est {carrots} ou {item: {kind, qty}}.
signal quest_claimed(id: String, reward: Dictionary)

## L'intervalle entre deux relectures silencieuses. Le jardin pousse et
## l'energie remonte pendant qu'on regarde : une minute suffit pour que les
## chiffres ne mentent pas, et c'est tres peu pour le serveur.
const REFRESH_SECONDS := 60.0

## BurrowView (lib/game/burrow.ts) : level, stock, lifetime, gardenReady,
## energy, maxEnergy, nextEnergyInMs, runCost, nextRunInMs, yieldPerHour,
## regenPerHour, capHours, gardenCapacity, gardenCeiling, boosts, shieldMs,
## upgradeCost, canUpgrade, next, runs.
var burrow: Dictionary = {}
## Le joueur tel que /api/burrow le rend (avec `applyRegen`).
var player: Dictionary = {}
## QuestBoard : active (QuestView avec ses mots), claimable, claimed, total.
var quest: Dictionary = {}
## CE QUE LE JOUEUR A DEPLACE SUR SON TERRIER — arbres, maison, potager
## (generate.ts `BurrowEdits`), lu sur /api/burrow et ecrit par
## /api/burrow/layout. Le sol est pousse de l'id PUIS de ceci
## (BurrowLayout.of).
var edits: Dictionary = {}
## Vrai pendant un geste — les boutons qui depensent se grisent dessus.
var pending := false

var _fetched_ms := 0
var _timer: Timer


func _ready() -> void:
	_timer = Timer.new()
	_timer.wait_time = REFRESH_SECONDS
	_timer.timeout.connect(refresh)
	add_child(_timer)
	Session.changed.connect(_on_session_changed)
	I18N.locale_changed.connect(_on_locale_changed)
	GameSocket.event.connect(_on_socket_event)
	if Session.signed_in():
		refresh()


## LE RESERVOIR BOUGE SUR L'ILE : la traversee le debite (`island`), la fin
## de run y reecrit ce que le lapin rapporte (`banked`), le refus dit qu'il
## ne suffit pas (`error_msg`). Sans relecture, `live_energy` extrapolait la
## barre lue AVANT la run : 257 au terrier, 0 a l'ile, et la porte DIG
## laissait passer un reservoir vide (2026-09-23).
func _on_socket_event(name: String, _data: Variant) -> void:
	if name in ["banked", "island", "error_msg"]:
		refresh()


func _on_session_changed() -> void:
	if Session.signed_in():
		refresh()
		_timer.start()
	else:
		_timer.stop()
		burrow = {}
		player = {}
		quest = {}
		changed.emit()


## Les mots de la quete sont dans la langue affichee : on les relit.
func _on_locale_changed(_code: String) -> void:
	if quest.get("active") != null:
		quest["active"] = Content.quest_view(quest["active"])
	changed.emit()


func loaded() -> bool:
	return not burrow.is_empty()


## RELIRE le terrier. Silencieux : une relecture qui echoue ne dit rien, le
## prochain tick reessaiera, et ce qu'on a a l'ecran reste vrai a une minute
## pres.
func refresh() -> void:
	if not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/burrow", Session.token)
	if not answer.ok:
		return
	_adopt(answer.body)


## UN GESTE SUR LE TERRIER : "harvest", "upgrade", "water", "fertilise",
## "shield". Rend la reponse du serveur, et a deja dit ce qu'il y avait a
## dire par `noted`, `burst`, `level_up`.
func act(action: String) -> Dictionary:
	if pending or not Session.signed_in():
		return {}
	pending = true
	changed.emit()
	var answer: Answer = await Net.post_json("/api/burrow", {"action": action}, Session.token)
	pending = false
	var res: Dictionary = answer.body
	_adopt(res)

	if res.has("harvested") and int(res["harvested"]) > 0:
		var n := int(res["harvested"])
		noted.emit(I18N.f("notes.harvested", [n]), false)
		burst.emit(n)
	elif res.has("spent"):
		var level := int(res.get("burrow", {}).get("level", 0))
		if level > 0:
			level_up.emit(level)
	elif res.get("raised", "") == "shield":
		noted.emit(I18N.t("notes.shieldUp"), false)
	elif res.get("poured", "") == "water":
		noted.emit(I18N.t("notes.watered"), false)
	elif res.get("poured", "") == "fertiliser":
		noted.emit(I18N.t("notes.fed"), false)
	elif res.has("error"):
		_refuse(String(res["error"]), res)
	elif not answer.ok:
		noted.emit(I18N.t("err_offline") if answer.error() == "offline" else answer.error(), true)
	return res


## Le refus, dans les mots du web (page.tsx `act`).
func _refuse(code: String, res: Dictionary) -> void:
	match code:
		"insufficient_carrots":
			noted.emit(I18N.f("notes.needMore", [int(res.get("need", 0)) - int(res.get("have", 0))]), true)
		"nothing_to_harvest":
			noted.emit(I18N.t("notes.gardenEmpty"), true)
		"max_level":
			noted.emit(I18N.t("notes.maxDepth"), true)
		"already_shielded":
			noted.emit(I18N.t("notes.shieldAlready"), true)
		"none_held":
			noted.emit(I18N.t("notes.noneLeft"), true)
		"boost_capped":
			noted.emit(I18N.t("notes.toppedUp"), true)
		_:
			noted.emit(code, true)


## PRENDRE LA RECOMPENSE d'une quete finie (page.tsx `claimQuest`).
func claim_quest(id: String) -> void:
	if pending or not Session.signed_in():
		return
	pending = true
	changed.emit()
	var answer: Answer = await Net.post_json("/api/quests", {"action": "claim", "id": id}, Session.token)
	pending = false
	var res: Dictionary = answer.body
	_adopt(res)
	var line_for := String(res.get("lineFor", ""))
	if not line_for.is_empty():
		noted.emit(I18N.t("quests.%s.line" % line_for), false)
	var reward: Dictionary = res.get("reward", {}) if res.get("reward") is Dictionary else {}
	if bool(res.get("claimed", false)):
		quest_claimed.emit(id, reward)
	if int(reward.get("carrots", 0)) > 0:
		burst.emit(int(reward["carrots"]))


## POSER UNE MARQUE (ouvrir le tableau de saison, lire un chapitre) : c'est
## ainsi que « Look up » et « Read the stones » se terminent.
func mark_quest(mark: String) -> void:
	if not Session.signed_in():
		return
	var answer: Answer = await Net.post_json("/api/quests", {"action": "mark", "mark": mark}, Session.token)
	if answer.ok:
		_adopt(answer.body)


## L'ENERGIE MAINTENANT, entre deux relectures : ce que le serveur a dit,
## plus ce qui est remonte depuis (regen.ts `currentEnergy`), borne au
## reservoir. La pastille la lit a chaque image.
func live_energy() -> Dictionary:
	var max_energy := int(burrow.get("maxEnergy", Tuning.i("ENERGY.MAX")))
	if burrow.is_empty():
		return {"energy": 0, "max": max_energy}
	var hours := maxf(0.0, (Time.get_ticks_msec() - _fetched_ms) / 3600000.0)
	var energy := int(floor(float(burrow.get("energy", 0)) + hours * float(burrow.get("regenPerHour", 0))))
	return {"energy": mini(max_energy, energy), "max": max_energy}


## LE JARDIN MAINTENANT, de la meme facon : ce qui etait pret, plus ce qui a
## pousse depuis, borne au plafond. Sans les boosts, qui changent le rythme —
## la relecture d'une minute les rattrape.
func live_garden() -> int:
	if burrow.is_empty():
		return 0
	var hours := maxf(0.0, (Time.get_ticks_msec() - _fetched_ms) / 3600000.0)
	var ready := float(burrow.get("gardenReady", 0)) + hours * float(burrow.get("yieldPerHour", 0))
	return int(floor(minf(ready, float(burrow.get("gardenCeiling", ready)))))


## LE PLEIN DU JARDIN, 0..1 : `live_garden` sur son plafond. En carottes
## ENTIERES, comme la pastille, pour que le potager du terrier (burrow_props)
## avance sur la meme image que le chiffre. Le plafond est `gardenCeiling`
## (l'engrais le releve) : c'est la ou le jardin cesse de produire.
func garden_fill() -> float:
	if burrow.is_empty():
		return 0.0
	var ceiling := float(burrow.get("gardenCeiling", burrow.get("gardenCapacity", 0)))
	if ceiling <= 0.0:
		return 0.0
	return minf(1.0, float(live_garden()) / ceiling)


## La quete a l'affiche, ou vide.
func active_quest() -> Dictionary:
	var active: Variant = quest.get("active", null)
	return active if active is Dictionary else {}


func _adopt(body: Dictionary) -> void:
	var touched := false
	if body.get("burrow") is Dictionary:
		burrow = body["burrow"]
		_fetched_ms = Time.get_ticks_msec()
		touched = true
	if body.get("player") is Dictionary:
		player = body["player"]
		touched = true
	if body.get("quest") is Dictionary:
		quest = body["quest"]
		if quest.get("active") is Dictionary:
			quest["active"] = Content.quest_view(quest["active"])
		touched = true
	if body.get("edits") is Dictionary:
		adopt_edits(body["edits"])
	if touched or pending == false:
		changed.emit()


## Un nouvel amenagement, du serveur. Rien ne bouge s'il est le meme.
func adopt_edits(next: Dictionary) -> void:
	if JSON.stringify(next) == JSON.stringify(edits):
		return
	edits = next
	edits_changed.emit()


## ENREGISTRER un amenagement (`PUT /api/burrow/layout`). Rend la reponse :
## `{edits, planksBack, bombsBack}` ou `{error}` — un refus que l'editeur
## dit lui-meme, parce que c'est lui qui sait ce qu'on tenait.
func save_edits(next: Dictionary) -> Dictionary:
	if not Session.signed_in():
		return {"error": "offline"}
	var answer: Answer = await Net.send_json("/api/burrow/layout", HTTPClient.METHOD_PUT,
		{"edits": next}, Session.token)
	var res: Dictionary = answer.body if answer.body is Dictionary else {}
	if OS.is_debug_build():
		print("[arrange] PUT /api/burrow/layout -> %d %s" % [answer.status, JSON.stringify(res)])
	if answer.ok and res.get("edits") is Dictionary:
		adopt_edits(res["edits"])
	elif not res.has("error"):
		res["error"] = answer.error()
	return res
