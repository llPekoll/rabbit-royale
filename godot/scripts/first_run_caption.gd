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

## LA PASTILLE DES LEGENDES DE LA MANCHE (Kit.caption : son fond, son arrondi,
## son encre, sa taille). Le tutoriel avait sa bande noire carree en 15 a
## cote des pastilles arrondies en 13 du HUD : deux voix pour dire la meme
## sorte de chose, sur le meme ecran (2026-09-23).
const INK := Palette.CAPTION_INK
const FONT_SIZE := 13

## La largeur MAXIMALE du bandeau, en pixels d'ecran. Douze mots a 15 px
## tiennent dans 600 ; plus large, la ligne s'etire d'un bord a l'autre et se
## lit comme une barre d'etat, pas comme une phrase. En dessous, le bandeau
## prend la largeur de SA phrase : fixe a 600, « Touche une case a cote de
## toi pour creuser. » flottait dans une bande noire deux fois trop longue.
const WIDTH := 600.0
const HEIGHT := 44.0
## L'air du bandeau (celui de Kit.style_caption) et son ecart aux bords de
## l'ecran.
const SIDE := 18.0
const MARGIN := 24.0
## A combien du bas : AU-DESSUS DE MARQUER UNE BOMBE, sa hauteur (celle du
## bouton de la run, `MarkBombButton.height_for`) plus Kit.EDGE et un pad.
## Un ecart fixe de 66 valait pour la planche de 44 ; celle de 50 a 64 le
## touchait (mesure sur la capture du Seeker, 2026-09-23).

var _label: Label
var _shown := ""
var _timer: SceneTreeTimer


func _ready() -> void:
	add_theme_stylebox_override("panel", Kit.style_caption())

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
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BEGIN
	get_viewport().size_changed.connect(_measure)
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
	_measure()


## LA LARGEUR DE LA PHRASE, en lignes egales si elle ne tient pas sur une
## (RunHud.balanced_width) ; le bas au-dessus du bouton, le haut qui grandit
## vers le plateau si la phrase prend deux lignes.
func _measure() -> void:
	if _label == null or not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var room := minf(WIDTH, view.x - 2.0 * MARGIN) - 2.0 * SIDE
	var w := RunHud.balanced_width(_label.get_theme_font("font"), _label.text, FONT_SIZE, room)
	_label.custom_minimum_size.x = w
	var half := (w + 2.0 * SIDE) * 0.5
	var gap := Kit.EDGE + MarkBombButton.height_for(view.y) + Kit.PAD
	offset_left = -half
	offset_right = half
	offset_bottom = -gap
	offset_top = -gap - HEIGHT


## La face de la langue, posee en override — voir `I18N.face`.
func _apply_face() -> void:
	var face: Font = I18N.face()
	if face == null:
		_label.remove_theme_font_override("font")
	else:
		_label.add_theme_font_override("font", face)
