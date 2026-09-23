class_name ShopState
extends Node
## LA BOUTIQUE ET LE TABLEAU DES PIEGES, en un seul noeud.
##
## Porte de src/components/use-shop.ts, et de ce qu'il a decide :
##
##   • UN SEUL CROCHET pour l'etal, les pieges et les clotures, parce que
##     c'est UNE decision : un piege achete est un piege qu'il faut POSER, et
##     les deux vivent sur le meme ecran pour ca. Deux lectures, deux etats
##     de chargement, et deux chances que le compte de l'etal ne soit pas
##     d'accord avec celui du sol.
##   • LE SERVEUR A RAISON SUR CHAQUE NOMBRE. Rien n'est incremente d'avance :
##     un etal qui montre un objet qu'on n'a pas eu est pire qu'un etal qui
##     prend un instant, et la reponse porte deja le nouvel etat, donc un
##     achat rafraichit tout dans le meme aller-retour.
##   • LE REFUS EST UN CODE, jamais une phrase : le serveur ne sait pas
##     laquelle des quatre langues ce joueur lit. Les mots vivent sous
##     `shopErrors` du dictionnaire, et un code sans ligne dit quand meme
##     quelque chose (`fallback`) — un refus silencieux est le seul resultat
##     sur lequel un joueur ne peut rien faire.
##
## PAS UN AUTOLOAD : project.godot ne bouge pas d'une ligne pour un panneau.
## Le premier ecran qui en a besoin appelle `ShopState.shared()`, qui le cree
## et le pose sous la racine ; les suivants trouvent le meme. Ce que le
## terrier repond passe par `noted`, que le chrome pose en pastille — la meme
## porte que Home.noted, pour la meme raison (home.gd).
##
## Ce fichier porte aussi LA FACE DES OBJETS (item-meta.ts) : l'art, la
## teinte et le sens du compte de chaque sorte. Un seul registre, parce que
## deux surfaces le lisent — l'etal qui les vend et la rangee du kit qui
## montre ce qu'on porte — et une copie aurait derive a la premiere retouche.
## Les NOMS n'y sont pas : ils changent avec la langue, donc `I18N.t("items.
## <kind>.name")`.

## L'etal, les pieges, les clotures ou le mot du moment ont change. Sans
## argument : un ecouteur relit ce qu'il veut sur `shop`, `traps`, `fences`.
signal changed

## Une phrase a montrer, et si c'est un refus (`setNote` du web).
signal noted(text: String, refused: bool)

## Un achat en carottes vient d'etre conclu.
signal bought(kind: String, qty: int)

## L'exemplaire vivant, pour qui doit lui parler.
static var current: ShopState

## Les sortes que l'etal vend (`ItemKind`), dans l'ordre du serveur.
const KINDS := ["trap", "bomb", "lightning", "shield", "energy", "smoke", "mirage", "fence"]

## L'ART D'UNE SORTE, la ou le jeu en a (item-meta.ts `art`). Quelques-unes
## seulement, et c'est voulu : ce sont les sprites du COFFRE, donc une sorte a
## un dessin exactement quand un coffre peut la lacher. La bombe qu'on porte
## est la bombe allumee ; le piege est la bombe eteinte, celle qui attend dans
## le sol (shop-card.tsx `BOMB_SRC`). L'energie prend le medaillon de la
## jauge, pas une carotte (elle se PAIE en carottes, une carotte lirait comme
## le prix) ni un eclair (il appartient a LIGHTNING sur le meme etal). La
## cloture est le DECOR que le terrier dessine, pour que l'etal et le potager
## montrent les memes poteaux. Fumee et mirage n'ont pas d'art : le web y met
## un emoji, et la face pixel n'en a pas.
const ART := {
	"trap": preload("res://assets/ui/icons/bomb.png"),
	"bomb": preload("res://assets/ui/icons/bomb-lit.png"),
	"lightning": preload("res://assets/ui/icons/bolt.webp"),
	"shield": preload("res://assets/ui/icons/shield.webp"),
	"energy": preload("res://assets/gauge/dial-icon.webp"),
	"fence": preload("res://assets/deco/fence.png"),
}

## LA TEINTE D'UNE SORTE (item-meta.ts `tint`) : chacune dit ce que la chose
## FAIT. Le piege est de la terre enfouie, la bombe rouge de meche, l'eclair
## jaune d'orage, le bouclier d'acier froid, l'energie orange carotte, la
## cloture l'ocre de ses rails. Un etal ou chaque carte est du meme gris est
## la version que ceci remplace. Ce sont des donnees d'objet, pas la palette
## du chrome — elles vivent ici, en regard de leur source.
const TINT := {
	"trap": Color("#8a5a2b"),
	"bomb": Color("#c1442e"),
	"lightning": Color("#e0a020"),
	"shield": Color("#4a7fa5"),
	"energy": Color("#e07a2f"),
	"smoke": Color("#6b7a8f"),
	"mirage": Color("#9a6bd6"),
	"fence": Color("#b98a3c"),
}

## COMMENT SE LIT LE COMPTE d'une sorte (item-meta.ts `counts`) : "carried",
## une chose qu'on tient, "3/20" ; "daily", les recharges que la journee
## permet encore — l'energie n'est jamais TENUE, elle s'applique a l'achat ;
## "time", pas une chose du tout — la fumee est un instant d'expiration, dit
## en jours de couverture.
const COUNTS := {
	"trap": "carried",
	"bomb": "carried",
	"lightning": "carried",
	"shield": "carried",
	"energy": "daily",
	"smoke": "time",
	"mirage": "carried",
	"fence": "carried",
}

## ShopState du web : stock, items[], traps{held, placed, armed, rearming,
## nextRearmAt, maxPlaced, drain, freePerDay}, usdcEnabled, tokens[], rates.
var shop: Dictionary = {}
## TrapState : placed[], armed[], rearming[], held, maxPlaced, maxHeld, drain.
var traps: Dictionary = {}
## FenceState : placed[], spans[], offers[], held, maxHeld.
var fences: Dictionary = {}
## Vrai pendant un achat — les boutons qui depensent se grisent dessus.
var busy := false
## Le mot du moment, tel que le pied de l'etal le montre (`note` du web) ;
## vide quand il n'y a rien a dire. `refused` dit s'il se lit en rouge.
var note := ""
var refused := false

## Le banc pose des donnees factices et coupe le reseau.
var _fake := false


## L'EXEMPLAIRE PARTAGE, cree au premier appel et pose sous la racine.
## `get` est deja une methode d'Object (`get(property)`) : une statique du
## meme nom ne compile pas, d'ou `shared`.
static func shared() -> ShopState:
	if current == null:
		current = ShopState.new()
		current.name = "ShopState"
		var root := (Engine.get_main_loop() as SceneTree).root
		# Differe : le premier appel vient souvent d'un `_ready`, pendant que la
		# racine pose encore ses enfants, et un add_child direct y est refuse.
		root.call_deferred("add_child", current)
	return current


func _ready() -> void:
	noted.connect(_toast)
	Session.changed.connect(_on_session_changed)
	if Session.signed_in() and not _fake:
		refresh()


## Ce que la boutique dit va sous la barre du haut, comme ce que dit le
## terrier. Sans chrome (un banc), la phrase reste dans `note`.
func _toast(text: String, bad: bool) -> void:
	if Chrome.current != null:
		Chrome.current.toast(text, bad)


func _on_session_changed() -> void:
	if _fake:
		return
	if Session.signed_in():
		refresh()
	else:
		shop = {}
		traps = {}
		fences = {}
		changed.emit()


func loaded() -> bool:
	return not shop.is_empty()


## RELIRE l'etal, les pieges et les clotures — les trois a la fois, comme le
## `Promise.all` du web. Silencieux : une lecture qui echoue garde ce qu'on a.
func refresh() -> void:
	if _fake or not Session.signed_in():
		return
	var s: Answer = await Net.get_json("/api/shop", Session.token)
	var t: Answer = await Net.get_json("/api/traps", Session.token)
	var f: Answer = await Net.get_json("/api/fences", Session.token)
	if s.ok and not s.body.has("error"):
		shop = s.body
	if t.ok and not t.body.has("error"):
		traps = t.body
	if f.ok and not f.body.has("error"):
		fences = f.body
	changed.emit()


## ACHETER EN CAROTTES. La reponse porte le nouvel etal, donc rien n'est
## devine. Rend la reponse du serveur, ou {} sur un refus — qui a deja ete
## dit par `noted`.
func buy(kind: String, qty: int = 1) -> Dictionary:
	if busy or not Session.signed_in() or _fake:
		return {}
	busy = true
	_say("", false)
	var answer: Answer = await Net.post_json("/api/shop", {"kind": kind, "qty": qty}, Session.token)
	busy = false
	var res: Dictionary = answer.body
	if res.has("error") or not answer.ok:
		_say(message(answer.error()), true)
		return {}
	shop = res
	# Un achat de piege change aussi ce que le sol permet.
	if kind == "trap":
		refresh()
	# Le stock a bouge : la pastille et les cartes le relisent.
	Home.refresh()
	_say(receipt(kind, qty, int(res.get("spent", 0))), false)
	bought.emit(kind, qty)
	return res


## POSER UN PIEGE sur une case du terrier. Vrai quand le sol le tient
## vraiment : l'appelant doit dessiner la marque, et ne doit pas en dessiner
## une pour une pose que le serveur a refusee.
func place_trap(tile: int) -> bool:
	if not Session.signed_in() or _fake:
		return false
	_say("", false)
	var answer: Answer = await Net.post_json("/api/traps", {"tile": tile}, Session.token)
	return _took(answer, "traps")


## RELEVER UNE BOMBE d'une case. L'autre moitie de `place_trap`, de la meme
## forme : la marque ne part qu'une fois que le serveur dit la case libre. La
## case va dans l'URL, pas dans un corps : un corps de DELETE est legal, mais
## c'est la seule chose qu'un proxy devant l'app peut laisser tomber — et il
## y en a un, ce qui est pourquoi relever une bombe marchait en Storybook et
## ne faisait rien en production.
func remove_trap(tile: int) -> bool:
	if not Session.signed_in() or _fake:
		return false
	_say("", false)
	var answer: Answer = await _delete("/api/traps?tile=%d" % tile)
	return _took(answer, "traps")


## RELEVER TOUTES LES BOMBES en un appel : un aller-retour au lieu de huit
## pour un defenseur qui refait toute sa defense. Rend les cases qui ETAIENT
## minees, pour que l'appelant retire exactement ces marques-la.
func clear_traps() -> Array:
	if not Session.signed_in() or _fake:
		return []
	_say("", false)
	var had: Array = traps.get("placed", []).duplicate()
	var answer: Answer = await _delete("/api/traps?all=1")
	return had if _took(answer, "traps") else []


## RETIRER TOUTES LES PLANCHES (`DELETE /api/fences?all=1`) : elles
## reviennent entieres dans le sac. Rend combien.
func clear_fences() -> int:
	if not Session.signed_in() or _fake:
		return 0
	_say("", false)
	var answer: Answer = await _delete("/api/fences?all=1")
	var n := int(answer.body.get("cleared", 0))
	return n if _took(answer, "fences") else 0


## NETTOYER LA BASE : toutes les bombes et toutes les planches, au sac. Le
## serveur fait les deux (une bombe en recharge est relevee sans etre rendue,
## comme a l'unite). Rend `[bombes, planches]`.
func clear_base() -> Array:
	var bombs := await clear_traps()
	var planks := await clear_fences()
	return [bombs.size(), planks]


## Y a-t-il quelque chose a nettoyer ?
func base_dirty() -> bool:
	var t: Variant = traps.get("placed", [])
	var f: Variant = fences.get("placed", [])
	return (t is Array and not (t as Array).is_empty()) or (f is Array and not (f as Array).is_empty())


## POSER UNE PLANCHE sur un bord du potager. La regle de la porte vit sur le
## serveur : une planche qui fermerait le terrier revient comme un refus avec
## des mots (`would_seal_burrow`) plutot que comme une planche qui apparait
## puis disparait a la relecture suivante.
func place_fence(tile: int, side: String) -> bool:
	if not Session.signed_in() or _fake:
		return false
	_say("", false)
	var answer: Answer = await Net.post_json("/api/fences", {"tile": tile, "side": side}, Session.token)
	return _took(answer, "fences")


## En retirer une. Elle revient entiere dans le sac — voir la route.
func remove_fence(tile: int, side: String) -> bool:
	if not Session.signed_in() or _fake:
		return false
	_say("", false)
	var answer: Answer = await _delete("/api/fences?tile=%d&side=%s" % [tile, side.uri_encode()])
	return _took(answer, "fences")


## Le sort commun d'une pose ou d'un retrait : le refus se dit, la reussite
## adopte l'etat rendu et relit l'etal (le sac a bouge, ses comptes aussi).
func _took(answer: Answer, what: String) -> bool:
	if answer.body.has("error") or not answer.ok:
		_say(message(answer.error()), true)
		return false
	if what == "traps":
		traps = answer.body
	else:
		fences = answer.body
	refresh()
	changed.emit()
	return true


## LE MOT D'UN REFUS (use-shop.ts `shopMessage`) : `shopErrors.<code>`, ou
## `shopErrors.fallback` pour un code sans ligne. I18N rend le chemin lui-meme
## quand il ne trouve rien ; c'est ce qu'on teste.
func message(code: String) -> String:
	if code.is_empty():
		return ""
	if code == "offline":
		return I18N.t("err_offline")
	var path := "shopErrors." + code
	var text := I18N.t(path)
	return I18N.t("shopErrors.fallback") if text == path else text


## CE QUE DIT UN ACHAT REUSSI (use-shop.ts `purchaseNote`) : nomme par objet,
## parce que « 1 objet achete » est un recu et ceci est un jeu.
func receipt(kind: String, qty: int, spent: int) -> String:
	var paid := I18N.f("shop.paid", [I18N.group_digits(spent)])
	match kind:
		"energy":
			return I18N.f("shop.boughtEnergy", [paid])
		"trap":
			return I18N.f("shop.boughtTrap", [qty, paid])
		"bomb":
			return I18N.f("shop.boughtBomb", [qty, paid])
		"lightning":
			return I18N.f("shop.boughtLightning", [qty, paid])
		"shield":
			return I18N.f("shop.boughtShield", [qty, paid])
		"smoke":
			return I18N.f("shop.boughtSmoke", [paid])
		"mirage":
			return I18N.f("shop.boughtMirage", [qty, paid])
		"fence":
			return I18N.f("shop.boughtFence", [qty, paid])
	return paid


## LA LIGNE DU COMPTE d'un objet (item-meta.ts `heldLabel`) : "3/20",
## "2 today", "1d left". Partagee pour que l'etal et la case du kit disent la
## meme chose des memes avoirs.
static func held_label(kind: String, held: int, cap: int) -> String:
	match COUNTS.get(kind, "carried"):
		"daily":
			return I18N.f("shop.heldToday", [cap - held])
		"time":
			return I18N.f("shop.heldDaysLeft", [held]) if held > 0 else I18N.t("shop.heldOff")
	return I18N.f("shop.heldOf", [held, cap])


## Les objets de l'etal, dans l'ordre du serveur.
func items() -> Array:
	var list: Variant = shop.get("items", [])
	return list if list is Array else []


## L'ENERGIE MENE L'ETAL (Paul, 2026-09-16) : c'est la recharge qu'on achete
## le plus, et « Out of energy » envoie ici pour elle — donc la premiere carte
## qu'on voit, pas la cinquieme hors du bord. Les autres gardent l'ordre du
## serveur (shop-card.tsx `shelfOrder`).
func shelf_order() -> Array:
	var out: Array = []
	for it in items():
		if it.get("kind", "") == "energy":
			out.push_front(it)
		else:
			out.push_back(it)
	return out


## Un objet par sa sorte, ou {}.
func item(kind: String) -> Dictionary:
	for it in items():
		if it.get("kind", "") == kind:
			return it
	return {}


## Les carottes du terrier telles que l'etal les a lues.
func stock() -> int:
	return int(shop.get("stock", Home.burrow.get("stock", 0)))


## Ce que dit le pied de l'etal, et si c'est un refus.
func _say(text: String, bad: bool) -> void:
	note = text
	refused = bad
	if not text.is_empty():
		noted.emit(text, bad)
	changed.emit()


## Effacer le mot du moment (le web le fait a la fermeture du dialogue).
func clear_note() -> void:
	note = ""
	refused = false


## DES DONNEES FACTICES, pour le banc : l'etal et les pieges qu'on lui donne,
## et plus jamais le reseau. `items` a la forme de ShopItem[] ; `traps` celle
## de ShopState.traps.
func fake(fake_items: Array, fake_traps: Dictionary, usdc_enabled: bool = false) -> void:
	_fake = true
	shop = {
		"stock": Home.burrow.get("stock", 0),
		"items": fake_items,
		"traps": fake_traps,
		"usdcEnabled": usdc_enabled,
		"tokens": ["usdc", "sol", "skr"] if usdc_enabled else [],
		"rates": null,
	}
	traps = {
		"placed": [], "armed": [], "rearming": [],
		"held": fake_traps.get("held", 0),
		"maxPlaced": fake_traps.get("maxPlaced", 0),
		"maxHeld": Tuning.i("SHOP.MAX_HELD"),
		"drain": fake_traps.get("drain", 0),
	}
	fences = {"placed": [], "spans": [], "offers": [], "held": 0, "maxHeld": 0}
	changed.emit()


## DELETE, que Net n'offre pas : le meme aller-retour que Net._send, avec le
## Bearer, sans corps. Une requete fraiche par appel, pour la raison que
## net.gd donne. Si Net gagne un `delete_json`, ceci disparait.
func _delete(path: String) -> Answer:
	var request := HTTPRequest.new()
	request.timeout = Net.TIMEOUT_SECONDS
	add_child(request)
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"Authorization: Bearer %s" % Session.token,
	])
	Net.begin()
	var started := request.request(Net.HOST + path, headers, HTTPClient.METHOD_DELETE, "")
	if started != OK:
		request.queue_free()
		Net.end()
		return Answer.new(0, {})
	var result: Array = await request.request_completed
	request.queue_free()
	Net.end()
	var code: int = result[1]
	var raw: PackedByteArray = result[3]
	var parsed: Variant = JSON.parse_string(raw.get_string_from_utf8())
	return Answer.new(code, parsed if parsed is Dictionary else {})
