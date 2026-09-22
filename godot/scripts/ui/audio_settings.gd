class_name AudioSettings
## LES REGLAGES DE SON DU JOUEUR, possedes par le jeu. Porte de
## src/components/use-audio-settings.ts :
##
##   • DEUX BUS INDEPENDANTS ET UN NIVEAU, le muet separe du volume — la
##     forme du hub de l'arcade, reprise pour qu'un joueur retrouve le meme
##     reglage d'un cote et de l'autre. Ici les bus sont ceux de Godot :
##     « Music » et « SFX » sous « Master », crees s'ils manquent (le projet
##     n'a pas de disposition de bus).
##   • LE SON EST ALLUME PAR DEFAUT : un jeu qui s'ouvre muet a l'air casse,
##     et le joueur a un moyen visible de l'eteindre. Les effets sont semes
##     depuis la cle de la musique la premiere fois : qui avait tout coupe
##     avant que les bus soient separes reste tout coupe.
##   • LE VOLUME A PLEIN par defaut : le mixage est deja regle bas, ce n'est
##     pas « fort ».
##   • UN REGLAGE QU'ON NE PEUT PAS SAUVER VAUT QUAND MEME POUR LA SESSION.
##
## Statique : il n'y a qu'un mixeur, et le panneau et le bouton muet lisent
## le meme etat sans qu'on ait a le faire circuler.

const PATH := "user://audio.cfg"
const DEFAULT_VOLUME := 1.0

static var music_muted := false
static var sfx_muted := false
static var volume := DEFAULT_VOLUME
static var _loaded := false


## Lit ce qui est sauve et le pousse dans le mixeur — une fois, et avant
## qu'un controle l'affiche : pousser le defaut d'abord remettait la musique
## a un joueur qui l'avait coupee (« the music restarts even with the toggle
## OFF »).
static func restore() -> void:
	if _loaded:
		return
	_loaded = true
	_ensure_buses()
	var cfg := ConfigFile.new()
	if cfg.load(PATH) == OK:
		music_muted = bool(cfg.get_value("audio", "music_muted", false))
		sfx_muted = bool(cfg.get_value("audio", "sfx_muted", music_muted))
		var v := float(cfg.get_value("audio", "volume", DEFAULT_VOLUME))
		volume = v if (v >= 0.0 and v <= 1.0) else DEFAULT_VOLUME
	_apply()


static func set_music_muted(v: bool) -> void:
	restore()
	music_muted = v
	_save()
	_apply()


static func set_sfx_muted(v: bool) -> void:
	restore()
	sfx_muted = v
	_save()
	_apply()


static func set_volume(v: float) -> void:
	restore()
	volume = clampf(v, 0.0, 1.0)
	_save()
	_apply()


static func _apply() -> void:
	AudioServer.set_bus_mute(AudioServer.get_bus_index("Music"), music_muted)
	AudioServer.set_bus_mute(AudioServer.get_bus_index("SFX"), sfx_muted)
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Master"), linear_to_db(maxf(volume, 0.0001)))


static func _save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("audio", "music_muted", music_muted)
	cfg.set_value("audio", "sfx_muted", sfx_muted)
	cfg.set_value("audio", "volume", volume)
	cfg.save(PATH)


## Les deux bus du jeu, sous Master, crees a la demande.
static func _ensure_buses() -> void:
	for name in ["Music", "SFX"]:
		if AudioServer.get_bus_index(name) >= 0:
			continue
		var idx := AudioServer.bus_count
		AudioServer.add_bus(idx)
		AudioServer.set_bus_name(idx, name)
		AudioServer.set_bus_send(idx, "Master")
