class_name ServerMenu
extends LanguageMenu
## LE CHOIX DU SERVEUR (2026-10-23) — le menu des langues, une ligne par
## choix : Auto (le plus proche avant chaque ile, et lequel ce serait), puis
## chaque region et son ping. Une region qui n'a pas repondu est grisee : on
## n'envoie personne sur un serveur muet.
##
## Ouvert sur une mesure de plus d'une minute, il remesure et se refait des
## que les chiffres arrivent.

## Un choix fait (Auto compris : la region ne change peut-etre pas). Le
## menu se ferme aussitot ; qui l'a ouvert va au plus proche pour Auto.
signal picked(pick: String)


static func open_server_under(host: Control, anchor: Control = null) -> ServerMenu:
	var menu := ServerMenu.new()
	menu._anchor = anchor
	menu._width = 270.0
	Kit.fill(menu)
	host.add_child(menu)
	return menu


## La mesure lue a l'ouverture ; une plus neuve refait les lignes.
var _probed_at := -1


func _ready() -> void:
	super()
	_probed_at = Net.probed_at
	if Net.probed_at < 0 or Time.get_ticks_msec() - Net.probed_at > Net.PROBE_FRESH_MSEC:
		# Sans await ici : le menu peut se fermer avant la fin de la sonde.
		# Les chiffres d'avant restent affiches (la sonde remet chaque region
		# a -1 en partant) ; `_process` relit a l'arrivee.
		Net.probe(Net.ISLAND_PROBE_SECONDS)


func _process(_delta: float) -> void:
	if Net.probed_at != _probed_at:
		_probed_at = Net.probed_at
		rebuild()


func _items() -> Array[Dictionary]:
	var pick := Net.server_pick()
	var best := Net.region_best if Net.region_best != "" else Net.region
	var out: Array[Dictionary] = [{
		"key": "auto",
		"label": I18N.t("auth.region.auto"),
		"detail": _where(best),
		"on": pick == "auto",
	}]
	for r in Net.REGIONS:
		var code := String(r.code)
		var ms := int(Net.pings.get(code, -1))
		out.append({
			"key": code,
			"label": I18N.t("auth.region." + code),
			"detail": "%d ms" % ms if ms >= 0 else "-",
			"on": pick == code,
			"enabled": ms >= 0 or code == Net.region,
		})
	return out


## « Europe 45 ms », ce qu'Auto prendrait.
static func _where(code: String) -> String:
	if code == "":
		return ""
	var ms := int(Net.pings.get(code, -1))
	return I18N.t("auth.region." + code) + (" %d ms" % ms if ms >= 0 else "")


func _choose(key: String) -> void:
	Analytics.track("region_pick", {"region": key})
	Net.set_server_pick(key)
	picked.emit(key)
	close()
