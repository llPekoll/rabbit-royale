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
## Les curseurs des grains du shader (motes, espacement, densite) sont partis
## le 2026-09-24 : les poussieres sont MoteField, reglees dans sea_tuner.tscn.
## Les laisser ici rallumait une seconde couche de grains.
const DIALS := [
	{"key": "source_x", "label": "SOURCE X", "min": -1.5, "max": 2.5, "step": 0.01},
	{"key": "source_y", "label": "SOURCE Y", "min": -2.5, "max": 1.5, "step": 0.01},
	{"key": "ray_reach", "label": "PORTEE", "min": 0.2, "max": 6.0, "step": 0.05},
	{"key": "scale", "label": "NB FAISCEAUX", "min": 0.5, "max": 8.0, "step": 0.1},
	{"key": "edge", "label": "BORD", "min": 0.01, "max": 0.5, "step": 0.01},
	{"key": "softness", "label": "ETALEMENT", "min": 0.5, "max": 40.0, "step": 0.1},
	{"key": "ray_opacity", "label": "OPACITE RAIS", "min": 0.0, "max": 1.0, "step": 0.01},
	# LES OMBRES AU SOL ont leur propre deformation et leur propre derive
	# (SkyLook.SHADOWS) : DEFORMATION et VITESSE ci-dessus ne vont qu'aux rais.
	{"key": "sh_morph", "label": "OMBRES DEFORM.", "min": 0.0, "max": 0.1, "step": 0.001},
	{"key": "sh_speed", "label": "OMBRES VITESSE", "min": 0.0, "max": 0.1, "step": 0.001},
	{"key": "ray_strength", "label": "FORCE RAIS", "min": 0.0, "max": 1.5, "step": 0.01},
	{"key": "shade_alpha", "label": "FORCE OMBRES", "min": 0.0, "max": 0.8, "step": 0.01},
	{"key": "speed", "label": "VITESSE", "min": 0.0, "max": 0.2, "step": 0.002},
	{"key": "morph", "label": "DEFORMATION", "min": 0.0, "max": 0.2, "step": 0.002},
	{"key": "coverage", "label": "COUVERTURE", "min": 0.30, "max": 0.70, "step": 0.005},
]

var _island: Node2D
var _sky: SkyLight
var _values: Dictionary = {}
var _labels: Dictionary = {}
## Vrai tant qu'on regle la couverture a la main : la meteo cesse alors de
## l'ecrire par-dessus, sinon le curseur est repris une image plus tard.
var _manual_coverage := false
var _panel: PanelContainer
var _tint: Color = SkyLook.SKY["ray_tint"]
var _blend: int = SkyLook.SKY["ray_blend"]
const BLENDS := ["ADDITIF", "ECRAN", "LUMIERE DOUCE", "INCRUSTATION", "DENSITE COUL. -"]


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
		elif k == "sh_morph":
			_values[k] = float(SkyLook.SHADOWS["morph"])
		elif k == "sh_speed":
			_values[k] = float(SkyLook.SHADOWS["speed"])
		elif k == "shade_alpha":
			_values[k] = float(SkyLook.SHADOWS["alpha"])
		else:
			_values[k] = float(look[k])


func _build_panel() -> void:
	# A DROITE ET EN DEUX COLONNES, et les deux tiennent a l'usage : onze
	# curseurs en une colonne depassaient du bas — les boutons COPIER et
	# DEFAUTS etaient hors ecran — et un panneau a gauche masquait la moitie
	# de l'ile, qui est justement ce qu'on regarde.
	var panel := PanelContainer.new()
	_panel = panel
	# Ancre en haut a droite, GRANDIT VERS LA GAUCHE : la police du jeu est
	# large, une position fixe laissait le panneau deborder.
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT, Control.PRESET_MODE_MINSIZE, 8)
	panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN
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
	hide.text = "CACHER (TAB)"
	hide.pressed.connect(func() -> void: panel.visible = false)
	row.add_child(hide)

	var tint_row := HBoxContainer.new()
	col.add_child(tint_row)
	var tl := Label.new()
	tl.text = "COULEUR RAIS"
	tl.add_theme_font_size_override("font_size", 13)
	tl.add_theme_color_override("font_color", Color(1, 0.83, 0.36))
	tint_row.add_child(tl)
	var pick := ColorPickerButton.new()
	pick.color = _tint
	pick.edit_alpha = false
	pick.custom_minimum_size = Vector2(120, 24)
	pick.color_changed.connect(func(c: Color) -> void:
		_tint = c
		_apply())
	tint_row.add_child(pick)
	var blend := OptionButton.new()
	for b in BLENDS:
		blend.add_item(b)
	blend.selected = _blend
	blend.item_selected.connect(func(i: int) -> void:
		_blend = i
		_apply())
	tint_row.add_child(blend)

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

	# Ces quatre-la ne vont QU'AUX RAIS : les ombres sont un portage fidele du
	# web et prennent `SkyLook.SHADOWS`, dont les dials n'ont pas le meme sens.
	for k in ["scale", "speed", "morph", "edge"]:
		rm.set_shader_parameter(k, _values[k] * (SkyLight.TEXTURE_SCALE if k == "scale" else 1.0))

	sm.set_shader_parameter("alpha", _values["shade_alpha"])
	sm.set_shader_parameter("morph", _values["sh_morph"])
	var a := deg_to_rad(float(SkyLook.SHADOWS["angle"]))
	sm.set_shader_parameter("drift", Vector2(cos(a), sin(a)) * _values["sh_speed"])
	rm.set_shader_parameter("strength", _values["ray_strength"])
	rm.set_shader_parameter("softness", _values["softness"])
	rm.set_shader_parameter("tint", _tint)
	var cm: ShaderMaterial = _sky._views[1].material
	cm.set_shader_parameter("opacity", _values["ray_opacity"])
	cm.set_shader_parameter("mode", _blend)
	# `source` et `reach` passent TELLES QUELLES — voir sky_light.gd : les
	# diviser par REACH rapproche le soleil et ouvre l'eventail depuis l'ile.
	rm.set_shader_parameter("source", Vector2(_values["source_x"], _values["source_y"]))
	rm.set_shader_parameter("reach", _values["ray_reach"] * SkyLight.REACH)

	if _manual_coverage:
		rm.set_shader_parameter("coverage", _values["coverage"])


## TAB ouvre et ferme le panneau. En `_input` : un curseur qui a le focus
## avalerait la touche sinon.
func _input(event: InputEvent) -> void:
	var k := event as InputEventKey
	if k != null and k.pressed and not k.echo and k.keycode == KEY_TAB:
		_panel.visible = not _panel.visible
		get_viewport().set_input_as_handled()


## LA METEO NE REPREND PAS LA MAIN pendant qu'on regle la couverture.
func _process(_delta: float) -> void:
	if _manual_coverage:
		var rm: ShaderMaterial = _sky._rays.material
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
	out.append('\t"ray_tint": Color("#%s"),' % _tint.to_html(false))
	out.append('\t"ray_opacity": %.2f,' % _values["ray_opacity"])
	out.append('\t"ray_blend": %d,  # %s' % [_blend, BLENDS[_blend]])
	out.append("--- SkyLook.SHADOWS ---")
	out.append('\t"alpha": %.2f,' % _values["shade_alpha"])
	out.append('\t"morph": %.3f,' % _values["sh_morph"])
	out.append('\t"speed": %.3f,' % _values["sh_speed"])
	out.append("--- couverture regardee : %.3f ---" % _values["coverage"])
	var text := "\n".join(out)
	DisplayServer.clipboard_set(text)
	print(text)


func _on_reset() -> void:
	_manual_coverage = false
	_tint = SkyLook.SKY["ray_tint"]
	_blend = SkyLook.SKY["ray_blend"]
	_seed_values()
	_apply()
