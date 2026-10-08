extends "res://scripts/bench/dialogs_bench.gd"
## Offline interaction and layout checks for the camp menu.
## Godot --path godot scenes/bench/profile_camp_bench.tscn --
##   --size=890x400 --ui-scale=1 --lang=fr --out=/private/tmp/camp-phone

var _profile: Profile
var _failures := 0
var _out := "/private/tmp/rr-camp-check"


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			_out = arg.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out)
	DeskScale.follow(get_window())
	DevShot.arm(self)
	Home.player = {"avatar": "brown", "level": 6, "solo": false}
	_profile = Profile.new()
	_profile._offline = true
	_profile.show_player({"id": "guest:camp-bench", "name": "BitterEars99", "guest": true, "avatar": "brown"})
	_profile.show_history(_fake_history())
	add_child(_profile)
	await _settle()
	_place(_profile)
	await _settle()
	var outer := _profile.get_rect()
	_check_layout()
	_check(_profile._tab_badge.visible, "unread badge survives opening profile")
	_check(get_viewport_rect().encloses(_profile._leave_button.get_global_rect()), "guest departure visible without scrolling")
	await _shot("profile")

	await _tap(_profile.find_child("Rabbit_white", true, false))
	_check(Look.of(_profile._player) == "white", "rabbit choice updates player")
	_check(_profile._portrait.texture.atlas == Look.sheet("white"), "portrait follows chosen rabbit")
	_profile._name_edit.text = "x"
	_profile._name_edit.text_changed.emit("x")
	_check(_profile._save_button.disabled and _profile._warn.visible, "invalid name cannot save")
	_profile._name_edit.text = "CampRabbit"
	_profile._name_edit.text_changed.emit("CampRabbit")
	_check(not _profile._save_button.disabled and not _profile._warn.visible, "valid changed name can save")

	await _tap(_profile.find_child("HistoryTab", true, false))
	_check(_profile._tab == Profile.Tab.HISTORY, "history tab responds to pointer")
	_check(not _profile._tab_badge.visible and _profile._unseen() == 0, "history marks unseen raids read")
	_check(_profile.get_rect() == outer, "history keeps panel size")
	_check_layout()
	_check(_profile.find_children("Revenge", "Button", true, false).size() == 2, "only unsettled incoming raids offer revenge")
	await _shot("history-populated")
	if is_instance_valid(_profile._scroll):
		_profile._scroll.scroll_vertical = int(_profile._scroll.get_v_scroll_bar().max_value)
	await _settle()
	await _shot("history-bottom")

	await _tap(_profile.find_child("SettingsTab", true, false))
	_check(_profile._tab == Profile.Tab.SETTINGS, "settings tab responds to pointer")
	_check(_profile.get_rect() == outer, "settings keeps panel size")
	_check_layout()
	var settings := _profile._page.get_node("Settings") as SettingsPane
	var was_muted := AudioSettings.music_muted
	await _tap(settings._music)
	_check(AudioSettings.music_muted != was_muted, "music switch toggles audio state")
	await _tap(settings._music)
	_check(AudioSettings.music_muted == was_muted, "music toggle restores previous preference")
	await _shot("settings")

	await _tap(_profile.find_child("ProfileTab", true, false))
	await _tap(_profile.find_child("Rabbit_solana", true, false))
	_check(_profile._skin_detail, "locked rabbit opens skin offer")
	await _shot("skin-offer")
	await _tap(_profile.find_child("BackToRabbits", true, false))
	_check(not _profile._skin_detail and _profile._tab_row.visible, "skin offer returns to profile")
	await _tap(_profile._leave_button)
	_check(_profile._confirming_abandon and is_instance_valid(_profile), "first abandon press only asks confirmation")
	await _shot("abandon-confirmation")

	# Sparse history matches the screenshot used for the design, without fake filler.
	var now := int(Time.get_unix_time_from_system())
	_profile.show_history({"days": [{"day": Time.get_date_string_from_system(), "carrots": 141}, {"day": "2026-10-02", "carrots": 564}], "purchases": [], "raids": {"against": [], "by": [{"id": "one", "kind": "burrow", "direction": "by", "otherId": "lucky", "otherName": "LuckyClover", "carrotsLooted": 880, "createdAt": Time.get_datetime_string_from_unix_time(now - 6 * 86400)}], "unseen": 0}})
	_profile._show_tab(Profile.Tab.HISTORY)
	await _settle()
	var bars := _profile.find_children("HarvestBar", "ProgressBar", true, false)
	_check(bars.size() == 2 and is_equal_approx(bars[0].value / bars[0].max_value, 0.25), "harvest bars encode true proportions")
	_check_layout()
	await _shot("history")
	_profile.show_history({"days": [], "purchases": [], "raids": {}})
	await _settle()
	await _shot("history-empty")
	_profile._history_failed = true
	_profile._show_tab(Profile.Tab.HISTORY)
	await _settle()
	await _shot("history-error")
	_profile._history_failed = false
	_profile._history = {}
	_profile._show_tab(Profile.Tab.HISTORY)
	await _settle()
	await _shot("history-loading")

	_profile.show_player({"id": "account:camp-bench", "name": "BitterEars99", "guest": false, "avatar": "gray", "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"})
	_profile._show_tab(Profile.Tab.PROFILE)
	await _settle()
	_check_layout()
	await _shot("account")
	var closed := [false]
	_profile.closed.connect(func() -> void: closed[0] = true)
	await _tap(_profile.close_button)
	_check(closed[0], "close button emits close request")
	print("[camp] ", "PASS" if _failures == 0 else "FAIL", " failures=", _failures, " viewport=", get_viewport_rect().size)
	get_tree().quit(0 if _failures == 0 else 1)


func _check_layout() -> void:
	for label in _profile._tab_labels:
		var width := label.get_theme_font("font").get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, label.get_theme_font_size("font_size")).x
		_check(width <= label.size.x + 1, "navigation label fits: " + label.text)
	_check(get_viewport_rect().encloses(_profile.get_rect()), "menu fits viewport")


func _tap(control: Control) -> void:
	_check(is_instance_valid(control), "pointer target exists")
	if not is_instance_valid(control):
		return
	var at := control.get_global_rect().get_center()
	# Survol, appui et relache dans la MEME frame : push_input est
	# synchrone, et la vraie souris posee sur la fenetre ne peut plus glisser
	# un mouvement entre les deux (le bouton croyait alors qu'on l'avait
	# quitte, et le tap tombait dans le vide une fois sur deux).
	var move := InputEventMouseMotion.new()
	move.position = at
	move.global_position = at
	get_viewport().push_input(move)
	for down in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
		event.position = at
		event.global_position = at
		event.pressed = down
		get_viewport().push_input(event)
	await _settle()


func _settle() -> void:
	for i in 6:
		await get_tree().process_frame


func _shot(which: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(_out.path_join(which + ".png"))


func _check(ok: bool, message: String) -> void:
	if not ok:
		_failures += 1
		push_error("[camp] " + message)
