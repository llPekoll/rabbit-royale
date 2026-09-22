class_name Sound
## LE SON DU JEU — porte de src/game/services/SoundManager.ts.
##
## Les reglages (muet, volume) sont a `AudioSettings`, qui les pose sur les bus
## « Music » et « SFX » ; ici on ne fait que JOUER, chaque lecteur branche sur
## son bus. Le volume du joueur est deja sur Master : les niveaux ci-dessous
## sont ceux du MIXAGE, pas du reglage.
##
## HEBERGE PAR LA RACINE, et pas un autoload : la racine (main.gd) est la seule
## scene qui ne meurt jamais, la boucle d'ambiance y survit aux traversees. Un
## banc n'a pas de racine, donc pas de son — `play` s'y tait sans erreur.
##
## LES NIVEAUX SONT CEUX DU WEB, fichier par fichier, et c'est voulu : chaque
## fichier a ete mesure (SoundManager.ts, « mean level + 20·log10(volume) ≈
## -32 dB », -30 pour les rares). Un 0 dB plat mettrait la piece a 0,11 au
## niveau du carillon a 0,50. L'explosion reste a 0,15 parce qu'une cascade de
## mort en joue une dizaine a la fois.
##
## CE QUI N'EST PAS UN FICHIER : le refus (`deny`) est un carre synthetise,
## 220 → 155 Hz, rendu une fois en echantillon ; le grondement du volcan est
## l'explosion jouee a demi-vitesse, plus fort a chaque palier.

## key -> [flux, niveau]
const SFX := {
	"hop": [preload("res://assets/sound/hop.mp3"), 0.30],
	"step": [preload("res://assets/sound/step.mp3"), 0.20],
	"coin": [preload("res://assets/sound/coin.mp3"), 0.11],
	"coin_start": [preload("res://assets/sound/coin_start.mp3"), 0.22],
	"chime": [preload("res://assets/sound/chime.mp3"), 0.50],
	"chime_quick": [preload("res://assets/sound/chime_quick.mp3"), 0.40],
	"explosion": [preload("res://assets/sound/explosion.mp3"), 0.15],
	"die": [preload("res://assets/sound/die.mp3"), 0.23],
	"match": [preload("res://assets/sound/match.mp3"), 0.50],
}

## key -> [flux, en boucle]
const MUSIC := {
	"island": [preload("res://assets/sound/music_island.mp3"), true],
	"gameover": [preload("res://assets/sound/music_gameover.mp3"), false],
	"victory": [preload("res://assets/sound/music_victory.mp3"), false],
}

## `MUSIC_MIX` : la musique sous les effets.
const MUSIC_MIX := 0.3

## Combien d'un meme effet peuvent se chevaucher : la cascade d'explosions
## d'une mort en joue une dizaine.
const POLYPHONY := 10

## Le refus : un carre, sa hauteur, son enveloppe (SoundManager.ts `playDeny`).
const DENY_RATE := 22050
const DENY_PEAK := 0.035

static var _host: Node = null
static var _players := {}
static var _ambient: AudioStreamPlayer
static var _music: AudioStreamPlayer
static var _deny: AudioStreamPlayer


## La racine s'y prete une fois ; l'ambiance demarre aussitot. Sur le web elle
## attendait le premier geste (un navigateur refuse le son avant) ; une
## application n'a pas cette regle.
static func host(node: Node) -> void:
	if _host != null:
		return
	_host = node
	AudioSettings.restore()
	for key in SFX:
		var p := _player("SFX", SFX[key][0], SFX[key][1])
		p.max_polyphony = POLYPHONY
		_players[key] = p
	_deny = _player("SFX", _deny_stream(), 1.0)
	_ambient = _player("Music", _loop(MUSIC["island"][0]), MUSIC_MIX)
	_music = _player("Music", null, MUSIC_MIX)
	_ambient.play()
	# Les lecteurs meurent avec la racine ; les references statiques doivent
	# les lacher aussi, sinon Godot les compte comme fuites a la fermeture.
	node.tree_exiting.connect(_release)


## SE TAIRE AVANT DE QUITTER, une image avant. Le serveur audio ne lache une
## lecture arretee qu'a l'image suivante ; quitter dans la meme image laissait
## la boucle d'ambiance vivante, et Godot la declarait en fuite a la fermeture
## une fois sur deux (« music_island.mp3 still in use »).
static func silence() -> void:
	for p in _players.values() + [_ambient, _music, _deny]:
		if p != null:
			(p as AudioStreamPlayer).stop()


static func _release() -> void:
	silence()
	_host = null
	_players.clear()
	_ambient = null
	_music = null
	_deny = null


## Un effet. Rien sans racine (un banc), rien pour une cle inconnue.
static func play(key: String, pitch: float = 1.0) -> void:
	var p: AudioStreamPlayer = _players.get(key)
	if p == null:
		return
	p.pitch_scale = pitch
	p.play()


## LE REFUS : ce que le jeu dit quand il dit non (un toast refuse, une case
## hors d'atteinte).
static func deny() -> void:
	if _deny != null:
		_deny.play()


## LE GRONDEMENT DU VOLCAN, palier 1 a 3 : l'explosion a demi-vitesse, 40 %
## plus fort par palier. Charge comme les autres — le web jouait sans charger
## et restait muet si aucune explosion n'etait encore passee.
static func rumble(stage: int) -> void:
	var p: AudioStreamPlayer = _players.get("explosion")
	if p == null:
		return
	var level: float = SFX["explosion"][1] * (1.0 + 0.4 * clampf(stage, 1, 3))
	var one := _player("SFX", SFX["explosion"][0], level)
	one.pitch_scale = 0.5
	one.finished.connect(one.queue_free)
	one.play()


## LA MUSIQUE D'UNE SCENE : l'ambiance se tait tant qu'elle joue.
static func music(key: String) -> void:
	if _music == null or not MUSIC.has(key):
		return
	var stream: AudioStream = MUSIC[key][0]
	if MUSIC[key][1]:
		stream = _loop(stream)
	if _music.stream == stream and _music.playing:
		return
	_ambient.stop()
	_music.stream = stream
	_music.play()


## La scene rend la main : sa musique s'arrete, l'ambiance reprend.
static func stop_music() -> void:
	if _music == null:
		return
	_music.stop()
	_music.stream = null
	if not _ambient.playing:
		_ambient.play()


static func _player(bus: String, stream: AudioStream, level: float) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = bus
	p.stream = stream
	p.volume_db = linear_to_db(level)
	# Un ecran de pause qui refuse doit aussi s'entendre.
	p.process_mode = Node.PROCESS_MODE_ALWAYS
	_host.add_child(p)
	return p


static func _loop(stream: AudioStream) -> AudioStream:
	var mp3 := stream as AudioStreamMP3
	if mp3 != null:
		mp3.loop = true
	return stream


## Le carre du refus, rendu une fois : la hauteur glisse de 220 a 155 Hz en
## 80 ms (exponentiel), l'enveloppe monte en 10 ms, tient jusqu'a 140, s'eteint
## a 200 ; 220 ms en tout.
static func _deny_stream() -> AudioStreamWAV:
	var n := int(DENY_RATE * 0.22)
	var data := PackedByteArray()
	data.resize(n * 2)
	var phase := 0.0
	for i in n:
		var t := float(i) / DENY_RATE
		var freq := 220.0 * pow(155.0 / 220.0, minf(t, 0.08) / 0.08)
		phase = fmod(phase + freq / DENY_RATE, 1.0)
		var gain := 0.0
		if t < 0.01:
			gain = 0.0001 * pow(DENY_PEAK / 0.0001, t / 0.01)
		elif t < 0.14:
			gain = DENY_PEAK
		elif t < 0.2:
			gain = DENY_PEAK * pow(0.0001 / DENY_PEAK, (t - 0.14) / 0.06)
		var s := (1.0 if phase < 0.5 else -1.0) * gain
		data.encode_s16(i * 2, int(clampf(s, -1.0, 1.0) * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = DENY_RATE
	wav.data = data
	return wav
