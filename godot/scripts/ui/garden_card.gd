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
## LES BOUTEILLES REVIENNENT ICI (2026-10-01). Le web les versait « depuis
## le coin du sol », qui n'a jamais ete branche cote Godot : l'onglet GARDEN
## de la rangee du kit (sous DEFEND) offrait WATER et FERTILISE et ne
## faisait rien. Arrosoir et engrais tombent des coffres ; ils se versent la
## ou l'on soigne le jardin, a cote de HARVEST, et seulement quand on en a.

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
	# La recolte arrache les plants (un « pop ») AU DOIGT : elle est optimiste
	# (Home.act), le serveur ne fait que corriger le compte. Le tintement
	# vient ensuite, carotte par carotte (burrow.gd).
	_slab.pressed.connect(func() -> void:
		if Home.pending or Home.live_garden() <= 0:
			return
		Sound.play("hop", 1.4)
		Home.act("harvest"))
	var foot := Kit.hbox(Kit.PAD_TIGHT)
	foot.custom_minimum_size = _slab.custom_minimum_size
	foot.add_child(_slab)
	for kind in ["water", "fertiliser"]:
		var bottle := _bottle(kind)
		if bottle != null:
			foot.add_child(bottle)
	set_footer(foot)


## UNE BOUTEILLE A VERSER : son icone et ce qu'on en tient, a droite de
## HARVEST. Rien si on n'en tient pas ; eteinte tant que la precedente agit
## (`activeMs`). Le serveur verse (`/api/burrow` water / fertilise).
func _bottle(kind: String) -> HubSlab:
	var boosts: Variant = Home.burrow.get("boosts", {})
	var boost: Dictionary = {}
	if boosts is Dictionary and (boosts as Dictionary).get(kind) is Dictionary:
		boost = boosts[kind]
	var held := int(boost.get("held", 0))
	if held <= 0:
		return null
	var active: Variant = boost.get("activeMs", null)
	var running := (active is float or active is int) and float(active) > 0.0
	var h := slab_height()
	var b := HubSlab.new("green", h)
	b.size_flags_horizontal = Control.SIZE_SHRINK_END
	b.custom_minimum_size.x = roundf(h * 2.0)
	var row := Kit.hbox(2)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var icon := Kit.icon(Kit.ICONS[kind], roundf(h * 0.5))
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	row.add_child(Kit.label("x%d" % held, slab_text(), b.ink()))
	b.content.add_child(row)
	b.tooltip_text = "%s · %s" % [I18N.t("kit.tools." + ("water" if kind == "water" else "fertilise")),
		I18N.t("kit.tools.%sEffect" % kind)]
	b.set_lit(not running and not Home.pending)
	b.pressed.connect(func() -> void:
		await Home.act("water" if kind == "water" else "fertilise"))
	return b
