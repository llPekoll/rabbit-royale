extends "res://scripts/bench/shop_bench.gd"
## LE BANC DE LA FETE D'ACHAT : l'etal plein ecran (donnees factices de
## shop_bench), et la fete qui rejoue a la demande — la revelation plein
## ecran (purchase_reveal.gd) puis la gerbe d'eclats sur la carte
## (Shop._celebrate). Rien n'est achete : seul le signal `bought` part.
##
##   godot --path godot scenes/bench/purchase_bench.tscn
##
##   ESPACE / ENTREE : rejouer la fete    ← → : changer d'objet
##   (un clic ferme la fete, comme en jeu)

var _i := ShopState.KINDS.find("energy")
var _tag: Label


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	Home.burrow = {
		"level": 3, "stock": 1240, "energy": 40, "maxEnergy": Tuning.i("ENERGY.MAX"),
		"nextEnergyInMs": 92000, "runCost": Tuning.i("ENERGY.MIN_TO_CROSS"),
		"nextRunInMs": null, "crossingCost": Tuning.i("ENERGY.CROSSING_COST"),
		"regenPerHour": Tuning.regen_per_hour(3),
		"next": {"regenPerHour": Tuning.regen_per_hour(4), "yieldPerHour": 0},
	}
	ShopState.shared().fake(_fake_items(1240), {"held": 3, "placed": 2, "armed": 2, "rearming": 0, "maxPlaced": 8})
	Home.changed.emit()
	_only("shop")

	_tag = Label.new()
	_tag.add_theme_font_size_override("font_size", 14)
	_tag.add_theme_color_override("font_color", Palette.CREAM)
	_tag.position = Vector2(8, 4)
	_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_tag)
	_show_kind()

	get_tree().create_timer(0.8).timeout.connect(_fire)
	DevShot.arm(self)


func _unhandled_key_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	match (event as InputEventKey).keycode:
		KEY_SPACE, KEY_ENTER, KEY_KP_ENTER:
			_fire()
		KEY_RIGHT:
			_i = (_i + 1) % ShopState.KINDS.size()
			_show_kind()
			_fire()
		KEY_LEFT:
			_i = (_i - 1 + ShopState.KINDS.size()) % ShopState.KINDS.size()
			_show_kind()
			_fire()


func _fire() -> void:
	ShopState.shared().bought.emit(ShopState.KINDS[_i], 1)


func _show_kind() -> void:
	_tag.text = "%s   [espace] rejouer   [<- ->] objet" % ShopState.KINDS[_i]
