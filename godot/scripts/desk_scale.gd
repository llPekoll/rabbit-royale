class_name DeskScale
## LE BUREAU A L'ECHELLE 1, comme le web (Paul, 2026-09-23).
##
## Le canevas de 890x400 est la taille du Seeker couche ; `canvas_items` +
## `expand` l'agrandit a la fenetre. Sur un telephone c'est le but. Sur un
## bureau, le chrome sortait 1,55 fois plus gros que le web a 1376x768, et
## les cartes restaient aussi courtes qu'au Seeker (sans leurs lignes fines).
##
## Ici la base SUIT la fenetre, divisee par l'echelle de l'ecran (2 sur un
## Retina) : un pixel de design vaut un pixel CSS, comme dans le navigateur.
## Jamais sous 890x400 : une petite fenetre retombe sur le cadrage du
## telephone plutot que d'ecraser le chrome. Le cout de rendu ne bouge pas —
## `canvas_items` rasterise deja a la resolution de l'ecran (project.godot).
##
## `-- --ui-scale=1` force l'echelle de l'ecran : une capture a 1376x768 est
## alors le 1376x768 CSS du web, quel que soit l'ecran de la machine.
##
## HORS DE main.gd parce que les bancs en ont besoin aussi : un banc qui
## s'ouvre a la taille du bureau sans cette mesure etirait le canevas du
## telephone, et montrait une colonne que le jeu ne montre jamais.


## TOUJOURS EN PAYSAGE (Paul, 2026-09-24), ET TOUJOURS EN 16:9 (2026-10-01 :
## « on ne peut pas laisser l'utilisateur faire n'importe quoi »). Une
## fenetre libre garde le rapport 16:9 quoi qu'on tire : le cote que le
## joueur a tire decide, l'autre suit. Elle ne descend pas sous 890 de large
## (le Seeker couche) et ne depasse pas l'ecran : le plus grand 16:9 qui
## tienne dans sa zone utile. Une fenetre maximisee ou plein ecran n'est
## jamais touchee.
const ASPECT := 16.0 / 9.0
const MIN_SIZE := Vector2(890.0, 400.0)
const MIN_WIDTH := 890.0
## Le plus grand canevas de design : au-dela, tout s'agrandit.
const MAX_BASE := Vector2(1280.0, 720.0)

## LA FENETRE DE DEPART SUR UN BUREAU : ni plein ecran ni maximisee (Paul,
## 2026-10-01), une fenetre 16:9 qui prend la MOITIE DE L'ECRAN en surface —
## 71 % de chaque cote — centree dans la zone utile (sans la barre des
## taches). Le joueur la redimensionne ou la maximise s'il veut plus.
const START_AREA := 0.5

## La derniere taille posee, pour savoir quel cote le joueur vient de tirer.
static var _last := Vector2i.ZERO


static func open_window(win: Window) -> void:
	if OS.has_feature("mobile") or OS.has_feature("web") or win.mode != Window.MODE_WINDOWED:
		return
	var screen := DisplayServer.screen_get_usable_rect(win.current_screen)
	var size := _fit(Vector2(screen.size) * sqrt(START_AREA))
	size = size.clamp(_min_size(win), _max_size(win))
	win.size = Vector2i(size.round())
	win.position = screen.position + (screen.size - win.size) / 2
	_last = win.size


## Le plus grand 16:9 dans `box`.
static func _fit(box: Vector2) -> Vector2:
	if box.x / box.y > ASPECT:
		return Vector2(box.y * ASPECT, box.y)
	return Vector2(box.x, box.x / ASPECT)


static func _min_size(win: Window) -> Vector2:
	var px := maxf(DisplayServer.screen_get_scale(win.current_screen), 1.0)
	return Vector2(MIN_WIDTH, MIN_WIDTH / ASPECT) * px


## Le cadre du systeme (barre de titre, bords) compte : sans lui la fenetre
## la plus grande debordait l'ecran de sa barre de titre.
static func _max_size(win: Window) -> Vector2:
	var frame := Vector2(win.get_size_with_decorations() - win.size).max(Vector2.ZERO)
	return _fit(Vector2(DisplayServer.screen_get_usable_rect(win.current_screen).size) - frame)


## Suivre la fenetre, maintenant et a chaque redimensionnement.
static func follow(win: Window) -> void:
	apply(win)
	win.size_changed.connect(apply.bind(win))


static func apply(win: Window) -> void:
	if OS.has_feature("mobile"):
		return
	_keep_landscape(win)
	var scale := DisplayServer.screen_get_scale(win.current_screen)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--ui-scale="):
			scale = float(arg.trim_prefix("--ui-scale="))
	scale = maxf(scale, 1.0)
	var logical := Vector2(win.size) / scale
	# AU-DELA DE MAX_BASE, LE JEU GRANDIT AU LIEU DE S'ETALER (2026-10-01) :
	# la plupart des pieces du chrome ont une taille fixe, et une grande
	# fenetre les laissait minuscules au milieu de vastes vides. Le canevas
	# plafonne, et `canvas_items` agrandit le tout a la fenetre — rapport
	# garde. Windows declare aussi une echelle de 1 meme a 150 %.
	logical *= minf(1.0, minf(MAX_BASE.x / logical.x, MAX_BASE.y / logical.y))
	var base := Vector2i(int(maxf(logical.x, 890.0)), int(maxf(logical.y, 400.0)))
	if win.content_scale_size != base:
		win.content_scale_size = base


## Le plancher, le plafond, et le 16:9 d'une fenetre libre.
##
## Le plancher et le plafond sont des bornes du SYSTEME (`min_size`,
## `max_size`) : il les tient lui-meme pendant le glisser, sans a-coup. Le
## 16:9, lui, se pose UNE FOIS LE GESTE FINI : recale a chaque evenement, il
## repoussait la souris en temps reel et la fenetre tremblait (2026-10-01).
## Tant que le joueur tire, le canevas `expand` suit n'importe quelle forme.
static func _keep_landscape(win: Window) -> void:
	# PAS SUR LE WEB : la « fenetre » y est le canevas, que le navigateur
	# dimensionne. Lui imposer un 16:9 retrecissait le rendu dans un coin bas
	# gauche, le reste en noir (2026-10-01).
	if OS.has_feature("web"):
		return
	# `-- --size=890x400` (DevShot) veut la forme exacte d'un appareil, le
	# Seeker couche n'est pas en 16:9 : outil, pas joueur.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--size="):
			win.min_size = Vector2i(MIN_SIZE)
			return
	var lo := Vector2i(_min_size(win).ceil())
	var hi := Vector2i(_max_size(win).floor())
	if win.min_size != lo:
		win.min_size = lo
	if win.max_size != hi:
		win.max_size = hi
	if win.mode != Window.MODE_WINDOWED:
		_last = Vector2i.ZERO
		return
	_settle_gen += 1
	var gen := _settle_gen
	win.get_tree().create_timer(SETTLE_SECONDS, true, false, true).timeout.connect(func() -> void:
		if gen == _settle_gen:
			_snap(win, lo, hi))


## Le calme apres le geste : sans nouvel evenement pendant ce temps, le
## joueur a lache le bord.
const SETTLE_SECONDS := 0.25
static var _settle_gen := 0


static func _snap(win: Window, lo: Vector2i, hi: Vector2i) -> void:
	if not is_instance_valid(win) or win.mode != Window.MODE_WINDOWED:
		return
	var now := win.size
	# Le cote tire decide ; au premier passage (sortie de maximise), la largeur.
	var by_width := _last == Vector2i.ZERO or absi(now.x - _last.x) >= absi(now.y - _last.y)
	var want := Vector2(now.x, now.x / ASPECT) if by_width else Vector2(now.y * ASPECT, now.y)
	# Borne d'un cote, l'autre se recale sur le rapport.
	want = _fit(want.clamp(Vector2(lo), Vector2(hi)))
	var target := Vector2i(want.round())
	_last = target
	# Un pixel d'arrondi ne vaut pas un redimensionnement.
	if absi(target.x - now.x) <= 1 and absi(target.y - now.y) <= 1:
		return
	win.size = target
