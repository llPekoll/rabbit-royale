class_name StoreUpdate
## UNE NOUVELLE VERSION DE L'APP SUR LE STORE (2026-10-29, monde web2).
##
## Les apps du store ne se mettent pas a jour toutes seules : le build Play n'a
## pas de pack OTA (boot.gd), et l'iPhone non plus. Le joueur doit donc
## l'apprendre ici, au lancement, une fois :
##
##   Android  Play le sait et le montre lui-meme : RabbitFirebase.checkStoreUpdate
##            ouvre son ecran de mise a jour par-dessus le jeu (StoreUpdate.kt).
##   iOS      Apple n'a rien de tel : on lit la version publiee (l'API de
##            recherche de l'App Store) et, plus recente que la notre, une
##            fenetre propose d'ouvrir l'App Store (StoreUpdateDialog).
##
## La version de l'app iOS EST application/config/version : le preset iOS
## laisse short_version vide pour la prendre.

## L'app dans App Store Connect (Apple ID de l'app).
const APP_STORE_ID := "6828478482"
const BUNDLE_ID := "pro.gravity5.rabbitroyale"

static var _checked := false


## Une fois par lancement ; l'accueil l'appelle.
static func check(host: Control) -> void:
	if _checked or Net.WORLD != "web2":
		return
	_checked = true
	# `--store-update` : la fenetre iOS sur le bureau, pour les captures.
	if OS.get_cmdline_user_args().has("--store-update"):
		StoreUpdateDialog.ask_on(host, "https://apps.apple.com/app/id" + APP_STORE_ID)
		return
	match OS.get_name():
		"Android":
			if Engine.has_singleton("RabbitFirebase"):
				Engine.get_singleton("RabbitFirebase").checkStoreUpdate()
		"iOS":
			_check_app_store(host)


static func _check_app_store(host: Control) -> void:
	var request := HTTPRequest.new()
	request.timeout = 10.0
	host.add_child(request)
	if request.request("https://itunes.apple.com/lookup?bundleId=" + BUNDLE_ID) != OK:
		request.queue_free()
		return
	var reply: Array = await request.request_completed
	request.queue_free()
	if int(reply[1]) != 200:
		return
	var data = JSON.parse_string((reply[3] as PackedByteArray).get_string_from_utf8())
	if not data is Dictionary or (data.get("results", []) as Array).is_empty():
		return
	var published := String(data["results"][0].get("version", ""))
	var mine := String(ProjectSettings.get_setting("application/config/version", ""))
	if newer(published, mine) and is_instance_valid(host):
		StoreUpdateDialog.ask_on(host, "itms-apps://apps.apple.com/app/id" + APP_STORE_ID)


## "1.2.10" plus recente que "1.2.9" : nombre par nombre, pas en texte.
static func newer(theirs: String, mine: String) -> bool:
	var a := theirs.split(".")
	var b := mine.split(".")
	for i in maxi(a.size(), b.size()):
		var x := int(a[i]) if i < a.size() else 0
		var y := int(b[i]) if i < b.size() else 0
		if x != y:
			return x > y
	return false
