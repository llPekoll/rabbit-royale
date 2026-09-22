extends Node
## THE WALLET, as the rest of the game is allowed to see it.
##
## Behind this sits the Mobile Wallet Adapter — on a Seeker, the Seed Vault
## itself. That lives in an Android plugin (android/plugins/mwa), which exists
## only in an Android build. Everywhere else — the editor, a desktop run — the
## singleton is simply absent.
##
## THE POINT OF THIS FILE is that absence never reaches a caller. `available()`
## answers it honestly, and the two calls below return "" rather than failing,
## so the doorstep is written once and runs in the editor as it does on the
## phone.
##
## The plugin is ASYNCHRONOUS and signal-based, because a wallet prompt is
## another app taking over the screen; these wrap it back into something that
## can be awaited, which is how the sign-in flow reads.

## Must match getPluginName() in MwaPlugin.kt — this is the name the engine
## registers the singleton under.
const SINGLETON := "RabbitMWA"

var _mwa: Object = null


func _ready() -> void:
	if Engine.has_singleton(SINGLETON):
		_mwa = Engine.get_singleton(SINGLETON)


## Is there a wallet to talk to at all? The doorstep asks BEFORE offering the
## button: a control that cannot work should not be offered, and on desktop
## there is genuinely nothing behind it.
func available() -> bool:
	return _mwa != null


## THE ADDRESS, without signing anything.
##
## This is the first half of a sign-in: the challenge is minted FOR an address,
## so it has to be known before there is anything to sign. The authorisation the
## wallet grants here is remembered by the adapter, so the signature that
## follows does not prompt for consent a second time.
##
## Returns "" when refused, when there is no wallet app, or off Android.
func address() -> String:
	if _mwa == null:
		return ""
	_mwa.getAddress()
	# UN SEUL argument au signal, donc `await` rend CET argument — pas un
	# tableau d'un élément. Le typer `Array` faisait planter la connexion juste
	# après que le wallet ait répondu, ce qui est le pire endroit pour casser :
	# le joueur a donné son accord et l'écran ne bouge pas.
	var address := String(await _mwa.address_received)
	return address


## SIGN the server's challenge. On a Seeker this is the Seed Vault prompt.
##
## Returns the signature base58-encoded, which is the exact form
## verifySignature() expects on the server — the same shape the Android
## WebView bridge posts, so the server does not learn that a second client
## exists.
##
## Returns "" when the player declines. That is a REFUSAL, not an error: the
## caller drops it silently rather than showing an alarm for a sheet someone
## chose to close.
func sign(message: String) -> String:
	if _mwa == null:
		return ""
	_mwa.signIn(message)
	# DEUX arguments (adresse, signature), donc ici `await` rend bien un
	# tableau — contrairement à `address()` juste au-dessus, où il n'y en a
	# qu'un. La différence est dans Godot, pas dans le plugin.
	var result: Array = await _mwa.signed
	return String(result[1])


## The last thing that went wrong, for the status line. Empty when the failure
## was a plain refusal — see `sign()`.
var last_error := ""


func _enter_tree() -> void:
	# Connected here rather than in _ready so the error is captured even for a
	# call made on the very first frame.
	if _mwa == null and Engine.has_singleton(SINGLETON):
		_mwa = Engine.get_singleton(SINGLETON)
	if _mwa != null and _mwa.has_signal("wallet_error"):
		_mwa.wallet_error.connect(func(message: String) -> void: last_error = message)
