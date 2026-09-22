class_name Shop
extends Dialog
## L'ETAL — la boutique, telle que Paul l'a dessinee le 2026-09-21.
##
## Porte de src/components/shop-card.tsx (ShopPanel), stall-card.tsx,
## stall-drag.ts et shop-palette.ts, en gardant ce que ces fichiers ont
## decide :
##
##   • UN ETAL, PAS UNE GRILLE. Une rangee de cartes hautes sous une enseigne
##     SHOP suspendue, un dessin, un prix, un bouton par carte. Ca a remplace
##     une grille de tuiles de texte a deux prix, un blurb et un compte
##     chacune, avec l'art de la taille d'une vignette.
##   • UN PRIX PAR CARTE, UN RAIL POUR TOUT L'ETAL. La regle du GDD est que
##     carottes et argent pesent pareil ; ils pesent pareil au niveau de
##     l'ETAL : les rails de la ligne de tete re-tarifent toutes les cartes
##     en un tap, chaud pour les carottes, froid pour l'argent.
##   • UNE SEULE TAILLE, PARTOUT : celle du Seeker, 380 de haut, une rangee
##     qui glisse (« pas de prise de tete a avoir deux systemes »). La
##     derniere carte visible est coupee par le bord expres : une carte a
##     moitie en vue est ce qui dit qu'il y en a d'autres.
##   • LE CORPS DE LA CARTE EST SOMBRE EXPRES. Sur le cadre parchemin, un
##     corps parchemin faisait « blanc sur blanc » : la reference tire son
##     punch d'un dessin clair dans un creux sombre, teinte a la couleur de
##     l'objet, arrondi comme tout cadre peint du kit.
##   • L'ETAL S'OUVRE SUR LES CAROTTES, quel que soit le rail dont l'app se
##     souvient : c'est le prix que tout le monde peut payer.
##
## L'ARGENT, EN NATIF. Le pont du Seeker signe des MESSAGES (ce que la
## connexion demandait) et n'a pas encore de chemin de transaction ; le web
## le dit tel quel (use-usdc-pay.ts `isNative`, `t.pay.needsBuild`) plutot
## qu'un bouton qui echoue obscurement sur le seul appareil vise. `UsdcPay`
## ci-dessous garde la forme de la machine a etats du web (idle / quoting /
## signing / confirming / done) et s'arrete a ce mot : le jour ou le pont
## signe des transactions, c'est `pay` qui se remplit, pas l'etal.

## Le rail choisi a change (pour l'energie, qui doit tarifer sur le meme).
signal rail_changed(rail: String)

## LA CARTE (stall-card.tsx `CARD`) : 136 x 164, l'art a 62, et 22 + 18 de
## debord pour l'enseigne au-dessus et le prix en dessous.
const CARD_W := 136.0
const CARD_H := 164.0
const CARD_ART := 62.0
## Les sortes que l'etal du web dessine en emoji (item-meta.ts `icon`).
const STALL_EMOJI := {"trap": "🪤", "smoke": "🌫️", "mirage": "🌀"}
const CARD_OVER_TOP := 22.0
const CARD_OVER_BOTTOM := 18.0
## L'ecart entre deux cartes (`.rr-stall-shelf gap`), et l'air du bout.
const CARD_GAP := 14.0
const SHELF_PAD := 6.0
## Le bouton du prix : 40 de haut. Le web le fait au contenu, min(width - 24,
## 120) au moins ; la planche doree porte 30px de feuilles a chaque bout, donc
## elle prend toute la largeur de la carte pour garder 60px de face au prix.
const BUY_H := 40.0
const BUY_W := CARD_W
## Le prix en 12px (`priceText`), chiffres tabulaires.
const PRICE_SIZE := 12
## L'enseigne SHOP : une planche a 1,5x, 200 de large, suspendue au-dessus du
## rail haut du cadre (`top: -railTop - 6`).
const SIGN_W := 200.0
const SIGN_H := 57.0
const SIGN_LIFT := 6.0
## La ligne de tete (34), le pied (20 sur le web, 18 ici : le cadre du kit
## prend 10px d'air de plus que celui du web, et 380 est la hauteur), la
## barre (8, marges 28).
const HEAD_H := 34.0
const FOOT_H := 18.0
const BODY_GAP := 4.0
const TRACK_H := 8.0
const TRACK_MARGIN := 28.0
const TRACK_THUMB_MIN := 24.0
## Le rail : 26 de haut, 40 au moins, du 10px.
const RAIL_H := 26.0
const RAIL_W := 50.0
## Un clic est un glissement passe cette distance (stall-drag.ts).
const DRAG_SLOP := 4.0

## LES RAILS D'ARGENT que le build connait (lib/pay/tokens.ts PAY_TOKENS),
## par leur symbole. Dessines meme quand la route de l'argent est coupee : une
## offre temporairement indisponible n'est pas une offre qui n'existe pas, et
## l'etal doit pouvoir dire laquelle des deux.
const RAILS := {"usdc": "USDC", "sol": "SOL", "skr": "SKR"}
## Les decimales affichees par rail (`displayDecimals`) : « 0.00 SOL » n'est
## pas un prix.
const RAIL_PLACES := {"usdc": 2, "sol": 4, "skr": 2}

var _state: ShopState
var _pay: UsdcPay
## "carrots" ou une cle de RAILS.
var _rail := "carrots"
var _drag := StallDrag.new()
var _dragging := false
var _thumb_drag: Dictionary = {}

var _sign: NineSlice
var _sign_text: Label
var _rails: HBoxContainer
var _purse: NineSlice
var _purse_text: Label
var _shelf: ScrollContainer
var _row: HBoxContainer
var _track: Control
var _foot: Label


func _init() -> void:
	# Sans titre dans l'en-tete : l'enseigne pend au-dessus du cadre.
	super("", 880.0, 380.0)


## OUVRIR L'ETAL sur le chrome, a la taille du web : min(880, l'ecran moins
## la gouttiere) sur min(400, pareil).
static func open() -> Shop:
	var dialog := Shop.new()
	if Chrome.current != null:
		var view := Chrome.current.get_viewport_rect().size
		dialog.custom_minimum_size = Vector2(
			minf(880.0, view.x - 2.0 * Kit.EDGE), minf(400.0, view.y - 2.0 * Kit.EDGE))
		Chrome.current.open(dialog)
	return dialog


func _ready() -> void:
	_state = ShopState.shared()
	_pay = UsdcPay.new()
	_build()
	_rebuild()
	_state.changed.connect(_rebuild)
	Home.changed.connect(_rebuild)
	I18N.locale_changed.connect(func(_code: String) -> void: _rebuild())
	_pay.changed.connect(_rebuild)
	# La fermeture efface le mot du moment, comme `onClose` du web.
	closed.connect(func() -> void:
		_state.clear_note()
		_pay.error = "")
	resized.connect(_place_sign)
	_place_sign.call_deferred()


## LA CHARPENTE, une fois : l'enseigne, la ligne de tete, l'etagere, la
## barre, le pied. Le contenu se reecrit dans `_rebuild`.
func _build() -> void:
	# L'enseigne, sur le dialogue lui-meme (pas dans le corps) pour deborder
	# du cadre, avec une ombre dure dessous (`drop-shadow(0 4px 0)`).
	var shadow := Kit.plank("wood")
	shadow.tint = Color(0, 0, 0, 0.45)
	shadow.custom_minimum_size = Vector2(SIGN_W, SIGN_H)
	shadow.size = Vector2(SIGN_W, SIGN_H)
	add_child(shadow)
	_sign = Kit.plank("wood")
	_sign.custom_minimum_size = Vector2(SIGN_W, SIGN_H)
	_sign.size = Vector2(SIGN_W, SIGN_H)
	add_child(_sign)
	shadow.set_meta("sign_shadow", true)
	_sign_text = Kit.label("", 20, Palette.CREAM, true)
	_sign_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sign_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_sign_text.uppercase = I18N.pixel_face()
	Kit.fill(_sign_text)
	_sign.add_child(_sign_text)
	# Le [x] du cadre reste au-dessus de l'enseigne.
	move_child(close_button, get_child_count() - 1)

	var column := Kit.vbox(BODY_GAP)
	set_body(column)

	# La ligne de tete : les rails a gauche, la bourse a droite. La bourse
	# est dans la tete parce que chaque prix se lit contre elle, et forcer le
	# joueur a fermer la boutique pour la verifier est la seule chose qu'une
	# boutique ne doit jamais faire.
	var head := Kit.hbox(Kit.PAD)
	head.custom_minimum_size = Vector2(0, HEAD_H)
	column.add_child(head)
	_rails = Kit.hbox(4)
	_rails.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(_rails)
	head.add_child(Kit.spacer())
	_purse = Kit.plank("wood")
	_purse.custom_minimum_size = Vector2(120, HEAD_H)
	_purse.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(_purse)
	var purse_row := Kit.hbox(4)
	purse_row.alignment = BoxContainer.ALIGNMENT_CENTER
	Kit.fill(purse_row)
	purse_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_purse.add_child(purse_row)
	_purse_text = Kit.label("", 12, Palette.CREAM, true)
	_purse_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	purse_row.add_child(_purse_text)
	var purse_icon := Kit.icon(Kit.ICONS["carrot"], 14)
	purse_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	purse_row.add_child(purse_icon)

	# L'ETAGERE : une rangee, glissee de cote — au doigt, en tirant la rangee
	# a la souris, ou par la barre dessous. Pas de barre native : c'est un
	# calque qui se cache tout seul sur un Mac, et « parfois il y a une barre »
	# n'est pas une affordance.
	_shelf = ScrollContainer.new()
	_shelf.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_shelf.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_shelf.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_shelf.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_shelf.mouse_default_cursor_shape = Control.CURSOR_DRAG
	column.add_child(_shelf)
	var pad := Kit.margin(SHELF_PAD, 0, SHELF_PAD, 0)
	pad.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_shelf.add_child(pad)
	_row = Kit.hbox(CARD_GAP)
	_row.alignment = BoxContainer.ALIGNMENT_BEGIN
	pad.add_child(_row)

	# LA BARRE : son pouce est la part visible de la rangee, sa place celle de
	# la rangee ; on peut le tirer, ou cliquer a cote pour paginer.
	var track_pad := Kit.margin(TRACK_MARGIN, 2, TRACK_MARGIN, 0)
	column.add_child(track_pad)
	_track = Control.new()
	_track.custom_minimum_size = Vector2(0, TRACK_H)
	_track.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_track.draw.connect(_draw_track)
	_track.gui_input.connect(_on_track_input)
	track_pad.add_child(_track)
	_shelf.get_h_scroll_bar().value_changed.connect(func(_v: float) -> void: _track.queue_redraw())
	_shelf.get_h_scroll_bar().changed.connect(_track.queue_redraw)

	# Le pied : la devise, ou ce qui vient d'arriver. Jamais ce qui cede : la
	# grille au-dessus est ce qui a le droit de perdre de la hauteur.
	_foot = Kit.label("", 11, Palette.BARK)
	_foot.custom_minimum_size = Vector2(0, FOOT_H)
	_foot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_foot.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_foot.clip_text = true
	_foot.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_foot)


## LE DIALOGUE MESURE SON CONTENU : le cadre de Dialog est ancre, pas
## mesure, et un dialogue sans hauteur donnee s'ecrasait a zero dans un
## conteneur (le banc) comme sous le chrome.
func _get_minimum_size() -> Vector2:
	return _inset.get_combined_minimum_size() if _inset != null else Vector2.ZERO


## L'enseigne, centree, au-dessus du rail haut du cadre.
func _place_sign() -> void:
	if _sign == null:
		return
	# SUR le rail haut, a SIGN_LIFT au-dessus, pas plus : sur un ecran de 400px le
	# dialogue prend toute la hauteur, et une enseigne posee au-dessus du
	# cadre sortait de l'ecran. Le web la pend au rail (`.rr-stall-sign`).
	var at := Vector2(floor((size.x - SIGN_W) * 0.5), -SIGN_LIFT)
	_sign.position = at
	for child in get_children():
		if child is NineSlice and child.has_meta("sign_shadow"):
			child.position = at + Vector2(0, 4)


# ── Le contenu ───────────────────────────────────────────────────────────────

## TOUT SE REECRIT d'un coup : les mots (la langue), les rails (ce que le
## deploiement prend), les cartes (l'etal) et le pied (le mot du moment).
## La position de l'etagere survit a la reecriture.
func _rebuild() -> void:
	if _row == null:
		return
	_sign_text.text = I18N.shout(I18N.t("shop.title"))
	_sign_text.uppercase = I18N.pixel_face()
	_purse_text.text = I18N.group_digits(_state.stock())

	var tokens := _live_tokens()
	if _rail != "carrots" and not tokens.has(_rail):
		_rail = "carrots"
	_rebuild_rails(tokens)

	var keep := _shelf.scroll_horizontal
	for old in _row.get_children():
		_row.remove_child(old)
		old.queue_free()
	for it in _state.shelf_order():
		_row.add_child(_card(it, tokens))
	(func() -> void: _shelf.scroll_horizontal = keep).call_deferred()

	_rebuild_foot(tokens)
	_track.queue_redraw()


## LES RAILS VIVANTS : trois raisons qu'il n'y en ait pas, pas deux — pas de
## tresorerie (coupe pour tout le monde), un INVITE (ouvert, mais pas de
## portefeuille d'ou envoyer), ou les deux disponibles.
func _live_tokens() -> Array:
	if not bool(_state.shop.get("usdcEnabled", false)):
		return []
	if bool(Session.player.get("guest", false)):
		return []
	var listed: Variant = _state.shop.get("tokens", [])
	return listed if listed is Array else []


## Pourquoi les rails morts sont morts : la meme paire que la devise du pied.
## Dire « pas encore branche » a un joueur connecte quand la verite est
## « connecte un portefeuille » l'envoie attendre une chose deja arrivee.
func _dead_reason() -> String:
	if _state.loaded() and not bool(_state.shop.get("usdcEnabled", false)):
		return I18N.t("shop.cardsOff")
	return I18N.t("shop.connectForCard")


func _rebuild_rails(tokens: Array) -> void:
	for old in _rails.get_children():
		_rails.remove_child(old)
		old.queue_free()
	_rails.add_child(_rail_button("carrots", true))
	for id in RAILS:
		_rails.add_child(_rail_button(id, tokens.has(id)))


## UN RAIL : la planche a feuilles du solde (`.rr-stall-rails`, la meme
## matiere que le solde a droite), le libelle en creme dessus. Le rail choisi
## est plein ; les autres un peu en retrait ; un rail que ce deploiement ne
## peut pas prendre est dessine, eteint et pas pressable — attenue, pas
## grise : desaturer la pastille en ferait un galet qui se lit comme un autre
## objet.
func _rail_button(id: String, live: bool) -> Button:
	var on := id == _rail
	var b := Button.new()
	b.custom_minimum_size = Vector2(RAIL_W, RAIL_H)
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if live else Control.CURSOR_FORBIDDEN
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	var face := Kit.plank("wood")
	face.show_behind_parent = true
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(face)
	b.add_child(face)
	for color_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_disabled_color"]:
		b.add_theme_color_override(color_name, Palette.CREAM)
	b.add_theme_font_size_override("font_size", 10)
	# Le cerne d'encre du web : sans lui, la creme se perd dans les feuilles.
	b.add_theme_color_override("font_outline_color", Palette.INK)
	b.add_theme_constant_override("outline_size", 4)
	if id == "carrots":
		b.icon = Kit.ICONS["carrot"]
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.add_theme_constant_override("icon_max_width", 16)
	else:
		b.text = RAILS[id]
		# A la mesure du mot, pas du seul RAIL_W : une face de 12px (Fusion,
		# hors anglais) ne tient pas « USDC » dans 50px.
		var font := b.get_theme_font("font")
		var w := font.get_string_size(b.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 28.0
		b.custom_minimum_size.x = maxf(RAIL_W, w)
	if not on:
		b.modulate.a = 0.85
	if not live:
		b.disabled = true
		b.modulate.a = 0.5
		b.tooltip_text = _dead_reason()
	b.pressed.connect(func() -> void:
		if _drag.click():
			return
		_pick_rail(id))
	return b


func _pick_rail(id: String) -> void:
	if id == _rail:
		return
	_rail = id
	rail_changed.emit(id)
	_rebuild()


## Ce que dit le pied : ce qui vient d'arriver, ou la devise — laquelle
## depend de POURQUOI il y a ou non un rail d'argent.
func _rebuild_foot(tokens: Array) -> void:
	var status := ""
	var bad := false
	if not _pay.error.is_empty():
		status = _pay.error
		bad = true
	elif _pay.stage != UsdcPay.Stage.IDLE and _pay.stage != UsdcPay.Stage.DONE:
		status = UsdcPay.stage_line(_pay.stage)
	elif not _state.note.is_empty():
		status = _state.note
		bad = _state.refused
	if not status.is_empty():
		_foot.text = status
		# Le bon et le mauvais du pied sur parchemin (`.rr-stall-foot`).
		_foot.add_theme_color_override("font_color",
			Palette.BAD_ON_PARCHMENT if bad else Palette.LEAF.darkened(0.35))
		return
	_foot.add_theme_color_override("font_color", Palette.BARK)
	if _state.loaded() and not bool(_state.shop.get("usdcEnabled", false)):
		_foot.text = I18N.t("shop.cardsOff")
	elif _state.loaded() and tokens.is_empty():
		_foot.text = I18N.t("shop.connectForCard")
	else:
		_foot.text = I18N.t("shop.eitherWay")


# ── Une carte ────────────────────────────────────────────────────────────────

## UNE CARTE : le nom sur une planche pendue au bord haut, le compte sur une
## pastille au coin, l'art comme tout le milieu, et le prix — qui EST le
## bouton — pendu au bord bas. Les debords sont ce qui la fait lire comme un
## objet pose sur l'etagere plutot qu'une boite dessinee dessus.
func _card(it: Dictionary, tokens: Array) -> Control:
	var kind := String(it.get("kind", ""))
	var item_name := I18N.t("items.%s.name" % kind)
	var full := not bool(it.get("hasRoom", true))
	var money := _rail != "carrots" and not tokens.is_empty()
	var tint: Color = ShopState.TINT.get(kind, Palette.PLANK)

	var card := Control.new()
	card.custom_minimum_size = Vector2(CARD_W, CARD_OVER_TOP + CARD_H + CARD_OVER_BOTTOM)
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Plus rien a acheter : la carte recule au lieu de crier un prix.
	if full:
		card.modulate.a = 0.7

	# Le corps : la terre dans la teinte de l'objet (35 % de teinte sur la
	# terre en haut, 20 % sur la terre profonde en bas — une seule teinte
	# ici, le milieu du degrade), le bord d'une planche eclairee, l'ourlet
	# de terre profonde.
	var body_style := StyleBoxFlat.new()
	body_style.bg_color = tint.lerp(Palette.SOIL, 0.65).lerp(tint.lerp(Palette.SOIL_DEEP, 0.8), 0.5)
	body_style.set_border_width_all(3)
	body_style.border_color = Palette.WELL_FACE
	body_style.set_corner_radius_all(14)
	body_style.shadow_color = Palette.SOIL_DEEP
	body_style.shadow_size = 2
	body_style.set_content_margin_all(0)
	var body_panel := Kit.panel(body_style)
	body_panel.position = Vector2(0, CARD_OVER_TOP)
	body_panel.size = Vector2(CARD_W, CARD_H)
	body_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(body_panel)

	# L'ART, tout le milieu, rien a cote. Les sortes sans sprite tombaient sur
	# un emoji ; la face pixel n'en a pas, donc l'initiale du nom dans la
	# teinte de l'objet — et ca se voit : ces sortes veulent un dessin.
	var middle := Kit.margin(8, 26, 8, 22)
	middle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body_panel.add_child(middle)
	var centre := CenterContainer.new()
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	middle.add_child(centre)
	if STALL_EMOJI.has(kind):
		# Sans sprite, l'etal du web montre l'emoji de la sorte
		# (stall-card.tsx `meta.icon`) — une vraie boite-piege, pas la bombe
		# eteinte que la rangee du kit porte.
		centre.add_child(Kit.emoji(STALL_EMOJI[kind], int(CARD_ART * 0.8)))
	elif ShopState.ART.has(kind):
		var art_shadow := Kit.icon(ShopState.ART[kind], CARD_ART)
		art_shadow.modulate = Color(0, 0, 0, 0.35)
		var stack := Control.new()
		stack.custom_minimum_size = art_shadow.custom_minimum_size
		stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		art_shadow.position = Vector2(0, 6)
		stack.add_child(art_shadow)
		stack.add_child(Kit.icon(ShopState.ART[kind], CARD_ART))
		centre.add_child(stack)
	else:
		var glyph := Kit.label(item_name.substr(0, 1).to_upper(), int(CARD_ART * 0.8), tint.lightened(0.45), true)
		centre.add_child(glyph)

	# LE NOM, sur une planche pendue au bord haut.
	var name_sign := Kit.plank("wood")
	name_sign.size = Vector2(minf(CARD_W - 4.0, 140.0), 38.0)
	name_sign.position = Vector2(floor((CARD_W - name_sign.size.x) * 0.5), CARD_OVER_TOP - 19.0)
	card.add_child(name_sign)
	var sign_text := Kit.label(I18N.shout(item_name), 11, Palette.CREAM, true)
	sign_text.uppercase = I18N.pixel_face()
	sign_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sign_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	sign_text.clip_text = true
	Kit.fill(sign_text)
	name_sign.add_child(sign_text)

	# LE COMPTE TENU, au coin, comme le 13/50 de la reference. Trois choses
	# differentes a dire (ShopState.held_label).
	var held := ShopState.held_label(kind, int(it.get("held", 0)), int(it.get("cap", 0)))
	var badge := Kit.badge(20)
	var held_text := Kit.label(held, 10, Palette.CREAM, true)
	held_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	held_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var held_w := held_text.get_theme_font("font").get_string_size(held, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 16.0
	badge.size = Vector2(maxf(28.0, held_w), 20.0)
	badge.position = Vector2(CARD_W - badge.size.x + 6.0, CARD_OVER_TOP + 14.0)
	Kit.fill(held_text)
	badge.add_child(held_text)
	card.add_child(badge)

	# LE BOUTON UNIQUE : le prix EST le bouton, la ou un pouce tombe. L'or
	# lampe pour les carottes (CARROT_BTN), le bois eteint quand on ne peut
	# pas payer — la lampe eteinte comme couleur de FACE, la carotte a cote
	# reste en couleur (Paul, 2026-09-16) —, le bleu froid pour l'argent
	# (COIN_BTN : le froid, et SEULEMENT l'argent).
	var can_buy := bool(it.get("canBuy", false))
	var dead := _state.busy or _pay.stage != UsdcPay.Stage.IDLE or (full if money else not can_buy)
	var tone := "blue" if money else ("wood" if dead else "gold")
	var label := _money_label(float(it.get("usdc", 0.0))) if money else I18N.group_digits(int(it.get("price", 0)))
	var buy := Kit.button(label + ("" if money else "  "), tone, BUY_W, BUY_H)
	buy.label_size = PRICE_SIZE
	buy.disabled = dead
	buy.position = Vector2(floor((CARD_W - BUY_W) * 0.5), CARD_OVER_TOP + CARD_H - BUY_H + CARD_OVER_BOTTOM)
	# La taille APRES l'entree dans l'arbre : avant `_ready`, le Button mesure
	# encore son libelle a la taille du theme, et une taille posee la est
	# remontee a ce minimum-la — puis reste, quand le minimum retombe.
	buy.set_deferred("size", Vector2(BUY_W, BUY_H))
	# Ce que le prix en carottes veut dire, en une phrase, en info-bulle :
	# une etagere pleine est une affaire finie, une bourse courte une raison
	# d'aller creuser.
	var carrot_price := I18N.f("shop.priceLabel", [I18N.group_digits(int(it.get("price", 0)))])
	if money:
		buy.tooltip_text = "$%.2f" % float(it.get("usdc", 0.0))
	elif full:
		buy.tooltip_text = I18N.f("shop.capped", [item_name, carrot_price])
	elif can_buy:
		buy.tooltip_text = I18N.f("shop.buy", [item_name, carrot_price])
	else:
		buy.tooltip_text = I18N.f("shop.tooPoor", [item_name, carrot_price])
	if not money:
		_carrot_on(buy, 12)
	buy.pressed.connect(func() -> void:
		# Le clic qui suit un glissement n'achete rien (stall-drag.ts).
		if _drag.click():
			return
		if money:
			_pay_money(kind)
		else:
			_state.buy(kind))
	card.add_child(buy)
	return card


## LA CAROTTE SUR LA FACE DU PRIX. La planche peint son libelle centre ; deux
## espaces en fin de texte lui font la place, et l'icone, enfant du meme
## label, se pose dans cette place et monte avec lui dans la vague.
func _carrot_on(button: PlankButton, px: float) -> void:
	var icon := Kit.icon(Kit.ICONS["carrot"], px)
	var ink: Label = button._ink
	ink.add_child(icon)
	var place := func() -> void:
		var font := ink.get_theme_font("font")
		var fs := ink.get_theme_font_size("font_size")
		var w := font.get_string_size(ink.text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		icon.position = Vector2(floor(ink.size.x * 0.5 + w * 0.5 - icon.custom_minimum_size.x), floor((ink.size.y - px) * 0.5))
	button.resized.connect(place)
	place.call_deferred()


## LE PRIX EN ARGENT (lib/pay/tokens.ts `priceLabel`) : le dollar pour USDC
## ou sans taux ; sinon le montant dans le rail, arrondi VERS LE HAUT — la
## carte ne doit jamais citer moins que ce que le portefeuille demandera.
func _money_label(usd: float) -> String:
	if _rail == "usdc":
		return "$%.2f" % usd
	var rates: Variant = _state.shop.get("rates", null)
	var rate := float(rates.get(_rail, 0.0)) if rates is Dictionary else 0.0
	if rate <= 0.0 or not is_finite(rate):
		return "$%.2f" % usd
	var places: int = RAIL_PLACES.get(_rail, 2)
	var scale := pow(10.0, places)
	var shown := ceilf(usd / rate * scale) / scale
	return String.num(shown, places) + " " + String(RAILS[_rail])


func _pay_money(kind: String) -> void:
	await _pay.pay(kind, 1, _rail)
	if not _pay.error.is_empty():
		_state.noted.emit(_pay.error, true)
	_rebuild()


# ── Tirer la rangee (stall-drag.ts) ──────────────────────────────────────────

## LE GLISSEMENT est vu ici, avant les boutons : un bouton avale la pression
## qui commence sur lui, et l'etagere ne la verrait jamais. `_input` recoit
## tout en premier. Souris et doigt confondus — le doigt arrive en souris
## emulee, et prendre la rangee au conteneur natif eviterait qu'ils se
## battent.
func _input(event: InputEvent) -> void:
	if not is_visible_in_tree() or _shelf == null:
		return
	# Dans le repere de l'etagere : la fenetre est etiree en canvas_items, et
	# un pixel d'ecran n'est pas un pixel de rangee.
	var local: InputEvent = _shelf.make_input_local(event)
	if local is InputEventMouseButton and local.button_index == MOUSE_BUTTON_LEFT:
		if local.pressed:
			if Rect2(Vector2.ZERO, _shelf.size).has_point(local.position):
				_drag.down(local.position.x, float(_shelf.scroll_horizontal))
		else:
			# Le clic qui suit un glissement arrive encore, donc l'avaleur
			# s'arme ici et se desarme un instant PLUS TARD, pas seulement par
			# le clic : un glissement fini hors de la rangee ne fait aucun
			# clic, et « arme jusqu'au clic » restait arme pour toujours —
			# l'etal n'achetait plus rien dans aucune devise.
			if _drag.up():
				_drag.disarm.call_deferred()
			if _dragging:
				_dragging = false
				_shelf.mouse_default_cursor_shape = Control.CURSOR_DRAG
	elif local is InputEventMouseMotion:
		var was := _drag.dragging()
		var left: Variant = _drag.move(local.position.x)
		if left == null:
			return
		if not was:
			_dragging = true
			_shelf.mouse_default_cursor_shape = Control.CURSOR_CAN_DROP
		_shelf.scroll_horizontal = int(left)


# ── La barre (StallShelf) ────────────────────────────────────────────────────

## La part visible de la rangee, et ou elle en est — en parts de 1.
func _bar() -> Vector2:
	var bar := _shelf.get_h_scroll_bar()
	if bar.max_value <= bar.page + 1.0:
		return Vector2(1.0, 0.0)
	return Vector2(bar.page / bar.max_value, bar.value / bar.max_value)


## Une rainure dans le parchemin, un pouce de bois, aux couleurs de l'etal.
func _draw_track() -> void:
	var share := _bar()
	if share.x >= 1.0:
		return
	var w := _track.size.x
	var groove := StyleBoxFlat.new()
	groove.bg_color = Color(Palette.BARK, 0.22)
	groove.set_corner_radius_all(4)
	_track.draw_style_box(groove, Rect2(0, 0, w, TRACK_H))
	var thumb_w := maxf(TRACK_THUMB_MIN, share.x * w)
	var thumb_x := minf(share.y * w, w - thumb_w)
	var thumb := StyleBoxFlat.new()
	thumb.bg_color = Palette.WELL_FACE
	thumb.set_corner_radius_all(4)
	thumb.shadow_color = Color(0, 0, 0, 0.35)
	thumb.shadow_offset = Vector2(0, 1)
	thumb.shadow_size = 0
	_track.draw_style_box(thumb, Rect2(thumb_x, 0, thumb_w, TRACK_H))
	_track.draw_line(Vector2(thumb_x + 2, 0.5), Vector2(thumb_x + thumb_w - 2, 0.5), Color(Palette.PARCHMENT, 0.35))


func _on_track_input(event: InputEvent) -> void:
	var share := _bar()
	if share.x >= 1.0:
		return
	var w := _track.size.x
	var bar := _shelf.get_h_scroll_bar()
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			var thumb_w := maxf(TRACK_THUMB_MIN, share.x * w)
			var thumb_x := minf(share.y * w, w - thumb_w)
			if event.position.x >= thumb_x and event.position.x <= thumb_x + thumb_w:
				_thumb_drag = {"x": event.position.x, "left": bar.value}
			else:
				# Un clic a cote du pouce pagine vers lui.
				var dir := -1.0 if event.position.x / w < share.y else 1.0
				var target := clampf(bar.value + dir * bar.page * 0.8, 0.0, bar.max_value - bar.page)
				create_tween().tween_property(_shelf, "scroll_horizontal", int(target), 0.25) \
					.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			_track.accept_event()
		else:
			_thumb_drag = {}
	elif event is InputEventMouseMotion and not _thumb_drag.is_empty():
		# Un pixel de barre vaut scrollWidth / trackWidth pixels de rangee.
		var left: float = _thumb_drag["left"] + (event.position.x - _thumb_drag["x"]) * (bar.max_value / w)
		_shelf.scroll_horizontal = int(left)
		_track.accept_event()


## LE GESTE DE L'ETAGERE, comme machine a etats sans DOM dedans
## (stall-drag.ts). L'interessant n'est pas le defilement mais QUAND une
## pression cesse d'etre un clic — et ca a ete livre faux une fois.
class StallDrag:
	extends RefCounted
	var _press: Dictionary = {}
	## Un glissement vient de finir et le clic qu'il engendre — s'il vient —
	## doit etre avale. Separe de `_press` justement parce que le clic n'est
	## PAS garanti.
	var _armed := false

	func dragging() -> bool:
		return not _press.is_empty() and bool(_press.get("moved", false))

	func swallowing() -> bool:
		return _armed

	## Une pression a atterri. `left` est le scroll actuel de la rangee.
	func down(x: float, left: float) -> void:
		_press = {"x": x, "left": left, "moved": false}

	## Le pointeur a bouge. Rend le scroll que la rangee doit prendre, ou
	## null tant que la pression n'a pas voyage assez pour etre un glissement.
	func move(x: float) -> Variant:
		if _press.is_empty():
			return null
		var dx: float = x - float(_press["x"])
		if not bool(_press["moved"]):
			if absf(dx) <= Shop.DRAG_SLOP:
				return null
			_press["moved"] = true
		return float(_press["left"]) - dx

	## Le pointeur est remonte. Vrai quand la pression etait un glissement,
	## et que le clic qui peut suivre doit donc etre avale.
	func up() -> bool:
		var dragged := dragging()
		_press = {}
		_armed = dragged
		return dragged

	## Un clic est arrive. Vrai quand il appartient a un glissement.
	func click() -> bool:
		var swallow := _armed
		_armed = false
		return swallow

	## Oublier tout avalement en attente.
	func disarm() -> void:
		_armed = false


## PAYER EN ARGENT (use-usdc-pay.ts), la forme sans la transaction. Trois
## pas sur le web — la cotation du serveur, la signature du joueur, la
## verification sur la chaine — et le milieu est au joueur, pas a nous. Le
## pont natif ne signe pas encore de transactions : `pay` s'arrete au mot que
## le web dit dans ce cas (`t.pay.needsBuild`), et l'etal montre ce mot.
class UsdcPay:
	extends RefCounted
	enum Stage { IDLE, QUOTING, SIGNING, CONFIRMING, DONE }
	signal changed
	var stage: Stage = Stage.IDLE
	var error := ""

	func pay(_kind: String, _qty: int = 1, _rail: String = "usdc") -> Dictionary:
		error = ""
		stage = Stage.IDLE
		# Le pont du Seeker signe des MESSAGES et n'a pas de chemin de
		# transaction : le dire bat un bouton qui echoue obscurement.
		error = I18N.t("pay.needsBuild")
		changed.emit()
		return {}

	## Ce qu'un paiement en vol fait, en mots (`payStageLine`). `idle` et
	## `done` n'ont rien a dire : ce ne sont pas des etats qu'on attend.
	static func stage_line(s: Stage) -> String:
		match s:
			Stage.QUOTING:
				return I18N.t("shop.pricing")
			Stage.SIGNING:
				return I18N.t("shop.approve")
			Stage.CONFIRMING:
				return I18N.t("shop.confirming")
		return ""
