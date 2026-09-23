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

## LA CARTE (stall-card.tsx `CARD`) : 136 de large, l'art a 62, et 22 + 18
## de debord pour l'enseigne au-dessus et le prix en dessous. Toutes ces
## mesures sont celles du Seeker ; ailleurs elles sont multipliees par `_k`,
## la part de hauteur que l'etagere a en plus.
const CARD_W := 136.0
## Le corps : le nom, l'art dans son halo, la phrase qui dit ce que la chose
## FAIT, le prix. 164 ne portait que l'art : un etal qui ne dit pas a quoi
## sert ce qu'il vend demande au joueur de deviner avant de payer.
const CARD_H := 214.0
const CARD_ART := 62.0
## Le creux lumineux ou l'art flotte, et le haut du corps qu'il laisse au nom.
const ART_ZONE := 86.0
const ART_TOP := 22.0
## La phrase : du 10px, moins si elle ne tient pas (voir `_card`).
const BLURB_SIZE := 10
## Les sortes que l'etal du web dessine en emoji (item-meta.ts `icon`). La
## fumee prend la bouffee, pas le brouillard : 🌫️ sort en carre gris flou.
const STALL_EMOJI := {"trap": "🪤", "smoke": "💨", "mirage": "🌀"}
const CARD_OVER_TOP := 22.0
const CARD_OVER_BOTTOM := 18.0
## L'ecart entre deux cartes (`.rr-stall-shelf gap`), et l'air du bout.
const CARD_GAP := 14.0
const SHELF_PAD := 6.0
## Ce qu'une carte grandit au plus sur un grand ecran, par pas d'un quart
## pour que les tailles de texte restent entieres.
const SCALE_MAX := 1.75
## Les cartes que l'etagere garde en vue avant de grossir (`_fit_bay`).
const SHELF_SEEN := 5
## Ce que l'enseigne SHOP descend dans la baie : une carte qui grandit ne
## monte pas jusqu'a elle.
const SIGN_CLEAR := 20.0
## Le bouton du prix : 40 de haut. Le web le fait au contenu, min(width - 24,
## 120) au moins ; la planche doree porte 30px de feuilles a chaque bout, donc
## elle prend toute la largeur de la carte pour garder 60px de face au prix.
const BUY_H := 40.0
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
## Le feuillage d'un bout de planche de bois, mesure a l'ecran (20 px des
## 25 du bout, les touffes debordent vers le milieu) : un mot pose sur une
## planche s'arrete avant, jamais sur les feuilles.
const LEAF_END := 20.0
## Le meme sur un rail : 26 de haut, ses touffes sont plus courtes. Au-dela,
## les quatre rails anglais touchaient l'enseigne SHOP a 890 de large.
const RAIL_LEAF := 16.0
## Le plus petit que le nom d'une carte descend pour tenir sur sa planche.
const NAME_MIN := 8
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
var _bay: Control
var _lamp: TextureRect
## L'echelle des cartes (1 au Seeker), et si l'entree a deja ete jouee : les
## cartes tombent sur l'etagere a l'ouverture, pas a chaque achat.
var _k := 1.0
var _entered := false


func _init() -> void:
	# Sans titre dans l'en-tete : l'enseigne pend en haut de l'ecran.
	super("", 880.0, 380.0)
	# PLEIN ECRAN, comme le profil : l'etagere prend toute la largeur, et
	# plus de cartes sont en vue avant de glisser.
	go_fullscreen()


## OUVRIR L'ETAL sur le chrome, qui le pose sur tout l'ecran.
static func open() -> Shop:
	var dialog := Shop.new()
	if Chrome.current != null:
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
	_state.bought.connect(_celebrate)
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
	if fullscreen:
		# Le [x] est dans le coin haut droit, sur la ligne de la bourse : elle
		# lui cede sa zone de tap.
		var reserve := Control.new()
		reserve.custom_minimum_size = Vector2(Kit.CLOSE_TAP, 0.0)
		head.add_child(reserve)

	# L'ETAGERE : une rangee, glissee de cote — au doigt, en tirant la rangee
	# a la souris, ou par la barre dessous. Pas de barre native : c'est un
	# calque qui se cache tout seul sur un Mac, et « parfois il y a une barre »
	# n'est pas une affordance.
	_shelf = ScrollContainer.new()
	_shelf.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_shelf.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_shelf.mouse_default_cursor_shape = Control.CURSOR_DRAG
	# Les cartes cachees derriere un bord : le bord fond (ScrollFade).
	ScrollFade.attach(_shelf)
	# DES CARTES ENTIERES, comme le web : l'etagere se centre a la largeur
	# d'un nombre entier de cartes. Pleine largeur, elle laissait depasser le
	# bord d'une sixieme carte au Seeker. Dans une boite SANS minimum, posee a
	# la main : un minimum de largeur empecherait le dialogue de retrecir.
	var bay := Control.new()
	_bay = bay
	bay.size_flags_vertical = Control.SIZE_EXPAND_FILL
	bay.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bay.mouse_filter = Control.MOUSE_FILTER_PASS
	column.add_child(bay)
	# UNE LAMPE SUR L'ETAL : une flaque doree douce derriere les cartes, pour
	# qu'elles soient posees dans la lumiere plutot que sur un fond uni.
	var lamp := TextureRect.new()
	_lamp = lamp
	lamp.texture = _glow_texture(Palette.GOLD, 0.45)
	lamp.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	lamp.stretch_mode = TextureRect.STRETCH_SCALE
	lamp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bay.add_child(lamp)
	bay.add_child(_shelf)
	bay.resized.connect(_fit_bay)
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


## L'ETAGERE A LA TAILLE DE SA BAIE. La carte grandit avec la hauteur qu'on
## lui laisse — un ecran de bureau montrait cinq timbres au milieu d'un grand
## vide —, et l'etagere se centre a la largeur d'un nombre entier de cartes.
func _fit_bay() -> void:
	if _row == null:
		return
	var k := (_bay.size.y - 2.0 * SIGN_CLEAR) / _card_total(1.0)
	# ET PAS AU POINT DE CACHER L'ETAL : au moins SHELF_SEEN cartes en vue,
	# comme au telephone (ou tout, s'il y en a moins). A la hauteur seule, un
	# 1280x720 n'en montrait que quatre, un 1024x600 trois (2026-09-23). Au
	# pas au-dessous, pas de quoi tout montrer : huit cartes a l'echelle 1
	# flottaient dans un grand vide. Le fondu du bord dit le reste.
	var count := mini(_row.get_child_count(), SHELF_SEEN)
	if count > 0:
		var wide := (_bay.size.x - 2.0 * SHELF_PAD) / (count * CARD_W + (count - 1) * CARD_GAP)
		k = minf(k, wide)
	k = clampf(floorf(k * 4.0) / 4.0, 1.0, SCALE_MAX)
	if k != _k:
		_k = k
		_row.add_theme_constant_override("separation", int(CARD_GAP * k))
		_rebuild.call_deferred()
		return
	var room := _bay.size.x
	var cw := CARD_W * k
	var gap := CARD_GAP * k
	var n := maxi(1, int(floorf((room - 2.0 * SHELF_PAD + gap) / (cw + gap))))
	var fit := minf(room, n * cw + (n - 1) * gap + 2.0 * SHELF_PAD)
	_shelf.position = Vector2(floorf((room - fit) * 0.5), 0.0)
	_shelf.get_child(0).reset_size()
	_shelf.reset_size()
	_shelf.size = Vector2(fit, _bay.size.y)
	_lamp.size = Vector2(minf(room, fit * 1.1), _bay.size.y * 1.1)
	_lamp.position = Vector2(floorf((room - _lamp.size.x) * 0.5), floorf(-_bay.size.y * 0.05))


## RESSERRE SUR L'ETAL ENTIER des qu'il tient, cadre compris (Dialog.hug_size) :
## toutes les cartes a l'echelle 1 cote a cote, et la hauteur d'une rangee.
## Sur un bureau l'etal flottait dans 1376x768 de parchemin. Tant que les
## cartes ne sont pas posees, ou si l'etal ne tient pas : plein ecran.
func hug_size() -> Vector2:
	if _row == null or _inset == null or _row.get_child_count() == 0:
		return Vector2.ZERO
	var n := _row.get_child_count()
	var around := _inset.get_combined_minimum_size()
	var sides := float(_inset.get_theme_constant("margin_left") + _inset.get_theme_constant("margin_right"))
	return Vector2(
		n * CARD_W + (n - 1) * CARD_GAP + 2.0 * SHELF_PAD + sides,
		around.y + _card_total(1.0) + 2.0 * SIGN_CLEAR)


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
	var at := Vector2(floorf((size.x - SIGN_W) * 0.5), -SIGN_LIFT)
	if fullscreen:
		# Plus de rail a quoi la pendre : au-dessus de la vue, elle sortirait
		# de l'ecran. Elle se pose dans la ligne de tete, entre les rails et
		# la bourse, ou il n'y a que du vide.
		at.y = CLOSE_INSIDE
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
	var order := _state.shelf_order()
	for i in order.size():
		_row.add_child(_card(order[i], tokens, i == 0))
	if not _entered and not order.is_empty():
		_entered = true
		_enter()
	# L'etagere se remesure sur ses nouvelles cartes : un ScrollContainer ne
	# descend pas sous la hauteur de son contenu, et apres un changement
	# d'echelle il gardait celle des anciennes — les cartes se centraient
	# trop bas, sous la barre.
	(func() -> void:
		refit()
		_fit_bay()
		_shelf.scroll_horizontal = keep).call_deferred()

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
	# UNE LARGEUR POUR LES QUATRE, celle du mot le plus long : des rails de
	# tailles differentes se lisaient comme quatre choses differentes, et la
	# carotte seule faisait une pastille de moitie.
	var wide := RAIL_W
	for id in RAILS:
		wide = maxf(wide, _face().get_string_size(RAILS[id], HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 2.0 * RAIL_LEAF)
	_rails.add_child(_rail_button("carrots", true, wide))
	for id in RAILS:
		_rails.add_child(_rail_button(id, tokens.has(id), wide))


## UN RAIL : la planche a feuilles du solde (`.rr-stall-rails`, la meme
## matiere que le solde a droite), le libelle en creme dessus. Le rail choisi
## est plein ; les autres un peu en retrait ; un rail que ce deploiement ne
## peut pas prendre est dessine, eteint et pas pressable — attenue, pas
## grise : desaturer la pastille en ferait un galet qui se lit comme un autre
## objet.
func _rail_button(id: String, live: bool, width: float) -> Button:
	var on := id == _rail
	var b := Button.new()
	b.custom_minimum_size = Vector2(width, RAIL_H)
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
	# Dans la face pixel seulement : Fusion (hors anglais) est une face
	# bitmap, un cerne la dechiquette — « USDC » sortait « ISDC »
	# (voir dialog.gd, le titre).
	if I18N.pixel_face():
		b.add_theme_color_override("font_outline_color", Palette.INK)
		b.add_theme_constant_override("outline_size", 4)
	if id == "carrots":
		b.icon = Kit.ICONS["carrot"]
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.add_theme_constant_override("icon_max_width", 16)
	else:
		b.text = RAILS[id]
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
## pastille au coin, l'art qui flotte dans un halo de sa couleur, une phrase
## qui dit ce qu'il fait, et le prix — qui EST le bouton — pendu au bord bas.
## Les debords sont ce qui la fait lire comme un objet pose sur l'etagere
## plutot qu'une boite dessinee dessus. `lead` est la premiere carte (la
## recharge d'energie) : elle porte le cadre dore et les rayons.
func _card(it: Dictionary, tokens: Array, lead: bool) -> Control:
	var k := _k
	var kind := String(it.get("kind", ""))
	var item_name := I18N.t("items.%s.name" % kind)
	var full := not bool(it.get("hasRoom", true))
	var money := _rail != "carrots" and not tokens.is_empty()
	var tint: Color = ShopState.TINT.get(kind, Palette.PLANK)
	var w := floorf(CARD_W * k)
	var h := floorf(CARD_H * k)
	var over_top := floorf(CARD_OVER_TOP * k)

	var card := Control.new()
	card.custom_minimum_size = Vector2(w, _card_total(k))
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.set_meta("kind", kind)
	# Tout ce qui se voit est dans `lift`, que le survol souleve et que
	# l'entree fait tomber : la carte elle-meme appartient a la rangee, qui
	# reecrit sa position.
	var lift := Control.new()
	lift.size = card.custom_minimum_size
	lift.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(lift)
	card.set_meta("lift", lift)
	# Plus rien a acheter : la carte recule au lieu de crier un prix.
	if full:
		lift.modulate.a = 0.7

	# Le corps : la terre dans la teinte de l'objet, le bord d'une planche
	# eclairee — ou d'or pour la carte de tete —, l'ourlet de terre profonde.
	var body_style := StyleBoxFlat.new()
	body_style.bg_color = tint.lerp(Palette.SOIL, 0.65).lerp(tint.lerp(Palette.SOIL_DEEP, 0.8), 0.5)
	body_style.set_border_width_all(int(3 * k))
	body_style.border_color = Palette.GOLD if lead else Palette.WELL_FACE
	body_style.set_corner_radius_all(int(14 * k))
	body_style.shadow_color = Palette.SOIL_DEEP
	body_style.shadow_size = 2
	body_style.set_content_margin_all(0)
	var body_panel := Kit.panel(body_style)
	body_panel.position = Vector2(0, over_top)
	body_panel.size = Vector2(w, h)
	body_panel.mouse_filter = Control.MOUSE_FILTER_PASS
	# Le halo et les rayons restent dans les coins arrondis du corps.
	body_panel.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	lift.add_child(body_panel)
	var inside := Control.new()
	inside.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body_panel.add_child(inside)

	# L'ART, dans son creux lumineux : un halo de la couleur de l'objet, et
	# pour la carte de tete des rayons qui tournent lentement derriere. Le
	# tout est une scene (`stage`) que la phrase peut pousser et reduire.
	var zone := floorf(ART_ZONE * k)
	var stage := Control.new()
	stage.size = Vector2(zone, zone)
	stage.pivot_offset = stage.size * 0.5
	stage.position = Vector2(floorf((w - zone) * 0.5), floorf(ART_TOP * k))
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inside.add_child(stage)
	var centre := stage.size * 0.5
	if lead:
		var rays := _rays(Palette.GOLD, floorf(zone * 1.9))
		rays.position = centre - rays.size * 0.5
		stage.add_child(rays)
	var glow := TextureRect.new()
	glow.texture = _glow_texture(tint.lightened(0.35), 0.75)
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.stretch_mode = TextureRect.STRETCH_SCALE
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.size = Vector2(zone, zone) * 1.35
	glow.position = centre - glow.size * 0.5
	stage.add_child(glow)

	var art := _art(kind, item_name, tint, floorf(CARD_ART * k))
	art.position = (centre - art.custom_minimum_size * 0.5).floor()
	art.pivot_offset = art.custom_minimum_size * 0.5
	stage.add_child(art)
	card.set_meta("art", art)
	# Il flotte : trois pixels, chaque carte a son temps, pour que l'etal
	# respire sans marcher au pas.
	var rest := art.position.y
	var bob := art.create_tween().set_loops()
	bob.tween_interval(float(kind.hash() & 0xff) / 255.0 * 0.8)
	bob.tween_property(art, "position:y", rest - 3.0 * k, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	bob.tween_property(art, "position:y", rest, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	# CE QU'IL FAIT, en une phrase (items.<kind>.blurb), posee sur le prix.
	# L'apostrophe courbe n'est pas dans la face pixel : « rival’s » sortait
	# « rivals ».
	var art_top := floorf(ART_TOP * k)
	var blurb_bottom := h - floorf((BUY_H - CARD_OVER_BOTTOM + 4.0) * k)
	var blurb := Kit.label(I18N.t("items.%s.blurb" % kind).replace("’", "'"), int(round(BLURB_SIZE * k)), Palette.CHALK, true)
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	blurb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	blurb.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	blurb.position = Vector2(floorf(9.0 * k), art_top)
	blurb.size = Vector2(w - floorf(18.0 * k), blurb_bottom - art_top)
	inside.add_child(blurb)
	# LA PHRASE D'ABORD, L'ART DANS CE QUI RESTE : elle se lit entiere, et
	# l'objet se centre au-dessus — et rapetisse s'il le faut. Un nombre de
	# lignes fixe coupait le francais a trois (Fusion a un interligne plus
	# haut que la face anglaise), et couper « ce que ca fait » au milieu est
	# pire qu'un dessin un peu plus petit.
	(func() -> void:
		var text_h := float(blurb.get_line_count() * blurb.get_line_height())
		var room := blurb_bottom - text_h - floorf(4.0 * k) - art_top
		stage.scale = Vector2.ONE * clampf(room / zone, 0.6, 1.0)
		stage.position.y = floorf(art_top + (room - zone) * 0.5)).call_deferred()

	# LE NOM, sur une planche pendue au bord haut.
	var name_sign := Kit.plank("wood")
	name_sign.size = Vector2(w - 4.0, floorf(38.0 * k))
	name_sign.position = Vector2(2.0, over_top - floorf(19.0 * k))
	lift.add_child(name_sign)
	var shout := I18N.shout(item_name)
	var sign_text := Kit.label(shout, _fit(shout, int(round(11 * k)), name_sign.size.x - 2.0 * LEAF_END * k), Palette.CREAM, true)
	sign_text.uppercase = I18N.pixel_face()
	sign_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sign_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	sign_text.clip_text = true
	Kit.fill(sign_text)
	name_sign.add_child(sign_text)

	# LE COMPTE TENU, au coin, comme le 13/50 de la reference. Une pastille
	# sombre et calme, pas le rouge d'une alerte : avoir 3 pieges n'est pas
	# une mauvaise nouvelle. Doree quand l'etagere est pleine.
	var held := ShopState.held_label(kind, int(it.get("held", 0)), int(it.get("cap", 0)))
	var held_size := int(round(10 * k))
	var chip_style := StyleBoxFlat.new()
	chip_style.bg_color = Palette.TAB_ON_BOTTOM if full else Palette.BADGE_BOTTOM
	chip_style.border_color = Palette.TAB_ON_TOP if full else Palette.BADGE_RIM
	chip_style.set_border_width_all(2)
	chip_style.set_corner_radius_all(int(5 * k))
	chip_style.set_content_margin_all(0)
	var chip := Kit.panel(chip_style)
	var held_text := Kit.label(held, held_size, Palette.INK if full else Palette.BADGE_INK, not full)
	held_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	held_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	chip.add_child(held_text)
	var held_w := _face().get_string_size(held, HORIZONTAL_ALIGNMENT_LEFT, -1, held_size).x + 12.0 * k
	chip.size = Vector2(maxf(26.0 * k, held_w), floorf(18.0 * k))
	chip.position = Vector2(w - chip.size.x - floorf(7.0 * k), over_top + floorf(24.0 * k))
	lift.add_child(chip)

	# LE BOUTON UNIQUE : le prix EST le bouton, la ou un pouce tombe. L'or
	# lampe pour les carottes (CARROT_BTN), le bois eteint quand on ne peut
	# pas payer — la lampe eteinte comme couleur de FACE, la carotte a cote
	# reste en couleur (Paul, 2026-09-16) —, le bleu froid pour l'argent
	# (COIN_BTN : le froid, et SEULEMENT l'argent).
	var can_buy := bool(it.get("canBuy", false))
	var dead := _state.busy or _pay.stage != UsdcPay.Stage.IDLE or (full if money else not can_buy)
	var tone := "blue" if money else ("wood" if dead else "gold")
	var label := _money_label(float(it.get("usdc", 0.0))) if money else I18N.group_digits(int(it.get("price", 0)))
	var buy_size := Vector2(w, floorf(BUY_H * k))
	var buy := Kit.button(label + ("" if money else "  "), tone, buy_size.x, buy_size.y)
	buy.label_size = int(round(PRICE_SIZE * k))
	buy.disabled = dead
	buy.position = Vector2(0.0, over_top + h - buy_size.y + floorf(CARD_OVER_BOTTOM * k))
	# La taille APRES l'entree dans l'arbre : avant `_ready`, le Button mesure
	# encore son libelle a la taille du theme, et une taille posee la est
	# remontee a ce minimum-la — puis reste, quand le minimum retombe.
	buy.set_deferred("size", buy_size)
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
		_carrot_on(buy, round(12 * k))
	buy.pressed.connect(func() -> void:
		# Le clic qui suit un glissement n'achete rien (stall-drag.ts).
		if _drag.click():
			return
		if money:
			_pay_money(kind)
		else:
			_state.buy(kind))
	lift.add_child(buy)

	# LE SURVOL SOULEVE LA CARTE (a la souris ; au doigt il n'y a pas de
	# survol, et rien ne manque). Le corps et le bouton sont freres : quitter
	# l'un pour l'autre n'est pas quitter la carte, d'ou la relecture differee.
	for part: Control in [body_panel, buy]:
		part.mouse_entered.connect(_hover.bind(card, true))
		part.mouse_exited.connect(func() -> void: _hover.call_deferred(card, false))
	return card


## La hauteur d'une carte, debords compris, a l'echelle `k`.
static func _card_total(k: float) -> float:
	return floorf(CARD_OVER_TOP * k) + floorf(CARD_H * k) + floorf(CARD_OVER_BOTTOM * k)


## L'ART D'UNE SORTE, dans une boite a sa taille : le sprite avec son ombre
## portee, l'emoji des sortes sans sprite, ou l'initiale — et ca se voit :
## ces sortes veulent un dessin.
func _art(kind: String, item_name: String, tint: Color, px: float) -> Control:
	var box := Control.new()
	box.custom_minimum_size = Vector2(px, px)
	box.size = box.custom_minimum_size
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var centre := CenterContainer.new()
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Kit.fill(centre)
	box.add_child(centre)
	if STALL_EMOJI.has(kind):
		centre.add_child(Kit.emoji(STALL_EMOJI[kind], int(px * 0.8)))
	elif ShopState.ART.has(kind):
		var art_shadow := Kit.icon(ShopState.ART[kind], px)
		art_shadow.modulate = Color(0, 0, 0, 0.35)
		var stack := Control.new()
		stack.custom_minimum_size = art_shadow.custom_minimum_size
		stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		art_shadow.position = Vector2(0, 6)
		stack.add_child(art_shadow)
		stack.add_child(Kit.icon(ShopState.ART[kind], px))
		centre.add_child(stack)
	else:
		centre.add_child(Kit.label(item_name.substr(0, 1).to_upper(), int(px * 0.8), tint.lightened(0.45), true))
	return box


## UNE FLAQUE DE LUMIERE : un disque radial, plein au centre, nul au bord.
static func _glow_texture(color: Color, strength: float) -> GradientTexture2D:
	var ramp := Gradient.new()
	ramp.set_color(0, Color(color, strength))
	ramp.set_color(1, Color(color, 0.0))
	ramp.add_point(0.45, Color(color, strength * 0.4))
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	tex.width = 64
	tex.height = 64
	return tex


## LES RAYONS de la carte de tete : douze pointes dorees qui tournent en
## trente secondes, assez lent pour qu'on les sente plus qu'on ne les voie.
static func _rays(color: Color, side: float) -> Control:
	var rays := Control.new()
	rays.size = Vector2(side, side)
	rays.pivot_offset = rays.size * 0.5
	rays.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rays.draw.connect(func() -> void:
		var c := rays.size * 0.5
		var r := side * 0.5
		var n := 12
		for i in n:
			var a := TAU * float(i) / float(n)
			var half := TAU / float(n) * 0.22
			rays.draw_colored_polygon(PackedVector2Array([
				c, c + Vector2.from_angle(a - half) * r, c + Vector2.from_angle(a + half) * r,
			]), Color(color, 0.22)))
	var spin := rays.create_tween().set_loops()
	spin.tween_property(rays, "rotation", TAU, 30.0).from(0.0)
	return rays


## SOULEVER ou reposer une carte au survol.
func _hover(card: Control, on: bool) -> void:
	if not is_instance_valid(card) or not card.has_meta("lift"):
		return
	var lift: Control = card.get_meta("lift")
	if not on and Rect2(Vector2.ZERO, lift.size).has_point(lift.get_local_mouse_position()):
		return
	var tween := lift.create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(lift, "position:y", -6.0 * _k if on else 0.0, 0.16)


## L'ENTREE : les cartes tombent sur l'etagere l'une apres l'autre, en un
## tiers de seconde en tout — assez pour qu'on voie l'etal se remplir, pas
## assez pour qu'on attende pour acheter.
func _enter() -> void:
	var i := 0
	for card in _row.get_children():
		var lift: Control = card.get_meta("lift")
		var alpha := lift.modulate.a
		lift.position.y = -18.0 * _k
		lift.modulate.a = 0.0
		var tween := lift.create_tween().set_parallel()
		tween.tween_property(lift, "position:y", 0.0, 0.32).set_delay(0.045 * i) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.tween_property(lift, "modulate:a", alpha, 0.18).set_delay(0.045 * i)
		i += 1


## UN ACHAT SE FETE sur la carte achetee : l'art saute et une gerbe
## d'eclats dores part de lui. Le recu en mots est deja au pied et en
## pastille ; ceci est ce que le pouce sent.
func _celebrate(kind: String, _qty: int) -> void:
	for card in _row.get_children():
		if card.get_meta("kind", "") != kind:
			continue
		var art: Control = card.get_meta("art")
		var pop := art.create_tween()
		pop.tween_property(art, "scale", Vector2(1.3, 1.3), 0.09).set_ease(Tween.EASE_OUT)
		pop.tween_property(art, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
		var lift: Control = card.get_meta("lift")
		var from := art.position + art.size * 0.5 + Vector2(0, floorf(CARD_OVER_TOP * _k))
		for i in 12:
			var spark := ColorRect.new()
			var s := 4.0 if i % 3 else 6.0
			spark.size = Vector2(s, s) * _k
			spark.color = Palette.GOLD if i % 2 else Palette.CREAM
			spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
			spark.position = from - spark.size * 0.5
			lift.add_child(spark)
			var to := from + Vector2.from_angle(TAU * i / 12.0 + randf() * 0.3) * (40.0 + randf() * 22.0) * _k
			var fly := spark.create_tween().set_parallel()
			fly.tween_property(spark, "position", to - spark.size * 0.5, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			fly.tween_property(spark, "modulate:a", 0.0, 0.45).set_delay(0.12)
			fly.chain().tween_callback(spark.queue_free)
		return


## LA FACE AFFICHEE, celle que I18N pose sur le theme du projet. Un
## `get_theme_font` avant l'entree dans l'arbre rend la face de secours de
## Godot, pas celle-ci : les mesures sortaient fausses hors de l'anglais
## (« USDC » coupe sur son rail, un compte deborde de sa pastille).
static func _face() -> Font:
	var theme := ThemeDB.get_project_theme()
	return theme.default_font if theme != null else ThemeDB.fallback_font


## LA TAILLE QUI TIENT : `size`, ou moins jusqu'a NAME_MIN, pour que le mot
## tienne dans `room` — « Cortina de fumaça » passait sur les feuilles.
static func _fit(text: String, size: int, room: float) -> int:
	var chosen := size
	while chosen > NAME_MIN and _face().get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, chosen).x > room:
		chosen -= 1
	return chosen


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
		icon.position = Vector2(floorf(ink.size.x * 0.5 + w * 0.5 - icon.custom_minimum_size.x), floorf((ink.size.y - px) * 0.5))
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
