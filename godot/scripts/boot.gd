extends Node
## LE JEU SE MET A JOUR TOUT SEUL SUR ANDROID (2026-10-03).
##
## L'APK n'est plus qu'une COQUE : le moteur, les plugins Android (Firebase,
## MWA), project.godot. Le jeu lui-meme — scripts, scenes, art — arrive en
## .pck depuis le front, a cote du jeu web :
##
##   https://rabbit.rip/play/android/manifest.json   lu a chaque lancement
##   https://rabbit.rip/play/android/game-<sha>.pck  le pack, nomme par son hash
##
## Le Dockerfile les exporte a chaque deploiement : un push sur main corrige les
## telephones comme il corrige le web, sans resoumettre au dApp Store.
##
## POURQUOI UN AUTOLOAD, ET LE PREMIER. Godot instancie les autoloads UN PAR UN,
## dans l'ordre de project.godot (main/main.cpp, « second pass »). Celui-ci
## charge le pack dans son `_init` : tous les suivants (I18N, Net, Session...)
## et main.tscn sont donc lus DEPUIS LE PACK. Les `class_name` neufs du pack
## sont pris (load_resource_pack rafraichit la liste globale).
##
## CE QUE LE PACK NE PEUT PAS CHANGER — il faut alors un nouvel APK, et monter
## MIN_SHELL ici pour que les vieilles coques n'avalent pas un pack qu'elles ne
## savent pas faire tourner :
##   - project.godot (un autoload en plus, un reglage) : la coque garde le sien ;
##   - les plugins Android, le manifest, les permissions ;
##   - la version du moteur ;
##   - CE fichier : il est deja charge depuis l'APK quand le pack arrive.
##
## LE PACK NE BLOQUE JAMAIS LE JEU. Pas de reseau, front en panne, hash faux :
## on joue la derniere version telechargee, ou a defaut celle de l'APK. Un pack
## qui fait planter le demarrage trois fois de suite est abandonne, et pas
## retelecharge (bad.cfg) : on attend le deploiement suivant.
##
## Tout se lit dans `adb logcat -s godot`, lignes [boot].
##
## Ailleurs qu'Android (web, iOS, editeur) ce noeud ne fait rien, sauf pour
## tester le circuit sur le bureau avec un manifeste local :
##   godot --path godot -- --ota=http://localhost:8765/manifest.json

## Le version/code de l'APK qui porte ce fichier (preset Android). Le script
## de release refuse un APK dont les deux divergent.
const SHELL := 3
## La plus vieille coque capable de faire tourner le code de CE depot. Lu par
## le Dockerfile, qui l'ecrit dans le manifeste. A monter avec SHELL quand un
## changement exige un nouvel APK (voir plus haut).
## La coque 3 ne change que ce fichier : le jeu tourne toujours sur la 2.
const MIN_SHELL := 2

const MANIFEST_URL := "https://rabbit.rip/play/android/manifest.json"
const DIR := "user://ota"
const CURRENT := DIR + "/current.cfg"
## Les packs qui ont fait planter le demarrage MAX_TRIES fois. Survit au
## _wipe : sans lui, le meme pack casse est retelecharge aussitot, en boucle.
const BAD := DIR + "/bad.cfg"
## Demarrages rates d'affilee avant d'abandonner le pack.
const MAX_TRIES := 3
## Un demarrage qui tient ce temps-la est reussi.
const ALIVE_SECONDS := 15.0
## Large : le Seeker (coque 2) ne recevait jamais le manifeste. Au demarrage
## le chargement du jeu tient la boucle principale, et a ~420 ms d'aller-retour
## vers Helsinki la poignee TLS ne finissait pas en 5 s — echec muet.
const MANIFEST_TIMEOUT := 30.0
## Plus un octet pendant ce temps : le telechargement est abandonne.
const STALL_SECONDS := 20.0

## Le hash du pack charge, "" = le jeu de l'APK.
var current := ""
var _manifest_url := MANIFEST_URL

var _http: HTTPRequest
var _overlay: CanvasLayer
var _label: Label
var _size := 0
var _last_bytes := 0
var _stall := 0.0


func _init() -> void:
	if not _enabled():
		return
	var cfg := ConfigFile.new()
	if cfg.load(CURRENT) != OK:
		return
	var file: String = cfg.get_value("pack", "file", "")
	var tries: int = cfg.get_value("pack", "tries", 0)
	# Une coque neuve (APK mis a jour) porte un jeu plus recent que le pack
	# telecharge pour l'ancienne : on le jette.
	if tries >= MAX_TRIES:
		_log("pack %s : %d demarrages rates, abandonne" % [cfg.get_value("pack", "sha256", "?"), tries])
		_mark_bad(cfg.get_value("pack", "sha256", ""))
		_wipe()
		return
	if cfg.get_value("pack", "shell", 0) != SHELL \
			or not FileAccess.file_exists(DIR + "/" + file):
		_log("pack d'une autre coque ou absent : jeu de l'APK")
		_wipe()
		return
	cfg.set_value("pack", "tries", tries + 1)
	cfg.save(CURRENT)
	if ProjectSettings.load_resource_pack(DIR + "/" + file, true):
		current = cfg.get_value("pack", "sha256", "")
		_log("pack charge %s (essai %d)" % [current, tries + 1])
	else:
		_log("pack illisible %s : jeu de l'APK" % file)


func _ready() -> void:
	if not _enabled():
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	if current != "":
		get_tree().create_timer(ALIVE_SECONDS).timeout.connect(_mark_alive)
	_check()


## Quitter l'app (accueil, autre app) n'est pas un plantage : sans ca, trois
## sorties rapides d'affilee faisaient jeter un bon pack.
func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED and current != "":
		_mark_alive()


func _enabled() -> bool:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--ota="):
			_manifest_url = arg.trim_prefix("--ota=")
			return true
	return OS.has_feature("android")


func _mark_alive() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CURRENT) == OK:
		cfg.set_value("pack", "tries", 0)
		cfg.save(CURRENT)


func _check() -> void:
	var req := HTTPRequest.new()
	req.timeout = MANIFEST_TIMEOUT
	# Dans un thread : la poignee TLS avance meme quand le chargement du jeu
	# fige la boucle principale.
	req.use_threads = true
	add_child(req)
	# Le front sert le manifeste en no-cache ; le parametre passe aussi les
	# caches intermediaires qui l'ignoreraient.
	var err := req.request("%s?t=%d" % [_manifest_url, Time.get_unix_time_from_system()])
	if err != OK:
		_log("manifeste : requete refusee (%s)" % error_string(err))
		req.queue_free()
		return
	var res: Array = await req.request_completed
	req.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		_log("manifeste : echec result=%d http=%d" % [res[0], res[1]])
		return
	var m = JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())
	if not m is Dictionary or not m.has("sha256") or not m.has("pack"):
		_log("manifeste illisible")
		return
	if m.sha256 == current:
		_log("a jour (%s)" % current)
		return
	if _is_bad(m.sha256):
		_log("pack %s deja abandonne, on attend le suivant" % m.sha256)
		return
	if int(m.get("min_shell", 0)) > SHELL:
		_log("pack pour coque >= %d, la notre est %d" % [int(m.min_shell), SHELL])
		_show("NEW VERSION ON THE DAPP STORE", true)
		return
	_log("nouveau pack %s (actuel : %s)" % [m.sha256, current if current != "" else "APK"])
	_download(m)


func _download(m: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	var file := "game-%s.pck" % m.sha256
	var part := DIR + "/" + file + ".part"
	_size = int(m.get("size", 0))
	_show("UPDATING", false)
	_http = HTTPRequest.new()
	_http.download_file = part
	_http.use_threads = true
	add_child(_http)
	_last_bytes = 0
	_stall = 0.0
	_http.request(_manifest_url.get_base_dir() + "/" + file)
	var res: Array = await _http.request_completed
	_http.queue_free()
	_http = null
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		_log("pack : echec result=%d http=%d" % [res[0], res[1]])
		DirAccess.remove_absolute(part)
		_hide()
		return
	if _sha256(part) != m.sha256:
		_log("pack : hash faux")
		DirAccess.remove_absolute(part)
		_hide()
		return
	DirAccess.rename_absolute(part, DIR + "/" + file)
	var cfg := ConfigFile.new()
	cfg.set_value("pack", "file", file)
	cfg.set_value("pack", "sha256", m.sha256)
	cfg.set_value("pack", "shell", SHELL)
	cfg.set_value("pack", "tries", 0)
	cfg.save(CURRENT)
	_prune(file)
	_log("pack %s telecharge, relance" % m.sha256)
	if not _restart():
		# Pas de relance possible : le pack s'appliquera au prochain lancement.
		_log("relance impossible : le pack attend le prochain lancement")
		_hide()


func _process(delta: float) -> void:
	if _http == null:
		return
	var got := _http.get_downloaded_bytes()
	if got != _last_bytes:
		_last_bytes = got
		_stall = 0.0
	else:
		_stall += delta
		if _stall > STALL_SECONDS:
			# cancel_request n'emet pas request_completed : on le fait a sa place.
			_http.cancel_request()
			_http.request_completed.emit(HTTPRequest.RESULT_TIMEOUT, 0, PackedStringArray(), PackedByteArray())
			return
	if _label and _size > 0:
		_label.text = "UPDATING  %d%%" % int(100.0 * got / _size)


## Relance le processus : Godot ne sait pas recharger ses autoloads a chaud.
## ProcessPhoenix est livre (et declare dans le manifest) par la lib Godot ;
## c'est ce qu'elle utilise elle-meme apres une perte de contexte GL.
func _restart() -> bool:
	var runtime = Engine.get_singleton("AndroidRuntime") if Engine.has_singleton("AndroidRuntime") else null
	var wrapper = Engine.get_singleton("JavaClassWrapper") if Engine.has_singleton("JavaClassWrapper") else null
	if runtime == null or wrapper == null:
		return false
	var activity = runtime.getActivity()
	var phoenix = wrapper.wrap("org.godotengine.godot.utils.ProcessPhoenix")
	if activity == null or phoenix == null:
		return false
	activity.runOnUiThread(runtime.createRunnableFromGodotCallable(func(): phoenix.triggerRebirth(activity)))
	return true


func _sha256(path: String) -> String:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return ""
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	while not f.eof_reached():
		ctx.update(f.get_buffer(1 << 20))
	return ctx.finish().hex_encode()


## Ne garde que le pack courant.
func _prune(keep: String) -> void:
	for f in DirAccess.get_files_at(DIR):
		if f.begins_with("game-") and f != keep:
			DirAccess.remove_absolute(DIR + "/" + f)


func _wipe() -> void:
	for f in DirAccess.get_files_at(DIR):
		if DIR + "/" + f != BAD:
			DirAccess.remove_absolute(DIR + "/" + f)


func _mark_bad(sha: String) -> void:
	if sha == "":
		return
	var cfg := ConfigFile.new()
	cfg.load(BAD)
	cfg.set_value("bad", sha, true)
	cfg.save(BAD)


func _is_bad(sha: String) -> bool:
	var cfg := ConfigFile.new()
	return cfg.load(BAD) == OK and cfg.get_value("bad", sha, false)


## Dans logcat sous le tag godot : `adb logcat -s godot`.
func _log(msg: String) -> void:
	print("[boot] " + msg)


## Un voile par-dessus tout, qui prend les doigts : on ne joue pas pendant un
## telechargement qui finira par une relance.
func _show(text: String, dismissable: bool) -> void:
	if _overlay == null:
		_overlay = CanvasLayer.new()
		_overlay.layer = 128
		add_child(_overlay)
		var bg := ColorRect.new()
		bg.color = Color(0.05, 0.07, 0.12, 0.92)
		bg.set_anchors_preset(Control.PRESET_FULL_RECT)
		bg.mouse_filter = Control.MOUSE_FILTER_STOP
		_overlay.add_child(bg)
		var box := VBoxContainer.new()
		box.set_anchors_preset(Control.PRESET_CENTER)
		box.grow_horizontal = Control.GROW_DIRECTION_BOTH
		box.grow_vertical = Control.GROW_DIRECTION_BOTH
		box.alignment = BoxContainer.ALIGNMENT_CENTER
		box.add_theme_constant_override("separation", 24)
		bg.add_child(box)
		_label = Label.new()
		_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_label.add_theme_font_size_override("font_size", 36)
		box.add_child(_label)
		if dismissable:
			var ok := Button.new()
			ok.text = "OK"
			ok.custom_minimum_size = Vector2(200, 72)
			ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			ok.pressed.connect(_hide)
			box.add_child(ok)
	_label.text = text


func _hide() -> void:
	if _overlay:
		_overlay.queue_free()
		_overlay = null
		_label = null
