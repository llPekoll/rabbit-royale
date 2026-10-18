class_name EmailDialog
extends Dialog
## « CONNEXION PAR EMAIL » (2026-10-08) — l'adresse, puis le code a 6
## chiffres recu par mail (lib/auth/email-code.ts).
##
## UN CODE ET PAS UN LIEN : sur un telephone le mail s'ouvre dans une autre
## app, un lien atterrirait dans le navigateur et pas dans le jeu. On lit six
## chiffres, on revient, on les tape.
##
## DEUX ETATS DANS LE MEME CADRE : demander l'adresse, puis le code. Le
## second garde un lien « changer d'adresse » qui ramene au premier — une
## faute de frappe ne doit pas obliger a fermer et rouvrir.
##
## `link` : le code attache l'adresse au joueur connecte (un invite qui sauve
## son terrier, depuis le profil) au lieu de connecter.
##
## DEUX HOTES, comme le consentement (consent_dialog.gd) : a l'accueil il n'y a
## pas de chrome, `ask_on(title)` pose son propre voile ; en jeu
## `Chrome.current.open`.

## Fini : `ok` vrai quand la session a ete adoptee (connexion ou liaison).
signal done(ok: bool)

const WIDTH := 400.0
const BUTTON_H := 44.0

var _link := false
var _hosted := false
var _email := ""
var _working := false
## Le second etat : on attend le code, plus l'adresse.
var _code_step := false

var _ask: Label
var _field: LineEdit
var _error: Label
var _go: PlankButton
var _other: LinkButton


func _init(link := false) -> void:
	super(I18N.t("auth.emailTitle"), WIDTH, 0.0)
	_link = link


func _ready() -> void:
	ink_title()
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	_ask = Kit.note("", Palette.INK, 12)
	body.add_child(_ask)

	_field = LineEdit.new()
	_field.custom_minimum_size = Vector2(0.0, BUTTON_H)
	_field.add_theme_stylebox_override("normal", Kit.style_well())
	_field.add_theme_stylebox_override("focus", Kit.style_well(true))
	_field.add_theme_color_override("font_color", Palette.CREAM)
	_field.add_theme_color_override("caret_color", Palette.CREAM)
	_field.add_theme_color_override("font_placeholder_color", Palette.CHALK_DIM)
	_field.text_submitted.connect(func(_t: String) -> void: _on_go())
	body.add_child(_field)

	_error = Kit.note("", Palette.BAD_ON_PARCHMENT, 11)
	_error.visible = false
	body.add_child(_error)

	_other = LinkButton.new()
	_other.text = I18N.t("auth.otherEmail")
	_other.underline = LinkButton.UNDERLINE_MODE_ALWAYS
	_other.focus_mode = Control.FOCUS_NONE
	_other.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_other.add_theme_font_size_override("font_size", 11)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		_other.add_theme_color_override(state, Palette.BARK)
	_other.pressed.connect(_show_address)
	body.add_child(_other)

	_go = Kit.button("", "gold", 0.0, BUTTON_H)
	_go.pressed.connect(_on_go)
	add_footer(_go)
	_show_address()


## L'ETAT 1 : l'adresse.
func _show_address() -> void:
	_code_step = false
	_ask.text = I18N.t("auth.emailAsk")
	_field.text = _email
	_field.placeholder_text = I18N.t("auth.emailHint")
	_field.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_EMAIL_ADDRESS
	_field.max_length = 254
	_other.visible = false
	_say("")
	_relabel()
	_field.grab_focus.call_deferred()


## L'ETAT 2 : le code, l'adresse rappelee au-dessus.
func _show_code() -> void:
	_code_step = true
	_ask.text = I18N.f("auth.codeSent", [_email])
	_field.text = ""
	_field.placeholder_text = I18N.t("auth.codeHint")
	_field.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	_field.max_length = 6
	_other.visible = true
	_say("")
	_relabel()
	_field.grab_focus.call_deferred()



func _relabel() -> void:
	var words := I18N.t("auth.verifyCode" if _code_step else "auth.sendCode")
	_go.relabel(I18N.shout(I18N.t("auth.connecting") if _working else words))
	_go.disabled = _working


func _say(text: String) -> void:
	_error.text = text
	_error.visible = not text.is_empty()


func _on_go() -> void:
	if _working:
		return
	var typed := _field.text.strip_edges()
	if typed.is_empty():
		return
	_working = true
	_say("")
	_relabel()
	var why := ""
	if _code_step:
		why = await Session.verify_email_code(_email, typed)
	else:
		_email = typed.to_lower()
		why = await Session.send_email_code(_email, _link)
	if not is_inside_tree():
		return
	_working = false
	if not why.is_empty():
		_say(why)
		_relabel()
		return
	if _code_step:
		done.emit(true)
		closed.emit()
	else:
		_show_code()


func close_requested() -> void:
	done.emit(false)
	closed.emit()


## EN JEU (le profil) : sur le chrome.
static func open(link := false) -> EmailDialog:
	var dialog := EmailDialog.new(link)
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


## SUR L'ACCUEIL, qui n'a pas de chrome : un voile a nous, le dialogue centre
## dessus, les deux partent ensemble (meme montage que ConsentDialog.ask_on).
## Un tap sur le voile ferme, comme le [x].
static func ask_on(host: Control) -> EmailDialog:
	var layer := Control.new()
	layer.name = "EmailLayer"
	layer.z_index = 200
	layer.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(layer)
	var scrim := ColorRect.new()
	scrim.color = Palette.SCRIM
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(scrim)
	layer.add_child(scrim)
	var dialog := EmailDialog.new(false)
	dialog._hosted = true
	scrim.gui_input.connect(dialog._on_scrim_input)
	layer.add_child(dialog)
	host.add_child(layer)
	layer.modulate.a = 0.0
	layer.create_tween().tween_property(layer, "modulate:a", 1.0, 0.14)
	return dialog


func _on_scrim_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and not _working:
		close_requested()


func _enter_tree() -> void:
	if not _hosted:
		return
	if not get_viewport().size_changed.is_connected(_center_on_host):
		get_viewport().size_changed.connect(_center_on_host)
		minimum_size_changed.connect(_center_on_host)
		closed.connect(_drop_host)
	_center_on_host.call_deferred()


## La regle du chrome (`_center_dialog`), comme ConsentDialog.
func _center_on_host() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var want := get_combined_minimum_size()
	size = Vector2(minf(want.x, view.x - 2.0 * Kit.EDGE), minf(want.y, view.y - 2.0 * Kit.EDGE))
	position = ((view - size) * 0.5).floor().max(Vector2(Kit.EDGE, Kit.EDGE))


func _drop_host() -> void:
	get_parent().queue_free()
