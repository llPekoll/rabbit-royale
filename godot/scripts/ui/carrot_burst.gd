class_name CarrotBurst
extends Control
## DES CAROTTES QUI MONTENT DANS LE COMPTEUR quand on les engrange. Porte de
## src/components/carrot-burst.tsx :
##
##   « A number that simply changes from 138 to 150 is a fact ; carrots
##     ARRIVING is an event, and banking a harvest is the one moment on this
##     screen worth celebrating. »
##
## Chaque carotte a son propre couloir, son propre depart et sa propre
## rotation : une douzaine de sprites en rang se lisent comme UNE forme.
## Elles partent d'un eventail sous le chiffre et passent DERRIERE lui (ce
## noeud est pose sous la pile), pour que le nombre reste lisible pendant
## qu'elles passent — une convergence sur le centre les empilait sur les
## chiffres qu'elles existent pour designer.
##
## Le sprite est LA carotte du jeu, pas un emoji : la recompense a l'ecran
## est le meme objet que la recompense dans le sol. L'icone de Kit est cuite
## au double de sa source (32x30 pour un 16x15) ; dessinee a un demi elle
## retombe sur son pixel, et reste plus petite que le chiffre qu'elle
## accompagne — le web dit la meme chose de son 13x29 a 1x.

## Au-dela, ca se lit comme du bruit, pas comme du butin.
const MAX_CARROTS := 12
const SPRITE_SCALE := 0.5
## L'eventail ne depasse jamais 90 px : la barre du haut est peuplee, et un
## eventail plus large atterrit sur les voisins.
const SPREAD := 90.0


## UNE RAFALE pour `amount` carottes engrangees : plus pour un plus gros
## butin, mais en racine — 5 et 500 doivent differer, 500 et 5000 non.
func fire(amount: int) -> void:
	if amount <= 0:
		return
	var count := clampi(int(round(sqrt(float(amount)))), 3, MAX_CARROTS)
	var tex: Texture2D = Kit.ICONS["carrot"]
	var sprite_size := Vector2(tex.get_width(), tex.get_height()) * SPRITE_SCALE
	for i in count:
		var s := TextureRect.new()
		s.texture = tex
		s.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		s.stretch_mode = TextureRect.STRETCH_SCALE
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		s.size = sprite_size
		s.pivot_offset = sprite_size * 0.5
		add_child(s)

		# Un couloir par carotte, tenu tout du long, avec un peu de jeu.
		var t := float(i) / float(maxi(1, count - 1)) - 0.5
		var lane := t * SPREAD + randf_range(-6.0, 6.0)
		var start := Vector2(lane * 0.6, 30.0) - sprite_size * 0.5
		var mid := Vector2(lane, -14.0) - sprite_size * 0.5
		var end := Vector2(lane, -34.0) - sprite_size * 0.5
		s.position = start
		s.modulate.a = 0.0
		s.scale = Vector2(0.7, 0.7)
		s.rotation = deg_to_rad(randf_range(-30.0, 30.0))

		# Departs echelonnes de 50 ms : une poignee, pas un mur.
		var tw := create_tween()
		tw.tween_interval(i * 0.05)
		tw.set_parallel(true)
		tw.tween_property(s, "position", mid, 0.46).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
		tw.tween_property(s, "modulate:a", 1.0, 0.46)
		tw.tween_property(s, "scale", Vector2.ONE, 0.46).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
		tw.tween_property(s, "rotation", deg_to_rad(randf_range(-18.0, 18.0)), 0.46)
		tw.set_parallel(false)
		# Elles continuent et s'effacent en haut, sans s'arreter net.
		tw.set_parallel(true)
		tw.tween_property(s, "position", end, 0.26).set_ease(Tween.EASE_IN)
		tw.tween_property(s, "modulate:a", 0.0, 0.26).set_ease(Tween.EASE_IN)
		tw.set_parallel(false)
		tw.tween_callback(s.queue_free)


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
