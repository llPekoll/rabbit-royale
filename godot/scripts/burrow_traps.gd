extends Node2D
class_name BurrowTraps
## LES BOMBES ENTERREES DANS LE TERRIER — celles du proprietaire.
##
## Porte de BurrowScene.ts : `addTrap`, `paintTrap`, `setTrapRearm`,
## `advanceRearm`, `removeTrap`, `springTrap`, `dustPuff`, et l'apercu de
## retrait (`raiseTrap` / `lowerLifted`) ; et de l'effet de page.tsx qui
## SYNCHRONISE le plateau sur la liste du serveur.
##
## LE SERVEUR D'ABORD, JAMAIS L'OPTIMISME. Une marque ne se pose qu'une fois
## le serveur d'accord, et ne part qu'une fois qu'il a dit la case libre :
## « an optimistic one would show a defence that is not there, which on a
## defensive mechanic is the worst possible lie to tell a player ». Ce noeud
## ne parle donc pas au reseau : `sync` recoit l'etat de ShopState et le
## dessine, dans les deux sens (le web n'ajoutait que, et une bombe relevee
## revenait aussitot).
##
## MONTEES DANS LE BLOC DE LEUR CASE (`mount_veil`, z 3) : la marque et la
## bombe se trient avec le sol, au-dessus du losange de placement (z 2).
##
## UNE BOMBE QUI SE RECHARGE SE REMPLIT, comme un verre : une copie pale pour
## ce qui reste a venir, une copie pleine COUPEE a une ligne d'eau qui monte.
## La frontiere entre les deux EST la jauge — « a LINE has a position, and a
## position is read as a level without being taught ».

## L'art de l'ile, le meme partout ou le joueur rencontre une bombe
## (`Keys.BOMB_SMALL` = ui/icons/bomb.png, 27x36).
const BOMB := preload("res://assets/ui/icons/bomb.png")
## Ancree au pied : la bombe REPOSE sur la case comme le lapin et les plants.
const BOMB_ANCHOR_Y := 0.86
## `trapBombScale` : taillee sur la CASE, pas sur ses propres pixels.
const BOMB_WIDTH_OF_HALF_W := 0.62

## Posee = A TOI : l'or de la couronne et des carottes.
const TRAP_TINT := Color("#ffd45c")
## Sous le doigt qui propose de la relever : ceci DEFAIT quelque chose.
const LIFT_TINT := Color("#ff6b4a")
const LIFT_PX := 5.0
## La copie pale de la bombe qui se recharge.
const REARMING_ALPHA := 0.3
## Le souffle d'une bombe qui saute sous un pillard.
const BLAST_TINT := Color("#ff6b6b")
const DUST := Color("#c9b48a")

## z LOCAL au bloc de la case : au-dessus du sol (1) et du losange (2).
const Z_TRAP := 3

var terrain: BurrowTerrain
## Le terrier du serveur : `cell_of` d'un index.
var layout: BurrowLayout

## case (index) -> {group, marker, bomb, filled, charge, left_ms, total_ms}
var _traps: Dictionary = {}
## L'index de la bombe soulevee par l'apercu de retrait, ou -1.
var _lifted := -1
var _lift_tween: Tween
## Les cases que le JOUEUR vient de poser : elles arrivent avec le rebond et
## la poussiere. Les autres (relecture, retour d'un raid) arrivent posees.
var _fresh: Dictionary = {}

## LE FANTOME (`GhostBomb`) : la bombe qu'une tape enterrerait, pale, sur la
## case visee. MEME texture, ancre et echelle que la vraie — un fantome d'une
## autre taille promettrait un autre resultat.
const GHOST_ALPHA := 0.55
## Il respire de 2 px : un souffle, pas un rebond.
const GHOST_BOB_PX := 2.0

## Deux noeuds expres : le PORTEUR est monte dans la case (et `mount_veil`
## ecrase sa position), le SPRITE dedans est ce qui respire. Sur un seul
## noeud, chaque changement de case casserait le tween.
var _ghost: Node2D
var _ghost_sprite: Sprite2D
var _ghost_tile := -1
var _ghost_bob: Tween
var _ghost_fade: Tween
## La case dont la pose est EN VOL : le fantome y reste, quoi que fasse le
## doigt, jusqu'a ce que la vraie bombe le remplace ou que le serveur refuse.
var _ghost_pinned := -1

static var _outline: ImageTexture
static var _solid: ImageTexture


func has_trap(tile: int) -> bool:
	return _traps.has(tile)


func tiles() -> Array:
	return _traps.keys()


## LA POSE QUE LE JOUEUR VIENT DE FAIRE, annoncee avant que l'etat du serveur
## arrive : elle aura droit au rebond et a la poussiere.
func expect_fresh(tile: int) -> void:
	_fresh[tile] = true


## L'ETAT DU SERVEUR (`/api/traps` : placed, armed, rearming[{tile, readyAt}]),
## dessine tel quel. Rappelable a chaque relecture : ce qui n'a pas change ne
## bouge pas.
func sync(state: Dictionary) -> void:
	var placed: Array = state.get("placed", []) if state.get("placed") is Array else []
	var armed := {}
	for t in (state.get("armed", placed) if state.get("armed") is Array else placed):
		armed[int(t)] = true
	var rearm := {}
	for r in (state.get("rearming", []) if state.get("rearming") is Array else []):
		if r is Dictionary:
			rearm[int(r.get("tile", -1))] = _ms_until(String(r.get("readyAt", "")))

	var now := {}
	for t in placed:
		now[int(t)] = true
	for tile in _traps.keys():
		if not now.has(tile):
			remove_trap(tile)
	var total := float(Tuning.i("TRAPS.REARM_MS", 3 * 3600 * 1000))
	for tile in now:
		var fresh := _fresh.has(tile)
		_fresh.erase(tile)
		add_trap(tile, fresh, armed.has(tile) or not rearm.has(tile))
		if rearm.has(tile):
			set_rearm(tile, float(rearm[tile]), total)
		else:
			set_rearm(tile, 0.0, 0.0)


## Une date ISO du serveur, en millisecondes d'ici.
static func _ms_until(iso: String) -> float:
	if iso.is_empty():
		return 0.0
	var clean := iso.split(".")[0].trim_suffix("Z")
	var at := Time.get_unix_time_from_datetime_string(clean)
	return maxf(0.0, (float(at) - Time.get_unix_time_from_system()) * 1000.0)


## MONTRE UNE BOMBE que le proprietaire a posee.
func add_trap(tile: int, animate: bool = true, armed: bool = true) -> void:
	if _traps.has(tile) or terrain == null or layout == null:
		return
	var cell := BurrowLayout.cell_of(tile)
	var group := Node2D.new()
	group.name = "trap-%d" % tile

	var marker := Sprite2D.new()
	marker.texture = _outline_texture()
	group.add_child(marker)

	var k := Iso.half_w() * BOMB_WIDTH_OF_HALF_W / float(BOMB.get_width())
	var offset := Vector2(-BOMB.get_width() * 0.5, -BOMB.get_height() * BOMB_ANCHOR_Y)
	# LA BOMBE, DEUX FOIS : la pale est ce qui n'est pas encore charge, la
	# pleine est coupee a la ligne d'eau. Meme texture, meme ancre, meme
	# echelle — les deux se superposent au pixel.
	var bomb := Sprite2D.new()
	bomb.texture = BOMB
	bomb.centered = false
	bomb.offset = offset
	bomb.scale = Vector2(k, k)
	group.add_child(bomb)

	# PAS DE MASQUE : une COUPE de la texture (`region`), recalee pour que la
	# tranche reste la ou elle appartient. Le web y est arrive apres deux
	# masques rates ; la region de Godot est la meme idee, sans second noeud.
	var filled := Sprite2D.new()
	filled.texture = BOMB
	filled.centered = false
	filled.region_enabled = true
	filled.scale = Vector2(k, k)
	group.add_child(filled)

	if not terrain.mount_veil(cell, group, Z_TRAP):
		group.free()
		return
	# LA VRAIE BOMBE PREND LA PLACE DU FANTOME, dans la meme image.
	if _ghost_tile == tile or _ghost_pinned == tile:
		_ghost_pinned = -1
		_hide_ghost()
	_traps[tile] = {"group": group, "marker": marker, "bomb": bomb, "filled": filled,
		"base": offset, "charge": 1.0 if armed else 0.0, "left_ms": 0.0, "total_ms": 0.0}
	_paint(tile)

	if animate:
		group.scale = Vector2.ZERO
		var pop := group.create_tween()
		pop.tween_property(group, "scale", Vector2.ONE, 0.28) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		# De la poussiere : une bombe ENTERREE, pas une marque posee.
		_dust_puff(group)


## RELEVEE (ou disparue de la liste du serveur) : elle s'efface.
func remove_trap(tile: int) -> void:
	var t: Dictionary = _traps.get(tile, {})
	if t.is_empty():
		return
	_traps.erase(tile)
	if _lifted == tile:
		_lifted = -1
		if _lift_tween != null and _lift_tween.is_valid():
			_lift_tween.kill()
	var group: Node2D = t.group
	if not is_instance_valid(group):
		return
	var fade := group.create_tween()
	fade.tween_property(group, "modulate:a", 0.0, 0.25)
	fade.tween_callback(group.queue_free)


## TOUT EST JETE avec le terrain (les groupes vivent dans ses blocs) : la
## liste doit mourir avec, sinon elle garde des noeuds morts et `add_trap`
## refuse de reposer une bombe qu'elle croit deja la — les « bombes
## fantomes » du web.
func clear() -> void:
	for t in _traps.values():
		if is_instance_valid(t.group):
			t.group.queue_free()
	_traps.clear()
	_lifted = -1
	_fresh.clear()
	# Le fantome vit dans un bloc lui aussi : il part avec.
	_ghost_pinned = -1
	_hide_ghost()
	if is_instance_valid(_ghost):
		_ghost.queue_free()
	_ghost = null
	_ghost_sprite = null


## LE FANTOME SOUS LE DOIGT (ou la souris) : sur une case libre, la bombe
## qu'une tape y enterrerait. `-1` le range. Sans effet pendant qu'une pose
## est en vol — le fantome tient la case qui attend sa reponse.
func show_ghost(tile: int) -> void:
	if _ghost_pinned >= 0:
		return
	if tile < 0 or _traps.has(tile):
		_hide_ghost()
		return
	if tile == _ghost_tile and is_instance_valid(_ghost) and _ghost.visible:
		return
	if not _mount_ghost(tile):
		return
	# UN FONDU COURT par case plutot qu'un pop : le doigt traverse les cases
	# plus vite qu'un pop ne finit, et une trainee de bombes a demi-taille se
	# lit comme du lag.
	_ghost.modulate.a = 0.0
	_ghost_fade = _ghost.create_tween()
	_ghost_fade.tween_property(_ghost, "modulate:a", 1.0, 0.08)


## LA TAPE EST PARTIE : le fantome reste sur sa case, plein d'emblee (il y
## etait deja sous le doigt), et un anneau d'or s'ouvre dessous
## (`pressRipple`) — la couleur que la case prend quand la bombe y est.
func pin_ghost(tile: int) -> void:
	_ghost_pinned = -1
	if tile < 0 or _traps.has(tile) or not _mount_ghost(tile):
		return
	_ghost_pinned = tile
	_ghost.modulate.a = 1.0
	_ripple(tile)


## Le serveur a repondu. Si la bombe est arrivee, `add_trap` a deja pris sa
## place ; sinon (refus, reseau) le fantome s'efface.
func unpin_ghost() -> void:
	if _ghost_pinned < 0:
		return
	_ghost_pinned = -1
	if is_instance_valid(_ghost) and _ghost.visible:
		_ghost_fade = _ghost.create_tween()
		_ghost_fade.tween_property(_ghost, "modulate:a", 0.0, 0.2)
		_ghost_fade.tween_callback(_hide_ghost)


## Monte le porteur dans le bloc de `tile`, le construit au premier usage.
## MEME `mount_veil` et meme z que la vraie bombe : l'apercu et ce qui le
## remplace partagent leur position au pixel.
func _mount_ghost(tile: int) -> bool:
	if terrain == null or layout == null:
		return false
	if _ghost_fade != null and _ghost_fade.is_valid():
		_ghost_fade.kill()
	if not is_instance_valid(_ghost):
		_ghost = Node2D.new()
		_ghost.name = "ghost-bomb"
		_ghost_sprite = Sprite2D.new()
		_ghost_sprite.texture = BOMB
		_ghost_sprite.centered = false
		_ghost_sprite.offset = Vector2(-BOMB.get_width() * 0.5, -BOMB.get_height() * BOMB_ANCHOR_Y)
		var k := Iso.half_w() * BOMB_WIDTH_OF_HALF_W / float(BOMB.get_width())
		_ghost_sprite.scale = Vector2(k, k)
		_ghost_sprite.modulate.a = GHOST_ALPHA
		_ghost.add_child(_ghost_sprite)
	if _ghost.get_parent() != null:
		_ghost.get_parent().remove_child(_ghost)
	if not terrain.mount_veil(BurrowLayout.cell_of(tile), _ghost, Z_TRAP):
		_ghost_tile = -1
		return false
	_ghost_tile = tile
	_ghost.visible = true
	if _ghost_bob == null or not _ghost_bob.is_valid():
		_ghost_sprite.position.y = 0.0
		_ghost_bob = _ghost_sprite.create_tween().set_loops()
		_ghost_bob.tween_property(_ghost_sprite, "position:y", -GHOST_BOB_PX, 0.6) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_ghost_bob.tween_property(_ghost_sprite, "position:y", 0.0, 0.6) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	return true


func _hide_ghost() -> void:
	_ghost_tile = -1
	if _ghost_fade != null and _ghost_fade.is_valid():
		_ghost_fade.kill()
	if _ghost_bob != null and _ghost_bob.is_valid():
		_ghost_bob.kill()
	_ghost_bob = null
	if is_instance_valid(_ghost):
		_ghost.visible = false
		_ghost_sprite.position.y = 0.0


## L'ANNEAU D'OR qui s'ouvre de la case, et le losange qui flashe dessous.
func _ripple(tile: int) -> void:
	var cell := BurrowLayout.cell_of(tile)
	var flash := Sprite2D.new()
	flash.texture = _solid_texture()
	flash.modulate = Color(TRAP_TINT, 0.5)
	var ring := Sprite2D.new()
	ring.texture = _outline_texture()
	ring.modulate = Color(TRAP_TINT, 0.95)
	# Sous la bombe (z 3) pour le flash, au-dessus pour l'anneau qui s'ecarte.
	if not terrain.mount_veil(cell, flash, Z_TRAP - 1):
		flash.free()
	else:
		var f := flash.create_tween()
		f.tween_property(flash, "modulate:a", 0.0, 0.4) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		f.tween_callback(flash.queue_free)
	if not terrain.mount_veil(cell, ring, Z_TRAP + 1):
		ring.free()
		return
	var r := ring.create_tween().set_parallel(true)
	r.tween_property(ring, "scale", Vector2(1.7, 1.7), 0.55) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	r.tween_property(ring, "modulate:a", 0.0, 0.55) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	r.chain().tween_callback(ring.queue_free)


## OU EN EST SA RECHARGE, selon le serveur. `left_ms <= 0` : armee.
func set_rearm(tile: int, left_ms: float, total_ms: float) -> void:
	var t: Dictionary = _traps.get(tile, {})
	if t.is_empty():
		return
	if left_ms <= 0.0:
		var was: float = t.charge
		t.charge = 1.0
		t.left_ms = 0.0
		t.total_ms = 0.0
		_paint(tile)
		# LE RETOUR SE FETE, sur la TRANSITION seulement — sinon chaque
		# relecture ferait tressaillir un plateau arme.
		if was < 1.0:
			var group: Node2D = t.group
			group.scale = Vector2(1.18, 1.18)
			group.create_tween().tween_property(group, "scale", Vector2.ONE, 0.4) \
				.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		return
	var total := maxf(1.0, total_ms if total_ms > 0.0 else left_ms)
	t.left_ms = left_ms
	t.total_ms = total
	t.charge = clampf(1.0 - left_ms / total, 0.0, 1.0)
	_paint(tile)


## LA RAMPE ENTRE DEUX RELECTURES, plafonnee sous 1 : le dernier eclat
## appartient au serveur, qui seul dit quand elle re-arme.
func _process(delta: float) -> void:
	for tile in _traps:
		var t: Dictionary = _traps[tile]
		if float(t.total_ms) <= 0.0:
			continue
		t.left_ms = maxf(0.0, float(t.left_ms) - delta * 1000.0)
		var charge := minf(0.98, 1.0 - float(t.left_ms) / float(t.total_ms))
		if absf(charge - float(t.charge)) < 0.002:
			continue
		t.charge = charge
		_paint(tile)


## UNE BOMBE A SA CHARGE : le seul endroit qui change une fraction en pixels.
func _paint(tile: int) -> void:
	var t: Dictionary = _traps.get(tile, {})
	if t.is_empty():
		return
	var charge := clampf(float(t.charge), 0.0, 1.0)
	var marker: Sprite2D = t.marker
	var lifting := _lifted == tile
	marker.modulate = LIFT_TINT if lifting else TRAP_TINT
	marker.modulate.a = 0.95 if lifting else 0.55 + 0.2 * charge
	var bomb: Sprite2D = t.bomb
	bomb.modulate.a = REARMING_ALPHA

	var filled: Sprite2D = t.filled
	filled.visible = charge > 0.0
	if charge <= 0.0:
		return
	var w := float(BOMB.get_width())
	var h := float(BOMB.get_height())
	var slice := maxf(1.0, roundf(h * charge))
	filled.region_rect = Rect2(0, h - slice, w, slice)
	# La tranche garde sa place : le bas de la coupe est le bas de l'image.
	var base: Vector2 = t.base
	filled.offset = base + Vector2(0, h - slice)


## L'APERCU DE RETRAIT : sous le doigt, la bombe d'une case minee SORT de sa
## case (et respire), sa marque passe au rouge. `-1` la repose.
func set_lifted(tile: int) -> void:
	if tile == _lifted:
		return
	var was := _lifted
	_lifted = tile if _traps.has(tile) else -1
	if _lift_tween != null and _lift_tween.is_valid():
		_lift_tween.kill()
	if _traps.has(was):
		_raise(was, 0.0, 0.12)
		_paint(was)
	if _lifted >= 0:
		_paint(_lifted)
		_lift_tween = _raise(_lifted, -LIFT_PX, 0.14)
		_lift_tween.tween_property(_traps[_lifted].bomb, "position:y", -LIFT_PX - 2.0, 0.5) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_lift_tween.parallel().tween_property(_traps[_lifted].filled, "position:y",
			-LIFT_PX - 2.0, 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		# Et redescend : le va-et-vient du `yoyo` du web. La boucle reprend au
		# premier pas, qui vise deja -LIFT_PX : il ne coute rien.
		_lift_tween.tween_property(_traps[_lifted].bomb, "position:y", -LIFT_PX, 0.5) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_lift_tween.parallel().tween_property(_traps[_lifted].filled, "position:y",
			-LIFT_PX, 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		_lift_tween.set_loops()


func _raise(tile: int, y: float, seconds: float) -> Tween:
	var t: Dictionary = _traps[tile]
	var tw := create_tween()
	tw.tween_property(t.bomb, "position:y", y, seconds).set_trans(Tween.TRANS_QUAD) \
		.set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(t.filled, "position:y", y, seconds) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	return tw


## UNE BOMBE SAUTE SOUS LE PILLARD : un losange rouge qui s'ouvre et s'eteint
## (`springTrap`). Le son et le sursaut du lapin sont a l'appelant.
func spring(tile: int) -> void:
	if terrain == null:
		return
	var blast := Sprite2D.new()
	blast.texture = _outline_texture()
	blast.modulate = BLAST_TINT
	if not terrain.mount_veil(BurrowLayout.cell_of(tile), blast, Z_TRAP + 1):
		blast.free()
		return
	var tw := blast.create_tween().set_parallel(true)
	tw.tween_property(blast, "scale", Vector2(2.2, 2.2), 0.45) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(blast, "modulate:a", 0.0, 0.45)
	tw.chain().tween_callback(blast.queue_free)


## SIX GRAINS DE POUSSIERE jetes en l'air (`dustPuff`) — le bruit de creuser,
## dessine.
func _dust_puff(at: Node2D) -> void:
	for i in range(6):
		var puff := Node2D.new()
		var r := 2.0 + randf() * 2.0
		puff.draw.connect(func() -> void: puff.draw_circle(Vector2.ZERO, r, Color(DUST, 0.85)))
		puff.z_index = 5
		puff.position = Vector2(0, -2)
		at.add_child(puff)
		var dx := (float(i) / 5.0 - 0.5) * 26.0 + (randf() - 0.5) * 6.0
		var tw := puff.create_tween().set_parallel(true)
		tw.tween_property(puff, "position:x", dx, 0.42).set_ease(Tween.EASE_OUT)
		tw.tween_property(puff, "position:y", -12.0 - randf() * 8.0, 0.18) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(puff, "position:y", 2.0, 0.24).set_delay(0.18) \
			.set_ease(Tween.EASE_IN)
		tw.tween_property(puff, "modulate:a", 0.0, 0.2).set_delay(0.22)
		tw.chain().tween_callback(puff.queue_free)


## LE LOSANGE EN CONTOUR (`getDiamondOutline`) : 30 % de blanc et un trait de
## 2 px, a la taille de la case. Cuit une fois.
static func _outline_texture() -> ImageTexture:
	if _outline != null:
		return _outline
	var w := int(Iso.BURROW_TILE_W)
	var h := int(Iso.BURROW_TILE_H)
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var hw := w * 0.5
	var hh := h * 0.5
	# La distance au bord, en pixels, le long de la normale du cote.
	var norm := sqrt(hw * hw + hh * hh) / (hw * hh)
	for y in range(h):
		for x in range(w):
			var d := absf(x + 0.5 - hw) / hw + absf(y + 0.5 - hh) / hh
			if d > 1.0:
				continue
			var edge := (1.0 - d) / norm
			img.set_pixel(x, y, Color(1, 1, 1, 1.0 if edge < 2.0 else 0.3))
	_outline = ImageTexture.create_from_image(img)
	return _outline


## LE LOSANGE PLEIN (`burrowDiamondSolid`), a la taille de la case. Cuit une fois.
static func _solid_texture() -> ImageTexture:
	if _solid != null:
		return _solid
	var w := int(Iso.BURROW_TILE_W)
	var h := int(Iso.BURROW_TILE_H)
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(1, 1, 1, 0))
	var hw := w * 0.5
	var hh := h * 0.5
	for y in range(h):
		for x in range(w):
			if absf(x + 0.5 - hw) / hw + absf(y + 0.5 - hh) / hh <= 1.0:
				img.set_pixel(x, y, Color(1, 1, 1, 1))
	_solid = ImageTexture.create_from_image(img)
	return _solid
