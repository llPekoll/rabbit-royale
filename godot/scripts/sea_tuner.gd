extends Control
## LE REGLAGE DU SOLEIL SUR L'EAU — meme principe que sky_tuner.gd.
##
## La vraie ile, et des curseurs sur `SkyLook.SEA_SUN`. On regle, on appuie
## sur COPIER, on recopie dans `sky_look.gd`, qui reste la source de verite.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --path godot \
##       res://scenes/sea_tuner.tscn

const ISLAND := preload("res://scenes/island.tscn")

const BLENDS := ["MELANGE", "ADDITIF", "ECRAN", "INCRUST.", "DOUCE", "PRODUIT"]

const DIALS := [
	{"key": "strength", "label": "OPACITE", "min": 0.0, "max": 1.0, "step": 0.01},
	{"key": "stretch", "label": "ETIRE Y", "min": 0.25, "max": 8.0, "step": 0.05},
	{"key": "scale", "label": "TAILLE", "min": 0.002, "max": 0.1, "step": 0.001},
	{"key": "coverage", "label": "COUVERT.", "min": 0.2, "max": 0.9, "step": 0.005},
	{"key": "edge", "label": "BORD", "min": 0.0, "max": 0.3, "step": 0.005},
	{"key": "pixel", "label": "GRAIN PX", "min": 1.0, "max": 8.0, "step": 1.0},
	{"key": "morph", "label": "DEFORM.", "min": 0.0, "max": 0.1, "step": 0.001},
	{"key": "drift_k", "label": "DERIVE x", "min": 0.0, "max": 4.0, "step": 0.05},
]

## Les poussieres (SkyLook.AIR_MOTES), prefixees pour ne pas croiser SEA_SUN.
const MOTE_DIALS := [
	{"key": "m_alpha", "label": "GRAINS OPAC.", "min": 0.0, "max": 1.0, "step": 0.01},
	{"key": "m_size", "label": "GRAINS PX", "min": 1.0, "max": 6.0, "step": 1.0},
	{"key": "m_rise", "label": "GRAINS MONTEE", "min": 0.0, "max": 20.0, "step": 0.5},
	{"key": "m_sway", "label": "GRAINS BALANC.", "min": 0.0, "max": 12.0, "step": 0.5},
	{"key": "m_life_min", "label": "VIE MIN S", "min": 0.3, "max": 10.0, "step": 0.1},
	{"key": "m_life_max", "label": "VIE MAX S", "min": 0.3, "max": 15.0, "step": 0.1},
	{"key": "m_flicker", "label": "SIN AMPL.", "min": 0.0, "max": 1.0, "step": 0.01},
	{"key": "m_flicker_hz", "label": "SIN HZ", "min": 0.0, "max": 8.0, "step": 0.1},
]
const MOTE_KEYS := ["alpha", "size", "rise", "sway", "life_min", "life_max", "flicker", "flicker_hz"]

var _mat: ShaderMaterial
var _motes: MoteField
var _panel: PanelContainer
var _values: Dictionary = {}
var _labels: Dictionary = {}


func _ready() -> void:
	var island := ISLAND.instantiate()
	add_child(island)
	var sea := island.find_children("*", "SeaGradient", true, false)[0] as SeaGradient
	# Le SeaGradient s'applique dans son _ready, qui passe avant celui-ci.
	_mat = sea.material_for_tuner()
	var found := island.find_children("*", "MoteField", true, false)
	if not found.is_empty():
		_motes = found[0] as MoteField
	_values = SkyLook.SEA_SUN.duplicate()
	# La derive en multiplicateur de celle du fichier : un seul curseur.
	_values["drift_k"] = 1.0
	for k in MOTE_KEYS:
		_values["m_" + k] = float(SkyLook.AIR_MOTES[k])
	_build_panel()
	_apply()


func _build_panel() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 100
	add_child(layer)
	var panel := PanelContainer.new()
	_panel = panel
	# Ancre en haut a droite et GRANDIT VERS LA GAUCHE : la police du jeu est
	# large, une position fixe laissait le panneau deborder de l'ecran.
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT, Control.PRESET_MODE_MINSIZE, 8)
	panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0.55)
	style.set_content_margin_all(8)
	panel.add_theme_stylebox_override("panel", style)
	layer.add_child(panel)
	var col := VBoxContainer.new()
	panel.add_child(col)

	var row := HBoxContainer.new()
	col.add_child(row)
	var copy := Button.new()
	copy.text = "COPIER"
	copy.pressed.connect(_on_copy)
	row.add_child(copy)
	var hide := Button.new()
	hide.text = "CACHER (TAB)"
	hide.pressed.connect(func() -> void: panel.visible = false)
	row.add_child(hide)

	col.add_child(_title("FUSION"))
	var blend := OptionButton.new()
	for b in BLENDS:
		blend.add_item(b)
	blend.selected = int(_values["blend"])
	blend.item_selected.connect(func(i: int) -> void:
		_values["blend"] = i
		_apply())
	col.add_child(blend)

	col.add_child(_title("COULEUR"))
	var pick := ColorPickerButton.new()
	pick.color = _values["tint"]
	pick.edit_alpha = false
	pick.custom_minimum_size = Vector2(0, 28)
	pick.color_changed.connect(func(c: Color) -> void:
		_values["tint"] = c
		_apply())
	col.add_child(pick)

	# Deux colonnes : la mer a gauche, les grains a droite — une seule
	# depassait du bas de l'ecran.
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 12)
	col.add_child(cols)
	var sea_col := VBoxContainer.new()
	var mote_col := VBoxContainer.new()
	cols.add_child(sea_col)
	cols.add_child(mote_col)
	for d in DIALS + MOTE_DIALS:
		var host: VBoxContainer = sea_col if d in DIALS else mote_col
		var l := _title("")
		_labels[d["key"]] = l
		host.add_child(l)
		var s := HSlider.new()
		s.min_value = d["min"]
		s.max_value = d["max"]
		s.step = d["step"]
		s.value = _values[d["key"]]
		s.custom_minimum_size = Vector2(220, 20)
		s.value_changed.connect(func(v: float) -> void:
			_values[d["key"]] = v
			_relabel(d)
			_apply())
		host.add_child(s)
		_relabel(d)


## TAB ouvre et ferme le panneau. En `_input` et pas `_unhandled_input` :
## un bouton ou le curseur qui a le focus avalerait la touche sinon.
func _input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k != null and k.pressed and not k.echo and k.keycode == KEY_TAB:
		_panel.visible = not _panel.visible
		get_viewport().set_input_as_handled()


func _title(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 13)
	l.add_theme_color_override("font_color", Color(1, 0.83, 0.36))
	return l


func _relabel(d: Dictionary) -> void:
	(_labels[d["key"]] as Label).text = "%s %.3f" % [d["label"], _values[d["key"]]]


func _apply() -> void:
	for k in ["strength", "stretch", "scale", "coverage", "edge", "pixel", "tint", "blend", "morph"]:
		_mat.set_shader_parameter("sun_" + k, _values[k])
	_mat.set_shader_parameter("sun_drift", SkyLook.SEA_SUN["drift"] * _values["drift_k"])
	if _motes != null:
		for k in MOTE_KEYS:
			_motes.look[k] = _values["m_" + k]


func _on_copy() -> void:
	var t: Color = _values["tint"]
	var out := "\t\"strength\": %.2f,\n\t\"tint\": Color(\"#%s\"),\n\t\"blend\": %d,  # %s\n\t\"scale\": %.3f,\n\t\"stretch\": %.2f,\n\t\"coverage\": %.3f,\n\t\"edge\": %.3f,\n\t\"pixel\": %.1f,\n\t\"morph\": %.3f,\n\t\"drift\": %s," % [
		_values["strength"], t.to_html(false), int(_values["blend"]), BLENDS[int(_values["blend"])],
		_values["scale"], _values["stretch"], _values["coverage"], _values["edge"], _values["pixel"], _values["morph"], str(SkyLook.SEA_SUN["drift"] * _values["drift_k"])]
	out += "\nAIR_MOTES:"
	for k in MOTE_KEYS:
		out += "\n\t\"%s\": %.2f," % [k, _values["m_" + k]]
	DisplayServer.clipboard_set(out)
	print("SEA_SUN:\n" + out)
