class_name DevShot
## UNE CAPTURE DEPUIS LA LIGNE DE COMMANDE, pour verifier un ecran sans
## ouvrir l'editeur :
##
##   godot --path godot -- --shot=C:/tmp/doorstep.png --after=3
##   godot --path godot scenes/ui_bench.tscn -- --shot=C:/tmp/bench.png
##
## Attend `after` secondes, ecrit le PNG, quitte. Rien ne tourne sans
## l'argument : c'est un outil de developpement, pas un comportement. Chaque
## scene racine qui veut s'y preter appelle `DevShot.arm(self)` dans son
## `_ready`.


static func arm(node: Node) -> void:
	var path := ""
	var after := 3.0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			path = arg.trim_prefix("--shot=")
		elif arg.begins_with("--after="):
			after = float(arg.trim_prefix("--after="))
	if path.is_empty():
		return
	await node.get_tree().create_timer(after).timeout
	await RenderingServer.frame_post_draw
	var image := node.get_viewport().get_texture().get_image()
	image.save_png(path)
	print("[shot] ", path)
	node.get_tree().quit()
