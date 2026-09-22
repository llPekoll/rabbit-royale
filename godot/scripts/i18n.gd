extends Node
## LES QUATRE LANGUES — les dictionnaires du web, lus tels quels.
##
## Les mots ne sont PAS retapes ici. `tools/export-godot-i18n.ts` exporte
## src/i18n/dict/*.ts en assets/i18n/<langue>.json, meme forme, memes cles :
## `t.shop.title` sur le web est `I18N.t("shop.title")` ici. Une chaine se
## traduit une fois, dans le TypeScript, dont le compilateur garantit que les
## quatre langues ont les memes cles ; le JSON en est un artefact commis, pour
## qu'un checkout frais n'ait pas besoin de bun.
##
## LES FONCTIONS DU WEB SONT DES GABARITS. `t.loop.traps(n)` devient
## {"$t": "{0} traps", "$v": [{"when": {"0": 1}, "t": "1 trap"}]} : un gabarit
## rempli par `f()`, et des VARIANTES pour les branches (`n === 1`,
## `previous ? :`, `held > 0`) que l'export a sondees. `f()` choisit la
## variante dont les conditions tiennent, sinon le gabarit.
##
## Le web garde le choix de langue dans localStorage pour qu'un joueur qui ne
## sait pas lire l'interface la corrige une fois. user:// est le meme contrat.

## L'ordre du selecteur, et le drapeau qui fait le vrai travail de dire ce
## qu'est chaque entree. `label` est le nom de la langue dans sa langue.
## `pixel_face` est le SEUL fait qui decide comment une langue est DESSINEE :
## la face pixel du kit couvre l'ASCII imprimable, donc un « é » ou un
## sinogramme en sort en glyphe de secours au milieu d'un mot. `false` envoie
## toute la langue vers une face qui a son alphabet. Seul l'anglais est `true`.
const LOCALES: Array[Dictionary] = [
	{"code": "en", "label": "English", "flag": "🇬🇧", "pixel_face": true},
	{"code": "fr", "label": "Français", "flag": "🇫🇷", "pixel_face": false},
	{"code": "zh", "label": "中文", "flag": "🇨🇳", "pixel_face": false},
	{"code": "pt-BR", "label": "Português", "flag": "🇧🇷", "pixel_face": false},
]

const DEFAULT_LOCALE := "en"
const SAVE_PATH := "user://locale.cfg"
const DICT_DIR := "res://assets/i18n/"

## PRELOAD, pour la meme raison que les planches (plank_button.gd) : un
## `load()` d'un chemin n'est pas vu par l'exportateur, et les dictionnaires
## manqueraient a l'APK.
const DICT_FILES := {
	"en": preload("res://assets/i18n/en.json"),
	"fr": preload("res://assets/i18n/fr.json"),
	"zh": preload("res://assets/i18n/zh.json"),
	"pt-BR": preload("res://assets/i18n/pt-BR.json"),
}

## CE QUE LE WEB N'A PAS A DIRE. Un client natif a ses propres phrases —
## celles d'un reseau absent, que le navigateur montre a sa maniere. Elles
## vivent ici, sous une cle SANS point, pour ne pas se confondre avec le
## dictionnaire exporte.
##
## LES DOUZE BEATS DE LA PREMIERE MANCHE (`first_run`, par l'id de
## `FirstRun.BEATS`) et le libelle du bouton X du tutoriel sont natifs aussi :
## le tutoriel dessine du portage n'a pas d'equivalent mot pour mot sur le web.
## Aucun beat ne depasse douze mots : c'est un bandeau au-dessus d'un plateau
## qu'on tapote, pas une carte qu'on lit.
const NATIVE := {
	"en": {
		"err_offline": "CANNOT REACH THE ISLAND",
		"first_run": {
			"tap": "Tap a tile beside you to dig it.",
			"numbers": "The number counts the bombs touching that tile.",
			"counts": "This 1 means: one bomb hides in the tiles around it.",
			"prove": "Only one tile is left unopened. That is the bomb.",
			"mark": "Press MARK A BOMB, then tap the tile wearing the red X.",
			"aim": "Now tap the tile that is pulsing.",
			"marked": "Right! A good X gives energy back. A wrong one costs you.",
			"fetch": "Now go and take the chest. Whatever it holds goes home with you.",
			"bomb": "That cost energy. The 1 was pointing at it.",
			"golden": "Gold! One golden carrot is worth five.",
			"chest": "A chest. Whatever it holds goes home with you.",
			"clock": "The island is the clock. Dig it out and it sinks.",
		},
		"mark_bomb": "MARK A BOMB",
	},
	"fr": {
		"err_offline": "L'île est injoignable",
		"first_run": {
			"tap": "Touche une case à côté de toi pour creuser.",
			"numbers": "Le chiffre compte les bombes qui touchent la case.",
			"counts": "Ce 1 veut dire : une bombe se cache dans les cases autour.",
			"prove": "Il ne reste qu'une case fermée. C'est la bombe.",
			"mark": "Appuie sur MARQUER UNE BOMBE, puis touche la case au X rouge.",
			"aim": "Maintenant touche la case qui clignote.",
			"marked": "Juste ! Un bon X rend de l'énergie. Un mauvais t'en coûte.",
			"fetch": "Maintenant va prendre le coffre. Ce qu'il contient rentre avec toi.",
			"bomb": "Ça coûte de l'énergie. Le 1 la désignait.",
			"golden": "De l'or ! Une carotte dorée en vaut cinq.",
			"chest": "Un coffre. Ce qu'il contient rentre avec toi.",
			"clock": "L'île est l'horloge. Creuse-la et elle coule.",
		},
		"mark_bomb": "MARQUER UNE BOMBE",
	},
	"zh": {
		"err_offline": "无法连接到岛屿",
		"first_run": {
			"tap": "点你旁边的格子来挖开。",
			"numbers": "数字表示紧挨这格的炸弹数。",
			"counts": "这个 1 的意思是：周围的格子里藏着 1 颗炸弹。",
			"prove": "只剩一格没打开了，那就是炸弹。",
			"mark": "按「标记炸弹」，然后点那个带红 X 的格子。",
			"aim": "现在点那个闪烁的格子。",
			"marked": "对了！标对的 X 会还你能量，标错要付出代价。",
			"fetch": "现在去拿宝箱吧。里面的东西会跟你回家。",
			"bomb": "这耗了能量。那个 1 指的就是它。",
			"golden": "金色！一根金胡萝卜顶五根。",
			"chest": "一个宝箱。里面的东西会跟你回家。",
			"clock": "岛屿就是计时器。挖光它，它就沉。",
		},
		"mark_bomb": "标记炸弹",
	},
	"pt-BR": {
		"err_offline": "A ilha está inacessível",
		"first_run": {
			"tap": "Toque num quadrado ao seu lado para cavar.",
			"numbers": "O número conta as bombas que encostam nesse quadrado.",
			"counts": "Este 1 quer dizer: uma bomba se esconde nos quadrados ao redor.",
			"prove": "Só resta um quadrado fechado. É a bomba.",
			"mark": "Aperte MARCAR UMA BOMBA e toque no quadrado com o X vermelho.",
			"aim": "Agora toque no quadrado que está piscando.",
			"marked": "Certo! Um bom X devolve energia. Um errado custa caro.",
			"fetch": "Agora vá pegar o baú. O que tiver dentro vai para casa com você.",
			"bomb": "Isso custou energia. O 1 apontava para ela.",
			"golden": "Ouro! Uma cenoura dourada vale cinco.",
			"chest": "Um baú. O que tiver dentro vai para casa com você.",
			"clock": "A ilha é o relógio. Cave até o fim e ela afunda.",
		},
		"mark_bomb": "MARCAR UMA BOMBA",
	},
}

## Fire quand la langue change, pour que chaque label se reecrive sans que le
## selecteur ait a savoir qui ils sont.
signal locale_changed(code: String)

var locale: String = DEFAULT_LOCALE

var _dicts: Dictionary = {}
var _face_cache: Dictionary = {}
## La face du theme du projet telle qu'elle est livree — la pixel. Gardee pour
## y revenir quand l'anglais reprend.
var _pixel_font: Font = null


func _ready() -> void:
	for code in DICT_FILES:
		_dicts[code] = (DICT_FILES[code] as JSON).data
	locale = _load_saved()
	_apply_theme_face()


## UNE CHAINE, dans la langue affichee. `path` est le chemin du web, points
## compris : "shop.title", "quests.break-ground.line", "islands.Meadow".
## Un gabarit sans argument (`ask: () => 'Finish a run.'`) se lit aussi ici.
func t(path: String) -> String:
	var node: Variant = _lookup(path)
	if node is String:
		return node
	if node is Dictionary and (node as Dictionary).has("$t"):
		return _fill(String(node["$t"]), [])
	return path


## UNE CHAINE A TROUS. `f("loop.traps", [3])` -> "3 traps",
## `f("loop.traps", [1])` -> "1 trap". Les arguments sont dans l'ordre de la
## fonction du web, et un `null` vaut pour ce que le web passe comme null.
func f(path: String, args: Array) -> String:
	var node: Variant = _lookup(path)
	if node is String:
		return _fill(node, args)
	if node is Dictionary and (node as Dictionary).has("$t"):
		return _fill(_pick(node, args), args)
	return path


## Une liste de chaines : "doorstepTips", "taglines", "install.steps.ios",
## "lore.the-island.body".
func list(path: String) -> Array:
	var node: Variant = _lookup(path)
	return node if node is Array else []


## Une table : "items", "lore", "quests", "islands", "avatars" — pour qui
## veut iterer les cles plutot que les nommer.
func table(path: String) -> Dictionary:
	var node: Variant = _lookup(path)
	return node if node is Dictionary else {}


## Le nom d'une ile, traduit s'il l'est, tel quel sinon (content.ts).
func island_name(name: String) -> String:
	var found: Variant = _lookup("islands." + name)
	return found if found is String else name


## EN MAJUSCULES SEULEMENT LA OU LE WEB LE FAIT : la face pixel du kit n'a pas
## de bas-de-casse, donc les libelles anglais s'ecrivent en capitales. Les
## autres langues tombent sur une face a deux casses et gardent leur casse —
## crier sur un joueur francais n'est pas la traduction d'une limite d'atlas.
func shout(text: String) -> String:
	return text.to_upper() if pixel_face() else text


## CE QUE LA PLANCHE DU BAS-DROIT AFFICHE : les conseils de jeu, pas les
## slogans (`doorstepTips`, pas `taglines` — la distinction est deliberee sur
## le web : un joueur devant l'ecran de connexion n'a pas besoin qu'on lui
## vende l'ambiance).
func taglines() -> Array:
	return list("doorstepTips")


## LA LEGENDE D'UN BEAT DE LA PREMIERE MANCHE, par son id (`FirstRun.BEATS`).
##
## Rend une chaine VIDE pour un id inconnu, et non l'id lui-meme comme `t` :
## un bandeau qui afficherait « aim » a l'ecran serait pire que muet. Le beat
## qui n'a pas de mots se tait.
func first_run(id: String) -> String:
	var here: Dictionary = NATIVE.get(locale, NATIVE[DEFAULT_LOCALE]).get("first_run", {})
	if here.has(id):
		return here[id]
	return NATIVE[DEFAULT_LOCALE]["first_run"].get(id, "")


func set_locale(code: String) -> void:
	if code == locale or not _dicts.has(code):
		return
	locale = code
	_save(code)
	_apply_theme_face()
	locale_changed.emit(code)


## La face pixel du kit sait-elle dessiner la langue affichee ?
func pixel_face() -> bool:
	for entry in LOCALES:
		if entry["code"] == locale:
			return entry["pixel_face"]
	return true


## L'entree de LOCALES ou se trouve un code.
func locale_index(code: String) -> int:
	for i in LOCALES.size():
		if LOCALES[i]["code"] == code:
			return i
	return 0


# ── Les nombres et les durees, portes de src/i18n/format.ts ─────────────────

## 12 345 -> "12 345". Des ESPACES, pas des virgules, dans toutes les langues :
## le web groupe a la main pour que la sortie soit deterministe.
func group_digits(n: float) -> String:
	var digits := str(int(round(absf(n))))
	var out := ""
	for i in digits.length():
		if i > 0 and (digits.length() - i) % 3 == 0:
			out += " "
		out += digits[i]
	return ("-" if n < 0 else "") + out


## Une attente a l'arrondi superieur : "4m", "1h 12m", "3h".
func wait(ms: float) -> String:
	var mins := int(ceil(maxf(0.0, ms) / 60000.0))
	if mins < 60:
		return "%d%s" % [mins, t("units.m")]
	var h := mins / 60
	var rest := mins % 60
	if rest > 0:
		return "%d%s %d%s" % [h, t("units.h"), rest, t("units.m")]
	return "%d%s" % [h, t("units.h")]


## La meme, en un seul mot : "4m", "3h", "2d".
func short_wait(ms: float) -> String:
	var mins := maxi(1, int(round(maxf(0.0, ms) / 60000.0)))
	if mins < 60:
		return "%d%s" % [mins, t("units.m")]
	var hrs := int(round(mins / 60.0))
	if hrs < 48:
		return "%d%s" % [hrs, t("units.h")]
	return "%d%s" % [int(round(hrs / 24.0)), t("units.d")]


## La duree d'une run : "48s", "2m 05s" -> le web ecrit "2m 5s".
func run_time(ms: float) -> String:
	var total := int(round(maxf(0.0, ms) / 1000.0))
	if total < 60:
		return "%d%s" % [total, t("units.s")]
	return "%d%s %d%s" % [total / 60, t("units.m"), total % 60, t("units.s")]


## Un ecart abrege : 9 999 tel quel, puis "12.5k", "1.2M".
func short_gap(n: float) -> String:
	var v := maxf(0.0, ceil(n))
	if v < 10000.0:
		return group_digits(v)
	if v < 1000000.0:
		var s := ("%.1f" % (v / 1000.0)) if v < 100000.0 else ("%.0f" % (v / 1000.0))
		return s.trim_suffix(".0") + "k"
	return ("%.1f" % (v / 1000000.0)).trim_suffix(".0") + "M"


# ── La face de la langue ─────────────────────────────────────────────────────

## LA FACE D'UNE LANGUE QUE LE KIT NE SAIT PAS DESSINER, demandee a la
## PLATEFORME plutot qu'embarquee. `null` pour l'anglais : la face pixel du
## theme suffit.
##
## La face de secours de Godot est latine — le chinois sortait en tofu — et
## aucune fonte CJK n'est assez petite pour etre livree avec un ecran. Chaque
## machine en a deja une, donc on nomme les faces du systeme comme le fait la
## pile `--font-fallback` du web : les pixelisees d'abord, puis les grandes
## faces systeme qui portent vraiment les sinogrammes.
##
## UN NOM QUI REPOND N'EST PAS UNE FACE QUI MARCHE. `OS.get_system_font_path`
## rend volontiers le PingFang d'un framework prive de macOS et
## `load_dynamic_font` dit OK dessus, mais la face ne charge jamais et tous les
## labels sortent VIDES. On demande donc a la candidate si elle sait dessiner
## l'ecriture de la langue, et seul un oui compte.
func face() -> Font:
	if pixel_face():
		return null
	if _face_cache.has(locale):
		return _face_cache[locale]

	var probe: String = "岛" if locale == "zh" else "é"
	var code := probe.unicode_at(0)

	var chosen: Font = ThemeDB.fallback_font
	for name in ["Zpix", "Silkscreen", "DotGothic16", "Hiragino Sans GB",
			"Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", "Arial Unicode MS"]:
		var path := OS.get_system_font_path(name)
		if path.is_empty():
			continue
		var file := FontFile.new()
		if file.load_dynamic_font(path) != OK:
			continue
		if not file.has_char(code):
			continue
		chosen = file
		break

	_face_cache[locale] = chosen
	return chosen


## LA FACE VA DANS LE THEME DU PROJET, pas noeud par noeud.
##
## Chaque Control lit `default_font` du theme du projet ; le changer ici
## repeint tous les labels de l'arbre d'un coup, ceux d'aujourd'hui comme
## ceux que les dialogues ajouteront. Un override par noeud (la premiere
## version, dans title.gd) devait connaitre chaque label, et en oubliait un
## a chaque ecran nouveau.
func _apply_theme_face() -> void:
	var theme := ThemeDB.get_project_theme()
	if theme == null:
		return
	if _pixel_font == null:
		_pixel_font = theme.default_font
	var wanted := face()
	theme.default_font = _pixel_font if wanted == null else wanted


## Pour les noeuds qui portent DEJA un override (l'accueil) : `null` le
## retire et laisse revenir la face du theme.
func apply_face(nodes: Array) -> void:
	for node in nodes:
		if node is Control:
			(node as Control).remove_theme_font_override("font")


# ── La mecanique ─────────────────────────────────────────────────────────────

## Le noeud a un chemin, dans la langue affichee puis en anglais. Une cle
## native (sans point) est cherchee d'abord dans NATIVE.
func _lookup(path: String) -> Variant:
	if not path.contains(".") and NATIVE[locale].has(path):
		return NATIVE[locale][path]
	var found: Variant = _walk(_dicts.get(locale, {}), path)
	if found == null and locale != DEFAULT_LOCALE:
		found = _walk(_dicts.get(DEFAULT_LOCALE, {}), path)
	return found


func _walk(root: Variant, path: String) -> Variant:
	var node: Variant = root
	for part in path.split("."):
		if node is Dictionary and (node as Dictionary).has(part):
			node = node[part]
		else:
			return null
	return node


## LA VARIANTE QUI CONVIENT. Chaque condition de `when` nomme un argument et
## la valeur qui l'a produite : 1 pour le singulier, 0 pour le « rien »
## (que le web ecrit aussi null ou ""), null pour un null explicite. La
## variante la plus precise qui tient l'emporte ; sinon, le gabarit.
func _pick(node: Dictionary, args: Array) -> String:
	var best := String(node["$t"])
	var best_score := 0
	for variant in node.get("$v", []):
		var when: Dictionary = variant["when"]
		var ok := true
		for key in when:
			var i := int(key)
			var have: Variant = args[i] if i < args.size() else null
			if not _matches(when[key], have):
				ok = false
				break
		if ok and when.size() > best_score:
			best = String(variant["t"])
			best_score = when.size()
	return best


func _matches(wanted: Variant, have: Variant) -> bool:
	if wanted == null:
		return have == null
	var w := float(wanted)
	if w == 0.0:
		# Le zero du web est aussi son null, son "" et son false.
		return have == null or (have is String and (have as String).is_empty()) \
			or (have is bool and not have) \
			or ((have is int or have is float) and float(have) == 0.0)
	return (have is int or have is float) and float(have) == w


## Remplit "{0}", "{1}" — et "{0-1}", que l'export ecrit la ou le web
## soustrait un a l'argument (`#${rank - 1}`).
func _fill(template: String, args: Array) -> String:
	var out := template
	for i in args.size():
		var v: Variant = args[i]
		out = out.replace("{%d-1}" % i, _show(v, -1))
		out = out.replace("{%d}" % i, _show(v, 0))
	return out


func _show(v: Variant, delta: int) -> String:
	if v == null:
		return ""
	if v is int:
		return str(v + delta)
	if v is float:
		var fv: float = v
		if fv == floor(fv):
			return str(int(fv) + delta)
		return str(fv)
	return str(v)


## Un choix sauve, ou la langue du systeme, ou l'anglais.
func _load_saved() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		var saved: String = cfg.get_value("i18n", "locale", "")
		if _dicts.has(saved):
			return saved
	return _match_system()


## Le tag exact d'abord ("pt-BR"), puis la langue nue ("pt" -> "pt-BR",
## "zh-Hans" -> "zh") — ce qu'une plateforme rapporte vraiment.
func _match_system() -> String:
	var tag := OS.get_locale().replace("_", "-")
	for entry in LOCALES:
		if String(entry["code"]).to_lower() == tag.to_lower():
			return entry["code"]
	var base := tag.split("-")[0].to_lower()
	for entry in LOCALES:
		if String(entry["code"]).split("-")[0].to_lower() == base:
			return entry["code"]
	return DEFAULT_LOCALE


func _save(code: String) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("i18n", "locale", code)
	cfg.save(SAVE_PATH)
