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

## La largeur : min(560px, 100% - 2 * edge). UNE SEULE LIGNE (2026-10-01) :
## nom, bombes sautees, sortie (la fumee se dit en bas de l'ecran). Empilee, la plaque faisait 140 px sur
## un ecran de 400 et couvrait le milieu du plateau ; il lui faut donc la
## largeur que la pile prenait en hauteur.
const WIDTH := 560.0

## Le web ecrivait cette ligne en anglais dans le composant, hors des
## dictionnaires (raid-panel.tsx) ; elle est reprise telle quelle. La fumee,
## elle, passe par raid.smoked.
const WEB_BURROW_OF := "%s's burrow"
## Le nuage de la boutique (ItemSlot.Glyph), a la hauteur du texte.
const SMOKE_ART := 22.0
## L'encre de la fumee (globals.css `.rr-raid-smoke`) : un gris bleute, ni
## le rouge d'un refus ni la craie d'un fait.
const SMOKE_INK := Color("#9fb4c7")

var _panel: PanelContainer
var _name: Label
var _sprung: HBoxContainer
var _sprung_count: Label
var _smoke: PanelContainer
var _smoke_text: Label
var _note: Label
var _over: VBoxContainer
var _over_strong: Label
var _over_haul: Label
var _retreat: BackButton


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# L'ECRAN ENTIER, pas l'etage. Le chrome la pose dans %Floor, une bande
	# de hauteur nulle epinglee en bas : « remplir son etage » lui donnait
	# zero de haut, et la barre, posee sous TOPBAR_H de son propre haut,
	# sortait par le bas de l'ecran (2026-09-23). Comme BackButton : le haut
	# remonte d'un ecran.
	set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	get_viewport().size_changed.connect(_reach_top)
	_reach_top()
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
	# Le texte qui revient a la ligne connait sa hauteur une fois sa largeur
	# posee : le panneau suit, differe pour ne pas re-mesurer dans la mesure.
	# Sans ca, la ligne de la fumee, mesuree sur 1 px, tenait le panneau a
	# toute la hauteur de l'ecran jusqu'au premier pas.
	_panel.minimum_size_changed.connect(func() -> void: _measure.call_deferred())
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

	# LA FUMEE, EN BAS DE L'ECRAN, sur le verre des legendes de l'ile : le
	# nuage de la boutique et la phrase entiere (raid.smoked). Un plateau
	# noir, sans chiffres ni « ? », se lit comme un bug tant qu'on ne dit pas
	# que le defenseur l'a paye. En bas, sous le pouce, loin de la barre.
	var glass := StyleBoxFlat.new()
	glass.bg_color = Palette.CARRY_GLASS
	glass.set_corner_radius_all(4)
	glass.content_margin_left = Kit.PAD
	glass.content_margin_right = Kit.PAD
	glass.content_margin_top = Kit.PAD_TIGHT
	glass.content_margin_bottom = Kit.PAD_TIGHT
	_smoke = Kit.panel(glass)
	_smoke.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var smoke_row := Kit.hbox(6)
	smoke_row.alignment = BoxContainer.ALIGNMENT_CENTER
	var cloud := ItemSlot.art_for("smoke", SMOKE_ART)
	cloud.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	smoke_row.add_child(cloud)
	_smoke_text = Kit.label("", 13, SMOKE_INK)
	_smoke_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	smoke_row.add_child(_smoke_text)
	_smoke.add_child(smoke_row)
	add_child(_smoke)
	_smoke.minimum_size_changed.connect(func() -> void: _measure.call_deferred())

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

	# LA SORTIE, EN PLEIN RAID : le BACK partage, en bas a gauche, comme en
	# DEFEND et sur l'ile (2026-10-01) — c'etait RETREAT dans ce panneau. Elle
	# existe pour la raison qu'elle a toujours eue : un raider qui change
	# d'avis restait sur le plateau d'un autre jusqu'a ce que son energie
	# s'epuise.
	_retreat = preload("res://scenes/ui/back_button.tscn").instantiate()
	_retreat.pressed.connect(func() -> void: RaidState.current.leave())
	add_child(_retreat)
	for child in header.get_children():
		(child as Control).size_flags_vertical = Control.SIZE_SHRINK_CENTER


func _reach_top() -> void:
	offset_top = -get_viewport_rect().size.y
	offset_bottom = 0.0


func _measure() -> void:
	if _panel == null:
		return
	var w := minf(WIDTH, size.x - 2.0 * Kit.EDGE)
	# SOUS CE QUI PEND DE LA BARRE (la pastille et son reservoir), pas a
	# TOPBAR_H : le titre passait sous le « 300⚡ ».
	var top := Kit.TOPBAR_H + Kit.PAD_TIGHT
	var hang := TopBar.hang_bottom()
	if hang > 0.0:
		top = maxf(top, ceilf(hang - get_global_rect().position.y) + Kit.PAD_TIGHT)
	_panel.position = Vector2(floor((size.x - w) * 0.5), top)
	_panel.size = Vector2(w, _panel.get_combined_minimum_size().y)
	var sw := _smoke.get_combined_minimum_size()
	_smoke.size = sw
	_smoke.position = Vector2(floorf((size.x - sw.x) * 0.5), size.y - Kit.EDGE - sw.y)


func _on_locale_changed(_code: String) -> void:
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
	_smoke_text.text = I18N.t("raid.smoked")
	_note.visible = not state.note.is_empty() and not done
	_note.text = state.note

	_over.visible = done and not won
	if _over.visible:
		_over_strong.text = I18N.t("raid.struck") if bool(raid.get("struck", false)) else I18N.t("raid.outOfEnergy")
		var looted := int(raid.get("carrotsLooted", 0))
		_over_haul.text = I18N.f("raid.looted", [I18N.group_digits(looted)]) if looted > 0 else I18N.t("raid.nothingTaken")

	if done:
		_retreat.dismiss()
	else:
		_retreat.show_for("raid")
		_retreat.set_disabled(state.busy)
	_measure()
