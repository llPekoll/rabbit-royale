extends RefCounted
class_name Answer
## THE ANSWER TO ONE CALL: the HTTP status, and the decoded body.
##
## Its own file, with a `class_name`, rather than an inner class of net.gd: an
## autoload is an INSTANCE, not a type, so `Net.Answer` names nothing a callers'
## type hint can resolve — Session would not compile against it.
##
## `ok` is stated rather than left to each caller to work out, because "did it
## work" is answered differently by each route (200 with a body, 200 with an
## error field) and getting it wrong means signing someone in on a refusal.

var status: int
var body: Dictionary
var ok: bool


func _init(p_status: int, p_body: Dictionary) -> void:
	status = p_status
	body = p_body
	ok = status >= 200 and status < 300


## The server's own word for what went wrong, or a bare status when it did not
## give one. Never invented: an error the player is shown has to be traceable
## back to a line in the server.
func error() -> String:
	if body.has("error"):
		return String(body["error"])
	# Status 0 is not a refusal — nothing answered at all. The network is down,
	# DNS failed, or TLS did. Distinct on purpose: a stored token must survive
	# it (see Session._discard), where a 401 must not.
	if status == 0:
		return "offline"
	return "http_%d" % status
