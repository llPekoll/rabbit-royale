class_name BurrowTour
extends CanvasLayer
## LA VISITE DU TERRIER (2026-10-13, « 4 VISITE, on reste la-dessus »). La
## ou le joueur arrive apres le tuto, il faut qu'il capte tout : Shiro
## (calme) montre chaque chose une a une, le reste dans l'ombre ; Kuro
## (agite) prend BURY et RAID — le danger et la revanche sont a lui. Sept
## pas, SUIVANT ou la croix, puis l'ecran normal.
##
## UNE FOIS PAR JOUEUR, retenue dans user://tour.cfg comme le tuto
## (island.gd `TUTORIAL_PATH`). `-- --tour` la rejoue, `-- --tour=N` a son
## pas N (captures).
##
## L'OMBRE EN QUATRE BANDES autour de la chose montree : elle arrete les
## tapes, la chose reste vivante. Au-dessus de tout (calque 100), chrome
## compris. Chaque pas relit son rectangle au moment de se dessiner : les
## pieces viennent d'entrer (UiEntrance), ou ont bouge.
##
## Un pas est {rect: Callable -> Rect2, who, title, why}. Un pas dont la
## chose n'est pas a l'ecran (rectangle vide) est saute.

const PATH := "user://tour.cfg"
const LAYER := 100
const SHADE := Color(0.02, 0.03, 0.06, 0.62)
const RIM := Color("#ffd138")
const CARD_W := 250.0
## L'attente avant le premier pas : que l'entree des pieces soit finie.
const SETTLE_SECONDS := 1.2

var steps: Array[Dictionary] = []
var _at := 0
var _root: Control


static func seen() -> bool:
	for arg in OS.get_cmdline_user_args():
		if arg == "--tour" or arg.begins_with("--tour="):
			return false
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return false
	return bool(cfg.get_value("tour", _player_id(), false))


static func _mark_seen() -> void:
	var cfg := ConfigFile.new()
	cfg.load(PATH)
	cfg.set_value("tour", _player_id(), true)
	cfg.save(PATH)


static func _player_id() -> String:
	return String(Session.player.get("id", "guest"))


func _ready() -> void:
	layer = LAYER
	# `-- --tour=N` : la visite a son pas N, pour une capture.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--tour="):
			_at = int(arg.trim_prefix("--tour="))
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(_root)
	add_child(_root)
	get_viewport().size_changed.connect(_draw_step)
	await get_tree().create_timer(SETTLE_SECONDS).timeout
	# PAS PAR-DESSUS UN DIALOGUE (quoi de neuf, un niveau gagne) : la visite
	# attend qu'on l'ait ferme.
	while is_inside_tree() and Chrome.current != null and Chrome.current.dialog_open():
		await get_tree().create_timer(0.5).timeout
	_draw_step()


func _visible_steps() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for st in steps:
		var r: Rect2 = (st.rect as Callable).call()
		if r.has_area():
			out.append(st)
	return out


func _draw_step() -> void:
	if not is_inside_tree():
		return
	for c in _root.get_children():
		c.queue_free()
	var shown := _visible_steps()
	if _at >= shown.size():
		_finish()
		return
	var step: Dictionary = shown[_at]
	var hole: Rect2 = ((step.rect as Callable).call() as Rect2).grow(6.0)
	# Au pixel pres : deux bandes qui se chevauchent d'une fraction tracent
	# une ligne plus sombre sur tout l'ecran.
	hole = Rect2(hole.position.round(), hole.size.round())
	var view := _root.get_viewport_rect().size
	for r in [Rect2(0, 0, view.x, hole.position.y), Rect2(0, hole.end.y, view.x, view.y - hole.end.y),
			Rect2(0, hole.position.y, hole.position.x, hole.size.y),
			Rect2(hole.end.x, hole.position.y, view.x - hole.end.x, hole.size.y)]:
		var shade := ColorRect.new()
		shade.color = SHADE
		shade.mouse_filter = Control.MOUSE_FILTER_STOP
		shade.position = r.position
		shade.size = r.size
		_root.add_child(shade)
	var rim := Panel.new()
	var rs := StyleBoxFlat.new()
	rs.bg_color = Color.TRANSPARENT
	rs.border_color = RIM
	rs.set_border_width_all(2)
	rs.set_corner_radius_all(8)
	rim.add_theme_stylebox_override("panel", rs)
	rim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rim.position = hole.position
	rim.size = hole.size
	_root.add_child(rim)

	var last := _at == shown.size() - 1
	var kuro := String(step.who) == "KURO"
	var card := _card("%s  ·  %s" % [step.who, step.title], String(step.why),
		I18N.t("tour.gotIt") if last else I18N.f("tour.next", [_at + 1, shown.size()]),
		"carrot" if kuro else "green")
	_root.add_child(card)
	card.reset_size()
	var cs := card.get_combined_minimum_size()
	# Sous la chose si elle est en haut, au-dessus sinon ; dans l'ecran.
	var inset := Kit.screen_inset().x
	var y := hole.end.y + 8.0 if hole.get_center().y < view.y * 0.5 else hole.position.y - cs.y - 8.0
	var x := clampf(hole.get_center().x - cs.x * 0.5, inset, view.x - inset - cs.x)
	card.position = Vector2(roundf(x), clampf(roundf(y), Kit.EDGE, view.y - cs.y - Kit.EDGE))


func _next() -> void:
	_at += 1
	_draw_step()


func _finish() -> void:
	Analytics.track("burrow_tour", {"step": _at})
	_mark_seen()
	queue_free()


## LA CARTE DU MOMENT (le style retenu au banc) : qui parle et de quoi, la
## phrase, un bouton ; la croix ferme la visite.
func _card(title_text: String, why: String, verb: String, tone: String) -> PanelContainer:
	var s := Kit.style_caption()
	s.content_margin_left = 8
	s.content_margin_right = 8
	s.content_margin_top = 6
	s.content_margin_bottom = 8
	s.set_corner_radius_all(10)
	s.border_color = RIM
	s.set_border_width_all(1)
	var card := Kit.panel(s)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	var col := Kit.vbox(4)
	card.add_child(col)
	var head := Kit.hbox(4)
	col.add_child(head)
	var title := Kit.label(title_text, 11, RIM)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	head.add_child(title)
	var x := Button.new()
	x.flat = true
	x.focus_mode = Control.FOCUS_NONE
	x.text = "×"
	x.add_theme_font_size_override("font_size", 14)
	x.add_theme_color_override("font_color", Palette.CREAM)
	x.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	x.custom_minimum_size = Vector2(16, 14)
	x.pressed.connect(_finish)
	head.add_child(x)
	var line := Kit.label(why, 9, Palette.CREAM)
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	line.custom_minimum_size.x = CARD_W - 16.0
	col.add_child(line)
	var slab := HubSlab.new(tone, 26.0)
	slab.add_word(verb, 11)
	slab.set_lit(true)
	slab.pressed.connect(_next)
	col.add_child(slab)
	card.custom_minimum_size.x = CARD_W
	return card
