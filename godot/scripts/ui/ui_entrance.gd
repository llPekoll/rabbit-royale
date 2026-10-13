class_name UiEntrance
## L'ENTREE DE L'UI AU TERRIER — un seul geste pour tout ce qui arrive : la
## barre du haut, la colonne, la barre du sol.
##
## Chaque piece arrive de hors de l'ecran et SE POSE, avec un depassement de
## 3 px a peine (le geste du KIT 04, plus bas). Le ressort du web (+5 px,
## 1.04 x 0.96) se lisait comme un sursaut sur le Seeker (2026-09-23 : « un
## overshoot hyper violent »).
##
## UN PAS D'ECART (STEP) entre deux pieces d'un meme bord, dans l'ordre de
## lecture : la barre du haut de gauche a droite, la colonne de haut en bas, le
## sol de gauche a droite. Les trois bords partent ensemble (`*_FIRST`).
##
## DEUX TEMPS, et c'est ce qui evite le « on les voit, ca se cache, puis ca
## anime » : `pose` au montage (sous le noir du rideau), qui ne fait
## qu'eteindre ; `play` a la reouverture (`Screens.on_reveal`), qui pose le
## decalage et joue. Le decalage attend `play` parce que poser `position` sur
## une piece avant la mise en page fige sa taille sur celle du moment — les
## cartes entraient trop grandes, les unes sur les autres.

## LE GESTE DU KIT 04 (2026-10-13, « fais arriver chacun des elements en les
## animant de la meme facon, avec un petit delai sur chacun ») : chaque piece
## part de HORS DE L'ECRAN, du bord qu'elle touche, file a sa place en
## ralentissant (quart), la depasse de 3 px et s'y repose — l'entree des
## planches du haut (burrow_hud.gd `play_entrance`), pour tout le monde.
## Plus d'ecrasement ni de fondu : une piece qui vient de dehors n'a pas
## besoin d'apparaitre, elle arrive.
##
## L'ecart entre deux pieces : le « petit delai ».
const STEP := 0.07

## La course, puis le retour du depassement.
const SECONDS := 0.44
const SETTLE := 0.16
const OVERSHOOT := 3.0
## Ce qui reste d'air entre la piece et le bord, au depart.
const OFFSCREEN := 12.0

## LES TROIS BORDS PARTENT ENSEMBLE (2026-09-23) : le haut, la colonne et le
## sol commencent au meme instant, et c'est DANS chaque bord que les pieces se
## suivent, a un pas d'ecart. Les faire se suivre d'un bord a l'autre
## etirait l'entree a 1,3 s.
const TOP_FIRST := 0
const COLUMN_FIRST := 0
const FLOOR_FIRST := 0

## Depuis ou chaque groupe arrive : du bord qu'il touche (seule la direction
## compte, la course va jusqu'au dehors).
const FROM_TOP := Vector2(0.0, -16.0)
const FROM_LEFT := Vector2(-24.0, 0.0)
const FROM_BOTTOM := Vector2(0.0, 20.0)


## La premiere image, au montage : eteint, rien d'autre.
static func pose(nodes: Array) -> void:
	for node in nodes:
		if node is CanvasItem and (node as CanvasItem).visible:
			(node as CanvasItem).modulate.a = 0.0


## JOUE L'ENTREE de `node`, au rang `rank` de la file. `settle` remet la piece
## a plat a la fin (ce que sa mise en page attend d'elle) ; par defaut, un
## conteneur parent refait son tri — une piece qu'il range n'a pas a garder la
## position que la course lui a laissee.
static func play(node: Control, from: Vector2, rank: int, settle: Callable = Callable()) -> void:
	if not node.visible:
		node.modulate.a = 1.0
		return
	# RELANCEE EN PLEIN VOL (la barre du haut arrive au `world_shown` ET au
	# `moved`), la piece n'est pas a sa place : on reprend celle d'avant le
	# premier geste, et on coupe ce dernier.
	var rest := node.position
	var running: Variant = node.get_meta(&"ui_entrance") if node.has_meta(&"ui_entrance") else null
	if running is Tween and (running as Tween).is_valid():
		(running as Tween).kill()
		rest = node.get_meta(&"ui_entrance_rest", rest)
	node.set_meta(&"ui_entrance_rest", rest)
	node.position = rest
	node.scale = Vector2.ONE
	var dir := from.normalized()
	node.position = rest + dir * travel(node, dir)
	node.modulate.a = 1.0
	var tween := node.create_tween()
	tween.tween_interval(rank * STEP)
	tween.tween_property(node, "position", rest - dir * OVERSHOOT, SECONDS) \
		.set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	tween.tween_property(node, "position", rest, SETTLE) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	node.set_meta(&"ui_entrance", tween)
	if settle.is_valid():
		tween.finished.connect(settle)
	elif node.get_parent() is Container:
		tween.finished.connect((node.get_parent() as Container).queue_sort)


## CE QU'IL FAUT A `node`, depuis sa place, pour sortir de l'ecran par `dir`
## — en pixels de son parent (la pastille est a 0,75).
static func travel(node: Control, dir: Vector2) -> float:
	var r := _drawn(node)
	var view := node.get_viewport_rect().size
	var out := 0.0
	if dir.y < 0.0:
		out = r.end.y
	elif dir.y > 0.0:
		out = view.y - r.position.y
	elif dir.x < 0.0:
		out = r.end.x
	else:
		out = view.x - r.position.x
	var k := node.get_global_transform_with_canvas().get_scale().y
	return maxf(0.0, out + OFFSCREEN) / maxf(0.001, k)


## Ce que la piece DESSINE, enfants compris : le cadran de DIG deborde de sa
## planche par le haut, et partait de l'ecran en laissant sa tete au bord.
static func _drawn(node: Control) -> Rect2:
	var r := node.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, node.size)
	for child in node.get_children():
		if child is Control and (child as Control).visible:
			r = r.merge(_drawn(child as Control))
	return r
