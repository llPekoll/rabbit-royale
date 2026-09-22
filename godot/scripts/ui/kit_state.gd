class_name KitState
extends RefCounted
## CE QUE LE JOUEUR PORTE, tel que le serveur le dit : la boutique et les
## clotures, en une seule lecture.
##
## Porte de la moitie « lecture » de src/components/use-shop.ts. La boutique
## et le plateau des pieges sont UN etat parce qu'ils sont UNE decision : un
## piege achete est un piege qu'il faut ensuite POSER, et les deux vivent sur
## le meme ecran pour cette raison. Deux lectures separees, c'est deux
## chances pour le compte de la boutique de contredire celui du plateau.
##
## LE SERVEUR EST L'AUTORITE SUR CHAQUE NOMBRE. Rien n'est incremente ici a
## l'optimiste — une boutique qui montre un objet qu'on n'a pas eu est pire
## qu'une qui prend un instant — et rien n'est ACHETE d'ici : la rangee du
## kit emet ses signaux (`buy_trap_pressed`, `use_shield`, `pour`), et c'est
## la boutique qui poste, puis rappelle `refresh()`.
##
## Un RefCounted, pas un noeud : il n'a rien a dessiner ni a faire tourner,
## et la rangee qui le tient meurt avec lui.

## Les deux lectures sont arrivees (ou l'une a echoue en silence : ce qu'on
## a reste vrai a une lecture pres).
signal changed

## ShopState (use-shop.ts) : stock, items[] {kind, price, usdc, held, cap,
## canBuy, hasRoom}, traps {held, placed, armed, rearming, nextRearmAt,
## maxPlaced, drain, freePerDay}, usdcEnabled, tokens, rates.
var shop: Dictionary = {}
## FenceState (/api/fences) : placed[], spans[], offers[] ({tile, side}),
## held, maxHeld.
var fences: Dictionary = {}
## Une lecture est en vol.
var busy := false
## Le banc pose ses donnees a la main et ne veut pas de reseau.
var offline := false


## RELIRE les deux, ensemble. Silencieux sur l'echec : le prochain appel
## reessaiera.
func refresh() -> void:
	if offline or busy or not Session.signed_in():
		return
	busy = true
	var shop_answer: Answer = await Net.get_json("/api/shop", Session.token)
	var fence_answer: Answer = await Net.get_json("/api/fences", Session.token)
	busy = false
	if shop_answer.ok:
		shop = shop_answer.body
	if fence_answer.ok:
		fences = fence_answer.body
	changed.emit()


## Poser un etat venu d'ailleurs — la reponse d'un achat, ou le banc.
func adopt_shop(body: Dictionary) -> void:
	shop = body
	changed.emit()


func adopt_fences(body: Dictionary) -> void:
	fences = body
	changed.emit()


func loaded() -> bool:
	return not shop.is_empty()


## L'article d'une sorte ("trap", "bomb", "lightning", "shield", "energy",
## "smoke", "mirage", "fence"), ou vide.
func item(kind: String) -> Dictionary:
	for entry in shop.get("items", []):
		if entry is Dictionary and String(entry.get("kind", "")) == kind:
			return entry
	return {}


## Combien on en porte. Pour la fumee, c'est des JOURS (item-meta.ts
## `counts: 'time'`) ; pour l'energie, les recharges du jour.
func held(kind: String) -> int:
	return int(item(kind).get("held", 0))


func traps() -> Dictionary:
	var t: Variant = shop.get("traps", {})
	return t if t is Dictionary else {}


func traps_placed() -> int:
	return int(traps().get("placed", 0))


func traps_armed() -> int:
	return int(traps().get("armed", 0))


func traps_held() -> int:
	return int(traps().get("held", 0))


func fences_placed() -> int:
	return (fences.get("placed", []) as Array).size()


func fence_spans() -> int:
	return (fences.get("spans", []) as Array).size()


func fence_offers() -> int:
	return (fences.get("offers", []) as Array).size()


func fences_held() -> int:
	return int(fences.get("held", 0))
