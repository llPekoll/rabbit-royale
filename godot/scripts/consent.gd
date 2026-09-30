class_name Consent
extends RefCounted
## LE CONSENTEMENT A LA MESURE (RGPD, directive ePrivacy, lignes de la CNIL).
##
## CE QUI EST DEMANDE, ET A QUI. Firebase Analytics depose un identifiant sur
## l'appareil (cookie `_ga` sur le web, id d'instance sur Android) : dans
## l'EEE, au Royaume-Uni et en Suisse, c'est un traceur soumis au
## consentement PREALABLE. Ailleurs (le gros des joueurs Solana), la mesure
## est accordee par defaut et aucun ecran ne s'interpose — la question ne se
## pose qu'a qui la loi la pose.
##
## UN SEUL INTERRUPTEUR, mesure ET pub ensemble (« mesurer le jeu et
## l'ameliorer ») : `analytics_storage` et les trois signaux publicitaires de
## Google (`ad_storage`, `ad_user_data`, `ad_personalization`) partent du meme
## oui. Deux cases la ou le joueur ne voit qu'une question, c'est un
## formulaire ; la CNIL demande que refuser soit aussi simple qu'accepter, pas
## qu'on detaille chaque finalite a l'ecran.
##
## LES RAPPORTS DE PLANTAGE NE SONT PAS COUVERTS : interet legitime (faire
## marcher le jeu qu'il a installe), et Crashlytics ne sert qu'a ca. Le
## dialogue le dit en une ligne. Sur le web il n'y a pas de Crashlytics — les
## erreurs y passent par GA (`exception`), donc elles se taisent sans oui.
##
## DANS LE DOUTE, ON DEMANDE. Deviner « hors UE » a tort, c'est deposer un
## traceur sans droit ; deviner « UE » a tort, c'est un ecran de plus a un
## joueur de Lagos. Le second coute un tap, le premier une amende. Donc chaque
## indice (pays de la langue systeme, fuseau) suffit a lui seul a faire
## demander, et un fuseau illisible pres de l'Europe fait demander aussi.
##
## PAS D'AUTOLOAD : un etat statique que `Analytics` monte a son `_ready`
## (avant son premier evenement) et que le dialogue et le profil lisent. Il
## n'y a qu'un appareil et qu'une reponse.

## La reponse, sur l'appareil — pas sur le compte : c'est l'appareil qui
## porte le traceur, et la question vient AVANT toute connexion.
const PATH := "user://consent.cfg"
## A monter quand ce qu'on demande change (une nouvelle finalite, un nouveau
## destinataire) : une reponse d'une version anterieure ne vaut plus, la
## question revient.
const VERSION := 1
const PRIVACY_URL := "https://rabbit.rip/privacy/"

## L'EEE (les 27 + Islande, Liechtenstein, Norvege), le Royaume-Uni (UK GDPR,
## PECR) et la Suisse (nLPD). Plus les territoires qui portent leur propre
## code pays mais sont DANS l'UE (regions ultraperipheriques, Aland) ou sous
## un regime calque (Gibraltar, dependances de la Couronne) : un Reunionnais
## a « fr_RE ».
const REGIONS := [
	"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
	"HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
	"SI", "ES", "SE",
	"IS", "LI", "NO",
	"GB", "UK", "CH",
	"AX", "GF", "GP", "MQ", "RE", "YT", "MF", "IC", "EA",
	"GI", "IM", "JE", "GG",
	"EU",
]

## LES FUSEAUX EUROPEENS HORS « Europe/ » : les iles atlantiques de
## l'Espagne, du Portugal et de l'Islande, Chypre (rangee en Asie par la
## base IANA), les departements francais d'outre-mer, le Svalbard. Et les
## vieux alias que certains systemes rapportent encore.
const ZONES := [
	"Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores",
	"Atlantic/Reykjavik", "Atlantic/Faroe", "Atlantic/Faeroe",
	"Atlantic/Jan_Mayen", "Arctic/Longyearbyen",
	"Asia/Nicosia", "Asia/Famagusta",
	"Indian/Reunion", "Indian/Mayotte",
	"America/Guadeloupe", "America/Martinique", "America/Cayenne",
	"America/Marigot",
	"WET", "CET", "MET", "EET", "GB", "GB-Eire", "Eire", "Iceland",
	"Portugal", "Poland",
]

## LES ABREVIATIONS EUROPEENNES, quand le systeme ne donne pas le nom IANA
## (Android et le bureau : Godot lit `%Z` de strftime, qui rend « CEST », pas
## « Europe/Paris »). « IST » est aussi l'Inde, « GMT » aussi Accra : le
## decalage les departage plus bas.
const ABBREVIATIONS := [
	"CET", "CEST", "MET", "MEST", "EET", "EEST", "WET", "WEST",
	"BST", "IST", "GMT", "UTC", "UCT",
]
## L'Europe a l'heure : des Acores (UTC-1) a la Finlande l'ete (UTC+3), en
## minutes a l'est de UTC comme le `bias` de Godot.
const EUROPE_BIAS_MIN := -60
const EUROPE_BIAS_MAX := 180

## La loi demande-t-elle la question a cet appareil ?
static var needed := false
## Le joueur a repondu (a cette VERSION), ici ou dans une vie anterieure.
static var answered := false
## Ce qui est accorde maintenant. Pour qui n'a pas a repondre : oui ; pour
## qui doit repondre et ne l'a pas fait : non.
static var analytics := true
static var ads := true
## Quand il a repondu (unix), pour la preuve que la CNIL demande de garder.
static var at := 0


## MONTER L'ETAT, une fois, avant le premier evenement. `has_backend` : une
## porte vers Firebase existe (Android, web). Sans elle — le bureau, l'editeur,
## les sondes headless — rien ne part, il n'y a rien a consentir, et le
## dialogue ne bloquerait que les outils (`--guest`, les verify_*).
##
## LES DRAPEAUX, pour tester sans changer de pays :
##   --consent=eu      comme un appareil europeen (le dialogue sort, meme au
##                     bureau)
##   --consent=world   comme un appareil hors UE
##   --consent=reset   oublie la reponse enregistree
static func setup(has_backend: bool, args: PackedStringArray) -> void:
	var force := ""
	for arg in args:
		if arg == "--consent=reset":
			DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
		elif arg.begins_with("--consent="):
			force = arg.trim_prefix("--consent=")
	match force:
		"eu":
			needed = true
		"world":
			needed = false
		_:
			needed = has_backend and needs_consent()

	var cfg := ConfigFile.new()
	if cfg.load(PATH) == OK and int(cfg.get_value("consent", "version", 0)) >= VERSION:
		answered = true
		analytics = bool(cfg.get_value("consent", "analytics", false))
		ads = bool(cfg.get_value("consent", "ads", false))
		at = int(cfg.get_value("consent", "at", 0))
		return
	answered = false
	analytics = not needed
	ads = not needed


## LA QUESTION ATTEND SA REPONSE : l'accueil montre le dialogue, et rien ne
## part avec un identifiant tant qu'elle attend.
static func pending() -> bool:
	return needed and not answered


## LA REPONSE, gardee sur l'appareil. Un seul interrupteur : la pub suit la
## mesure.
static func answer(granted: bool) -> void:
	answered = true
	analytics = granted
	ads = granted
	at = int(Time.get_unix_time_from_system())
	var cfg := ConfigFile.new()
	cfg.set_value("consent", "analytics", granted)
	cfg.set_value("consent", "ads", granted)
	cfg.set_value("consent", "version", VERSION)
	cfg.set_value("consent", "at", at)
	cfg.save(PATH)


## CET APPAREIL EST-IL PROBABLEMENT EN EUROPE ? Les indices de la plateforme,
## passes a `decide`.
##
## LE FUSEAU. Sur le web, le navigateur connait le nom IANA
## (`Intl…timeZone` : « Europe/Paris ») — Godot n'y a que ce qu'Emscripten
## tire de la libc, une abreviation au mieux. Ailleurs, `Time` rend
## l'abreviation (`%Z`) et le decalage.
static func needs_consent() -> bool:
	var zone := ""
	if OS.has_feature("web"):
		var js: Variant = JavaScriptBridge.eval(
			"(function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){return ''}})()", true)
		if js is String:
			zone = js
	var tz := Time.get_time_zone_from_system()
	return decide(OS.get_locale(), zone, String(tz.get("name", "")), int(tz.get("bias", 0)))


## LA DECISION, sans plateforme — ce que les sondes testent.
##
##   • le pays de la langue systeme (« fr_FR », « en-GB », « pt_PT ») est
##     europeen → oui ;
##   • un nom IANA est connu → il tranche : « Europe/… » ou la liste ZONES ;
##   • sinon l'abreviation : europeenne ET a une heure europeenne → oui ;
##     illisible (« +03 », vide) a une heure europeenne → oui, dans le doute.
static func decide(locale: String, zone: String, abbrev: String, bias: int) -> bool:
	var region := region_of(locale)
	if not region.is_empty() and region in REGIONS:
		return true
	if not zone.is_empty():
		return zone.begins_with("Europe/") or zone in ZONES
	var near := bias >= EUROPE_BIAS_MIN and bias <= EUROPE_BIAS_MAX
	if not near:
		return false
	var name := abbrev.strip_edges().to_upper()
	if name in ABBREVIATIONS:
		return true
	# Une abreviation en lettres que l'on ne connait pas (« WAT », « MSK »,
	# « EAT ») est un vrai fuseau, pas europeen ; tout le reste — vide,
	# numerique (« +03 », « GMT+2 ») — ne dit rien, et l'on demande.
	var letters := RegEx.create_from_string("^[A-Z]{2,5}$")
	return letters.search(name) == null


## LE PAYS D'UNE LANGUE SYSTEME : « fr_FR » → FR, « zh_Hans_CN » → CN,
## « en-GB » → GB, « fr » → "" (la langue seule ne dit pas ou l'on est).
static func region_of(locale: String) -> String:
	var parts := locale.replace("-", "_").split("_")
	for i in range(parts.size() - 1, 0, -1):
		var part := parts[i].strip_edges()
		# Ecarter le codage (« en_US.UTF-8 ») et l'ecriture (« Hans »).
		part = part.get_slice(".", 0).get_slice("@", 0)
		if part.length() == 2:
			return part.to_upper()
	return ""
