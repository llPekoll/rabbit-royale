extends SceneTree
## Offline UI checks. Uses the same profile, controls, and animation atlas.
var _fails := 0


func _init() -> void:
	_run.call_deferred()


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("%s: %s" % [label, "ok" if ok else "FAILED"])


func _run() -> void:
	var bench: Node = load("res://scenes/bench/skin_bench.tscn").instantiate()
	root.add_child(bench)
	await process_frame
	await process_frame
	var state: Node = root.get_node("SkinState")
	_check("only profile and history tabs", bench.profile._tabs.size() == 2)
	_check("eight rabbits in the profile", bench.profile._rabbit_grid.get_child_count() == 8)
	var solana: Node = bench.find_child("Rabbit_solana", true, false)
	var ticket: Node = bench.find_child("Rabbit_kuro-violet", true, false)
	_check("Solana has a lock", solana.has_node("Lock"))
	_check("ticket bunny has a lock", ticket.has_node("Lock"))
	ticket.pressed.emit()
	_check("ticket bunny opens its own page", bench.profile._skin_detail and bench.find_child("TicketOnly", true, false) != null)
	_check("ticket bunny cannot be bought", bench.find_child("SkinAction", true, false) == null)
	bench.find_child("BackToRabbits", true, false).pressed.emit()
	ticket = bench.find_child("Rabbit_kuro-violet", true, false)
	solana.pressed.emit()
	var wardrobe: Node = _wardrobe(bench)
	_check("locked Solana opens purchase detail", wardrobe != null)
	if wardrobe == null:
		quit(1)
		return
	_check("real 256px atlas", wardrobe._rabbit.sprite_frames.get_frame_texture("idle", 0).atlas.get_width() == 256)
	_check("all eight idle frames", wardrobe._rabbit.sprite_frames.get_frame_count("idle") == 8)
	_check("same movement cadence as game", wardrobe._rabbit.sprite_frames.get_animation_speed("move") == 12)
	var action: Node = bench.find_child("SkinAction", true, false)
	_check("price is 0.99", action.text.contains("0.99"))
	action.pressed.emit()
	_check("first press only confirms", wardrobe._armed and not state.owns("solana"))
	action = bench.find_child("SkinAction", true, false)
	action.pressed.emit()
	_check("second press unlocks (fixture)", state.owns("solana"))
	_check("buying does not force equipment", state.catalog.get("equipped") == null)
	action = bench.find_child("SkinAction", true, false)
	_check("owned action becomes equip", action.text == root.get_node("I18N").t("skins.equip"))
	action.pressed.emit()
	_check("equip persisted to wardrobe", state.catalog.get("equipped") == "solana")
	action = bench.find_child("SkinAction", true, false)
	_check("equipped button cannot buy again", action.disabled)
	await process_frame
	await process_frame
	action = bench.find_child("SkinAction", true, false)
	_check("purchase control fits screen", root.get_visible_rect().encloses(action.get_global_rect()))
	bench.find_child("BackToRabbits", true, false).pressed.emit()
	solana = bench.find_child("Rabbit_solana", true, false)
	_check("owned Solana loses its lock", not solana.has_node("Lock"))
	bench.find_child("Rabbit_white", true, false).pressed.emit()
	_check("free fur keeps purchased ownership", state.catalog.get("equipped") == null and state.owns("solana"))
	bench.find_child("Rabbit_solana", true, false).pressed.emit()
	_check("owned rabbit equips from the same row", state.catalog.get("equipped") == "solana" and not bench.profile._skin_detail)
	state.catalog["owned"].append("kuro-violet")
	state.changed.emit()
	ticket = bench.find_child("Rabbit_kuro-violet", true, false)
	_check("ticket ownership removes its lock", not ticket.has_node("Lock"))
	ticket.pressed.emit()
	_check("ticket bunny equips independently", state.catalog.get("equipped") == "kuro-violet")
	_check("ticket uses the new recolored atlas", ticket.get_child(0).texture.atlas.resource_path.ends_with("bunny-golden-ticket.png"))
	var carrot: Node = bench.find_child("Rabbit_carrot", true, false)
	_check("Carrot starts locked", carrot.has_node("Lock"))
	carrot.pressed.emit()
	wardrobe = _wardrobe(bench)
	_check("Carrot has its own atlas", wardrobe._rabbit.sprite_frames.get_frame_texture("idle", 0).atlas.resource_path.ends_with("bunny-carrot.png"))
	action = bench.find_child("SkinAction", true, false)
	_check("Carrot costs 0.99", action.text.contains("0.99"))
	action.pressed.emit()
	bench.find_child("SkinAction", true, false).pressed.emit()
	bench.find_child("SkinAction", true, false).pressed.emit()
	_check("Carrot purchase equips only Carrot", state.owns("carrot") and state.catalog.get("equipped") == "carrot")
	bench.find_child("BackToRabbits", true, false).pressed.emit()
	_check("Carrot loses its lock", not bench.find_child("Rabbit_carrot", true, false).has_node("Lock"))
	await process_frame
	await process_frame
	var grid: Control = bench.profile._rabbit_grid
	_check("all eight choices fit screen", root.get_visible_rect().encloses(grid.get_global_rect()))
	var run: Node = load("res://scripts/run_state.gd").new()
	root.add_child(run)
	run.rabbits["test"] = {"playerId": "test", "look": "white", "skin": null}
	run._on_event("rabbit_look", {"playerId": "test", "look": "solana", "skin": "solana"})
	_check("live appearance event updates rabbit", run.rabbits["test"]["look"] == "solana")
	print("%d failure(s)" % _fails)
	quit(1 if _fails else 0)


func _wardrobe(node: Node) -> Node:
	if node.get_script() != null and node.get_script().resource_path.ends_with("skin_wardrobe.gd"):
		return node
	for child in node.get_children():
		var found := _wardrobe(child)
		if found != null:
			return found
	return null
