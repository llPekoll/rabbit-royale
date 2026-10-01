class_name PassState
extends Node
## LE PASS DE SAISON, tel que /api/pass le dit : en vente ou non, ce qu'il
## donne, la cagnotte, la course des dix premiers, et ma place.
##
## Meme forme que ShopState : pas un autoload, `PassState.shared()` le cree
## au premier appel. Deux surfaces le lisent — le bouton de la barre du haut
## (visible seulement pendant une saison a pass, pastille « ! » quand le
## coffre du jour attend) et la fenetre du pass.
##
## L'ACHAT passe par la boutique (Shop.UsdcPay, kind `season_pass`) : un pass
## paye puis confirme plus tard (rattrapage de /api/shop/claim) arrive par
## `ShopState.bought`, qu'on ecoute ici pour l'annoncer quand meme.

signal changed

static var current: PassState

const KIND := "season_pass"
## LA CAROTTE D'OR, le visage du pass (la carotte du kit passee a l'or).
const GOLDEN_CARROT := preload("res://assets/ui/icons/carrot-gold.webp")
## Le pass ferme : bouton et entree de l'etal grises, inertes.
## Assez clair pour se voir sur la barre sombre (a 0.5 la carotte se fondait
## dans le fond et le user ne la trouvait pas, 2026-10-01).
const LOCKED_TINT := Color(0.78, 0.78, 0.78, 1.0)
## Relire de temps en temps : la cagnotte bouge, et le coffre rouvre a minuit UTC.
const POLL_SECONDS := 120.0

## La derniere reponse de GET /api/pass ({} tant qu'on ne sait pas).
var state: Dictionary = {}
var _fake := false


static func shared() -> PassState:
	if current == null:
		current = PassState.new()
		current.name = "PassState"
		var root := (Engine.get_main_loop() as SceneTree).root
		root.call_deferred("add_child", current)
	return current


func _ready() -> void:
	Session.changed.connect(_on_session_changed)
	ShopState.shared().bought.connect(_on_bought)
	var timer := Timer.new()
	timer.wait_time = POLL_SECONDS
	timer.timeout.connect(refresh)
	add_child(timer)
	timer.start()
	if Session.signed_in() and not _fake:
		refresh()


## Un banc : un etat pose a la main, pas de reseau.
func fake(s: Dictionary) -> void:
	_fake = true
	state = s
	changed.emit()


func _on_session_changed() -> void:
	if _fake:
		return
	if Session.signed_in():
		refresh()
	else:
		state = {}
		changed.emit()


func _on_bought(kind: String, _qty: int) -> void:
	if kind != KIND:
		return
	if Chrome.current != null:
		Chrome.current.toast(I18N.t("pass.bought"), false)
	refresh()


func refresh() -> void:
	if _fake or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/pass", Session.token)
	if answer.ok and not answer.body.has("error"):
		state = answer.body
		changed.emit()


## OUVRIR LE COFFRE DU JOUR. La reponse porte le nouvel etat ; l'energie et
## le sac ont bouge, donc le terrier et l'etal se relisent.
func claim() -> bool:
	if _fake:
		return false
	var answer: Answer = await Net.post_json("/api/pass", {}, Session.token)
	if answer.body is Dictionary and answer.body.has("on"):
		state = answer.body
	var ok := answer.ok and answer.body.has("claimed")
	if Chrome.current != null:
		Chrome.current.toast(I18N.t("pass.claimed") if ok else error_text(answer.error()), not ok)
	if ok:
		Home.refresh()
		ShopState.shared().refresh()
	changed.emit()
	return ok


# ── Lectures ────────────────────────────────────────────────────────────────

func on() -> bool:
	return bool(state.get("on", false))


func mine() -> Dictionary:
	var m: Variant = state.get("mine", null)
	return m if m is Dictionary else {}


func holder() -> bool:
	return bool(mine().get("holder", false))


func can_claim() -> bool:
	return on() and bool(mine().get("canClaim", false))


## Les jours qui restent, a l'arrondi superieur (comme le tableau).
func days_left() -> int:
	var season: Variant = state.get("season", null)
	if not season is Dictionary:
		return 0
	return maxi(0, int(ceil((PassState.unix_of(String(season.get("endsAt", ""))) - Time.get_unix_time_from_system()) / 86400.0)))


## « 5h » ou « 12m » jusqu'au prochain coffre ; "" s'il attend deja.
func next_chest_in() -> String:
	var next: Variant = mine().get("nextClaimAt", null)
	var at := PassState.unix_of("" if next == null else String(next))
	var left := at - Time.get_unix_time_from_system()
	if at <= 0.0 or left <= 0.0:
		return ""
	if left >= 3600.0:
		return "%d%s" % [int(ceil(left / 3600.0)), I18N.t("units.h")]
	return "%d%s" % [maxi(1, int(ceil(left / 60.0))), I18N.t("units.m")]


## Le serveur ecrit « 2026-10-22T10:00:00.000Z » ; Godot ne lit ni les
## millisecondes ni le Z, et les deux horloges sont en UTC.
static func unix_of(iso: String) -> float:
	if iso.is_empty():
		return 0.0
	return Time.get_unix_time_from_datetime_string(iso.substr(0, 19))


## LE COFFRE FERME, premiere image de la planche `loot-box` (23 x 14) :
## la planche entiere se lisait comme une pile de coffres.
static func chest_icon() -> Texture2D:
	var atlas := AtlasTexture.new()
	atlas.atlas = Kit.ICONS["loot-box"]
	atlas.region = Rect2(0, 0, 23, 14)
	return atlas


static func dollars(usd: float) -> String:
	return "$%.2f" % usd


## Le mot d'un refus du serveur (le pass, pas la boutique).
static func error_text(code: String) -> String:
	match code:
		"pass_owned":
			return I18N.t("pass.owned")
		"pass_ending":
			return I18N.t("pass.ending")
		"pass_closed", "no_pass":
			return I18N.t("pass.closed")
		"offline":
			return I18N.t("err_offline")
	return I18N.t("pass.failed")
