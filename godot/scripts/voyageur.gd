class_name Voyageur
extends RefCounted
## LE MODE VOYAGEUR : le jeu HORS LIGNE, sans serveur (2026-10-19).
##
## L'achat Voyageur (plan web2/web3, etape 8) debloque des iles en solo et un
## terrier a soi, sans raids ni defense, sur une sauvegarde de l'appareil qui
## ne remonte JAMAIS dans l'economie en ligne : rien ici ne parle au reseau.
##
## LE SERVEUR EST JOUE ICI, route par route. Net (et les trois envois faits a
## la main : raid_state, shop_state, profile) passent la main a `serve` tant
## que le mode est actif, et rendent la meme forme que le vrai serveur — Home,
## la pastille, les cartes du terrier et le profil marchent sans le savoir.
## Ce qui n'a pas de sens hors ligne (raids, boutique, saison, snack) repond
## `voyageur` et la porte est fermee dans le chrome.
##
## Les regles sont celles du serveur, portees au plus pres :
## - l'ile : generateur et contenus deja portes (IslandMap, IslandBoard,
##   LocalRun), au niveau du lapin (`lv<N>:`), au palier de ses carottes ;
## - le terrier : burrow.ts / regen.ts / garden-growth.ts sans les bouteilles
##   (eau, engrais) ni le bouclier, qui ne servent qu'en ligne ;
## - PAS D'ATTENTE (choix du 2026-10-19) : le joueur a paye, le reservoir est
##   toujours plein et traverser ne coute rien. L'energie ne compte que sur
##   l'ile, ou elle tue la manche a zero comme en ligne.
##
## Statique et pas autoload : un autoload s'ecrit dans project.godot, et
## project.godot change = un nouvel APK pour le Seeker (android-ota).

## Ou vit la sauvegarde. Une sonde la detourne par l'environnement
## (RR_VOYAGEUR_SAVE, tools/verify_voyageur.gd) et pas par une variable
## statique : en mode `--script`, Godot recompile ce script en cours de route
## et remet ses statiques a zero — la sonde effacait la vraie sauvegarde
## (2026-10-19).
static func save_path() -> String:
	var forced := OS.get_environment("RR_VOYAGEUR_SAVE")
	return forced if not forced.is_empty() else "user://voyageur.cfg"
const S := "voyageur"
## Le jeton que Session porte pendant le mode. Jamais envoye nulle part :
## Net s'arrete avant le reseau.
const TOKEN := "voyageur"

## Le mode est en cours : Net et les envois a la main repondent d'ici.
static var active := false
static var _cfg: ConfigFile


## LE MODE EST-IL ACHETE sur cet appareil ? Le build itch.io le porte dans sa
## marque (`voyageur`) ; `--voyageur` pour l'essayer sur le bureau. L'achat
## dans les stores viendra avec Play Billing et StoreKit (etapes 6 et 7).
static func unlocked() -> bool:
	return OS.has_feature("voyageur") or "--voyageur" in OS.get_cmdline_user_args()


## La derniere partie etait-elle hors ligne ? L'accueil y rentre alors tout
## droit, sans attendre le reseau.
static func was_last() -> bool:
	return unlocked() and bool(_load().get_value(S, "last", false))


## ENTRER : le joueur de la sauvegarde devient celui de Session, qui le dit a
## tout le monde (`changed`). La sauvegarde nait a la premiere entree.
static func start() -> void:
	var cfg := _load()
	if String(cfg.get_value(S, "id", "")).is_empty():
		_born(cfg)
	cfg.set_value(S, "last", true)
	_save()
	active = true
	Session.token = TOKEN
	Session.checking = false
	Session.player = player()
	Session.changed.emit()


## SORTIR (la deconnexion du profil) : retour a l'accueil, et le prochain
## lancement n'y rentre plus de lui-meme.
static func stop() -> void:
	if not active:
		return
	_load().set_value(S, "last", false)
	_save()
	active = false


## UNE SAUVEGARDE NEUVE : niveau 1, terrier 1, rien en poche, le potager
## plante maintenant (il pousse des la premiere ile).
static func _born(cfg: ConfigFile) -> void:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	cfg.set_value(S, "id", "voyageur-%08x%08x" % [rng.randi(), rng.randi()])
	cfg.set_value(S, "name", "Voyageur")
	cfg.set_value(S, "level", 1)
	cfg.set_value(S, "burrow_level", 1)
	cfg.set_value(S, "stock", 0)
	cfg.set_value(S, "lifetime", 0)
	cfg.set_value(S, "runs", 0)
	cfg.set_value(S, "tiles", 0)
	cfg.set_value(S, "chests", 0)
	cfg.set_value(S, "harvests", 0)
	cfg.set_value(S, "garden_at", _now())
	cfg.set_value(S, "edits", {})
	cfg.set_value(S, "created", _now())


# ── Le joueur et son terrier, comme le serveur les decrit ─────────────────────

static func _v(key: String, fallback: Variant = 0) -> Variant:
	return _load().get_value(S, key, fallback)


static func _put(key: String, value: Variant) -> void:
	_load().set_value(S, key, value)


## Le joueur tel que /api/auth/me le rend, reduit a ce que le client lit.
static func player() -> Dictionary:
	return {
		"id": String(_v("id", "")),
		"name": String(_v("name", "Voyageur")),
		"level": int(_v("level", 1)),
		"runsPlayed": int(_v("runs", 0)),
		"stock": int(_v("stock", 0)),
		"lifetimeCarrots": int(_v("lifetime", 0)),
		"burrowLevel": int(_v("burrow_level", 1)),
		# `null` en defaut, ConfigFile le prend pour « pas de defaut » et crie.
		"avatar": _v("avatar") if _load().has_section_key(S, "avatar") else null,
		"guest": false,
		"wallet": null,
		"solo": true,
		"voyageur": true,
	}


static func _yield_per_hour(level: int) -> float:
	return Tuning.n("GARDEN.YIELD_PER_HOUR_BASE") + Tuning.n("GARDEN.YIELD_PER_LEVEL") * (level - 1)


static func _garden_capacity(level: int) -> int:
	return int(floor(Tuning.n("GARDEN.CAP_HOURS") * _yield_per_hour(level)))


## regen.ts `gardenYield`, sans l'arrosage.
static func garden_ready(now: float = _now()) -> int:
	var level := int(_v("burrow_level", 1))
	var hours := minf(Tuning.n("GARDEN.CAP_HOURS"), maxf(0.0, now - float(_v("garden_at", now))) / 3600.0)
	return int(floor(hours * _yield_per_hour(level)))


## burrow.ts `burrowView`. Le reservoir est toujours plein (pas d'attente) :
## la porte DIG ne refuse jamais et la pastille ne decompte rien.
static func burrow_view(now: float = _now()) -> Dictionary:
	var level := int(_v("burrow_level", 1))
	var max_level := Tuning.i("BURROW.MAX_LEVEL", 20)
	var at_max := level >= max_level
	var cost: Variant = null if at_max else Tuning.upgrade_cost(level)
	var stock := int(_v("stock", 0))
	var tank := Tuning.i("OUT_OF_RUN_ENERGY.MAX", 300)
	var full_at := float(_v("garden_at", now)) + Tuning.n("GARDEN.CAP_HOURS") * 3600.0
	var no_boost := {"held": 0, "activeMs": null, "durationMs": 0}
	return {
		"level": level,
		"maxLevel": max_level,
		"stock": stock,
		"lifetime": int(_v("lifetime", 0)),
		"gardenReady": garden_ready(now),
		"energy": tank,
		"maxEnergy": tank,
		"nextEnergyInMs": null,
		"runCost": 0,
		"crossingCost": 0,
		"nextRunInMs": null,
		"yieldPerHour": _yield_per_hour(level),
		"regenPerHour": Tuning.regen_per_hour(level),
		"capHours": Tuning.n("GARDEN.CAP_HOURS"),
		"gardenCapacity": _garden_capacity(level),
		"gardenCeiling": _garden_capacity(level),
		"gardenFullInMs": maxf(0.0, (full_at - now) * 1000.0),
		"boosts": {"water": no_boost.duplicate(), "fertiliser": no_boost.duplicate()},
		"shieldMs": null,
		"refills": {"held": 0, "left": 0, "backInMs": null},
		"upgradeCost": cost,
		"canUpgrade": cost != null and stock >= int(cost),
		"next": null if at_max else {"yieldPerHour": _yield_per_hour(level + 1),
			"regenPerHour": Tuning.regen_per_hour(level + 1)},
		"runs": int(_v("runs", 0)),
	}


## GET /api/burrow. Pas de quete hors ligne pour l'instant : le tableau vide
## cache la carte.
static func _burrow_body() -> Dictionary:
	return {
		"burrow": burrow_view(),
		"player": player(),
		"quest": {},
		"edits": _v("edits", {}),
		"stumps": [],
	}


# ── La manche ─────────────────────────────────────────────────────────────────

## LA PROCHAINE ILE : au niveau du lapin (first_island.gd `seed_level`), une
## graine neuve a chaque traversee, et la graine des contenus a part (celle
## que le serveur garderait pour lui).
static func island_seed() -> String:
	return "lv%d:voyage-%s-%d" % [int(_v("level", 1)), String(_v("id", "")), int(_v("runs", 0))]


static func content_seed() -> String:
	return "c-%s-%d-%d" % [String(_v("id", "")), int(_v("runs", 0)), int(_now())]


## Le palier des coffres : celui que les carottes de toujours ouvrent.
static func lifetime() -> float:
	return float(_v("lifetime", 0))


## LA MANCHE EST FINIE : ce que le serveur fait a `bankRun`, plus le niveau
## gagne a l'ile videe (server/index.ts `levelUp`). Rend {level, leveledUp}.
## Les objets des coffres restent sur l'ile : sans raids ni defense ils ne
## servent a rien, et rien d'ici ne doit ressembler a l'economie en ligne.
static func bank(carrots: int, tiles: int, chests: int, cleared: bool) -> Dictionary:
	var level := int(_v("level", 1))
	var leveled := cleared and level < Tuning.i("RABBIT_LEVELS.MAX", 10)
	if leveled:
		level += 1
		_put("level", level)
	_put("stock", int(_v("stock", 0)) + carrots)
	_put("lifetime", int(_v("lifetime", 0)) + carrots)
	_put("runs", int(_v("runs", 0)) + 1)
	_put("tiles", int(_v("tiles", 0)) + tiles)
	_put("chests", int(_v("chests", 0)) + chests)
	_save()
	_tell()
	print("[voyage] paie %d carottes, %d cases, %d coffres, videe=%s, niveau %d" % [
		carrots, tiles, chests, cleared, level])
	return {"level": level, "leveledUp": leveled}


## LA LECON FINIE (le coffre du tuto) : le niveau 2 et la recompense, comme
## le serveur a `tutorialDone`.
static func finish_tutorial() -> void:
	if int(_v("level", 1)) < 2:
		_put("level", 2)
		_put("stock", int(_v("stock", 0)) + Tuning.i("TUTORIAL_REWARD.CARROTS"))
		_put("lifetime", int(_v("lifetime", 0)) + Tuning.i("TUTORIAL_REWARD.CARROTS"))
	_put("runs", maxi(1, int(_v("runs", 0))))
	_save()
	_tell()


## Session et Home relisent le joueur et le terrier.
static func _tell() -> void:
	if not active:
		return
	Session.player = player()
	Home._adopt(_burrow_body())


# ── Le serveur, route par route ───────────────────────────────────────────────

## CE QUE LE SERVEUR REPONDRAIT. Une image d'attente d'abord : les
## appelants `await` la reponse et certains comptent qu'elle n'arrive pas
## dans la meme pile (Home.act pose `pending` puis le relache).
static func serve(url: String, method: int, payload: Dictionary) -> Answer:
	await (Engine.get_main_loop() as SceneTree).process_frame
	var route := url.split("?")[0]
	var reading := method == HTTPClient.METHOD_GET
	match route:
		"/api/auth/me":
			return Answer.new(200, {"player": player()})
		"/api/burrow":
			return _burrow_get() if reading else _burrow_post(String(payload.get("action", "")))
		"/api/burrow/layout":
			return _layout(payload.get("edits", {}))
		"/api/player":
			return _patch_player(payload) if not reading else Answer.new(200, {"player": player()})
		"/api/player/history":
			return Answer.new(200, {"days": [], "runs": [], "purchases": [],
				"raids": {"against": [], "by": [], "unseen": 0}})
		"/api/skins":
			# Pas d'etal hors ligne : la garde-robe se reduit aux pelages.
			return Answer.new(200, {"skins": [], "owned": [], "equipped": null, "look": Look.of(player())})
		"/api/auth/delete":
			return _wipe()
		"/api/config":
			return Answer.new(200, {})
		"/api/push/token":
			return Answer.new(200, {})
	return Answer.new(403, {"error": "voyageur"})


static func _burrow_get() -> Answer:
	return Answer.new(200, _burrow_body())


static func _burrow_post(action: String) -> Answer:
	match action:
		"harvest":
			var ready := garden_ready()
			if ready <= 0:
				return Answer.new(400, {"error": "nothing_to_harvest"})
			_put("stock", int(_v("stock", 0)) + ready)
			_put("lifetime", int(_v("lifetime", 0)) + ready)
			_put("harvests", int(_v("harvests", 0)) + 1)
			_put("garden_at", _now())
			_save()
			return Answer.new(200, {"harvested": ready, "burrow": burrow_view(), "quest": {}})
		"upgrade":
			var level := int(_v("burrow_level", 1))
			var stock := int(_v("stock", 0))
			if level >= Tuning.i("BURROW.MAX_LEVEL", 20):
				return Answer.new(400, {"error": "max_level"})
			var cost := Tuning.upgrade_cost(level)
			if stock < cost:
				return Answer.new(400, {"error": "insufficient_carrots", "need": cost, "have": stock})
			_put("stock", stock - cost)
			_put("burrow_level", level + 1)
			_save()
			return Answer.new(200, {"spent": cost, "burrow": burrow_view(), "quest": {}})
	return Answer.new(403, {"error": "voyageur"})


## PUT /api/burrow/layout : la validation est deja portee (BurrowLayout
## `edited`, appelee par l'editeur avant d'enregistrer) ; on garde ce qu'il
## envoie. Pas de clotures ni de bombes hors ligne : rien a rendre.
static func _layout(edits: Variant) -> Answer:
	var next: Dictionary = edits if edits is Dictionary else {}
	_put("edits", next)
	_save()
	return Answer.new(200, {"edits": next, "planksBack": 0, "bombsBack": 0})


## PATCH /api/player : le nom et le pelage, les deux choses qu'un joueur
## possede sur lui-meme (le reste, solo compris, n'a pas de sens ici).
static func _patch_player(patch: Dictionary) -> Answer:
	var name := String(patch.get("name", "")).strip_edges()
	if not name.is_empty():
		_put("name", name.substr(0, 24))
	if patch.has("avatar"):
		_put("avatar", patch["avatar"])
	_save()
	_tell()
	return Answer.new(200, {"player": player()})


## SUPPRIMER LE COMPTE, hors ligne : la sauvegarde disparait de l'appareil.
## Session se deconnecte ensuite (`delete_account` -> `sign_out` -> `stop`).
static func _wipe() -> Answer:
	_cfg = ConfigFile.new()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(save_path()))
	return Answer.new(200, {"deleted": true})


# ── La sauvegarde ─────────────────────────────────────────────────────────────

static func _load() -> ConfigFile:
	if _cfg == null:
		_cfg = ConfigFile.new()
		_cfg.load(save_path())
	return _cfg


static func _save() -> void:
	if _cfg != null:
		_cfg.save(save_path())


static func _now() -> float:
	return Time.get_unix_time_from_system()


## Pour les bancs et les sondes : oublier la sauvegarde chargee (le fichier
## reste), pour la relire depuis le disque.
static func reload() -> void:
	_cfg = null
