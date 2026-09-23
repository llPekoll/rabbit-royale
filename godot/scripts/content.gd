class_name Content
## LE CONTENU QUI N'EST NI UN NOMBRE NI UN MOT : les chapitres du codex et
## la prose des quetes, assembles comme src/i18n/content.ts le fait.
##
## Le serveur envoie une quete SANS ses phrases (`title`, `ask`, `line` vides
## dans QuestView) : c'est le client qui les lit dans sa langue, parce que
## quatre langues sur le serveur seraient quatre langues a deployer. Meme
## regle ici.

## config/lore.ts — les cinq chapitres, leur numeral et leur seuil en
## carottes cumulees. Les mots sont dans I18N ("lore.<id>").
const LORE := [
	{"id": "the-island", "numeral": "I", "unlockAt": 0},
	{"id": "the-numbers", "numeral": "II", "unlockAt": 500},
	{"id": "the-burrow", "numeral": "III", "unlockAt": 2000},
	{"id": "the-crown", "numeral": "IV", "unlockAt": 8000},
	{"id": "the-tide", "numeral": "V", "unlockAt": 25000},
]

## config/quests.ts — les marques que le client pose lui-meme.
const MARK_LEADERBOARD := "leaderboard"
const MARK_CODEX_PREFIX := "codex:"


static func codex_mark(chapter_id: String) -> String:
	return MARK_CODEX_PREFIX + chapter_id


## Combien de chapitres `lifetime` carottes ouvrent.
static func unlocked_count(lifetime: float) -> int:
	var n := 0
	for chapter in LORE:
		if lifetime >= float(chapter["unlockAt"]):
			n += 1
	return n


## Le prochain chapitre scelle, et ce qu'il manque — ou vide si tout est lu.
static func next_chapter(lifetime: float) -> Dictionary:
	for chapter in LORE:
		if lifetime < float(chapter["unlockAt"]):
			return {"chapter": chapter, "remaining": float(chapter["unlockAt"]) - lifetime}
	return {}


## Un chapitre avec ses mots : titre, accroche, corps.
static func lore_chapter(chapter: Dictionary) -> Dictionary:
	var id := String(chapter["id"])
	var out := chapter.duplicate()
	out["title"] = I18N.t("lore.%s.title" % id)
	out["teaser"] = I18N.t("lore.%s.teaser" % id)
	out["body"] = I18N.list("lore.%s.body" % id)
	return out


## LES PHRASES D'UNE QUETE (content.ts `questText`). Chaque branche lit sa
## propre entree parce que les `ask` n'ont pas la meme signature : une prend
## un compte, une un numeral, la plupart rien.
static func quest_text(quest: Dictionary) -> Dictionary:
	var id := String(quest.get("id", ""))
	var base := "quests.%s." % id
	match id:
		"break-ground":
			return {
				"title": I18N.t(base + "title"),
				"ask": I18N.f(base + "ask", [Tuning.i("QUESTS.FIRST_DIG_TILES")]),
				"line": I18N.t(base + "line"),
			}
		"read-the-stones":
			return {
				"title": I18N.t(base + "title"),
				"ask": I18N.f(base + "ask", [LORE[1]["numeral"]]),
				"line": I18N.t(base + "line"),
			}
		"hold-the-door":
			return {
				"title": I18N.t(base + "title"),
				"ask": I18N.f(base + "ask", [Tuning.i("QUESTS.HOLD_THE_DOOR_TRAPS")]),
				"line": I18N.t(base + "line"),
			}
		"the-thicket":
			var tiers := Tuning.list("ISLAND_TIERS")
			var tier: Dictionary = tiers[1] if tiers.size() > 1 else {"name": "Thicket", "minLifetime": 0}
			return {
				"title": I18N.f(base + "title", [I18N.island_name(String(tier["name"]))]),
				"ask": I18N.f(base + "ask", [I18N.group_digits(float(tier["minLifetime"]))]),
				"line": I18N.t(base + "line"),
			}
		_:
			return {
				"title": I18N.t(base + "title"),
				"ask": I18N.t(base + "ask"),
				"line": I18N.t(base + "line"),
			}


## La quete du serveur, avec ses mots dedans.
static func quest_view(quest: Dictionary) -> Dictionary:
	var out := quest.duplicate()
	out.merge(quest_text(quest), true)
	return out


## LA LIGNE « ET MAINTENANT » (config/next-action.ts), quand toutes les
## quetes sont prises : la premiere regle qui tient, dans cet ordre.
## `s` porte energy, runCost, nextRunInMs, gardenReady, gardenCapacity,
## shieldMs, trapsLive, targets [{name, garden, shielded}].
static func next_action(s: Dictionary) -> Dictionary:
	var garden_ready := float(s.get("gardenReady", 0))
	var garden_cap := float(s.get("gardenCapacity", 0))
	if garden_cap > 0.0 and garden_ready >= garden_cap * Tuning.n("NEXT_ACTION.GARDEN_FULL_SHARE"):
		return {"door": "garden", "text": I18N.t("next.gardenFull")}

	var shield_ms: Variant = s.get("shieldMs", null)
	if shield_ms != null and float(shield_ms) <= Tuning.n("NEXT_ACTION.SHIELD_WARNING_MS") \
			and int(s.get("trapsLive", 0)) < Tuning.i("NEXT_ACTION.TRAPS_WANTED"):
		return {"door": "base", "text": I18N.f("next.shieldLifts", [I18N.wait(float(shield_ms))])}

	var richest: Dictionary = {}
	for target in s.get("targets", []):
		if bool(target.get("shielded", false)):
			continue
		if float(target.get("garden", 0)) < Tuning.n("NEXT_ACTION.RAID_WORTH_GARDEN"):
			continue
		if richest.is_empty() or float(target["garden"]) > float(richest["garden"]):
			richest = target
	if not richest.is_empty() and Chrome.raids_open():
		return {"door": "raid", "text": I18N.f("next.raidTarget",
			[String(richest["name"]), I18N.group_digits(float(richest["garden"]))])}

	var energy := float(s.get("energy", 0))
	if energy >= float(s.get("runCost", 0)):
		return {"door": "farm", "text": I18N.f("next.dig", [int(energy)])}
	var next_run: Variant = s.get("nextRunInMs", null)
	if next_run == null:
		return {"door": "farm", "text": I18N.t("next.digPlain")}
	return {"door": "farm", "text": I18N.f("next.runIn", [I18N.wait(float(next_run))])}
