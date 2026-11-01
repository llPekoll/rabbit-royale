extends Node2D
## The real burrow + Chrome, with an in-memory shop. No account mutations.
## --verify exercises the actual dock, simulation and harvest on 890x400.
const OUT := "res://../art-source/defense-integration-20261026/"
var burrow: Node2D
var chrome: Control

func _ready() -> void:
	get_window().title = "Rabbit Royale — Défense · décor intégré"
	Session.token = ""
	Session.player = {"id": "terrain-study", "name": "Shiro"}
	I18N.locale = "fr"
	I18N._apply_theme_face()
	Home.player = {"id": "terrain-study", "level": 3}
	Home.burrow = {"level": 3, "maxLevel": 10, "stock": 300, "lifetime": 900,
		"gardenReady": 360, "gardenCapacity": 480, "gardenCeiling": 480,
		"energy": 220, "maxEnergy": 300, "yieldPerHour": 60, "runs": 4,
		"runCost": 20, "crossingCost": 20, "regenPerHour": 32, "capHours": 8,
		"boosts": {"water": {"held": 0, "activeMs": null}, "fertiliser": {"held": 0, "activeMs": null}},
		"shieldMs": null, "upgradeCost": 900, "canUpgrade": false}
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--home-level="):
			Home.burrow["level"] = clampi(int(arg.trim_prefix("--home-level=")), 1, 10)
		elif arg.begins_with("--player-level="):
			Home.player["level"] = maxi(1, int(arg.trim_prefix("--player-level=")))
	var shop := ShopState.shared()
	shop.fake([
		{"kind": "trap", "held": 5, "price": 30, "cap": 20, "canBuy": true, "hasRoom": true},
		{"kind": "fence", "held": 5, "price": 20, "cap": 20, "canBuy": true, "hasRoom": true},
	], {"held": 5, "maxPlaced": 8})
	shop.sandbox = true
	shop.fences = {"placed": [], "spans": [], "offers": [], "held": 5, "maxHeld": 10}
	# Feed the local fence offers before the burrow and Chrome read changed.
	shop.changed.connect(_sync_shop_counts)
	Screens._in_world = true
	Screens.place = Screens.Place.BURROW
	burrow = preload("res://scenes/burrow.tscn").instantiate()
	Screens._current = burrow
	add_child(burrow)
	var layout: BurrowLayout = burrow.get("_layout")
	var route := RaidRoute.cheapest(layout, [], [])
	var bombs: Array = []
	for fraction in [0.3, 0.6, 0.85]:
		var tile: int = route.path[clampi(int(route.path.size() * fraction), 1, route.path.size()-1)]
		if layout.is_trappable(tile) and not bombs.has(tile): bombs.append(tile)
	shop.traps["placed"] = bombs
	shop.traps["armed"] = bombs.duplicate()
	_sync_shop_counts()
	shop.changed.emit()
	var layer := CanvasLayer.new()
	layer.layer = 30
	add_child(layer)
	chrome = preload("res://scenes/chrome.tscn").instantiate()
	Screens._chrome = chrome
	layer.add_child(chrome)
	await get_tree().create_timer(0.4).timeout
	chrome.get("_kit").state.offline = true
	chrome.call("_feed_kit")
	chrome.call("_start_mode", "placing")
	DevShot.arm(self)
	if "--home-closeup" in OS.get_cmdline_user_args():
		await get_tree().create_timer(0.7).timeout
		var home: Sprite2D = burrow.get("_props").home
		var local := burrow.to_local(home.global_position)
		var zoom := 1.75
		burrow.call("set_place_cam", BurrowCamera.Shot.new(zoom, Vector2(445, 204) - local * zoom))
	if "--verify" in OS.get_cmdline_user_args(): _verify.call_deferred()
	elif "--verify-fences" in OS.get_cmdline_user_args():
		await _verify_fences()
		print("[defense-fences] PASS: touch placement, visible plank, stock spent, route updated, mouse removal, stock restored, offers restored")
		get_tree().quit()

func _sync_shop_counts() -> void:
	var shop := ShopState.shared()
	shop.shop["traps"] = {"held": shop.traps.held, "placed": shop.traps.placed.size(),
		"armed": shop.traps.armed.size(), "maxPlaced": 8, "drain": Tuning.i("TRAPS.DRAIN")}
	for item: Dictionary in shop.shop.items:
		if item.kind == "trap": item.held = shop.traps.held
		if item.kind == "fence": item.held = shop.fences.held
	if not is_instance_valid(burrow): return
	var fences: FenceView = burrow.get("_fences")
	if fences == null: return
	var spans: Array = []
	var offers: Array = []
	var placed: Array = shop.fences.get("placed", [])
	var layout: BurrowLayout = burrow.get("_layout")
	for drawn: Dictionary in fences.get("_drawn"):
		var seg: Dictionary = drawn.seg
		spans.append(seg)
		if int(shop.fences.get("held", 0)) <= 0 or placed.has(seg): continue
		# This local preview keeps an entrance to the garden open. Production
		# still takes its allowed positions from /api/fences.
		if not RaidRoute.cheapest(layout, [], placed + [seg]).is_empty(): offers.append(seg)
	shop.fences["spans"] = spans
	shop.fences["offers"] = offers

func _tap(at: Vector2, touch: bool) -> void:
	for down in [true, false]:
		var event: InputEvent
		if touch:
			var finger := InputEventScreenTouch.new()
			finger.index = 0
			finger.position = at
			finger.pressed = down
			event = finger
		else:
			var mouse := InputEventMouseButton.new()
			mouse.button_index = MOUSE_BUTTON_LEFT
			mouse.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
			mouse.position = at
			mouse.pressed = down
			event = mouse
		Input.parse_input_event(event)
	# Keep the synthetic tap atomic: a real mouse hover between press and
	# release would be interpreted as a lost release by the production input.
	await get_tree().process_frame

func _verify_fences() -> void:
	var kit = chrome.get("_kit")
	var dock = kit.get("_dock")
	if not burrow.get("_walling"): dock.tabs.fence.pressed.emit()
	await get_tree().create_timer(0.6).timeout
	var shop := ShopState.shared()
	var before: Dictionary = shop.fences.duplicate(true)
	assert(before.offers.size() > 0)
	var plan = chrome.get("_plan")
	var old_route: Dictionary = plan.get("_route").duplicate(true)
	var chosen: Dictionary = {}
	for seg: Dictionary in before.offers:
		var candidate := RaidRoute.cheapest(burrow.get("_layout"), shop.traps.placed, before.placed + [seg])
		if not candidate.is_empty() and candidate.path != old_route.path:
			chosen = seg
			break
	assert(not chosen.is_empty())
	var fences: FenceView = burrow.get("_fences")
	assert(fences.pick(fences.mid_of(chosen)) == chosen)
	await _shot("07-clotures-emplacements-seeker")
	await _tap(burrow.to_global(fences.mid_of(chosen)), true)
	await get_tree().create_timer(0.4).timeout
	assert(shop.fences.placed.has(chosen))
	assert(shop.fences.held == before.held - 1)
	assert(kit.state.fences_held() == shop.fences.held)
	assert(not shop.fences.offers.has(chosen))
	assert(plan.get("_route").path != old_route.path)
	for drawn: Dictionary in fences.get("_drawn"):
		if drawn.seg == chosen: assert(drawn.plank.visible)
	await _shot("08-cloture-posee-seeker")
	await _tap(burrow.to_global(fences.mid_of(chosen)), false)
	await get_tree().create_timer(0.4).timeout
	assert(shop.fences == before)
	assert(not fences.is_built(chosen))
	assert(kit.state.fences_held() == before.held)
	assert(plan.get("_route").path == old_route.path)

func _shot(name: String) -> void:
	for i in 5: await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path(OUT + name + ".png"))

func _verify() -> void:
	await get_tree().create_timer(0.6).timeout
	var kit = chrome.get("_kit")
	var dock = kit.get("_dock")
	var plan = chrome.get("_plan")
	assert(kit.get("_plan_mode"))
	assert(dock.is_visible_in_tree())
	assert(burrow.get("_placing"))
	assert(kit.state.traps_placed() == ShopState.shared().traps.placed.size())
	for trap: Dictionary in burrow.get("_traps").get("_traps").values():
		assert(not trap.bomb.z_as_relative and trap.bomb.z_index > 4000)
		assert(not trap.filled.z_as_relative and trap.filled.z_index > 4000)
	var route: Dictionary = plan.get("_route").duplicate(true)
	assert(route.path.size() > 1)
	var waiting: HomeRabbit = burrow.get("_route_raider")
	assert(is_instance_valid(waiting) and waiting.visible and not waiting.roam)
	assert(waiting.at() == BurrowLayout.cell_of(int(route.path[0])))
	assert(waiting._sprite.sprite_frames.get_frame_texture("idle", 0).atlas.resource_path.ends_with("bunny-black.png"))
	assert(not burrow.get("_raid_board").get("_door_shown"))
	var idle_frame := waiting._sprite.frame
	var phase: float = burrow.get("_route_phase")
	await get_tree().create_timer(0.15).timeout
	assert(not is_equal_approx(phase, burrow.get("_route_phase")))
	assert(waiting._sprite.frame != idle_frame)
	await _shot("01-defense-desktop")
	get_window().size = Vector2i(890, 400)
	await get_tree().create_timer(0.5).timeout
	await _verify_banner(plan)
	await _shot("02-defense-mobile")
	var bounds: Rect2 = dock.get_global_rect()
	assert(bounds.position.x >= 0 and bounds.end.x <= get_viewport_rect().size.x)
	assert(bounds.position.y >= 0 and bounds.end.y <= get_viewport_rect().size.y)
	dock.tabs.fence.pressed.emit()
	assert(burrow.get("_walling") and not burrow.get("_placing"))
	await _verify_fences()
	await _shot("03-clotures-mobile")
	dock.tabs.decor.pressed.emit()
	assert(not burrow.get("_walling") and not burrow.get("_placing"))
	assert(burrow.call("can_arrange"))
	dock.tabs.trap.pressed.emit()
	assert(burrow.get("_placing"))
	# A second tap keeps the existing bomb inventory and buying action.
	dock.tabs.trap.pressed.emit()
	assert(kit.get("_detail").visible)
	kit.set("_expanded", false)
	kit.call("_refresh")
	var before: Dictionary = ShopState.shared().traps.duplicate(true)
	dock.test_button.pressed.emit()
	assert(plan.get("_testing"))
	assert(not burrow.get("_placing"))
	assert(burrow.get("_ghost") != null)
	assert(burrow.get("_ghost") == waiting and burrow.get("_route_raider") == null)
	assert(dock.test_button.disabled)
	await get_tree().create_timer(0.7).timeout
	assert(waiting.at() == BurrowLayout.cell_of(int(route.path[1])))
	await _shot("04-test-mobile")
	# Closing during simulation must restore controls and clear the route.
	chrome.call("_end_mode")
	await get_tree().process_frame
	assert(burrow.get("_ghost") == null)
	assert(burrow.get("_route_raider") == null)
	assert(burrow.get("_route").is_empty())
	assert(ShopState.shared().traps == before)
	chrome.call("_start_mode", "placing")
	assert(not dock.tabs.trap.disabled and not dock.tabs.decor.disabled)
	assert(is_instance_valid(burrow.get("_route_raider")))
	# Completing a full rehearsal returns one idle attacker to the start.
	dock.test_button.pressed.emit()
	var active_plan = chrome.get("_plan")
	for i in 150:
		if not active_plan.get("_testing"): break
		await get_tree().create_timer(0.1).timeout
	assert(not active_plan.get("_testing"))
	assert(burrow.get("_ghost") == null)
	assert(is_instance_valid(burrow.get("_route_raider")))
	assert(burrow.get("_route_raider").visible)
	assert(ShopState.shared().traps == before)
	await _shot("06-seeker-attacker")
	chrome.call("_end_mode")
	var props = burrow.get("_props")
	var plants: Array = props.get("_plants")
	assert(plants.size() == 36)
	var old_texture: Texture2D = plants[0].texture
	await get_tree().create_timer(0.2).timeout
	assert(plants[0].texture != old_texture)
	assert(plants[0].material == null)
	assert(props.home.scale == Vector2(0.5, 0.5))
	assert(props.home.offset * props.home.scale == -BurrowProps.HOME_CENTRE)
	var water = burrow.get("_terrain").water()
	assert(is_equal_approx(water.water_material.get_shader_parameter("water_art_scale"), 1.25))
	assert(is_equal_approx(water.water_material.get_shader_parameter("surface_speed"), 2.1))
	Home.burrow["gardenReady"] = 0
	Home.burrow["yieldPerHour"] = 0
	Home.changed.emit()
	for i in 3: await get_tree().process_frame
	for plant in plants: assert(not plant.visible)
	await _shot("05-terrier-jeu-mobile")
	print("[defense-identity] PASS: production Chrome; mobile dock fits; idle black attacker, animated start, Test reuses attacker, full run returns to start, cancel/reopen; dash-dot route; bombs above decor; unchanged trap state; 36 growing/wind plants; harvest clears; house anchor; sea x1.25/105%")
	get_tree().quit()


func _verify_banner(plan: BuryPlan) -> void:
	# Compact labels must fit without ellipsis in every supported language.
	# Do not save the test language into the player's preferences.
	var clipped: Array[String] = []
	for locale: Dictionary in I18N.LOCALES:
		I18N.locale = locale.code
		I18N._apply_theme_face()
		I18N.locale_changed.emit(locale.code)
		for mode in ["placing", "walling", "decor", "inspect"]:
			plan.set_mode(mode)
			for i in 3: await get_tree().process_frame
			assert(plan._panel.size.y <= 56.0)
			for label: Label in [plan._score, plan._verdict, plan._hint]:
				var width := label.get_theme_font("font").get_string_size(label.text,
					HORIZONTAL_ALIGNMENT_LEFT, -1, label.get_theme_font_size("font_size")).x
				if width > label.size.x + 1.0:
					clipped.append("%s: %s (%.0f > %.0f)" % [locale.code, label.text, width, label.size.x])
	I18N.locale = "fr"
	I18N._apply_theme_face()
	I18N.locale_changed.emit("fr")
	plan.set_mode("placing")
	assert(clipped.is_empty(), "\n".join(clipped))
	print("[defense-banner] PASS: seven languages, four tools, %.0fpx high, no clipped labels" % plan._panel.size.y)
