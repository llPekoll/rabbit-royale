class_name EnergyPopup
extends Dialog
## « OUT OF ENERGY » — le petit dialogue, la ou le joueur a presse.
##
## Porte de src/components/energy-popup.tsx, en gardant ce qu'il a decide :
##
##   • LE BOUTON RESTE VIVANT. Presser GO FARM sur un reservoir vide ne
##     faisait RIEN : la fleche etait desactivee, et le seul controle de
##     l'ecran repondait a un tap par le silence. La sortie d'une barre vide
##     n'etait atteignable que depuis le recap — que celui qui rentre a pied
##     plutot que de mourir ne voit jamais.
##   • CE N'EST PAS L'ETAL, expres : l'etal est un marche a sept etageres,
##     et repondre a « je veux creuser maintenant » par toute une boutique
##     est la facon de perdre le fil. Une ligne d'etat, un prix, un achat,
##     et la porte vers la boutique pour qui veut le reste.
##   • LA ROUTE GRATUITE EST DITE AVANT LA PAYANTE : une recharge offerte
##     sans l'attente a cote est un peage, pas un raccourci.
##   • LES RECHARGES QUI RESTENT, pas celles prises : le joueur decide s'il
##     en depense une, et « 3 prises » est le meme fait pose a l'envers.
##
## Il emprunte la palette de l'etal (ici : le meme parchemin, le meme
## cadre) — un second dialogue dans un second style se lirait comme un
## second jeu. L'argent : meme regle que l'etal, `Shop.UsdcPay` dit
## `pay.needsBuild` ; sans portefeuille, une seule offre plutot que deux dont
## une echoue a la cotation.

## Le joueur veut le reste de la boutique.
signal open_shop

## Le plein est pris (carottes ou argent), apres la fermeture du dialogue.
signal bought

## La largeur du web : 476, pour que le titre bitmap, la bourse et le [x]
## partagent une ligne dans le cadre a feuilles.
const WIDTH := 476.0

var _state: ShopState
var _pay: Shop.UsdcPay
var _rail := "carrots"
## Sur l'ile a sec : la porte rentre au terrier au lieu d'ouvrir l'etal.
var _home := Callable()

var _purse_text: Label
var _count: Label
var _count_max: Label
var _say: Label
var _blurb: Label
var _left: Label
var _buy: PlankButton
var _buy_money: PlankButton
var _foot: VBoxContainer
var _status: PanelContainer
var _status_text: Label
var _door: PlankButton
var _tick: Timer


func _init() -> void:
	super(I18N.t("shop.outOfEnergy"), WIDTH, 0.0)


## OUVRIR sur le chrome. `rail` est celui de l'etal : ce dialogue n'a pas de
## commutateur (une ligne, un prix, c'est tout son propos), mais il DOIT
## tarifer dans le rail que le paiement utilise. Par defaut la porte vers
## l'etal ouvre `Shop.open()` ; `open_shop` reste a ecouter pour qui veut
## autre chose.
##
## `after_buy` : ce qui suit un plein pris. La fin d'une run a sec y met
## « on repart creuser » — celui qui paie au bout d'une run veut continuer,
## pas se retrouver devant la porte DIG a la presser une seconde fois.
##
## `home` : A SEC SUR L'ILE (island.gd `_end_run`), le dialogue est la fin de
## la run. Deux sorties seulement : le plein, ou rentrer. La porte vers
## l'etal devient « Rentrer au terrier », le [x] rentre aussi, et le voile ne
## ferme plus au clic — un tap a cote laisserait le lapin endormi sur une ile
## grise, sans rien a presser.
static func open(rail: String = "carrots", after_buy: Callable = Callable(), home: Callable = Callable()) -> EnergyPopup:
	var dialog := EnergyPopup.new()
	dialog._rail = rail
	dialog._home = home
	if home.is_valid():
		dialog.open_shop.connect(home, CONNECT_ONE_SHOT)
		dialog.close_button.pressed.connect(home, CONNECT_ONE_SHOT)
	else:
		dialog.open_shop.connect(func() -> void: Shop.open())
	if after_buy.is_valid():
		dialog.bought.connect(after_buy, CONNECT_ONE_SHOT)
	if Chrome.current != null:
		var view := Chrome.current.get_viewport_rect().size
		dialog.custom_minimum_size.x = minf(WIDTH, view.x - 2.0 * Kit.EDGE)
		Chrome.current.open(dialog, not home.is_valid())
	return dialog


func _ready() -> void:
	_state = ShopState.shared()
	_pay = Shop.UsdcPay.new()
	_build()
	_refresh()
	_state.changed.connect(_refresh)
	Home.changed.connect(_refresh)
	I18N.locale_changed.connect(func(_code: String) -> void: _refresh())
	_pay.changed.connect(_refresh)
	closed.connect(func() -> void:
		_state.clear_note()
		_pay.error = "")
	# L'attente se compte a la minute pres ; une relecture par seconde
	# suffit pour que la ligne ne mente pas.
	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_refresh)
	add_child(_tick)
	_tick.start()


func _build() -> void:
	# La bourse dans l'en-tete, a cote du titre, avant la colonne du [x].
	var header := title_label.get_parent()
	var purse := Kit.hbox(4)
	purse.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_purse_text = Kit.label("", 15, Palette.INK)
	purse.add_child(_purse_text)
	var purse_icon := Kit.icon(Kit.ICONS["carrot"], 16)
	purse_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	purse.add_child(purse_icon)
	header.add_child(purse)
	header.move_child(purse, 1)

	# LA BARRE, PUIS L'ATTENTE — sur une planche a feuilles
	# (`.rr-energy-state`, SOIL_DEEP que la peau des bois dessine en bois).
	var state := PanelContainer.new()
	# A droite, le bout ENTIER de la planche plus un souffle : a 14, la
	# phrase courait sur les feuilles du bout droit (« Enough », « repartir »).
	state.add_theme_stylebox_override("panel", Kit.style_plank(4.0, Kit.PLANK_CAP + 4.0, 6.0))
	body.add_child(state)
	var state_row := Kit.hbox(Kit.PAD)
	state.add_child(state_row)
	var count_row := Kit.hbox(0)
	count_row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	state_row.add_child(count_row)
	_count = Kit.label("", 24, Palette.CREAM)
	_count.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	count_row.add_child(_count)
	_count_max = Kit.label("", 12, Palette.CREAM.darkened(0.25))
	_count_max.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	count_row.add_child(_count_max)
	_say = Kit.note("", Palette.CREAM, 12)
	_say.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_say.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	state_row.add_child(_say)

	# L'OFFRE : ce que ca remplit et ce qu'il reste, sur UNE ligne, puis le
	# prix qui est le bouton, sur toute la largeur (`.rr-energy-buy`).
	var offer := Kit.vbox(Kit.PAD_TIGHT)
	body.add_child(offer)
	var words := Kit.hbox(6)
	offer.add_child(words)
	_blurb = Kit.note("", Palette.INK, 12)
	_blurb.autowrap_mode = TextServer.AUTOWRAP_OFF
	words.add_child(_blurb)
	_left = Kit.note("", Palette.BARK.lightened(0.25), 12)
	_left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# Au bout de la ligne, sous le bord droit du bouton : le reste se lit
	# comme la valeur de la ligne, pas comme une phrase qui flotte au milieu.
	_left.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	words.add_child(_left)
	var buttons := Kit.hbox(Kit.PAD_TIGHT)
	offer.add_child(buttons)
	_buy = Kit.button("", "gold", 0, 40)
	_buy.label_size = 12
	_buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_buy.pressed.connect(_on_buy)
	buttons.add_child(_buy)
	_buy_money = Kit.button("", "blue", 0, 40)
	_buy_money.label_size = 12
	_buy_money.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_buy_money.pressed.connect(_on_pay_money)
	_buy_money.visible = false
	buttons.add_child(_buy_money)

	# LE PIED : ce qui vient d'arriver, ou la porte — pas une seconde offre,
	# une planche tranquille en bois vers l'etal qu'elle ouvre.
	_foot = Kit.vbox(0)
	add_footer(_foot)
	_status = Kit.panel(Kit.style_soil())
	_status_text = Kit.note("", Palette.CHALK_DIM, 11)
	_status_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_child(_status_text)
	_foot.add_child(_status)
	# Une porte, pas une seconde offre : une petite planche au centre.
	_door = Kit.button("", "wood", 180, 36)
	_door.label_size = 11
	_door.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_door.pressed.connect(func() -> void:
		open_shop.emit()
		closed.emit())
	_foot.add_child(_door)


## Le dialogue mesure son contenu (voir shop.gd `_get_minimum_size`).
func _get_minimum_size() -> Vector2:
	return _inset.get_combined_minimum_size() if _inset != null else Vector2.ZERO


## TOUT SE RELIT : le terrier (Home), l'etal (ShopState), la langue.
func _refresh() -> void:
	if _buy == null:
		return
	set_title(I18N.t("shop.outOfEnergy"))
	var burrow := Home.burrow
	_purse_text.text = I18N.group_digits(int(burrow.get("stock", 0)))

	var live := Home.live_energy()
	var energy := int(live["energy"])
	var max_energy := int(live["max"])
	_count.text = str(energy)
	_count_max.text = "/%d" % max_energy

	# Ponctuation ASCII seulement : la face pixel n'a pas de tiret cadratin
	# et en dessine un comme une boite vide (test/pixel-font-glyphs).
	var run_cost := int(burrow.get("runCost", 0))
	var next_energy: Variant = burrow.get("nextEnergyInMs", null)
	var next_run: Variant = burrow.get("nextRunInMs", null)
	if run_cost > 0:
		_say.text = I18N.f("shop.energySay", [run_cost, _wait(next_run if next_run != null else next_energy)])
	else:
		_say.text = I18N.f("shop.energySayEmpty", [_wait(next_energy)])

	var item := _state.item("energy")
	var left: int = int(item.get("cap", 0)) - int(item.get("held", 0)) if not item.is_empty() else -1
	_blurb.text = I18N.f("shop.fillsTo", [max_energy])
	_left.visible = left >= 0
	if left >= 0:
		_left.text = (I18N.t("shop.noRefills") if left <= 0 else I18N.f("shop.refillsLeft", [left])).strip_edges()

	var busy_now := _state.busy or _pay.stage != Shop.UsdcPay.Stage.IDLE
	var can_buy := not item.is_empty() and bool(item.get("canBuy", false))
	var dead := busy_now or not can_buy
	_buy.board = PlankButton.tone_board("wood" if dead else "gold")
	_buy.disabled = dead
	_buy.relabel((I18N.group_digits(int(item.get("price", 0))) + "  ") if not item.is_empty() else "...")
	_carrot(_buy)

	# L'argent : seulement avec une tresorerie ET un portefeuille (page.tsx :
	# `payments && usdcEnabled && !guest` — les deux repondent a des questions
	# differentes et seule la seconde engage).
	var money := not item.is_empty() and bool(_state.shop.get("usdcEnabled", false)) \
		and not bool(Session.player.get("guest", false)) and Wallet.available()
	_buy_money.visible = money
	if money:
		_buy_money.relabel("$%.2f" % float(item.get("usdc", 0.0)))
		_buy_money.disabled = busy_now or not bool(item.get("hasRoom", true))

	# Le pied : une seule table pour les deux surfaces (le stade du paiement),
	# sinon le mot de l'etal, sinon la porte.
	var status := ""
	var bad := false
	if not _pay.error.is_empty():
		status = _pay.error
		bad = true
	elif _pay.stage != Shop.UsdcPay.Stage.IDLE and _pay.stage != Shop.UsdcPay.Stage.DONE:
		status = Shop.UsdcPay.stage_line(_pay.stage)
	elif not _state.note.is_empty():
		status = _state.note
		bad = _state.refused
	_status.visible = not status.is_empty()
	# Sur l'ile, la porte est la sortie : elle ne cede pas la place au mot.
	_door.visible = status.is_empty() or _home.is_valid()
	_status_text.text = status
	_status_text.add_theme_color_override("font_color", Palette.BAD_ON_WOOD if bad else Palette.LEAF)
	_door.relabel(I18N.t("shop.backToBurrow" if _home.is_valid() else "shop.openShed"))


## L'attente en mots : « a moment » quand la barre est pleine (null).
func _wait(ms: Variant) -> String:
	if ms == null:
		return I18N.t("loop.aMoment")
	return I18N.wait(float(ms))


## La carotte sur la face du prix, comme sur les cartes de l'etal.
func _carrot(button: PlankButton) -> void:
	var ink: Label = button._ink
	var icon: TextureRect = ink.get_node_or_null("Carrot")
	if icon == null:
		icon = Kit.icon(Kit.ICONS["carrot"], 12)
		icon.name = "Carrot"
		ink.add_child(icon)
		button.resized.connect(func() -> void: _carrot(button))
	var font := ink.get_theme_font("font")
	var fs := ink.get_theme_font_size("font_size")
	var w := font.get_string_size(ink.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	icon.position = Vector2(floor(ink.size.x * 0.5 + w * 0.5 - 12.0), floor((ink.size.y - 12.0) * 0.5))


## ACHETER : l'etal fait l'achat et dit le recu ; le terrier est relu ; le
## dialogue se ferme sur une reussite (page.tsx `buyEnergy`).
func _on_buy() -> void:
	var res := await _state.buy("energy")
	if not res.is_empty():
		closed.emit()
		bought.emit()


func _on_pay_money() -> void:
	var res := await _pay.pay("energy", 1, _rail)
	if not _pay.error.is_empty():
		_state.noted.emit(_pay.error, true)
	if not res.is_empty():
		closed.emit()
		bought.emit()
		return
	_refresh()
