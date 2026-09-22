extends Control
## L'ACCUEIL — le meme ecran que le web, repeint pour le Seeker.
##
## Porte de src/app/page.tsx (`.rr-home-art`, `.rr-masthead`, `.rr-empty`),
## src/components/logo-banner.tsx et src/app/globals.css, en gardant ce que ces
## fichiers ont decide :
##
##   • L'ILLUSTRATION EST L'ECRAN. Le lapin couronne devant l'archipel occupe
##     tout le cadre en `cover`, et un voile sombre coule de la gauche pour que
##     la colonne reste lisible par-dessus. Le voile s'eteint a mi-largeur : le
##     tableau doit rester un tableau.
##   • UNE SEULE LIGNE COMMANDE LA MISE EN PAGE : `--rr-doorstep`, a 206px sur
##     le Seeker. Le masthead finit dessus, la colonne commence dessus. Ils se
##     touchent sans que personne n'ait a les accorder.
##   • L'EMBLEME EST EN MULTIPLES ENTIERS de son 96x106, jamais un pourcentage :
##     a une echelle fractionnaire, certains pixels source tombent sur deux
##     pixels d'ecran et le biseau s'epaissit sur une lettre et pas la suivante.
##   • LA PORTE D'ENTREE EST DOREE ET PLUS HAUTE. Les deux boutons etaient la
##     meme planche brune a la meme taille, et rien ne disait lequel presser.
##   • LES CONSEILS, PAS LES SLOGANS. La planche du bas-droit apprend a jouer —
##     un joueur devant l'ecran de connexion n'a pas besoin qu'on lui vende
##     l'ambiance.

## L'artwork et son ruban, mesures sur le fichier (x 17..79, y 93..98 d'un
## 96x106).
const LOGO_W := 96
const LOGO_H := 106

## Le corps du texte du ruban, en pixels SOURCE, multiplie par la meme echelle
## que l'embleme pour rester colle au parchemin a tous les crans.
const RIBBON_CELL := 4

## Trois au maximum, et jamais plus de 34% de la hauteur : au-dela l'embleme
## mange l'illustration au lieu de la titrer.
const MAX_SCALE := 3
const MAX_VH := 0.34

## La ligne qui separe le titre de la demande. `min(67vh, 100vh - 170 - 24)`.
const MENU_RESERVE := 170.0
const DOORSTEP_GAP := 24.0

## Dix secondes par conseil : de quoi lire deux fois une phrase de soixante
## signes sans que l'ecran devienne un diaporama. Le web dit 10 000 ms.
const TIP_SECONDS := 10.0
const TIP_FADE := 0.6

## Le decalage de chaque planche dans la vague, en secondes. Trois rangs, trois
## departs : c'est ce qui en fait une vague.
const WAVE_STEPS := [0.0, 0.14, 0.28]

@onready var _art: TextureRect = $Art
@onready var _veil: TextureRect = $Veil
@onready var _floor: TextureRect = $Floor
@onready var _masthead: Control = %Masthead
@onready var _logo_stack: Control = %LogoStack
@onready var _logo: TextureRect = %Logo
@onready var _ribbon: Label = %Ribbon
@onready var _ask: Control = %Ask
@onready var _connect: PlankButton = %Connect
@onready var _guest: PlankButton = %Guest
@onready var _lang: PlankButton = %Language
@onready var _status: Label = %Status
@onready var _who: Label = %Who
@onready var _tip: NinePatchRect = %Tip
@onready var _tip_text: Label = %TipText

var _phrase := ""
var _scale := 1
var _tip_timer: Timer


func _ready() -> void:
	_paint_veil()
	_paint_floor()
	_apply_language()
	I18N.locale_changed.connect(_on_locale_changed)

	_connect.pressed.connect(_on_connect)
	_guest.pressed.connect(_on_guest)
	_lang.pressed.connect(_on_language_pressed)

	# La cascade de la vague, dans l'ordre de lecture de la colonne.
	_connect.wave_delay = WAVE_STEPS[0]
	_guest.wave_delay = WAVE_STEPS[1]
	_lang.wave_delay = WAVE_STEPS[2]

	_tip_timer = Timer.new()
	_tip_timer.wait_time = TIP_SECONDS
	_tip_timer.timeout.connect(_roll_tip)
	add_child(_tip_timer)
	_tip_timer.start()

	# Tire plutot que pris a l'index 0 : deux lancements de suite ne doivent
	# pas ouvrir sur le meme conseil.
	randomize()
	_roll_tip()

	get_viewport().size_changed.connect(_measure)
	_measure()

	Session.failed.connect(func(message: String) -> void: _say(message, true))
	_refresh_doors()

	# LA SESSION EST VERIFIEE AVANT QUE LES PORTES SOIENT OFFERTES. Les deux
	# sont desactivees pendant ce temps : presser « invite » pendant la reprise
	# donnerait un SECOND terrier par-dessus celui qu'on restaure, et c'est la
	# seule erreur ici qui perd le travail de quelqu'un.
	_busy(true)
	if await Session.restore():
		_enter()
	_busy(false)
	_refresh_doors()


## LE VOILE DE GAUCHE, celui qui rend la colonne lisible.
##
## rgba(8,11,16) de .86 a zero, eteint a mi-largeur : le titre et les boutons
## se detachent, et la moitie droite du tableau — l'ile, le soleil, la tour —
## reste intacte. C'est tout l'equilibre de cet ecran.
##
## Construit ici plutot que dans la scene : un degrade ecrit en .tscn est une
## liste de flottants illisible, et celui-ci a cinq paliers.
func _paint_veil() -> void:
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.14, 0.26, 0.38, 0.5])
	ramp.colors = PackedColorArray([
		Color(0.031, 0.043, 0.063, 0.86),
		Color(0.031, 0.043, 0.063, 0.78),
		Color(0.031, 0.043, 0.063, 0.52),
		Color(0.031, 0.043, 0.063, 0.20),
		Color(0.031, 0.043, 0.063, 0.0),
	])
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill_from = Vector2(0, 0)
	tex.fill_to = Vector2(1, 0)
	_veil.texture = tex


## L'ASSISE BASSE : rgba(13,17,23) de zero a .34 sur le tiers inferieur.
## Elle pose l'image sur le bas du cadre, ou vivent la planche des conseils et
## le pied de la colonne.
func _paint_floor() -> void:
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.18, 0.34])
	ramp.colors = PackedColorArray([
		Color(0.051, 0.067, 0.09, 0.0),
		Color(0.051, 0.067, 0.09, 0.10),
		Color(0.051, 0.067, 0.09, 0.34),
	])
	var tex := GradientTexture2D.new()
	tex.gradient = ramp
	tex.fill_from = Vector2(0, 0)
	tex.fill_to = Vector2(0, 1)
	_floor.texture = tex


## LA MISE EN PAGE, recalculee a chaque changement de taille.
##
## Tout descend de `--rr-doorstep`, la ligne ou le titre s'arrete et ou la
## demande commence. Le web l'ecrit `min(67vh, 100vh - 170 - 24)` ; la meme
## formule ici donne la meme page sur un ecran de n'importe quelle taille.
func _measure() -> void:
	var view := get_viewport_rect().size
	var doorstep := minf(view.y * 0.67, view.y - MENU_RESERVE - DOORSTEP_GAP)
	var column := minf(view.x * 0.38, 420.0)

	_masthead.offset_right = column
	_masthead.offset_bottom = doorstep

	_ask.offset_top = doorstep
	_ask.offset_right = column
	_ask.offset_bottom = view.y

	# L'embleme au plus grand multiple ENTIER qui tienne — borne par la largeur
	# de la colonne ET par la hauteur qu'on lui concede.
	var by_width := int(column / float(LOGO_W))
	var by_height := int((view.y * MAX_VH) / float(LOGO_H))
	_scale = maxi(1, mini(MAX_SCALE, mini(by_width, by_height)))

	var box := Vector2(LOGO_W * _scale, LOGO_H * _scale)
	_logo_stack.custom_minimum_size = box
	_logo_stack.offset_left = -box.x * 0.5
	_logo_stack.offset_right = box.x * 0.5
	# Colle en bas de la boite du masthead, moins les 14px du web.
	_logo_stack.offset_top = -box.y - 14.0
	_logo_stack.offset_bottom = -14.0

	# Le ruban en pourcentages de l'embleme, pour rester colle au parchemin a
	# 1x comme a 3x.
	_ribbon.offset_left = 17.0 / LOGO_W * box.x
	_ribbon.offset_right = 79.0 / LOGO_W * box.x
	_ribbon.offset_top = 93.0 / LOGO_H * box.y
	_ribbon.offset_bottom = 98.0 / LOGO_H * box.y
	_ribbon.add_theme_font_size_override("font_size", RIBBON_CELL * _scale)

	# LA COLONNE EST EMPILEE A LA MAIN, planche par planche.
	#
	# Un VBoxContainer serait le reflexe, et c'est lui qu'il faut eviter ici :
	# il repose ses enfants a chaque disposition, donc il se bat avec la vague
	# qui les fait fremir. Les trois finissaient a la meme hauteur, en une
	# seule bande. Les largeurs viennent du web — min(360, 100%) pour la porte
	# doree, min(300, 100%) pour les deux autres — et chaque planche est
	# centree dans la colonne.
	var y := 0.0
	for entry in [[_connect, 360.0, 64.0], [_guest, 300.0, 44.0], [_lang, 300.0, 44.0]]:
		var node: Control = entry[0]
		var w := minf(entry[1], column)
		var h: float = entry[2]
		node.position = Vector2((column - w) * 0.5, y)
		node.size = Vector2(w, h)
		# 8px entre deux planches ; la porte doree en ajoute 4 sous elle, comme
		# le `margin-bottom` du web.
		y += h + 8.0
		if node == _connect:
			y += 4.0
		# La ligne d'erreur s'insere entre la porte invitee et la langue, et
		# seulement quand elle a quelque chose a dire.
		if node == _guest and _status.visible:
			_status.position = Vector2(0.0, y)
			_status.size = Vector2(column, 19.0)
			y += 19.0 + 8.0

	# La planche des conseils : max(260, min(46vw, 340)), coin bas-droit.
	var tip_w := maxf(260.0, minf(view.x * 0.46, 340.0))
	_tip.offset_left = -tip_w - 10.0


## UN CONSEIL QUI N'EST PAS CELUI AFFICHE, pour qu'un tirage change toujours
## quelque chose. C'est la regle de config/taglines.ts, portee telle quelle.
func _roll_tip() -> void:
	var list := I18N.taglines()
	if list.is_empty():
		return
	var pool := list.filter(func(line): return line != _phrase)
	if pool.is_empty():
		pool = list
	_phrase = pool[randi() % pool.size()]
	_tip_text.text = _phrase

	# Le fondu porte sur LE TEXTE, jamais sur la planche : le web remonte le
	# span seul pour que le bois ne clignote pas a chaque phrase.
	_tip_text.modulate.a = 0.0
	var fade := create_tween()
	fade.tween_property(_tip_text, "modulate:a", 1.0, TIP_FADE).set_ease(Tween.EASE_OUT)


## Tous les mots de l'ecran, reecrits dans la langue affichee.
func _apply_language() -> void:
	_apply_face()
	_connect.relabel(I18N.t("connect"))
	_guest.relabel(I18N.t("guest"))
	_ribbon.text = I18N.t("subtitle").to_upper()
	var here := I18N.LOCALES[I18N.locale_index(I18N.locale)]
	# Le drapeau voyage DANS le texte : c'est lui qui dit ce qu'est ce bouton,
	# et il doit survivre a l'etat ferme.
	_lang.relabel("%s %s" % [here["flag"], here["label"]])
	_status.visible = false


## LA FACE DE LA LANGUE AFFICHEE, posee en override par noeud.
##
## Un `theme` sur un ancetre ne bat pas le theme du PROJET, qui nomme deja la
## face du kit : seul un override a ce niveau passe devant. `null` retire
## l'override et laisse revenir la face pixel, ce que veut l'anglais.
func _apply_face() -> void:
	var face: Font = null if I18N.pixel_face() else _fallback_face()
	for node in [_connect, _guest, _lang, _ribbon, _status, _tip_text]:
		if face == null:
			node.remove_theme_font_override("font")
		else:
			node.add_theme_font_override("font", face)


## LA FACE D'UNE LANGUE QUE LE KIT NE SAIT PAS DESSINER, demandee a la
## PLATEFORME plutot qu'embarquee.
##
## La face de secours de Godot est latine — le chinois sortait en tofu — et
## aucune fonte CJK n'est assez petite pour etre livree avec un ecran. Chaque
## machine en a deja une, donc on nomme les faces du systeme comme le fait la
## pile `--font-fallback` du web : les pixelisees d'abord, pour garder l'allure
## du jeu quand elles existent, puis les grandes faces systeme qui portent
## vraiment les sinogrammes.
##
## UN NOM QUI REPOND N'EST PAS UNE FACE QUI MARCHE. `OS.get_system_font_path`
## rend volontiers le PingFang d'un framework prive de macOS et
## `load_dynamic_font` dit OK dessus, mais la face ne charge jamais et tous les
## labels sortent VIDES — pire que le tofu remplace. On demande donc a la
## candidate si elle sait dessiner l'ecriture de la langue, et seul un oui
## compte.
var _face_cache: Dictionary = {}

func _fallback_face() -> Font:
	if _face_cache.has(I18N.locale):
		return _face_cache[I18N.locale]

	var probe: String = "岛" if I18N.locale == "zh" else "é"
	var code := probe.unicode_at(0)

	var chosen: Font = ThemeDB.fallback_font
	for name in ["Zpix", "Silkscreen", "DotGothic16", "Hiragino Sans GB",
			"Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", "Arial Unicode MS"]:
		var path := OS.get_system_font_path(name)
		if path.is_empty():
			continue
		var file := FontFile.new()
		if file.load_dynamic_font(path) != OK:
			continue
		if not file.has_char(code):
			continue
		chosen = file
		break

	_face_cache[I18N.locale] = chosen
	return chosen


func _on_locale_changed(_code: String) -> void:
	_apply_language()
	# Le conseil est retire DANS la nouvelle liste : la phrase a l'ecran
	# appartient a la langue qui s'affichait.
	_roll_tip()
	_tip_timer.start()


## LE SELECTEUR : il tourne d'une langue a la suivante.
##
## Le web ouvre une fenetre a quatre options. Quatre langues et un bouton qui
## les fait defiler disent la meme chose en un geste, et cet ecran n'a pas
## encore de fenetre a lui — celle-ci viendra avec les autres dialogues.
func _on_language_pressed() -> void:
	var next := (I18N.locale_index(I18N.locale) + 1) % I18N.LOCALES.size()
	I18N.set_locale(I18N.LOCALES[next]["code"])


## LA PORTE D'ENTREE : le wallet signe le defi du serveur et la session revient.
## Sur un Seeker, cette signature est un geste du Seed Vault.
func _on_connect() -> void:
	_connect.wiggle()

	if not Wallet.available():
		_say(I18N.t("no_wallet"), true)
		return

	_busy(true)
	_working(_connect, true)

	var address := await Wallet.address()
	if address.is_empty():
		# Une feuille fermee est un refus, pas une panne : on ne signale que ce
		# que le plugin a vraiment rate.
		_say(Wallet.last_error, not Wallet.last_error.is_empty())
		_working(_connect, false)
		_busy(false)
		return

	# Un invite deja en train de jouer LIE son wallet au lieu de se reconnecter,
	# pour que le terrier qu'il a creuse survive. Se reconnecter lui donnerait
	# un autre compte et abandonnerait celui-la en silence.
	var linking := Session.signed_in() and bool(Session.player.get("guest", false))
	var signer := func(message: String) -> String: return await Wallet.sign(message)
	var ok := false
	if linking:
		ok = await Session.link_wallet(address, signer)
	else:
		ok = await Session.sign_in_with_wallet(address, signer)

	_working(_connect, false)
	_busy(false)
	if ok:
		_enter()


## LA SECONDE PORTE : un terrier sans wallet, pour qui n'en a jamais tenu.
func _on_guest() -> void:
	_busy(true)
	_working(_guest, true)
	var ok := await Session.play_as_guest()
	_working(_guest, false)
	_busy(false)
	if ok:
		_enter()


## « ON CREUSE… » S'ECRIT DANS LA PORTE PRESSEE, pas sous elle.
##
## C'etait une ligne de statut, et elle CASSAIT LA MISE EN PAGE : la faire
## apparaitre pousse le selecteur de langue de 27px vers le bas, le temps d'un
## appel reseau, puis le fait remonter. Une colonne qui saute pendant qu'on
## attend est le pire moment pour bouger.
##
## Le web le fait deja ainsi — `{busy ? t.auth.connecting : t.auth.guest}` vit
## DANS le bouton invite. Le libelle est rendu a la fin, quoi qu'il arrive :
## une porte qui reste bloquee sur « on creuse » apres un refus ne se represse
## plus jamais.
func _working(door: PlankButton, busy: bool) -> void:
	if busy:
		door.relabel(I18N.t("connecting"))
		return
	# Rendu depuis le dictionnaire plutot que memorise : entre-temps la langue
	# a pu changer, et restaurer l'ancienne chaine la ferait reapparaitre.
	if door == _connect:
		door.relabel(I18N.t("connect"))
	elif door == _guest:
		door.relabel(I18N.t("guest"))


## Connecte. Le nom du lapin monte EN HAUT A DROITE, pas dans la colonne.
##
## Il s'affichait sur la ligne de statut, coincee entre la porte invitee et le
## selecteur de langue — c'est-a-dire au milieu du menu, a la place reservee
## aux ERREURS. Un nom de lapin y avait l'air d'un probleme, et il ecartait les
## deux planches a chaque connexion.
##
## Le coin haut-droit est libre sur cet ecran (le web y met sa barre, vide tant
## que personne ne joue) et c'est le coin le plus eloigne de la colonne : le
## nom se lit sans rien deranger.
func _enter() -> void:
	_say("", false)
	_who.text = String(Session.player.get("name", ""))
	_who.visible = not _who.text.is_empty()


## Un bouton qui ne peut pas marcher est grise, pas cache : sur un bureau
## l'accueil doit montrer ce que le telephone offre, et une planche grisee dit
## « pas ici » la ou une planche absente dit « ca n'existe pas ».
func _refresh_doors() -> void:
	_connect.disabled = not Wallet.available()


## La ligne sous les deux portes. Elle n'apparait QUE s'il y a quelque chose a
## dire : un label vide garderait sa place dans la colonne et ecarterait le
## selecteur de langue en permanence.
func _say(text: String, bad: bool) -> void:
	var was := _status.visible
	_status.visible = not text.is_empty()
	_status.text = text
	_status.add_theme_color_override("font_color",
		Color("#ff6b6b") if bad else Color("#8b949e"))
	# Apparaitre ou disparaitre change la hauteur de la colonne : le selecteur
	# de langue doit descendre pour lui faire place, et remonter apres.
	if was != _status.visible:
		_measure()


func _busy(value: bool) -> void:
	# On repasse par _refresh_doors plutot que par un `false` sec : hors
	# Android la porte du wallet doit RESTER grisee, et la relacher rendrait un
	# bouton sans rien derriere.
	_guest.disabled = value
	_lang.disabled = value
	if value:
		_connect.disabled = true
	else:
		_refresh_doors()
