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


## Suivre la fenetre, maintenant et a chaque redimensionnement.
static func follow(win: Window) -> void:
	apply(win)
	win.size_changed.connect(apply.bind(win))


static func apply(win: Window) -> void:
	if OS.has_feature("mobile"):
		return
	var scale := DisplayServer.screen_get_scale(win.current_screen)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--ui-scale="):
			scale = float(arg.trim_prefix("--ui-scale="))
	scale = maxf(scale, 1.0)
	var logical := Vector2(win.size) / scale
	var base := Vector2i(int(maxf(logical.x, 890.0)), int(maxf(logical.y, 400.0)))
	if win.content_scale_size != base:
		win.content_scale_size = base
