class_name DefendHud
extends Control
## LA BARRE FINE AU-DESSUS DU PLATEAU pendant que VOTRE terrier est pille.
##
## Porte de src/components/defend-hud.tsx. Le miroir de RaidHud : celle-la
## nomme chez qui on est et ce qu'il reste pour traverser ; celle-ci nomme
## qui est chez vous et ce qu'il lui reste. Les deux nombres contre lesquels
## un defenseur evalue son prochain geste sont l'energie du raider (combien
## de pas, combien de bombes encore) et ses propres eclairs (si la reponse
## sure est encore disponible).
##
## LA BOMBE N'EST PAS OFFERTE ICI : le plateau est deja en placement pendant
## un raid, donc en enterrer une est un tap sur le sol. L'ECLAIR EST OFFERT
## DEUX FOIS — un tap sur le lapin, ou ce bouton — parce que sur un telephone
## un lapin en plein saut est une petite cible, et le moment ou il faut le
## toucher n'est pas celui ou l'on peut se permettre de le rater.
##
## Meme place que la barre du raid, parce que c'est la meme chose vue de
## l'autre chaise ; jamais les deux, puisqu'on ne peut pas etre en raid et
## chez soi.

const WIDTH := 420.0

var _panel: PanelContainer
var _title: Label
var _energy: Label
var _energy_unit: Label
var _sprung: HBoxContainer
var _sprung_count: Label
var _live: VBoxContainer
var _hint: Label
var _strike: PlankButton
var _note: Label
var _over: VBoxContainer
var _over_strong: Label
var _over_haul: Label


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	RaidState.current.incoming_changed.connect(_refresh)
	RaidState.current.changed.connect(_refresh)
	I18N.locale_changed.connect(_refresh)
	resized.connect(_measure)
	_measure()
	_refresh()


func _build() -> void:
	_panel = Kit.panel(RaidHud.hud_style())
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_panel)
	var column := Kit.vbox(8)
	_panel.add_child(column)

	var header := Kit.hbox(Kit.PAD)
	column.add_child(header)
	_title = Kit.label("", 12, Palette.CHALK)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.clip_text = true
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(_title)
	# Leur energie, et l'unite en sourdine a cote : elle existe pour dire
	# QUELLE barre c'est (celle de la traversee, pas celle du terrier), et
	# doit se lire sans rivaliser.
	var energy := Kit.hbox(4)
	energy.add_child(Kit.icon(Kit.ICONS["bolt"], 14))
	_energy = Kit.label("", 12, Palette.LAMP)
	energy.add_child(_energy)
	_energy_unit = Kit.label("", 10, Color(Palette.LAMP, 0.75))
	energy.add_child(_energy_unit)
	header.add_child(energy)
	_sprung = Kit.hbox(3)
	_sprung.add_child(Kit.icon(Kit.ICONS["bomb"], 14))
	_sprung_count = Kit.label("", 12, Palette.BAD_ON_WOOD)
	_sprung.add_child(_sprung_count)
	header.add_child(_sprung)

	_live = Kit.vbox(6)
	_hint = Kit.note("", Palette.CHALK_DIM, 11)
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_live.add_child(_hint)
	_strike = Kit.button("", "gold", 0, 44)
	_strike.pressed.connect(func() -> void: RaidState.current.strike())
	_live.add_child(_strike)
	column.add_child(_live)

	_note = Kit.note("", Palette.BAD_ON_WOOD, 11)
	_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_note)

	_over = Kit.vbox(6)
	var rule := ColorRect.new()
	rule.color = Palette.PLANK
	rule.custom_minimum_size = Vector2(0, 2)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_over.add_child(rule)
	_over_strong = Kit.label("", 13, Palette.CHALK)
	_over_strong.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_over.add_child(_over_strong)
	_over_haul = Kit.label("", 15, Palette.LAMP)
	_over_haul.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_over.add_child(_over_haul)
	column.add_child(_over)


func _measure() -> void:
	var w := minf(WIDTH, size.x - 2.0 * Kit.EDGE)
	_panel.position = Vector2(floor((size.x - w) * 0.5), Kit.TOPBAR_H + Kit.PAD_TIGHT)
	_panel.size = Vector2(w, _panel.get_combined_minimum_size().y)


func _refresh(_arg: Variant = null) -> void:
	var state := RaidState.current
	# Le raid subi ne se regarde que de chez soi, et jamais par-dessus un
	# raid qu'on mene (page.tsx : `where === 'burrow' && !shownRaid`).
	var at_home := not Screens.in_world() or Screens.place == Screens.Place.BURROW
	visible = state.has_incoming() and not state.has_raid() and at_home
	if not visible:
		return
	var raid := state.incoming
	var attacker: Dictionary = raid.get("attacker", {}) if raid.get("attacker") is Dictionary else {}
	var done := bool(raid.get("finished", false))
	var held := state.lightning_held

	_title.text = I18N.f("defend.underAttack", [String(attacker.get("name", ""))])
	_energy.text = str(int(raid.get("energy", 0)))
	_energy_unit.text = I18N.t("defend.theirSteps")
	var sprung := int(raid.get("trapsSprung", 0))
	_sprung.visible = sprung > 0
	_sprung_count.text = str(sprung)

	_live.visible = not done
	_hint.text = I18N.t("defend.hint")
	# « Strike · 3 held » : l'or quand il en reste, le bois eteint sinon.
	_strike.relabel(I18N.shout("%s · %s" % [I18N.t("defend.strike"), I18N.f("defend.held", [held])]))
	var off := state.striking or held <= 0
	_strike.board = PlankButton.Board.GOLD if held > 0 else PlankButton.Board.WOOD
	_strike.disabled = off
	_strike.modulate.a = 0.75 if off else 1.0

	_note.visible = not state.refusal.is_empty() and not done
	_note.text = state.refusal

	_over.visible = done
	if done:
		var won := bool(raid.get("succeeded", false))
		if bool(raid.get("struck", false)):
			_over_strong.text = I18N.t("defend.struckDown")
		elif won:
			_over_strong.text = I18N.f("defend.looted", [I18N.group_digits(int(raid.get("carrotsLooted", 0)))])
		else:
			_over_strong.text = I18N.t("defend.ranDry")
		_over_haul.text = I18N.t("defend.lost") if won else I18N.t("defend.held_")
	_measure()
