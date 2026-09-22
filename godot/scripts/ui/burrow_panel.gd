extends HubCard
## LA CARTE DU TERRIER — votre maison, ce qu'elle produit, et ce qu'un raid
## ne peut pas prendre (burrow-card-panel.tsx).
##
## CE QU'ELLE REMPLACE. La carte lisait « DIG DEEPER - LVL 5 » sur un prix :
## une ACTION (creuser) que le jeu n'a pas, pour une chose qui n'en est pas
## une — le niveau est un LIEU, la maison qui se tient sur l'ile, que le
## joueur voit depuis cet ecran meme. La carte est donc le batiment : son
## art, son niveau, ce que ce niveau produit, ce qu'il garde en surete.
##
## L'ART EST CELUI DU PLATEAU : la meme echelle de maisons que burrow_props
## dessine, pour que la maison de la carte soit celle de l'ile et qu'une
## amelioration change les deux d'un coup.
##
## LE CHIFFRE SUR est un PLANCHER, pas un entrepot. Il n'y a pas de coffre
## dans le jeu ; ce qu'il y a, c'est une regle de butin qui ne prend qu'une
## fraction d'un stock au-dessus d'un plancher, sous un plafond dur — donc
## un reste garanti existe, que quelque chose soit bati pour le tenir ou
## non. `safe_stock` le calcule avec la formule du raid, au pire, couronne
## comprise : un plancher parfois pessimiste est un plancher ; un plancher
## parfois faux est un mensonge.
##
## LE PRIX EST SUR LE BOUTON. Il etait a cote du nom avec une marque de
## carotte, et « BURROW - LVL 1 · 500 🥕 » se lisait comme les carottes du
## terrier (Paul, 2026-09-21 : « the carrot icon there is misleading »).

## L'echelle des maisons (game/burrow/buildings.ts) : une hutte, deux
## maisons, le chateau ; du niveau 4 au 20, le chateau.
const HOMES := [
	preload("res://assets/buildings/house-1.webp"),
	preload("res://assets/buildings/house-2.webp"),
	preload("res://assets/buildings/house-3.webp"),
	preload("res://assets/buildings/castle.webp"),
]
## Le sol de la ligne SUR — un coffre-fort, plus sombre que la face — et son
## liseré d'os (hub-card.tsx RIM).
const VAULT := Color("#43261a")
const RIM := Color("#ddccbc")
## Le chiffre sur se lit a la lampe, pas dans le rouge d'alerte ; ce qui est
## dehors, dans le rouge du terrier leve pour la face sombre.
const SAFE_INK := Color("#ffd138")
const EXPOSED_INK := Color("#ff8a7a")

var _slab: HubSlab


func _ready() -> void:
	share = 23.0
	floor_px = 124.0
	art_share = 62.0
	art_top = true
	Home.changed.connect(refresh)
	I18N.locale_changed.connect(func(_code: String) -> void: refresh())
	refresh()


func refresh() -> void:
	visible = Home.loaded()
	if not visible:
		return
	var b := Home.burrow
	var level := int(b.get("level", 1))
	art = HOMES[clampi(level, 1, HOMES.size()) - 1]
	layout()
	clear()

	var stock := int(b.get("stock", 0))
	var yield_h := int(b.get("yieldPerHour", 0))
	var regen := int(b.get("regenPerHour", 0))
	var cost: Variant = b.get("upgradeCost", null)
	var maxed := cost == null
	var can := bool(b.get("canUpgrade", false)) and not Home.pending
	var safe := safe_stock(stock)

	add_row(I18N.f("burrow.level", [level]))
	# Litteraux anglais de burrow-card-panel.tsx, hors du dictionnaire,
	# repris tels quels en attendant leur cle. L'eclair du web est un
	# caractere que la face pixel n'a pas : l'icone du kit prend sa place.
	add_sub("%d carrots/hour" % yield_h)
	if regen > 0 and sub_visible():
		var row := Kit.hbox(Kit.PAD_TIGHT)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var size := card_size(10.5, 8, 11)
		row.add_child(Kit.icon(Kit.ICONS["bolt"], float(size)))
		row.add_child(Kit.label("%d energy/hour" % regen, size, SUB))
		body.add_child(row)

	body.add_child(_vault(stock, safe))

	_slab = HubSlab.new("earth", maxf(card_length(32), 38.0))
	_slab.add_word(I18N.t("burrow.maxLevel") if maxed else I18N.t("burrow.upgrade"), card_size(15, 9, 14))
	if not maxed:
		_slab.add_price(I18N.group_digits(float(cost)), card_size(11, 7, 10), carrot_mark())
	_slab.set_lit(can and not maxed)
	_slab.pressed.connect(func() -> void: Home.act("upgrade"))
	set_footer(_slab)


## LA BANDE DU COFFRE : ce qu'un raid ne peut pas atteindre, sur son propre
## sol plutot qu'en petit texte, parce que c'est le seul chiffre de la carte
## qui parle de GARDER. Deux rangs, pas une phrase : « 121 EXPOSED · SAFE
## 989 » cassait en trois lignes dans les 105 px a cote de la hutte.
func _vault(stock: int, safe: int) -> PanelContainer:
	var s := StyleBoxFlat.new()
	s.bg_color = VAULT
	s.set_border_width_all(2)
	s.border_color = RIM
	s.set_corner_radius_all(6)
	s.content_margin_left = Kit.PAD_TIGHT
	s.content_margin_right = Kit.PAD_TIGHT
	s.content_margin_top = 3
	s.content_margin_bottom = 3
	var strip := Kit.panel(s)
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# Un cheveu sous le quart de la carte, avec un plancher qui garde le rang
	# lisible (20 sur un ecran court, `.rr-hub-strip`).
	strip.custom_minimum_size = Vector2(0, maxf(card_length(22), 18.0))

	var rows := Kit.vbox(2)
	rows.alignment = BoxContainer.ALIGNMENT_CENTER
	strip.add_child(rows)

	var row := Kit.hbox(Kit.PAD_TIGHT)
	rows.add_child(row)
	var label := Kit.label(I18N.shout(I18N.t("burrow.safe")), card_size(10, 7, 11), Palette.CHALK_DIM)
	label.uppercase = I18N.pixel_face()
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var figure := Kit.hbox(Kit.PAD_TIGHT)
	figure.add_child(Kit.label(I18N.group_digits(float(safe)), card_size(11, 8, 12), SAFE_INK))
	figure.add_child(carrot_mark())
	row.add_child(figure)

	if stock - safe > 0:
		var exposed := Kit.label(I18N.shout(I18N.f("burrow.exposed", [I18N.group_digits(float(stock - safe))])), card_size(10, 7, 11), EXPOSED_INK)
		exposed.uppercase = I18N.pixel_face()
		rows.add_child(exposed)
	return strip


## `safeStock` (lib/game/raid.ts) : le plancher (RAID.SAFE_FLOOR) plus ce
## que la regle de butin laisse au-dessus, sous le plafond — la part roulee
## au maximum, la marche entiere, la couronne appliquee SANS CONDITION.
static func safe_stock(stock: int) -> int:
	if stock <= 0:
		return 0
	var exposed := maxi(0, stock - Tuning.i("RAID.SAFE_FLOOR"))
	var loss := mini(Tuning.i("RAID.LOOT_CAP"),
		int(floor(float(exposed) * Tuning.n("RAID_RUN.LOOT_SHARE") * Tuning.n("CROWN.LOOT_MULT"))))
	return maxi(0, stock - loss)
