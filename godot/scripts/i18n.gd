extends Node
## THE FOUR LANGUAGES, and the strings the doorstep needs from them.
##
## Ported from src/i18n — same tags, same order, same words. Only the keys this
## screen actually shows are here; the rest of the dictionaries follow when the
## screens that read them do.
##
## The web client keeps the choice in localStorage so a player who cannot read
## the interface fixes it once. Godot's equivalent is user:// — same contract.

## The picker's order, and the flag that does the real work of saying what each
## entry is. `label` is the language's own name: "Français", never "French".
## `pixel_face` is the one fact that decides how a language is DRAWN. The
## arcade-kit's face is generated from an 8x8 atlas covering printable ASCII
## 32-126, so an "é", an "ã" and every sinogram come out as a mismatched
## fallback glyph mid-word. `false` sends that whole language to a face that
## has its alphabet. Only English is true, and that is unlikely to change:
## accents alone already leave the atlas.
const LOCALES: Array[Dictionary] = [
	{"code": "en", "label": "English", "flag": "🇬🇧", "pixel_face": true},
	{"code": "fr", "label": "Français", "flag": "🇫🇷", "pixel_face": false},
	{"code": "zh", "label": "中文", "flag": "🇨🇳", "pixel_face": false},
	{"code": "pt-BR", "label": "Português", "flag": "🇧🇷", "pixel_face": false},
]

const DEFAULT_LOCALE := "en"

const SAVE_PATH := "user://locale.cfg"

## Fires when the language changes, so every label on screen can rewrite itself
## without the picker having to know who they are.
signal locale_changed(code: String)

var locale: String = DEFAULT_LOCALE

const DICT := {
	"en": {
		"connect": "CONNECT WALLET",
		"guest": "PLAY AS A GUEST",
		"connecting": "DIGGING IN...",
		"subtitle": "The Cursed Crown",
		"lang_label": "Language",
		"no_wallet": "NO WALLET ON THIS DEVICE",
		"err_offline": "CANNOT REACH THE ISLAND",
		"err_signature": "SIGNATURE REFUSED",
		"err_wallet_taken": "THAT WALLET ALREADY HAS A BURROW",
		"err_wallet_taken_by": "THAT WALLET ALREADY DIGS AS %s",
		"err_already_linked": "THIS BURROW ALREADY HAS A WALLET",
		"taglines": [
			"EVERY STEP COULD BE YOUR LAST... OR YOUR FORTUNE",
			"CROSS THE ISLAND, CLAIM THE GOLD, OR DIE TRYING",
			"THE BRAVE HOP FURTHER - THE LUCKY HOP HOME",
			"STEP BY STEP, THE ISLAND TAKES OR THE ISLAND GIVES",
			"ONLY THE BOLD SURVIVE - ONLY THE WISE CASH OUT",
		],
	},
	"fr": {
		"connect": "Connecter un portefeuille",
		"guest": "Jouer en invité",
		"connecting": "On creuse...",
		"subtitle": "La Couronne Maudite",
		"lang_label": "Langue",
		"no_wallet": "Aucun portefeuille sur cet appareil",
		"err_offline": "L'île est injoignable",
		"err_signature": "Signature refusée",
		"err_wallet_taken": "Ce portefeuille a déjà un terrier",
		"err_wallet_taken_by": "Ce portefeuille creuse déjà sous le nom de %s",
		"err_already_linked": "Ce terrier a déjà un portefeuille",
		"taglines": [
			"CHAQUE PAS PEUT ÊTRE LE DERNIER... OU TA FORTUNE",
			"TRAVERSE L'ÎLE, PRENDS L'OR, OU MEURS EN ESSAYANT",
			"LES BRAVES VONT PLUS LOIN - LES CHANCEUX RENTRENT",
			"PAS À PAS, L'ÎLE PREND OU L'ÎLE DONNE",
			"SEULS LES AUDACIEUX SURVIVENT - SEULS LES SAGES S'ARRÊTENT",
		],
	},
	"zh": {
		"connect": "连接钱包",
		"guest": "以访客身份游玩",
		"connecting": "正在挖入...",
		"subtitle": "诅咒之冠",
		"lang_label": "语言",
		"no_wallet": "此设备上没有钱包",
		"err_offline": "无法连接到岛屿",
		"err_signature": "签名被拒绝",
		"err_wallet_taken": "该钱包已拥有一个地洞",
		"err_wallet_taken_by": "该钱包已以 %s 的身份挖掘",
		"err_already_linked": "此地洞已绑定钱包",
		"taglines": [
			"每一步都可能是最后一步...或者是你的财富",
			"穿过这座岛，夺走黄金，否则死在路上",
			"勇者走得更远 - 幸运者活着回家",
			"一步一步，岛屿或取走，或给予",
			"只有大胆者活下来 - 只有明智者收手",
		],
	},
	"pt-BR": {
		"connect": "Conectar carteira",
		"guest": "Jogar como convidado",
		"connecting": "Cavando...",
		"subtitle": "A Coroa Maldita",
		"lang_label": "Idioma",
		"no_wallet": "Nenhuma carteira neste aparelho",
		"err_offline": "A ilha está inacessível",
		"err_signature": "Assinatura recusada",
		"err_wallet_taken": "Essa carteira já tem uma toca",
		"err_wallet_taken_by": "Essa carteira já cava como %s",
		"err_already_linked": "Esta toca já tem uma carteira",
		"taglines": [
			"CADA PASSO PODE SER O ÚLTIMO... OU SUA FORTUNA",
			"ATRAVESSE A ILHA, PEGUE O OURO, OU MORRA TENTANDO",
			"OS BRAVOS VÃO MAIS LONGE - OS SORTUDOS VOLTAM",
			"PASSO A PASSO, A ILHA TIRA OU A ILHA DÁ",
			"SÓ OS OUSADOS SOBREVIVEM - SÓ OS SÁBIOS PARAM",
		],
	},
}


func _ready() -> void:
	locale = _load_saved()


## One string, in the language now showing.
func t(key: String) -> String:
	var dict: Dictionary = DICT.get(locale, DICT[DEFAULT_LOCALE])
	return dict.get(key, DICT[DEFAULT_LOCALE].get(key, key))


## The tagline list for the language now showing.
func taglines() -> Array:
	return t_list("taglines")


func t_list(key: String) -> Array:
	var dict: Dictionary = DICT.get(locale, DICT[DEFAULT_LOCALE])
	return dict.get(key, DICT[DEFAULT_LOCALE].get(key, []))


func set_locale(code: String) -> void:
	if code == locale or not DICT.has(code):
		return
	locale = code
	_save(code)
	locale_changed.emit(code)


## Can the kit's ASCII bitmap face draw the language now showing?
func pixel_face() -> bool:
	for entry in LOCALES:
		if entry["code"] == locale:
			return entry["pixel_face"]
	return true


## Which entry in LOCALES a code sits at — what the OptionButton selects on.
func locale_index(code: String) -> int:
	for i in LOCALES.size():
		if LOCALES[i]["code"] == code:
			return i
	return 0


## A saved choice, or the system's language, or English.
##
## Falls back rather than guessing hard: a player who lands in the wrong
## language fixes it in one tap on this very screen, and a wrong guess that
## looks deliberate is worse than the default.
func _load_saved() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		var saved: String = cfg.get_value("i18n", "locale", "")
		if DICT.has(saved):
			return saved
	return _match_system()


## The exact tag first ("pt-BR"), then the bare language ("pt" -> "pt-BR",
## "zh-Hans" -> "zh") — which is what a platform actually reports.
func _match_system() -> String:
	var tag := OS.get_locale()
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
