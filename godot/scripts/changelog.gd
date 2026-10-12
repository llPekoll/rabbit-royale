class_name Changelog
## LE CHANGELOG DANS LE JEU — la version au coin du terrier (version_tag.gd)
## et QUOI DE NEUF (whats_new_dialog.gd).
##
## La source est src/changelog/entries.ts ; tools/build-changelog.ts l'ecrit
## dans assets/changelog.json (et la page rabbit.rip/changelog/). La version
## affichee est donc celle du PACK que le joueur fait tourner : un telephone
## qui n'a pas encore pris le dernier pack OTA dit l'ancienne, et c'est vrai.
##
## CE QUI S'ANNONCE. Une version qui porte une nouveaute (`new`) ou un
## reglage (`tune`) ouvre QUOI DE NEUF a l'arrivee au terrier et allume NEW.
## Des corrections seules (`fix`) montent la version sans rien dire.
##
## LA DERNIERE VERSION VUE vit dans user://changelog.cfg, comptee en
## versions (`seen_count`) et non par son nom : le nom se recalcule (une
## version de correctifs seuls est devenue v1.2.1), le nombre jamais, la
## liste ne fait que grandir. L'ancienne cle `seen` = "v1.N" vaut N + 1 (avant
## le 2026-10-12, chaque version montait d'un cran). Sans rien :
##   • un nouveau joueur (tuto a faire) est mis a jour en silence — il n'a
##     rien manque ;
##   • un joueur d'avant le changelog voit la derniere version seulement, pas
##     tout l'historique d'un coup.

## PRELOAD : un `load()` d'un chemin n'est pas vu par l'exportateur (i18n.gd).
const DATA := preload("res://assets/changelog.json")
const SEEN_PATH := "user://changelog.cfg"

static var _seen_cache := -2


static func releases() -> Array:
	return (DATA as JSON).data.get("releases", [])


static func latest() -> String:
	var all := releases()
	return String(all[0]["version"]) if not all.is_empty() else ""


## Un libelle d'interface (`title`, `seeAll`, `kinds.new`...) dans la langue
## du joueur, l'anglais sinon.
static func ui(key: String) -> String:
	var tables: Dictionary = (DATA as JSON).data.get("ui", {})
	for code in [I18N.locale, I18N.DEFAULT_LOCALE]:
		var node: Variant = tables.get(code, {})
		for part in key.split("."):
			node = (node as Dictionary).get(part) if node is Dictionary else null
		if node is String:
			return node
	return key


## Le texte d'une ligne dans la langue du joueur.
static func text(item: Dictionary) -> String:
	var texts: Dictionary = item.get("text", {})
	return String(texts.get(I18N.locale, texts.get(I18N.DEFAULT_LOCALE, "")))


## Combien de versions le joueur a vues ; -1 s'il n'en a jamais vu.
static func seen() -> int:
	if _seen_cache == -2:
		var cfg := ConfigFile.new()
		_seen_cache = -1
		if cfg.load(SEEN_PATH) == OK:
			if cfg.has_section_key("changelog", "seen_count"):
				_seen_cache = int(cfg.get_value("changelog", "seen_count"))
			else:
				var legacy := String(cfg.get_value("changelog", "seen", ""))
				if legacy.begins_with("v1."):
					_seen_cache = legacy.trim_prefix("v1.").to_int() + 1
	return _seen_cache


static func mark_seen() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("changelog", "seen_count", releases().size())
	cfg.save(SEEN_PATH)
	_seen_cache = releases().size()


## Les versions que le joueur n'a pas vues, la plus recente d'abord.
static func unseen() -> Array:
	var all := releases()
	var mark := seen()
	if mark < 0:
		# Premier lancement avec le changelog : voir la doc en tete.
		if Island.tutorial_pending():
			mark_seen()
			return []
		return all.slice(0, 1)
	return all.slice(0, maxi(all.size() - mark, 0))


## Faut-il prevenir ? Vrai si une version non vue porte du `new` ou du `tune`.
static func should_announce() -> bool:
	for r in unseen():
		for item in r["items"]:
			if String(item["kind"]) != "fix":
				return true
	return false


## CE QUE QUOI DE NEUF MONTRE : les versions donnees fondues en une liste —
## nouveautes et reglages dans l'ordre, les corrections comptees a part.
## Sans version non vue (la version tapee a froid), la derniere.
static func digest(list: Array = []) -> Dictionary:
	if list.is_empty():
		list = releases().slice(0, 1)
	var items := []
	var fixes := 0
	for r in list:
		for item in r["items"]:
			if String(item["kind"]) == "fix":
				fixes += 1
			else:
				items.append({"kind": String(item["kind"]), "text": text(item)})
	var top: Dictionary = list[0] if not list.is_empty() else {}
	return {
		"version": String(top.get("version", "")),
		"date": String(top.get("date", "")),
		"items": items,
		"fixes": fixes,
	}
