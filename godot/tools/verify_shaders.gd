extends SceneTree
## LES SHADERS COMPILENT-ILS ?
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_shaders.gd
##
## ATTENDU : chaque shader annonce un nombre d'uniformes NON NUL.
##
## POURQUOI CET OUTIL EXISTE. Un shader qui ne compile pas ne previent pas : le
## `ColorRect` qui le porte affiche simplement sa couleur brute — du BLANC par
## defaut. J'ai passe une heure a regler l'echelle du bruit, la couverture et la
## taille de la texture d'un shader MORT, en interpretant un rectangle blanc
## comme un probleme de reglage.
##
## La cause etait un commentaire : j'avais ecrit `##` (la syntaxe de GDScript)
## dans un `.gdshader`, dont le tokenizer refuse le `#`. Une minute a corriger,
## une heure a trouver.
##
## `get_shader_uniform_list()` rend une liste VIDE quand la compilation a
## echoue : c'est le test, et il tient en headless.
func _init() -> void:
	var paths := [
		"res://shaders/cloud_shadows.gdshader",
		"res://shaders/god_rays.gdshader",
		"res://shaders/sea_gradient.gdshader",
		"res://shaders/sky_composite.gdshader",
		"res://shaders/iris_wipe.gdshader",
		"res://shaders/drain.gdshader",
	]
	var bad := 0
	for path in paths:
		var sh := load(path) as Shader
		if sh == null:
			print("%s : NE CHARGE PAS" % path.get_file())
			bad += 1
			continue
		var n := sh.get_shader_uniform_list().size()
		if n == 0:
			print("%s : NE COMPILE PAS (0 uniforme)" % path.get_file())
			bad += 1
		else:
			print("%s : ok, %d uniformes" % [path.get_file(), n])
	print("--- %d shader(s) casse(s) ---" % bad)
	quit()
