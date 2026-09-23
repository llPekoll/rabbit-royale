class_name ArrangeTip
extends Control
## « TOUCHE UN ARBRE… » — la legende qui pointe un arbre du terrier tant que
## le joueur n'a jamais rien deplace (burrow.gd `_tend_tip`). Une fois pour
## toutes : des la premiere prise, elle ne revient plus.
##
## Le terrier dit OU (le haut de l'arbre, en pixels d'ecran) a chaque image ;
## elle se pose au-dessus, la fleche du kit dessous qui voyage vers l'arbre
## (celle de HOME : ce qui demande a etre touche bouge, le reste non).

const GAP := 4.0
const TRAVEL := 5.0
const TRAVEL_SECONDS := 0.55
## La fleche du kit dessine six cellules de sa LARGEUR vers le bas : carree.
const ARROW := Vector2(26.0, 26.0)
## La legende la plus large, et le jeu laisse a la coupe au mot (`_ready`).
const WIDE := 300.0
const SLACK := 24.0

var _box: VBoxContainer
## Hors du conteneur : il replacerait la fleche a chaque tri.
var _arrow: BackButton.Arrow
var _bob := 0.0
var _tween: Tween


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box = Kit.vbox(GAP)
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_box)
	var note := Kit.caption(I18N.t("arrange.tip"))
	note.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var words: Label = note.get_child(0)
	_box.add_child(note)
	# DES LIGNES EGALES. Sans largeur a elle, la legende renvoyait son dernier
	# caractere seul a la ligne ; a 250 fixes, c'etait son dernier MOT —
	# « it. » en anglais, « lugar. » en portugais, « 它。» en chinois. On
	# compte les lignes qu'il faut sous WIDE, puis on partage la phrase en
	# autant de parts egales (plus un peu de jeu pour la coupe au mot).
	var font := words.get_theme_font("font")
	var line := font.get_string_size(words.text, HORIZONTAL_ALIGNMENT_LEFT, -1,
		words.get_theme_font_size("font_size")).x
	var lines := maxf(1.0, ceilf(line / WIDE))
	words.custom_minimum_size.x = minf(WIDE, ceilf(line / lines) + SLACK)
	_arrow = BackButton.Arrow.new()
	_arrow.down = true
	_arrow.ink = Palette.RANK_GOLD
	_arrow.custom_minimum_size = ARROW
	_arrow.size = ARROW
	add_child(_arrow)
	_tween = create_tween().set_loops()
	_tween.tween_property(self, "_bob", TRAVEL, TRAVEL_SECONDS) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_tween.tween_property(self, "_bob", 0.0, TRAVEL_SECONDS) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.25)


## Pointer `at` (le haut de la chose, en pixels d'ecran), sans sortir de
## l'ecran ni passer sous la barre du haut.
func point(at: Vector2) -> void:
	var view := get_viewport_rect().size
	var want := _box.get_combined_minimum_size()
	_box.size = want
	var tall := want.y + GAP + ARROW.y + TRAVEL
	var x := clampf(at.x - want.x * 0.5, Kit.EDGE, view.x - Kit.EDGE - want.x)
	var y := maxf(at.y - tall, Kit.TOPBAR_H + Kit.PAD_TIGHT)
	position = Vector2(floorf(x), floorf(y))
	# La fleche reste AU-DESSUS de la chose, meme quand la legende est poussee
	# sur le cote par le bord de l'ecran.
	var ax := clampf(at.x - position.x - ARROW.x * 0.5, 4.0, want.x - ARROW.x - 4.0)
	_arrow.position = Vector2(floorf(ax), floorf(want.y + GAP + _bob))
