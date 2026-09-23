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


## TOUJOURS EN PAYSAGE (Paul, 2026-09-24) : le jeu est fait pour un ecran
## couche, pas pour tout ecran. Une fenetre de bureau ne descend pas sous
## 890x400 (le Seeker couche), et une fenetre libre ne devient pas plus
## etroite que 3:2 — tiree plus haute, elle perd la hauteur en trop. 3:2
## laisse passer le plein ecran d'un MacBook (1728x1117, 1,55) ; une fenetre
## maximisee ou plein ecran n'est jamais touchee.
const MIN_ASPECT := 1.5
const MIN_SIZE := Vector2(890.0, 400.0)


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
	var base := Vector2i(int(maxf(logical.x, 890.0)), int(maxf(logical.y, 400.0)))
	if win.content_scale_size != base:
		win.content_scale_size = base


## Le plancher de la fenetre, et le rapport 3:2 d'une fenetre libre. Differe :
## on ne redimensionne pas une fenetre dans son propre `size_changed`.
static func _keep_landscape(win: Window) -> void:
	var px := DisplayServer.screen_get_scale(win.current_screen)
	var floor_px := Vector2i((MIN_SIZE * maxf(px, 1.0)).ceil())
	if win.min_size != floor_px:
		win.min_size = floor_px
	if win.mode != Window.MODE_WINDOWED:
		return
	var tallest := int(floorf(win.size.x / MIN_ASPECT))
	if win.size.y > tallest:
		(func() -> void:
			if win.mode == Window.MODE_WINDOWED and win.size.y > tallest:
				win.size = Vector2i(win.size.x, maxi(tallest, floor_px.y))).call_deferred()
