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

## UNE RECOLTE, avant la rafale. Le terrier l'ecoute pour faire sortir les
## carottes du potager et les envoyer a la pastille : c'est LUI qui dit
## `burst` quand la derniere arrive, et montre « +N » sur sa planche. Personne
## a l'ecoute (un banc, une autre scene) : rafale et legende tout de suite.
signal harvested(amount: int)

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
## refills {held, left, backInMs}, upgradeCost, canUpgrade, next, runs.
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
## La quete dont la recompense est deja fetee mais pas encore confirmee
## (`claim_quest`, optimiste) : la carte se tient en retrait en l'attendant.
var claiming := ""

var _fetched_ms := 0
## Le numero de la derniere relecture partie. Voir `refresh`.
var _refresh_seq := 0
## Une lecture du terrier vient d'atterrir (ou la derniere a echoue).
signal _landed
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
	# DEUX RELECTURES EN VOL (un `banked` et la relecture d'une fin de run,
	# le tick et un achat) reviennent dans l'ordre qu'elles veulent : la plus
	# vieille arrivee en dernier remettait la barre d'avant. Seule la derniere
	# partie a le droit d'ecrire.
	_refresh_seq += 1
	var seq := _refresh_seq
	var answer: Answer = await Net.get_json("/api/burrow", Session.token)
	# Depassee : on attend celle qui ecrit, parce que l'appelant qui
	# `await` compare la barre juste apres (chrome.gd `_offer_refill`).
	if seq != _refresh_seq:
		await _landed
		return
	if answer.ok:
		_adopt(answer.body)
	_landed.emit()


## UN GESTE SUR LE TERRIER : "harvest", "upgrade", "water", "fertilise",
## "shield", "refill". Rend la reponse du serveur, et a deja dit ce qu'il y
## avait a dire par `noted`, `burst`, `level_up`. `extra` part avec l'action
## (`live` pour une recharge versee en pleine run, voir `pour_refill`).
##
## LA RECOLTE EST OPTIMISTE (2026-10-01) : ce que le jardin tient se lit ici
## (`live_garden`), les carottes partent au doigt et la reponse ne fait que
## corriger le compte. Un refus relit le terrier.
func act(action: String, extra: Dictionary = {}) -> Dictionary:
	if pending or not Session.signed_in():
		return {}
	pending = true
	var guessed := live_garden() if action == "harvest" else 0
	if guessed > 0:
		_harvest_now(guessed)
	changed.emit()
	_refresh_seq += 1
	var payload := {"action": action}
	payload.merge(extra)
	var answer: Answer = await Net.post_json("/api/burrow", payload, Session.token)
	pending = false
	var res: Dictionary = answer.body
	_adopt(res)
	_landed.emit()
	Analytics.track("burrow_action", {"action": action, "ok": answer.ok and not res.has("error"),
		"code": String(res.get("error", "")), "harvested": int(res.get("harvested", 0))})

	if guessed > 0 and not (res.has("harvested") and int(res["harvested"]) > 0):
		# La recolte deja montree n'a pas eu lieu : revenir a la verite.
		refresh()
	if res.has("harvested") and int(res["harvested"]) > 0:
		if guessed <= 0:
			_show_harvest(int(res["harvested"]))
	elif res.has("spent"):
		var level := int(res.get("burrow", {}).get("level", 0))
		if level > 0:
			Analytics.track("level_up", {"level": level, "character": "burrow", "spent": int(res.get("spent", 0))})
			level_up.emit(level)
	elif res.get("raised", "") == "shield":
		noted.emit(I18N.t("notes.shieldUp"), false)
	elif res.get("poured", "") == "water":
		noted.emit(I18N.t("notes.watered"), false)
	elif res.get("poured", "") == "fertiliser":
		noted.emit(I18N.t("notes.fed"), false)
	elif res.has("refilled"):
		noted.emit(I18N.t("notes.refilled"), false)
	elif res.has("error") and action == "refill":
		# Les refus d'une recharge ont leurs mots a l'etal (`shopErrors`), et
		# « rien dans le sac » n'est pas le « plus rien » des bouteilles.
		var code := String(res["error"])
		noted.emit(I18N.t("notes.noRefill") if code == "none_held" else ShopState.shared().message(code), true)
	elif res.has("error"):
		_refuse(String(res["error"]), res)
	elif not answer.ok:
		noted.emit(I18N.t("err_offline") if answer.error() == "offline" else answer.error(), true)
	return res


## Recolter d'avance : la pile prend `n`, le jardin repart de zero, et la
## fete part. L'energie est figee a ce qu'elle vaut maintenant, parce que
## `_fetched_ms` est l'origine des deux extrapolations.
func _harvest_now(n: int) -> void:
	burrow["energy"] = live_energy()["energy"]
	burrow["gardenReady"] = 0
	burrow["stock"] = int(burrow.get("stock", 0)) + n
	_fetched_ms = Time.get_ticks_msec()
	_show_harvest(n)


func _show_harvest(n: int) -> void:
	if harvested.get_connections().is_empty():
		noted.emit(I18N.f("notes.harvested", [n]), false)
		burst.emit(n)
	else:
		harvested.emit(n)


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
##
## OPTIMISTE (2026-10-01) : la fete part AU DOIGT — le son, la gerbe, les
## carottes dans la pile, la phrase de l'ile —, sans attendre le serveur, qui
## prenait parfois une seconde. La quete est FAITE (la carte n'offre CLAIM
## qu'a ce moment-la) et le serveur recalcule la meme condition : un refus
## est rare. Quand il arrive, on relit le terrier pour revenir a la verite.
## Ce qu'on ne sait pas d'avance, c'est la quete suivante (elle depend des
## compteurs du joueur) : elle glisse en place quand la reponse arrive.
func claim_quest(id: String) -> void:
	if pending or not Session.signed_in():
		return
	var active := active_quest()
	var reward: Dictionary = active.get("reward", {}) if active.get("reward") is Dictionary else {}
	var carrots := int(reward.get("carrots", 0))
	var item: Variant = reward.get("item")
	pending = true
	claiming = id
	_refresh_seq += 1
	if carrots > 0:
		burrow["stock"] = int(burrow.get("stock", 0)) + carrots
	quest_claimed.emit(id, reward)
	noted.emit(I18N.t("quests.%s.line" % id), false)
	if item is Dictionary:
		noted.emit("+%d %s" % [int(item.get("qty", 1)), I18N.t("items.%s.name" % String(item.get("kind", "")))], false)
	if carrots > 0:
		burst.emit(carrots)
	changed.emit()

	var answer: Answer = await Net.post_json("/api/quests", {"action": "claim", "id": id}, Session.token)
	pending = false
	claiming = ""
	var res: Dictionary = answer.body
	# `claimed` est l'ID DE LA QUETE (route.ts : `claimed: id`), pas un booleen.
	var claimed: Variant = res.get("claimed")
	if (claimed is String and not (claimed as String).is_empty()) or (claimed is bool and claimed):
		_adopt(res)
		_landed.emit()
		Analytics.track("quest_claim", {"quest_id": id, "carrots": carrots,
			"item": item.get("kind", "") if item is Dictionary else ""})
		# UN OBJET GAGNE vit dans l'etat de la boutique, pas dans `burrow` :
		# sans relecture le kit gardait l'ancien compte. `granted` = ce que le
		# sac a vraiment pris (un cadeau s'arrete au plafond, grant.ts) — le
		# « +N » est deja dit, seul un sac plein se corrige.
		if item is Dictionary:
			if int(res.get("granted", item.get("qty", 1))) <= 0:
				noted.emit(I18N.t("shopErrors.inventory_full"), true)
			ShopState.shared().refresh()
		return
	# REFUS : la fete a menti. `already_claimed` veut dire que la recompense
	# est deja dans la pile (deux appareils) — la relecture suffit, sans un
	# mot. Le reste se dit.
	var code := String(res.get("error", ""))
	if code != "already_claimed":
		noted.emit(I18N.t("err_offline") if answer.error() == "offline" else (code if not code.is_empty() else answer.error()), true)
	await refresh()


## POSER UNE MARQUE (ouvrir le tableau de saison, lire un chapitre) : c'est
## ainsi que « Look up » et « Read the stones » se terminent.
func mark_quest(mark: String) -> void:
	if not Session.signed_in():
		return
	_refresh_seq += 1
	var answer: Answer = await Net.post_json("/api/quests", {"action": "mark", "mark": mark}, Session.token)
	if answer.ok:
		_adopt(answer.body)
	_landed.emit()


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


## LES RECHARGES D'ENERGIE DU SAC (2026-10-08) : `held` dans le sac, `left`
## versables encore dans la fenetre de 24 h, `back_in_ms` quand elle se
## rouvre (null si aucune n'a ete versee), decompte depuis la lecture.
func refills() -> Dictionary:
	var r: Variant = burrow.get("refills", {})
	var view: Dictionary = r if r is Dictionary else {}
	var back: Variant = view.get("backInMs", null)
	if back != null:
		back = maxf(0.0, float(back) - float(Time.get_ticks_msec() - _fetched_ms))
	return {"held": int(view.get("held", 0)), "left": int(view.get("left", 0)), "back_in_ms": back}


## VERSER UNE RECHARGE : le reservoir au plein. En pleine run (`live`), le
## serveur remplit aussi le lapin sur l'ile (`energy_granted`), et la garde
## « reservoir deja plein » saute : la barre du terrier n'est pas celle du
## lapin. Rend vrai si la recharge est versee.
func pour_refill() -> bool:
	var res := await act("refill", {"live": in_live_run()})
	return res.has("refilled")


## Mon lapin creuse sur l'ile en ce moment : son reservoir n'est pas la barre
## du terrier, et une recharge versee va aux deux.
func in_live_run() -> bool:
	var me: Dictionary = RunState.current.me() if RunState.current != null else {}
	return Screens.place == Screens.Place.ISLAND and bool(me.get("alive", false))


## Verser maintenant serait perdre la recharge : la barre du terrier est
## pleine et aucun lapin ne creuse (le serveur refuse pareil, `tank_full`).
func refill_wasted() -> bool:
	var live := live_energy()
	return not in_live_run() and int(live["energy"]) >= int(live["max"])


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
	# Les surcharges de la table `tuning` (voir tuning.gd) : posees AVANT
	# `changed`, pour que le chrome qui se redessine lise les bons couts.
	if body.get("tuning") is Dictionary:
		Tuning.adopt(body["tuning"])
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
