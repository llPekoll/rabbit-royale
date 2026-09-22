class_name IslandPicker
extends Dialog
## QUELLE ILE ? La liste sur DIG.
##
## Porte de src/components/island-picker.tsx (Paul, 21 septembre 2026 : la
## difficulte est PROGRESSIVE EN APPRENANT, CHOISIE ENSUITE). Une ligne par
## ile ou un nouveau venu peut s'asseoir — son palier, qui y creuse, combien
## de coffres restent — et une ligne par palier pour ouvrir une ile neuve,
## grisee au-dessus du plus haut palier que ce joueur a atteint. Rejoindre
## une ile pleine est une session courte et sure avec une part des coffres
## (mesure : a quatre personne ne meurt, meme sur Caldera) ; en ouvrir une
## seul est la longue run ou un lapin peut mourir. C'est le second cadran de
## la difficulte, a cote du palier, et il existait avant qu'on le voie.
##
## LE LISTING VIENT DE `RunState.list_islands()` — l'ack `islands` du
## serveur (voir run_state.gd pour comment l'addon est contourne). Vide tant
## qu'il n'est pas arrive : « Looking at the water... » ; vide APRES aussi
## (pas de socket, pas de reponse) : les paliers seuls, ce qui suffit pour
## ouvrir une ile.
##
## UNE PORTE VERROUILLEE DIT LA DISTANCE, et la dessine : une porte avec un
## nombre dessus et pas de moyen de lire l'ecart etait un mur (22 septembre
## 2026).

signal chosen(choice: Dictionary)

## Le vert « en train de creuser », le meme que la liste des cibles.
const LIVE := Color("#4ade80")
const ROW_H := 44.0
const BAR_W := 100.0
const BAR_H := 8.0
const BODY_H := 220.0

## Le listing (IslandListing) : unlocked, bests, tiers, islands.
var listing: Dictionary = {}
var loaded := false
## Les carottes de toute une vie — ce contre quoi les portes se mesurent.
var lifetime := 0.0
var busy := false
## Sur le banc : ne demande rien a la socket.
var bench := false

var _scroll: ScrollContainer
var _rows: VBoxContainer
var _loading: Label
var _brief: Label


func _init() -> void:
	super("", 480.0)


func _ready() -> void:
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0.0, BODY_H)
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(_scroll)
	_rows = Kit.vbox(Kit.PAD_TIGHT)
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_rows)
	_loading = Kit.note("", Palette.BARK, 13)
	_loading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(_loading)
	_brief = Kit.note("", Palette.BARK, 12)
	_brief.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_footer(_brief)

	if lifetime <= 0.0:
		lifetime = float(Home.burrow.get("lifetime", 0))
	var state := RunState.current
	state.islands.connect(set_listing)
	if not bench:
		state.list_islands()
	I18N.locale_changed.connect(func(_code: String) -> void: _rebuild())
	_rebuild()


## Le listing est arrive (ou pas : vide).
func set_listing(found: Dictionary) -> void:
	listing = found
	loaded = true
	if is_node_ready():
		_rebuild()


func set_busy(value: bool) -> void:
	busy = value
	_rebuild()


func _rebuild() -> void:
	set_title(I18N.t("islandPick.which"))
	_brief.text = I18N.t("islandPick.brief")
	_loading.text = I18N.t("islandPick.loading")
	_loading.visible = not loaded
	for old in _rows.get_children():
		old.queue_free()
	if not loaded:
		return

	# LES ILES VIVANTES D'ABORD, les plus pleines en tete : celles ou il y a
	# de la compagnie.
	var live: Array = listing.get("islands", []).duplicate() if listing.get("islands") is Array else []
	live.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("rabbits", 0)) > int(b.get("rabbits", 0)))
	for i in live:
		var n := int(i.get("rabbits", 0))
		var left := int(i.get("chestsLeft", 0))
		var total := int(i.get("chestsTotal", 0))
		var pct := int(round(100.0 * float(i.get("dugFraction", 0.0))))
		# Une ile entamee ou personne n'est en ce moment est la courte
		# recolte du GDD, pas « 0 digging » : le point s'eteint avec elle.
		var detail := I18N.f("islandPick.row", [n, left, total, pct]) if n > 0 \
			else I18N.f("islandPick.rowEmpty", [left, total, pct])
		if left <= 3 or float(i.get("dugFraction", 0.0)) >= 0.7:
			detail += " · " + I18N.t("islandPick.almostDone")
		var id := String(i.get("id", ""))
		_rows.add_child(_row(I18N.island_name(String(i.get("tier", ""))), detail,
			LIVE if n > 0 else Palette.CHALK_DIM, I18N.t("islandPick.join"), not busy,
			func() -> void: _choose({"islandId": id}), -1.0))

	# PUIS UNE ILE NEUVE, une ligne par palier, l'echelle dans l'ordre.
	var unlocked := int(listing.get("unlocked", 0))
	var bests: Dictionary = listing.get("bests", {}) if listing.get("bests") is Dictionary else {}
	var tiers := Tuning.list("ISLAND_TIERS")
	for idx in tiers.size():
		var tier: Dictionary = tiers[idx]
		var name := String(tier.get("name", ""))
		var need := float(tier.get("minLifetime", 0))
		var locked := idx > unlocked
		var detail := I18N.f("islandPick.locked", [I18N.group_digits(need)]) if locked else I18N.t("islandPick.fresh")
		var progress := -1.0
		if locked:
			# LA DISTANCE A LA PORTE, dite et dessinee.
			detail += " · " + I18N.f("islandPick.youHave", [I18N.group_digits(lifetime)])
			progress = clampf(lifetime / maxf(1.0, need), 0.0, 1.0)
		# CE QU'EST LE PALIER, dans les deux nombres que l'echelle tourne :
		# plus riche ET plus dangereux, et un X juste paie moins en montant.
		detail += " · " + I18N.f("islandPick.tier", [int(round(100.0 * float(tier.get("bombDensity", 0.0)))), int(tier.get("xGain", 0))])
		if not locked and int(bests.get(name, 0)) > 0:
			detail += " · " + I18N.f("islandPick.best", [I18N.group_digits(int(bests[name]))])
		_rows.add_child(_row(I18N.island_name(name), detail,
			Palette.CHALK_DIM if locked else Palette.LEAF,
			I18N.t("islandPick.lockedShort" if locked else "islandPick.open"), not busy and not locked,
			func() -> void: _choose({"tier": name}), progress))


## UNE LIGNE : la terre du terrier (comme les cibles d'un raid), le nom, le
## point et sa phrase, la planche d'action a droite.
func _row(name: String, detail: String, dot: Color, verb: String, enabled: bool, on_press: Callable, progress: float) -> Control:
	var panel := Kit.panel(Kit.style_soil())
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var row := Kit.hbox(Kit.PAD)
	panel.add_child(row)

	var words := Kit.vbox(2.0)
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(words)
	words.add_child(Kit.label(name, 14, Palette.CHALK))
	var line := Kit.hbox(Kit.PAD_TIGHT)
	words.add_child(line)
	var mark := ColorRect.new()
	mark.color = dot
	mark.custom_minimum_size = Vector2(8.0, 8.0)
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(mark)
	var small := Kit.note(detail, Palette.CHALK_DIM, 11)
	line.add_child(small)
	if progress >= 0.0:
		var track := Kit.panel(Kit.style_track())
		track.custom_minimum_size = Vector2(BAR_W, BAR_H)
		track.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		var fill := ColorRect.new()
		fill.color = Palette.CARROT
		fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
		fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
		fill.anchor_right = progress
		track.add_child(fill)
		words.add_child(track)

	var button := Kit.button(I18N.shout(verb), "gold", 96.0, ROW_H)
	button.disabled = not enabled
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.pressed.connect(on_press)
	row.add_child(button)
	return panel


func _choose(pick: Dictionary) -> void:
	if busy:
		return
	chosen.emit(pick)
