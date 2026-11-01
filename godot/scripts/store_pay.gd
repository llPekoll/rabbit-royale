class_name StorePay
extends Node
## PAYER PAR GOOGLE PLAY (le monde web2, build « Android Play (web2) »).
##
## Play ne vend que des SACHETS DE GOLD (config/store.ts, 2026-10-30) : le
## Gold paie ensuite tout l'etal (ShopState.buy en "gold"). Le pendant de
## Shop.UsdcPay pour les stores, dans l'autre ordre : Play prend l'argent
## D'ABORD et rend un jeton, le serveur demande a Play ce que vaut ce jeton
## (api/store/play) et credite. Donc :
##
##   1. PUT  /api/store/play  : le serveur dit si l'achat est permis. Une fois
##      Play paye, plus de refus.
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
## SUR LE WEB (rabbit.rip/play/, export « Web (web2) ») : les MEMES sachets,
## payes chez Stripe (api/store/stripe, 2026-10-30). Depuis le 2026-11-01 le
## formulaire de Stripe s'ouvre PAR-DESSUS le jeu (window.rrStripeCheckout,
## web/shell.html) : le jeu ne recharge plus, `_on_checkout` fait crediter.
## Sans cle publique cote serveur (ou une banque a visiter), le jeu part
## encore sur Stripe et en revient avec `?gold=done&session_id=cs_…`, que
## `_web_return` fait crediter. Le webhook de Stripe credite aussi si le
## joueur ne revient pas ; le serveur ne compte la session qu'une fois. Le
## prix est celui que Stripe facture, en euros (`web` de /api/shop).
##
## PAS UN AUTOLOAD (comme ShopState) : project.godot ne bouge pas. Hors du
## build Play et du web web2, tout ici repond « pas en vente ».

signal changed
## Un sachet credite : la bourse vient de prendre `qty` Gold.
signal got_gold(qty: int)

static var current: StorePay

const SINGLETON := "GodotGooglePlayBilling"

## Le prix affiche par Play, dans la monnaie du joueur (« 1,79 € »), par id.
var prices: Dictionary = {}
## L'offre complete (micros, devise), pour l'analytics.
var _offers: Dictionary = {}
## id du produit → {kind, qty, consumable}, tel que le serveur le vend (/api/shop).
var _products: Dictionary = {}
var _client: BillingClient
var _connected := false
## Le sachet dont la feuille de Play est ouverte : sa ligne reste grisee.
var buying := ""
## Les jetons deja envoyes au serveur dans cette session.
var _settling: Dictionary = {}
## Un retour de Stripe en cours de credit.
var _returning := false
## Le formulaire de Stripe par-dessus le jeu (web/shell.html) ; null sur une
## page d'avant, qui part alors sur la page de Stripe.
var _checkout: JavaScriptObject
var _checkout_cb: JavaScriptObject
## La session du formulaire ouvert.
var _checkout_session := ""


## BANC SEULEMENT (forest_shop_bench --store) : des sachets et leurs prix
## donnes, connecte, sans Play. id → [gold, prix affiche, micros, bonus].
func fake(listing: Dictionary, currency_code := "EUR") -> void:
	_connected = true
	for id: String in listing:
		var row: Array = listing[id]
		_products[id] = {"kind": "gold", "qty": int(row[0]), "bonus": int(row[3]) if row.size() > 3 else 0, "consumable": true}
		prices[id] = String(row[1])
		_offers[id] = {"formatted_price": String(row[1]), "price_currency_code": currency_code,
			"price_amount_micros": int(row[2])}
	changed.emit()


static func supported() -> bool:
	return Net.WORLD == "web2" and (Engine.has_singleton(SINGLETON) or web())


## Le jeu du navigateur : Stripe au lieu de Play.
static func web() -> bool:
	return Net.WORLD == "web2" and OS.has_feature("web")


static func shared() -> StorePay:
	if current == null:
		current = StorePay.new()
		current.name = "StorePay"
		(Engine.get_main_loop() as SceneTree).root.call_deferred("add_child", current)
	return current


func _ready() -> void:
	if not supported():
		return
	if web():
		_checkout = JavaScriptBridge.get_interface("rrStripeCheckout")
		if _checkout != null:
			_checkout_cb = JavaScriptBridge.create_callback(_on_checkout)
		ShopState.shared().changed.connect(_read_catalog)
		Session.changed.connect(_web_return)
		_read_catalog()
		_web_return()
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


## LES SACHETS EN VENTE ICI, avec leur prix de Play : [{id, qty, price}],
## du plus petit au plus gros. Vide hors du build Play, ou avant les prix.
func sachets() -> Array:
	var list: Array = []
	if not _connected:
		return list
	for id: String in _products:
		if prices.has(id):
			list.push_back({"id": id, "qty": int(_products[id].get("qty", 0)), "price": String(prices[id])})
	list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["qty"]) < int(b["qty"]))
	return list


## Le bonus d'un sachet, en % (« +20 % ») : le serveur le compte sur
## 1 Gold = 1 centime (config/store.ts), 0 pour le plus petit.
func bonus(id: String) -> int:
	return int(_products.get(id, {}).get("bonus", 0))


## CE QUE VAUT `gold` EN VRAIE MONNAIE, au prix du plus petit sachet, dans
## la devise et l'ecriture de Play (« 0,25 € ») : l'UE demande ce prix a cote
## de tout prix en monnaie de jeu (principes CPC, mars 2025). Vide sans prix.
func money(gold: int) -> String:
	var all := sachets()
	if all.is_empty():
		return ""
	var base: Dictionary = all[0]
	var offer: Dictionary = _offers.get(base["id"], {})
	var micros := float(offer.get("price_amount_micros", 0))
	if micros <= 0.0 or int(base["qty"]) <= 0:
		return ""
	return reprice(String(base["price"]), micros / 1000000.0 / float(base["qty"]) * gold)


## « 0,99 € » re-ecrit pour une autre somme, en gardant devise, symbole et
## separateur decimal de Play (« 0,25 € », « $0.25 », « 25 ₫ »).
static func reprice(formatted: String, value: float) -> String:
	var rx := RegEx.create_from_string("\\d[\\d.,\\s\\x{00A0}\\x{202F}]*\\d|\\d")
	var m := rx.search(formatted)
	if m == null:
		return formatted
	var digits := m.get_string()
	var comma := digits.contains(",") and (not digits.contains(".") or digits.rfind(",") > digits.rfind("."))
	var decimals := 0
	var sep_at := digits.rfind("," if comma else ".")
	if sep_at >= 0 and digits.length() - sep_at - 1 <= 2:
		decimals = digits.length() - sep_at - 1
	var text := String.num(value, decimals) if decimals > 0 else str(roundi(value))
	if decimals > 0:
		var parts := text.split(".")
		var frac := (parts[1] if parts.size() > 1 else "").rpad(decimals, "0")
		text = parts[0] + ("," if comma else ".") + frac
	return formatted.substr(0, m.get_start()) + text + formatted.substr(m.get_end())


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
		_products[id] = {"kind": String(p.get("kind", "")), "qty": int(p.get("qty", 0)),
			"bonus": int(p.get("bonus", 0)), "consumable": bool(p.get("consumable", true))}
		var price: Variant = p.get("web")
		if web() and price is Dictionary:
			var cents := int(price.get("cents", 0))
			var code := String(price.get("currency", "EUR"))
			prices[id] = euros(cents, I18N.locale) if code == "EUR" else "%s %.2f" % [code, cents / 100.0]
			_offers[id] = {"formatted_price": prices[id], "price_currency_code": code,
				"price_amount_micros": cents * 10000}
	if web():
		_connected = not prices.is_empty()
		changed.emit()
	elif fresh and _connected:
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


## Des centimes d'euro ecrits comme on les lit dans cette langue :
## « 4,99 € » (fr, es, it, pt-BR, vi), « €4.99 » (en, zh).
static func euros(cents: int, lang: String) -> String:
	var whole := "%d" % floori(cents / 100.0)
	var frac := "%02d" % (cents % 100)
	if lang in ["en", "zh"]:
		return "€%s.%s" % [whole, frac]
	return "%s,%s €" % [whole, frac]


## ACHETER UN SACHET. Rend quand la feuille de Play est ouverte ; le Gold
## arrive par `on_purchase_updated`, dans la bourse de ShopState. Sur le web,
## le formulaire de Stripe s'ouvre par-dessus le jeu et le Gold arrive par
## `_on_checkout` ; sans lui, le jeu PART sur la page de Stripe (meme onglet :
## une fenetre ouverte hors du geste du joueur serait bloquee) et le Gold
## arrive au retour.
func buy(id: String) -> void:
	if not _connected or not prices.has(id) or not buying.is_empty() or not Session.signed_in():
		return
	buying = id
	changed.emit()
	if web():
		var page: Answer = await Net.post_json("/api/store/stripe",
			{"productId": id, "locale": I18N.locale, "embedded": _checkout != null}, Session.token)
		var secret := String(page.body.get("clientSecret", "")) if page.ok else ""
		if not secret.is_empty():
			Analytics.track("begin_checkout", {"item_id": id, "rail": "stripe"})
			_checkout_session = String(page.body.get("sessionId", ""))
			_checkout.open(String(page.body.get("publishableKey", "")), secret, _checkout_cb)
			return
		var url := String(page.body.get("url", "")) if page.ok else ""
		if not url.begins_with("https://"):
			_fail(page.error() if not page.ok or page.body.has("error") else "store_unavailable")
			return
		Analytics.track("begin_checkout", {"item_id": id, "rail": "stripe"})
		JavaScriptBridge.eval("window.location.assign(%s)" % JSON.stringify(url), true)
		return
	var check: Answer = await Net.send_json("/api/store/play", HTTPClient.METHOD_PUT, {"productId": id}, Session.token)
	if not check.ok or check.body.has("error"):
		_fail(check.error())
		return
	_client.set_obfuscated_account_id(String(Session.player.get("id", "")).sha256_text())
	Analytics.track("begin_checkout", {"item_id": id, "rail": "play"})
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
	_credited(res.body, id, "play", String(p.get("order_id", "")))


## LE GOLD EST DANS LA BOURSE (Play ou Stripe) : l'etal relu, le mot, l'analytics.
func _credited(body: Dictionary, id: String, rail: String, order: String) -> void:
	var shop := ShopState.shared()
	shop.shop = body
	shop.refresh()
	Home.refresh()
	_done()
	var bought: Dictionary = body.get("bought", {})
	if not bool(body.get("alreadyCredited", false)):
		var offer: Dictionary = _offers.get(id, {})
		Analytics.track("purchase", {"currency": String(offer.get("price_currency_code", "USD")),
			"value": float(offer.get("price_amount_micros", 0)) / 1000000.0, "item_id": id,
			"rail": rail, "transaction_id": order})
		Analytics.track("earn_virtual_currency", {"virtual_currency_name": "gold", "value": int(bought.get("qty", 0))})
		shop.noted.emit(I18N.f("gold.got", [I18N.group_digits(int(bought.get("qty", 0)))]), false)
		got_gold.emit(int(bought.get("qty", 0)))


## LE FORMULAIRE SE FERME : paye ('complete'), ferme par la croix ('closed',
## rien a dire) ou en panne ('error:…', Stripe.js injoignable).
func _on_checkout(args: Array) -> void:
	var state := String(args[0]) if args.size() > 0 else ""
	if state == "complete":
		_credit_stripe(_checkout_session, false)
	elif state.begins_with("error"):
		_fail("store_unavailable", "stripe embedded " + state.left(80))
	else:
		_done()


## DE RETOUR DE STRIPE : `?gold=done&session_id=cs_…` dans l'adresse. Le
## serveur lit la session chez Stripe et credite (une fois, meme si le webhook
## est passe avant). Une reponse a refaire (Stripe muet, paiement lent) garde
## l'adresse : un rechargement redemande ; le webhook, lui, n'attend pas.
func _web_return() -> void:
	if not web() or _returning or not Session.signed_in():
		return
	var query := str(JavaScriptBridge.eval("location.search", true))
	var args := {}
	for pair in query.trim_prefix("?").split("&", false):
		var kv := pair.split("=", true, 1)
		args[kv[0].uri_decode()] = kv[1].uri_decode() if kv.size() > 1 else ""
	var state := String(args.get("gold", ""))
	if state.is_empty():
		return
	var session_id := String(args.get("session_id", ""))
	if state != "done" or not session_id.begins_with("cs_"):
		_clean_address()
		return
	_credit_stripe(session_id, true)


## CREDITER UNE SESSION STRIPE payee. Stripe qui tarde a dire « paye » (une
## reponse `retry`) : on redemande quelques fois, puis le webhook prend le
## relais et le Gold apparait a la prochaine lecture de l'etal.
func _credit_stripe(session_id: String, from_address: bool) -> void:
	if _returning or not session_id.begins_with("cs_"):
		_done()
		return
	_returning = true
	var res: Answer
	for attempt in 5:
		if attempt > 0:
			await get_tree().create_timer(2.0).timeout
		res = await Net.get_json("/api/store/stripe?session=" + session_id.uri_encode(), Session.token)
		if res.ok and not res.body.has("error") or not bool(res.body.get("retry", false)):
			break
	_returning = false
	if not res.ok or res.body.has("error"):
		if from_address and not bool(res.body.get("retry", false)):
			_clean_address()
		_fail(res.error(), "stripe return %s" % res.error())
		return
	if from_address:
		_clean_address()
	var bought: Dictionary = res.body.get("bought", {})
	var id := "gold_%d" % int(bought.get("qty", 0))
	_credited(res.body, id, "stripe", session_id)


func _clean_address() -> void:
	JavaScriptBridge.eval("history.replaceState(null, '', location.pathname + location.hash)", true)


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
