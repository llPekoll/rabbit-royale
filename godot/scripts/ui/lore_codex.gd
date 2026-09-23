class_name LoreCodex
extends Dialog
## LE CODEX : le parchemin du terrier, et les chapitres derriere.
##
## Porte de lore-codex.tsx (`LoreCodex`, `ChapterTab`) et de globals.css
## `.rr-lore-*`, en gardant ce qu'ils ont decide :
##
##   • LE PANNEAU EST LE PARCHEMIN, pas le mur ou il est epingle. Le tableau
##     des quetes tient son bord contre d'autres panneaux ; celui-ci s'ouvre
##     sur un terrier assombri sans rien qui lui dispute la place, et un
##     livre d'histoire de la couleur d'un rouleau deroule vaut plus que le
##     contraste qu'une dalle de pierre acheterait. Ici le cadre a feuilles
##     de `Dialog` est cette feuille ; les couleurs qui restent (le disque du
##     numeral, le filet, le sceau) sont celles de la palette de scroll.png,
##     comme le web les a prises — jamais inventees a cote.
##   • L'ETAGERE A GAUCHE, LA PAGE A DROITE. Le chapitre ouvert est marque sur
##     sa tranche (un filet de 3px), pas par un bloc plein : une selection
##     pleine sur du parchemin lit comme un surligneur, que cette feuille n'a
##     jamais vu. Sur un ecran etroit (< 620) les deux s'empilent et
##     l'etagere devient une bande de disques au-dessus du texte.
##   • ON OUVRE SUR LE PLUS RECENT CHAPITRE DEBLOQUE, pas le premier. Un
##     joueur qui revient ouvre le codex pour ce qu'il n'a pas encore lu ; le
##     faire redescendre la liste pour le trouver est le seul echec evident
##     de ce panneau.
##   • UN CHAPITRE SCELLE MONTRE QUAND MEME SON SUJET ET SON PRIX. Une ligne
##     qui dit seulement « verrouille » ne dit pas si ca vaut de creuser.
##   • LE PIED PARLE DU COMPTEUR, pas de l'histoire — le seul endroit. Les
##     carottes a vie ne se volent pas et ne se remettent pas a zero, donc ce
##     progres ne peut que monter : ca vaut d'etre dit, parce que tout autre
##     nombre de ce jeu peut tomber. UNE SEULE CHAINE, pas une phrase coupee
##     autour d'un nombre : le compte tombe ailleurs en chinois.
##   • LIRE UN CHAPITRE DEBLOQUE POSE UNE MARQUE. La quete « Read the
##     stones » ecoute le chapitre II ; le codex ne garde aucune trace de
##     lecture, donc cette marque est le seul temoin qu'un chapitre a ete
##     regarde (`Home.mark_quest(Content.codex_mark(id))`).
##
## Les seuils sont ceux du chapitre (Content.LORE) ; la prose est celle de
## la langue (I18N `lore.<id>`).

## `min(760px, 100%)`, la liste a 232, et le point ou les colonnes
## s'empilent.
const SCROLL_W := 760.0
const LIST_W := 232.0
const STACK_BELOW := 620.0
## « Frais » = le dernier chapitre ouvert dans les 500 dernieres carottes,
## a peu pres une partie au bas de l'echelle (lore-codex.tsx `fresh`). Assez
## long pour qu'un joueur qui a creuse puis dormi le voie encore ; assez
## court pour ne pas etre une pastille permanente.
const FRESH_WINDOW := 500.0

## LA PALETTE DE SCROLL.PNG (lore-codex.tsx) — ce que le kit n'a pas deja :
## le sceau (#975528, disques et marque lue), le parchemin eclaire
## (#f4d593, l'encre des numeraux), le filet et le verrou (le brun sombre
## du sprite, translucide), et les deux fonds d'une ligne de l'etagere.
const SEAL := Color("#975528")
const LIT := Color("#f4d593")
const RULE := Color(96.0 / 255.0, 51.0 / 255.0, 28.0 / 255.0, 0.34)
const LOCK := Color(96.0 / 255.0, 51.0 / 255.0, 28.0 / 255.0, 0.45)
const ROW_HOVER := Color(151.0 / 255.0, 85.0 / 255.0, 40.0 / 255.0, 0.16)
const ROW_ACTIVE := Color(151.0 / 255.0, 85.0 / 255.0, 40.0 / 255.0, 0.22)
## L'encre de la pastille NEW (`.rr-new-tag` : fond --danger, encre #1a0a0a).
const NEW_INK := Color("#1a0a0a")

## Les mesures de `.rr-lore-*`.
const BODY_GAP := 14.0
const ROW_PAD_Y := 7.0
const ROW_PAD_X := 8.0
const ROW_GAP := 9.0
const DISC := 26.0
const SPINE := 3.0
const PARA_SIZE := 13
const PARA_LEAD := 9
const FOOT_PAD := 9.0

## FAUX DANS UN BANC : lire un chapitre ne poste rien.
var read_marks := true

var _selected := 0
var _stacked := false
var _body: BoxContainer
var _list: BoxContainer
var _page: VBoxContainer
var _page_scroll: ScrollContainer
var _foot: VBoxContainer
var _scroll_icon: TextureRect


## OUVRIR LE CODEX sur le chrome.
static func open() -> LoreCodex:
	var codex := LoreCodex.new()
	Chrome.current.open(codex)
	return codex


func _init() -> void:
	super("", SCROLL_W, 0.0)
	# PLEIN ECRAN, comme le profil et l'etal : sur l'ecran couche du jeu, le
	# rouleau centre perdait ses bords au cadre et faisait defiler sa page.
	go_fullscreen()


func _ready() -> void:
	# Le rouleau devant le titre (`.rr-lore-head-title img`, 26px).
	_scroll_icon = Kit.icon(Kit.SCROLL, 26.0)
	var header := title_label.get_parent()
	header.add_child(_scroll_icon)
	header.move_child(_scroll_icon, 0)

	_foot = Kit.vbox(3)
	add_footer(_foot)

	I18N.locale_changed.connect(_on_locale_changed)
	Home.changed.connect(_on_home_changed)
	resized.connect(_measure)
	_measure()
	_selected = maxi(0, Content.unlocked_count(_lifetime()) - 1)
	_rebuild()
	_note_read()


func _lifetime() -> float:
	return float(Home.burrow.get("lifetime", 0))


## LA TAILLE, sur la place que le parent donne (le voile du chrome, ou une
## cellule de banc) : `min(760px, 100%)` de large, et LA HAUTEUR DE SON TEXTE
## sous celle de l'ecran (`.rr-lore-modal` : `max-height: 100%`). Il prenait
## toute la hauteur quoi qu'il porte : au bureau, un chapitre court laissait
## la moitie du parchemin vide. Au-dela de l'ecran, le corps defile.
func _measure() -> void:
	var room := get_parent_area_size()
	var stacked := room.x < STACK_BELOW
	_cap = room.y - 2.0 * Kit.EDGE
	if fullscreen:
		# L'ecran entier (jusqu'a un portable), quel que soit le texte : c'est
		# le chrome qui le pose.
		room = Dialog.screen_rect(get_viewport_rect().size).size
		stacked = room.x < STACK_BELOW
		custom_minimum_size = room
	else:
		custom_minimum_size = Vector2(minf(SCROLL_W, room.x - 2.0 * Kit.EDGE), minf(_cap, _natural) if _natural > 0.0 else _cap)
	if stacked != _stacked and _body != null:
		_stacked = stacked
		_rebuild()
	_stacked = stacked
	_fit_height.call_deferred()


var _cap := 0.0
var _natural := 0.0


## LA VRAIE HAUTEUR D'UNE COLONNE DE TEXTE. Un label qui passe a la ligne ne
## la dit pas dans son minimum : on compte ses lignes a sa largeur du moment.
func _tall(box: Container) -> float:
	var total := 0.0
	var shown := 0
	for child in box.get_children():
		var c := child as Control
		if c == null or not c.visible:
			continue
		shown += 1
		var label := c as Label
		if label != null and label.autowrap_mode != TextServer.AUTOWRAP_OFF:
			total += label.get_line_count() * label.get_line_height() \
				+ maxf(0.0, label.get_line_count() - 1) * label.get_theme_constant("line_spacing")
		else:
			total += c.get_combined_minimum_size().y
	return total + maxf(0, shown - 1) * box.get_theme_constant("separation")


## La hauteur que le texte demande : ce que le cadre prend autour du corps,
## plus le plus haut de la page et de l'etagere a leur largeur du moment.
## Posee seulement si elle change d'un pixel, sinon chaque pose relancerait
## une mesure.
func _fit_height() -> void:
	if fullscreen or _page_scroll == null or _page == null or not is_inside_tree():
		return
	# Pas avant que la page ait sa largeur : etroite, son texte compte des
	# centaines de lignes.
	if _page.size.x < 100.0:
		return
	# CE QUE LE CADRE PREND AUTOUR : le minimum du contenu, ou les deux
	# defilements comptent pour zero. Stable, lui — `size` et la taille du
	# defilement ne sont pas du meme instant pendant qu'on se pose.
	var around := _inset.get_combined_minimum_size().y
	var wanted := _tall(_page)
	if not _stacked and _list != null:
		wanted = maxf(wanted, _list.get_combined_minimum_size().y)
	var natural := around + wanted
	if absf(natural - _natural) < 1.0:
		return
	_natural = natural
	var h := minf(_cap, _natural)
	if absf(custom_minimum_size.y - h) >= 1.0:
		custom_minimum_size.y = h


func _on_locale_changed(_code: String) -> void:
	set_title(I18N.t("codex.title"))
	_rebuild()


func _on_home_changed() -> void:
	_rebuild()


# ── La construction ──────────────────────────────────────────────────────────

func _rebuild() -> void:
	set_title(I18N.t("codex.title"))
	# `set_body` libere l'ancien corps lui-meme.
	_body = Kit.vbox(10) if _stacked else Kit.hbox(BODY_GAP)
	set_body(_body)

	# L'etagere.
	var shelf := ScrollContainer.new()
	shelf.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO if _stacked else ScrollContainer.SCROLL_MODE_DISABLED
	shelf.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED if _stacked else ScrollContainer.SCROLL_MODE_AUTO
	_list = Kit.hbox(6) if _stacked else Kit.vbox(2)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shelf.add_child(_list)
	ScrollFade.attach(shelf)
	if _stacked:
		shelf.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		shelf.custom_minimum_size = Vector2(LIST_W, 0)
		shelf.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(shelf)

	# Le filet entre les deux.
	var rule := ColorRect.new()
	rule.color = RULE
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _stacked:
		rule.custom_minimum_size = Vector2(0, 2)
		rule.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		rule.custom_minimum_size = Vector2(2, 0)
		rule.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(rule)

	# La page.
	_page_scroll = ScrollContainer.new()
	_page_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_page_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_page_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_page = Kit.vbox(0)
	_page.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_page_scroll.add_child(_page)
	ScrollFade.attach(_page_scroll)
	_page.resized.connect(func() -> void: _fit_height.call_deferred())
	_body.add_child(_page_scroll)

	_fill_shelf()
	_fill_page()
	_fill_foot()


func _fill_shelf() -> void:
	for old in _list.get_children():
		old.queue_free()
	var lifetime := _lifetime()
	var open := Content.unlocked_count(lifetime)
	# La meme regle que la pastille NEW de l'icone STORY (page.tsx
	# `freshChapter`), pour que le chapitre promis par la pastille soit celui
	# marque NEW sur l'etagere.
	var fresh := open > 0 and lifetime - float(Content.LORE[open - 1]["unlockAt"]) < FRESH_WINDOW
	for i in Content.LORE.size():
		var chapter: Dictionary = Content.LORE[i]
		var locked := lifetime < float(chapter["unlockAt"])
		var words := Content.lore_chapter(chapter)
		var tab := ChapterTab.new(i, String(chapter["numeral"]),
			I18N.f("codex.chapterN", [i + 1]) if locked else String(words["title"]),
			I18N.f("codex.carrotsAt", [I18N.group_digits(float(chapter["unlockAt"]))]) if locked else String(words["teaser"]),
			locked, fresh and i == open - 1, i == _selected, _stacked)
		tab.picked.connect(_select)
		_list.add_child(tab)


func _fill_page() -> void:
	for old in _page.get_children():
		old.queue_free()
	var lifetime := _lifetime()
	var chapter: Dictionary = Content.LORE[_selected]
	var words := Content.lore_chapter(chapter)
	var locked := lifetime < float(chapter["unlockAt"])

	var title := Kit.label(String(words["title"]), 18, Palette.INK)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_page.add_child(title)
	_page.add_child(_gap(10))

	if locked:
		_page.add_child(_para(String(words["teaser"]), Palette.BARK))
		_page.add_child(_para(I18N.f("codex.sealed",
			[I18N.group_digits(float(chapter["unlockAt"])), I18N.group_digits(lifetime)]), Palette.BARK))
	else:
		for para in words["body"]:
			_page.add_child(_para(String(para), Palette.INK))


## Un paragraphe de prose : la face pixel est proportionnelle mais reste une
## face pixel — elle veut une ligne genereuse (1.75) et une mesure courte,
## ou l'oeil perd la ligne ou il etait. 12px sous chacun.
func _para(text: String, ink: Color) -> Control:
	var box := Kit.vbox(0)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var l := Kit.note(text, ink, PARA_SIZE)
	l.add_theme_constant_override("line_spacing", PARA_LEAD)
	box.add_child(l)
	box.add_child(_gap(12))
	return box


func _gap(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


## LE PIED : un filet, puis la ligne « prochain chapitre dans N carottes »
## et sa note, ou la ligne de fin en sceau.
func _fill_foot() -> void:
	for old in _foot.get_children():
		old.queue_free()
	var rule := ColorRect.new()
	rule.color = RULE
	rule.custom_minimum_size = Vector2(0, 2)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_foot.add_child(rule)
	_foot.add_child(_gap(FOOT_PAD - 3.0))
	var next := Content.next_chapter(_lifetime())
	if next.is_empty():
		_foot.add_child(Kit.note(I18N.t("codex.done"), SEAL, 12))
	else:
		_foot.add_child(Kit.note(I18N.f("codex.nextIn", [I18N.group_digits(float(next["remaining"]))]), Palette.BARK, 12))
		_foot.add_child(Kit.note(I18N.t("codex.lifetimeOnly"), Palette.BARK, 11))


func _select(index: int) -> void:
	if index == _selected:
		return
	_selected = index
	_fill_shelf()
	_fill_page()
	_page_scroll.scroll_vertical = 0
	_fit_height.call_deferred()
	_note_read()


## Un chapitre DEBLOQUE est sur la page : la marque part, a l'ouverture et a
## chaque changement de chapitre.
func _note_read() -> void:
	if not read_marks:
		return
	var chapter: Dictionary = Content.LORE[_selected]
	if _lifetime() >= float(chapter["unlockAt"]):
		Home.mark_quest(Content.codex_mark(String(chapter["id"])))


# ── Une ligne de l'etagere ───────────────────────────────────────────────────

## UN CHAPITRE SUR L'ETAGERE : le disque du numeral, le titre, son etat. Pas
## une carte : l'etagere est une liste sur la meme feuille que la page a
## cote. Empilee, il ne reste que le disque.
class ChapterTab extends PanelContainer:
	signal picked(index: int)

	var index := 0
	var _active := false
	var _locked := false
	var _rest: StyleBox
	var _hover: StyleBox
	var _on: StyleBox

	func _init(i: int, numeral: String, title: String, sub: String,
			locked: bool, fresh: bool, active: bool, stacked: bool) -> void:
		index = i
		_active = active
		_locked = locked
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var pad_x := 4.0 if stacked else ROW_PAD_X
		var pad_y := 4.0 if stacked else ROW_PAD_Y
		_rest = _style(Color.TRANSPARENT, pad_x, pad_y)
		_hover = _style(LOCK if locked else ROW_HOVER, pad_x, pad_y)
		_on = _style(ROW_ACTIVE, pad_x, pad_y, true)
		add_theme_stylebox_override("panel", _on if active else _rest)
		mouse_entered.connect(func() -> void:
			if not _active:
				add_theme_stylebox_override("panel", _hover))
		mouse_exited.connect(func() -> void:
			if not _active:
				add_theme_stylebox_override("panel", _rest))

		var row := Kit.hbox(ROW_GAP)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(row)

		# Le numeral est un libelle court sur un disque — le cas de
		# BitmapText. Carre, comme chaque bord de l'art de ce jeu.
		var disc := Kit.panel(_disc(LOCK if locked else SEAL))
		disc.custom_minimum_size = Vector2(DISC, DISC)
		disc.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var num := Kit.label(numeral, Kit.pixel_size(1.0), LIT)
		num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		num.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		disc.add_child(num)
		row.add_child(disc)
		if stacked:
			return

		var text := Kit.vbox(2)
		text.mouse_filter = Control.MOUSE_FILTER_IGNORE
		text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(text)
		var head := Kit.hbox(6)
		head.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var t := Kit.label(title, 13, Palette.BARK if locked else Palette.INK)
		if stacked:
			# L'etagere couchee a des onglets etroits : une ligne, coupee.
			t.clip_text = true
			t.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		else:
			# LE TITRE PASSE A LA LIGNE, comme sur le web (« The Island That
			# / Gives NEW ») : coupe, le premier chapitre se lisait « The
			# Island T... » — le titre du chapitre qu'on vient d'ouvrir.
			t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(t)
		if fresh:
			var tag := Kit.panel(_new_tag())
			tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
			tag.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			tag.add_child(Kit.label(I18N.t("codex.isNew"), 9, NEW_INK))
			head.add_child(tag)
		text.add_child(head)
		# Les accroches tiennent sur une ligne ; le chapitre porte la prose.
		var s := Kit.label(sub, 11, Palette.BARK)
		s.clip_text = true
		s.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		text.add_child(s)

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			accept_event()
			picked.emit(index)

	## Le fond d'une ligne ; le chapitre ouvert porte un filet de 3px sur sa
	## tranche (`inset 3px 0 0 #975528`).
	static func _style(bg: Color, pad_x: float, pad_y: float, spine: bool = false) -> StyleBoxFlat:
		var s := StyleBoxFlat.new()
		s.bg_color = bg
		s.content_margin_left = pad_x
		s.content_margin_right = pad_x
		s.content_margin_top = pad_y
		s.content_margin_bottom = pad_y
		if spine:
			s.border_width_left = int(SPINE)
			s.border_color = SEAL
		return s

	static func _disc(bg: Color) -> StyleBoxFlat:
		var s := StyleBoxFlat.new()
		s.bg_color = bg
		s.set_content_margin_all(0)
		return s

	static func _new_tag() -> StyleBoxFlat:
		var s := StyleBoxFlat.new()
		s.bg_color = Palette.BAD_ON_NIGHT
		s.set_corner_radius_all(4)
		s.content_margin_left = 4
		s.content_margin_right = 4
		s.content_margin_top = 1
		s.content_margin_bottom = 1
		return s
