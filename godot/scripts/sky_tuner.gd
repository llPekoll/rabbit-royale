extends Control
## LE REGLAGE DU CIEL, A LA MAIN ET SUR L'APPAREIL.
##
## POURQUOI CETTE SCENE EXISTE. Regler un shader par aller-retour
## export/install/capture coute deux minutes par essai, et un reglage a l'oeil
## en demande vingt. Paul, le 2026-09-22 : « est-ce que je pourrais regler
## manuellement... sinon on va y passer des heures ». Il a raison, et c'est
## aussi ce que fait le web : ses valeurs viennent d'une story a sliders, pas
## d'un jugement dans le code.
##
## CE QU'ELLE MONTRE : la VRAIE ile, avec sa mer, son ecume, ses rochers et ses
## canards — pas un fond de remplacement. Un rai se juge contre ce qu'il
## eclaire, et un degrade uni ne dit rien de ce que ca donne sur de l'herbe.
##
## COMMENT S'EN SERVIR. On bouge les curseurs, on regarde. Quand c'est bon, on
## appuie sur COPIER : les valeurs partent dans le presse-papier ET dans la
## console (`adb logcat -s godot`), pretes a etre recopiees dans `sky_look.gd`.
## C'est la scene qui REGLE ; le fichier reste la source de verite.

const ISLAND := preload("res://scenes/island.tscn")

## LES MOLETTES, dans l'ordre ou on les touche.
##
## `cle` est celle de `SkyLook.SKY`, pour que la copie se relise sans traduire.
## Les bornes sont larges a dessein : c'est un banc, on doit pouvoir depasser
## le raisonnable pour voir ou est la limite.
const DIALS := [
	{"key": "source_x", "label": "SOURCE X", "min": -1.5, "max": 2.5, "step": 0.01},
	{"key": "source_y", "label": "SOURCE Y", "min": -2.5, "max": 1.5, "step": 0.01},
	{"key": "ray_reach", "label": "PORTEE", "min": 0.2, "max": 6.0, "step": 0.05},
	{"key": "scale", "label": "NB FAISCEAUX", "min": 0.5, "max": 8.0, "step": 0.1},
	{"key": "edge", "label": "BORD", "min": 0.01, "max": 0.5, "step": 0.01},
	{"key": "softness", "label": "ETALEMENT", "min": 0.5, "max": 8.0, "step": 0.1},
	{"key": "ray_strength", "label": "FORCE RAIS", "min": 0.0, "max": 1.5, "step": 0.01},
	{"key": "shade_alpha", "label": "FORCE OMBRES", "min": 0.0, "max": 0.8, "step": 0.01},
	{"key": "speed", "label": "VITESSE", "min": 0.0, "max": 0.2, "step": 0.002},
	{"key": "morph", "label": "DEFORMATION", "min": 0.0, "max": 0.2, "step": 0.002},
	{"key": "coverage", "label": "COUVERTURE", "min": 0.30, "max": 0.70, "step": 0.005},
	{"key": "motes", "label": "POUSSIERES", "min": 0.0, "max": 1.2, "step": 0.02},
	{"key": "mote_cell", "label": "ESPACEMENT", "min": 8.0, "max": 64.0, "step": 1.0},
	{"key": "mote_density", "label": "DENSITE", "min": 0.0, "max": 0.8, "step": 0.01},
]

var _island: Node2D
var _sky: SkyLight
var _values: Dictionary = {}
var _labels: Dictionary = {}
## Vrai tant qu'on regle la couverture a la main : la meteo cesse alors de
## l'ecrire par-dessus, sinon le curseur est repris une image plus tard.
var _manual_coverage := false


func _ready() -> void:
	_island = ISLAND.instantiate()
	add_child(_island)
	_sky = _island.get_node("%Sky")
	_seed_values()
	_build_panel()
	_apply()


## LES VALEURS DE DEPART sont celles du fichier : on regle A PARTIR de ce qui
## est livre, jamais d'un etat neuf qu'on aurait oublie de reporter.
func _seed_values() -> void:
	var look: Dictionary = SkyLook.SKY
	for d in DIALS:
		var k: String = d["key"]
		if k == "source_x":
			_values[k] = (look["source"] as Vector2).x
		elif k == "source_y":
			_values[k] = (look["source"] as Vector2).y
		elif k == "coverage":
			_values[k] = _sky.coverage()
		else:
			_values[k] = float(look[k])


func _build_panel() -> void:
	# A DROITE ET EN DEUX COLONNES, et les deux tiennent a l'usage : onze
	# curseurs en une colonne depassaient du bas — les boutons COPIER et
	# DEFAUTS etaient hors ecran — et un panneau a gauche masquait la moitie
	# de l'ile, qui est justement ce qu'on regarde.
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	panel.position = Vector2(-470, 8)
	panel.custom_minimum_size = Vector2(460, 0)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0.55)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	panel.add_theme_stylebox_override("panel", style)
	# DANS UN CanvasLayer, sinon l'ILE PASSE DEVANT. Le panneau et l'ile sont
	# freres dans l'arbre, et c'est l'ordre d'arbre qui tranche pour un Node2D
	# — pas le z_index d'un Control. Un CanvasLayer est toujours au-dessus.
	var layer := CanvasLayer.new()
	layer.layer = 100
	add_child(layer)
	layer.add_child(panel)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	panel.add_child(col)

	# LES BOUTONS EN PREMIER, donc toujours visibles : places apres onze
	# curseurs, ils sortaient du bas de l'ecran et la scene n'avait plus de
	# moyen de rendre ses valeurs.
	var row := HBoxContainer.new()
	col.add_child(row)

	var copy := Button.new()
	copy.text = "COPIER"
	copy.pressed.connect(_on_copy)
	row.add_child(copy)

	var reset := Button.new()
	reset.text = "DEFAUTS"
	reset.pressed.connect(_on_reset)
	row.add_child(reset)

	var hide := Button.new()
	hide.text = "CACHER"
	hide.pressed.connect(func() -> void: panel.visible = false)
	row.add_child(hide)

	# Deux colonnes de curseurs, pour tenir dans la hauteur.
	var grid := HBoxContainer.new()
	grid.add_theme_constant_override("separation", 8)
	col.add_child(grid)
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 1)
	grid.add_child(left)
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 1)
	grid.add_child(right)

	var half := int(ceil(float(DIALS.size()) / 2.0))
	for i in range(DIALS.size()):
		var host: VBoxContainer = left if i < half else right
		host.add_child(_make_dial(DIALS[i]))



func _make_dial(d: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 0)

	var name := Label.new()
	name.add_theme_font_size_override("font_size", 13)
	name.add_theme_color_override("font_color", Color(1, 0.83, 0.36))
	box.add_child(name)
	_labels[d["key"]] = name

	var slider := HSlider.new()
	slider.min_value = d["min"]
	slider.max_value = d["max"]
	slider.step = d["step"]
	slider.value = _values[d["key"]]
	slider.custom_minimum_size = Vector2(212, 22)
	slider.value_changed.connect(func(v: float) -> void:
		_values[d["key"]] = v
		if d["key"] == "coverage":
			_manual_coverage = true
		_apply())
	box.add_child(slider)

	_relabel(d)
	return box


func _relabel(d: Dictionary) -> void:
	var l: Label = _labels[d["key"]]
	l.text = "%s   %.3f" % [d["label"], _values[d["key"]]]


## POUSSE LES VALEURS DANS LES DEUX SHADERS.
##
## On ecrit DIRECTEMENT dans les materiaux plutot que de passer par
## `SkyLight._apply` : celui-ci relit `SkyLook`, qui est une constante, donc
## rien ne bougerait. Le reglage vit ici tant qu'il n'est pas fige dans le
## fichier.
func _apply() -> void:
	for d in DIALS:
		_relabel(d)

	var sm: ShaderMaterial = _sky._shadows.material
	var rm: ShaderMaterial = _sky._rays.material

	# LE CIEL EST UN SEUL CIEL : les six partages vont dans les deux.
	for pair in [["scale", "scale"], ["speed", "speed"], ["morph", "morph"], ["edge", "edge"]]:
		sm.set_shader_parameter(pair[1], _values[pair[0]])
		rm.set_shader_parameter(pair[1], _values[pair[0]])

	sm.set_shader_parameter("alpha", _values["shade_alpha"])
	rm.set_shader_parameter("strength", _values["ray_strength"])
	rm.set_shader_parameter("softness", _values["softness"])
	# `source` et `reach` passent TELLES QUELLES — voir sky_light.gd : les
	# diviser par REACH rapproche le soleil et ouvre l'eventail depuis l'ile.
	rm.set_shader_parameter("source", Vector2(_values["source_x"], _values["source_y"]))
	rm.set_shader_parameter("reach", _values["ray_reach"] * SkyLight.REACH)
	rm.set_shader_parameter("motes", _values["motes"])
	rm.set_shader_parameter("mote_cell", _values["mote_cell"])
	rm.set_shader_parameter("mote_density", _values["mote_density"])

	if _manual_coverage:
		sm.set_shader_parameter("coverage", _values["coverage"])
		rm.set_shader_parameter("coverage", _values["coverage"])


## LA METEO NE REPREND PAS LA MAIN pendant qu'on regle la couverture.
func _process(_delta: float) -> void:
	if _manual_coverage:
		var sm: ShaderMaterial = _sky._shadows.material
		var rm: ShaderMaterial = _sky._rays.material
		sm.set_shader_parameter("coverage", _values["coverage"])
		rm.set_shader_parameter("coverage", _values["coverage"])
	else:
		_values["coverage"] = _sky.coverage()
		for d in DIALS:
			if d["key"] == "coverage":
				_relabel(d)


## LES VALEURS, PRETES A COLLER DANS `sky_look.gd`.
##
## Dans le presse-papier ET dans la console : sur un telephone le
## presse-papier est commode, mais `adb logcat -s godot` est ce qui permet de
## les recuperer depuis la machine sans rien retaper.
func _on_copy() -> void:
	var out := PackedStringArray()
	out.append("--- SkyLook.SKY ---")
	out.append('\t"scale": %.2f,' % _values["scale"])
	out.append('\t"speed": %.4f,' % _values["speed"])
	out.append('\t"morph": %.4f,' % _values["morph"])
	out.append('\t"edge": %.3f,' % _values["edge"])
	out.append('\t"shade_alpha": %.3f,' % _values["shade_alpha"])
	out.append('\t"source": Vector2(%.3f, %.3f),' % [_values["source_x"], _values["source_y"]])
	out.append('\t"softness": %.2f,' % _values["softness"])
	out.append('\t"ray_strength": %.3f,' % _values["ray_strength"])
	out.append('\t"ray_reach": %.2f,' % _values["ray_reach"])
	out.append('\t"motes": %.2f,' % _values["motes"])
	out.append('\t"mote_cell": %.1f,' % _values["mote_cell"])
	out.append('\t"mote_density": %.2f,' % _values["mote_density"])
	out.append("--- couverture regardee : %.3f ---" % _values["coverage"])
	var text := "\n".join(out)
	DisplayServer.clipboard_set(text)
	print(text)


func _on_reset() -> void:
	_manual_coverage = false
	_seed_values()
	_apply()
