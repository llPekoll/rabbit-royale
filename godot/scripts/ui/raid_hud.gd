class_name RaidHud
extends Control
## LA BARRE FINE AU-DESSUS DU PLATEAU pendant qu'un raid est en cours.
##
## Porte de raid-panel.tsx `RaidHud`. Le plateau, c'est le terrier avec le
## sol de quelqu'un d'autre derriere ; tout ici est volontairement mince :
## chez qui on vole, ce que le raid a fait, et la sortie. La barre ne dessine
## jamais une case.
##
##   • PAS DE LECTURE D'ENERGIE ICI. Le raid depense la seule jauge, et le
##     medaillon de la pastille la montre battre ; un second « n » sur cette
##     plaque etait la confusion des deux barres dont l'ancienne note de ce
##     panneau s'excusait.
##   • LA FUMEE DOIT S'ANNONCER. Un plateau sans chiffres et sans explication
##     se lit comme un jeu casse, pas comme une defense que quelqu'un a payee.
##   • LA FIN, SANS BOUTON — ET SEULEMENT POUR UNE DEFAITE. Le plateau porte
##     le moment (le lapin s'effondre la ou son energie a lache) et RaidState
##     ramene le joueur seul deux secondes plus tard. Une VICTOIRE ne dit rien
##     ici : elle leve la ceremonie plein ecran (raid_victory.gd), et une
##     ligne « champ atteint ! +4 820 » dans le coin ferait de la scene qui
##     suit la repetition d'une etiquette.
##   • FOUDROYE DIT FOUDROYE : le defenseur l'a fait, depuis son ecran, et
##     « a sec » accuserait une jauge qui n'etait pas vide.
##
## Il se pose SOUS LE CHROME DU HAUT, a Kit.PAD_TIGHT de la barre, comme les
## pastilles du terrier — epingle a Kit.EDGE du bord, il ecrivait le nom du
## terrier en travers du compte de carottes du joueur (px-raid.css).

## La largeur : min(420px, 100% - 2 * edge).
const WIDTH := 420.0

## Le web ecrit ces deux lignes en anglais dans le composant, hors des
## dictionnaires (raid-panel.tsx) ; elles sont reprises telles quelles
## plutot qu'inventees dans quatre langues.
const WEB_BURROW_OF := "%s's burrow"
const WEB_SMOKE := "Smoke. No numbers here. Walk it blind."
## L'encre de la fumee (globals.css `.rr-raid-smoke`) : un gris bleute, ni
## le rouge d'un refus ni la craie d'un fait.
const SMOKE_INK := Color("#9fb4c7")

var _panel: PanelContainer
var _name: Label
var _sprung: HBoxContainer
var _sprung_count: Label
var _smoke: Label
var _note: Label
var _over: VBoxContainer
var _over_strong: Label
var _over_haul: Label
var _retreat: PlankButton


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	RaidState.current.changed.connect(_refresh)
	I18N.locale_changed.connect(_on_locale_changed)
	resized.connect(_measure)
	_measure()
	_refresh()


## Le cadre : la terre profonde du HUD (SOIL_DEEP) sur le biseau des planches
## (`.rr-raid-hud` : fond #1d100a, bord #4a2f1d).
static func hud_style() -> StyleBoxFlat:
	var s := Kit.style_soil()
	s.bg_color = Palette.SOIL_DEEP
	s.border_color = Palette.PLANK
	s.shadow_size = 0
	s.shadow_offset = Vector2.ZERO
	s.set_content_margin_all(Kit.PAD)
	return s


func _build() -> void:
	_panel = Kit.panel(hud_style())
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_panel)
	var column := Kit.vbox(8)
	_panel.add_child(column)

	var header := Kit.hbox(Kit.PAD)
	column.add_child(header)
	_name = Kit.label("", 12, Palette.CHALK)
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name.clip_text = true
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(_name)
	# Les pieges sautes, en rouge et en chiffres tabulaires.
	_sprung = Kit.hbox(3)
	_sprung.add_child(Kit.icon(Kit.ICONS["bomb"], 14))
	_sprung_count = Kit.label("", 12, Palette.BAD_ON_WOOD)
	_sprung.add_child(_sprung_count)
	header.add_child(_sprung)

	_smoke = Kit.note(WEB_SMOKE, SMOKE_INK, 11)
	_smoke.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_smoke)

	_note = Kit.note("", Palette.BAD_ON_WOOD, 11)
	_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_note)

	_over = Kit.vbox(6)
	_over.alignment = BoxContainer.ALIGNMENT_CENTER
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

	# LA SORTIE, EN PLEIN RAID. Sur le web c'est le BackButton partage du bas
	# de l'ecran (« Retreat ») ; ce bouton-la n'est pas porte, donc la planche
	# vit ici. Elle existe pour la raison qu'elle a toujours eue : un raider
	# qui change d'avis restait sur le plateau d'un autre jusqu'a ce que son
	# energie s'epuise.
	_retreat = Kit.button(I18N.shout(I18N.t("run.retreat")), "wood", 0, 44)
	_retreat.pressed.connect(func() -> void: RaidState.current.leave())
	column.add_child(_retreat)


func _measure() -> void:
	var w := minf(WIDTH, size.x - 2.0 * Kit.EDGE)
	_panel.position = Vector2(floor((size.x - w) * 0.5), Kit.TOPBAR_H + Kit.PAD_TIGHT)
	_panel.size = Vector2(w, _panel.get_combined_minimum_size().y)


func _on_locale_changed(_code: String) -> void:
	_retreat.relabel(I18N.shout(I18N.t("run.retreat")))
	_refresh()


func _refresh() -> void:
	var state := RaidState.current
	visible = state.has_raid()
	if not visible:
		return
	var raid := state.raid
	var defender: Dictionary = raid.get("defender", {}) if raid.get("defender") is Dictionary else {}
	var done := bool(raid.get("finished", false))
	var won := bool(raid.get("succeeded", false))

	_name.text = WEB_BURROW_OF % String(defender.get("name", ""))
	var sprung := int(raid.get("trapsSprung", 0))
	_sprung.visible = sprung > 0
	_sprung_count.text = str(sprung)

	_smoke.visible = bool(raid.get("smoked", false)) and not done
	_note.visible = not state.note.is_empty() and not done
	_note.text = state.note

	_over.visible = done and not won
	if _over.visible:
		_over_strong.text = I18N.t("raid.struck") if bool(raid.get("struck", false)) else I18N.t("raid.outOfEnergy")
		var looted := int(raid.get("carrotsLooted", 0))
		_over_haul.text = I18N.f("raid.looted", [I18N.group_digits(looted)]) if looted > 0 else I18N.t("raid.nothingTaken")

	_retreat.visible = not done
	_retreat.disabled = state.busy
	_retreat.modulate.a = 0.75 if state.busy else 1.0
	_measure()
