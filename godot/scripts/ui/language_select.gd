class_name LanguageSelect
extends Dialog
## LE CHOIX DE LA LANGUE — quatre lignes, un drapeau et le nom de la langue
## DANS sa langue, la courante allumee.
##
## Porte de src/components/language-select.tsx, en gardant ce qu'il a decide :
##
##   • UN BOUTON DESSINE ET UN DIALOGUE, PAS UN <select> NATIF. Le doorstep
##     est un tableau avec deux planches sculptees, et une liste systeme au
##     milieu « lisait comme un formulaire entre par hasard » (Paul,
##     2026-09-22 : « do a button with a modal with a radio »).
##   • LE DRAPEAU EST L'ETIQUETTE, et le nom de la langue est le sien —
##     « Français », jamais « French ». Un selecteur qui nomme les langues dans
##     une langue que le joueur ne lit pas est ecrit pour le developpeur.
##   • Une seule ligne est « on » : le web en fait un vrai radiogroup, peint
##     par le skin `tab` — l'or pour la courante, le bois pour les autres.
##     Ici c'est Kit.style_tab(on), la meme matiere.
##   • Des options de 44px, la hauteur d'un pouce.
##
## LA FACE. Trois des quatre noms et tous les drapeaux tombent hors de la face
## pixel du kit (ASCII 32..126). Le web les ecrit dans sa face de secours ;
## ici la police importee autorise le repli systeme (`allow_system_fallback`)
## et la ligne s'ecrit dans une face qui a ses glyphes. Le drapeau reste une
## sequence emoji, comme dans title.gd.
##
## Le dialogue ne s'ouvre pas lui-meme : `LanguageSelect.open()` le construit
## et le pose par `Chrome.current.open`. Il n'ecoute pas `locale_changed` pour
## se relire : choisir une langue le FERME, comme le `onClose()` du web dans
## le meme clic, et il n'y a plus rien a redessiner.

## La largeur du web (`.rr-lang-modal`, min(300px, 100vw - 32)).
const WIDTH := 300.0
## La hauteur d'une option : la cible tactile du web.
const ROW_H := 44.0

var _rows: Array[Button] = []


func _init() -> void:
	super(I18N.t("lang.label"), WIDTH, 0.0)


func _ready() -> void:
	for entry in I18N.LOCALES:
		var row := _make_row(entry)
		body.add_child(row)
		_rows.append(row)
	I18N.locale_changed.connect(_on_locale_changed)


## Une option : la planche d'onglet, le drapeau et le nom.
func _make_row(entry: Dictionary) -> Button:
	var code := String(entry["code"])
	var on := code == I18N.locale
	var b := Button.new()
	b.custom_minimum_size = Vector2(0.0, ROW_H)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.focus_mode = Control.FOCUS_NONE
	b.set_meta("code", code)
	# Le texte est un enfant plutot que le `text` du Button : le Button peint
	# le sien dans la face du theme, et c'est ici qu'un « 中文 » veut sa propre
	# face plutot que celle de l'anglais.
	var label := Kit.label(String(entry["label"]), 13)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	# Le drapeau est une texture (flag.gd) : l'emoji sortait en « FR » dans
	# des carres sur le web. Drapeau et nom forment un bloc centre.
	var line := HBoxContainer.new()
	line.alignment = BoxContainer.ALIGNMENT_CENTER
	line.add_theme_constant_override("separation", 6)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(line)
	var flag := Flag.rect(code, 14.0)
	flag.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(flag)
	line.add_child(label)
	# LE NOM DANS UNE FACE QUI L'ECRIT EN ENTIER. En anglais la face pixel
	# n'a ni « ç » ni « ê » : « Français » sortait avec un ç d'une autre face,
	# plus bas que ses voisines. Un nom hors ASCII prend la face pixel de sa
	# propre ecriture, a la meme echelle que celle du jeu (i18n.gd `face`).
	if I18N.pixel_face() and not _ascii(String(entry["label"])):
		label.add_theme_font_override("font", _own_face(code == "zh"))
	b.set_meta("label", label)
	b.add_child(line)
	# L'encre APRES le libelle : peinte avant, elle ne trouvait pas d'enfant,
	# et l'option choisie gardait la creme sur l'or — illisible.
	_paint(b, on)
	b.pressed.connect(func() -> void:
		# Le meme clic choisit ET ferme (`setLocale(l.code); onClose()`).
		I18N.set_locale(code)
		closed.emit())
	return b


func _ascii(text: String) -> bool:
	for i in text.length():
		if text.unicode_at(i) > 126:
			return false
	return true


## Fusion Pixel reglee comme `I18N.face` la regle.
func _own_face(zh: bool) -> Font:
	return I18N.fusion_face(zh)


## L'onglet : or quand il est choisi, bois sinon ; l'encre suit la planche.
func _paint(b: Button, on: bool) -> void:
	var style := Kit.style_tab(on)
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, style)
	if b.has_meta("label"):
		var label: Label = b.get_meta("label")
		label.add_theme_color_override("font_color", Palette.INK if on else Palette.CREAM)
		if not on:
			label.add_theme_color_override("font_shadow_color", Palette.CREAM_SHADOW)
			label.add_theme_constant_override("shadow_offset_y", 1)
		else:
			label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))


func _on_locale_changed(code: String) -> void:
	set_title(I18N.t("lang.label"))
	for b in _rows:
		_paint(b, String(b.get_meta("code")) == code)


## Construit le dialogue et le pose sur le chrome. Rend le dialogue, pour qui
## veut ecouter `closed`. Par `new()` et non par la scene : Dialog construit
## tout dans `_init`, et un script qui precharge la scene qui le porte est une
## boucle que le chargeur refuse.
static func open() -> LanguageSelect:
	var dialog := LanguageSelect.new()
	Chrome.current.open(dialog)
	return dialog
