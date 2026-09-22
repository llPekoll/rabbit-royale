@tool
extends Button
class_name PlankButton
## LA PLANCHE PEINTE — le bouton tel qu'il s'affiche VRAIMENT sur le web.
##
## Remplace px_button.gd, qui reproduisait le `PxButton` de src/components/px.tsx
## (une face plate sur une ombre dure). Ce biseau existe encore dans le code
## web, mais il ne se voit jamais : le skin woodland (components/woodland/
## runtime.tsx) intercepte chaque bouton et peint une planche a sa place, en
## jetant au passage les couleurs qu'on lui passe — le commentaire de page.tsx
## le dit noir sur blanc, `color`/`shadowColor` n'y peignent rien.
##
## Donc ce qu'un joueur voit, c'est du bois : une planche doree a feuilles pour
## la porte d'entree, une planche de bois brut pour les deux autres.
##
## TROIS TRANCHES, PAS NEUF. Le CSS decoupe `0 340 fill / 0 30px` : rien en
## haut ni en bas, 340px de source a gauche et a droite ramenes a 30px. L'art
## est donc etire verticalement sur toute la hauteur du bouton, et seuls les
## bouts sont preserves horizontalement. Un nine-slice classique tiendrait les
## coins et deformerait le milieu autrement.

## `Skin` est deja une classe de Godot (le squelette d'un maillage), et un
## enum qui porte ce nom masque le type natif : le script ne compile plus.
enum Board {
	## plank.webp — la porte invitee et le selecteur de langue.
	WOOD,
	## notice-gold.webp — CONNECT WALLET. Doree parce que c'est le premier et
	## le plus important bouton du jeu : sur la planche brune il etait le jumeau
	## de celui du dessous, et rien ne disait lequel presser.
	GOLD,
	## notice-green.webp — la recolte, le jardin (runtime.css `action-green`).
	GREEN,
	## notice-danger.webp — MARK A BOMB, et tout ce qui parie ou detruit.
	DANGER,
	## notice-blue.webp — les bandeaux d'information du kit.
	BLUE,
}

## PRELOAD, ET SURTOUT PAS `load()` D'UN CHEMIN.
##
## Un `load("res://...")` se resout a l'execution : rien dans le projet ne
## reference alors la texture de facon STATIQUE, et l'exportateur Android est
## libre de ne pas l'embarquer. C'est exactement ce qui se passait — la planche
## doree survivait parce que title.tscn la nomme en ext_resource, tandis que
## celle de bois, chargee uniquement par ce chemin, manquait a l'appel dans
## l'APK. Sur le bureau tout marchait : le dossier est la, le chemin resout.
##
## `preload` est resolu a la compilation, donc la dependance est visible de
## l'exportateur et la texture part toujours avec le jeu.
const WOOD_TEXTURE := preload("res://assets/ui/plank.webp")
const GOLD_TEXTURE := preload("res://assets/ui/notice-gold.webp")
## Reduites du meme facteur que l'or (tools : 158/1785), donc meme cap de 30.
const GREEN_TEXTURE := preload("res://assets/ui/notice-green.webp")
const DANGER_TEXTURE := preload("res://assets/ui/notice-danger.webp")
const BLUE_TEXTURE := preload("res://assets/ui/notice-blue.webp")

## Les caps, en pixels a l'ecran. Le CSS les fixe par skin : 25px pour le bois,
## 30px pour l'or.
const WOOD_CAP := 25
const GOLD_CAP := 30
## L'air entre le bord de la planche et le texte (`padding: 8px 22px`). Il
## etait `cap + 8` — 33px sur le bois, 38 sur l'or —, et tout bouton etroit
## coupait son mot : « JOIN » en « JOII », « RAID » en « Al » (2026-09-23).
const TEXT_PAD := 22.0

## L'encre. L'or porte un brun fonce sans ombre ; le bois une creme avec une
## ombre d'un pixel, parce que le bois est plus sombre et moins contraste.
const GOLD_INK := Color("#352011")
const WOOD_INK := Color("#fff0cb")
const WOOD_INK_SHADOW := Color("#352011")

## LA VAGUE — l'animation de repos de la colonne.
##
## Quatre secondes de cycle dont 630 ms de geste : le bouton monte de 2px,
## redescend 0.8px sous sa place, remonte de 0.4px, puis ne bouge plus pendant
## 3,4 s. C'est ce qui fait respirer l'ecran sans qu'on le remarque.
const WAVE_SECONDS := 4.0
const WAVE_GESTURE := 0.1575

## Attention : ce setter ne repeint PAS.
##
## Il est appele pendant le chargement de la scene, avant que le noeud soit
## dans l'arbre, et `_restyle` y cree des enfants — ce qui est hasardeux. Pire,
## il ne s'appelle que si la scene donne une valeur EXPLICITE : la planche
## doree porte `board = 1` et se peignait donc, tandis que celles de bois
## gardaient la valeur par defaut, ne declenchaient rien, et n'apparaissaient
## jamais sur le telephone.
##
## Tout le dessin part donc de `_ready`, une fois pour toutes.
@export var board: Board = Board.WOOD:
	set(value):
		board = value
		_restyle()

## La taille du label. Le web la calcule en `cqw` — un pourcentage de la
## largeur du BOUTON, pas de l'ecran — puis la borne : 18px pour la porte
## doree, ~14px pour les deux autres. Les largeurs etant fixes ici, la valeur
## resolue est passee directement plutot que recalculee.
@export var label_size: int = 14:
	set(value):
		label_size = value
		_restyle()

## Le decalage de cette planche dans la vague : 0, 140 ou 280 ms selon son rang
## dans la colonne. C'est ce qui fait une vague et non trois sursauts
## simultanes. Pose par le doorstep, qui seul connait l'ordre.
var wave_delay := 0.0

## Les mots du bouton. `text` est intercepte parce que le Button peint le sien
## AVANT ses enfants, donc sous la planche : on garde la valeur et on laisse
## celui du Button vide.
var _words := ""

var _plank: NinePatchRect
## Le texte, peint par nous plutot que par le Button — voir `_restyle`.
var _ink: Label
var _wave := 0.0


func _init() -> void:
	# CREES ICI, ET PAS DANS `_restyle`.
	#
	# `_restyle` est appele par les setters PENDANT le chargement de la scene,
	# avant que le noeud soit dans l'arbre, et y faire `add_child` etait
	# hasardeux : la planche doree, qui porte un `board = 1` explicite,
	# declenchait son setter et existait ; celles de bois gardaient la valeur
	# par defaut, aucun setter ne partait, et elles n'apparaissaient jamais sur
	# le telephone. Garder la creation ici et le style ailleurs supprime le
	# probleme quel que soit l'ordre d'appel.
	_plank = NinePatchRect.new()
	_plank.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_plank, false, Node.INTERNAL_MODE_FRONT)

	_ink = Label.new()
	_ink.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ink.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ink.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(_ink, false, Node.INTERNAL_MODE_BACK)


func _ready() -> void:
	# La taille du texte depend de la largeur de la planche, qui n'est connue
	# qu'une fois la colonne posee : on la recalcule a chaque redimensionnement.
	# La planche et le texte sont redimensionnes A CHAQUE changement de taille.
	#
	# Les ancres PRESET_FULL_RECT auraient du suffire — c'est ce que je croyais
	# — mais un enfant INTERNE ajoute par script ne recoit pas toujours la
	# disposition de son parent : sur le telephone, les deux planches de bois
	# restaient a (50, 0), soit la somme de leurs deux bouts et une hauteur
	# NULLE, donc invisibles. La doree y echappait par accident : son
	# `board = 1` declenche un setter qui repeint apres coup, une fois la
	# taille connue.
	#
	# Poser la taille explicitement enleve toute dependance a cet ordre.
	resized.connect(_relayout)
	# LE BUTTON NE DOIT PAS PEINDRE SES MOTS : c'est notre Label qui s'en
	# charge, au-dessus de la planche. On garde donc `text` — il porte le
	# libelle, et le doorstep l'ecrit — mais la police du Button est mise a
	# zero, ce qui l'empeche de dessiner quoi que ce soit.
	#
	# Un `_set` sur `text` etait la premiere idee : il n'intercepte pas les
	# proprietes NATIVES, et l'ecran affichait chaque libelle en double, celui
	# du Button sous le notre.
	add_theme_font_size_override("font_size", 1)
	add_theme_color_override("font_color", Color(0, 0, 0, 0))
	add_theme_color_override("font_hover_color", Color(0, 0, 0, 0))
	add_theme_color_override("font_pressed_color", Color(0, 0, 0, 0))
	add_theme_color_override("font_focus_color", Color(0, 0, 0, 0))
	add_theme_color_override("font_disabled_color", Color(0, 0, 0, 0))
	_restyle()
	if not Engine.is_editor_hint():
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND


func _restyle() -> void:
	# Le fond du Button lui-meme disparait : c'est la planche qui peint.
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		var empty := StyleBoxEmpty.new()
		# Le CSS met `padding: 8px 22px` : le texte commence a 22px du bord,
		# DANS le bout orne, pas apres lui.
		empty.content_margin_left = TEXT_PAD
		empty.content_margin_right = TEXT_PAD
		empty.content_margin_top = 8
		empty.content_margin_bottom = 8
		add_theme_stylebox_override(state, empty)

	_plank.texture = _texture()

	# LES BOUTS, EN PIXELS — ET LA SOURCE A DEJA ETE MISE A L'ECHELLE POUR EUX.
	#
	# Le CSS comprime ses bouts : 340px d'art pour l'or ramenes a 30px a
	# l'ecran, 30 pour le bois ramenes a 25. NinePatchRect ne sait pas faire
	# cette compression — il dessine un bout a sa taille source. Donner 340 ici
	# faisait donc deborder la planche doree sur toute la largeur de l'ecran.
	#
	# Les deux textures ont ete reduites du meme facteur une fois pour toutes
	# (notice-gold 1785x403 -> 158x36, plank 167x45 -> 139x38), ce qui rend
	# source et ecran equivalents et evite au passage de charger 1785px de
	# large pour un bouton qui en fait 338.
	var source_cap := _cap()
	_plank.patch_margin_left = source_cap
	_plank.patch_margin_right = source_cap
	# Zero en haut et en bas : l'art est etire sur la hauteur, exactement comme
	# le `0` du `border-image-slice`.
	_plank.patch_margin_top = 0
	_plank.patch_margin_bottom = 0

	_ink.text = text

	# LE TEXTE NE DOIT JAMAIS ELARGIR LA PLANCHE NI EN SORTIR.
	#
	# Les libelles varient du simple au double selon la langue — 14 signes pour
	# "CONNECT WALLET", 25 pour "Connecter un portefeuille" — et a taille fixe
	# le francais debordait sur le decor. Le web coupe net (`overflow: hidden`
	# sur un `nowrap`) ; on prefere retrecir, parce qu'un libelle ampute au
	# milieu d'un mot ne dit plus rien.
	#
	# La planche garde donc sa taille en toutes langues, et le texte se loge
	# dedans. Une seule ligne, jamais de retour a la ligne : deux lignes
	# changeraient la hauteur du bouton et pousseraient tout ce qui suit.
	_ink.autowrap_mode = TextServer.AUTOWRAP_OFF
	_ink.clip_text = true
	_relayout()

	var ink := GOLD_INK if board == Board.GOLD else WOOD_INK
	_ink.add_theme_color_override("font_color", Color(ink, 0.55 if disabled else 1.0))
	if board != Board.GOLD:
		# Le bois est plus sombre et moins contraste que l'or : le CSS lui donne
		# une ombre d'un pixel, et n'en donne aucune a la planche doree.
		_ink.add_theme_color_override("font_shadow_color", WOOD_INK_SHADOW)
		_ink.add_theme_constant_override("shadow_offset_x", 0)
		_ink.add_theme_constant_override("shadow_offset_y", 1)
	else:
		_ink.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))


## Le libelle a change (une autre langue) : le Label le reprend et la taille
## est recalculee pour lui. Appele par le doorstep apres chaque traduction.
func relabel(words: String) -> void:
	text = words
	if _ink != null:
		_ink.text = words
		_relayout()


## La planche et le texte reprennent la taille du bouton, puis le libelle est
## remesure pour la largeur obtenue.
func _relayout() -> void:
	if _plank != null:
		_plank.size = size
	if _ink != null:
		_ink.position.x = TEXT_PAD
		_ink.size = Vector2(maxf(0.0, size.x - 2.0 * TEXT_PAD), size.y)
		_ink.add_theme_font_size_override("font_size", _fitted_size())


## La taille de police qui tient dans la planche, en partant de celle voulue
## et en descendant tant que le mot deborde. Jamais sous 9px — en dessous, le
## libelle est illisible et il vaut mieux qu'il soit serre.
func _fitted_size() -> int:
	var room := size.x - 2.0 * TEXT_PAD
	if room <= 0.0 or _ink == null or _ink.text.is_empty():
		return label_size
	var font := _ink.get_theme_font("font")
	var chosen := label_size
	while chosen > 9:
		var w := font.get_string_size(_ink.text, HORIZONTAL_ALIGNMENT_LEFT, -1, chosen).x
		if w <= room:
			break
		chosen -= 1
	return chosen


## Le cap a l'ecran, qui sert a ecarter le texte des bouts ornementes.
func _cap() -> int:
	return WOOD_CAP if board == Board.WOOD else GOLD_CAP


func _texture() -> Texture2D:
	match board:
		Board.GOLD:
			return GOLD_TEXTURE
		Board.GREEN:
			return GREEN_TEXTURE
		Board.DANGER:
			return DANGER_TEXTURE
		Board.BLUE:
			return BLUE_TEXTURE
		_:
			return WOOD_TEXTURE


## Le nom d'un ton du kit ("wood", "gold", "green", "danger", "blue") vers
## sa planche — pour Kit.button, qui parle en mots comme le CSS.
static func tone_board(tone: String) -> Board:
	match tone:
		"gold":
			return Board.GOLD
		"green":
			return Board.GREEN
		"danger":
			return Board.DANGER
		"blue":
			return Board.BLUE
		_:
			return Board.WOOD


func _process(delta: float) -> void:
	if Engine.is_editor_hint():
		return

	# Le survol et la pression suspendent la vague : un bouton que le joueur
	# tient ne doit pas lui glisser sous le doigt.
	if is_hovered() or button_pressed:
		_lift(0.0)
		return

	_wave = fmod(_wave + delta, WAVE_SECONDS)
	var t := (_wave - wave_delay) / WAVE_SECONDS
	if t < 0.0:
		t += 1.0
	_lift(_wave_offset(t))


## Souleve LE DESSIN — planche ET texte —, jamais la boite.
##
## `position` etait le premier reflexe et c'etait le mauvais : la colonne pose
## ses trois planches a des hauteurs calculees (title.gd `_measure`), et une
## vague qui ecrit dans `position` se bat avec elle.
##
## LES DEUX ENFANTS BOUGENT ENSEMBLE. Ne soulever que la planche laissait le
## libelle immobile pendant que le bois montait dessous : le mot se decollait
## de sa planche a chaque vague. Un bouton est UN objet, il se souleve d'un
## bloc.
##
## La boite du Control, elle, ne bouge pas : la zone tactile reste ou la
## colonne l'a posee, ce qui est aussi ce qu'on veut sous un pouce.
func _lift(dy: float) -> void:
	if is_equal_approx(_lift_now, dy):
		return
	_lift_now = dy
	if _plank != null:
		_plank.position.y = dy
	if _ink != null:
		_ink.position.y = dy


var _lift_now := 0.0


## La courbe de la vague, lue sur les memes quatre etapes que la keyframe CSS
## (0 / 4.5 / 8.5 / 12 / 15.75 %) : monte, depasse, rebondit, se pose.
func _wave_offset(t: float) -> float:
	if t >= WAVE_GESTURE:
		return 0.0
	if t < 0.045:
		return lerpf(0.0, -2.0, t / 0.045)
	if t < 0.085:
		return lerpf(-2.0, 0.8, (t - 0.045) / 0.04)
	if t < 0.12:
		return lerpf(0.8, -0.4, (t - 0.085) / 0.035)
	return lerpf(-0.4, 0.0, (t - 0.12) / (WAVE_GESTURE - 0.12))


## LE SURSAUT DE LA PORTE D'ENTREE, apres un clic — pas au survol, pas en
## boucle. Cinq etapes en 420 ms : -5deg et 1.08 d'echelle, puis +4, puis -2,
## puis rien. Seul CONNECT WALLET le fait : un ecran ou tout tressaille n'a
## plus d'action principale.
func wiggle() -> void:
	pivot_offset = size * 0.5
	var shake := create_tween().set_parallel(false)
	shake.tween_property(self, "rotation", deg_to_rad(-5.0), 0.105).set_ease(Tween.EASE_OUT)
	shake.parallel().tween_property(self, "scale", Vector2(1.08, 1.08), 0.105)
	shake.tween_property(self, "rotation", deg_to_rad(4.0), 0.105)
	shake.parallel().tween_property(self, "scale", Vector2(1.05, 1.05), 0.105)
	shake.tween_property(self, "rotation", deg_to_rad(-2.0), 0.105)
	shake.parallel().tween_property(self, "scale", Vector2(1.02, 1.02), 0.105)
	shake.tween_property(self, "rotation", 0.0, 0.105)
	shake.parallel().tween_property(self, "scale", Vector2.ONE, 0.105)
