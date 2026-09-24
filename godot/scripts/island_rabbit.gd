extends HomeRabbit
class_name IslandRabbit
## UN LAPIN SUR L'ILE — le mien, ou celui d'un autre joueur.
##
## Porte de src/game/entities/PlayerRabbit.ts, pour ce que l'ile lui fait subir
## et que le terrier ne connait pas : etre pousse, jete a l'eau, foudroye,
## vide de son energie, et porter un nom au-dessus de la tete.
##
## UN FILS DE HomeRabbit, pas un second lapin : la planche, l'ancre, la
## profondeur et le saut sont les memes, et deux tables ecrites a la main sont
## la facon dont deux lapins finissent par differer (voir ANIMS).
##
## LA POSITION DU NOEUD APPARTIENT A LA CASE (`_land`). Tout ce qui la deplace
## ici — le vol d'une poussee, la chute dans la mer — finit par reposer `_at`
## et appeler `_place`, sinon le prochain saut repartirait d'un demi-point.

## LES CINQ PELAGES, dans l'ordre du web (IslandScene.ts `BUNNY_SHEETS`) : le
## siege d'arrivee choisit la couleur, le premier est blanc.
const SHEETS: Array[Texture2D] = [
	preload("res://assets/bunnies/bunny-white.png"),
	preload("res://assets/bunnies/bunny-brown.webp"),
	preload("res://assets/bunnies/bunny-gray.webp"),
	preload("res://assets/bunnies/bunny-orange.webp"),
	preload("res://assets/bunnies/bunny-yellowish.webp"),
]

## LA POSE FOUDROYEE (bunnies/electrocuted.json) : deux cases de 32 dans des
## cellules de 34 extrudees d'un pixel, a x = 1 et 36.
const SHOCK_SHEET := preload("res://assets/bunnies/electrocuted.png")
const SHOCK_CELLS: Array[Vector2] = [Vector2(2, 2), Vector2(37, 2)]
const SHOCK_FPS := 16.0
## Combien de temps on la voit, au plus (Electrocute.ts).
const SHOCK_HOLD_MS := 1400

## LE NOM, au-dessus des oreilles (PlayerRabbit.ts `NAME_Y`, `NAME_TINT_*`),
## relie a la tete par un trait blanc. Ici les pieds sont a 0 (ancre 1,0), la
## tete a -44 : le trait va de sous la plaque au-dessus des oreilles.
const NAME_Y := -62.0
const NAME_SIZE := 9
const NAME_STEM_TOP := -55.0
const NAME_STEM_BOTTOM := -46.0
const NAME_TINT_ME := Color("#ffd45c")
const NAME_TINT_OTHER := Color("#ffffff")
## La plaque du pousseur rougit, puis revient (`blameName`, BLAME_MS).
const BLAME_TINT := Color("#ff6b5e")
const BLAME_SECONDS := 1.4

## LA POUSSEE (`playKnockback`) : un vol en cloche, deux tours en arriere, et
## l'atterrissage ecrase qui dit « sol ».
const KNOCK_FLIGHT := 0.55
const KNOCK_HEIGHT := 34.0
const KNOCK_SPINS := 2

## L'ARRIVEE (`playSpawnDrop`) : 120 px de haut, rebond, 0,35 s.
const DROP_PX := 120.0
const DROP_SECONDS := 0.35

## LA NOYADE (Drowning.stories.tsx, les chiffres reglés la-bas) : la chute du
## rivage a l'eau, l'enfoncement sous la surface, et la remontee au milieu.
const DROWN_FALL := 0.62
const DROWN_SINK_PX := 26.0
const DROWN_TILES := 2
## LA REMONTEE TOMBE DU CIEL : de assez haut pour sortir du cadre serre.
const SKY_DROP_PX := 420.0
const SKY_DROP_SECONDS := 0.55

## AU-DESSUS DE LA MER ET DE TOUT LE SOL pendant le vol : trie sur les cases,
## le lapin passerait sous la terrasse qu'il vient de quitter. Le relief monte
## a un millier ; le ciel tient 3000 (ombres des nuages) et 3500 (rais,
## sky_light.gd). ENTRE LES DEUX, avec les oiseaux : a 3000 pile, l'ombre des
## nuages passait par-dessus et le lapin disparaissait en plein vol.
const Z_AIR := 3200

## LE LAPIN S'ENFONCE A VUE : la mer se referme sur lui en 0,65 s, pas en
## 0,4 — trop vite, il s'effacait avant qu'on l'ait vu entrer (Paul,
## 2026-09-23 : « le lapin fade un peu trop tot »).
const SINK_SECONDS := 0.8
const FADE_DELAY := 0.25
const FADE_SECONDS := 0.65

## Le lapin assomme : trois etoiles d'or autour de la tete (`playStunned`).
const STAR_INK := Color("#ffd138")

## Le siege d'arrivee (la couleur), avant `build`.
var seat := 0
## Qui il est, pour la plaque et pour savoir si c'est le mien.
var player_id := ""

var _plate: Label
var _stem: Line2D
var _plate_ink := NAME_TINT_OTHER
var _blame: Tween
var _flight: Tween
var _shock: AnimatedSprite2D
## Le tremblement de la pose foudroyee. UN MEMBRE, pas une variable locale :
## une lambda capture par valeur, et celle qui doit le tuer ne le verrait pas.
var _rattle: Tween
var _stars: StunStars
## Sous l'eau : invisible, et rien ne doit le reposer avant la remontee.
var _under := false


## LA DERNIERE IMAGE PEINTE de chaque rangee, quand la table en dit plus : la
## rangee `damage` (48-55) n'a rien apres 52. Jouee jusqu'au bout, elle
## s'arretait sur une image VIDE — le lapin jete disparaissait en plein vol.
const LAST_PAINTED := {"damage": 52}


## LA PLANCHE DE SON SIEGE, meme table que HomeRabbit.
func _frames() -> SpriteFrames:
	var out := SpriteFrames.new()
	out.remove_animation("default")
	var sheet: Texture2D = SHEETS[posmod(seat, SHEETS.size())]
	for name in ANIMS:
		var def: Array = ANIMS[name]
		out.add_animation(name)
		out.set_animation_speed(name, def[2])
		out.set_animation_loop(name, def[3])
		for i in range(def[0], int(LAST_PAINTED.get(name, def[1])) + 1):
			var frame := AtlasTexture.new()
			frame.atlas = sheet
			frame.region = Rect2((i % SHEET_COLS) * FRAME, (i / SHEET_COLS) * FRAME, FRAME, FRAME)
			out.add_frame(name, frame)
	return out


func clear() -> void:
	super.clear()
	for n in [_plate, _stem, _shock, _stars]:
		if n != null and is_instance_valid(n):
			n.queue_free()
	_plate = null
	_stem = null
	_shock = null
	_stars = null
	_under = false
	modulate.a = 1.0


# ── Le nom ──────────────────────────────────────────────────────────────────

func set_plate(text: String, mine: bool) -> void:
	_plate_ink = NAME_TINT_ME if mine else NAME_TINT_OTHER
	if _plate == null:
		_stem = Line2D.new()
		_stem.width = 1.0
		_stem.default_color = Color(1, 1, 1, 0.85)
		_stem.points = PackedVector2Array([Vector2(0, NAME_STEM_TOP), Vector2(0, NAME_STEM_BOTTOM)])
		add_child(_stem)
		_plate = Label.new()
		_plate.add_theme_font_size_override("font_size", NAME_SIZE)
		_plate.add_theme_color_override("font_outline_color", Color("#1d1608"))
		_plate.add_theme_constant_override("outline_size", 3)
		_plate.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_plate.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
		# Au-dessus de tout le sol, comme le web qui sort les plaques du tri :
		# un nom cache derriere un sapin n'est plus un nom.
		_plate.z_as_relative = false
		_plate.z_index = Z_AIR + 10
		add_child(_plate)
	_plate.text = text
	_plate.add_theme_color_override("font_color", _plate_ink)
	_plate.size = Vector2(120, 14)
	_plate.position = Vector2(-60, NAME_Y - 7)


## CE LAPIN VIENT DE POUSSER LE MIEN : sa plaque rougit, puis revient.
func blame() -> void:
	if _plate == null:
		return
	if _blame != null and _blame.is_valid():
		_blame.kill()
	_plate.add_theme_color_override("font_color", BLAME_TINT)
	_blame = create_tween()
	_blame.tween_method(func(c: Color) -> void:
		if _plate != null:
			_plate.add_theme_color_override("font_color", c),
		BLAME_TINT, _plate_ink, BLAME_SECONDS).set_trans(Tween.TRANS_SINE)


# ── Arriver, partir ─────────────────────────────────────────────────────────

## IL TOMBE DU CIEL sur sa case (`playSpawnDrop`) : un joueur qui arrive, ou le
## mien a l'atterrissage.
func drop_in() -> void:
	if _sprite == null:
		return
	var home := Vector2.ZERO
	_sprite.position = home + Vector2(0, -DROP_PX)
	var t := create_tween().set_parallel(true)
	t.tween_property(_sprite, "position", home, DROP_SECONDS) \
		.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	# L'OMBRE GRANDIT A MESURE QU'IL APPROCHE du sol.
	if _shadow != null:
		_shadow.scale = Vector2(0.3, 0.3)
		t.tween_property(_shadow, "scale", Vector2.ONE, DROP_SECONDS) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)


## LE POSE AILLEURS SANS SAUT : une reprise, un instantane qui le dit ailleurs.
func place_at(cell: Vector2i) -> void:
	if _sprite == null or _under:
		return
	_land()
	_at = cell
	_home = cell
	_place()


## IL S'EN VA (`vanish`) : il s'efface en s'etirant, 0,3 s, puis disparait.
func vanish() -> void:
	var t := create_tween().set_parallel(true)
	t.tween_property(self, "modulate:a", 0.0, 0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	if _sprite != null:
		t.tween_property(_sprite, "scale", _sprite.scale * Vector2(0.6, 1.3), 0.3)
	t.chain().tween_callback(queue_free)


## A PLAT (`playExhausted`) : la run est finie, pas le lapin — il tombe de
## sommeil ou il se tient.
func exhaust() -> void:
	if _sprite == null:
		return
	# Une fois le dernier saut pose, pas a sa place : le pas qui depense le
	# dernier point est encore un pas, et on doit le voir avant la chute.
	if _hop != null and _hop.is_running():
		_hop.finished.connect(exhaust, CONNECT_ONE_SHOT)
		return
	_happy = false
	_sprite.play("damage")
	if _sprite.animation_finished.is_connected(_rest):
		_sprite.animation_finished.disconnect(_rest)
	_sprite.animation_finished.connect(func() -> void:
		if _sprite != null:
			_sprite.play("sleep"), CONNECT_ONE_SHOT)


## SA RUN EST FINIE sous les yeux des autres (`rabbit_died`). Foudroye, il
## s'effondre deja a la fin de l'eclair (`electrocute`, fatal) : on ne coupe
## pas le courant pour ca.
func fall_asleep() -> void:
	if _shocking:
		return
	exhaust()


## Vrai de la chute de l'eclair a la fin du courant — `_shock` n'existe
## qu'une fois l'eclair arrive, et `rabbit_died` le precede.
var _shocking := false


# ── La poussee ──────────────────────────────────────────────────────────────

## IL EST JETE sur `cell` (`playKnockback`) : un vol en cloche avec deux tours
## en arriere autour du ventre, puis l'atterrissage ecrase qui dit « sol ».
func knock_to(cell: Vector2i) -> void:
	if _sprite == null:
		return
	_land()
	var from := position
	var to := map.screen_of(cell.x, cell.y) + Vector2(0, Iso.half_h())
	_at = cell
	_home = cell
	# IL REGARDE D'OU IL VIENT : jete en arriere, le dos vers l'arrivee.
	if absf(to.x - from.x) > 0.5:
		_sprite.flip_h = to.x > from.x
	_sprite.play("damage")
	_spin_from_belly(true)
	z_index = Z_AIR
	_flight = _arc(from, to, KNOCK_HEIGHT, KNOCK_FLIGHT, -KNOCK_SPINS)
	_flight.tween_callback(func() -> void:
		_spin_from_belly(false)
		_place()
		_squash()
		_rest())
	_hop = _flight


## SUR UNE BOMBE (Paul, 2026-09-23) : trois temps, pas un de plus.
##
##   1. IL SAUTE sur la case de la bombe — le pas qu'on a demande ;
##   2. elle SAUTE quand il pose les pattes (l'ile retarde le feu du meme
##      `HOP_SECONDS`, `TileView.blast_delay`), et le souffle le RENVOIE en
##      cloche sur la case d'ou il venait, en tombant a plat (rangee `death`) ;
##   3. A TERRE, les etoiles une seconde, puis IL SE RELEVE (les deux dernieres
##      images de `damage` : a plat, debout).
##
## `back` est la case ou le serveur le pose (run.ts, `cameFrom`). Elle devient
## sa case TOUT DE SUITE : l'anneau, le prochain pas et le `rabbit_moved` qui
## suit la lisent — ce dernier, deja vrai, ne rejoue donc pas de saut.
const BLAST_FLIGHT := 0.45
## LE SOUFFLE PART 5 IMAGES AVANT LA FIN DU SAUT, quand les pattes touchent :
## attendre la derniere image du tween rendait le renvoi mou (Paul,
## 2026-09-23 : « 4-5 frames trop tard le push »). Le feu de la case et le son
## partent au meme instant (`TileView.blast_delay`, `Island._bomb_goes_off`).
const BLAST_AT := HomeRabbit.HOP_SECONDS - 0.08
const BLAST_HEIGHT := 26.0
const DOWN_SECONDS := 1.0
## Dans `damage` (48-52) : l'image a plat, puis debout.
const GET_UP_FRAME := 3
## La hauteur des etoiles au-dessus du lapin couche (debout : 42).
const STARS_DOWN_PX := 18.0

## Chaque renvoi a son numero : un pas qui interrompt le lapin a terre ne doit
## pas le voir se relever apres coup.
var _blast_seq := 0


func blast_back(bomb: Vector2i, back: Vector2i) -> void:
	if _sprite == null:
		return
	if _at != bomb:
		send_to(bomb)
	_blast_seq += 1
	var seq := _blast_seq
	_at = back
	_home = back
	if _hop != null and _hop.is_running():
		var wait := maxf(0.0, BLAST_AT - _hop.get_total_elapsed_time())
		get_tree().create_timer(wait).timeout.connect(func() -> void: _thrown(bomb, back, seq))
	else:
		_thrown(bomb, back, seq)


func _thrown(bomb: Vector2i, back: Vector2i, seq: int) -> void:
	if _sprite == null or seq != _blast_seq:
		return
	# Le saut n'a plus que quelques pixels a faire : le souffle le coupe.
	if _hop != null and _hop.is_valid():
		_hop.kill()
	_hop = null
	_upright()
	var from := map.screen_of(bomb.x, bomb.y) + Vector2(0, Iso.half_h())
	var to := map.screen_of(back.x, back.y) + Vector2(0, Iso.half_h())
	position = from
	# IL REGARDE LA BOMBE en s'envolant : jete a reculons.
	if absf(to.x - from.x) > 0.5:
		_sprite.flip_h = to.x > from.x
	if _sprite.animation_finished.is_connected(_rest):
		_sprite.animation_finished.disconnect(_rest)
	# `death` : debout, touche, il bascule, A PLAT — et y reste (pas de boucle).
	_sprite.play("death")
	if _shadow != null:
		_shadow.visible = false
	z_index = Z_AIR
	_flight = _arc(from, to, BLAST_HEIGHT, BLAST_FLIGHT, 0)
	_hop = _flight
	_flight.tween_callback(func() -> void:
		if _shadow != null:
			_shadow.visible = true
		_place()
		stun(int(DOWN_SECONDS * 1000.0))
		# A PLAT, la tete est au ras du sol : les etoiles de `stun` sont
		# reglees pour un lapin debout.
		if _stars != null and is_instance_valid(_stars):
			_stars.position = Vector2(0, -STARS_DOWN_PX))
	_flight.tween_interval(DOWN_SECONDS)
	_flight.tween_callback(func() -> void:
		if seq != _blast_seq or _sprite == null:
			return
		_sprite.play("damage")
		_sprite.frame = GET_UP_FRAME
		if not _sprite.animation_finished.is_connected(_rest):
			_sprite.animation_finished.connect(_rest, CONNECT_ONE_SHOT))


## A L'EAU (Drowning.stories.tsx `throwIntoSea`, puis `surfaceAt`).
##
## `toward` : la direction de la poussee, en cases — le lapin est jete a
## `DROWN_TILES` cases du rivage dans ce sens, ce qui met l'entree la ou la mer
## est DESSINEE, pas sous la terrasse qui surplombe la premiere case d'eau.
## `back` : la case ou il remonte, `under_ms` le temps passe dessous.
##
## LE VOL NE REBONDIT PAS : il continue sous la surface. Un rebond dit « sol »,
## et c'est toute la difference entre etre jete SUR quelque chose et DEDANS.
func drown(toward: Vector2i, back: Vector2i, under_ms: int) -> void:
	if _sprite == null:
		return
	_land()
	var from := position
	var sea := _at + toward * DROWN_TILES
	# La mer est au niveau zero : sa case se projette a plat, sans relief.
	var splash_at := Iso.project(sea.x, sea.y, map.origin) + Vector2(0, Iso.half_h())
	var span := from.distance_to(splash_at)
	if toward.x != 0 or toward.y != 0:
		_sprite.flip_h = splash_at.x < from.x
	_under = true
	_at = back
	_home = back
	_sprite.play("damage")
	if not _sprite.animation_finished.is_connected(_rest):
		_sprite.animation_finished.connect(_rest, CONNECT_ONE_SHOT)
	_spin_from_belly(true)
	z_index = Z_AIR
	var fall := DROWN_FALL
	_flight = _arc(from, splash_at, 24.0 + span * 0.22, fall, 1)
	_hop = _flight
	_flight.tween_callback(func() -> void:
		# IL CASSE LA SURFACE : la gerbe sur cette image-la, pas avant.
		var parent := get_parent()
		if parent != null:
			WaterSplash.play(parent, splash_at, Iso.depth(sea.x, sea.y) + 12, under_ms)
		z_index = Iso.depth(sea.x, sea.y) + 11)
	# ...et A TRAVERS, sans rebond, en s'effacant : la mer se referme.
	_flight.set_parallel(true)
	_flight.tween_property(self, "position:y", splash_at.y + DROWN_SINK_PX, SINK_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_flight.tween_property(self, "modulate:a", 0.0, FADE_SECONDS).set_delay(FADE_DELAY) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_flight.set_parallel(false)
	_flight.tween_callback(func() -> void:
		visible = false
		_spin_from_belly(false))
	_flight.tween_interval(maxf(0.0, float(under_ms) / 1000.0 - fall - maxf(SINK_SECONDS, FADE_DELAY + FADE_SECONDS)))
	_flight.tween_callback(_surface)


## IL RETOMBE DU CIEL sur sa case de remontee : la mer l'a avale, l'ile le
## rend par le haut. Plus haut et plus long que `drop_in` — un joueur qui
## arrive tombe d'un pas, un noye tombe de loin, et l'ombre le precede.
## Au-dessus de tout le sol pendant la chute (Z_AIR), repose sur sa case a
## l'impact : trie sur les cases, il passerait derriere la terrasse d'en face.
func _surface() -> void:
	_under = false
	visible = true
	_place()
	var rest_z := z_index
	z_index = Z_AIR
	modulate.a = 1.0
	_sprite.rotation = 0.0
	_sprite.position = Vector2(0, -SKY_DROP_PX)
	_sprite.play("damage")
	# LA PLAQUE ARRIVE AVEC LUI : posee sur la case, elle l'attendrait en bas.
	_show_plate(false)
	var t := create_tween().set_parallel(true)
	t.tween_property(_sprite, "position", Vector2.ZERO, SKY_DROP_SECONDS) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	if _shadow != null:
		_shadow.visible = true
		_shadow.scale = Vector2(0.2, 0.2)
		t.tween_property(_shadow, "scale", Vector2.ONE, SKY_DROP_SECONDS) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.set_parallel(false)
	# L'IMPACT : ecrase, puis rebondit sur ses pattes.
	t.tween_callback(func() -> void:
		z_index = rest_z
		_show_plate(true)
		Sound.play("hop", 1.0)
		_sprite.play("idle"))
	t.tween_property(_sprite, "scale", Vector2(RABBIT_SCALE * 1.25, RABBIT_SCALE * 0.75), 0.06)
	t.tween_property(_sprite, "scale", Vector2(RABBIT_SCALE, RABBIT_SCALE), 0.22) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_callback(_rest)


func _show_plate(on: bool) -> void:
	if _plate != null:
		_plate.visible = on
	if _stem != null:
		_stem.visible = on


func is_under() -> bool:
	return _under


## LA CLOCHE : x a vitesse constante, y monte vite puis retombe plus lourd, et
## `spins` tours sur la duree (negatif : en arriere).
func _arc(from: Vector2, to: Vector2, height: float, seconds: float, spins: int) -> Tween:
	var top := minf(from.y, to.y) - height
	var t := create_tween()
	t.tween_method(func(k: float) -> void:
		var up := 0.42
		var y: float
		if k < up:
			var u := k / up
			y = lerpf(from.y, top, 1.0 - (1.0 - u) * (1.0 - u))
		else:
			var u := (k - up) / (1.0 - up)
			y = lerpf(top, to.y, u * u)
		position = Vector2(lerpf(from.x, to.x, k), y)
		if _sprite != null:
			_sprite.rotation = TAU * float(spins) * (1.0 - (1.0 - k) * (1.0 - k)),
		0.0, 1.0, seconds)
	return t


## UN VOL COUPE SE TERMINE DROIT (2026-09-24, « des fois il est pas droit ») :
## une poussee, un souffle ou une noyade le font tourner autour du ventre, et
## seul leur dernier rappel le remettait sur ses pieds. Coupe en l'air — un pas,
## un eclair, une autre poussee arrive — il restait penche, l'ancre au ventre,
## jusqu'au vol suivant. Toute interruption passe par `_land` : elle le redresse.
func _land() -> void:
	super._land()
	_upright()


func _upright() -> void:
	if _sprite == null or _under:
		return
	_spin_from_belly(false)
	_sprite.scale = Vector2(RABBIT_SCALE, RABBIT_SCALE)


## TOURNER AUTOUR DU VENTRE, pas des pieds : l'ancre passe au milieu du corps
## le temps du vol, et revient aux pieds a l'atterrissage.
func _spin_from_belly(on: bool) -> void:
	if _sprite == null:
		return
	# EN VOL, PAS D'OMBRE : le noeud entier suit la cloche, l'ombre volerait avec.
	if _shadow != null:
		_shadow.visible = not on
	if on:
		_sprite.offset = -Vector2(FRAME * 0.5, FRAME * 0.5)
		_sprite.position = Vector2(0, -FRAME * 0.5 * RABBIT_SCALE)
	else:
		_sprite.offset = -Vector2(FRAME * ANCHOR.x, FRAME * ANCHOR.y)
		_sprite.position = Vector2.ZERO
		_sprite.rotation = 0.0


## L'ATTERRISSAGE : ecrase 1,3/0,7, retour elastique, et un petit saut.
func _squash() -> void:
	if _sprite == null:
		return
	var base := Vector2(RABBIT_SCALE, RABBIT_SCALE)
	var t := create_tween()
	t.tween_property(_sprite, "scale", base * Vector2(1.3, 0.7), 0.07)
	t.tween_property(_sprite, "scale", base, 0.4).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	var h := create_tween()
	h.tween_property(_sprite, "position:y", -6.0, 0.1).set_ease(Tween.EASE_OUT)
	h.tween_property(_sprite, "position:y", 0.0, 0.25).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)


# ── Le bloop ────────────────────────────────────────────────────────────────

const BLOOP_ICON := preload("res://assets/ui/icons/bloop.png")
## Le calmar se pose au-dessus du nom (NAME_Y), le temps de gicler.
const BLOOP_Y := -84.0
const BLOOP_SHOW_S := 1.3
## Le lapin encre : une teinte d'encre qui se retire sur toute la duree.
const INK_TINT := Color(0.42, 0.36, 0.62)


## ENCRE (BLOOP, 2026-09-24) : le calmar surgit au-dessus de lui, gicle, et
## repart ; le lapin reste teinte d'encre tant qu'elle tient. Ce que voit la
## victime elle-meme — l'ecran tache — est la bande du haut (`InkSplash`).
func inked(ms: int) -> void:
	if _sprite == null:
		return
	var squid := Sprite2D.new()
	squid.texture = BLOOP_ICON
	squid.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	squid.position = Vector2(0.0, BLOOP_Y)
	squid.scale = Vector2.ZERO
	squid.z_index = 3
	add_child(squid)
	var pop := squid.create_tween()
	pop.tween_property(squid, "scale", Vector2(1.6, 1.6), 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# Le giclement : il se tasse, puis s'etire vers le bas.
	pop.tween_property(squid, "scale", Vector2(1.9, 1.3), 0.12)
	pop.tween_property(squid, "scale", Vector2(1.4, 1.8), 0.12)
	pop.tween_property(squid, "scale", Vector2(1.6, 1.6), 0.1)
	pop.tween_property(squid, "position:y", BLOOP_Y - 6.0, 0.35).set_trans(Tween.TRANS_SINE)
	pop.tween_property(squid, "position:y", BLOOP_Y, 0.35).set_trans(Tween.TRANS_SINE)
	pop.tween_property(squid, "modulate:a", 0.0, maxf(0.1, BLOOP_SHOW_S - 1.22))
	pop.tween_callback(squid.queue_free)
	var dye := create_tween()
	_sprite.modulate = INK_TINT
	dye.tween_interval(maxf(0.0, ms / 1000.0 - 1.0))
	dye.tween_property(_sprite, "modulate", Color.WHITE, 1.0)


# ── La foudre ───────────────────────────────────────────────────────────────

## FOUDROYE (Electrocute.ts) : le grand eclair tombe sur lui, et a son image 5
## le lapin devient la pose foudroyee, qui tremble. Puis il encaisse — ou,
## sur son dernier coeur, s'effondre.
func electrocute(stun_ms: int, fatal: bool) -> void:
	if _sprite == null or _under:
		return
	_land()
	_shocking = true
	var parent := get_parent()
	if parent != null:
		LightningFx.big_bolt(parent, position, z_index + 2)
	# UN TWEEN DU LAPIN, pas un `await` : il meurt avec lui si le lapin part
	# pendant l'eclair, la ou une coroutine se reveillerait sur un noeud libere.
	var seq := create_tween()
	seq.tween_interval(LightningFx.BIG_LANDS_S)
	seq.tween_callback(func() -> void:
		if _sprite == null:
			return
		_shock = AnimatedSprite2D.new()
		_shock.sprite_frames = _shock_frames()
		_shock.centered = false
		_shock.offset = -Vector2(16, 32)
		_shock.scale = Vector2(RABBIT_SCALE, RABBIT_SCALE)
		_shock.flip_h = _sprite.flip_h
		_shock.play("shock")
		add_child(_shock)
		_sprite.visible = false
		if _rattle != null and _rattle.is_valid():
			_rattle.kill()
		_rattle = create_tween().set_loops()
		_rattle.tween_property(_shock, "position:x", 2.0, 0.04)
		_rattle.tween_property(_shock, "position:x", -2.0, 0.04))
	seq.tween_interval(float(mini(stun_ms, SHOCK_HOLD_MS)) / 1000.0)
	seq.tween_callback(func() -> void:
		if _rattle != null and _rattle.is_valid():
			_rattle.kill()
		_rattle = null
		if _shock != null:
			_shock.queue_free()
			_shock = null
		_shocking = false
		if _sprite == null:
			return
		_sprite.visible = true
		if fatal:
			exhaust()
		else:
			_sprite.play("damage")
			if not _sprite.animation_finished.is_connected(_rest):
				_sprite.animation_finished.connect(_rest, CONNECT_ONE_SHOT))


func _shock_frames() -> SpriteFrames:
	var out := SpriteFrames.new()
	out.remove_animation("default")
	out.add_animation("shock")
	out.set_animation_speed("shock", SHOCK_FPS)
	out.set_animation_loop("shock", true)
	for at in SHOCK_CELLS:
		var f := AtlasTexture.new()
		f.atlas = SHOCK_SHEET
		f.region = Rect2(at, Vector2(32, 32))
		out.add_frame("shock", f)
	return out


## ASSOMME pour `ms` : trois etoiles tournent autour de la tete.
func stun(ms: int) -> void:
	if ms <= 0 or _sprite == null:
		return
	if _stars != null and is_instance_valid(_stars):
		_stars.queue_free()
	_stars = StunStars.new()
	_stars.position = Vector2(0, -42)
	_stars.z_as_relative = true
	_stars.z_index = 1
	add_child(_stars)
	# Les etoiles s'eteignent seules : elles sont a elles, pas au lapin.
	var stars := _stars
	stars.create_tween().tween_callback(stars.queue_free).set_delay(float(ms) / 1000.0)


## LES ETOILES : trois croix d'or sur une ellipse de 11x4, un tour en 0,7 s.
class StunStars:
	extends Node2D
	var _t := 0.0

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		for i in 3:
			var a := _t / 0.7 * TAU + float(i) * TAU / 3.0
			var p := Vector2(cos(a) * 11.0, sin(a) * 4.0)
			draw_rect(Rect2(p + Vector2(-1.5, -0.5), Vector2(3, 1)), STAR_INK)
			draw_rect(Rect2(p + Vector2(-0.5, -1.5), Vector2(1, 3)), STAR_INK)
