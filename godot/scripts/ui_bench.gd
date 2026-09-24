extends Control
## LE BANC DES PIECES DU CHROME : une de chaque, cote a cote, pour voir en
## une capture que les matieres sont les bonnes avant qu'un ecran les porte.
##
##   godot --path godot scenes/ui_bench.tscn -- --shot=bench.png
##
## Pas un ecran du jeu — un outil, comme fx_bench.tscn.


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	var root := Kit.hbox(16)
	root.position = Vector2(16, 16)
	add_child(root)

	# Les planches et boutons.
	var planks := Kit.vbox(8)
	root.add_child(planks)
	for tone in ["wood", "gold", "green", "danger", "blue"]:
		planks.add_child(Kit.button(I18N.shout(tone), tone, 220, 44))
	var wide := Kit.plank("wood")
	wide.custom_minimum_size = Vector2(220, 64)
	planks.add_child(wide)
	var energy_plank := NineSlice.make(Kit.PLANK_ENERGY, Kit.PLANK_ENERGY_SLICE, Vector4(59, 0, 70, 0))
	energy_plank.custom_minimum_size = Vector2(220, 64)
	planks.add_child(energy_plank)

	# Les surfaces plates.
	var flats := Kit.vbox(8)
	root.add_child(flats)
	for entry in [["well", Kit.style_well()], ["well on", Kit.style_well(true)],
			["badge", Kit.style_badge()], ["track", Kit.style_track()],
			["tab", Kit.style_tab(false)], ["tab on", Kit.style_tab(true)],
			["soil", Kit.style_soil()]]:
		var p := Kit.panel(entry[1])
		p.custom_minimum_size = Vector2(160, 36)
		p.add_child(Kit.label(entry[0], 13, Palette.INK if entry[0] == "tab on" else Palette.CREAM))
		flats.add_child(p)
	flats.add_child(Kit.caption("A caption over the board"))
	flats.add_child(Kit.caption("A refusal, in red ink", true))
	var badge := Kit.badge(22)
	badge.custom_minimum_size = Vector2(40, 22)
	flats.add_child(badge)

	# Un dialogue, pose a plat (pas par le chrome).
	var dialog := Dialog.new("The season board", 360, 240)
	dialog.body.add_child(Kit.note("Body text on parchment, in the frame's own ink. It wraps.", Palette.INK))
	dialog.body.add_child(Kit.label("A row of chalk", 13, Palette.BARK))
	dialog.add_footer(Kit.button("CLAIM", "gold", 0, 44))
	root.add_child(dialog)

	# Les icones et la jauge.
	var icons := Kit.hbox(6)
	for name in ["carrot", "bolt", "shield", "bomb", "water", "fertiliser", "garden", "shop"]:
		icons.add_child(Kit.icon(Kit.ICONS[name], 28))
	var right := Kit.vbox(8)
	right.add_child(icons)
	right.add_child(Kit.icon(Kit.DIAL_EMPTY, 51))
	right.add_child(Kit.close_button())
	root.add_child(right)

	DevShot.arm(self)
