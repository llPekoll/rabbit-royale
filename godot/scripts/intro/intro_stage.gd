class_name IntroStage
extends Node2D
## LE PLATEAU DES LIVRES — la vraie ile qui joue les regles dans un cadre de
## page (IntroBook, via un SubViewport).
##
## Tout ce qui est montre passe par les fonctions d'une manche hors ligne
## (`Island._local_tap`, `play_eruption`, les evenements d'un rival) : une
## regle qui change change ici toute seule. Seule la mise en scene est
## inventee — ou se tient Shiro, ou Kuro tombe, ce que la camera regarde.
##
## Vit dans N'IMPORTE QUEL viewport : la camera, la main (BenchHand) et les
## contours d'or se mesurent sur celui qui l'heberge.
##
## UN GESTE A LA FOIS. `cut()` change le numero du plan : un geste qui se
## reveille apres une coupe voit qu'il n'est plus le sien et s'arrete.

const ISLAND := preload("res://scenes/island.tscn")
## UNE ILE DU NIVEAU 3 : assez grande pour avoir de quoi montrer (un « 1 » a
## cote d'une bombe, une autre bombe pour Kuro, un coffre), assez petite pour
## qu'un plan large la tienne entiere.
const SEED := "lv3:intro-film"
const CONTENT := "intro-film"
const KURO_SHEET := preload("res://assets/bunnies/bunny-black.png")
const KURO := "kuro"
const HAND_BEATS := ["dig", "numbers", "mark", "mark_bomb", "chest", "rise_carrot"]

## Ou poser la case visee, en part de la hauteur.
var aim_y := 0.5
## Plus serre dans un petit cadre : le livre regarde de plus pres.
var zoom := 1.0

var island: Island
var plan := {}
var token := 0

var _hand: BenchHand
var _kuro: IslandRabbit
var _marks: _Marks
## Le dernier cadrage, rejoue quand le viewport change de taille.
var _reaim: Callable


## LES CONTOURS D'OR, en coordonnees du viewport, recalcules a chaque image :
## la camera glisse sous eux.
class _Marks extends Node2D:
	var stage: IntroStage
	var cells: Array = []
	var keep: Array = []
	var color := Color.WHITE
	var keep_color := Palette.GOLD
	var born := 0.0

	func _process(_delta: float) -> void:
		queue_redraw()

	func _draw() -> void:
		if stage == null or not is_instance_valid(stage.island):
			return
		var pulse := 0.8 + 0.2 * sin((Time.get_ticks_msec() / 1000.0 - born) * 6.0)
		for c in keep:
			_diamond(c, keep_color)
		for c in cells:
			_diamond(c, Color(color, pulse))

	func _diamond(c: Vector2i, tint: Color) -> void:
		var k: float = stage.island.scale.x
		var mid := stage.on_screen(c)
		var hw := Iso.half_w() * k
		var hh := Iso.half_h() * k
		var pts := PackedVector2Array([mid + Vector2(0, -hh), mid + Vector2(hw, 0), mid + Vector2(0, hh),
			mid + Vector2(-hw, 0), mid + Vector2(0, -hh)])
		draw_polyline(pts, Color(0, 0, 0, tint.a * 0.6), 7.0)
		draw_polyline(pts, tint, 3.5)


## La secousse de l'ile qui coule, dans la vignette du livre (`play_eruption`).
const SINK_SHAKE := 0.35

func _ready() -> void:
	island = ISLAND.instantiate()
	island.own_mark = false
	island.own_prizes = true
	add_child(island)
	island.set_standalone(true)
	# L'intro tient sa camera : l'ile ne recadre plus d'elle-meme...
	island._cam_moved_by_player = true
	# ...ni apres un pas (`_keep_in_view` se tait pendant un appui) : aucune
	# tape n'arrive a l'ile, l'intro les prend toutes.
	island._pressing = true
	# Et pas a un changement de taille : on recadre ici.
	if get_viewport().size_changed.is_connected(island._reframe):
		get_viewport().size_changed.disconnect(island._reframe)
	get_viewport().size_changed.connect(_on_resized)
	reset()


func _exit_tree() -> void:
	token += 1


## L'ILE NEUVE, comme au premier plan : le livre la redonne a chaque page
## jouee (on peut y revenir), le film une seule fois.
func reset() -> void:
	cut()
	if _kuro != null and is_instance_valid(_kuro):
		island._rivals.erase(KURO)
		_kuro.queue_free()
	_kuro = null
	if island._cam_tween != null and island._cam_tween.is_valid():
		island._cam_tween.kill()
	island.modulate.a = 1.0
	island.play_local(SEED, CONTENT, 0.0)
	island.reset_eruption()
	island._local_over = false
	island._rabbit.wear("white")
	for node in [island._mini, island._compass, island._mark]:
		if node != null:
			node.visible = false
	if island._sink_sky != null:
		island._sink_sky.visible = false
	for child in island._prize_host.get_children():
		child.queue_free()
	plan = _scout()
	go_wide(0.0)


## Une coupe : le geste en cours s'arrete a son prochain reveil.
func cut() -> void:
	token += 1
	outline([])
	if _hand != null:
		_hand.visible = false


func _on_resized() -> void:
	if _reaim.is_valid():
		_reaim.call()


## LES CASES DE L'INTRO, cherchees sur le plateau : la ou Shiro lit un « 1 » a
## cote de SA bombe, la bombe de Kuro, le coffre. Le plateau est celui de deux
## graines fixes : le meme a chaque lecture.
func _scout() -> Dictionary:
	var board := _board()
	var start: Vector2i = island.local_run.at
	var safe := func(c: Vector2i) -> bool:
		return board.content.has(c) and board.content[c] != IslandBoard.Content.BOMB \
			and board.content[c] != IslandBoard.Content.CHEST
	# A DECOUVERT : rien de haut devant la case (un arbre, un rocher — de la
	# terre hors du plateau), sinon il cache le lapin a l'ecran. En iso, «
	# devant » est vers le bas : x+1, y+1, jusqu'a deux cases.
	var clear := func(c: Vector2i) -> bool:
		for f in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(2, 1), Vector2i(1, 2), Vector2i(2, 2)]:
			var g: Vector2i = c + f
			if board.map.is_land(g.x, g.y) and not board.content.has(g):
				return false
		return true
	var out := {"start": start}
	# LA LECON : P montre « 1 », sa seule bombe B, et Q d'ou l'on creuse P.
	var best := INF
	for p: Vector2i in board.content:
		if not safe.call(p) or int(board.adjacent.get(p, 0)) != 1 or not clear.call(p):
			continue
		var bomb := Vector2i(-1, -1)
		for n in board._neighbours(p):
			if board.content.get(n) == IslandBoard.Content.BOMB:
				bomb = n
		if bomb.x < 0:
			continue
		for q in board._neighbours(p):
			if q == bomb or not safe.call(q) or not board.may_step(q, p) or not board.may_step(p, q) \
					or board.is_beside(q, bomb) or not clear.call(q) or not clear.call(bomb):
				continue
			var d := Vector2(p - start).length()
			if d >= 3.0 and d < best:
				best = d
				out["p"] = p
				out["q"] = q
				out["b"] = bomb
	# LA BOMBE DE KURO, loin de la lecon : une voisine d'ou il saute.
	best = INF
	for c: Vector2i in board.content:
		if board.content[c] != IslandBoard.Content.BOMB or c == out.get("b", Vector2i(-9, -9)) or not clear.call(c):
			continue
		for n in board._neighbours(c):
			if not safe.call(n) or not board.may_step(n, c) or not clear.call(n):
				continue
			var d := absf(Vector2(c - out.get("p", start)).length() - 5.0)
			if d < best:
				best = d
				out["kb"] = c
				out["kn"] = n
	# LA POUSSEE (le livre de la mer) : trois cases creusees en ligne pres du
	# depart — Shiro, Kuro, et la ou Kuro retombe.
	var open := func(c: Vector2i) -> bool:
		return board.state.get(c) == IslandBoard.State.DUG and safe.call(c) and clear.call(c)
	best = INF
	for b: Vector2i in board.content:
		if not open.call(b):
			continue
		for a in board._neighbours(b):
			var c: Vector2i = b + (b - a)
			if not open.call(a) or not open.call(c) or not board.may_step(a, b) or not board.may_step(b, c):
				continue
			var d := Vector2(b - start).length()
			if d < best:
				best = d
				out["pa"] = a
				out["pb"] = b
				out["pc"] = c
	# ...ET DANS LES VAGUES : Kuro au bord, la mer deux cases derriere lui.
	best = INF
	for b: Vector2i in board.content:
		if not safe.call(b) or not clear.call(b):
			continue
		for a in board._neighbours(b):
			var toward: Vector2i = b - a
			var s1: Vector2i = b + toward
			var s2: Vector2i = b + toward * 2
			if not safe.call(a) or not clear.call(a) or not board.may_step(a, b) \
					or board.map.is_land(s1.x, s1.y) or board.map.is_land(s2.x, s2.y):
				continue
			var d := Vector2(b - start).length()
			if d < best:
				best = d
				out["sa"] = a
				out["sb"] = b
	# L'ORAGE : Kuro au milieu d'un carre encore en terre, sans coffre (l'eclair
	# les epargne), une bombe dedans si possible.
	best = INF
	for k: Vector2i in board.content:
		if not safe.call(k) or not clear.call(k):
			continue
		var buried := 0
		var bombs := 0
		var chest := false
		for dy in [-1, 0, 1]:
			for dx in [-1, 0, 1]:
				var c: Vector2i = k + Vector2i(dx, dy)
				if not board.content.has(c):
					continue
				if board.content[c] == IslandBoard.Content.CHEST:
					chest = true
				if board.state.get(c) != IslandBoard.State.DUG:
					buried += 1
					if board.content[c] == IslandBoard.Content.BOMB:
						bombs += 1
		if chest or buried < 6:
			continue
		var score := absf(Vector2(k - start).length() - 4.0) - buried * 0.4 - (1.5 if bombs == 1 else 0.0)
		if score < best:
			best = score
			out["k"] = k
	# LE COFFRE, et la voisine d'ou Shiro l'ouvre.
	best = INF
	for c in board.chest_tier:
		for n in board._neighbours(c):
			if not safe.call(n) or not board.may_step(n, c) or n == out.get("kn", Vector2i(-9, -9)) \
					or not clear.call(n) or not clear.call(c):
				continue
			var d := Vector2(c - start).length()
			if d < best:
				best = d
				out["c"] = c
				out["cn"] = n
	return out


func _board() -> IslandBoard:
	return island.local_run.board


## Le milieu d'une case dans le viewport (trailer_bench `_cell_on_screen`),
## SUR LE DESSUS DE SA MOTTE : une case pas encore creusee est levee
## (`TileView.RAISED_RISE`), et un contour pose au niveau du sol tombait sous
## elle, decale vers le bas (2026-10-16, « il faut les relever un peu »).
func on_screen(cell: Vector2i) -> Vector2:
	var map := island._terrain.map
	var local: Vector2 = map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h() - island._terrain.rise_at(cell))
	return island.get_global_transform_with_canvas() * local


# ── La camera ───────────────────────────────────────────────────────────────

## Sur une case, a `tiles` cases de large.
func aim(cell: Vector2i, seconds: float = 0.8, tiles: float = 9.0) -> void:
	_reaim = aim.bind(cell, 0.0, tiles)
	var view := get_viewport_rect().size
	var k := view.x * zoom / (tiles * Iso.half_w() * 2.0)
	var focus: Vector2 = island._terrain.map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	var at := Vector2(view.x * 0.5, view.y * aim_y) - focus * k
	_glide(BurrowCamera.Shot.new(k, at), seconds)


func go_wide(seconds: float) -> void:
	_reaim = go_wide.bind(0.0)
	_glide(_wide(), seconds)


func _glide(shot: BurrowCamera.Shot, seconds: float) -> void:
	if island._cam_tween != null and island._cam_tween.is_valid():
		island._cam_tween.kill()
	if seconds <= 0.0:
		island.scale = Vector2.ONE * shot.scale
		island.position = shot.at
		return
	var t := island.create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	t.tween_property(island, "scale", Vector2.ONE * shot.scale, seconds)
	t.tween_property(island, "position", shot.at, seconds)
	island._cam_tween = t


func _wide() -> BurrowCamera.Shot:
	var view := get_viewport_rect().size
	var room := view
	var whole := BurrowCamera.board(island._terrain.map, room.x, room.y)
	return BurrowCamera.Shot.new(whole.scale * 0.9, whole.at + room * whole.scale * 0.05)


# ── Les outils des gestes ───────────────────────────────────────────────────

## Shiro, pose ailleurs sans saut (une coupe) ; l'anneau le suit.
func _put_shiro(cell: Vector2i) -> void:
	island.local_run.at = cell
	island._rabbit.place_at(cell)
	island._refresh_ring()


## Une case en terre ou Shiro peut marcher sans rien risquer, vers `goal`.
func _safe_step(goal: Vector2i) -> Vector2i:
	var run := island.local_run
	var board := run.board
	var pick := Vector2i(-1, -1)
	var pick_d := INF
	for n in board._neighbours(run.at):
		if not board.may_step(run.at, n) or board.content.get(n) in [IslandBoard.Content.BOMB, IslandBoard.Content.CHEST]:
			continue
		if board.state.get(n) == IslandBoard.State.DUG:
			continue
		var d := Vector2(goal - n).length()
		if d < pick_d:
			pick_d = d
			pick = n
	return pick


## LE BORD DE LA ZONE OUVERTE : l'ile s'ouvre deja autour du lapin a
## l'arrivee, donc ses voisines sont creusees. Une case creusee qui touche une
## case en terre pour laquelle `want` dit oui, au plus pres de `goal`.
func _frontier(goal: Vector2i, want: Callable) -> Dictionary:
	var board := _board()
	var best := {}
	for d: Vector2i in board.state:
		if board.state[d] != IslandBoard.State.DUG or board.content.get(d) == IslandBoard.Content.BOMB:
			continue
		for n in board._neighbours(d):
			if board.state.get(n) == IslandBoard.State.DUG or not board.may_step(d, n) or not want.call(n):
				continue
			var dist := Vector2(d - goal).length()
			if best.is_empty() or dist < float(best.dist):
				best = {"from": d, "to": n, "dist": dist}
	return best


func _hand_node() -> BenchHand:
	if _hand == null:
		_hand = BenchHand.new()
		add_child(_hand)
	_hand.visible = true
	return _hand


func _tap(cell: Vector2i, tok: int) -> bool:
	await _hand_node().tap(on_screen(cell), func() -> void:
		if tok == token:
			island._local_tap(cell), 0.36, 0.15)
	return tok == token


## Des contours sur `cells` (qui pulsent), et `keep` qui reste en or.
func outline(cells: Array, color: Color = Palette.GOLD, keep: Array = []) -> void:
	if _marks == null:
		var layer := CanvasLayer.new()
		layer.layer = 30
		add_child(layer)
		_marks = _Marks.new()
		_marks.stage = self
		layer.add_child(_marks)
	_marks.cells = cells
	_marks.keep = keep
	_marks.color = color
	_marks.born = Time.get_ticks_msec() / 1000.0


func _wait(seconds: float, tok: int) -> bool:
	await get_tree().create_timer(seconds).timeout
	return tok == token and is_inside_tree()


func _spawn_kuro(cell: Vector2i) -> IslandRabbit:
	if _kuro != null and is_instance_valid(_kuro):
		_kuro.visible = true
		_kuro.place_at(cell)
		return _kuro
	island._add_rival({"playerId": KURO, "tile": _board().index_of(cell), "alive": true}, true)
	_kuro = island._rivals.get(KURO)
	_kuro.set_plate("Kuro", false)
	_paint_kuro(_kuro)
	return _kuro


## KURO EST LE NOIR : le pelage du jeu, repeint (trailer_bench `_paint_kuro`).
static func _paint_kuro(r: IslandRabbit) -> void:
	var sprite: AnimatedSprite2D = r.get("_sprite")
	if sprite == null:
		return
	var frames: SpriteFrames = sprite.sprite_frames.duplicate()
	for anim in frames.get_animation_names():
		for i in frames.get_frame_count(anim):
			var f := frames.get_frame_texture(anim, i) as AtlasTexture
			if f == null:
				continue
			var black := AtlasTexture.new()
			black.atlas = KURO_SHEET
			black.region = f.region
			black.filter_clip = true
			frames.set_frame(anim, i, black, frames.get_frame_duration(anim, i))
	sprite.sprite_frames = frames


# ── Les gestes ──────────────────────────────────────────────────────────────

## UN GESTE, jusqu'au bout (ou jusqu'a la prochaine coupe).
func live(what: String) -> void:
	cut()
	var tok := token
	if what in HAND_BEATS:
		_hand_node()
	match what:
		"rise_carrot":
			await _rise(tok)
			if await _wait(0.4, tok):
				await _carrot(tok)
		"wide":
			go_wide(1.4)
			await _wait(1.4, tok)
		"dig":
			await _dig(tok)
		"numbers":
			await _numbers(tok)
		"mark":
			await _mark(tok)
		"kuro_bomb":
			await _kuro_bomb(tok)
		# Deux gestes sur une page (les livres courts, 2026-10-15) : le X,
		# puis Kuro qui saute sans lire ; l'orage, puis l'encre.
		"mark_bomb":
			await _mark(tok)
			if await _wait(0.4, tok):
				await _kuro_bomb(tok)
		"chest":
			await _chest(tok)
		"two":
			await _two(tok)
		"push":
			await _push(tok)
		"bolt":
			await _bolt(tok)
		"bloop":
			await _bloop(tok)
		"bolt_bloop":
			await _bolt(tok)
			if await _wait(0.6, tok):
				await _bloop(tok)
	if _hand != null and tok == token:
		_hand.visible = false


## L'ILE SORT DE LA MER : la descente de `play_eruption`, a l'envers.
func _rise(tok: int) -> void:
	go_wide(0.0)
	var shot := _wide()
	island.position.y += 220.0
	island.modulate.a = 0.0
	var t := island.create_tween().set_parallel(true)
	t.tween_property(island, "position:y", shot.at.y, 2.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.tween_property(island, "modulate:a", 1.0, 1.6).set_trans(Tween.TRANS_SINE)
	Sound.play("island_sink", 0.7)
	await t.finished


## « PLEIN DE CAROTTES » : la camera descend sur Shiro, au bord de la zone
## ouverte, et il creuse une case qui en cache une.
func _carrot(tok: int) -> void:
	var board := _board()
	var spot := _frontier(plan.start, func(n: Vector2i) -> bool:
		return board.content.get(n) == IslandBoard.Content.CARROT)
	if spot.is_empty():
		return
	_put_shiro(spot.from)
	aim(spot.from, 1.2)
	if not await _wait(1.3, tok):
		return
	await _tap(spot.to, tok)
	await _wait(1.0, tok)


## CREUSER : deux cases de plus, la main tape, les chiffres sortent.
func _dig(tok: int) -> void:
	var board := _board()
	var goal: Vector2i = plan.get("p", plan.start)
	if _safe_step(goal).x < 0:
		var spot := _frontier(goal, func(n: Vector2i) -> bool:
			return board.content.get(n) not in [IslandBoard.Content.BOMB, IslandBoard.Content.CHEST])
		if spot.is_empty():
			return
		_put_shiro(spot.from)
	aim(island.local_run.at, 0.8)
	if not await _wait(0.8, tok):
		return
	for i in 2:
		var pick := _safe_step(goal)
		if pick.x < 0:
			return
		if not await _tap(pick, tok):
			return
		if not await _wait(0.6, tok):
			return


## LE CHIFFRE : coupe sur Q, Shiro creuse P — un « 1 » — puis revient sur Q
## pour qu'on le lise (sa case a lui n'est jamais allumee). Le contour d'or
## dit ce que compte le chiffre : P, puis ses voisines, puis la seule bombe.
func _numbers(tok: int) -> void:
	if not plan.has("p"):
		return
	_put_shiro(plan.q)
	aim(plan.p, 0.0, 6.0)
	if not await _wait(0.7, tok):
		return
	if not await _tap(plan.p, tok):
		return
	if not await _wait(0.6, tok):
		return
	if not await _tap(plan.q, tok):
		return
	_hand.visible = false
	outline([plan.p], Palette.GOLD)
	if not await _wait(0.9, tok):
		return
	var ring: Array = []
	for n in _board()._neighbours(plan.p):
		if _board().content.has(n):
			ring.append(n)
	outline(ring, Palette.CREAM, [plan.p])
	if not await _wait(1.0, tok):
		return
	outline([plan.b], Palette.DANGER, [plan.p])
	await _wait(1.2, tok)


## LE X : Shiro repasse sur le « 1 », la main presse MARQUER UNE BOMBE, puis
## la bombe. Juste : l'energie revient, en jaune, sur la case.
func _mark(tok: int) -> void:
	if not plan.has("b"):
		return
	aim(plan.p, 0.4, 6.0)
	if island.local_run.at != plan.p:
		if island.local_run.at != plan.q:
			_put_shiro(plan.q)
		if not await _tap(plan.p, tok):
			return
	outline([plan.b], Palette.DANGER)
	var mark: PlankButton = island._mark
	mark.visible = true
	if not await _wait(0.5, tok):
		return
	await _hand_node().tap(mark.get_global_rect().get_center(), func() -> void:
		if tok == token:
			island.set_armed(true), 0.4, 0.2)
	if not await _wait(0.5, tok):
		return
	await _tap(plan.b, tok)
	outline([])
	if not await _wait(1.6, tok):
		return
	mark.visible = false


## KURO NE LIT PAS : il tombe du ciel a cote d'une bombe, saute dessus, et le
## souffle le renvoie d'ou il venait.
func _kuro_bomb(tok: int) -> void:
	if not plan.has("kb"):
		return
	aim(plan.kn, 0.7, 7.0)
	if not await _wait(0.5, tok):
		return
	var r := _spawn_kuro(plan.kn)
	if not await _wait(1.3, tok):
		return
	r.send_to(plan.kb)
	Sound.play("hop", 0.8)
	if not await _wait(IslandRabbit.KNOCK_FLIGHT, tok):
		return
	var board := _board()
	board.reveal_remote(board.index_of(plan.kb), "bomb", 0)
	island._tiles.refresh()
	island._on_remote_reveal(plan.kb, "bomb")
	r.blast_back(plan.kb, plan.kn)
	if not await _wait(1.4, tok):
		return
	r.stun(2400)
	await _wait(1.0, tok)


## LE COFFRE, PUIS L'ILE COULE : la ceremonie du vrai coffre, et la fin de
## `_check_local_end` jouee a la main — l'intro n'ouvre pas tous les coffres.
func _chest(tok: int) -> void:
	if not plan.has("c"):
		return
	if _kuro != null and is_instance_valid(_kuro):
		_kuro.visible = false
	_put_shiro(plan.cn)
	aim(plan.c, 0.0, 8.0)
	if not await _wait(0.7, tok):
		return
	if not await _tap(plan.c, tok):
		return
	if not await _wait(2.6, tok):
		return
	for child in island._prize_host.get_children():
		child.queue_free()
	go_wide(0.8)
	if not await _wait(0.9, tok):
		return
	var ms := 3600
	# UN TIERS DE LA SECOUSSE DU JEU (2026-10-17, « le dernier shake cam est
	# un peu trop violent ») : la vignette est petite, le coup est le meme.
	island.play_eruption(ms, true, SINK_SHAKE)
	if island._sink_sky != null:
		island._sink_sky.visible = true
		island._sink_sky.play(ms)
	await _wait(ms / 1000.0 * 0.8, tok)


# ── Le livre de la mer : a plusieurs sur l'ile ──────────────────────────────
# Ce que le serveur dit aux autres (`rabbit_pushed`, `lightning_struck`,
# `rabbit_inked`) joue par les memes fonctions de l'ile et du lapin.

## DEUX SUR L'ILE : la mer apporte l'ile, Kuro tombe a cote de Shiro.
func _two(tok: int) -> void:
	if not plan.has("pb"):
		return
	await _rise(tok)
	if tok != token:
		return
	_put_shiro(plan.pa)
	aim(plan.pb, 1.2, 8.0)
	if not await _wait(1.2, tok):
		return
	_spawn_kuro(plan.pb).drop_in()
	Sound.play("hop", 0.9)
	await _wait(1.4, tok)


## LA POUSSEE : Kuro marche sur Shiro, qui recule d'une case ; puis, au
## bord, la meme poussee l'envoie dans les vagues. Kuro, pas Shiro : Shiro ne
## leve pas la patte sur son frere (son livre le dit).
func _push(tok: int) -> void:
	if not plan.has("pb"):
		return
	var r := _spawn_kuro(plan.pa)
	_put_shiro(plan.pb)
	aim(plan.pb, 0.0, 6.0)
	if not await _wait(0.9, tok):
		return
	_shove(r, plan.pb, plan.pc, tok)
	if not await _wait(1.6, tok) or not plan.has("sb"):
		return
	r.place_at(plan.sa)
	_put_shiro(plan.sb)
	aim(plan.sb, 0.0, 6.5)
	if not await _wait(0.9, tok):
		return
	_shove(r, plan.sb, Vector2i(-1, -1), tok)
	await _wait(3.2, tok)


## Kuro prend la case de Shiro ; Shiro vole jusqu'a `to`, ou a l'eau sans `to`
## (il remonte au depart). Sa plaque rougit sur Kuro : il sait qui l'a fait.
func _shove(r: IslandRabbit, at: Vector2i, to: Vector2i, tok: int) -> void:
	var toward: Vector2i = at - r._at
	r.send_to(at)
	if not await _wait(HomeRabbit.HOP_SECONDS * 0.6, tok):
		return
	var me: IslandRabbit = island._rabbit
	if to.x >= 0:
		me.knock_to(to)
		island.local_run.at = to
		Sound.play("hop", 0.8)
		me.stun(900)
	else:
		me.drown(toward, plan.start, 2400)
		island.local_run.at = plan.start
		get_tree().create_timer(IslandRabbit.DROWN_FALL).timeout.connect(func() -> void:
			Sound.play("hop", 0.55))
	r.blame()
	island._refresh_ring()


## L'ORAGE : l'eclair sur Kuro, le carre s'ouvre (bombes comprises, coffres
## epargnes), Kuro foudroye et sonne.
func _bolt(tok: int) -> void:
	if not plan.has("k"):
		return
	var r := _spawn_kuro(plan.k)
	aim(plan.k, 0.0, 7.0)
	if not await _wait(1.0, tok):
		return
	var board := _board()
	var cells: Array[Vector2i] = []
	var tiles: Array = []
	for dy in [-1, 0, 1]:
		for dx in [-1, 0, 1]:
			var c: Vector2i = plan.k + Vector2i(dx, dy)
			if board.content.has(c):
				cells.append(c)
				tiles.append(board.index_of(c))
	island._on_lightning({"tiles": tiles})
	r.electrocute(2000, false)
	if not await _wait(0.25, tok):
		return
	var names := {}
	for n in IslandBoard.CONTENT_OF:
		names[IslandBoard.CONTENT_OF[n]] = n
	for c in cells:
		var what = board.content[c]
		if board.state.get(c) == IslandBoard.State.DUG or what == IslandBoard.Content.CHEST:
			continue
		board.reveal_remote(board.index_of(c), String(names.get(what, "empty")), int(board.adjacent.get(c, 0)))
		if what == IslandBoard.Content.BOMB:
			island._on_remote_reveal(c, "bomb")
	island._tiles.refresh()
	r.stun(2000)
	await _wait(2.4, tok)


## L'ENCRE : Kuro encre Shiro — le calmar gicle, et Shiro reste teinte
## d'encre tant qu'elle tient (sur Kuro, le lapin noir, elle ne se voit pas).
func _bloop(tok: int) -> void:
	if not plan.has("pb"):
		return
	_put_shiro(plan.pb)
	var r := _spawn_kuro(plan.pa)
	# Le calmar surgit haut au-dessus de lui : la camera regarde plus haut.
	aim(plan.pb + Vector2i(-2, -2), 0.0, 7.0)
	if not await _wait(0.9, tok):
		return
	island._rabbit.inked(4000)
	r.blame()
	Sound.play("hop", 1.4)
	await _wait(3.4, tok)
