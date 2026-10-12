class_name VersionTag
extends PanelContainer
## LA VERSION, EN BAS A DROITE DU TERRIER — et la porte du changelog.
##
## Petite et a demi eteinte : elle ne se dispute pas l'oeil avec les ilots.
## Elle sert a deux choses :
##   • le support : une capture d'un joueur dit quel build il a ;
##   • le changelog : la taper ouvre QUOI DE NEUF (WhatsNewDialog), dont
##     SEE ALL mene a rabbit.rip/changelog#<version> dans le navigateur.
##
## UNE VERSION PAS ENCORE VUE pose le fond sombre et une pastille NEW qui
## respire ; vue (la version tapee, QUOI DE NEUF ferme), il ne reste que le
## texte, sans fond — le plus discret possible.
##
## Au terrier seulement — ni sur l'ile, ni en raid, ni pendant le tuto.

signal tapped

## Toujours le site en ligne, avec sa barre finale comme /privacy/
## (Consent.PRIVACY_URL) : jamais un fichier local, meme depuis le bureau.
const URL := "https://rabbit.rip/changelog/"
## Au repos, a demi : elle se voit quand on la cherche.
const REST_ALPHA := 0.72
const TEXT_SIZE := 11
## Un doigt la trouve : la pastille fait 14 px, la zone de tape bien plus.
const TAP_H := 26.0

var version := ""
var unseen := false: set = set_unseen

var _new: PanelContainer
var _label: Label
var _pulse: Tween
var _backing: StyleBoxFlat


func _init(v: String = "", is_unseen: bool = false) -> void:
	version = v
	unseen = is_unseen


func _ready() -> void:
	_backing = StyleBoxFlat.new()
	_backing.bg_color = Color(Palette.CAPTION_BG, 0.5)
	_backing.set_corner_radius_all(9)
	_backing.content_margin_left = 8
	_backing.content_margin_right = 8
	_backing.content_margin_top = 3
	_backing.content_margin_bottom = 3
	add_theme_stylebox_override("panel", _backing)
	custom_minimum_size = Vector2(0.0, TAP_H)
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	modulate.a = REST_ALPHA

	var row := Kit.hbox(5)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(row)
	_new = WhatsNewDialog.chip(Changelog.ui("kinds.new"), Palette.GOLD, Palette.INK, 9)
	_new.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_new)
	_label = Kit.label(version, TEXT_SIZE, Palette.CREAM, true)
	_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_label)

	mouse_entered.connect(func() -> void: modulate.a = 1.0)
	mouse_exited.connect(func() -> void: modulate.a = REST_ALPHA)
	resized.connect(_place)
	get_viewport().size_changed.connect(_place)
	set_unseen(unseen)
	_place.call_deferred()


func set_unseen(on: bool) -> void:
	unseen = on
	if _new == null:
		return
	_new.visible = on
	# Les marges restent : le texte ne saute pas quand le fond s'en va.
	_backing.bg_color.a = 0.5 if on else 0.0
	if _pulse != null:
		_pulse.kill()
		_pulse = null
	_new.modulate.a = 1.0
	if on:
		_pulse = create_tween().set_loops()
		_pulse.tween_property(_new, "modulate:a", 0.55, 0.9).set_trans(Tween.TRANS_SINE)
		_pulse.tween_property(_new, "modulate:a", 1.0, 0.9).set_trans(Tween.TRANS_SINE)
	_place.call_deferred()


func page_url() -> String:
	return page_url_for(version)


## La page dans la langue du jeu, posee sur une version :
## https://rabbit.rip/changelog/?lang=fr#v1.4.
static func page_url_for(v: String) -> String:
	return "%s?lang=%s#%s" % [URL, I18N.locale, v]


## Dans le coin, a l'aire sure du telephone : ses coins arrondis mangent ce
## qui se colle au bord (Kit.screen_inset).
func _place() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var inset := Kit.screen_inset()
	size = get_combined_minimum_size()
	position = (view - size - inset).round()


func _gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb == null or mb.button_index != MOUSE_BUTTON_LEFT or mb.pressed:
		return
	accept_event()
	set_unseen(false)
	tapped.emit()
