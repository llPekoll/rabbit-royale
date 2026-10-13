extends Control
## LE LABO DU HUD DU TERRIER — monte par burrow_ux_bench.gd en BARRE. Les
## pieces communes (barre du haut, sol, quete, version) sont celles du banc ;
## le labo range le reste.
##
## LE BUT DE L'ECRAN : COMPRENDRE. C'est la que le joueur arrive apres le
## tuto (« il faut qu'il capte tout », 2026-10-13). Il a creuse une ile ; il
## ne sait pas encore que ses carottes s'entassent ici, que le potager pousse
## seul et se vole, que la maison s'agrandit, qu'on le pillera et qu'il
## pillera. Chaque proposition est une facon de le lui faire comprendre.
##
## CE QUE LE TERRIER DOIT DIRE (l'inventaire) :
##   POTAGER   +N, son plein, dans combien il deborde, N/h, volable
##   RECOLTER  l'action la plus frequente apres DIG
##   MAISON    son niveau, ce que le suivant apporte, AMELIORER et son prix
##   COFFRE    les carottes a l'abri d'un raid et celles exposees
##   BOUCLIER  tenu ou non, et pour combien de temps
##   BOUTEILLES arrosoir / engrais tenus
##   DEFENSE   bombes posees (et au sac), planches
##
## TOUR 1 — ce qui est RESTE et se retrouve dans les six :
##   • les puces DE PART ET D'AUTRE des carottes : la maison a gauche, le
##     potager a droite (« sur les cotes c'est vraiment top ») ;
##   • la jauge du coffre SUR la planche des carottes, et sous bouclier le
##     bouclier et son minuteur a sa place ;
##   • la carte du MOMENT (« j'adore ») — mais pas pour DIG ;
##   • le cadran d'energie qui porte DIG, plus grand (LoopBar `dial_grow`).
## Rejete : les puces posees sur le terrier, l'onglet-tiroir, un panneau
## entier pour la seule recolte.
##
## TOUR 2 — six facons de faire COMPRENDRE :
##   1 CONSEILLER   le terrier dit la prochaine chose a faire ET POURQUOI
##                  (potager plein, bouclier qui tombe, defense vide,
##                  AMELIORER payable), en tete de colonne. Il se tait quand
##                  il n'a rien a dire.
##   2 QUETE        l'arc de quetes est deja le cours apres le tuto : la
##                  quete prend la carte, avec sa jauge et un seul bouton.
##   3 ETIQUETTES   chaque chose dit ce qu'elle est, en mots : sous les
##                  puces et la planche, au-dessus des planches du sol. Les
##                  mots qui servent les premiers jours, et s'effacent.
##   4 VISITE       a la premiere arrivee, Shiro (calme) montre chaque chose
##                  une a une, le reste dans l'ombre ; Kuro (agite) prend
##                  DEFEND et RAID. Sept pas, puis l'ecran normal.
##   5 LE PILLARD   ce que la defense vaut CE SOIR, au-dessus de DEFEND : le
##                  chemin d'un pillard, et s'il atteint le potager.
##   6 NOUVELLES    ce qui est ARRIVE : le pillard passe, le potager plein,
##                  le bouclier qui tombe — cause et consequence, en cartes
##                  qu'on ferme, en bas a droite.

const NAMES := ["CONSEILLER", "QUETE", "ETIQUETTES", "VISITE", "LE PILLARD", "NOUVELLES"]

## TOUR 3 — LE HAUT (2026-10-13 : « j'aime 4 VISITE, on reste dessus ;
## encore 6 propales juste pour le haut »). Sept choses y vivent : la
## boutique, l'histoire, la saison, la maison, les carottes, le potager, le
## profil. Deux langages s'y croisaient (anneaux de pierre, puces sombres)
## et sept pieces sur une rangee se lisent comme une liste, pas comme deux
## familles. Chaque proposition range les familles autrement :
##   1 PIERRE        un seul langage : maison et potager deviennent des
##                   anneaux de pierre comme le rail, leurs chiffres en puce.
##   2 DEUX GROUPES  a gauche ce que J'AI (maison, carottes, potager), a
##                   droite ce que j'OUVRE (boutique, histoire, saison,
##                   profil). On lit de gauche a droite : mon terrier, puis
##                   les menus.
##   3 ENSEIGNE      une seule planche : la maison a un bout, le potager a
##                   l'autre, les carottes et le coffre au milieu — un objet
##                   a apprendre au lieu de trois.
##   4 COLONNE DROITE  les menus descendent en colonne sous le profil, le
##                   haut ne garde que le terrier : la rangee respire.
##   5 BANDEAU       le bandeau des jeux mobiles : le profil a gauche (qui je
##                   suis), le terrier au centre, les menus a droite, sur une
##                   bande sombre qui dit « ceci est l'interface ».
##   6 EPURE         moins de choses a apprendre : l'histoire et la saison
##                   rentrent dans le profil, la boutique reste seule a gauche.
##   7 KIT 04        le haut peint par Peko avec ChatGPT (BurrowHud,
##                   art-source/burrow-hud-kit-20261013) : BURROW et HARVEST
##                   en boutons orange et vert sur des planches qui sortent
##                   de sous celle des carottes, la jauge du coffre au milieu.
##                   « Les planches c'est mieux » : il va avec la BARRE.
const TOP_NAMES := ["PIERRE", "DEUX GROUPES", "ENSEIGNE", "COLONNE DROITE", "BANDEAU", "EPURE", "KIT 04"]
const KIT_04 := 6
## Le mot du bouton de la maison (le niveau est dessous).
const HOUSE_WORD := {"en": "BURROW", "fr": "TERRIER", "zh": "地洞", "pt-BR": "TOCA", "vi": "HANG"}

const SIDE_W := 210.0
## Les puces et la planche du haut, a la meme hauteur.
const TOP_H := 50.0
const PLANK_W := 176.0
const PLANK_LEAVES := 14.0
const CHIP_W := 100.0
## 3 ENSEIGNE : la planche longue, et le vert du potager lisible sur le bois.
const SIGN_W := 380.0
const GARDEN_ON_WOOD := Palette.PILL_INK
const GOOD_INK := Color("#a8e04f")
const SAFE_INK := HousePanel.SAFE_INK
const EXPOSED_INK := HousePanel.EXPOSED_INK
const DIM := Color(0.92, 0.88, 0.8, 0.62)
const NOTE_INK := Color(1.0, 0.97, 0.88, 0.92)
const BURROW_PANEL := preload("res://scripts/ui/burrow_panel.gd")
## Le potager devient LA chose a dire (NEXT_ACTION.GARDEN_FULL_SHARE).
const GARDEN_URGENT := 0.8
## Le bouclier qui tombe dans moins d'une heure.
const SHIELD_WARN_MS := 3600000.0
## Le pillard qui est passe (6 NOUVELLES), faux tant que le banc n'a pas de
## serveur.
const RAIDED := {"name": "Kuro", "took": 42}
## L'ombre de la visite autour de la chose montree.
const SHADE := Color(0.02, 0.03, 0.06, 0.62)
const TOUR_LAYER := 100

var bench: Node
var layout := 0
var active := false

var _content: Control
var _signature := ""
var _clock := 0.0
## La carte ouverte par une puce du haut ("house").
var _sheet_kind := ""
## 6 NOUVELLES : les cartes fermees.
var _dismissed := {}
## La carte du conseiller : la quete descend d'autant.
var _advice_card: Control
## 4 VISITE : le pas montre (-1 : finie).
var _tour := 0
## Les pieces du haut, pour la visite.
var _house_chip: Control
var _plank: Control
var _garden_chip: Control
## Le haut essaye (TOP_NAMES), et ce qu'on a pose dans la barre du haut pour
## lui (rendu tel quel au suivant).
var top := 0
var _top_extras: Array = []
var _top_place := Callable()
var _tour_layer: CanvasLayer
var _tour_root: Control
## Chaque montage refait la visite ; un dessin differe d'un montage passe
## ne pose rien.
var _tour_gen := 0
## 3 ENSEIGNE : comment ses bouts disent qu'ils se tapent (SIGN_STYLES).
var sign_style := 0
## 7 KIT 04 : garde d'un montage a l'autre, sinon son entree rejouerait a
## chaque seconde.
var _hud: BurrowHud


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(self)
	# LA VISITE SUR SON PROPRE CALQUE, au-dessus de tout — chrome, planches
	# des ilots (calque 19) — et vivante meme quand le labo est eteint : en
	# ILOTS, c'est elle seule qui se montre.
	_tour_layer = CanvasLayer.new()
	_tour_layer.layer = TOUR_LAYER
	add_child(_tour_layer)
	_tour_root = Control.new()
	_tour_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_tour_root)
	_tour_layer.add_child(_tour_root)
	_hud = BurrowHud.new()
	_hud.visible = false
	_hud.house_pressed.connect(_toggle_house)
	_hud.harvest_pressed.connect(func() -> void: bench.call("_harvest"))
	add_child(_hud)
	Home.changed.connect(_rebuild)
	ShopState.shared().changed.connect(_rebuild)
	get_viewport().size_changed.connect(_rebuild)


func show_layout(k: int) -> void:
	layout = k
	_sheet_kind = ""
	_dismissed.clear()
	# La visite ne part qu'a la demande (V, `--tour=N`) : on compare le haut.
	_tour = -1
	# `-- --open=house` : une capture trouve la carte deja ouverte ;
	# `-- --tour=N` : la visite a son pas N.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--open="):
			_sheet_kind = arg.trim_prefix("--open=")
		elif arg.begins_with("--tour="):
			_tour = int(arg.trim_prefix("--tour="))
	_rebuild(true)


func set_top(k: int) -> void:
	_restore_top()
	top = k
	_apply_top()
	_rebuild(true)


func next_sign_style() -> String:
	sign_style = (sign_style + 1) % SIGN_STYLES.size()
	_rebuild(true)
	return SIGN_STYLES[sign_style]


func replay_tour() -> void:
	_tour = 0
	bench.call("_toast_hide")
	_rebuild(true)


func set_active(on: bool) -> void:
	active = on
	visible = on
	_rebuild(true)


## E : l'entree du KIT 04, encore.
func replay_entrance() -> void:
	if _hud.visible:
		_hud.play_entrance()


## Ce que le banc doit cacher, deplacer ou refaire pour cette proposition.
func wants() -> Dictionary:
	var drop := 0.0
	if layout == 0 and is_instance_valid(_advice_card):
		drop = _advice_card.size.y + Kit.PAD_TIGHT
	return {
		"house": false,
		"carrots": false,
		"quest_hidden": layout == 1,
		"quest_drop": drop,
		# « encore plus gros, un peu plus haut » (2026-10-13).
		"dial_grow": Chrome.DIAL_GROW,
		"dial_rise": Chrome.DIAL_RISE,
	}


func _process(delta: float) -> void:
	if _top_place.is_valid():
		_top_place.call()
	if not active:
		return
	_clock -= delta
	if _clock <= 0.0:
		_clock = 1.0
		_rebuild()


# ── Les donnees ──────────────────────────────────────────────────────────────

func _d() -> Dictionary:
	var b := Home.burrow
	var stock := int(b.get("stock", 0))
	var safe: int = BURROW_PANEL.safe_stock(stock)
	var next: Variant = b.get("next", null)
	var shop := ShopState.shared()
	var shield: Variant = b.get("shieldMs", null)
	var cost: Variant = b.get("upgradeCost", null)
	var shield_ms := float(shield) if (shield is float or shield is int) and float(shield) > 0.0 else -1.0
	return {
		"stock": stock,
		# Sous bouclier, rien n'est a prendre.
		"safe": stock if shield_ms > 0.0 else safe,
		"exposed": 0 if shield_ms > 0.0 else maxi(0, stock - safe),
		"garden": Home.live_garden(),
		"fill": Home.garden_fill(),
		"full_in": Home.garden_full_in_ms(),
		"yield": int(b.get("yieldPerHour", 0)),
		"regen": int(b.get("regenPerHour", 0)),
		"level": int(b.get("level", 1)),
		"next_yield": int(next.get("yieldPerHour", 0)) if next is Dictionary else -1,
		"next_regen": int(next.get("regenPerHour", 0)) if next is Dictionary else -1,
		"cost": cost,
		"can": cost != null and stock >= int(cost),
		"bottles": HousePanel._bottles(b),
		"shield": shield_ms,
		"bombs": (shop.traps.get("placed", []) as Array).size(),
		"bombs_held": int(shop.traps.get("held", 0)),
		"planks": (shop.fences.get("placed", []) as Array).size(),
	}


func _view() -> Vector2:
	return get_viewport_rect().size


func _top() -> float:
	return TopBar.rail_bottom(_view()) + Kit.PAD_TIGHT


func _floor_top() -> float:
	var loop: Control = bench.get("_loop")
	var h: float = loop.call("height") if loop != null else 52.0
	return _view().y - Kit.EDGE - h - Kit.PAD_TIGHT


## Le rectangle d'une planche du sol a l'ecran ("dig", "defend", "raid").
func _floor_slab(kind: String) -> Rect2:
	var loop: Control = bench.get("_loop")
	if loop == null:
		return Rect2()
	if kind == "dig":
		var dial: Control = loop.get("_dial")
		if dial != null:
			var dr: Control = dial.get("dial")
			return dr.get_global_rect()
	var slabs: Dictionary = loop.get("_slabs")
	var slab: Control = slabs.get(kind)
	return slab.get_global_rect() if slab != null and slab.visible else Rect2()


# ── Le montage ───────────────────────────────────────────────────────────────

func _rebuild(force: bool = false) -> void:
	if not is_inside_tree():
		return
	var d := _d()
	# Les minutes du plein et du bouclier, pas leurs millisecondes : sinon on
	# refait l'arbre a chaque seconde et un bouton presse perd sa pression.
	var sig := var_to_str([layout, d.garden, d.stock, int(d.full_in / 60000.0), int(float(d.shield) / 60000.0),
		_sheet_kind, active, d.level, d.bombs, d.bombs_held, d.planks, d.bottles, _dismissed, _view(),
		Home.quest, _tour, top, sign_style])
	if sig == _signature and not force:
		return
	_signature = sig
	if is_instance_valid(_content):
		_content.queue_free()
	_content = Control.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_content)
	add_child(_content)
	_advice_card = null
	_tour_gen += 1
	for c in _tour_root.get_children():
		c.queue_free()
	if _tour >= 0:
		_tour_draw.call_deferred(_tour_gen)
	if bench != null:
		bench.call("_tour_running", _tour >= 0)
	if not active or top != KIT_04:
		_hud.visible = false
	if not active:
		return
	# DEVANT TOUT LE CHROME : l'ombre de la visite couvre la barre du haut et
	# la quete, et une carte ouverte passe par-dessus la colonne.
	get_parent().move_child(self, get_parent().get_child_count() - 1)
	_treasure(d)
	match layout:
		0: _conseiller(d)
		1: _quete()
		2: _etiquettes.call_deferred(d, _content.get_instance_id())
		4: _pillard()
		5: _nouvelles(d)
	if bench != null and bench.has_method("_lab_changed"):
		bench.call("_lab_changed")


# ── Le haut, commun aux six ─────────────────────────────────────────────────
#
# La maison a gauche, les carottes au milieu, le potager a droite : tout ce
# qui parle de carottes au meme endroit. La planche porte le coffre — l'or a
# l'abri, le rouge hachure a prendre — et, sous bouclier, le bouclier et son
# minuteur a sa place : rien n'est a prendre. La maison deplie sa carte
# (AMELIORER, le coffre en chiffres, les bouteilles) ; le potager se tape et
# rentre.

func _treasure(d: Dictionary) -> void:
	var row: Control
	match top:
		KIT_04: row = _kit_04(d)
		0: row = _trio_stone(d)
		2: row = _sign(d)
		_: row = _trio(d, top == 1)

	if _sheet_kind == "house":
		var card := _house_card(d)
		_content.add_child(card)
		card.reset_size()
		card.position = Vector2(row.position.x, row.position.y + TOP_H + 8.0)
		if top == KIT_04:
			# Sous le bouton de la maison, sous l'ensemble.
			card.position = Vector2(maxf(_inset_x(), row.position.x + _hud.rest_rect("house").position.x), row.position.y + row.size.y + 6.0)


## 7 KIT 04 : le haut du kit, centre en haut ; la maison et le potager sont
## ses boutons. Il entre en scene la premiere fois qu'il se montre.
func _kit_04(d: Dictionary) -> Control:
	var first := not _hud.visible
	_hud.visible = true
	_hud.position = Vector2(roundf((_view().x - _hud.size.x) * 0.5), Kit.EDGE)
	_hud.show_data(d.merged({"house_word": HOUSE_WORD.get(I18N.locale, HOUSE_WORD["en"])}))
	_house_chip = _hud.house_button
	_plank = _hud.middle
	_garden_chip = _hud.harvest_button
	if first:
		_hud.play_entrance()
	return _hud


## LES PUCES ET LA PLANCHE (tour 1) : centrees, ou a gauche (2 DEUX GROUPES).
func _trio(d: Dictionary, left: bool) -> Control:
	# L'air entre les puces et la planche : ses feuilles debordent de son
	# cadre de ~10 px et mangeaient « LVL 1 ».
	var row := Kit.hbox(PLANK_LEAVES)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_content.add_child(row)
	_house_chip = _chip_button(_icon("house", 28.0), "LVL %d" % d.level, Palette.CREAM, _toggle_house,
		bool(d.can), -1.0, _sheet_kind == "house")
	row.add_child(_house_chip)
	_plank = _carrot_plank(d)
	row.add_child(_plank)
	_garden_chip = _chip_button(_icon("garden", 28.0), ("+%s" % _n(d.garden)) if d.garden > 0 else "+0",
		GOOD_INK if d.garden > 0 else DIM, func() -> void: bench.call("_harvest"), false, float(d.fill), float(d.fill) >= 1.0)
	(_garden_chip as Button).disabled = d.garden <= 0
	row.add_child(_garden_chip)
	row.reset_size()
	var w := row.get_combined_minimum_size().x
	row.position = Vector2(_inset_x() if left else roundf((_view().x - w) * 0.5), Kit.EDGE)
	return row


func _toggle_house() -> void:
	_sheet_kind = "" if _sheet_kind == "house" else "house"
	_rebuild(true)


## 1 PIERRE : la maison et le potager en anneaux du rail (HubIconButton),
## leur chiffre dans la puce du haut — rouge quand il faut agir (AMELIORER
## payable, potager plein) ; la jauge du potager sous son anneau.
func _trio_stone(d: Dictionary) -> Control:
	var view := _view()
	var sq := Kit.ICON_MIN if view.x < TopBar.NARROW_W else Kit.icon_square(view.y)
	var row := Kit.hbox(PLANK_LEAVES)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_content.add_child(row)
	var house := HubIconButton.make("House", BurrowProps.home_art(int(d.level), true))
	house.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	house.pressed.connect(_toggle_house)
	row.add_child(house)
	house.set_square(sq, view.y)
	house.set_badge("LVL %d" % d.level, bool(d.can))
	_house_chip = house
	_plank = _carrot_plank(d)
	row.add_child(_plank)
	var garden_col := Kit.vbox(3)
	garden_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	garden_col.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(garden_col)
	var garden := HubIconButton.make("Garden", Kit.ICONS["garden"])
	garden.pressed.connect(func() -> void: bench.call("_harvest"))
	garden_col.add_child(garden)
	garden.set_square(sq, view.y)
	garden.set_badge(("+%s" % _n(d.garden)) if d.garden > 0 else "+0", float(d.fill) >= 1.0)
	var m := BurrowMeter.new()
	m.custom_minimum_size = Vector2(sq, 8)
	m.value = float(d.fill)
	m.tone = "carrot" if float(d.fill) < 1.0 else "danger"
	garden_col.add_child(m)
	_garden_chip = garden_col
	row.reset_size()
	var w := row.get_combined_minimum_size().x
	row.position = Vector2(roundf((view.x - w) * 0.5), Kit.EDGE)
	return row


## 3 ENSEIGNE : une planche longue, trois cases — la maison, les carottes et
## leur coffre, le potager. Les bouts se tapent comme les puces.
func _sign(d: Dictionary) -> Control:
	var size := Vector2(SIGN_W, TOP_H)
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.custom_minimum_size = size
	_content.add_child(box)
	var cap := Kit.PLANK_CAP * size.y / float(Kit.PLANK.get_height())
	var board := NineSlice.make(Kit.PLANK, Vector4i(Kit.PLANK_CAP, 0, Kit.PLANK_CAP, 0), Vector4(cap, 0, cap, 0), true)
	Kit.fill(board)
	box.add_child(board)
	var row := Kit.hbox(6)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.position = Vector2(cap * 0.6, size.y * 0.04)
	row.size = Vector2(size.x - cap * 1.2, size.y * 0.84)
	box.add_child(row)

	var house := _sign_end("house", d)
	row.add_child(house)
	_house_chip = house
	row.add_child(_notch())

	var mid := Kit.vbox(2)
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var figure := Kit.hbox(Kit.PAD_TIGHT)
	figure.alignment = BoxContainer.ALIGNMENT_CENTER
	figure.mouse_filter = Control.MOUSE_FILTER_IGNORE
	figure.add_child(_label(_n(d.stock), 20, Palette.PILL_INK))
	figure.add_child(Kit.icon(Kit.ICONS["carrot"], 16.0))
	mid.add_child(figure)
	mid.add_child(_guard(d))
	row.add_child(mid)
	_plank = mid
	row.add_child(_notch())

	var garden := _sign_end("garden", d)
	row.add_child(garden)
	_garden_chip = garden

	box.position = Vector2(roundf((_view().x - size.x) * 0.5), Kit.EDGE)
	return box


## LES BOUTS DE L'ENSEIGNE, ce qu'on tape. « J'aime beaucoup mais on ne
## comprend pas qu'il faut cliquer » (2026-10-13) : quatre facons de le
## dire, `sign_style` (touche A au banc).
##   0 BOUTONS  de vrais boutons du kit (HubSlab) dans le bois : terre pour
##              la maison (orange quand AMELIORER est payable), vert pour le
##              potager, gris quand il n'y a rien a rentrer.
##   1 VERBES   le bout dit son verbe : « UPGRADE ▸ », « HARVEST ▸ ».
##   2 VIVANT   le bout bouge quand il y a quelque chose a faire : le potager
##              respire, la maison bat avec un « ! ».
##   3 RELIEF   des touches de bois en relief, qui s'enfoncent sous le doigt.
const SIGN_STYLES := ["BOUTONS", "VERBES", "VIVANT", "RELIEF"]
const VERB_ON_WOOD := Color("#8c2f0c")


func _sign_end(kind: String, d: Dictionary) -> Button:
	var house := kind == "house"
	var act: Callable = _toggle_house if house else func() -> void: bench.call("_harvest")
	var value := "LVL %d" % d.level if house else (("+%s" % _n(d.garden)) if d.garden > 0 else "+0")
	var ready := bool(d.can) if house else int(d.garden) > 0
	var icon := _icon("house" if house else "garden", 22.0)
	var b: Button
	if sign_style == 0:
		var slab := HubSlab.new(("carrot" if d.can else "earth") if house else "green", 34.0)
		slab.set_lit(house or ready)
		var r := Kit.hbox(3)
		r.alignment = BoxContainer.ALIGNMENT_CENTER
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		r.add_child(icon)
		r.add_child(_label(value, 12, Color.WHITE if (house or ready) else Palette.PILL_INK))
		slab.content.add_child(r)
		slab.pressed.connect(act)
		slab.custom_minimum_size = Vector2(96, 34)
		slab.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b = slab
	else:
		b = _flat_button(act)
		if sign_style == 3:
			_relief(b)
		var col := Kit.vbox(1)
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		var r := Kit.hbox(4)
		r.alignment = BoxContainer.ALIGNMENT_CENTER
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		r.add_child(icon)
		r.add_child(_label(value, 12, Palette.PILL_INK))
		col.add_child(r)
		if sign_style == 1:
			var verb := I18N.shout(I18N.t("burrow.upgrade")) if house else I18N.shout(I18N.t("burrow.harvest"))
			var v := _label(verb + " ▸", 8, VERB_ON_WOOD if ready else Color(Palette.PILL_INK, 0.55))
			v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			col.add_child(v)
		elif not house:
			var m := BurrowMeter.new()
			m.custom_minimum_size = Vector2(56, 8)
			m.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			m.value = float(d.fill)
			m.tone = "carrot" if float(d.fill) < 1.0 else "danger"
			col.add_child(m)
		b.add_child(col)
		Kit.fill(col)
		if sign_style == 3:
			col.offset_bottom = -3.0
			b.button_down.connect(func() -> void: col.position.y += 2.0)
			b.button_up.connect(func() -> void: col.position.y -= 2.0)
		b.custom_minimum_size = Vector2(96, 0)
		if sign_style == 2 and ready:
			_alive(b, icon, house)
	if house and d.can and sign_style != 2:
		var p := _dot()
		p.position = Vector2(b.custom_minimum_size.x - 8.0, -2.0)
		b.add_child(p)
	b.disabled = not house and not ready
	return b


## 3 RELIEF : une touche de bois plus clair, une levre sombre dessous qui
## s'ecrase a la pression.
func _relief(b: Button) -> void:
	var up := StyleBoxFlat.new()
	up.bg_color = Color("#d39a5c")
	up.border_color = Color("#6b3a1a")
	up.set_border_width_all(1)
	up.border_width_bottom = 4
	up.set_corner_radius_all(6)
	var hover := up.duplicate()
	hover.bg_color = Color("#e0aa6c")
	var down := up.duplicate()
	down.border_width_bottom = 1
	down.border_width_top = 3
	down.bg_color = Color("#c58c50")
	var off := up.duplicate()
	off.bg_color = Color("#b98a5e")
	b.add_theme_stylebox_override("normal", up)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", down)
	b.add_theme_stylebox_override("disabled", off)


## 2 VIVANT : l'icone respire, un halo d'or bat derriere le bout ; la
## maison porte un « ! ». Seulement quand il y a quelque chose a faire.
func _alive(b: Button, icon: Control, house: bool) -> void:
	var glow := Panel.new()
	var gs := StyleBoxFlat.new()
	gs.bg_color = Color(1.0, 0.85, 0.3, 0.0)
	gs.set_corner_radius_all(8)
	glow.add_theme_stylebox_override("panel", gs)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(glow)
	b.move_child(glow, 0)
	Kit.fill(glow)
	var pulse := glow.create_tween().set_loops()
	pulse.tween_method(func(a: float) -> void: gs.bg_color.a = a, 0.0, 0.35, 0.7).set_trans(Tween.TRANS_SINE)
	pulse.tween_method(func(a: float) -> void: gs.bg_color.a = a, 0.35, 0.0, 0.7).set_trans(Tween.TRANS_SINE)
	(func() -> void:
		if not is_instance_valid(icon):
			return
		icon.pivot_offset = icon.size * 0.5
		var bob := icon.create_tween().set_loops()
		bob.tween_property(icon, "scale", Vector2.ONE * 1.18, 0.35).set_trans(Tween.TRANS_SINE)
		bob.tween_property(icon, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_SINE)
		bob.tween_interval(0.6)).call_deferred()
	if house:
		var mark := Kit.badge(16.0)
		mark.custom_minimum_size = Vector2(16, 16)
		mark.size = Vector2(16, 16)
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var l := _label("!", 10, Color.WHITE)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		Kit.fill(l)
		mark.add_child(l)
		mark.position = Vector2(76, -6)
		b.add_child(mark)


func _flat_button(act: Callable) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	b.pressed.connect(act)
	return b


## Une entaille dans le bois, entre deux cases de l'enseigne.
func _notch() -> ColorRect:
	var r := ColorRect.new()
	r.color = Color(0.24, 0.13, 0.07, 0.55)
	r.custom_minimum_size = Vector2(2, 0)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


# ── Le haut : la barre du jeu, rangee autrement ─────────────────────────────

func _top_bar() -> TopBar:
	return bench.get("_top") if bench != null else null


func _menus(t: TopBar) -> Array:
	return [t.shop_button, t.story_button, t.season_button]


## RENDRE la barre du haut telle que le jeu la monte : le rail a gauche, le
## profil au coin droit, tout visible ; ce qu'on y a ajoute s'en va.
func _restore_top() -> void:
	var t := _top_bar()
	if t == null:
		return
	var menus := _menus(t)
	for i in menus.size():
		var b: Control = menus[i]
		b.visible = true
		if b.get_parent() != t._rail:
			b.reparent(t._rail, false)
		t._rail.move_child(b, i)
	if t.me_button.get_parent() != t._corner:
		t.me_button.reparent(t._corner, false)
	t._corner.move_child(t.me_button, t._corner.get_child_count() - 1)
	for n in _top_extras:
		if is_instance_valid(n):
			n.queue_free()
	_top_extras.clear()
	_top_place = Callable()


func _apply_top() -> void:
	var t := _top_bar()
	if t == null:
		return
	var menus := _menus(t)
	var inset := Kit.screen_inset()
	match top:
		1:
			# Les menus rejoignent le profil, a droite.
			for i in menus.size():
				(menus[i] as Control).reparent(t._corner, false)
				t._corner.move_child(menus[i], i)
		3:
			# En colonne sous le profil ; la puce de chaque anneau deborde de
			# 5 px en haut, d'ou l'ecart. Poses a la main : un VBox ne range
			# pas ces anneaux (ils se dimensionnent eux-memes, `set_square`).
			var col := Control.new()
			col.mouse_filter = Control.MOUSE_FILTER_IGNORE
			t.add_child(col)
			_top_extras.append(col)
			for b in menus:
				(b as Control).reparent(col, false)
			var place := func() -> void:
				var y := TopBar.rail_bottom(_view()) + 14.0
				for b in menus:
					var c := b as Control
					c.position = Vector2(_view().x - inset.x - c.size.x, y)
					y += c.size.y + 14.0
			# A CHAQUE IMAGE (`_process`) : quelque chose dans la barre remet
			# ses pieces a leur place d'origine apres nous.
			_top_place = place
		4:
			# Le bandeau, sous tout le reste de la barre.
			var band := Panel.new()
			var s := Kit.style_caption()
			s.set_corner_radius_all(0)
			s.corner_radius_bottom_left = 12
			s.corner_radius_bottom_right = 12
			band.add_theme_stylebox_override("panel", s)
			band.mouse_filter = Control.MOUSE_FILTER_IGNORE
			band.set_anchors_preset(Control.PRESET_TOP_WIDE)
			band.offset_bottom = Kit.EDGE + TOP_H + 6.0
			t.add_child(band)
			t.move_child(band, 0)
			_top_extras.append(band)
			# Le profil a gauche, les menus a droite.
			t.me_button.reparent(t._rail, false)
			t._rail.move_child(t.me_button, 0)
			for i in menus.size():
				(menus[i] as Control).reparent(t._corner, false)
				t._corner.move_child(menus[i], i)
		5:
			t.story_button.visible = false
			t.season_button.visible = false


## LA PLANCHE DES CAROTTES et ce qui la garde : le coffre en barre sur le
## bois, ou le bouclier et son minuteur.
func _carrot_plank(d: Dictionary) -> Control:
	var size := Vector2(PLANK_W, TOP_H)
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.custom_minimum_size = size
	var cap := Kit.PLANK_CAP * size.y / float(Kit.PLANK.get_height())
	var board := NineSlice.make(Kit.PLANK, Vector4i(Kit.PLANK_CAP, 0, Kit.PLANK_CAP, 0), Vector4(cap, 0, cap, 0), true)
	Kit.fill(board)
	box.add_child(board)
	# Le bois va des rangees 2 a 35 sur 40 : le chiffre dans le haut, la
	# garde dans le bas.
	var col := Kit.vbox(2)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.position = Vector2(cap * 0.7, size.y * 0.06)
	col.size = Vector2(size.x - cap * 1.4, size.y * 0.8)
	box.add_child(col)
	var row := Kit.hbox(Kit.PAD_TIGHT)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_label(_n(d.stock), 20, Palette.PILL_INK))
	row.add_child(Kit.icon(Kit.ICONS["carrot"], 16.0))
	col.add_child(row)
	col.add_child(_guard(d))
	return box


## CE QUI GARDE LES CAROTTES, sur le bois : le coffre en barre, ou le
## bouclier et son minuteur.
func _guard(d: Dictionary) -> Control:
	if float(d.shield) > 0.0:
		var guard := Kit.hbox(3)
		guard.alignment = BoxContainer.ALIGNMENT_CENTER
		guard.mouse_filter = Control.MOUSE_FILTER_IGNORE
		guard.add_child(Kit.icon(Kit.ICONS["shield"], 11.0))
		guard.add_child(_label(I18N.wait(float(d.shield)), 9, SAFE_INK))
		return guard
	var vault := HousePanel._VaultBar.new()
	vault.safe = int(d.safe)
	vault.exposed = int(d.exposed)
	vault.custom_minimum_size = Vector2(0, 6)
	return vault


## LA CARTE DE LA MAISON, au style du MOMENT : le niveau, ce que le suivant
## ajoute, le coffre en chiffres, AMELIORER, les bouteilles.
func _house_card(d: Dictionary) -> PanelContainer:
	var extra := Kit.vbox(3)
	extra.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var legend := Kit.hbox(4)
	legend.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if float(d.shield) > 0.0:
		legend.add_child(_label(I18N.f("loop.shieldFor", [I18N.wait(float(d.shield))]), 9, SAFE_INK))
	else:
		var safe := _label("%s %s" % [I18N.shout(I18N.t("burrow.safe")), _n(d.safe)], 9, SAFE_INK)
		safe.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		legend.add_child(safe)
		legend.add_child(_label(I18N.f("burrow.exposed", [_n(d.exposed)]), 9, EXPOSED_INK if d.exposed > 0 else DIM))
	extra.add_child(legend)
	if not (d.bottles as Array).is_empty():
		var pour := Kit.hbox(4)
		for bottle: Array in d.bottles:
			var b := HubSlab.new("green", 24.0)
			var r := Kit.hbox(2)
			r.alignment = BoxContainer.ALIGNMENT_CENTER
			r.mouse_filter = Control.MOUSE_FILTER_IGNORE
			r.add_child(Kit.icon(Kit.ICONS[String(bottle[0])], 12.0))
			r.add_child(_label("%d" % int(bottle[1]), 9, Color.WHITE))
			b.content.add_child(r)
			var kind := String(bottle[0])
			b.pressed.connect(func() -> void: bench.call("_toast_say", "%s — verse sur le potager." % kind.to_upper()))
			pour.add_child(b)
		extra.add_child(pour)
	var why := "LVL %d: +%d carrots/h, +%d energy/h." % [int(d.level) + 1,
		int(d.next_yield) - int(d.yield), maxi(0, int(d.next_regen) - int(d.regen))] \
		if int(d.next_yield) >= 0 else "Your burrow is at its last level."
	return _moment_card({
		"title": I18N.f("burrow.level", [d.level]),
		"why": why,
		"extra": extra,
		"verb": (I18N.shout(I18N.t("burrow.upgrade")) + " " + _n(d.cost)) if d.cost != null else I18N.t("burrow.maxLevel"),
		"tone": "earth",
		"lit": bool(d.can),
		"act": func() -> void: bench.call("_upgrade"),
		"close": func() -> void:
			_sheet_kind = ""
			_rebuild(true),
	})


# ── 1 CONSEILLER ────────────────────────────────────────────────────────────
#
# On comprend un systeme par ses consequences : le terrier dit la prochaine
# chose a faire ET POURQUOI — « +60 attendent dehors, un pillard les prend
# en premier ». L'ordre est celui de `Content.next_action`, DIG en moins (DIG
# a deja sa planche). Rien a dire : pas de carte, la quete remonte.

func _conseiller(d: Dictionary) -> void:
	var advice := _advice(d)
	if advice.is_empty():
		return
	var card := _moment_card(advice[0])
	_content.add_child(card)
	card.reset_size()
	card.position = Vector2(_inset_x(), _top())
	_advice_card = card


func _advice(d: Dictionary) -> Array:
	var out: Array = []
	if float(d.fill) >= GARDEN_URGENT:
		out.append({"key": "garden", "title": "YOUR GARDEN IS FULL",
			"why": "+%s carrots wait outside. A raider takes them first." % _n(d.garden),
			"verb": "HARVEST +%s" % _n(d.garden), "tone": "green", "act": func() -> void: bench.call("_harvest")})
	if float(d.shield) > 0.0 and float(d.shield) < SHIELD_WARN_MS and int(d.bombs) < 3:
		out.append({"key": "shield", "title": "YOUR SHIELD DROPS SOON",
			"why": "In %s your garden is open. Bury bombs before." % I18N.wait(float(d.shield)),
			"verb": "DEFEND", "tone": "carrot", "act": func() -> void: bench.call("_set_building", true)})
	elif float(d.shield) < 0.0 and int(d.bombs) < 3 and int(d.garden) > 0:
		out.append({"key": "defence", "title": "NOTHING GUARDS YOUR GARDEN",
			"why": "Bury bombs on the raider's path.",
			"verb": "DEFEND", "tone": "carrot", "act": func() -> void: bench.call("_set_building", true)})
	if d.can:
		out.append({"key": "upgrade", "title": "YOUR BURROW CAN GROW",
			"why": "LVL %d: +%d carrots/h, a bigger safe." % [int(d.level) + 1, int(d.next_yield) - int(d.yield)],
			"verb": "UPGRADE %s" % _n(d.cost), "tone": "earth", "act": func() -> void: bench.call("_upgrade")})
	return out


# ── 2 QUETE ─────────────────────────────────────────────────────────────────
#
# Apres le tuto, l'arc de quetes EST le cours : creuser, lire les pierres,
# tenir la porte… La quete prend la carte : ce qu'on demande, ou on en est
# (la jauge), un seul bouton — RECLAMER quand c'est fait, sinon Y ALLER. La
# Crown Race, une offre et pas une chose a faire, passe a droite.

func _quete() -> void:
	var q := Home.active_quest()
	if not q.is_empty():
		var done := bool(q.get("done", false))
		var goal := maxi(1, int(q.get("goal", 1)))
		var progress := int(q.get("progress", 0))
		var extra := Kit.hbox(4)
		extra.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var m := BurrowMeter.new()
		m.custom_minimum_size = Vector2(0, 11)
		m.value = float(progress) / float(goal)
		extra.add_child(m)
		extra.add_child(_label("%d/%d" % [progress, goal], 9, DIM))
		var reward := int((q.get("reward", {}) as Dictionary).get("carrots", 0))
		var line := String(q.get("line", ""))
		var card := _moment_card({
			"title": "QUEST %d/%d · %s" % [int(q.get("index", 0)), int(q.get("total", 0)), String(q.get("title", "")).to_upper()],
			"why": String(q.get("ask", "")) + ("" if line.is_empty() else "\n" + line),
			"extra": extra,
			"verb": ("CLAIM +%s" % _n(reward)) if done else "GO",
			"tone": "carrot" if done else "earth",
			"act": func() -> void: bench.call("_toast_say", "QUETE — reclamerait la recompense." if done else "QUETE — menerait a DIG."),
		})
		_content.add_child(card)
		card.reset_size()
		card.position = Vector2(_inset_x(), _top())
	# La Crown Race, a droite sous le lapin.
	var host := Control.new()
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(host)
	var banner: Control = PassBanner.new()
	host.add_child(banner)
	Kit.fill(banner)
	host.position = Vector2(_view().x - _inset_x() - SIDE_W, _top())
	host.size = Vector2(SIDE_W, 64)
	(func() -> void:
		if is_instance_valid(banner) and is_instance_valid(host):
			host.size = Vector2(SIDE_W, banner.get_combined_minimum_size().y)).call_deferred()


# ── 3 ETIQUETTES ────────────────────────────────────────────────────────────
#
# Une icone ne s'apprend qu'une fois qu'on sait ce qu'elle veut dire. Les
# premiers jours, chaque chose dit ce qu'elle est et ce qu'on en fait, en
# mots courts poses dessous (en haut) ou dessus (au sol) — une legende de
# carte. Au jeu, elles s'effaceraient apres quelques visites.

func _etiquettes(d: Dictionary, built: int) -> void:
	# La rangee du haut range ses enfants a l'image suivante : on la mesure
	# apres, et un montage refait entre-temps a ses propres legendes.
	if not is_instance_valid(_content) or built != _content.get_instance_id():
		return
	_note_under(_house_chip, "YOUR HOUSE\ngrow it: more carrots/h")
	_note_under(_plank, "YOUR CARROTS\ngold: safe · red: can be stolen" if float(d.shield) <= 0.0 else "YOUR CARROTS\nshield up: nothing can be stolen")
	_note_under(_garden_chip, "YOUR GARDEN\ntap to bring it in")
	var floor_notes := {
		"dig": "go dig the island for carrots",
		"defend": "bury bombs against raiders",
		"raid": "take carrots from other burrows",
	}
	for kind in floor_notes:
		var r := _floor_slab(kind)
		if not r.has_area():
			continue
		var tag := _note(String(floor_notes[kind]))
		_content.add_child(tag)
		tag.reset_size()
		var s := tag.get_combined_minimum_size()
		tag.position = Vector2(roundf(r.get_center().x - s.x * 0.5), r.position.y - s.y - 2.0)


func _note_under(node: Control, text: String) -> void:
	var tag := _note(text, node.size.x)
	_content.add_child(tag)
	tag.reset_size()
	var r := node.get_global_rect()
	var s := tag.get_combined_minimum_size()
	tag.position = Vector2(roundf(r.get_center().x - s.x * 0.5), r.end.y + 3.0)


## Une legende : du texte creme sur une ombre douce, centre.
func _note(text: String, w: float = 0.0) -> PanelContainer:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.05, 0.04, 0.03, 0.55)
	s.set_corner_radius_all(6)
	s.content_margin_left = 5
	s.content_margin_right = 5
	s.content_margin_top = 2
	s.content_margin_bottom = 2
	var p := Kit.panel(s)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := _label(text, 8, NOTE_INK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if w > 0.0:
		_wrap(l, w - 10.0)
	p.add_child(l)
	return p


# ── 4 VISITE ────────────────────────────────────────────────────────────────
#
# A la premiere arrivee, on ne lit pas un ecran : on se le fait montrer.
# Shiro (calme) eclaire une chose a la fois — le reste dans l'ombre — et dit
# en une phrase ce qu'elle est et pourquoi elle compte. Kuro (agite) prend
# la parole pour DEFEND et RAID : le danger et la revanche sont a lui. Sept
# pas, SUIVANT / PASSER, puis l'ecran normal.

func _tour_steps(d: Dictionary) -> Array:
	# KIT 04 : la ou ses pieces seront, pas ou l'entree les a laissees.
	var kit := func(part: String, node: Control) -> Rect2:
		if top != KIT_04 or not _hud.visible:
			return _screen_rect(node)
		var r := _hud.rest_rect(part)
		return Rect2(_hud.global_position + r.position, r.size)
	return [
		{"rect": kit.call("middle", _plank), "who": "SHIRO", "title": "YOUR CARROTS",
			"why": "Everything you dig ends up here. The gold part is safe. The red part, a raider could take."},
		{"rect": kit.call("harvest", _garden_chip), "who": "SHIRO", "title": "YOUR GARDEN",
			"why": "It grows by itself, +%d an hour. Tap it to bring the carrots in — until then they can be stolen." % d.yield},
		{"rect": kit.call("house", _house_chip), "who": "SHIRO", "title": "YOUR HOUSE",
			"why": "Spend carrots to grow it: more carrots an hour, more of them safe."},
		{"rect": _floor_slab("dig"), "who": "SHIRO", "title": "DIG",
			"why": "The island is where carrots come from. Each dig costs energy; the ring fills up again on its own."},
		{"rect": _floor_slab("defend"), "who": "KURO", "title": "BURY",
			"why": "Raiders WILL come for your garden. Bury bombs on their path — make them pay for every step!"},
		{"rect": _floor_slab("raid"), "who": "KURO", "title": "RAID",
			"why": "And you get to do it back. Their gardens, your carrots!"},
		{"rect": _quest_rect(), "who": "SHIRO", "title": "WHEN IN DOUBT",
			"why": "Follow your quest. It always knows the next step."},
	]


## LA VISITE EN ILOTS (2026-10-13 : « tu peux me faire la visite en mode
## ilot ? ») : les memes pas, sur ce que l'ecran du jeu montre vraiment — la
## pastille (le cadran et les carottes), la planche HARVEST du potager, le
## volet BURROW, puis les ilots DIG, DEFEND, RAID, SHOP, et la quete. DEFEND
## garde son nom ici : c'est celui de son ilot.
func _islet_steps(d: Dictionary) -> Array:
	var top: TopBar = bench.get("_top")
	var landmarks: Node = (bench.get("_burrow") as Node).get("_landmarks")
	var signs: Dictionary = landmarks.get("_signs")
	var sign := func(door: String) -> Rect2:
		return _screen_rect(signs.get(door)) if signs.has(door) else Rect2()
	var house: Node = bench.get("_house")
	var house_rect := _screen_rect(house.get("_button"))
	if not house_rect.has_area():
		house_rect = _screen_rect(house.get("_panel"))
	return [
		{"rect": _screen_rect(top.pill), "who": "SHIRO", "title": "YOUR CARROTS",
			"why": "Everything you dig ends up here. The ring is your energy: each dig costs some, and it fills back up on its own."},
		{"rect": sign.call("harvest"), "who": "SHIRO", "title": "YOUR GARDEN",
			"why": "It grows by itself, +%d an hour. Tap HARVEST to bring the carrots in — until then a raider can steal them." % d.yield},
		{"rect": house_rect, "who": "SHIRO", "title": "YOUR HOUSE",
			"why": "Spend carrots to make it bigger: more carrots an hour, and more of them safe from raiders."},
		{"rect": sign.call("dig"), "who": "SHIRO", "title": "DIG",
			"why": "Cross the bridge to the island. That's where carrots come from."},
		{"rect": sign.call("defend"), "who": "KURO", "title": "DEFEND",
			"why": "Raiders WILL come for your garden! Bury bombs on their path — make them pay for every step!"},
		{"rect": sign.call("raid"), "who": "KURO", "title": "RAID",
			"why": "And you get to do it back. Their gardens, your carrots!"},
		{"rect": sign.call("shop"), "who": "SHIRO", "title": "SHOP",
			"why": "Bombs, energy, a new coat. No hurry."},
		{"rect": _quest_rect(), "who": "SHIRO", "title": "WHEN IN DOUBT",
			"why": "Follow your quest. It always knows the next step."},
	]


## Un Control a l'ecran, echelle comprise (la pastille est a 0,75) ; vide
## s'il n'est pas la.
func _screen_rect(node: Variant) -> Rect2:
	if not (node is Control) or not is_instance_valid(node) or not (node as Control).is_visible_in_tree():
		return Rect2()
	var c := node as Control
	return c.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, c.size)


func _tour_draw(gen: int) -> void:
	# Une image de plus : les rangees du haut rangent leurs enfants a
	# l'image suivante, et un trou mesure avant tombait a cote.
	await get_tree().process_frame
	# Un montage refait entre-temps a sa propre visite : celle-ci est perimee.
	if gen != _tour_gen or _tour < 0:
		return
	# EN ILOTS, les planches des ilots ne s'allument qu'une fois le terrier
	# dresse (`set_live`) : la visite les attend.
	if not active:
		var landmarks: Node = (bench.get("_burrow") as Node).get("_landmarks")
		if not bool(landmarks.get("_live")):
			get_tree().create_timer(0.2).timeout.connect(_tour_draw.bind(gen))
			return
	var d := _d()
	var steps: Array = (_tour_steps(d) if active else _islet_steps(d)).filter(
		func(st: Dictionary) -> bool: return (st.rect as Rect2).has_area())
	if _tour >= steps.size():
		return
	var step: Dictionary = steps[_tour]
	var hole: Rect2 = (step.rect as Rect2).grow(6.0)
	# Au pixel pres : deux bandes de l'ombre qui se chevauchent d'une fraction
	# tracent une ligne plus sombre sur tout l'ecran.
	hole = Rect2(hole.position.round(), hole.size.round())
	var view := _view()
	# L'OMBRE en quatre bandes autour du trou : elle arrete les tapes, la
	# chose montree reste vivante.
	for r in [Rect2(0, 0, view.x, hole.position.y), Rect2(0, hole.end.y, view.x, view.y - hole.end.y),
			Rect2(0, hole.position.y, hole.position.x, hole.size.y),
			Rect2(hole.end.x, hole.position.y, view.x - hole.end.x, hole.size.y)]:
		var shade := ColorRect.new()
		shade.color = SHADE
		shade.mouse_filter = Control.MOUSE_FILTER_STOP
		shade.position = r.position
		shade.size = r.size
		_tour_root.add_child(shade)
	var rim := Panel.new()
	var rs := StyleBoxFlat.new()
	rs.bg_color = Color.TRANSPARENT
	rs.border_color = SAFE_INK
	rs.set_border_width_all(2)
	rs.set_corner_radius_all(8)
	rim.add_theme_stylebox_override("panel", rs)
	rim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rim.position = hole.position
	rim.size = hole.size
	_tour_root.add_child(rim)

	var last := _tour == steps.size() - 1
	var kuro := String(step.who) == "KURO"
	var card := _moment_card({
		"w": 250.0,
		"title": "%s  ·  %s" % [step.who, step.title],
		"why": String(step.why),
		"verb": "GOT IT" if last else "NEXT  %d/%d" % [_tour + 1, steps.size()],
		"tone": "carrot" if kuro else "green",
		"act": func() -> void:
			_tour = -1 if last else _tour + 1
			_rebuild(true),
		"close": func() -> void:
			_tour = -1
			_rebuild(true),
	})
	_tour_root.add_child(card)
	card.reset_size()
	var cs := card.get_combined_minimum_size()
	# Sous la chose si elle est en haut, au-dessus sinon ; dans l'ecran.
	var y := hole.end.y + 8.0 if hole.get_center().y < view.y * 0.5 else hole.position.y - cs.y - 8.0
	var x := clampf(hole.get_center().x - cs.x * 0.5, _inset_x(), view.x - _inset_x() - cs.x)
	card.position = Vector2(roundf(x), clampf(roundf(y), Kit.EDGE, view.y - cs.y - Kit.EDGE))


func _quest_rect() -> Rect2:
	var column: Control = bench.get("_column")
	if column != null and column.has_method("cards_rect"):
		var r: Rect2 = column.call("cards_rect")
		if r.has_area():
			return r
	return Rect2(_inset_x(), _top(), SIDE_W, 120)


# ── 5 LE PILLARD ────────────────────────────────────────────────────────────
#
# « Defendre » est abstrait tant qu'on n'a pas vu un pillard. Au-dessus de
# DEFEND, ce que la defense vaut CE SOIR : le chemin le moins cher (le meme
# calcul que le mode, `_cheapest`) et s'il atteint le potager — il passe et
# il lui reste N ⚡, ou il s'arrete. Le bouton ouvre le mode, chemin dessine.

func _pillard() -> void:
	var slab := _floor_slab("defend")
	if not slab.has_area():
		return
	var shop := ShopState.shared()
	var route: Dictionary = bench.call("_cheapest", bench.call("_layout"), shop.traps.get("placed", []), shop.fences.get("placed", []))
	var budget: int = bench.call("_walk_budget")
	var pick: Dictionary
	if route.is_empty():
		pick = {"title": "YOUR GARDEN IS WALLED OFF", "why": "No raider can reach it.", "verb": "DEFEND", "tone": "earth"}
	else:
		var steps: int = (route.path as Array).size() - 1
		var hits: int = (route.hits as Array).size()
		var cost: int = route.cost
		if cost < budget:
			pick = {"title": "A RAIDER REACHES YOUR GARDEN",
				"why": "His cheapest path: %d steps, %d bomb%s. He gets there with %d energy to spare." % [steps, hits, "" if hits == 1 else "s", budget - cost],
				"verb": "DEFEND", "tone": "carrot"}
		else:
			pick = {"title": "YOUR DEFENCE HOLDS",
				"why": "His cheapest path costs %d energy — he only has %d." % [cost, budget],
				"verb": "SEE HIS PATH", "tone": "green"}
	pick["act"] = func() -> void: bench.call("_set_building", true)
	var card := _moment_card(pick)
	_content.add_child(card)
	card.reset_size()
	var h := card.get_combined_minimum_size().y
	card.position = Vector2(roundf(slab.get_center().x - card.size.x * 0.5), slab.position.y - h - Kit.PAD_TIGHT)


# ── 6 NOUVELLES ─────────────────────────────────────────────────────────────
#
# On comprend le pillage en le subissant : « Kuro t'a pris 42 » → VENGEANCE ;
# le potager plein ; le bouclier qui tombe. Ce qui est ARRIVE et ce qui va
# arriver, cause et consequence, en cartes qui se posent en bas a droite (le
# pouce droit), deux au plus, et qu'on ferme.

func _nouvelles(d: Dictionary) -> void:
	var news: Array = []
	if not _dismissed.has("raided"):
		news.append({"key": "raided", "title": "%s RAIDED YOU" % String(RAIDED.name).to_upper(),
			"why": "-%d carrots: the red part of your pile, and your garden. Their garden is open now." % int(RAIDED.took),
			"verb": "REVENGE", "tone": "carrot", "act": func() -> void: bench.call("_toast_say", "VENGEANCE — ouvrirait le raid sur Kuro.")})
	for a: Dictionary in _advice(d):
		if not _dismissed.has(a.key):
			news.append(a)
	var shown := news.slice(0, 2)
	var y := _floor_top()
	var right := _view().x - _inset_x()
	for i in range(shown.size() - 1, -1, -1):
		var pick: Dictionary = shown[i]
		var key := String(pick.key)
		pick["close"] = func() -> void:
			_dismissed[key] = true
			_rebuild(true)
		var card := _moment_card(pick)
		_content.add_child(card)
		card.reset_size()
		var h := card.get_combined_minimum_size().y
		y -= h
		card.position = Vector2(right - card.size.x, y)
		y -= Kit.PAD_TIGHT


# ── La carte du MOMENT ──────────────────────────────────────────────────────

## La carte or : un titre, une phrase, au besoin une piece en plus (jauge,
## chiffres), et UN bouton. `close` met une croix au coin.
func _moment_card(pick: Dictionary) -> PanelContainer:
	var card := Kit.panel(_caption(8, 8, 6, 8, SAFE_INK))
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var col := Kit.vbox(4)
	card.add_child(col)
	var head := Kit.hbox(4)
	col.add_child(head)
	var title := _label(String(pick.title), 11, SAFE_INK)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	head.add_child(title)
	if pick.has("close"):
		var x := _text_button("×", pick.close)
		x.custom_minimum_size = Vector2(16, 14)
		head.add_child(x)
	var w := float(pick.get("w", SIDE_W))
	col.add_child(_wrap(_label(String(pick.why), 9, Palette.CREAM), w - 16.0))
	if pick.has("extra"):
		col.add_child(pick.extra)
	var slab := HubSlab.new(String(pick.tone), 26.0)
	slab.add_word(String(pick.verb), 11)
	slab.set_lit(bool(pick.get("lit", true)))
	if pick.has("act"):
		slab.pressed.connect(pick.act)
	col.add_child(slab)
	card.custom_minimum_size.x = w
	return card


# ── Les pieces ───────────────────────────────────────────────────────────────

func _inset_x() -> float:
	return Kit.screen_inset().x


## La legende sombre et translucide du volet du terrier (house_panel.gd).
func _caption(left: float, right: float, top: float, bottom: float, rim: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var s := Kit.style_caption()
	s.content_margin_left = left
	s.content_margin_right = right
	s.content_margin_top = top
	s.content_margin_bottom = bottom
	s.set_corner_radius_all(10)
	if rim.a > 0.0:
		s.border_color = rim
		s.set_border_width_all(1)
	return s


## Un label qui va a la ligne DANS `w` : sans largeur au premier calcul, son
## minimum est d'une lettre par ligne et le panneau qui le porte descendait
## jusqu'au bas de l'ecran.
func _wrap(l: Label, w: float) -> Label:
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = w
	return l


func _label(text: String, size: int, ink: Color) -> Label:
	var l := Kit.label(text, size, ink)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return l


func _n(v: Variant) -> String:
	return I18N.group_digits(float(v))


func _icon(kind: String, px: float = 14.0) -> Control:
	var tex: Texture2D
	match kind:
		"house": tex = BurrowProps.home_art(int(Home.burrow.get("level", 1)), true)
		_: tex = Kit.ICONS[kind]
	var i := Kit.icon(tex, px)
	i.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return i


## Le point d'or : AMELIORER est payable.
func _dot() -> Control:
	var p := Kit.badge(10.0)
	p.custom_minimum_size = Vector2(10, 10)
	p.size = Vector2(10, 10)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


## Une puce du haut, a la hauteur de la planche : icone, chiffre, une jauge
## dessous si `fill` >= 0. `lit` la cerne d'or (ouverte, ou pleine).
func _chip_button(icon: Control, text: String, ink: Color, act: Callable, dot: bool = false,
		fill: float = -1.0, lit: bool = false) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	var face := Kit.panel(_caption(8, 8, 4, 4, SAFE_INK if lit else Color.TRANSPARENT))
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var col := Kit.vbox(3)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	face.add_child(col)
	var row := Kit.hbox(5)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(icon)
	row.add_child(_label(text, 13, ink))
	col.add_child(row)
	if fill >= 0.0:
		var m := BurrowMeter.new()
		m.custom_minimum_size = Vector2(56, 10)
		m.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		m.value = fill
		m.tone = "carrot" if fill < 1.0 else "danger"
		col.add_child(m)
	# Les deux puces a la meme largeur : la planche au milieu, symetrique.
	face.custom_minimum_size = Vector2(CHIP_W, TOP_H)
	b.add_child(face)
	var fs := face.get_combined_minimum_size()
	face.size = fs
	b.custom_minimum_size = fs
	b.size = fs
	if dot:
		var p := _dot()
		p.position = Vector2(fs.x - 7, -3)
		b.add_child(p)
	b.pressed.connect(act)
	return b


func _text_button(text: String, act: Callable) -> Button:
	var b := Button.new()
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	b.text = text
	b.add_theme_font_size_override("font_size", 14)
	b.add_theme_color_override("font_color", Palette.CREAM)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.pressed.connect(act)
	return b
