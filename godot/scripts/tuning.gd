extends Node
## LES NOMBRES DU JEU, lus dans config/tuning.ts.
##
## `tools/export-godot-tuning.ts` exporte chaque table de tuning.ts en
## assets/tuning.json ; ce noeud les sert par leur chemin :
## `Tuning.n("ENERGY.MAX")`, `Tuning.table("RAID_RUN")`,
## `Tuning.list("ISLAND_TIERS")`. Le README du web pose la regle — chaque
## nombre de design vit dans tuning.ts et nulle part ailleurs — et un client
## qui en retape un le fige le jour ou il change.
##
## Les deux FONCTIONS que le chrome lit (`regenPerHour`, `upgradeCost`) ne
## sont pas des donnees ; elles sont portees ici a la main, en regard de leur
## source, pour que l'ecart se voie.

const FILE := preload("res://assets/tuning.json")

var _tables: Dictionary = {}


func _ready() -> void:
	_tables = (FILE as JSON).data


## Un nombre a un chemin : "ENERGY.MAX", "QUESTS.CARROTS.break-ground".
func n(path: String, fallback: float = 0.0) -> float:
	var v: Variant = _walk(path)
	return float(v) if (v is int or v is float) else fallback


func i(path: String, fallback: int = 0) -> int:
	return int(n(path, float(fallback)))


func table(path: String) -> Dictionary:
	var v: Variant = _walk(path)
	return v if v is Dictionary else {}


func list(path: String) -> Array:
	var v: Variant = _walk(path)
	return v if v is Array else []


## LE PLANCHER D'UN RAID (energy-panel.tsx `RAID_FLOOR`) : le peage pour
## entrer, plus les pas garantis.
func raid_floor() -> int:
	return i("RAID_RUN.TOLL") + i("RAID_RUN.WALK_FLOOR") * i("RAID_RUN.STEP_COST")


## `regenPerHour(level)` — tuning.ts:616.
func regen_per_hour(level: int) -> float:
	var steps := maxi(0, mini(level, i("OUT_OF_RUN_ENERGY.REGEN_LEVEL_CAP", level)) - 1)
	return n("OUT_OF_RUN_ENERGY.REGEN_PER_HOUR") + n("OUT_OF_RUN_ENERGY.REGEN_PER_LEVEL") * steps


## `upgradeCost(level)` — tuning.ts:1569.
func upgrade_cost(level: int) -> int:
	return int(round(n("BURROW.UPGRADE_BASE_COST") * pow(n("BURROW.UPGRADE_GROWTH"), level - 1)))


## `tierFor(lifetime)` — le palier d'ile le plus haut que les carottes
## ouvrent.
func tier_for(lifetime: float) -> Dictionary:
	var tiers := list("ISLAND_TIERS")
	var chosen: Dictionary = tiers[0] if not tiers.is_empty() else {}
	for tier in tiers:
		if lifetime >= float(tier.get("minLifetime", 0)):
			chosen = tier
	return chosen


func _walk(path: String) -> Variant:
	var node: Variant = _tables
	for part in path.split("."):
		if node is Dictionary and (node as Dictionary).has(part):
			node = node[part]
		else:
			return null
	return node
