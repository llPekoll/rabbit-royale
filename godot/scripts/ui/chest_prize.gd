class_name ChestPrize
extends Control
## CE QUI VIENT DE SORTIR D'UN COFFRE, montre au joueur qui l'a deterre.
##
## Porte de chest-prize.tsx et de la ceremonie du kit (`ChestReveal`,
## @domin8/arcade-kit chest-reveal.tsx) : le serveur tire le lot contre la
## table du palier, l'envoie en prive au fouilleur (`move_result`, jamais
## `tile_revealed` — sinon chaque lapin de l'ile regarderait une prise
## d'ecran pour un lot que quelqu'un d'autre a gagne), et ceci en fait la
## prise d'ecran du kit, a la maniere du loot de TFT :
##
##   1. RUMBLE  — le coffre, gros au centre, tremble de plus en plus fort sur
##                un soleil eteint. Au moins RUMBLE_MIN_S, pour que meme un
##                lot deja connu construise sa tension.
##   2. BLOW    — les rais prennent la palette de la rarete, le coffre saute
##                son couvercle, gonfle, blanchit, disparait.
##   3. FLASH   — un disque blanc jaillit du coffre et couvre l'ecran, tient.
##   4. REVEAL  — la lumiere est ASPIREE au milieu (lente, lente, partie d'un
##                coup) et le lot monte dessous.
##   5. SHOWN   — le tampon claque, la legende monte ; un tap n'importe ou
##                (ou Echap) est `done`.
##
## DEUX ECHELLES, ET POURQUOI LE TAMPON EST PRUDENT. Un coffre est
## BRONZE/SILVER/GOLD/CROWN. Une piece RR Genesis a une rarete A ELLE
## (common/rare/epic/legendary), et les deux n'ont rien a voir — un coffre
## couronne peut lacher un lapin commun. Une piece gagnee n'est donc JAMAIS
## tamponnee d'un de ces quatre mots : au moment du tirage elle n'est pas
## frappee, sa rarete est inconnue, et un joueur qui a passe la session a
## lire des paliers de coffre lirait le mot comme un palier. Le tampon dit
## RR GENESIS, la seule chose qui soit surement vraie.
##
## CE QUI N'A PAS DE CEREMONIE. Les carottes : elles s'animent deja sur la
## case et atterrissent sur le compteur (le filtre est dans la socket, a
## l'evenement). Et les coffres qu'on n'a pas VUS : un coffre a palier
## annonce sa place et sa couleur sur le plateau, y marcher est une decision
## du joueur, la ceremonie y repond. Un coffre invisible est une trouvaille
## en creusant pour autre chose — celui-la tend l'objet avec son nom
## (`LootFly`, ici `_fly`) et laisse la partie continuer. Le partage est
## `announced`, que le serveur derive du palier ; une piece Genesis passe
## outre, elle arrive une fois par session ou deux et vaut n'importe quelle
## interruption.
##
## L'ART SCELLE DE LA PIECE, honnetement : le joueur possede une piece RR
## Genesis des cet instant, mais LAQUELLE ne se sait qu'a la frappe. Un lapin
## au hasard serait la photo du NFT de quelqu'un d'autre.
##
## LE SON N'EST PAS PORTE : le web joue `coinStart` a l'arrivee du coffre et
## `chime` a l'ouverture (SoundManager), et le client Godot n'a pas encore de
## sons (assets/sound/ ne porte que les icones du haut-parleur).

## Le joueur a tape a travers — la partie continue.
signal done

## La piece scellee (chest-prize.tsx `GENESIS`).
const GENESIS := preload("res://assets/nft/genesis-sealed.webp")

## L'ART ET LA RARETE de chaque sorte qu'un coffre paie. Le NOM est celui du
## dictionnaire (`chest.<label>`) — la moitie qui change avec la langue.
## `rarity` pilote la palette des rais, du plus pauvre au plus riche selon ce
## que le lot vaut, sans nommer rien que le joueur voie.
const DROP := {
	"carrots": {"icon": "carrot", "label": "carrots", "rarity": "common"},
	"water": {"icon": "water", "label": "watering", "rarity": "rare"},
	"fertiliser": {"icon": "fertiliser", "label": "fertiliser", "rarity": "rare"},
	"bomb": {"icon": "bomb-lit", "label": "bomb", "rarity": "epic"},
	"shield": {"icon": "shield", "label": "shield", "rarity": "epic"},
	"lightning": {"icon": "bolt", "label": "lightning", "rarity": "epic"},
}

## L'accent d'une rarete — le tampon, et ce dont on teinte le lot
## (chest-reveal.tsx `REVEAL_ACCENT`).
const ACCENT := {
	"common": Color("#d9a05a"),
	"rare": Color("#c9d3dd"),
	"epic": Color("#f5c518"),
	"legendary": Color("#c98cff"),
}
## Trois tons de rais par rarete, tournes autour du soleil, plus le neutre
## sous lequel le coffre tremble avant que le tirage soit connu.
const RAYS := {
	"neutral": [Color("#3b3224"), Color("#4e4230"), Color("#2f2819")],
	"common": [Color("#b4763a"), Color("#e0a35c"), Color("#8a5526")],
	"rare": [Color("#5e9fd8"), Color("#c9d3dd"), Color("#3a6fb5")],
	"epic": [Color("#f5c518"), Color("#ff8a1f"), Color("#ffe866")],
	"legendary": [Color("#b96bff"), Color("#ff5bd6"), Color("#6f2bd9")],
}

## Le fond de scene, rgba(6,5,14,.94), et la legende en creme du kit.
const BACKDROP := Color(6.0 / 255.0, 5.0 / 255.0, 14.0 / 255.0, 0.94)
const CAPTION_INK := Color("#fef3c7")
## L'ombre du tampon : `0 4px 0 rgba(0,0,0,.6)`.
const STAMP_SHADOW := Color(0.0, 0.0, 0.0, 0.6)

## Les temps du kit.
const RUMBLE_MIN_S := 1.7
const BLOW_S := 0.26
const FLASH_HOLD_S := 0.11
const SUCK_S := 0.62
const STAMP_DELAY_S := 0.38
const ITEM_S := 0.62
const RISE_S := 0.36
const BACKDROP_S := 0.26
## La secousse : jusqu'a 11 px (et ~deg/1.4 d'inclinaison).
const RUMBLE_MAX_PX := 11.0

## Les tailles : le coffre a 180 de large, un objet a 112, une piece a 180.
const CHEST_W := 180.0
const ITEM_W := 112.0
const PIECE_W := 180.0
## Le tampon (TitleText, echelle du titre) et la legende (BitmapText).
const STAMP_SIZE := 28
const CAPTION_SIZE := 13
const CAPTION_BOTTOM := 28.0

## Le vol d'un lot non annonce (loot-fly.tsx) : 72 px de haut, a 38% de
## l'ecran, monte en trois temps.
const FLY_H := 72.0
const FLY_TOP := 0.38
const FLY_IN_S := 0.34
const FLY_READ_S := 0.5
const FLY_OUT_S := 0.34
const FLY_INK := Color("#f4d593")

enum Phase { RUMBLE, BLOW, FLASH, REVEAL, SHOWN }

var phase: Phase = Phase.RUMBLE
var rarity := "common"
var art: Texture2D
var art_w := ITEM_W
var stamp_text := ""
var caption_text := ""

var _rays: RayBurst
var _chest: LootChest
var _chest_slot: Control
var _flash: TextureRect
var _column: Control
var _glow: TextureRect
var _item: TextureRect
var _stamp: Label
var _caption: Label
var _rumble_t := 0.0
var _sequence: Tween


# ── L'entree ─────────────────────────────────────────────────────────────────

## ANNONCER UN LOT (`announce`, parce que `show()` est celui de CanvasItem).
## `prize` a la forme de `chestPrize` (use-game-socket.ts) :
## {kind, amount (ou qty), nft, announced, at}. Rend le noeud pose sur le
## chrome — la ceremonie, ou le vol d'un lot non annonce — ou null quand il
## n'y a rien a montrer (une sorte inconnue sans piece).
static func announce(prize: Dictionary) -> Control:
	var kind := String(prize.get("kind", ""))
	var amount := int(prize.get("amount", prize.get("qty", 1)))
	var nft := bool(prize.get("nft", false))
	# Un serveur plus vieux n'envoie pas le drapeau : c'est annonce, pour
	# garder la ceremonie qu'il jouait, plutot que retrograder chaque coffre
	# en silence sur un ecart de version.
	var announced: bool = prize.get("announced", true) != false
	var drop: Dictionary = DROP.get(kind, {})
	# Une sorte que ce client ne connait pas est un serveur plus recent que
	# l'app ; sa cle en capitales est la seule chose honnete qui reste.
	var drop_name := I18N.t("chest.%s" % drop["label"]) if not drop.is_empty() else kind.to_upper()

	var node: Control
	if not announced and not nft:
		if drop.is_empty():
			return null
		node = ChestPrize._fly(Kit.ICONS[drop["icon"]], drop_name, amount)
	else:
		var it := ChestPrize.new()
		if nft:
			it.art = GENESIS
			it.art_w = PIECE_W
			it.rarity = "legendary"
			it.stamp_text = I18N.t("chest.genesis")
			it.caption_text = I18N.f("chest.piece", [amount, drop_name])
		else:
			if drop.is_empty():
				return null
			it.art = Kit.ICONS[drop["icon"]]
			it.art_w = ITEM_W
			it.rarity = String(drop["rarity"])
			it.stamp_text = drop_name
			it.caption_text = ("+%d %s" % [amount, drop_name]).strip_edges()
		node = it
	ScreenStamp.mount(node)
	return node


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_ARROW


func _ready() -> void:
	_build()
	resized.connect(_measure)
	_measure()
	_start.call_deferred()


func _build() -> void:
	var back := ColorRect.new()
	back.color = BACKDROP
	back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(back)
	add_child(back)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, BACKDROP_S)

	_rays = RayBurst.new()
	_rays.set_palette(RAYS["neutral"], true)
	_rays.modulate.a = 0.85
	add_child(_rays)

	_chest_slot = Control.new()
	_chest_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_chest_slot)
	_chest = LootChest.new()
	_chest.crop = LootChest.Crop.OPENING
	_chest.width = CHEST_W
	_chest.shine = false
	_chest_slot.add_child(_chest)

	_flash = TextureRect.new()
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.4, 0.7, 1.0])
	ramp.colors = PackedColorArray([Color.WHITE, Color.WHITE, Color("#fff8e0"), Color("#fff1c2")])
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 128
	tex.height = 128
	_flash.texture = tex
	_flash.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.visible = false
	add_child(_flash)

	_column = Control.new()
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.visible = false
	add_child(_column)

	_glow = TextureRect.new()
	var accent: Color = ACCENT.get(rarity, ACCENT["epic"])
	var glow_ramp := Gradient.new()
	glow_ramp.offsets = PackedFloat32Array([0.0, 0.18, 0.38, 0.62])
	glow_ramp.colors = PackedColorArray([
		Color(accent, 0.667), Color(accent, 0.667), Color(accent, 0.2), Color(accent, 0.0)])
	var glow_tex := GradientTexture2D.new()
	glow_tex.gradient = glow_ramp
	glow_tex.fill = GradientTexture2D.FILL_RADIAL
	glow_tex.fill_from = Vector2(0.5, 0.5)
	glow_tex.fill_to = Vector2(1.0, 0.5)
	glow_tex.width = 128
	glow_tex.height = 128
	_glow.texture = glow_tex
	_glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_child(_glow)

	_item = Kit.icon(art, art_w * float(art.get_height()) / maxf(1.0, float(art.get_width())))
	_column.add_child(_item)

	_stamp = Kit.label(stamp_text, STAMP_SIZE, accent)
	_stamp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stamp.add_theme_color_override("font_shadow_color", STAMP_SHADOW)
	_stamp.add_theme_constant_override("shadow_offset_x", 0)
	_stamp.add_theme_constant_override("shadow_offset_y", 4)
	_stamp.visible = false
	_column.add_child(_stamp)

	_caption = Kit.label(caption_text, CAPTION_SIZE, CAPTION_INK)
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption.visible = false
	add_child(_caption)


## LA MISE EN PAGE sur la taille de la scene : les rais a 200vmax, l'eclair a
## 250vmax, le coffre et le lot au centre, la legende a 28 px du bas.
func _measure() -> void:
	var box := size
	var centre := box * 0.5
	var vmax := maxf(box.x, box.y) / 100.0

	var rays_d := 200.0 * vmax
	_rays.size = Vector2(rays_d, rays_d)
	_rays.pivot_offset = _rays.size * 0.5
	_rays.position = centre - _rays.size * 0.5

	var chest_size := _chest.get_combined_minimum_size()
	_chest_slot.size = chest_size
	_chest_slot.position = centre - chest_size * 0.5
	_chest.size = chest_size
	_chest.pivot_offset = chest_size * 0.5

	var flash_d := 250.0 * vmax
	_flash.size = Vector2(flash_d, flash_d)
	_flash.pivot_offset = _flash.size * 0.5
	_flash.position = centre - _flash.size * 0.5

	var item_size := _item.get_combined_minimum_size()
	_item.size = item_size
	_column.size = item_size
	_column.position = centre - item_size * 0.5
	_item.position = Vector2.ZERO
	_item.pivot_offset = item_size * 0.5

	var vmin := minf(box.x, box.y) / 100.0
	var glow_d := 120.0 * vmin
	_glow.size = Vector2(glow_d, glow_d)
	_glow.position = item_size * 0.5 - _glow.size * 0.5

	var stamp_size := _stamp.get_combined_minimum_size()
	_stamp.size = stamp_size
	_stamp.position = Vector2((item_size.x - stamp_size.x) * 0.5, -18.0)
	_stamp.pivot_offset = stamp_size * 0.5

	var cap_size := _caption.get_combined_minimum_size()
	_caption.size = cap_size
	_caption.position = Vector2((box.x - cap_size.x) * 0.5, box.y - CAPTION_BOTTOM - cap_size.y)


# ── La machine a phases ──────────────────────────────────────────────────────

func _start() -> void:
	if phase != Phase.RUMBLE:
		return
	_rumble_t = 0.0
	_sequence = create_tween()
	_sequence.tween_interval(RUMBLE_MIN_S)
	_sequence.tween_callback(_blow)
	_sequence.tween_interval(BLOW_S)
	_sequence.tween_callback(_flash_in)
	_sequence.tween_interval(FLASH_HOLD_S)
	_sequence.tween_callback(_reveal)
	_sequence.tween_interval(SUCK_S)
	_sequence.tween_callback(_shown)


## POUR UN BANC : sauter la ceremonie et poser le lot tel qu'il finit.
func skip_to_shown() -> void:
	if _sequence != null:
		_sequence.kill()
	_chest_slot.visible = false
	_rays.set_palette(RAYS.get(rarity, RAYS["common"]), true)
	_column.visible = true
	_glow.visible = false
	_item.modulate.a = 1.0
	_item.scale = Vector2.ONE
	_shown(true)


## La secousse : l'amplitude grandit avec le temps (au carre, bornee), la
## gigue elle-meme est une somme de sinus deterministe — inquiete, pas
## scintillante. S'arrete a l'instant ou la phase quitte RUMBLE.
func _process(delta: float) -> void:
	if phase != Phase.RUMBLE:
		return
	_rumble_t += delta
	var t := _rumble_t
	var ramp := minf(1.0, t / RUMBLE_MIN_S)
	var amp := RUMBLE_MAX_PX * ramp * ramp
	var x := amp * (sin(t * 61.0) * 0.6 + sin(t * 97.0 + 1.3) * 0.4)
	var y := amp * 0.5 * (sin(t * 83.0 + 0.7) * 0.6 + sin(t * 131.0) * 0.4)
	var r := (amp / 1.4) * (sin(t * 71.0 + 2.1) * 0.7 + sin(t * 113.0) * 0.3)
	var s := 1.0 + 0.14 * ramp
	_chest.position = Vector2(x, y)
	_chest.rotation_degrees = r
	_chest.scale = Vector2(s, s)


## BLOW : les rais prennent la rarete et flambent, le couvercle saute, le
## coffre gonfle (1.14 -> 1.9), blanchit (brightness 1 -> 6) et disparait.
func _blow() -> void:
	phase = Phase.BLOW
	_rays.set_palette(RAYS.get(rarity, RAYS["common"]), false)
	_rays.pulse()
	_chest.pop()
	_chest.position = Vector2.ZERO
	_chest.rotation_degrees = 0.0
	_chest.scale = Vector2(1.14, 1.14)
	var blow := create_tween().set_parallel(true)
	blow.tween_property(_chest, "scale", Vector2(1.9, 1.9), BLOW_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	blow.tween_property(_chest, "modulate", Color(6.0, 6.0, 6.0, 0.0), BLOW_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Le disque blanc jaillit du coffre avec le souffle (230 ms).
	_flash.visible = true
	_flash.modulate.a = 0.9
	_flash.scale = Vector2.ZERO
	var burst := create_tween().set_parallel(true)
	burst.tween_property(_flash, "scale", Vector2.ONE, 0.23).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	burst.tween_property(_flash, "modulate:a", 1.0, 0.23)


## FLASH : plein blanc, le coffre n'est plus la.
func _flash_in() -> void:
	phase = Phase.FLASH
	_chest_slot.visible = false
	_flash.scale = Vector2.ONE
	_flash.modulate.a = 1.0


## REVEAL : la lumiere est aspiree au centre (lente, lente, partie d'un
## coup — .32 a 55%, 0 a la fin, en s'assombrissant), le lot monte dessous
## avec un petit depassement, le halo d'accent s'eteint.
func _reveal() -> void:
	phase = Phase.REVEAL
	var suck := create_tween().set_parallel(true)
	suck.tween_property(_flash, "scale", Vector2(0.32, 0.32), SUCK_S * 0.55).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	suck.tween_property(_flash, "modulate:a", 0.95, SUCK_S * 0.55)
	var gone := suck.chain().set_parallel(true)
	gone.tween_property(_flash, "scale", Vector2.ZERO, SUCK_S * 0.45).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	gone.tween_property(_flash, "modulate:a", 0.35, SUCK_S * 0.45)
	gone.chain().tween_callback(func() -> void: _flash.visible = false)

	_column.visible = true
	_glow.modulate.a = 1.0
	create_tween().tween_property(_glow, "modulate:a", 0.0, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	_item.modulate.a = 0.0
	_item.scale = Vector2(0.55, 0.55)
	var rise := create_tween()
	rise.tween_interval(0.12)
	var up := rise.chain().set_parallel(true)
	up.tween_property(_item, "modulate:a", 1.0, ITEM_S * 0.6)
	up.tween_property(_item, "scale", Vector2(1.06, 1.06), ITEM_S * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	up.chain().tween_property(_item, "scale", Vector2.ONE, ITEM_S * 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## SHOWN : le tampon claque sur le lot (2.6x / -8deg -> .94 / 2deg -> 1),
## la legende monte et clignote ; un tap termine.
func _shown(instant: bool = false) -> void:
	phase = Phase.SHOWN
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_stamp.visible = true
	_caption.visible = true
	if instant:
		_stamp.modulate.a = 1.0
		_stamp.scale = Vector2.ONE
		_caption.modulate.a = 1.0
		return

	_stamp.modulate.a = 0.0
	_stamp.scale = Vector2(2.6, 2.6)
	_stamp.rotation_degrees = -8.0
	var slam := create_tween()
	slam.tween_interval(STAMP_DELAY_S)
	var hit := slam.chain().set_parallel(true)
	hit.tween_property(_stamp, "modulate:a", 1.0, 0.52 * 0.3)
	hit.tween_property(_stamp, "scale", Vector2(0.94, 0.94), 0.52 * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	hit.tween_property(_stamp, "rotation_degrees", 2.0, 0.52 * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	var settle := hit.chain().set_parallel(true)
	settle.tween_property(_stamp, "scale", Vector2(1.04, 1.04), 0.52 * 0.2)
	settle.tween_property(_stamp, "rotation_degrees", -1.0, 0.52 * 0.2)
	var rest := settle.chain().set_parallel(true)
	rest.tween_property(_stamp, "scale", Vector2.ONE, 0.52 * 0.2)
	rest.tween_property(_stamp, "rotation_degrees", 0.0, 0.52 * 0.2)

	_caption.modulate.a = 0.0
	var cap_y := _caption.position.y
	_caption.position.y = cap_y + 14.0
	var rise := create_tween()
	rise.tween_interval(STAMP_DELAY_S + 0.5)
	var up := rise.chain().set_parallel(true)
	up.tween_property(_caption, "modulate:a", 1.0, RISE_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	up.tween_property(_caption, "position:y", cap_y, RISE_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Le clignotement du kit : deux pas, 1,1 s.
	var blink := up.chain().set_loops()
	blink.tween_interval(0.55)
	blink.tween_callback(func() -> void: _caption.modulate.a = 0.35)
	blink.tween_interval(0.55)
	blink.tween_callback(func() -> void: _caption.modulate.a = 1.0)


# ── La sortie ────────────────────────────────────────────────────────────────

## Toujours avaler le tap : un voile de fermeture sous la scene ne doit pas
## se fermer sous elle. Un tap ne termine que quand il y a quelque chose a
## quoi passer.
func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		accept_event()
		if phase == Phase.SHOWN:
			_finish()


func _unhandled_input(event: InputEvent) -> void:
	if phase != Phase.SHOWN:
		return
	if event.is_action_pressed("ui_cancel") or event.is_action_pressed("ui_accept"):
		get_viewport().set_input_as_handled()
		_finish()


func _finish() -> void:
	done.emit()
	queue_free()


# ── Le vol d'un lot non annonce (loot-fly.tsx) ───────────────────────────────

## L'objet qu'un coffre a paye, qui monte avec son nom — et rien d'autre ne
## s'arrete. Une ceremonie plein ecran pour chaque coffre arretait le lapin ;
## un engrais est une bonne chose, pas un EVENEMENT : il merite d'etre vu et
## nomme, pas de prendre l'ecran. Il monte du plateau, dit ce qu'il est, et
## part sans jamais prendre un tap.
static func _fly(icon: Texture2D, label: String, amount: int) -> Control:
	var host := Control.new()
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mover := Kit.vbox(6)
	mover.alignment = BoxContainer.ALIGNMENT_CENTER
	mover.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pic := Kit.icon(icon, FLY_H)
	pic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	mover.add_child(pic)
	# ASCII seulement : la face pixel dessine un tiret cadratin en carre vide.
	var name := Kit.label(("%dx %s" % [amount, label]) if amount > 1 else label, 13, FLY_INK)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# Lu sur l'herbe, la terre et l'eau : le mot porte son propre bord sombre
	# plutot que de compter sur un fond.
	name.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.85))
	name.add_theme_constant_override("shadow_offset_x", 0)
	name.add_theme_constant_override("shadow_offset_y", 2)
	mover.add_child(name)
	host.add_child(mover)

	var place := func() -> void:
		var wanted := mover.get_combined_minimum_size()
		mover.size = wanted
		mover.pivot_offset = wanted * 0.5
		mover.position = Vector2((host.size.x - wanted.x) * 0.5, host.size.y * FLY_TOP)
	var launch := func() -> void:
		place.call()
		var top := mover.position.y
		mover.position.y = top + 40.0
		mover.modulate.a = 0.0
		mover.scale = Vector2(0.6, 0.6)
		# Un leger depassement a l'entree est ce qui le fait lire comme
		# JAILLI du sol plutot que fondu dessus.
		var flight := create_flight(host, mover, top)
		flight.finished.connect(host.queue_free)
	host.ready.connect(func() -> void: launch.call_deferred())
	return host


static func create_flight(host: Control, mover: Control, top: float) -> Tween:
	var tl := host.create_tween()
	tl.set_parallel(true)
	tl.tween_property(mover, "position:y", top, FLY_IN_S).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tl.tween_property(mover, "modulate:a", 1.0, FLY_IN_S)
	tl.tween_property(mover, "scale", Vector2.ONE, FLY_IN_S).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# Un temps en haut, parce que le nom est la pour etre lu.
	tl.chain().tween_property(mover, "position:y", top - 18.0, FLY_READ_S)
	var out := tl.chain().set_parallel(true)
	out.tween_property(mover, "position:y", top - 70.0, FLY_OUT_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	out.tween_property(mover, "modulate:a", 0.0, FLY_OUT_S).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	return tl


# ── Le soleil ────────────────────────────────────────────────────────────────

## LE FOND DU MEUBLE, distille : N rais en pixels depuis le centre, fondus
## radialement vers rien au bord, tournes lentement. La palette glisse vers
## sa cible a chaque image, pour qu'un changement de rarete soit un lavis de
## couleur et non une coupe.
class RayBurst extends Control:
	const COUNT := 36
	const LERP := 0.12
	## Un tour en soixante secondes (`d8-reveal-rays-spin`).
	const SPIN_S := 60.0
	## Le masque radial du kit : 1 a 0, .85 a .35, .3 a .7, 0 a 1.
	const RINGS := [0.0, 0.35, 0.7, 1.0]
	const RING_ALPHA := [1.0, 0.85, 0.3, 0.0]

	var _shown: Array = []
	var _target: Array = []

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_palette(colors: Array, at_once: bool) -> void:
		_target = colors.duplicate()
		if at_once or _shown.is_empty():
			_shown = colors.duplicate()
		queue_redraw()

	## Les rais flambent avec le souffle et se posent (900 ms).
	func pulse() -> void:
		var t := create_tween()
		t.tween_property(self, "modulate", Color(1.8, 1.8, 1.8, 0.85), 0.27).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		t.tween_property(self, "modulate", Color(1.0, 1.0, 1.0, 0.85), 0.63).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	func _process(delta: float) -> void:
		rotation += delta * TAU / SPIN_S
		var moving := false
		for i in _shown.size():
			var have: Color = _shown[i]
			var want: Color = _target[i % _target.size()]
			if have.is_equal_approx(want):
				continue
			moving = true
			_shown[i] = have.lerp(want, LERP)
		if moving:
			queue_redraw()

	func _draw() -> void:
		if _shown.is_empty():
			return
		var c := size * 0.5
		var radius := size.x * 0.5
		var ray_w := TAU / float(COUNT)
		for i in COUNT:
			var tone: Color = _shown[i % _shown.size()]
			var a0 := i * ray_w
			var a1 := a0 + ray_w * 1.12
			for k in RINGS.size() - 1:
				var r0: float = RINGS[k] * radius
				var r1: float = RINGS[k + 1] * radius
				var near := Color(tone, RING_ALPHA[k])
				var far := Color(tone, RING_ALPHA[k + 1])
				var points := PackedVector2Array()
				var colors := PackedColorArray()
				if r0 <= 0.0:
					points.append(c)
					colors.append(near)
				else:
					points.append(c + Vector2(cos(a0), sin(a0)) * r0)
					points.append(c + Vector2(cos(a1), sin(a1)) * r0)
					colors.append(near)
					colors.append(near)
				points.append(c + Vector2(cos(a1), sin(a1)) * r1)
				points.append(c + Vector2(cos(a0), sin(a0)) * r1)
				colors.append(far)
				colors.append(far)
				draw_polygon(points, colors)
