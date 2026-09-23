class_name EnergyPanel
extends Dialog
## LE PANNEAU D'ENERGIE : un tap sur l'anneau, et la situation en LIVRE DE
## COMPTES.
##
## Porte de src/components/energy-panel.tsx, en gardant ce qu'il a decide :
##
##   • UN REGISTRE, PAS DE LA PROSE (22 septembre 2026). La premiere version
##     disait tout en quatre phrases — vraies, completes, et lues comme un
##     reglement : le joueur devait analyser chaque phrase pour trouver le
##     seul mot qui comptait, « oui ». Maintenant chaque porte est une LIGNE
##     aux trois memes cases — ce que c'est, ce que ca coute, si le
##     reservoir le couvre — et la reponse est la colonne de droite, une
##     couleur par verdict. Un verdict court porte l'attente : la route
##     gratuite, dite a cote de la payante en dessous.
##   • LA PISTE au-dessus des lignes est l'anneau mis a plat : le remplissage
##     et les deux planchers en traits — celui de la traversee, celui du
##     raid — pour que « needs 40 » ait une place sur l'image autant qu'un
##     nombre dans la ligne.
##   • LE NIVEAU DU TERRIER est une raison d'ameliorer, et l'amelioration est
##     a la maison : sur l'ile la ligne est un fait sur lequel personne ne
##     peut agir, et c'est elle qui poussait le bouton hors d'un ecran de
##     400px.
##
## Le meme panneau que l'explication d'outil du kit en DEFEND : le joueur
## connait deja cette forme comme « qu'est-ce que c'est et qu'est-ce que je
## peux en faire ».

## Le joueur veut recharger — par defaut, `EnergyPopup.open()`.
signal refill

## 380, depuis 340 : les lignes sont un libelle, une clause et un verdict
## cote a cote, et a 340 la clause passait a la ligne a chaque fois. Puis
## 460 partout (2026-09-23) : les cases sont passees a 12 / 11 / 11, et a 380
## chaque clause se repliait en trois lignes sur le bureau.
const WIDTH := 460.0
const WIDTH_SHORT := 460.0
## La piste : 8 de haut, les traits debordent de 3.
const TRACK_H := 8.0
const TICK_OVER := 3.0

var _stock: Label
var _track: Control
var _ledger: GridContainer
var _hint: Label
var _button: PlankButton
var _tick: Timer

## Ce que la piste dessine, relu a chaque rafraichissement.
var _fill := 0.0
var _tick_island := 0.0
var _tick_raid := 0.0


func _init() -> void:
	super(I18N.t("energyPanel.title"), WIDTH, 0.0)


static func open() -> EnergyPanel:
	var dialog := EnergyPanel.new()
	dialog.refill.connect(func() -> void: EnergyPopup.open())
	if Chrome.current != null:
		var view := Chrome.current.get_viewport_rect().size
		# Un telephone couche est LARGE et court : le panneau prend 460px sous
		# 520 de haut, sinon chaque cout se repliait sur deux lignes
		# (globals.css `.rr-energy-panel`, @media max-height 520px).
		var wide := WIDTH_SHORT if view.y < 520.0 else WIDTH
		dialog.custom_minimum_size.x = minf(wide, view.x - 2.0 * Kit.EDGE)
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	# LE TITRE DU KIT, pas celui d'un dialogue : ce panneau est l'explication
	# d'outil du web (`.rr-toolkit-summary strong`), en encre simple.
	for key in ["font_outline_color", "font_shadow_color"]:
		title_label.remove_theme_color_override(key)
	title_label.remove_theme_constant_override("outline_size")
	title_label.add_theme_color_override("font_color", Palette.INK)
	title_label.add_theme_font_size_override("font_size", 14)
	_build()
	_refresh()
	Home.changed.connect(_refresh)
	I18N.locale_changed.connect(func(_code: String) -> void: _refresh())
	# L'anneau vit : le reservoir remonte pendant qu'on lit.
	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_refresh)
	add_child(_tick)
	_tick.start()


func _build() -> void:
	# La lecture, le rythme, et le temps jusqu'au plein — une ligne, trois
	# faits, les chiffres de l'anneau lui-meme.
	_stock = Kit.note("", Palette.BARK, 12)
	body.add_child(_stock)

	_track = Control.new()
	_track.custom_minimum_size = Vector2(0, TRACK_H + 2.0 * TICK_OVER)
	_track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_track.draw.connect(_draw_track)
	body.add_child(_track)

	# LE REGISTRE : une ligne par porte, trois cases — le verbe, son cout, le
	# verdict. Le verdict est la reponse, donc la seule case en couleur.
	_ledger = GridContainer.new()
	_ledger.columns = 3
	_ledger.add_theme_constant_override("h_separation", 10)
	_ledger.add_theme_constant_override("v_separation", 8)
	body.add_child(_ledger)

	# La seule regle sous les lignes : lire le terrier rembourse, comme lire
	# l'ile — ou, sur l'ile, que le reservoir garde ce que le lapin ramene.
	_hint = Kit.note("", Palette.BARK, 11)
	body.add_child(_hint)

	_button = Kit.button("", "green", 0, 44)
	_button.pressed.connect(func() -> void:
		refill.emit()
		closed.emit())
	add_footer(_button)


## Le dialogue mesure son contenu (voir shop.gd `_get_minimum_size`).
func _get_minimum_size() -> Vector2:
	return _inset.get_combined_minimum_size() if _inset != null else Vector2.ZERO


func _refresh() -> void:
	if _ledger == null:
		return
	set_title(I18N.t("energyPanel.title"))
	var burrow := Home.burrow
	var live := Home.live_energy()
	var energy := int(live["energy"])
	var max_energy := maxi(1, int(live["max"]))
	var regen := float(burrow.get("regenPerHour", 0.0))
	var next: Variant = burrow.get("next", null)
	var next_regen: Variant = next.get("regenPerHour", null) if next is Dictionary else null
	var level := int(burrow.get("level", 1))
	var on_island := Screens.place == Screens.Place.ISLAND
	var run_cost := int(burrow.get("runCost", Tuning.i("ENERGY.MIN_TO_CROSS")))
	var crossing := int(burrow.get("crossingCost", Tuning.i("ENERGY.CROSSING_COST")))
	var raid_floor := Tuning.raid_floor()

	# La ligne du haut.
	var parts: Array[String] = [I18N.f("energyPanel.reading", [energy, max_energy])]
	if regen > 0.0:
		parts.append(I18N.f("energyPanel.rate", [regen]))
	if energy >= max_energy:
		parts.append(I18N.t("energyPanel.full"))
	else:
		var ms_to_full := maxf(0.0, (max_energy - energy) / regen) * 3600000.0 if regen > 0.0 else 0.0
		parts.append(I18N.f("energyPanel.fullIn", [I18N.wait(ms_to_full)]))
	_stock.text = " · ".join(parts)

	# La piste.
	_fill = clampf(float(energy) / max_energy, 0.0, 1.0)
	_tick_island = clampf(float(run_cost) / max_energy, 0.0, 1.0)
	_tick_raid = clampf(float(raid_floor) / max_energy, 0.0, 1.0)
	_track.queue_redraw()

	# Les lignes.
	for old in _ledger.get_children():
		_ledger.remove_child(old)
		old.queue_free()
	var can_island := energy >= run_cost
	var can_raid := energy >= raid_floor
	if on_island:
		_row(I18N.t("energyPanel.dig"),
			I18N.f("energyPanel.digCost", [Tuning.i("ENERGY.DIG_COST"), Tuning.i("ENERGY.BOMB_LOSS")]), {})
		# Ce qu'un bon X paie sur l'echelle : le client ne connait pas son
		# palier, donc la fourchette des paliers.
		var lo := 1 << 30
		var hi := 0
		for tier in Tuning.list("ISLAND_TIERS"):
			lo = mini(lo, int(tier.get("xGain", 0)))
			hi = maxi(hi, int(tier.get("xGain", 0)))
		_row(I18N.t("energyPanel.x"), I18N.f("energyPanel.xCost", [lo, hi, Tuning.i("FLAG.LOSS")]), {})
		_row(I18N.t("energyPanel.home"), I18N.f("energyPanel.homeCost", [raid_floor]),
			{"kind": "ready", "text": I18N.t("energyPanel.raidReady")} if can_raid
			else {"kind": "muted", "text": I18N.f("energyPanel.under", [raid_floor])})
	else:
		_row(I18N.t("energyPanel.island"), I18N.f("energyPanel.islandCost", [crossing]),
			_ready_verdict() if can_island else _short(run_cost, energy, regen))
		_row(I18N.t("energyPanel.raid"),
			I18N.f("energyPanel.raidCost", [Tuning.i("RAID_RUN.TOLL"), Tuning.i("RAID_RUN.STAKE")]),
			_ready_verdict() if can_raid else _short(raid_floor, energy, regen))
		_row(I18N.f("energyPanel.levelLabel", [level]),
			I18N.f("energyPanel.levelRate", [regen, next_regen]), {})

	_hint.text = I18N.t("energyPanel.homeHint") if on_island else I18N.t("energyPanel.raidRefund")
	_button.visible = energy < max_energy
	_button.relabel(I18N.shout(I18N.t("recap.getEnergy")))


func _ready_verdict() -> Dictionary:
	return {"kind": "ready", "text": I18N.t("energyPanel.ready")}


## Court : ce qu'il faut, et l'attente par le seul regen — vide quand il y a
## deja de quoi.
func _short(floor_at: int, energy: int, regen: float) -> Dictionary:
	var v := {"kind": "short", "text": I18N.f("energyPanel.needs", [floor_at])}
	if energy < floor_at and regen > 0.0:
		v["wait"] = I18N.wait((floor_at - energy) / regen * 3600000.0)
	return v


## Une ligne : le libelle (encre), la clause (ecorce), le verdict (colore).
## A 12 / 11 / 11, pas 10 / 9 / 9 : la reponse du panneau (« READY »,
## « NEEDS 58 ») est la case qu'on lit, et elle etait la plus petite de
## l'ecran (2026-09-23).
## Pas de majuscules forcees : les libelles anglais sont en capitales dans
## le dictionnaire, et les autres langues ecrivent les leurs a leur facon.
func _row(label: String, detail: String, verdict: Dictionary) -> void:
	var l := Kit.label(label, 12, Palette.INK)
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_ledger.add_child(l)
	var d := Kit.note(detail, Palette.BARK, 11)
	_ledger.add_child(d)
	var v := Kit.vbox(0)
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if not verdict.is_empty():
		var color := Palette.PILL_SUB
		match String(verdict["kind"]):
			"ready":
				color = Palette.LEAF.darkened(0.4)
			"short":
				color = Palette.CARROT_DEEP
		var t := Kit.label(String(verdict["text"]), 11, color)
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		t.size_flags_horizontal = Control.SIZE_SHRINK_END
		v.add_child(t)
		if verdict.has("wait"):
			var w := Kit.label(I18N.f("energyPanel.inWait", [verdict["wait"]]), 10, Color(color, 0.85))
			w.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			w.size_flags_horizontal = Control.SIZE_SHRINK_END
			v.add_child(w)
	_ledger.add_child(v)


## L'ANNEAU MIS A PLAT : le remplissage, et les deux planchers en traits. Le
## plancher de la traversee est le proche, celui du raid le lointain ; les
## lignes dessous les nomment, donc les traits ne portent pas de libelle.
func _draw_track() -> void:
	var w := _track.size.x
	var top := TICK_OVER
	_track.draw_rect(Rect2(0, top, w, TRACK_H), Palette.SOIL)
	_track.draw_rect(Rect2(0, top, w, TRACK_H), Palette.SOIL_DEEP, false, 1.0)
	if _fill > 0.0:
		var fill_w := floorf(w * _fill)
		var lit := Palette.LEAF.lightened(0.2)
		_track.draw_rect(Rect2(0, top, fill_w, TRACK_H), Palette.LEAF)
		_track.draw_rect(Rect2(0, top, fill_w, TRACK_H * 0.5), lit)
	for entry in [[_tick_island, Palette.BARK], [_tick_raid, Palette.DANGER]]:
		var x := floorf(w * float(entry[0]))
		_track.draw_rect(Rect2(x - 1.0, 0.0, 2.0, TRACK_H + 2.0 * TICK_OVER), entry[1])
