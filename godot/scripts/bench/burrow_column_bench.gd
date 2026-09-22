extends Control
## LE BANC DE LA COLONNE DU TERRIER : la colonne sur la nuit, avec un terrier
## et une quete factices poses sur Home — pour la voir sans compte, et sans
## jamais recolter ni ameliorer contre le vrai serveur.
##
##   godot --path godot scenes/bench/burrow_column_bench.tscn -- --shot=column.png
##   ... -- --bench=ask     la quete en cours (pas de dalle)
##   ... -- --bench=next    tout est pris : la ligne « et maintenant »
##
## Les formes sont celles de lib/game/burrow.ts (BurrowView) et de
## config/quests.ts (QuestView) ; Content.quest_view y ajoute les mots.


func _ready() -> void:
	# Le 890x400 de reference (le Seeker couche), pas la fenetre maximisee.
	get_window().mode = Window.MODE_WINDOWED
	get_window().size = Vector2i(890, 400)

	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	_fake_home(_variant())

	var column: BurrowColumn = preload("res://scenes/ui/burrow_column.tscn").instantiate()
	column.always_shown = true
	add_child(column)
	_place(column)
	get_viewport().size_changed.connect(_place.bind(column))
	column.next_action.connect(func(door: String) -> void: print("[bench] next -> ", door))

	# Une jauge, a plat : la piece reutilisable n'a pas encore de carte.
	var meter := BurrowMeter.new()
	meter.value = 147.0
	meter.max_value = 432.0
	meter.position = Vector2(get_viewport_rect().size.x - 240.0, Kit.TOPBAR_H)
	meter.size = Vector2(220.0, 28.0)
	add_child(meter)

	if "--dump" in OS.get_cmdline_user_args():
		await get_tree().create_timer(1.5).timeout
		_dump(column, 0)
	DevShot.arm(self)


func _dump(node: Node, depth: int) -> void:
	if node is Control:
		var c := node as Control
		var extra := ""
		if c is Label:
			extra = " '%s' fs=%d" % [(c as Label).text, c.get_theme_font_size("font_size")]
		print("%s%s %s pos=%s size=%s min=%s vis=%s%s" % ["  ".repeat(depth), c.name, c.get_class(), c.position, c.size, c.get_combined_minimum_size(), c.visible, extra])
	for child in node.get_children(true):
		_dump(child, depth + 1)


func _variant() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--bench="):
			return arg.trim_prefix("--bench=")
	return "done"


## La meme mesure que chrome.gd `_measure`.
func _place(column: Control) -> void:
	var view := get_viewport_rect().size
	column.offset_left = Kit.EDGE
	column.offset_top = Kit.TOPBAR_H
	column.offset_right = Kit.EDGE + maxf(view.x * 0.25, 220.0)
	column.offset_bottom = view.y - Kit.EDGE


func _fake_home(variant: String) -> void:
	var level := 3
	Home.burrow = {
		"level": level,
		"maxLevel": Tuning.i("BURROW.MAX_LEVEL"),
		"stock": 1289,
		"lifetime": 4200,
		"gardenReady": 147,
		"energy": 120,
		"maxEnergy": Tuning.i("ENERGY.MAX"),
		"nextEnergyInMs": 120000,
		"runCost": Tuning.i("ENERGY.MIN_TO_CROSS"),
		"crossingCost": Tuning.i("ENERGY.CROSSING_COST"),
		"nextRunInMs": null,
		"yieldPerHour": 36,
		"regenPerHour": Tuning.regen_per_hour(level),
		"capHours": Tuning.i("GARDEN.CAP_HOURS"),
		"gardenCapacity": 432,
		"gardenCeiling": 432,
		"boosts": {},
		"shieldMs": null,
		"upgradeCost": Tuning.upgrade_cost(level),
		"canUpgrade": true,
		"next": null,
		"runs": 12,
	}
	var quest: Dictionary = {
		"id": "break-ground",
		"door": "farm",
		"goal": Tuning.i("QUESTS.FIRST_DIG_TILES"),
		"progress": Tuning.i("QUESTS.FIRST_DIG_TILES"),
		"done": true,
		"reward": {"carrots": Tuning.i("QUESTS.CARROTS.break-ground")},
		"index": 1,
		"total": 10,
	}
	match variant:
		"ask":
			quest["progress"] = 4
			quest["done"] = false
			Home.quest = {"active": Content.quest_view(quest), "claimable": 0, "claimed": 0, "total": 10}
		"next":
			Home.quest = {"active": null, "claimable": 0, "claimed": 10, "total": 10}
		_:
			Home.quest = {"active": Content.quest_view(quest), "claimable": 1, "claimed": 0, "total": 10}
	Home.changed.emit()
