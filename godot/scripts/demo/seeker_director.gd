extends Node
## LE REALISATEUR DE LA VIDEO SEEKER — le vrai jeu (main.tscn), joue par un
## doigt qu'on voit.
##
##   marketing/seeker.sh      (serveur local 3012, Movie Maker, 890x400)
##
## Chaque geste est un VRAI clic : la main (bench_hand.gd) glisse jusqu'au
## point, appuie, et un clic souris part a cet endroit dans le viewport. Le jeu
## le recoit comme celui d'un joueur — l'accueil, la lecon, le terrier, DIG,
## une ile en ligne. Le realisateur ne triche que pour CHOISIR ou taper : il lit
## le plateau (et, en ligne, les bombes que le serveur de scene lui donne par
## `oracle.ts`), jamais pour jouer a la place du jeu.
##
## Le user, 2026-09-30 : « met bien le doigt qui joue, c'est hyper important ».

## Le temps entre deux gestes : un joueur qui lit, pas un bot. La lecon plus
## lente : ses legendes doivent se lire a l'ecran.
const BEAT_S := 0.75
const LESSON_BEAT_S := 1.0
## Combien de bombes marquer d'une croix, et sur laquelle sauter, dans la
## partie en ligne : les deux gestes du jeu, une fois chacun au moins.
const SHOW_MARKS := 3
const SHOW_BLAST_AT := 2

var _hand: BenchHand
var _main: Node
## Un journal pour le montage : `[film] <t> <moment>`, en secondes DE FILM
## (le Movie Maker ne va pas au temps reel) — les coupes se calent dessus.
var _clock := 0.0
## Le dossier de l'oracle (`-- --oracle=<dossier>`).
var _oracle := ""


func _process(delta: float) -> void:
	_clock += delta


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--oracle="):
			_oracle = arg.trim_prefix("--oracle=")
	_main = preload("res://scenes/main.tscn").instantiate()
	add_child(_main)
	_hand = BenchHand.new()
	_hand.layer = 110
	add_child(_hand)
	_run.call_deferred()


func _mark_time(what: String) -> void:
	print("[film] %.2f %s" % [_clock, what])


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## Attend que `cond` soit vrai, `limit` secondes au plus.
func _until(cond: Callable, limit: float = 20.0) -> bool:
	var left := limit
	while not cond.call():
		await get_tree().process_frame
		left -= get_process_delta_time()
		if left <= 0.0:
			return false
	return true


# ── Le doigt ────────────────────────────────────────────────────────────────

## La main va a `at` (coordonnees du viewport), appuie : un clic part la.
func _tap(at: Vector2) -> void:
	await _hand.tap(at, func() -> void: _click(at))


func _click(at: Vector2) -> void:
	for down in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = down
		ev.position = at
		ev.global_position = at
		get_viewport().push_input(ev, true)


func _tap_control(c: Control) -> void:
	await _tap(c.get_global_rect().get_center())


# ── Trouver les pieces du jeu ───────────────────────────────────────────────

## Le premier noeud porte par ce script (`res://scripts/<name>.gd`), ou null.
func _find(script_name: String) -> Node:
	var path := "res://scripts/%s.gd" % script_name
	var stack: Array[Node] = [get_tree().root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		var s: Script = n.get_script()
		if s != null and s.resource_path == path and n.is_inside_tree():
			return n
		for c in n.get_children():
			stack.append(c)
	return null


func _island() -> Node:
	return _find("island")


## Le milieu d'une case de l'ile, a l'ecran.
func _cell_on_screen(island: Node2D, cell: Vector2i) -> Vector2:
	var map = island.get("_terrain").map
	var local: Vector2 = map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	return island.get_global_transform_with_canvas() * local


# ── Le film ─────────────────────────────────────────────────────────────────

func _run() -> void:
	await _doorstep()
	await _tutorial()
	await _to_dig()
	await _online_run()
	await _until(func() -> bool: return _find("burrow") != null, 40.0)
	_mark_time("home")
	await _wait(4.0)
	_mark_time("end")


## L'ACCUEIL : il s'ouvre, on le laisse respirer, le doigt presse « jouer ».
func _doorstep() -> void:
	await _until(func() -> bool: return _find("title") != null)
	_mark_time("title")
	var title := _find("title")
	var guest: Control = title.get("_guest")
	await _until(func() -> bool:
		return is_instance_valid(guest) and not guest.disabled and guest.is_visible_in_tree())
	await _wait(2.5)
	_mark_time("tap-guest")
	await _tap_control(guest)


## LA LECON, jouee comme un joueur la joue : vers la bombe enseignee par les
## cases que la retenue ouvre, MARK A BOMB, la croix, puis le coffre.
func _tutorial() -> void:
	await _until(func() -> bool:
		var i := _island()
		return i != null and i.get("_board") != null and bool(i.call("_is_tutorial")), 30.0)
	_mark_time("tutorial")
	await _wait(2.0)
	var island: Node2D = _island()
	var board: IslandBoard = island.get("_board")
	var bomb := TutorialMap.bomb()
	var chest := TutorialMap.chest()
	var guard := 0
	while not bool(island.get("_done")) and guard < 60:
		guard += 1
		var rabbit: HomeRabbit = island.get("_rabbit")
		await _until(func() -> bool: return not rabbit.hopping(), 5.0)
		await _wait(LESSON_BEAT_S)
		var here := rabbit.at()
		# LA CROIX : a cote de la bombe, pas encore marquee.
		if not board.is_flagged(bomb) and board.is_beside(here, bomb):
			_mark_time("mark")
			await _tap_control(island.get("_mark"))
			await _wait(0.9)
			await _tap(_cell_on_screen(island, bomb))
			await _wait(1.2)
			continue
		var goal := bomb if not board.is_flagged(bomb) else chest
		var best := Vector2i(-1, -1)
		var best_d := 1 << 30
		for n in board._neighbours(here):
			if not board.may_step(here, n) or n == bomb:
				continue
			var d: int = 0 if n == goal else board._steps_between(n, goal)
			if d < best_d:
				best_d = d
				best = n
		if best.x < 0:
			_mark_time("stuck")
			return
		await _tap(_cell_on_screen(island, best))
	_mark_time("tutorial-done")



## DU TERRIER A L'ILE : l'ilot DIG est sorti de l'eau apres la lecon ; le
## doigt tape son panneau.
func _to_dig() -> void:
	await _until(func() -> bool: return _find("burrow") != null, 40.0)
	_mark_time("burrow")
	var marks := _find("burrow_landmarks")
	await _until(func() -> bool:
		var signs: Dictionary = marks.get("_signs")
		return signs.has("dig") and (signs["dig"] as Control).is_visible_in_tree(), 20.0)
	await _wait(3.0)
	_mark_time("tap-dig")
	await _tap_control(marks.get("_signs")["dig"])


## Ce que l'oracle sait de l'ile `seed` : {bombs, chests, revealed...}, ou {}.
func _where(seed: String) -> Dictionary:
	if _oracle.is_empty():
		return {}
	var f := FileAccess.open(_oracle + "/want.txt", FileAccess.WRITE)
	f.store_string(seed)
	f.close()
	var got := {}
	for i in 30:
		await _wait(0.1)
		var text := FileAccess.get_file_as_string(_oracle + "/where.json")
		var j: Variant = JSON.parse_string(text) if not text.is_empty() else null
		if j is Dictionary and String(j.get("seed", "")) == seed and j.has("bombs"):
			got = j
			break
	return got


## UNE VRAIE PARTIE, EN LIGNE : vers le coffre le plus proche, sur des cases
## sures ; une bombe voisine, il la marque d'une croix (SHOW_MARKS fois) ; une
## fois, il saute dessus pour la montrer. Tout part par le doigt.
func _online_run() -> void:
	await _until(func() -> bool:
		var i := _island()
		return i != null and i.get("_board") != null and bool(i.get("_remote")) \
			and not RunState.current.seed.is_empty(), 40.0)
	_mark_time("island")
	await _wait(2.5)
	var island: Node2D = _island()
	var board: IslandBoard = island.get("_board")
	var seed := RunState.current.seed
	var marked := 0
	var blasted := false
	var guard := 0
	while guard < 90 and is_instance_valid(island) and _island() == island:
		guard += 1
		var rabbit: IslandRabbit = island.get("_rabbit")
		await _until(func() -> bool: return not is_instance_valid(rabbit) or not rabbit.hopping(), 5.0)
		await _wait(BEAT_S)
		if not is_instance_valid(island) or _island() != island:
			break
		var w := await _where(seed)
		if w.is_empty():
			_mark_time("no-oracle")
			return
		var bombs := {}
		for t in w.get("bombs", []):
			bombs[board.cell_of(int(t))] = true
		var chests: Array[Vector2i] = []
		for t in w.get("chests", []):
			chests.append(board.cell_of(int(t)))
		if chests.is_empty():
			_mark_time("chests-done")
			break
		var here: Vector2i = island.call("_me_cell")
		# LA CROIX : une bombe voisine, pas encore marquee.
		var mine := Vector2i(-1, -1)
		for n in board._neighbours(here):
			if bombs.has(n) and not board.is_flagged(n):
				mine = n
				break
		if mine.x >= 0 and marked < SHOW_MARKS and not (marked == SHOW_BLAST_AT and not blasted):
			_mark_time("mark")
			var button: Control = _find("ui/mark_bomb_button").get("_button")
			await _tap_control(button)
			await _wait(0.6)
			await _tap(_cell_on_screen(island, mine))
			marked += 1
			await _wait(1.0)
			continue
		# LE SAUT SUR LA BOMBE, une fois, pour la voir sauter.
		if mine.x >= 0 and not blasted and marked >= SHOW_BLAST_AT and board.may_step(here, mine):
			_mark_time("blast")
			blasted = true
			await _tap(_cell_on_screen(island, mine))
			await _wait(2.6)
			continue
		var goal := chests[0]
		for c in chests:
			if Vector2(c - here).length() < Vector2(goal - here).length():
				goal = c
		var best := Vector2i(-1, -1)
		var best_d := INF
		for n in board._neighbours(here):
			if bombs.has(n) or board.is_flagged(n) or not board.may_step(here, n):
				continue
			var d := Vector2(goal - n).length() + randf() * 0.8
			if n == goal:
				d = -1.0
			if d < best_d:
				best_d = d
				best = n
		if best.x < 0:
			_mark_time("stuck")
			break
		await _tap(_cell_on_screen(island, best))
	_mark_time("run-done")
