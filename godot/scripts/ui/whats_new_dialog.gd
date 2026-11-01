class_name WhatsNewDialog
extends Dialog
## QUOI DE NEUF — ce qui a change depuis la derniere visite du joueur.
##
## S'ouvre au terrier apres une mise a jour (le pack OTA, la page web
## rechargee), jamais pendant le tuto, et pas pour un nouveau joueur.
## Toutes les versions manquees sont fondues en une liste :
##   • les nouveautes et l'equilibrage d'abord, MAX_LINES au plus ;
##   • les corrections tiennent en une ligne (« + 6 fixes ») — seules, elles
##     n'ouvrent pas ce dialogue, la page web les garde.
## TOUT VOIR ouvre sol.rabbit.rip/changelog/?lang=<langue>#<version>, DISCORD le
## serveur des joueurs (Changelog.DISCORD_URL) sans fermer le dialogue.
##
## Les mots (titre, boutons, etiquettes) viennent du changelog lui-meme
## (Changelog.ui), dans les cinq langues : src/changelog/entries.ts.

signal see_all

const WIDTH := 500.0
const BUTTON_H := 40.0
const MAX_LINES := 5
## L'air laisse au-dessus et au-dessous du dialogue (TargetList.DIALOG_AIR).
const DIALOG_AIR := 27.0
## L'etiquette de chaque sorte : fond, encre. Le mot vient de Changelog.ui.
const KINDS := {
	"new": [Palette.LEAF, Palette.INK],
	"tune": [Palette.GOLD, Palette.INK],
	"fix": [Palette.BARK, Palette.CREAM],
}

var version := ""
var date := ""
## [{kind, text}], deja dans la langue du joueur.
var items: Array = []
var fixes := 0
## SEE ALL ouvre le site en ligne (VersionTag.URL). Faux dans un banc, qui
## ouvre son brouillon local a la place.
var open_page := true

## LES LIGNES DEFILENT, LE PIED RESTE (2026-11-01) : cinq longues lignes en
## francais montaient le dialogue plus haut que les 400 px du Seeker, et
## TOUT VOIR / DISCORD / JOUER sortaient de l'ecran.
var _scroll: ScrollContainer
var _list: VBoxContainer
var _fit_queued := false


func _init(v: String = "", d: String = "", list: Array = [], fix_count: int = 0) -> void:
	version = v
	date = d
	items = list
	fixes = fix_count
	super(Changelog.ui("title"), WIDTH, 0.0)


## Les versions non vues (ou, sans elles, la derniere), pretes a ouvrir.
static func from_changelog() -> WhatsNewDialog:
	var d := Changelog.digest(Changelog.unseen())
	return WhatsNewDialog.new(d["version"], d["date"], d["items"], d["fixes"])


func _ready() -> void:
	ink_title()
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)

	var stamp := "%s · %s" % [version, date] if not date.is_empty() else version
	body.add_child(Kit.note(stamp, Palette.BARK, 11))

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(_scroll)
	_list = Kit.vbox(Kit.PAD_TIGHT)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	TouchScroll.attach(_scroll)
	ScrollFade.attach(_scroll)

	var shown := 0
	var chips: Array[Control] = []
	for item in items:
		if shown >= MAX_LINES:
			break
		var row := _row(String(item.get("kind", "new")), String(item.get("text", "")))
		chips.append(row.get_child(0))
		_list.add_child(row)
		shown += 1
	# UNE COLONNE D'ETIQUETTES : toutes a la largeur de la plus longue, pour
	# que les textes partent du meme bord (CORRECTIF, CÂN BẰNG...).
	var chip_w := 0.0
	for c in chips:
		chip_w = maxf(chip_w, c.get_combined_minimum_size().x)
	for c in chips:
		c.custom_minimum_size.x = chip_w
	var more := items.size() - shown
	var tail: Array[String] = []
	if more > 0:
		tail.append(Changelog.ui("more").format([more]))
	if fixes > 0:
		tail.append(Changelog.ui("fixOne") if fixes == 1 else Changelog.ui("fixMany").format([fixes]))
	if not tail.is_empty():
		var l := Kit.note(", ".join(tail), Palette.BARK, 11)
		body.add_child(l)

	var row := Kit.hbox(Kit.PAD)
	var all := Kit.button(I18N.shout(Changelog.ui("seeAll")), "wood", 0.0, BUTTON_H)
	all.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	all.pressed.connect(func() -> void:
		see_all.emit()
		if open_page:
			OS.shell_open(VersionTag.page_url_for(version))
		closed.emit())
	# La page du changelog raconte aussi le wallet et l'USDC : pas pour le
	# monde web2 (net.gd WORLD).
	if Net.WORLD != "web2":
		row.add_child(all)
	else:
		all.queue_free()
	# Le Discord : c'est la que la mise a jour se discute (et les bugs).
	var discord := Kit.button("DISCORD", "blue", 0.0, BUTTON_H)
	discord.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	discord.pressed.connect(func() -> void:
		if open_page:
			OS.shell_open(Changelog.DISCORD_URL))
	row.add_child(discord)
	var play := Kit.button(I18N.shout(Changelog.ui("play")), "gold", 0.0, BUTTON_H)
	play.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	play.pressed.connect(func() -> void: closed.emit())
	row.add_child(play)
	add_footer(row)
	get_viewport().size_changed.connect(_queue_fit)
	_queue_fit()


## A L'IMAGE SUIVANTE, comme TargetList : les lignes viennent d'etre posees
## et ne se sont pas encore mesurees.
func _queue_fit() -> void:
	if not _fit_queued and is_inside_tree():
		_fit_queued = true
		get_tree().process_frame.connect(_fit_scroll, CONNECT_ONE_SHOT)


## Toutes les lignes si l'ecran les tient ; sinon la place qui reste, et
## elles defilent au doigt.
func _fit_scroll() -> void:
	_fit_queued = false
	if not is_inside_tree():
		return
	var want := _list.get_combined_minimum_size().y
	# Le creux tel qu'il pese MAINTENANT (bloque, il pese toutes ses lignes).
	var others := get_combined_minimum_size().y - _scroll.get_combined_minimum_size().y
	var room := get_viewport_rect().size.y - DIALOG_AIR - others
	var fits := want <= room
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED if fits \
		else ScrollContainer.SCROLL_MODE_AUTO
	var h := floorf(want if fits else maxf(60.0, room))
	if absf(_scroll.custom_minimum_size.y - h) >= 1.0:
		_scroll.custom_minimum_size.y = h


func _row(kind: String, text: String) -> HBoxContainer:
	var spec: Array = KINDS.get(kind, KINDS["new"])
	var row := Kit.hbox(Kit.PAD_TIGHT)
	var tag := chip(Changelog.ui("kinds." + kind), spec[0], spec[1], 9)
	tag.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(tag)
	row.add_child(Kit.note(text, Palette.INK, 12))
	return row


## UNE ETIQUETTE : un mot en capitales sur une pastille pleine.
static func chip(text: String, bg: Color, ink: Color, px: int) -> PanelContainer:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(4)
	s.content_margin_left = 5
	s.content_margin_right = 5
	s.content_margin_top = 1
	s.content_margin_bottom = 1
	var p := Kit.panel(s)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := Kit.label(text, px, ink)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)
	return p
