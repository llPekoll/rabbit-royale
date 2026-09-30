class_name CrashReport
extends Logger
## LES ERREURS DU MOTEUR ET DES SCRIPTS, relevees pour Crashlytics (Android)
## et GA `exception` (web). Pose par `Analytics` (`OS.add_logger`), vide par
## lui a chaque image (`take`).
##
## CE QUE CE FICHIER NE FAIT PAS : envoyer. Un Logger est appele DE N'IMPORTE
## QUEL FIL — le chargeur de ressources, l'audio, le serveur de rendu — et
## ni l'arbre de scenes ni JNI ne se touchent hors du fil principal (un appel
## JNI depuis un fil que la JVM ne connait pas plante le processus : le
## rapport d'erreur causerait le crash). Ici on NOTE, sous un verrou ; le
## `_process` d'Analytics, sur le fil principal, envoie.
##
## LE TRI :
##   • les ERREURS seulement (moteur, script, shader). Les avertissements
##     sont du bruit de developpement — « Nodes with non-equal opposite
##     anchors » en tete — et `_log_message` (print, printerr) n'est pas une
##     erreur ;
##   • UNE FOIS PAR SESSION par endroit + message : le jeu crache « Lambda
##     capture at index 0 was freed » a chaque `me_changed` de run_state.gd ;
##     un rapport dit « ca arrive », cent ne disent rien de plus ;
##   • VINGT AU PLUS par session : une boucle qui casse a chaque image avec un
##     message qui change (un id, une position) ne doit pas vider le quota de
##     Crashlytics ni noyer GA.

## Le plafond de la session.
const MAX_REPORTS := 20
## Ce que Crashlytics et GA gardent d'une pile : au-dela, c'est la meme.
const STACK_MAX := 4000
## Des messages qui ne disent rien d'utile, meme en erreur.
const IGNORED := [
	"Nodes with non-equal opposite anchors",
	"resources still in use at exit",
	"ObjectDB instances were leaked",
]

var _mutex := Mutex.new()
var _queue: Array[Dictionary] = []
var _seen: Dictionary = {}
var _count := 0
## Un rapport deja en cours sur CE fil de pile : une erreur levee pendant
## qu'on note (un format() qui echoue) reviendrait ici sans fin. Le Mutex de
## Godot est recursif, il ne nous en protege pas.
var _inside := false


func _log_error(function: String, file: String, line: int, code: String, rationale: String,
		_editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
	if error_type == ERROR_TYPE_WARNING:
		return
	# `rationale` est le message lisible (ERR_FAIL_*_MSG, push_error) ; `code`
	# la condition qui a echoue (« p_index < 0 ») quand il n'y en a pas.
	var message := rationale if not rationale.is_empty() else code
	for noise in IGNORED:
		if message.contains(noise):
			return

	# OU : le premier cadre SCRIPT s'il y en a un. `push_error` et toute erreur
	# levee par le moteur au nom d'un script portent le fichier C++ qui l'a
	# imprimee (variant_utility.cpp) — toutes au meme endroit, et la ligne qui
	# compte est celle du .gd.
	var where := "%s:%d" % [file, line]
	var trace: ScriptBacktrace = null
	for bt in script_backtraces:
		if bt != null and bt.get_frame_count() > 0:
			trace = bt
			break
	if trace != null:
		where = "%s:%d" % [trace.get_frame_file(0).trim_prefix("res://"), trace.get_frame_line(0)]

	_mutex.lock()
	if _inside or _count >= MAX_REPORTS:
		_mutex.unlock()
		return
	var key := where + "|" + message
	if _seen.has(key):
		_mutex.unlock()
		return
	_inside = true
	_seen[key] = true
	_count += 1
	var stack := ""
	if trace != null:
		stack = trace.format()
	else:
		# Une erreur du moteur seul (pas de script dessous) : sa fonction et
		# son fichier C++ sont toute la pile qu'on a.
		stack = "%s (%s:%d)" % [function, file, line]
	_queue.append({
		"message": message,
		"where": where,
		"stack": stack.substr(0, STACK_MAX),
		"type": ["error", "warning", "script", "shader"][clampi(error_type, 0, 3)],
	})
	_inside = false
	_mutex.unlock()


## print/printerr : jamais un rapport (voir plus haut).
func _log_message(_message: String, _error: bool) -> void:
	pass


## CE QUI A ETE NOTE depuis la derniere fois, vide la file. Fil principal.
func take() -> Array[Dictionary]:
	_mutex.lock()
	var out := _queue
	_queue = []
	_mutex.unlock()
	return out


## Combien de rapports cette session a deja pris, pour les sondes.
func count() -> int:
	_mutex.lock()
	var n := _count
	_mutex.unlock()
	return n
