class_name PlaySettings
## LES REGLAGES DE JEU DU JOUEUR, a cote de ceux du son (AudioSettings) et
## sur le meme modele : statiques, sauves dans user://, valables pour la
## session meme si la sauvegarde echoue.
##
##   • SOLO (2026-10-02) : une ile de son niveau ou personne d'autre n'est
##     envoye. Le souhait part avec chaque traversee (RunState.join) ; c'est
##     le SERVEUR qui tranche, et il le refuse a qui tient le Crown Race
##     Ticket de la saison — la course se court contre les autres. Le
##     panneau grise la ligne pour lui, mais le reglage reste sauve : le
##     ticket expire, le joueur retrouve son choix.
##   • QUALITE (2026-10-02) : « pour avoir un bon fps ou un beau jeu ».
##     BEAU allume les trois effets plein ecran — le bloom (Bloom), les
##     ombres de nuages et les rais (SkyLight) ; FLUIDE les eteint. FLUIDE
##     PAR DEFAUT : ce sont eux qui coutent le plus au Seeker (bloom ~6,6 ms,
##     rais et ombres ~2 ms chacun, mesure du 2026-09-23).

const PATH := "user://play.cfg"

static var solo := false
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


static func set_solo(v: bool) -> void:
	restore()
	solo = v
	_save()


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
	restore()
	return {"solo": true} if solo else null


## Le solo est-il ferme a ce joueur ? Le ticket de la saison ouverte.
static func solo_locked() -> bool:
	var ticket := PassState.shared()
	return ticket.on() and ticket.holder()
