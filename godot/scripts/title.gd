extends Control
## THE DOORSTEP — the first screen, and for now the only one.
##
## Ported from the web client's sign-in screen (src/app/page.tsx `.rr-empty`,
## components/logo-banner.tsx, components/language-select.tsx), keeping the
## arrangement those files argue for:
##
##   • the emblem is the MASTHEAD, at the top of the screen, sized in whole
##     multiples of its 96x106 artwork — never a percentage. It is pixel art: at
##     a fractional scale some source pixels land on two device pixels and their
##     neighbours on one, and the bevel visibly thickens on one letter and not
##     the next.
##   • the subtitle is written INTO the emblem's own lettered ribbon, in the box
##     measured off the file.
##   • the tagline reads under it, one phrase at a time on a timer, and a reroll
##     never lands on the phrase already showing.
##   • the ask sits at the BOTTOM — thumb reach — with the wallet leading and the
##     guest run under it. The wallet is the front door.
##   • the language picker is a line below both, because someone who cannot read
##     the buttons has to fix that BEFORE being asked to connect a wallet.
##
## The two buttons do not sign anybody in yet: there is no wallet bridge and no
## session in this project. They report what they would do, which is the point
## of a first screen.

## The artwork's own pixels, and the ribbon's writable interior as measured off
## the file in the web client (x 17..79, y 93..97 of 96x106).
const LOGO_W := 96
const LOGO_H := 106
const RIBBON := Rect2(17.0 / LOGO_W, 93.0 / LOGO_H, (79.0 - 17.0) / LOGO_W, (98.0 - 93.0) / LOGO_H)

## The type size in the ribbon, in SOURCE pixels, scaled by the same integer as
## the artwork so it stays glued to the scroll at every step. 4 and not 5: at 5
## the longest subtitle overran the scalloped end folds.
const RIBBON_CELL := 4

## Three, not "as many as fit". At 4x the emblem is 424px tall and eats the
## screen; at 3x it reads as the title of the screen.
const MAX_SCALE := 3

## The share of the viewport height the emblem may claim. It sits at the top
## with the ask below, so on a short landscape phone its size is bounded by the
## viewport rather than by the column's width alone.
const MAX_VH := 0.30

## How long a phrase holds before the next fades in — long enough to read a
## fifty-character line twice over without it feeling like a slideshow.
const TAGLINE_SECONDS := 6.0

const FADE_SECONDS := 0.6

@onready var _logo: TextureRect = %Logo
@onready var _ribbon: Label = %Ribbon
@onready var _logo_stack: Control = %LogoStack
@onready var _tagline: Label = %Tagline
@onready var _connect: PxButton = %Connect
@onready var _guest: PxButton = %Guest
@onready var _lang: OptionButton = %Language
@onready var _status: Label = %Status
@onready var _tagline_timer: Timer = %TaglineTimer


var _phrase := ""
var _scale := 1


func _ready() -> void:
	_fill_languages()
	_apply_language()
	I18N.locale_changed.connect(_on_locale_changed)

	_connect.pressed.connect(_on_connect)
	_guest.pressed.connect(_on_guest)
	_lang.item_selected.connect(_on_language_picked)

	_tagline_timer.wait_time = TAGLINE_SECONDS
	_tagline_timer.timeout.connect(_roll_tagline)
	_tagline_timer.start()

	# The phrase is rolled rather than seeded from index 0, so two launches in a
	# row do not open on the same line.
	randomize()
	_roll_tagline()

	get_viewport().size_changed.connect(_measure)
	_measure()

	# A refusal reported from anywhere in the sign-in flow lands on the one
	# status line, so neither door has to know how the other failed.
	Session.failed.connect(func(message: String) -> void: _say(message, true))
	_refresh_doors()

	# A STORED SESSION IS CHECKED BEFORE THE DOORS ARE OFFERED. Both are
	# disabled while it is in flight: a player who presses "guest" during the
	# check gets a SECOND burrow on top of the one being restored, which is the
	# one mistake here that loses somebody's progress.
	_busy(true)
	if await Session.restore():
		_enter()
	_busy(false)
	_refresh_doors()


## The largest whole multiple of the artwork that fits the space we are given —
## bounded by the column's width AND by the viewport's height.
func _measure() -> void:
	var view := get_viewport_rect().size
	var by_width := int(view.x / float(LOGO_W))
	var by_height := int((view.y * MAX_VH) / float(LOGO_H))
	_scale = maxi(1, mini(MAX_SCALE, mini(by_width, by_height)))

	var box := Vector2(LOGO_W * _scale, LOGO_H * _scale)
	_logo_stack.custom_minimum_size = box
	_logo.custom_minimum_size = box

	# The ribbon's box in the emblem's own percentages, so the subtitle stays
	# glued to the scroll at 1x, 2x and 3x alike.
	_ribbon.position = Vector2(RIBBON.position.x * box.x, RIBBON.position.y * box.y)
	_ribbon.size = Vector2(RIBBON.size.x * box.x, RIBBON.size.y * box.y)
	_ribbon.add_theme_font_size_override("font_size", RIBBON_CELL * _scale)


## A phrase that is not the one already showing, so a reroll always changes.
## Ported from src/config/taglines.ts — the rule the web client's two surfaces
## both rely on.
func _roll_tagline() -> void:
	var list := I18N.taglines()
	if list.is_empty():
		return
	var pool := list.filter(func(line): return line != _phrase)
	if pool.is_empty():
		pool = list
	_phrase = pool[randi() % pool.size()]
	_tagline.text = _phrase

	# Remounted rather than crossfaded: the web version keys the node on the
	# phrase so the fade-in plays again on every swap instead of only once.
	_tagline.modulate.a = 0.0
	var fade := create_tween()
	fade.tween_property(_tagline, "modulate:a", 1.0, FADE_SECONDS).set_ease(Tween.EASE_OUT)


func _fill_languages() -> void:
	_lang.clear()
	for entry in I18N.LOCALES:
		# The flag rides INSIDE the item text, because it has to survive into
		# the closed state — which renders only the selected item's own text.
		_lang.add_item("%s %s" % [entry["flag"], entry["label"]])
	_lang.selected = I18N.locale_index(I18N.locale)


## Every label on the screen, rewritten in the language now showing.
func _apply_language() -> void:
	_apply_face()
	_connect.text = I18N.t("connect")
	_guest.text = I18N.t("guest")
	_ribbon.text = I18N.t("subtitle").to_upper()
	# NO TOOLTIP. On the web the picker carries a screen-reader-only label, and
	# porting it as `tooltip_text` put the word "Language" in the corner of the
	# phone — Godot surfaces a tooltip on touch as a floating panel, with no
	# hover to dismiss it. The flag and the language's own name in the closed
	# control already say what this is.
	_status.text = ""


## The face for the language now showing, applied to every label on the screen.
##
## Set as a per-node `font` OVERRIDE rather than by swapping this Control's
## `theme`: a theme on an ancestor does not win against the PROJECT theme, which
## already names the kit's face, so assigning one here left every label still
## drawing from the atlas. An override is the only level that beats it.
##
## `null` clears the override and lets the project theme (the kit) through
## again, which is exactly what English wants.
func _apply_face() -> void:
	var face: Font = null if I18N.pixel_face() else _fallback_face()
	for node in [_connect, _guest, _tagline, _ribbon, _status, _lang]:
		if face == null:
			node.remove_theme_font_override("font")
		else:
			node.add_theme_font_override("font", face)
	# The ribbon is sized off the artwork and the rest off the layout, so only
	# the sizes that were tuned for the 8x8 atlas are nudged: the fallback face
	# has proper lowercase and reads small at the bitmap's sizes.
	var bump := 0 if I18N.pixel_face() else 2
	_tagline.add_theme_font_size_override("font_size", 13 + bump)
	_connect.add_theme_font_size_override("font_size", 13 + bump)
	_guest.add_theme_font_size_override("font_size", 13 + bump)


## THE FACE FOR A LANGUAGE THE KIT CANNOT DRAW, asked of the PLATFORM rather
## than shipped.
##
## Godot's own fallback font is Latin-only — Chinese drew as a row of tofu boxes
## with it — and no CJK face is small enough to bundle for one screen. Every
## desktop and phone this runs on already has one, so the list below names the
## platform's faces the way the web client's `--font-fallback` CSS stack does:
## the pixel-ish ones first, so a machine that has one keeps the game's look,
## then the broad system faces that actually carry the sinograms.
##
## A NAME THAT RESOLVES IS NOT A FACE THAT WORKS. `OS.get_system_font_path`
## happily returns macOS's PingFang from a private framework and
## `load_dynamic_font` reports OK on it, but the face never loads and every
## label on the screen then draws EMPTY — worse than the tofu it replaced. So
## the candidate is asked whether it can draw the language's own script, and
## only a yes is kept.
##
## Cached per language, because that question costs a font load and the screen
## asks it on every switch.
var _face_cache: Dictionary = {}

func _fallback_face() -> Font:
	if _face_cache.has(I18N.locale):
		return _face_cache[I18N.locale]

	# One character the language cannot do without. If a face can draw this, it
	# can draw the four strings this screen needs from it.
	var probe: String = "岛" if I18N.locale == "zh" else "é"
	var code := probe.unicode_at(0)

	var chosen: Font = ThemeDB.fallback_font
	for name in ["Zpix", "Silkscreen", "DotGothic16", "Hiragino Sans GB",
			"Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", "Arial Unicode MS"]:
		var path := OS.get_system_font_path(name)
		if path.is_empty():
			continue
		var file := FontFile.new()
		if file.load_dynamic_font(path) != OK:
			continue
		# The real test. See above: OK is not enough.
		if not file.has_char(code):
			continue
		chosen = file
		break

	_face_cache[I18N.locale] = chosen
	return chosen


func _on_locale_changed(_code: String) -> void:
	# The picker follows the locale rather than only driving it: the language
	# can change from somewhere that is not this dropdown (a saved choice, or
	# the system's), and a picker that disagrees with the screen is a bug the
	# player has to resolve.
	_lang.selected = I18N.locale_index(I18N.locale)
	_apply_language()
	# The tagline is rerolled INTO the new list rather than left standing: the
	# phrase on screen belongs to the language that was showing.
	_roll_tagline()
	_tagline_timer.start()


func _on_language_picked(index: int) -> void:
	_lang.release_focus()
	I18N.set_locale(I18N.LOCALES[index]["code"])


## THE FRONT DOOR: the wallet signs the server's challenge and the session
## comes back. On a Seeker that signature is a Seed Vault gesture.
##
## Off Android there is no wallet to reach, and the button says so rather than
## opening a prompt that cannot arrive — see `_refresh_doors()`, which disables
## it before it can be pressed.
func _on_connect() -> void:
	if not Wallet.available():
		_say(I18N.t("no_wallet"), true)
		return

	_busy(true)
	_say(I18N.t("connecting"), false)

	# The address first: the challenge is minted FOR an address, so there is
	# nothing to sign until the wallet has named one.
	var address := await Wallet.address()
	if address.is_empty():
		# A closed wallet sheet is a refusal, not a failure. The only thing to
		# report is a real error, if the plugin left one behind.
		_say(Wallet.last_error, not Wallet.last_error.is_empty())
		_busy(false)
		return

	# A guest who is already playing LINKS instead of signing in, so the burrow
	# they have been digging survives getting a wallet. Signing in afresh would
	# hand them a different account and silently abandon it.
	var linking := Session.signed_in() and bool(Session.player.get("guest", false))
	var signer := func(message: String) -> String: return await Wallet.sign(message)
	# Spelled out rather than an `await (a if c else b)`: awaiting the RESULT of
	# a ternary makes GDScript resolve the branches before the await, and it
	# rejects both as un-awaited coroutines.
	var ok := false
	if linking:
		ok = await Session.link_wallet(address, signer)
	else:
		ok = await Session.sign_in_with_wallet(address, signer)

	_busy(false)
	if ok:
		_enter()


## THE SECOND DOOR: a burrow with no wallet at all, so someone who has never
## held one can press play. The session is an ordinary one, and the wallet can
## still be attached later to this very account.
func _on_guest() -> void:
	_busy(true)
	_say(I18N.t("connecting"), false)
	var ok := await Session.play_as_guest()
	_busy(false)
	if ok:
		_enter()


## Signed in. There is no second screen in this project yet, so the doorstep
## says who came in rather than pretending to move — the next screen lands
## here, and until it does an honest dead end beats a fake transition.
func _enter() -> void:
	var name := String(Session.player.get("name", "?"))
	_say("Welcome back, %s" % name, false)


## A wallet button that cannot work is disabled, not hidden: on a desktop run
## the doorstep should still show what the phone offers, and a greyed slab says
## "not here" where a missing one says "not a thing".
func _refresh_doors() -> void:
	_connect.disabled = not Wallet.available()


## The line under the two doors. `bad` is what decides its colour: the danger
## red is for something that went wrong, and "DIGGING IN..." is the game
## working — a progress line in the failure colour teaches the player to read
## red as noise, which is the one thing it must never become.
func _say(text: String, bad: bool) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color",
		Color("#ff6b6b") if bad else Color("#8b949e"))


func _busy(value: bool) -> void:
	# Releasing the wallet door goes through _refresh_doors rather than a plain
	# `false`: off Android it must stay disabled, and un-busying would otherwise
	# hand back a button with nothing behind it.
	_guest.disabled = value
	if value:
		_connect.disabled = true
	else:
		_refresh_doors()
