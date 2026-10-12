extends Control
## LE BANC DU CHANGELOG — la version au coin du terrier et QUOI DE NEUF, sur
## le vrai terrier (burrow.tscn, les quatre ilots) et sa barre du haut, sans
## compte ni reseau :
##
##   godot --path godot scenes/bench/changelog_bench.tscn
##   ... -- --state=new   --size=890x400 --shot=a.png --after=3   # version non vue (NEW)
##   ... -- --state=seen                                          # version deja vue
##   ... -- --state=modal                                         # QUOI DE NEUF, derniere version
##   ... -- --state=long                                          # tout le changelog : la coupe a 5
##   ... -- --tap                     # un vrai clic sur la version a 1 s (la modale s'ouvre)
##   ... -- --lang=fr                 # une autre langue (en, fr, zh, pt-BR, vi)
##
## Les VRAIES donnees : assets/changelog.json (tools/build-changelog.ts).
## Rien n'est ecrit dans user://changelog.cfg.
##
## Au clavier : 1 non vue, 2 vue, 3 modale, 4 longue. Taper la version ouvre
## QUOI DE NEUF ; SEE ALL ouvre dans le navigateur la page du repo
## (landing/changelog/index.html), pas le site en ligne.

const BURROW := preload("res://scenes/burrow.tscn")

var _ui: CanvasLayer
var _tag: VersionTag
var _veil: ColorRect
var _dialog: WhatsNewDialog


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	BurrowLandmarks.bench = true
	BurrowLandmarks.bench_seen = ["dig", "shop", "defend", "raid"]
	BurrowLandmarks.bench_tapped = []
	BurrowLandmarks.bench_doors.assign(["dig", "shop", "defend", "raid"])
	add_child(BURROW.instantiate())

	_ui = CanvasLayer.new()
	_ui.layer = 50
	add_child(_ui)

	Session.player = {"id": "bench", "name": "CursedRoot", "guest": true, "avatar": "orange"}
	Home.player = {"avatar": "orange", "level": 6, "solo": false}
	Home.burrow = {
		"level": 3, "stock": 1263, "lifetime": 4200, "gardenReady": 12,
		"energy": 17, "maxEnergy": Tuning.i("ENERGY.MAX"), "regenPerHour": 6,
		"yieldPerHour": 20, "gardenCeiling": 60,
	}
	var bar: TopBar = preload("res://scenes/ui/top_bar.tscn").instantiate()
	bar.preview = true
	Kit.fill(bar)
	_ui.add_child(bar)
	bar.set_rank(59, 340)
	bar.set_season_open(false)

	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--lang="):
			# Pas set_locale : il sauverait la langue du jeu sur ce poste.
			I18N.locale = arg.trim_prefix("--lang=")
			I18N.call("_apply_theme_face")
	_tag = VersionTag.new(Changelog.latest(), true)
	_tag.tapped.connect(_open.bind(false))
	_ui.add_child(_tag)

	var state := "new"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--state="):
			state = arg.trim_prefix("--state=")
	_show(state)
	if "--tap" in OS.get_cmdline_user_args():
		get_tree().create_timer(1.0).timeout.connect(_tap_tag)
	print("[bench] 1 non vue · 2 vue · 3 modale · 4 longue")
	DevShot.arm(self)


func _exit_tree() -> void:
	BurrowLandmarks.bench = false


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	match key.keycode:
		KEY_1: _show("new")
		KEY_2: _show("seen")
		KEY_3: _show("modal")
		KEY_4: _show("long")


func _show(state: String) -> void:
	_close()
	match state:
		"seen":
			_tag.unseen = false
		"modal":
			_tag.unseen = true
			_open(false)
		"long":
			_tag.unseen = true
			_open(true)
		_:
			_tag.unseen = true


## La derniere version, ou tout le changelog d'un coup (`everything`).
func _open(everything: bool) -> void:
	_close()
	_veil = ColorRect.new()
	_veil.color = Palette.SCRIM
	Kit.fill(_veil)
	_veil.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and not e.pressed:
			_dialog.closed.emit())
	_ui.add_child(_veil)
	var all := Changelog.releases()
	var d := Changelog.digest(all if everything else all.slice(0, 1))
	_dialog = WhatsNewDialog.new(d["version"], d["date"], d["items"], d["fixes"])
	_dialog.open_page = false
	_dialog.see_all.connect(_open_page)
	_dialog.closed.connect(func() -> void:
		_tag.unseen = false
		_close())
	_ui.add_child(_dialog)
	_dialog.minimum_size_changed.connect(_place)
	for i in 3:
		await get_tree().process_frame
		_place()


## Un clic de souris sur la version, par l'entree du jeu : ce que le doigt fait.
func _tap_tag() -> void:
	var at := _tag.get_global_rect().get_center()
	for pressed in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = pressed
		e.position = at
		e.global_position = at
		Input.parse_input_event(e)
		await get_tree().process_frame
	await get_tree().create_timer(0.2).timeout
	print("[bench] tap a ", at, " -> modale ", "ouverte" if _dialog != null else "FERMEE")


## Le brouillon local, a la place de rabbit.rip/changelog#<version>.
func _open_page() -> void:
	var page := ProjectSettings.globalize_path("res://").path_join("../landing/changelog/index.html").simplify_path()
	# Sans l'ancre : sur macOS, un file:// suivi de #v0.53 vise un fichier qui
	# n'existe pas, et rien ne s'ouvre (shell_open repond OK quand meme).
	var url := "file://" + page
	print("[bench] en ligne : ", _tag.page_url(), "  ici : ", url)
	OS.shell_open(url)


func _close() -> void:
	if _dialog != null and is_instance_valid(_dialog):
		_dialog.queue_free()
	if _veil != null and is_instance_valid(_veil):
		_veil.queue_free()
	_dialog = null
	_veil = null


## Centre, comme le chrome le pose (dialogs_bench `_place`).
func _place() -> void:
	if _dialog == null or not is_instance_valid(_dialog):
		return
	var view := get_viewport_rect().size
	var wanted := _dialog.get_combined_minimum_size()
	_dialog.size = Vector2(minf(wanted.x, view.x - 2.0 * Kit.EDGE), minf(wanted.y, view.y - 2.0 * Kit.EDGE))
	var at := ((view - _dialog.size) * 0.5).floor()
	at.y = maxf(at.y, Kit.EDGE)
	_dialog.position = at
