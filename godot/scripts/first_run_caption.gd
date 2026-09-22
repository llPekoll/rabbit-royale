extends PanelContainer
class_name FirstRunCaption
## LE BANDEAU QUI PARLE PENDANT LA PREMIERE MANCHE.
##
## Porte de src/components/first-run-caption.tsx.
##
## UNE LIGNE, et seulement sur l'ile du tutoriel. Elle nomme ce que le joueur
## vient de faire — la premiere tape, le chiffre, le X — d'apres son propre
## compte. Sur toute ile ulterieure elle n'affiche rien : la premiere manche est
## le tutoriel, et un tutoriel qui vous suit partout est une nuisance.
##
## LA LIGNE S'EFFACE SUR UNE HORLOGE, sauf les beats `sticky`, qui tiennent
## jusqu'au suivant — « touche une case » doit rester tant que rien n'a ete
## touche. Effacer plutot qu'empiler, parce qu'un bandeau qui se remplit de
## tout ce que l'ile a jamais dit cesse d'etre lu.
##
## C'EST L'ID DU BEAT QUI EST TENU, PAS SES MOTS. Tenir la phrase voulait dire
## que le bandeau restait dans la langue courante au moment ou le beat est
## parti, et y restait apres un changement. L'id est independant de la langue ;
## les mots se relisent a chaque changement, donc la ligne suit le choix
## aussitot.

## Combien de temps un beat non collant reste a l'ecran.
const CAPTION_SECONDS := 4.5

## LE FOND : le `rgba(13, 17, 23, 0.86)` du web, une nuit presque opaque pour
## qu'une ligne blanche se lise sur n'importe quel sol.
const BACK := Color(13.0 / 255.0, 17.0 / 255.0, 23.0 / 255.0, 0.86)
const INK := Color(1, 1, 1, 1)
const FONT_SIZE := 15

## La largeur du bandeau, en pixels d'ecran. Douze mots a 15 px tiennent dans
## 600 ; plus large, la ligne s'etire d'un bord a l'autre et se lit comme une
## barre d'etat, pas comme une phrase.
const WIDTH := 600.0
const HEIGHT := 44.0
## A combien du bas. Au-dessus du pouce, sous le plateau.
const BOTTOM_GAP := 34.0

var _label: Label
var _shown := ""
var _timer: SceneTreeTimer


func _ready() -> void:
	var box := StyleBoxFlat.new()
	box.bg_color = BACK
	box.content_margin_left = 14
	box.content_margin_right = 14
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	add_theme_stylebox_override("panel", box)

	_label = Label.new()
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_label.add_theme_font_size_override("font_size", FONT_SIZE)
	_label.add_theme_color_override("font_color", INK)
	add_child(_label)

	# EN BAS, AU CENTRE, dans les coordonnees de l'ecran : ce noeud vit dans un
	# CanvasLayer, comme les autres morceaux de chrome, donc il ne suit ni le
	# zoom ni le glissement du plateau.
	set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	offset_left = -WIDTH * 0.5
	offset_right = WIDTH * 0.5
	offset_bottom = -BOTTOM_GAP
	offset_top = -BOTTOM_GAP - HEIGHT
	# Le bandeau ne mange pas le doigt : une tape a travers lui atteint le
	# plateau, sinon la case sous la phrase ne se creuse plus.
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	I18N.locale_changed.connect(_relabel)
	_apply_face()
	visible = false


## MONTRE UN BEAT, ou rien pour un id vide.
##
## Un beat deja a l'ecran ne relance pas son horloge : une autre carotte
## creusee pendant « le chiffre compte les bombes » ne doit pas remettre la
## phrase a zero.
func show_beat(id: String, sticky: bool) -> void:
	if id == _shown:
		return
	_drop_timer()
	_shown = id
	if id == "":
		visible = false
		return
	_relabel(I18N.locale)
	visible = true
	if sticky:
		return
	_timer = get_tree().create_timer(CAPTION_SECONDS)
	_timer.timeout.connect(_on_fade.bind(id))


func hide_beat() -> void:
	show_beat("", false)


## L'HORLOGE A SONNE : on n'efface que si c'est ENCORE ce beat a l'ecran. Un
## beat plus recent a sa propre horloge, ou n'en a pas.
func _on_fade(id: String) -> void:
	if _shown != id:
		return
	_shown = ""
	visible = false


func _drop_timer() -> void:
	# Un SceneTreeTimer survit a qui l'a cree : on le deconnecte, sinon
	# l'ancienne horloge effacerait un beat plus recent portant le meme id.
	if _timer != null:
		for c in _timer.timeout.get_connections():
			_timer.timeout.disconnect(c["callable"])
	_timer = null


func _relabel(_code: String) -> void:
	_apply_face()
	if _shown != "":
		_label.text = I18N.first_run(_shown)


## La face de la langue, posee en override — voir `I18N.face`.
func _apply_face() -> void:
	var face: Font = I18N.face()
	if face == null:
		_label.remove_theme_font_override("font")
	else:
		_label.add_theme_font_override("font", face)
