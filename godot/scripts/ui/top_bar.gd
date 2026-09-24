class_name TopBar
extends Control
## LA BARRE DU HAUT : le joueur a gauche, la pastille au centre, le rail a
## droite. Porte de `.rr-topbar` (globals.css) et px-top-floor.css, avec ce
## qu'ils ont decide :
##
##   • TROIS ZONES, `space-between` : la puce du joueur au bord gauche, la
##     pastille au milieu, la saison et le son a droite. C'etait `flex-end`
##     — tout en tas a droite — et la pastille, centree hors du flux,
##     heurtait sans cesse la puce. Chaque zone a son bout de barre et aucune
##     ne peut marcher dans une autre.
##   • EPINGLEE, PAS DICTEE PAR SON CONTENU : l'ile reserve exactement cette
##     bande (Kit.TOPBAR_H) pour que son HUD commence dessous, et une bande
##     dont la hauteur depend d'un gain en vol est une bande que l'autre
##     etage ne peut pas reserver.
##   • LES COTES SONT LA GOUTTIERE DE L'ECRAN (Kit.EDGE), comme chaque piece
##     du chrome ; a 18 la puce se tenait a 28 du bord la ou tout le reste se
##     tient a 10.
##   • LA PASTILLE EST CENTREE SUR L'ECRAN, COLLEE AU HAUT (« monte un peu le
##     component pour que ca touche le haut de la page ») : la planche est
##     une ENSEIGNE suspendue, ses feuilles et le rebord du cadran sont le
##     bord de sa silhouette, et 10 px au-dessus se lisaient comme
##     l'enseigne ayant glisse de son crochet. Sous 420 px de haut elle passe
##     a trois quarts, depuis son centre haut (« the top center carrot panel
##     is huge ») ; le Seeker a 400 le veut deja.
##   • LE RAIL : la boutique et l'histoire, puis le trophee de saison avec
##     son rang (« #59 » en puce discrete, pas un « 59 » rouge qui se lisait
##     comme cinquante-neuf nouveautes), puis le son qui possede le coin.
##     Boutique et histoire n'ont de sens que sur le terrier.
##   • L'ARRIVEE : tout tombe du haut et se pose (UiEntrance), un pas
##     d'ecart entre deux pieces, a chaque retour au terrier.
##
## Elle se cache seule hors du monde, et se monte plein cadre dans l'etage
## `TopBar` du chrome : `Chrome.current.top_bar.add_child(bar)`.

## Ce que la barre demande au chrome d'ouvrir.
signal energy_tapped
signal add_pressed
signal profile_pressed
signal shop_pressed
signal story_pressed
signal season_pressed

## Sous cette hauteur la pastille passe a 0,75.
const PILL_SHRINK_UNDER := 420.0
const PILL_SMALL := 0.75
## Un telephone etroit en paysage : le rail prend son plancher (34).
const NARROW_W := 720.0
## Les delais de la cascade d'arrivee.

var pill: CarrotPill
var chip: PlayerChip
var shop_button: HubIconButton
var story_button: HubIconButton
var season_button: HubIconButton
var sound: SoundCluster

## Le banc la force visible sans monde derriere.
var preview := false

var _rail: HBoxContainer


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	chip = PlayerChip.new()
	chip.pressed.connect(func() -> void: profile_pressed.emit())
	add_child(chip)

	_rail = Kit.hbox(Kit.PAD_TIGHT)
	_rail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rail.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_rail.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	add_child(_rail)

	shop_button = HubIconButton.make("Shop", Kit.ICONS["shop"])
	shop_button.pressed.connect(func() -> void: shop_pressed.emit())
	_rail.add_child(shop_button)

	story_button = HubIconButton.make("Story", Kit.SCROLL)
	story_button.pressed.connect(func() -> void: story_pressed.emit())
	_rail.add_child(story_button)

	season_button = HubIconButton.make("Show the season board", Kit.CUP)
	season_button.pressed.connect(func() -> void: season_pressed.emit())
	_rail.add_child(season_button)

	sound = SoundCluster.new()
	_rail.add_child(sound)

	pill = CarrotPill.new()
	pill.energy_tapped.connect(func() -> void: energy_tapped.emit())
	pill.add_pressed.connect(func() -> void: add_pressed.emit())
	add_child(pill)

	_relabel()
	I18N.locale_changed.connect(func(_c: String) -> void: _relabel())
	Screens.world_shown.connect(_on_world_shown)
	Screens.moved.connect(_on_moved)
	Session.changed.connect(chip.refresh)
	Home.changed.connect(chip.refresh)
	Home.changed.connect(_reflect_news)
	ShopState.shared().changed.connect(_reflect_news)
	get_viewport().size_changed.connect(_measure)
	_rail.resized.connect(_measure)
	_measure()
	_reflect_news()
	_reflect_place()
	visible = Screens.in_world() or preview
	if visible:
		_arrive()


func _relabel() -> void:
	shop_button.tooltip_text = I18N.t("shop.title")
	story_button.tooltip_text = I18N.t("codex.title")
	season_button.tooltip_text = I18N.t("board.show")


## LA MISE EN PAGE, a chaque changement de taille.
func _measure() -> void:
	var view := get_viewport_rect().size
	var square := Kit.ICON_MIN if view.x < NARROW_W else Kit.icon_square(view.y)
	for b in [shop_button, story_button, season_button]:
		(b as HubIconButton).set_square(square, view.y)
	sound.set_square(square, view.y)
	_rail.offset_right = -Kit.EDGE
	# A la gouttiere de l'ecran, comme la puce du joueur : les pastilles
	# posees a cheval sur les boutons gardent ainsi 5 px d'air au-dessus.
	_rail.offset_top = Kit.EDGE
	_rail.offset_bottom = Kit.EDGE + square

	# La pastille : centree sur l'ecran, collee au haut, mise a l'echelle
	# depuis son centre haut pour rester accrochee au meme point.
	var s := PILL_SMALL if view.y < PILL_SHRINK_UNDER else 1.0
	# ET JAMAIS SOUS LE RAIL : ses boutons grandissent avec la hauteur de
	# l'ecran, la pastille non — sur un ecran haut, le bout du bois passait
	# sous la boutique (2026-09-23). Elle cede juste ce qu'il faut pour
	# garder un ecart, toujours centree.
	var rail_left := view.x - Kit.EDGE - _rail.get_combined_minimum_size().x
	var half_room := rail_left - Kit.PAD - view.x * 0.5
	if half_room > 0.0:
		s = minf(s, half_room / (EnergyDial.ART.x * 0.5))
	pill.pivot_offset = Vector2(EnergyDial.ART.x * 0.5, 0.0)
	pill.scale = Vector2(s, s)
	pill.position = Vector2(round((view.x - EnergyDial.ART.x) * 0.5), 0.0)

	# La puce : au bord, centree dans la bande, et jusqu'a la pastille au
	# plus — la moitie de la barre moins la moitie de la pastille moins un
	# ecart, exactement la place.
	chip.position = Vector2(Kit.EDGE, round((Kit.TOPBAR_H - PlayerChip.HEIGHT) * 0.5))
	chip.set_max_width(view.x * 0.5 - EnergyDial.ART.x * 0.5 * s - Kit.PAD - Kit.EDGE)


func _on_world_shown(shown: bool) -> void:
	visible = shown or preview
	if shown:
		_reflect_place()
		_arrive()
		_fetch_rank()


func _on_moved(_place: int) -> void:
	_reflect_place()
	sound.set_open(false)
	if Screens.place == Screens.Place.BURROW:
		# Pose de depart tout de suite, animation a la reouverture (voir
		# BurrowColumn) : montee sous le noir, la barre se voyait en place.
		_arrive_pose()
		Screens.on_reveal(_arrive)


## Boutique, histoire et profil n'existent que sur le terrier : sur l'ile, la
## puce du joueur couvrait le coin sans rien a y faire en pleine manche.
func _reflect_place() -> void:
	var home := Screens.place == Screens.Place.BURROW
	chip.visible = home or preview
	# LA BOUTIQUE EST UN ETAL SUR SON ILOT (2026-09-24, burrow_landmarks.gd).
	shop_button.visible = false
	story_button.visible = home
	pill.refresh()


## CE QUE LES ICONES ANNONCENT (page.tsx) : sur la boutique, les pieges en
## poche — un nombre qui se tient, en puce discrete ; sur l'histoire, « NEW »
## en rouge tant qu'un chapitre vient de s'ouvrir, c'est-a-dire dans les 500
## carottes qui suivent son seuil (la regle du codex).
const FRESH_CHAPTER := 500.0


func _reflect_news() -> void:
	var traps: Dictionary = ShopState.shared().shop.get("traps", {}) if ShopState.shared().shop.get("traps") is Dictionary else {}
	var held := int(traps.get("held", 0))
	shop_button.set_badge(str(held) if held > 0 else "")
	var lifetime := float(Home.burrow.get("lifetime", 0))
	var open := Content.unlocked_count(lifetime)
	var fresh := open > 0 and lifetime - float(Content.LORE[open - 1]["unlockAt"]) < FRESH_CHAPTER
	story_button.set_badge("NEW" if fresh else "", true)


## L'ARRIVEE EN CASCADE (UiEntrance), de gauche a droite, un pas d'ecart.
func _arrive() -> void:
	var rank := UiEntrance.TOP_FIRST
	UiEntrance.play(chip, UiEntrance.FROM_TOP, rank)
	pill.drop_in(rank + 1)
	rank += 2
	for node in [shop_button, story_button, season_button, sound]:
		UiEntrance.play(node, UiEntrance.FROM_TOP, rank)
		if (node as Control).visible:
			rank += 1


## La premiere image de l'arrivee : tout eteint.
func _arrive_pose() -> void:
	UiEntrance.pose([chip, shop_button, story_button, season_button, sound])
	pill.drop_pose()


## LE RANG, tel que le tableau le donne : « #59 » en puce discrete sur le
## trophee, et la pastille garde l'ecart. `rank` <= 0 : non classe.
func set_rank(rank: int, to_pass: int = -1) -> void:
	season_button.set_badge("#%d" % rank if rank > 0 else "")
	pill.set_rank(rank, to_pass)


## Le tableau ouvert se lit comme presse sur le trophee.
func set_season_open(open: bool) -> void:
	season_button.set_pressed_look(open)
	season_button.tooltip_text = I18N.t("board.hide") if open else I18N.t("board.show")


## LA COURSE, pour le HUD de l'ile : le butin porte et les coffres.
func set_run(carrying: int, chests: Dictionary = {}) -> void:
	pill.set_run(carrying, chests)


## L'energie de la manche sur le cadran, ou -1 pour le reservoir du terrier.
func set_run_energy(energy: int) -> void:
	pill.set_run_energy(energy)


## Un refus faute de carottes : la pastille secoue.
func deny() -> void:
	pill.deny()


## Le rang du joueur, lu une fois a l'entree (le tableau de saison le
## rafraichira quand il s'ouvre).
func _fetch_rank() -> void:
	if preview or not Session.signed_in():
		return
	var answer: Answer = await Net.get_json("/api/leaderboard?limit=1", Session.token)
	if not answer.ok:
		return
	var me: Variant = answer.body.get("me", null)
	if me is Dictionary:
		var rank: Variant = (me as Dictionary).get("rank", null)
		var gap: Variant = (me as Dictionary).get("toPass", null)
		set_rank(int(rank) if (rank is int or rank is float) else 0,
			int(gap) if (gap is int or gap is float) else -1)
