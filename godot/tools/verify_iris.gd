extends SceneTree
## L'IRIS FINIT-IL DE S'OUVRIR ? — la nappe, comptee en pixels.
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_iris.gd
##
## ATTENDU : `nappe restante 0.00%` sur CHAQUE aspect. La colonne « avant »
## montre l'ancienne constante `OPEN = 2.2` et ce qu'elle laissait — 31.6 % de
## l'ecran encore couvert sur l'ecran par defaut, qu'un `visible = false`
## escamotait d'un coup a la fin du geste. C'est le bug qu'on ne veut pas voir
## revenir : « ca disparait avant de recouvrir l'ecran totalement ».
##
## POURQUOI REFAIRE LE SHADER EN GDSCRIPT. Ce qu'on verifie est une GEOMETRIE,
## pas un rendu — quelle part de l'ecran tombe dans le plein de la silhouette.
## La refaire ici la rend mesurable en `--headless`, la ou une capture d'ecran
## demanderait un GPU et ne dirait de toute facon pas POURQUOI.

const MASK := preload("res://assets/fx/bunny-mask.webp")


func _init() -> void:
	var img := MASK.get_image()
	var iris := IrisWipe.new()
	var bad := 0
	for sa in [2.225, 16.0 / 9.0, 2.0, 2.4, 1.0, 9.0 / 16.0]:
		var ap: float = iris._open_for(sa)
		var covered := _sheet_left(img, sa, ap)
		var before := _sheet_left(img, sa, 2.2)  # l'ancienne constante
		print("aspect %.3f : _open=%.2f -> nappe restante %.2f%% (avant, a 2.2 : %.1f%%)"
			% [sa, ap, covered, before])
		if covered > 0.01:
			bad += 1
	iris.free()
	print("--- %d aspect(s) ou l'iris ne finit pas de s'ouvrir ---" % bad)
	quit(1 if bad > 0 else 0)


func _sheet_left(img: Image, screen_aspect: float, aperture: float) -> float:
	var shape_aspect := MASK.get_width() / float(MASK.get_height())
	var n := 220
	var left := 0
	for i in n:
		for j in n:
			var u := i / float(n - 1)
			var v := j / float(n - 1)
			var dx := (u - 0.5) * screen_aspect / shape_aspect
			var dy := v - 0.5
			var mu := dx / aperture + 0.5
			var mv := dy / aperture + 0.5
			var hole := 0.0
			if mu >= 0.0 and mu <= 1.0 and mv >= 0.0 and mv <= 1.0:
				var x := mini(img.get_width() - 1, int(mu * img.get_width()))
				var y := mini(img.get_height() - 1, int(mv * img.get_height()))
				hole = img.get_pixel(x, y).a
			if hole < 0.5:
				left += 1
	return 100.0 * left / float(n * n)
