extends "res://scripts/bench/dialogs_bench.gd"
## Sonde locale du comptoir : aucun compte, aucune récompense réelle.
## Godot --headless --path godot scenes/bench/snack_check.tscn

var failures := 0


func _ready() -> void:
	var state := FakeSnack.new()
	SnackState.current = state
	state.fake({})
	add_child(state)
	var dialog := SnackDialog.new()
	add_child(dialog)
	dialog.size = Vector2(890, 400)
	await get_tree().process_frame
	_check(dialog._buttons.is_empty(), "loading has no claim button")
	var pack_rects: Array[Rect2] = []
	var previous_carrots := 0
	for day in range(1, 8):
		var data := _fake_snack("snack")
		data.day = day
		data.taken = day - 1
		state.fake(data)
		await get_tree().process_frame
		await get_tree().process_frame
		_check(dialog._buttons.size() == (2 if day == 7 else 1), "claim controls day %d" % day)
		for i in SnackState.PACKS.size():
			var face: Control = dialog._content.get_node(SnackState.PACKS[i])
			if day == 1:
				pack_rects.append(face.get_rect())
			else:
				_check(face.get_rect() == pack_rects[i], "pack layout unchanged on day %d" % day)
		var harvest := dialog._content.get_node_or_null("CarrotHarvest")
		if day < 7:
			_check(harvest != null, "daily carrots visible")
			var carrots := 0
			for node in harvest.get_children():
				if node is SnackDialog.FloatingItem:
					carrots += 1
			_check(carrots > previous_carrots, "larger reward displays more carrots")
			previous_carrots = carrots
		else:
			_check(harvest == null, "daily harvest removed on pack day")
		for button in dialog._buttons:
			_check(button.size.y >= 44, "touch target height")
			_check(button.get_global_rect().end.x <= 890, "button fits viewport")
		if day == 7:
			var hat := dialog._content.get_node("magic_hat/Float_lightning")
			var squid := dialog._content.get_node("magic_hat/Float_bloop")
			var before: float = hat.art.position.y
			var button_pos: Vector2 = dialog._buttons[0].position
			await get_tree().create_timer(0.2).timeout
			_check(not is_equal_approx(before, hat.art.position.y), "item floats")
			_check(not is_equal_approx(hat.art.position.y, squid.art.position.y), "items have independent phases")
			_check(dialog._buttons[0].position == button_pos, "button stays still")
			state.fail_next = true
			dialog._buttons[0].pressed.emit()
			_check(dialog._buttons[0].disabled and dialog._buttons[1].disabled, "both choices disabled during claim")
			await get_tree().create_timer(0.1).timeout
			_check(not dialog._buttons[0].disabled, "retry enabled after failure")
			dialog._buttons[1].pressed.emit()
		else:
			dialog._buttons[0].pressed.emit()
		await get_tree().create_timer(0.1).timeout
		_check(dialog._buttons.is_empty(), "no second claim after success on day %d" % day)
		_check(not dialog._last.is_empty(), "success feedback retained")
	_check(state.last_pack == "lucky_foot", "chosen pack preserved")
	_check(state.day() == 1 and state.taken() == 0, "week rollover")
	for viewport in [Vector2(640, 360), Vector2(1376, 768)]:
		dialog.custom_minimum_size = Vector2.ZERO
		dialog.size = viewport
		dialog._layout()
		_check(dialog._canvas.position.x >= 0 and dialog._canvas.position.y >= 0, "cabinet centered inside viewport")
		var end: Vector2 = dialog._canvas.position + dialog._canvas.size * dialog._canvas.scale
		_check(end.x <= viewport.x + 0.01 and end.y <= viewport.y + 0.01, "cabinet fits viewport")
	print("[snack-check] ", "PASS" if failures == 0 else "FAIL: %d" % failures)
	get_tree().quit(0 if failures == 0 else 1)


func _check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)


class FakeSnack extends SnackState:
	var fail_next := false
	var last_pack := ""

	func claim(pack: String = "") -> bool:
		if pending or not ready():
			return false
		pending = true
		await get_tree().create_timer(0.05).timeout
		pending = false
		if fail_next:
			fail_next = false
			return false
		last_pack = pack
		var old_day := day()
		var reward := {"day": old_day, "carrots": int(day_info(old_day).get("carrots", 0)), "pack": pack if not pack.is_empty() else null}
		var next := state.duplicate(true)
		next.day = 1 if old_day == 7 else old_day + 1
		next.taken = 0 if old_day == 7 else old_day
		next.ready = false
		next.readyAt = Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 3600) + ".000Z"
		fake(next)
		claimed.emit(reward)
		return true
