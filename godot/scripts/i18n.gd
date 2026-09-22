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
		"sign_out": "SIGN OUT",
		"tips": [
			"THE NUMBER ON A TILE COUNTS THE BOMBS TOUCHING IT",
			"DIGGING COSTS 1 ENERGY - A BOMB COSTS 30",
			"MARK A BOMB WITH A RED X: RIGHT PAYS ENERGY BACK, WRONG COSTS 15",
			"WALKING BACK OVER TILES YOU ALREADY DUG IS FREE",
			"EVERY CHEST YOU OPEN GOES HOME WITH YOU",
			"THE ISLAND IS THE CLOCK - DIG IT OUT AND IT SINKS",
			"CARROTS ARE THE SCORE - THE RED X IS THE ONLY PUMP",
		],
		## LES DOUZE BEATS DE LA PREMIERE MANCHE, appeles par l'id de
		## `FirstRun.BEATS`. Les conditions vivent la-bas ; ici, seulement les
		## mots. Aucune ne depasse douze mots : c'est un bandeau au-dessus d'un
		## plateau qu'on tapote, pas une carte qu'on lit.
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
		"sign_out": "Se déconnecter",
		"tips": [
			"LE NUMÉRO SUR UNE CASE COMPTE LES BOMBES QUI LA TOUCHENT",
			"CREUSER COÛTE 1 D’ÉNERGIE - UNE BOMBE EN COÛTE 30",
			"MARQUE UNE BOMBE D’UN X ROUGE : JUSTE, ÇA REND DE L’ÉNERGIE ; FAUX, ÇA COÛTE 15",
			"REPASSER SUR LES CASES DÉJÀ CREUSÉES EST GRATUIT",
			"CHAQUE COFFRE OUVERT RENTRE AVEC TOI",
			"L’ÎLE EST LE CHRONO - VIDE-LA ET ELLE COULE",
			"LES CAROTTES SONT LE SCORE - LE X ROUGE EST LA SEULE POMPE",
		],
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
		"sign_out": "退出登录",
		"tips": [
			"方块上的数字表示与它相邻的炸弹数量",
			"挖掘消耗 1 点能量 - 踩到炸弹消耗 30 点",
			"用红叉标记炸弹：标对返还能量，标错扣 15 点",
			"走回已经挖开的方块不消耗能量",
			"你打开的每个宝箱都会带回家",
			"岛屿就是计时器 - 挖空它，它就会沉没",
			"胡萝卜是分数 - 红叉是唯一的能量来源",
		],
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
		"sign_out": "Sair",
		"tips": [
			"O NÚMERO NUM BLOCO CONTA AS BOMBAS QUE O TOCAM",
			"CAVAR CUSTA 1 DE ENERGIA - UMA BOMBA CUSTA 30",
			"MARQUE UMA BOMBA COM UM X VERMELHO: CERTO DEVOLVE ENERGIA, ERRADO CUSTA 15",
			"ANDAR DE VOLTA POR BLOCOS JÁ CAVADOS É DE GRAÇA",
			"CADA BAÚ QUE VOCÊ ABRE VAI PARA CASA COM VOCÊ",
			"A ILHA É O RELÓGIO - CAVE TUDO E ELA AFUNDA",
			"AS CENOURAS SÃO A PONTUAÇÃO - O X VERMELHO É A ÚNICA BOMBA DE ENERGIA",
		],
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


## LA FACE DE LA LANGUE AFFICHEE, ou `null` quand c'est celle du kit.
##
## `null` veut dire « retire l'override et laisse revenir la face pixel » — ce
## que veut l'anglais. Sinon, une face du SYSTEME qui sait dessiner l'ecriture
## de la langue. La logique est celle de title.gd (`_fallback_face`), reprise
## ici pour que chaque ecran qui parle n'ait pas a la reecrire.
##
## UN NOM QUI REPOND N'EST PAS UNE FACE QUI MARCHE. `OS.get_system_font_path`
## rend volontiers le PingFang d'un framework prive de macOS et
## `load_dynamic_font` dit OK dessus, mais la face ne charge jamais et tous les
## labels sortent VIDES. On demande donc a la candidate si elle sait dessiner
## un caractere de la langue, et seul un oui compte.
var _face_cache: Dictionary = {}

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


## LA LEGENDE D'UN BEAT DE LA PREMIERE MANCHE, par son id (`FirstRun.BEATS`).
##
## Rend une chaine VIDE pour un id inconnu, et non l'id lui-meme comme `t` :
## un bandeau qui afficherait « aim » a l'ecran serait pire que muet. Le beat
## qui n'a pas de mots se tait.
func first_run(id: String) -> String:
	var dict: Dictionary = DICT.get(locale, DICT[DEFAULT_LOCALE])
	var here: Dictionary = dict.get("first_run", {})
	if here.has(id):
		return here[id]
	return DICT[DEFAULT_LOCALE]["first_run"].get(id, "")


## CE QUE LA PLANCHE DU BAS-DROIT AFFICHE : les conseils de jeu, pas les
## slogans.
##
## Le doorstep du web lit `doorstepTips`, pas `taglines` — et la distinction
## est délibérée là-bas : un joueur devant l'écran de connexion n'a pas besoin
## qu'on lui vende l'ambiance, il a besoin de savoir qu'un chiffre compte les
## bombes voisines. Les slogans restent plus bas dans ce fichier parce que le
## ruban Pixi de l'île les utilise, et cet écran-là viendra.
func taglines() -> Array:
	return t_list("tips")


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
