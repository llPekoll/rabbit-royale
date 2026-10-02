class_name PassState
extends Node
## LE CROWN RACE TICKET (le pass de saison), tel que /api/pass le dit : en
## vente ou non, la cagnotte, la course des dix premiers, ma place, et mon
## skin. Il ne donne RIEN en jeu : un lapin dore (garde pour de bon)
## et une place dans la course au pot.
##
## Meme forme que ShopState : pas un autoload, `PassState.shared()` le cree
## au premier appel. Le lisent : la banniere du terrier, l'entree de l'etal,
## la fenetre du ticket, et le lapin du terrier (son skin).
##
## L'ACHAT passe par la boutique (Shop.UsdcPay, kind `season_pass`) : un pass
## paye puis confirme plus tard (rattrapage de /api/shop/claim) arrive par
## `ShopState.bought`, qu'on ecoute ici pour l'annoncer quand meme.

signal changed

static var current: PassState

const KIND := "season_pass"
## LA COURONNE, le visage du ticket (Crown Race).
const TICKET_ICON := preload("res://assets/ui/crown.png")
## Le pass ferme : bouton et entree de l'etal grises, inertes.
## Assez clair pour se voir sur la barre sombre (a 0.5 la carotte se fondait
## dans le fond et le user ne la trouvait pas, 2026-10-01).
const LOCKED_TINT := Color(0.78, 0.78, 0.78, 1.0)
## Relire de temps en temps : la cagnotte et la course bougent.
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
	await Session.restore()
	refresh()


func refresh() -> void:
	if _fake or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/pass", Session.token)
	if answer.ok and not answer.body.has("error"):
		state = answer.body
		changed.emit()


# ── Lectures ────────────────────────────────────────────────────────────────

func on() -> bool:
	return bool(state.get("on", false))


func mine() -> Dictionary:
	var m: Variant = state.get("mine", null)
	return m if m is Dictionary else {}


func holder() -> bool:
	return bool(mine().get("holder", false))


## Mon skin (Kit.SKINS) : celui du ticket des qu'on l'a eu une fois, "" sinon.
func skin() -> String:
	return PassState.skin_in(mine())


## Le skin d'un lapin ou d'un joueur tel que le serveur l'ecrit (null = aucun).
static func skin_in(d: Dictionary) -> String:
	var v: Variant = d.get("skin", null)
	return String(v) if v is String else ""


## Les jours qui restent, a l'arrondi superieur (comme le tableau).
func days_left() -> int:
	var season: Variant = state.get("season", null)
	if not season is Dictionary:
		return 0
	return maxi(0, int(ceil((PassState.unix_of(String(season.get("endsAt", ""))) - Time.get_unix_time_from_system()) / 86400.0)))


## Le serveur ecrit « 2026-10-22T10:00:00.000Z » ; Godot ne lit ni les
## millisecondes ni le Z, et les deux horloges sont en UTC.
static func unix_of(iso: String) -> float:
	if iso.is_empty():
		return 0.0
	return Time.get_unix_time_from_datetime_string(iso.substr(0, 19))


## LE LAPIN DU SKIN, premiere image de sa planche (assis, de face), RECADRE
## sur le dessin : la case de 32 n'en porte que 14 x 14 en bas, et entiere
## le lapin noir se perdait en un point sur le parchemin.
static func skin_icon(key: String) -> Texture2D:
	var sheet: Texture2D = Kit.SKINS.get(key, null)
	if sheet == null:
		return Kit.CROWN
	var atlas := AtlasTexture.new()
	atlas.atlas = sheet
	atlas.region = Rect2(8, 18, 14, 14)
	return atlas


static func dollars(usd: float) -> String:
	return "$%.2f" % usd


## Le mot d'un refus du serveur (le ticket, pas la boutique).
static func error_text(code: String) -> String:
	match code:
		"pass_owned":
			return I18N.t("pass.owned")
		"pass_ending":
			return I18N.t("pass.ending")
		"pass_closed":
			return I18N.t("pass.closed")
		"offline":
			return I18N.t("err_offline")
	return I18N.t("pass.closed")
