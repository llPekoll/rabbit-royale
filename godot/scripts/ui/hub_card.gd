class_name HubCard
extends Control
## LA CARTE DU TERRIER — la coque dont les trois cartes de la colonne sont
## decoupees (hub-card.tsx, leaf-banner.tsx).
##
## Le web a construit la carte d'energie seule, sur la maquette, puis a vu
## que le jardin partageait tout : meme planche, meme art a gauche, meme
## bloc de texte au meme retrait. « Two cards agreeing to the pixel is a
## shell, not a coincidence » — donc une coque nommee une fois, et les
## cartes n'y mettent que leurs lignes.
##
## LA PLANCHE EST LA BANNIERE DE VIGNE (leaf-banner.tsx) : un 3-slice, pas un
## 9-slice, mesure et non suppose — les vignes courent sur presque toute la
## hauteur, aucune bande horizontale n'est libre de feuillage, tandis que les
## colonnes 32..354 sont propres. L'art garde donc sa hauteur peinte etiree a
## la carte, et seuls les bouts sont preserves. Le bout fait 64 pixels source
## a cause des NOEUDS DE CORDE (x 0..57 et 329..386) : plus etroit, un noeud
## tombait dans le milieu etire et se transformait en trainee.
##
## LA HAUTEUR VIENT DE L'ECRAN, PAS D'UN RATIO. La correction qui compte :
## les cartes portaient `aspect-ratio: 3.6`, pris sur les 342x95 de la
## maquette — un nombre qui n'est pas une propriete de la carte mais ce que
## 342x95 vaut a 1376x768. Ce que la maquette tient constant, c'est la PART
## D'ECRAN : 12,4 % de la hauteur pour l'energie, 14,5 pour une carte a
## bouton, 23 pour le terrier. Avec un plancher en pixels pour les fenetres
## tres courtes, ou le texte cesse de tenir.
##
## LES ENCRES SONT CELLES DU PARCHEMIN. La palette sombre (blanc, creme) est
## devenue invisible le jour ou la banniere a mis un fond creme sous les
## cartes ; les trois roles sont restes, restitues sur ce fond.

## Les encres de hub-card.tsx, echantillonnees sur la maquette de Paul —
## l'en-tete est la note la plus sombre, la valeur juste dessous, le petit
## texte un lavis du meme brun.
const LABEL := Color("#3a2617")
const VALUE := Color("#4a3524")
const SUB := Color(74.0 / 255.0, 53.0 / 255.0, 36.0 / 255.0, 0.66)

## La banniere : 387x139, bouts de 64 (BANNER_CAP), rails de 13 (BANNER_RAIL).
const BANNER_W := 387.0
const BANNER_H := 139.0
const BANNER_CAP := 64
const BANNER_RAIL := 13.0
## Ou le parchemin commence sous le rail du haut, et ou il finit sur celui du
## bas (lignes source).
const BANNER_TOP := 14
const BANNER_BOTTOM := 12
## LES BANDES QUI S'ALLONGENT (NineSlice.band_left/right) : le seul poteau nu
## de chaque bout, mesure sur l'art — a gauche sous les vignes, a droite
## entre les anneaux et les vignes. Tout le reste du contour garde l'echelle
## des bouts : meme rail, memes feuilles, sur une carte de 70 ou de 250 px.
const BANNER_BAND_L := Vector2i(90, 95)
const BANNER_BAND_R := Vector2i(29, 34)

## LA HAUTEUR D'ECRAN QUI MESURE LES CARTES s'arrete a celle du bureau de
## reference (1376x768, comme Dialog.FULL_MAX) : au-dela, un ecran plus haut
## ne fait pas une carte plus haute. Sur un Retina de 15 pouces (1052 de
## haut) le terrier prenait 23 % de l'ecran pour trois lignes et un bouton —
## un grand vide dans un cadre etire (Paul, 2026-09-23).
const VIEW_MAX_H := 768.0
## Le bout que les cartes s'offrent : une part de la hauteur sous un plafond.
## 0,46 (la proportion de l'art) mangeait 142 px d'une carte de 308 ; 0,22
## faisait un cadre maigre au milieu etire. Le plafond de 34 est ce que la
## carte la plus haute supporte avant que son texte casse (39 casse, 49 mal).
const CAP_RATIO := 0.32
const CAP_MAX := 34.0

## Sous 520 px de haut, les cartes cedent 7 % (`--rr-card-scale: 0.93`), leur
## air passe a PAD_TIGHT (`--rr-card-pad`) et le petit texte se cache : sur le
## Seeker, la colonne a 228 px visibles pour quatre cartes qui en veulent 244.
const SHORT_VIEW := 520.0
const SHORT_SCALE := 0.93
## En dessous de cette hauteur de carte, le petit texte n'a pas sa place
## (`@container (height < 70px) .rr-hub-sub { display: none }`).
const SUB_MIN_CARD := 70.0
## Le cadre de 2 px de chaque cote que le web retranche du « content box »
## avant d'y mesurer ses `cqh`.
const FRAME := 2.0

## La carte a bouton, mesure commune des cartes (voir `layout`), et la case
## de l'art en part de son contenu.
const REF_SHARE := 14.5
const REF_FLOOR := 66.0
const ART_SLOT := 0.8

## La part de l'ecran (en % de la hauteur) et le plancher en pixels.
var share := 14.5
var floor_px := 66.0
## L'art a gauche, sa hauteur en % du contenu de la carte, et s'il est epingle
## en haut (le jardin, le terrier) ou centre (l'energie, la quete sans bouton).
var art: Texture2D = null
var art_share := 39.0
var art_top := true

## Ce que la carte remplit : les lignes du texte, puis le pied (le bouton).
var body: VBoxContainer
var footer: Control

var _banner: NineSlice
var _inset: MarginContainer
var _band: HBoxContainer
var _art: TextureRect
var _column: VBoxContainer
var _height := 0.0
var _pad := Kit.PAD


func _init() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_STOP

	_banner = NineSlice.make(Kit.BANNER, Vector4i(BANNER_CAP, BANNER_TOP, BANNER_CAP, BANNER_BOTTOM), Vector4(CAP_MAX, 0, CAP_MAX, 0), true)
	_banner.band_left = BANNER_BAND_L
	_banner.band_right = BANNER_BAND_R
	Kit.fill(_banner)
	add_child(_banner)

	_inset = Kit.margin(0, 0, 0, 0)
	Kit.fill(_inset)
	add_child(_inset)
	# LA CARTE EPOUSE CE QU'ELLE PORTE. Sa part d'ecran mesure son texte, son
	# art et ses dalles ; sa HAUTEUR est celle de son contenu. Plancher, la
	# part laissait un grand vide sous le terrier d'un bureau (Paul,
	# 2026-09-23) ; plafond, elle faisait passer la dalle sur le cadre.
	_inset.minimum_size_changed.connect(_hold_content)

	# La bande : l'art puis une COLONNE qui tient le texte ; le bouton EN
	# DESSOUS, sur toute la largeur de la carte. Il commencait au niveau du
	# texte comme sur la maquette, mais la largeur que l'art lui prenait
	# variait d'une carte a l'autre (trois boutons, trois largeurs) et le
	# francais n'y tenait plus : « CREUSER PLUS 1 051 » fait 95 px en taille
	# 8 pour 71 de bande (2026-09-23).
	var stack := Kit.vbox(Kit.PAD_TIGHT)
	stack.alignment = BoxContainer.ALIGNMENT_CENTER
	_inset.add_child(stack)
	_band = Kit.hbox(Kit.PAD)
	_band.alignment = BoxContainer.ALIGNMENT_BEGIN
	_band.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stack.add_child(_band)

	_art = TextureRect.new()
	_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_band.add_child(_art)

	_column = Kit.vbox(Kit.PAD_TIGHT)
	_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_column.alignment = BoxContainer.ALIGNMENT_CENTER
	_band.add_child(_column)

	body = Kit.vbox(Kit.PAD_TIGHT)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_column.add_child(body)

	footer = Control.new()
	footer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.visible = false
	stack.add_child(footer)


## L'ECRAN CHANGE, LA CARTE SE REECRIT. Sa hauteur, ses tailles de texte et
## son art sont des parts de l'ecran, lues une fois par `layout` : sans ceci
## elles gardaient l'ecran du premier dessin — une fenetre de bureau qu'on
## agrandit, le banc passe de 890x400 a la taille du bureau, et les cartes
## restaient a leur mesure de telephone (un grand vide, un art minuscule).
## Dans la coque et pas dans chaque carte : les trois se mesurent pareil.
func _enter_tree() -> void:
	get_viewport().size_changed.connect(refresh)


func _exit_tree() -> void:
	get_viewport().size_changed.disconnect(refresh)


## RELIRE et se reecrire. Chaque carte dit comment ; la coque ne sait que
## quand.
func refresh() -> void:
	pass


## REMESURER la carte sur l'ecran : sa hauteur, ses bouts, son air, son art.
## A appeler avant de la remplir — les tailles de texte en dependent.
## LE COIN HAUT DROIT, ou se pose le [x] quand la carte s'ouvre en dialogue
## (chrome.gd, la maison) : a Kit.CLOSE_AIR du bois, au-dessus et a droite.
## Au-dessus, le bois est le rail (la marge du haut moins l'air de la carte) ;
## a droite, a hauteur du [x], le poteau est plus epais que le rail de
## POST_OVER_RAIL (mesure sur une capture, 2026-09-24).
const POST_OVER_RAIL := 5.0

func content_corner() -> Vector2:
	var rail := float(_inset.get_theme_constant("margin_top")) - _pad
	return Vector2(size.x - rail - POST_OVER_RAIL - Kit.CLOSE_AIR, rail + Kit.CLOSE_AIR)


func layout() -> void:
	var view := _view()
	var short := view.y < SHORT_VIEW
	var scale := SHORT_SCALE if short else 1.0
	_pad = Kit.PAD_TIGHT if short else Kit.PAD
	_height = maxf(view.y * share / 100.0 * scale, floor_px)
	_hold_content.call_deferred()

	# LES BOUTS SONT CEUX DE LA CARTE A BOUTON, pour les trois cartes. Ils
	# suivaient la hauteur de chaque carte : le terrier, deux fois plus haut,
	# avait des bouts deux fois plus larges, son texte commencait 25 px plus a
	# droite que celui du jardin et « BURROW LVL 1 » y perdait son chiffre
	# (2026-09-23). Un meme retrait, une meme colonne de texte.
	var ref := _reference_height()
	var cap := minf(ref * CAP_RATIO, CAP_MAX)
	_banner.edge = Vector4(cap, 0, cap, 0)

	# Le bloc de texte s'ecarte du rail : son epaisseur (a l'echelle des bouts,
	# comme le reste du contour), puis l'air de la carte.
	var block := BANNER_RAIL * cap / BANNER_CAP + _pad
	_inset.add_theme_constant_override("margin_left", int(cap + _pad))
	_inset.add_theme_constant_override("margin_right", int(cap + _pad))
	_inset.add_theme_constant_override("margin_top", int(block))
	_inset.add_theme_constant_override("margin_bottom", int(block))
	_band.add_theme_constant_override("separation", int(_pad))

	_art.texture = art
	_art.visible = art != null
	if art != null:
		# L'ART DANS UNE CASE DE MEME LARGEUR sur chaque carte : le parchemin,
		# le potager et la maison n'ont pas la meme forme, et leur largeur
		# decidait ou le texte commencait. L'art tient dans la case (sa
		# hauteur, sa part ; sa largeur, celle de la case) et s'y centre.
		var slot := art_slot()
		var h := card_length(art_share)
		var aspect := float(art.get_width()) / maxf(1.0, float(art.get_height()))
		h = minf(h, slot / aspect)
		_art.custom_minimum_size = Vector2(slot, h)
		_art.size_flags_vertical = Control.SIZE_SHRINK_BEGIN if art_top else Control.SIZE_SHRINK_CENTER


## L'ecran tel que les cartes le mesurent : sa hauteur bornee a VIEW_MAX_H.
func _view() -> Vector2:
	var view := get_viewport_rect().size if is_inside_tree() else Vector2(890, 400)
	return Vector2(view.x, minf(view.y, VIEW_MAX_H))


func _hold_content() -> void:
	var need := ceilf(_inset.get_combined_minimum_size().y)
	if absf(custom_minimum_size.y - need) > 0.5:
		custom_minimum_size = Vector2(0, need)
	# LE CONTENU RETOMBE AVEC ELLE. Ancre sur toute la carte, il grandit
	# jusqu'a son minimum quand celui-ci gonfle (une ligne mesuree sur 1 px),
	# mais ne rapetisse pas tant que la carte ne change pas de taille : il
	# restait a 472 dans une carte de 114, son texte centre sous les cartes
	# suivantes (Paul, 2026-09-23).
	if _inset.size.y > size.y + 0.5:
		(func() -> void: _inset.size = size).call_deferred()


## La hauteur d'une carte a bouton (le jardin) sur cet ecran : la mesure
## commune des bouts et de la case de l'art.
func _reference_height() -> float:
	var view := _view()
	var scale := SHORT_SCALE if view.y < SHORT_VIEW else 1.0
	return maxf(view.y * REF_SHARE / 100.0 * scale, REF_FLOOR)


## LA CASE DE L'ART, la meme sur toutes les cartes : une part du contenu de
## la carte a bouton.
func art_slot() -> float:
	return roundf((_reference_height() - 2.0 * _pad - 2.0 * FRAME) * ART_SLOT)


## LA DALLE COMMUNE : hauteur et taille de mot de la carte a bouton, pour
## que CLAIM, HARVEST et UPGRADE soient trois boutons pareils — le terrier,
## plus haut, en avait un plus haut au mot plus gros.
func slab_height() -> float:
	return maxf((_reference_height() - 2.0 * _pad - 2.0 * FRAME) * 0.38, HubSlab.MIN_H)


func slab_text() -> int:
	return int(round(clampf((_reference_height() - 2.0 * _pad - 2.0 * FRAME) * 0.15, 9.0, 15.0)))


## Le « content box » du web : la carte moins son air et ses 2 px de cadre.
func content_height() -> float:
	return maxf(1.0, _height - 2.0 * _pad - 2.0 * FRAME)


## UN POUR-CENT DE CARTE TEL QUE LA PART L'AURAIT FAIT (`--rr-card-u`). La ou
## le plancher souleve la carte au-dela de sa part, le `cqh` grandirait avec
## elle et le texte et l'art gonfleraient dans la largeur qu'ils partagent
## avec l'en-tete (« BURROW - LVL 1 » passait sous une hutte plus grosse).
## La hauteur en trop va a l'AIR et aux boutons, pas au texte.
func unit_height() -> float:
	var view := _view()
	var scale := SHORT_SCALE if view.y < SHORT_VIEW else 1.0
	var by_share := view.y * share / 100.0 * scale - 2.0 * _pad - 2.0 * FRAME
	return maxf(1.0, minf(content_height(), by_share))


## `cardSize(n, min, max)` : n % du contenu, borne.
##
## MESURE SUR LA CARTE A BOUTON, comme les dalles (`slab_text`) : sur la part
## de chaque carte, le terrier (23 %) ecrivait plus gros que la quete (12,4)
## et son texte sortait de la carte sur un 1024x600 (2026-09-23). Un seul
## corps de texte pour la colonne.
func card_size(n: float, low: float, high: float) -> int:
	var unit := _reference_height() - 2.0 * _pad - 2.0 * FRAME
	return int(round(clampf(unit * n / 100.0, low, high)))


## `cardLength("62cqh")` : la meme part, sans borne (pour l'art).
func card_length(n: float) -> float:
	return unit_height() * n / 100.0


## Le petit texte a-t-il sa place ? Non sur un ecran court ni dans une carte
## courte : c'est un taux (« 72/hour »), du contexte, et l'en-tete, la valeur
## et le bouton sont ce pour quoi on lit et tape la carte.
func sub_visible() -> bool:
	return _pad >= Kit.PAD and _height >= SUB_MIN_CARD


## VIDER le corps et le pied, avant de les re-remplir dans une autre langue.
func clear() -> void:
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	for child in footer.get_children():
		footer.remove_child(child)
		child.queue_free()
	footer.visible = false


## POSER LE PIED : un bouton sur toute la largeur de la colonne de texte.
func set_footer(node: Control) -> void:
	footer.add_child(node)
	Kit.fill(node)
	footer.custom_minimum_size = Vector2(0, node.custom_minimum_size.y)
	footer.visible = true


## UNE LIGNE D'EN-TETE : le nom a gauche, sa valeur vivante a droite.
## `value` peut etre vide (le terrier n'a rien a cote de son nom).
func add_row(heading: String, value: Control = null) -> HBoxContainer:
	var row := Kit.hbox(Kit.PAD)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var h := Kit.label(I18N.shout(heading), card_size(14, 9, 14), LABEL)
	h.uppercase = I18N.pixel_face()
	h.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.clip_text = true
	# RETRECIT PLUTOT QUE DE COUPER : sur un ecran moins allonge que le
	# Seeker (le bureau, une tablette), l'image du terrier grandit avec la
	# carte et « BURROW LVL 1 » sortait « BURROW L ». Plancher a 9px.
	var wanted := card_size(14, 9, 14)
	h.resized.connect(func() -> void: _fit(h, wanted))
	row.add_child(h)
	if value != null:
		row.add_child(value)
	body.add_child(row)
	return row


func _fit(label: Label, wanted: int) -> void:
	var room := label.size.x
	if room <= 0.0:
		return
	var font := label.get_theme_font("font")
	var chosen := wanted
	while chosen > 9 and font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, chosen).x > room:
		chosen -= 1
	if label.get_theme_font_size("font_size") != chosen:
		label.add_theme_font_size_override("font_size", chosen)


## UNE VALEUR : un chiffre dans la face pixel, une marque de carotte a cote
## s'il compte des carottes.
func value(text: String, carrot: bool = false, color: Color = VALUE) -> HBoxContainer:
	var box := Kit.hbox(Kit.PAD_TIGHT)
	box.alignment = BoxContainer.ALIGNMENT_END
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(Kit.label(text, card_size(14, 9, 14), color))
	if carrot:
		box.add_child(carrot_mark())
	return box


## LA CAROTTE COMME UNITE (carrot-mark.tsx) : le sprite du jeu, en couleur, a
## toute taille — une carotte tantot orange tantot non serait deux unites.
func carrot_mark() -> TextureRect:
	return Kit.icon(Kit.ICONS["carrot"], float(card_size(12, 7, 12)))


## LE PETIT TEXTE sous l'en-tete : ce que le chiffre VEUT DIRE. Il ne se pose
## pas quand la carte est trop courte pour lui.
func add_sub(text: String, color: Color = SUB) -> Label:
	if not sub_visible():
		return null
	var l := Kit.label(text, card_size(10.5, 8, 11), color)
	wraps(l, body.size.x)
	body.add_child(l)
	return l


## UNE LIGNE QUI SE REPLIE, dans une carte qui epouse son contenu. Posee
## avant d'avoir sa largeur (chaque relecture du terrier vide et refait la
## carte), elle se mesure sur 1 px : 382 de haut, une lettre par ligne. Godot
## garde ce minimum une fois la largeur venue, et la carte restait geante
## (Paul, 2026-09-23, en ouvrant le codex). Elle nait donc a la largeur
## qu'elle aura (`width`, celle de la colonne de texte, qui survit aux
## relectures), et redemande son minimum a chaque taille (Kit.wrap).
static func wraps(label: Label, width: float = 0.0) -> void:
	Kit.wrapped(label)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if width > 1.0:
		label.size = Vector2(width, label.size.y)
