class_name RaidDoor
extends RefCounted
## PEUT-ON LE RAIDER ? — le verdict que le serveur ecrit a cote d'un nom
## (src/lib/game/raid-door.ts), lu de la meme facon sur le tableau de saison
## et dans le journal des raids du profil.
##
## « Partout ou tu vois leur nom, ca doit etre ecrit si tu peux l'attaquer, ou
## le regarder en jeu pour l'attaquer, et s'il est sous bouclier le temps avant
## la prochaine attaque » (2026-10-13). Un verdict a la forme
## {state, waitMs, presence} :
##
##   open    un raid passe maintenant ;
##   shield  son bouclier, ou mon propre delai sur lui : `waitMs` avant qu'il passe ;
##   bare    rien a prendre ; asleep  endormi et deja vole ;
##   locked  sous RABBIT_LEVELS.RAID_MIN ; solo  hors PvP (ni raid ni regarder).
##
## `waitMs` est une DUREE mesuree a l'arrivee (`stamp`) : ce qui reste est
## cela moins le temps ecoule depuis, et un bouclier qui tombe pendant que
## l'ecran est ouvert ouvre la porte tout seul.

const OPEN := "open"
const SHIELD := "shield"
const SOLO := "solo"


## Le verdict tel que l'API le rend, date de son arrivee ; vide si absent.
static func stamp(door: Variant) -> Dictionary:
	if not door is Dictionary or (door as Dictionary).is_empty():
		return {}
	var d: Dictionary = (door as Dictionary).duplicate()
	d["_at"] = Time.get_ticks_msec()
	return d


## Ce qui reste du bouclier (ou du delai), en ms.
static func wait_left(door: Dictionary) -> float:
	if String(door.get("state", "")) != SHIELD:
		return 0.0
	return maxf(0.0, float(door.get("waitMs", 0)) - float(Time.get_ticks_msec() - int(door.get("_at", 0))))


static func can_raid(door: Dictionary) -> bool:
	var state := String(door.get("state", ""))
	return state == OPEN or (state == SHIELD and wait_left(door) <= 0.0)


## Il creuse : son ile se regarde, et de la on le foudroie ou on l'encre.
## `presence` vient du socket quand on l'a (plus frais), sinon du verdict.
static func can_watch(door: Dictionary, presence: String = "") -> bool:
	var where := presence if not presence.is_empty() else String(door.get("presence", "away"))
	return where == "digging" and String(door.get("state", "")) != SOLO


## La ligne ecrite sous le nom.
static func line(door: Dictionary, presence: String = "") -> String:
	var watch := can_watch(door, presence)
	if can_raid(door):
		return I18N.t("raid.door.openDigging" if watch else "raid.door.open")
	var state := String(door.get("state", ""))
	if state == SHIELD:
		var wait := I18N.short_wait(wait_left(door))
		return I18N.f("raid.door.shieldDigging" if watch else "raid.door.shield", [wait])
	if watch:
		return I18N.t("raid.door.digging")
	return I18N.t("raid.door." + state)


## Le ton de la ligne : `raid` (on peut y aller), `watch` (seulement le
## regarder), `wait` (un bouclier qui tombera), `shut` (rien a faire).
static func tone(door: Dictionary, presence: String = "") -> String:
	if can_raid(door):
		return "raid"
	if can_watch(door, presence):
		return "watch"
	if String(door.get("state", "")) == SHIELD:
		return "wait"
	return "shut"
