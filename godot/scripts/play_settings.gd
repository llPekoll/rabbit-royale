class_name PlaySettings
## LES REGLAGES DE JEU DU JOUEUR, a cote de ceux du son (AudioSettings) et
## sur le meme modele : statiques, sauves dans user://, valables pour la
## session meme si la sauvegarde echoue.
##
##   • SOLO (2026-10-02) : sortir du PvP. Une ile de son niveau ou personne
##     d'autre n'est envoye ni ne regarde, un terrier absent de la liste de
##     raid, et pas de raid soi-meme. Le choix VIT SUR LE SERVEUR
##     (`players.solo`, PATCH /api/player) : la liste de raid des autres le
##     lit, un fichier local ne suffirait pas. user://play.cfg n'en garde
##     qu'une copie pour le premier ecran, avant /api/burrow. Refuse a qui
##     tient le Crown Race Ticket (la course se court contre les autres) et
##     au milieu d'un raid ; l'achat du ticket le coupe.
##   • QUALITE (2026-10-02) : « pour avoir un bon fps ou un beau jeu ».
##     BEAU allume les trois effets plein ecran — le bloom (Bloom), les
##     ombres de nuages et les rais (SkyLight) ; FLUIDE les eteint. FLUIDE
##     PAR DEFAUT : ce sont eux qui coutent le plus au Seeker (bloom ~6,6 ms,
##     rais et ombres ~2 ms chacun, mesure du 2026-09-23).

const PATH := "user://play.cfg"

static var solo := false
## Le temps qu'un refus `solo_cooldown` laisse avant de pouvoir passer solo,
## en ms (RAID_RUN.SOLO_AFTER_RAID_MS depuis le dernier raid marche).
static var solo_wait_ms := 0
static var pretty := false
static var _loaded := false


static func restore() -> void:
	if _loaded:
		return
	_loaded = true
	var cfg := ConfigFile.new()
	if cfg.load(PATH) == OK:
		solo = bool(cfg.get_value("play", "solo", false))
		pretty = bool(cfg.get_value("play", "pretty", false))


## LE SOLO EN VIGUEUR : ce que dit le serveur (Home.player, relu avec le
## terrier), sinon la derniere copie locale.
static func solo_on() -> bool:
	restore()
	var row: Variant = Home.player.get("solo")
	if row != null:
		solo = bool(row)
	return solo


## BASCULER LE SOLO, chez le serveur. Rend "" quand c'est fait, sinon le code
## du refus (`solo_ticket`, `raid_in_progress`, `solo_cooldown` — attente
## dans `solo_wait_ms` —, `offline`...) ; le reglage reste alors ce qu'il etait.
static func set_solo(v: bool) -> String:
	restore()
	var answer: Answer = await Net.send_json("/api/player", HTTPClient.METHOD_PATCH, {"solo": v}, Session.token)
	if not answer.ok or answer.body.has("error"):
		solo_wait_ms = int(answer.body.get("retryInMs", 0))
		return answer.error()
	solo = v
	Home.player["solo"] = v
	_save()
	return ""


static func set_pretty(v: bool) -> void:
	restore()
	pretty = v
	_save()
	SkyLight.refresh_all()
	var tree := Engine.get_main_loop() as SceneTree
	var bloom := tree.root.get_node_or_null("Bloom")
	if bloom != null:
		bloom.call("_follow")


static func pretty_on() -> bool:
	restore()
	return pretty


static func _save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("play", "solo", solo)
	cfg.set_value("play", "pretty", pretty)
	cfg.save(PATH)


## Ce que le `join` demande au serveur (null = s'asseoir au niveau, comme
## avant).
static func seat_choice() -> Variant:
	return {"solo": true} if solo_on() else null


## Le solo est-il ferme a ce joueur ? Le ticket de la saison ouverte.
static func solo_locked() -> bool:
	var ticket := PassState.shared()
	return ticket.on() and ticket.holder()
