class_name StorePay
extends Node
## PAYER PAR GOOGLE PLAY (le monde web2, build « Android Play (web2) »).
##
## Le pendant de Shop.UsdcPay pour les stores, dans l'autre ordre : Play
## prend l'argent D'ABORD et rend un jeton, le serveur demande a Play ce que
## vaut ce jeton (api/store/play) et credite. Donc :
##
##   1. PUT  /api/store/play  : le serveur dit si l'achat est permis (skin deja
##      a soi, sac trop plein pour le pack). Une fois Play paye, plus de refus.
##   2. La feuille de Play, liee au joueur (`set_obfuscated_account_id`, le
##      sha256 de son id : le serveur refuse un jeton lie a un autre terrier).
##   3. POST /api/store/play  : credite, puis le pack est CONSOMME (rachetable),
##      le skin reconnu (le serveur le fait aussi : Play rembourse un achat non
##      reconnu sous trois jours).
##
## RIEN NE SE PERD : au demarrage et a chaque connexion, les achats que Play
## garde non consommes (ou non reconnus) repartent au serveur, qui ne credite
## un jeton qu'une fois. Une coupure entre le paiement et le credit se rattrape
## au lancement suivant.
##
## PAS UN AUTOLOAD (comme ShopState) : project.godot ne bouge pas. Hors du
## build Play il n'y a pas de singleton Java, et tout ici repond « pas en
## vente » : les prix restent en carottes.

signal changed

static var current: StorePay

const SINGLETON := "GodotGooglePlayBilling"

## Le prix affiche par Play, dans la monnaie du joueur (« 1,79 € »), par id.
var prices: Dictionary = {}
## L'offre complete (micros, devise), pour l'analytics.
var _offers: Dictionary = {}
## id du produit → {kind, consumable}, tel que le serveur le vend (/api/shop).
var _products: Dictionary = {}
var _client: BillingClient
var _connected := false
## La sorte dont la feuille de Play est ouverte : la carte reste grisee.
var buying := ""
## Les jetons deja envoyes au serveur dans cette session.
var _settling: Dictionary = {}


## BANC SEULEMENT (forest_shop_bench --store) : un catalogue et des prix
## donnes, connecte, sans Play. id → [sorte, consommable, prix affiche].
func fake(listing: Dictionary, currency_code := "EUR") -> void:
	_connected = true
	for id: String in listing:
		var row: Array = listing[id]
		_products[id] = {"kind": String(row[0]), "consumable": bool(row[1])}
		prices[id] = String(row[2])
		_offers[id] = {"formatted_price": String(row[2]), "price_currency_code": currency_code}
	changed.emit()


static func supported() -> bool:
	return Net.WORLD == "web2" and Engine.has_singleton(SINGLETON)


static func shared() -> StorePay:
	if current == null:
		current = StorePay.new()
		current.name = "StorePay"
		(Engine.get_main_loop() as SceneTree).root.call_deferred("add_child", current)
	return current


func _ready() -> void:
	if not supported():
		return
	_client = BillingClient.new()
	add_child(_client)
	_client.connected.connect(_on_connected)
	_client.disconnected.connect(func() -> void:
		_connected = false
		changed.emit())
	_client.connect_error.connect(func(code: int, msg: String) -> void:
		Net.trace("[store] connect error %d %s" % [code, msg]))
	_client.query_product_details_response.connect(_on_details)
	_client.query_purchases_response.connect(_on_owned)
	_client.on_purchase_updated.connect(_on_purchase_updated)
	ShopState.shared().changed.connect(_read_catalog)
	Session.changed.connect(_recover)
	_read_catalog()
	_client.start_connection()


## En vente ici, avec un prix de Play a montrer ?
func sells(kind: String) -> bool:
	var id := id_for(kind)
	return _connected and not id.is_empty() and prices.has(id)


func id_for(kind: String) -> String:
	for id: String in _products:
		if String(_products[id].get("kind", "")) == kind:
			return id
	return ""


func price_for(kind: String) -> String:
	return String(prices.get(id_for(kind), ""))


## La devise de Play pour ce joueur (« EUR »), le mot du rail.
func currency() -> String:
	for id: String in _offers:
		var code := String(_offers[id].get("price_currency_code", ""))
		if not code.is_empty():
			return code
	return "STORE"


## Ce que le serveur vend (`storeProducts` de /api/shop). Relu a chaque etal :
## un id nouveau part chez Play chercher son prix.
func _read_catalog() -> void:
	var listed: Variant = ShopState.shared().shop.get("storeProducts", [])
	if not listed is Array:
		return
	var fresh := false
	for p: Variant in listed:
		if not p is Dictionary:
			continue
		var id := String(p.get("id", ""))
		if id.is_empty():
			continue
		fresh = fresh or not _products.has(id)
		_products[id] = {"kind": String(p.get("kind", "")), "consumable": bool(p.get("consumable", true))}
	if fresh and _connected:
		_query_prices()


func _on_connected() -> void:
	_connected = true
	_query_prices()
	_recover()
	changed.emit()


func _query_prices() -> void:
	if _products.is_empty():
		return
	_client.query_product_details(PackedStringArray(_products.keys()), BillingClient.ProductType.INAPP)


func _on_details(res: Dictionary) -> void:
	if int(res.get("response_code", -1)) != BillingClient.BillingResponseCode.OK:
		Net.trace("[store] details %s" % res.get("debug_message", ""))
		return
	for d: Variant in res.get("product_details", []):
		if not d is Dictionary:
			continue
		var offer := _offer_of(d)
		var id := String(d.get("product_id", ""))
		if id.is_empty() or offer.is_empty():
			continue
		prices[id] = String(offer.get("formatted_price", ""))
		_offers[id] = offer
	changed.emit()


## Le prix d'un produit unique. Billing 8+ range les offres en liste ; le
## plugin les rend sous `offers` (on lit aussi l'ancienne forme).
static func _offer_of(d: Dictionary) -> Dictionary:
	if d.has("formatted_price"):
		return d
	for key in ["one_time_purchase_offer_details", "offers", "one_time_purchase_offer_details_list"]:
		var v: Variant = d.get(key)
		if v is Dictionary and (v as Dictionary).has("formatted_price"):
			return v
		if v is Array:
			for o: Variant in v:
				if o is Dictionary and (o as Dictionary).has("formatted_price"):
					return o
	return {}


## ACHETER. Rend quand la feuille de Play est ouverte ; le credit arrive par
## `on_purchase_updated`, puis ShopState.bought comme un achat en carottes.
func buy(kind: String) -> void:
	var id := id_for(kind)
	if not sells(kind) or not buying.is_empty() or not Session.signed_in():
		return
	buying = kind
	changed.emit()
	var check: Answer = await Net.send_json("/api/store/play", HTTPClient.METHOD_PUT, {"productId": id}, Session.token)
	if not check.ok or check.body.has("error"):
		_fail(check.error())
		return
	_client.set_obfuscated_account_id(String(Session.player.get("id", "")).sha256_text())
	Analytics.track("begin_checkout", {"item_id": kind, "rail": "play"})
	var launched: Dictionary = _client.purchase(id)
	var code := int(launched.get("response_code", BillingClient.BillingResponseCode.OK))
	if code != BillingClient.BillingResponseCode.OK:
		_fail("store_unavailable", "launch %d %s" % [code, launched.get("debug_message", "")])


func _on_purchase_updated(res: Dictionary) -> void:
	var code := int(res.get("response_code", -1))
	if code == BillingClient.BillingResponseCode.OK:
		for p: Variant in res.get("purchases", []):
			if p is Dictionary:
				_settle(p)
		return
	# Fermer la feuille n'est pas une panne : on ne dit rien.
	if code == BillingClient.BillingResponseCode.USER_CANCELED:
		_done()
		return
	# Deja a soi : un achat que Play garde et que le serveur n'a pas encore vu.
	if code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED:
		_done()
		_client.query_purchases(BillingClient.ProductType.INAPP)
		return
	_fail("store_unavailable", "purchase %d %s" % [code, res.get("debug_message", "")])


## Ce que Play garde : non consomme (un pack credite mais pas consomme, ou pas
## credite du tout) ou non reconnu (un skin). Tout repart au serveur.
func _recover() -> void:
	if _connected and Session.signed_in():
		_client.query_purchases(BillingClient.ProductType.INAPP)


func _on_owned(res: Dictionary) -> void:
	if int(res.get("response_code", -1)) != BillingClient.BillingResponseCode.OK:
		return
	for p: Variant in res.get("purchases", []):
		if not p is Dictionary:
			continue
		var id := _id_of(p)
		var consumable := bool(_products.get(id, {}).get("consumable", true))
		if consumable or not bool(p.get("is_acknowledged", false)):
			_settle(p)


static func _id_of(p: Dictionary) -> String:
	var ids: Variant = p.get("product_ids", [])
	return String(ids[0]) if (ids is Array or ids is PackedStringArray) and ids.size() > 0 else ""


## CREDITER un achat que Play dit paye.
func _settle(p: Dictionary) -> void:
	var token := String(p.get("purchase_token", ""))
	var id := _id_of(p)
	if token.is_empty() or id.is_empty() or _settling.has(token) or not Session.signed_in():
		return
	if int(p.get("purchase_state", 0)) != BillingClient.PurchaseState.PURCHASED:
		# En attente (paiement en especes, carte lente) : Play le renverra.
		_done()
		ShopState.shared().noted.emit(ShopState.shared().message("pending"), false)
		return
	_settling[token] = true
	var res: Answer = await Net.post_json("/api/store/play", {"productId": id, "purchaseToken": token}, Session.token)
	_settling.erase(token)
	if not res.ok or res.body.has("error"):
		# Pas encore (Play injoignable, en attente) : le jeton reste chez Play,
		# le prochain lancement le renvoie. Un autre terrier : on n'y touche pas.
		_fail(res.error(), "credit %s" % res.error())
		return
	if bool(res.body.get("consumable", true)):
		_client.consume_purchase(token)
	elif not bool(p.get("is_acknowledged", false)):
		_client.acknowledge_purchase(token)
	var shop := ShopState.shared()
	shop.shop = res.body
	shop.refresh()
	Home.refresh()
	_done()
	var bought: Dictionary = res.body.get("bought", {})
	var kind := String(bought.get("kind", _products.get(id, {}).get("kind", "")))
	if not bool(res.body.get("alreadyCredited", false)):
		var offer: Dictionary = _offers.get(id, {})
		Analytics.track("purchase", {"currency": String(offer.get("price_currency_code", "USD")),
			"value": float(offer.get("price_amount_micros", 0)) / 1000000.0, "item_id": kind,
			"rail": "play", "transaction_id": String(p.get("order_id", ""))})
		shop.bought.emit(kind, int(bought.get("qty", 1)))
		# Un skin a sa propre fete (silhouette, eclair), comme paye en crypto.
		for skin: Variant in SkinState.shared().catalog.get("skins", []):
			if skin is Dictionary and String(skin.get("kind", "")) == kind:
				SkinState.celebrate(String(skin.get("key", "")))


func _done() -> void:
	buying = ""
	changed.emit()


func _fail(code: String, reason := "") -> void:
	if not reason.is_empty():
		Net.trace("[store] " + reason)
	Analytics.track("purchase_error", {"stage": "play", "reason": (reason if not reason.is_empty() else code).left(100)})
	_done()
	if not code.is_empty():
		ShopState.shared().noted.emit(ShopState.shared().message(code), true)
