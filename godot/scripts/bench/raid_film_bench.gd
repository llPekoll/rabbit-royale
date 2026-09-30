extends Node2D
## LE PLATEAU DE TOURNAGE DES RAIDS — le vrai terrier (burrow.tscn), la barre
## du haut et la barre du raid, et un raid factice joue d'un bout a l'autre,
## pour filmer la pub (marketing/capture.sh). Rien ne part vers le serveur :
## `RaidState.fake` et `ShopState.fake` coupent le reseau.
##
##   ... raid_film_bench.tscn -- --side=attack   # Shiro pille le terrier de
##                                              # Kuro : le brouillard, les
##                                              # chiffres, une bombe, le
##                                              # potager, la ceremonie
##   ... raid_film_bench.tscn -- --side=defend   # Kuro chez Shiro : il tombe
##                                              # a la porte, une bombe lui
##                                              # saute dessus, l'eclair, le
##                                              # tampon DEFENDED
##
## Kuro est le lapin NOIR : la planche brune recoloree
## (assets/bunnies/bunny-black.png), posee sur son sprite seulement.

## LE TERRIER DE SHIRO est celui de ce joueur : la porte EN BAS de l'ile —
## Kuro monte par le milieu de l'ecran. Avec « shiro » ou « burrow », la porte
## tombait en haut, sous le panneau de defense, et on ne le voyait pas.
const SHIRO := "shiro-3"
const KURO := "kuro"
const KURO_SHEET := "res://assets/bunnies/bunny-black.png"
## Un pas toutes les STEP_S : lisible a l'ecran, sans trainer.
const STEP_S := 0.85

var _burrow: Node2D
var _ui: Control


func _ready() -> void:
	var side := "attack"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--side="):
			side = arg.trim_prefix("--side=")
	Sound.host(self)
	Sound._ambient.stop()
	Session.player = {"id": SHIRO}
	Home.burrow = {"level": 6, "stock": 12840, "energy": 240, "maxEnergy": 300,
		"crossingCost": Tuning.i("ENERGY.CROSSING_COST")}

	var layout := BurrowLayout.of(KURO if side == "attack" else SHIRO)
	var path := _path_to_garden(layout, 14)
	var shop := ShopState.shared()
	shop.fake([], {"held": 3, "maxPlaced": 8})
	if side == "defend":
		# Deux bombes sur son chemin, une a cote : celle du 3e pas saute.
		var mine := [path[3]]
		for t in layout.walkable_tiles():
			if mine.size() >= 3:
				break
			if layout.is_trappable(t) and not path.has(t) and t % 7 == 0:
				mine.append(t)
		shop.traps["placed"] = mine
		shop.traps["armed"] = mine.duplicate()
		shop.fences = {"placed": _garden_fence(layout, layout.entrance), "spans": [], "offers": [],
			"held": 0, "maxHeld": 4}

	_burrow = preload("res://scenes/burrow.tscn").instantiate()
	add_child(_burrow)
	_mount_ui(side)
	DevShot.arm(self)
	await get_tree().create_timer(0.6).timeout
	if side == "defend":
		await _defend(layout, path)
	else:
		await _attack(layout, path)


## La barre du haut (le jeu en cours), et avec `--hud` la barre du raid
## epinglee sous elle. SANS PAR DEFAUT : dans la video, le panneau (RETREAT,
## STRIKE) cachait le haut du terrier (le user, 2026-09-30 : « un gros panneau
## qui gache la vue »).
func _mount_ui(side: String) -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	_ui = Control.new()
	Kit.fill(_ui)
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_ui)
	var bar: Control = preload("res://scenes/ui/top_bar.tscn").instantiate()
	bar.preview = true
	bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	bar.offset_bottom = Kit.TOPBAR_H
	_ui.add_child(bar)
	if not "--hud" in OS.get_cmdline_user_args():
		return
	var hud: Control = (preload("res://scenes/ui/raid_hud.tscn") if side == "attack"
		else preload("res://scenes/ui/defend_hud.tscn")).instantiate()
	_ui.add_child(hud)
	Kit.fill(hud)
	# Le panneau se mesure avant son texte : une seconde, c'est un grand
	# rectangle noir. Il n'entre qu'une fois pose.
	hud.modulate.a = 0.0
	get_tree().create_timer(1.8).timeout.connect(func() -> void:
		hud.create_tween().tween_property(hud, "modulate:a", 1.0, 0.2))


## Pose plein ecran, comme Chrome.stamp : ici, il n'y a pas de chrome.
func _stamp(node: Control) -> void:
	_ui.add_child(node)
	Kit.fill(node)


# ── Shiro chez Kuro ─────────────────────────────────────────────────────────

func _attack(layout: BurrowLayout, path: Array[int]) -> void:
	var walked: Array = [layout.entrance]
	var energy := 120
	var fenced := _garden_fence(layout, path[-2] if path.size() > 1 else layout.entrance)
	var r := _raid(layout, walked, energy)
	r["fenced"] = fenced
	RaidState.current.fake({"raid": r.duplicate(true)})
	await _wait(1.6)
	var sprung := 0
	for i in path.size():
		walked.append(path[i])
		energy -= 6
		r = _raid(layout, walked, energy)
		r["fenced"] = fenced
		if i == 2:
			sprung = 1
			energy -= 20
			r["energy"] = energy
			r["tank"] = energy
		r["trapsSprung"] = sprung
		RaidState.current.fake({"raid": r.duplicate(true)})
		if i == 2:
			RaidState.current.sprung.emit(path[i])
			await _wait(1.3)
		await _wait(STEP_S)
		if layout.field.has(path[i]):
			break
	r["finished"] = true
	r["succeeded"] = true
	r["carrotsLooted"] = 3260
	RaidState.current.fake({"raid": r.duplicate(true)})
	await _wait(1.6)
	_stamp(RaidVictory.present({"defender": "Kuro", "carrots": 3260, "trapsSprung": 1,
		"refunded": 0, "avatar": "white"}))


## Le raid tel que le serveur le rendrait (voir raid_board_bench.gd) : ce
## qu'on a foule et ses voisins vus, des chiffres, les voisins en pas.
static func _raid(layout: BurrowLayout, walked: Array, energy: int) -> Dictionary:
	var at: int = walked[-1]
	var seen := {}
	for t in walked:
		seen[t] = true
		for n in _around(layout, t):
			seen[n] = true
	var view: Array = []
	for t in seen:
		view.append({"tile": t, "clue": (t * 7) % 3})
	var steps: Array = []
	for n in _around(layout, at):
		if not walked.has(n):
			steps.append(n)
	return {"raidId": "film", "defender": {"id": KURO, "name": "Kuro", "avatar": "brown", "level": 7},
		"tile": at, "energy": energy, "tank": energy, "trapsSprung": 0, "view": view,
		"walked": walked.duplicate(), "steps": steps, "smoked": false, "finished": false,
		"succeeded": false, "carrotsLooted": 0}


# ── Kuro chez Shiro ─────────────────────────────────────────────────────────

func _defend(layout: BurrowLayout, path: Array[int]) -> void:
	var inc := {"raidId": "film", "attacker": {"id": KURO, "name": "Kuro", "avatar": "brown"},
		"tile": layout.entrance, "energy": 110, "walked": [layout.entrance], "trapsSprung": 0,
		"finished": false, "succeeded": false, "struck": false, "carrotsLooted": 0}
	RaidState.current.fake({"incoming": inc.duplicate(true), "lightning": 3})
	# L'intrus vient d'etre cree par le terrier : il devient Kuro.
	await get_tree().process_frame
	_paint_kuro(_burrow.get("_raider"))
	await _wait(1.4)
	for i in range(0, mini(path.size() - 1, 7)):
		inc.tile = path[i]
		(inc.walked as Array).append(path[i])
		inc.energy = int(inc.energy) - 6
		if i == 3:
			inc.trapsSprung = 1
			inc.energy = int(inc.energy) - 20
		RaidState.current.fake({"incoming": inc.duplicate(true)})
		await _wait(STEP_S + (1.2 if i == 3 else 0.0))
	# Shiro le foudroie.
	await _wait(0.4)
	inc.struck = true
	inc.finished = true
	RaidState.current.fake({"incoming": inc.duplicate(true)})
	await _wait(3.2)
	var stamp := RaidedStamp.announce({"by": "Kuro", "others": 0, "carrots": 0, "defended": true, "count": 1})
	stamp.linger = true
	_stamp(stamp)


# ── Outils ──────────────────────────────────────────────────────────────────

## LE POTAGER CLOS : une planche par face exposee (FenceView.build), sauf UNE
## — le passage que le jeu laisse toujours ouvert (voir fence-is-a-side),
## tourne vers `toward` (la case d'ou le pillard arrive, ou la porte).
static func _garden_fence(layout: BurrowLayout, toward: int) -> Array:
	var field := {}
	for t in layout.field:
		field[BurrowLayout.cell_of(t)] = true
	var goal := BurrowLayout.cell_of(toward)
	var out: Array = []
	var gap := {}
	var gap_d := INF
	for cell: Vector2i in field:
		for side: String in FenceView.SIDES:
			var outer: Vector2i = cell + FenceView.STEP[side]
			if field.has(outer):
				continue
			var seg := {"tile": BurrowLayout.index(cell), "side": side}
			out.append(seg)
			var d := Vector2(outer).distance_to(Vector2(goal))
			if d < gap_d:
				gap_d = d
				gap = seg
	out.erase(gap)
	return out


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## De la porte vers le potager, case voisine par case voisine, au plus pres du
## potager a chaque pas (sans repasser) — `n` pas au plus.
static func _path_to_garden(layout: BurrowLayout, n: int) -> Array[int]:
	var goal := BurrowLayout.cell_of(layout.field[0])
	var out: Array[int] = []
	var at := layout.entrance
	for k in n:
		var best := -1
		for t in _around(layout, at):
			if out.has(t) or t == layout.entrance:
				continue
			if best < 0 or BurrowLayout.cell_of(t).distance_squared_to(goal) \
					< BurrowLayout.cell_of(best).distance_squared_to(goal):
				best = t
		if best < 0:
			break
		out.append(best)
		at = best
		if layout.field.has(best):
			break
	return out


static func _around(layout: BurrowLayout, tile: int) -> Array:
	var out: Array = []
	var here := BurrowLayout.cell_of(tile)
	for s in BurrowLayout.STEPS:
		var c := here + s
		if c.x < 0 or c.y < 0 or c.x >= BurrowLayout.COLS or c.y >= BurrowLayout.ROWS:
			continue
		var t := BurrowLayout.index(c)
		if layout.is_walkable(t):
			out.append(t)
	return out


## Les memes images, prises sur la planche noire.
static func _paint_kuro(r: Node) -> void:
	if r == null:
		return
	var sprite: AnimatedSprite2D = r.get("_sprite")
	if sprite == null:
		return
	var sheet := ImageTexture.create_from_image(Image.load_from_file(KURO_SHEET))
	var frames: SpriteFrames = sprite.sprite_frames.duplicate()
	for anim in frames.get_animation_names():
		for i in frames.get_frame_count(anim):
			var f := frames.get_frame_texture(anim, i) as AtlasTexture
			if f == null:
				continue
			var black := AtlasTexture.new()
			black.atlas = sheet
			black.region = f.region
			frames.set_frame(anim, i, black, frames.get_frame_duration(anim, i))
	sprite.sprite_frames = frames
