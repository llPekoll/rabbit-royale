class_name BookVoice
extends Node
## LA VOIX DE MAMAN (2026-10-17) — les trois livres lus a voix haute, par la
## reine partie avec la maree (« on va dire que c'est la maman qui parle »).
## Elle lit tout, le journal de Kuro et le livre de la mer compris : on laisse
## le doute sur ce qui parle au large.
##
## UNE VOIX PAR LIGNE, pas par page : la page joue ses lignes (`lines`) l'une
## apres l'autre. Le texte change -> son fichier change de nom (hash du texte),
## les autres restent.
##
## HORS DU PACK : `assets/intro/voice/` porte un `.gdignore` — Godot ne
## l'importe pas et l'export ne l'embarque pas. Le Dockerfile le copie sous
## /play/voice/ ; le jeu ne telecharge que la langue du joueur, a l'ouverture
## du livre, et garde les fichiers dans user://. En lancant depuis le projet,
## les fichiers sont lus sur place.
##
## LE MANIFESTE (`voice.json`, lui dans le pack) : locale -> cle -> fichier.
## Une cle absente = une ligne muette, rien ne casse. Ecrit par
## tools/voice-books.ts, jamais a la main.

const MANIFEST := "res://assets/intro/voice.json"
const LOCAL := "res://assets/intro/voice/"
const CACHE := "user://voice/"
const REMOTE := "https://rabbit.rip/play/voice/"
## Le souffle entre deux lignes d'une meme page.
const GAP_S := 0.45
## Sous la voix, l'ambiance baisse (Sound.duck).
const LEVEL := 1.0

static var _files := {}

var _player: AudioStreamPlayer
## Chaque `say` prend un numero : une page tournee coupe la lecture d'avant.
var _turn := 0
var _streams := {}
var _fetching := {}


func _ready() -> void:
	_player = AudioStreamPlayer.new()
	_player.bus = "SFX"
	_player.volume_db = linear_to_db(LEVEL)
	add_child(_player)


func _exit_tree() -> void:
	stop()


## LES FICHIERS DE LA LANGUE, cle -> nom. Vide si la langue n'a pas de voix.
static func files() -> Dictionary:
	if _files.is_empty():
		var f := FileAccess.open(MANIFEST, FileAccess.READ)
		var data: Variant = JSON.parse_string(f.get_as_text()) if f != null else null
		_files = data if data is Dictionary and not (data as Dictionary).is_empty() else {"_": {}}
	return _files.get(I18N.locale, {})


## A l'ouverture du livre : on va chercher ses lignes, une a une, avant qu'on
## les demande.
func prefetch(keys: Array[String]) -> void:
	for key in keys:
		if not is_inside_tree():
			return
		await _stream(key)


## LIT les lignes `keys`, dans l'ordre. Un nouvel appel coupe celui-ci.
func say(keys: Array[String]) -> void:
	_turn += 1
	var turn := _turn
	_player.stop()
	for i in keys.size():
		var stream := await _stream(keys[i])
		if turn != _turn or not is_inside_tree():
			return
		if stream == null:
			continue
		Sound.duck(true)
		_player.stream = stream
		_player.play()
		await _player.finished
		if turn != _turn:
			return
		if i < keys.size() - 1:
			await get_tree().create_timer(GAP_S).timeout
			if turn != _turn:
				return
	Sound.duck(false)


func stop() -> void:
	_turn += 1
	if _player != null:
		_player.stop()
	Sound.duck(false)


## LE SON D'UNE LIGNE : deja la, sur place (le projet), en cache, ou en ligne.
func _stream(key: String) -> AudioStreamMP3:
	if _streams.has(key):
		return _streams[key]
	var file := String(files().get(key, ""))
	if file.is_empty():
		return null
	while _fetching.has(key):
		await get_tree().process_frame
		if _streams.has(key):
			return _streams[key]
	_fetching[key] = true
	var bytes := _read(LOCAL + I18N.locale + "/" + file)
	var cached := CACHE + I18N.locale + "/" + file
	if bytes.is_empty():
		bytes = _read(cached)
	if bytes.is_empty():
		bytes = await _download(I18N.locale + "/" + file)
		if not bytes.is_empty():
			DirAccess.make_dir_recursive_absolute(cached.get_base_dir())
			var out := FileAccess.open(cached, FileAccess.WRITE)
			if out != null:
				out.store_buffer(bytes)
	_fetching.erase(key)
	if bytes.is_empty():
		return null
	var stream := AudioStreamMP3.new()
	stream.data = bytes
	_streams[key] = stream
	return stream


static func _read(path: String) -> PackedByteArray:
	return FileAccess.get_file_as_bytes(path) if FileAccess.file_exists(path) else PackedByteArray()


func _download(path: String) -> PackedByteArray:
	var request := HTTPRequest.new()
	request.timeout = 20.0
	add_child(request)
	if request.request(_remote() + path) != OK:
		request.queue_free()
		return PackedByteArray()
	var result: Array = await request.request_completed
	request.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS or result[1] != 200:
		return PackedByteArray()
	return result[3]


## Sur le web, la meme origine que la page (stage.rabbit.rip lit les siennes,
## sans CORS) ; ailleurs, le site.
static func _remote() -> String:
	if OS.has_feature("web"):
		var origin: Variant = JavaScriptBridge.eval("location.origin", true)
		if origin is String and not (origin as String).is_empty():
			return origin + "/play/voice/"
	return REMOTE
