extends HubCard
## LA CARTE DU JARDIN, construite sur la maquette comme celle de l'energie
## (garden-card.tsx).
##
## CE QUE LA CARTE DIT, dans l'ordre de la maquette : ce qui est dans la
## terre en ce moment (+147), a quelle vitesse ca se remplit et ce que ca
## tient, et la seule action — HARVEST — en dalle pleine largeur qui est la
## moitie basse de la carte.
##
## LE BOUTON EST LE POINT. Dans l'ancienne carte de bois, Harvest etait un
## nine-slice de la couleur du panneau, ce qui faisait de la seule chose
## actionnable son element le moins visible. La maquette en fait une dalle
## pleine, verte comme la pousse du jardin (et non l'orange de CLAIM : une
## recolte n'est pas une recompense qu'on vous tend, c'est votre propre
## culture).
##
## LE RISQUE TANT QU'IL Y EN A UN, LE TAUX SINON. Ce qui est dehors est ce
## qu'un raid prend en premier (RAID.GARDEN_LOOT_SHARE), et une carte qui ne
## disait que « 72/hour » ne donnait jamais la raison de presser HARVEST
## maintenant plutot que plus tard. Vide, elle dit ce qu'un champ vide EST :
## une promesse, pas un blanc — un nouveau venu voyait « +0 » et se
## demandait si le chiffre bougerait un jour.
##
## LES BOUTEILLES NE SONT PLUS ICI : une chose dans votre sac n'est pas une
## propriete du lieu. Elles se versent depuis le coin du sol.

## Le risque, dans le rouge du terrier leve pour lire sur la face sombre
## (`.rr-burrow .rr-note.danger`).
const RISK_INK := Color("#ff8a7a")

var _slab: HubSlab
var _shown_ready := -1
var _tick: Timer


func _ready() -> void:
	share = 14.5
	floor_px = 66.0
	art = Kit.ICONS["garden"]
	art_share = 39.0
	art_top = true
	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_code: String) -> void: refresh())
	# Le jardin pousse pendant qu'on regarde : le +N se relit chaque seconde
	# et ne se reecrit que s'il a change.
	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(func() -> void:
		if Home.live_garden() != _shown_ready:
			refresh())
	add_child(_tick)
	_tick.start()
	refresh()


func refresh() -> void:
	visible = Home.loaded()
	if not visible:
		return
	layout()
	clear()
	var b := Home.burrow
	var ready := Home.live_garden()
	var yield_h := int(b.get("yieldPerHour", 0))
	# Le plafond VIVANT (gardenCeiling), pas celui de base : la ligne dit
	# « holds N » et les deux moities doivent decrire le meme jardin.
	var capacity := int(b.get("gardenCeiling", b.get("gardenCapacity", 0)))
	_shown_ready = ready

	add_row(I18N.t("burrow.garden"), value("+%d" % ready, true))
	# Ces deux phrases sont des litteraux anglais de garden-card.tsx, hors du
	# dictionnaire : elles sont reprises telles quelles en attendant leur cle.
	if ready > 0:
		add_sub(I18N.f("burrow.gardenAtRisk", [yield_h]), RISK_INK)
	else:
		add_sub(I18N.f("burrow.gardenGrowing", [yield_h, capacity]))

	_slab = HubSlab.new("green", slab_height())
	_slab.add_word(I18N.t("burrow.harvest"), slab_text())
	# Rien a prendre : la dalle n'a pas de travail. `pending` bloque une
	# seconde pression tant que la premiere est en vol.
	_slab.set_lit(ready > 0 and not Home.pending)
	# La recolte tinte (page.tsx `act`) — seulement si le serveur a vraiment
	# donne quelque chose : un refus a deja son son, celui du refus.
	_slab.pressed.connect(func() -> void:
		var res: Dictionary = await Home.act("harvest")
		if int(res.get("harvested", 0)) > 0:
			Sound.play("coin"))
	set_footer(_slab)
