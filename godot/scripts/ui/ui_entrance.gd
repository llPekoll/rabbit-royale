class_name UiEntrance
## L'ENTREE DE L'UI AU TERRIER — un seul geste pour tout ce qui arrive : la
## barre du haut, la colonne, la barre du sol.
##
## Chaque piece glisse d'un peu en dehors de sa place, legerement ecrasee et
## transparente, et SE POSE, avec un depassement de 2 px a peine.
## Le ressort du web (+5 px, 1.04 x 0.96) se lisait comme un sursaut sur le
## Seeker (2026-09-23 : « un overshoot hyper violent »).
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

## L'ecart entre deux pieces : trois images a 60 images par seconde. Une seule
## (2026-09-23) arrivait comme un bloc — « rajoute du delay entre chacun ».
const STEP := 3.0 / 60.0

## La course d'une piece.
const SECONDS := 0.38
## Le fondu finit avant la course : la piece est lisible pendant qu'elle se pose.
const FADE_SHARE := 0.6
## L'ecrasement de depart, autour du centre de la piece.
const SQUASH := Vector2(0.96, 1.02)

## LES TROIS BORDS PARTENT ENSEMBLE (2026-09-23) : le haut, la colonne et le
## sol commencent au meme instant, et c'est DANS chaque bord que les pieces se
## suivent, a un pas d'ecart. Les faire se suivre d'un bord a l'autre
## etirait l'entree a 1,3 s.
const TOP_FIRST := 0
const COLUMN_FIRST := 0
const FLOOR_FIRST := 0

## Depuis ou chaque groupe arrive : du bord qu'il touche.
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
	var delay := rank * STEP
	node.pivot_offset = node.size * 0.5
	node.modulate.a = 0.0
	node.position = rest + from
	node.scale = SQUASH
	var tween := node.create_tween().set_parallel(true)
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(node, "modulate:a", 1.0, SECONDS * FADE_SHARE).set_delay(delay)
	# UN TRES LEGER DEPASSEMENT, sur la course seule : TRANS_BACK depasse
	# d'environ 10 % du trajet, soit 2 px sur 16 a 24. Le ressort du web (+5 px
	# et 1.04 x 0.96 d'ecrasement) etait le « hyper violent ».
	tween.tween_property(node, "position", rest, SECONDS).set_delay(delay).set_trans(Tween.TRANS_BACK)
	tween.tween_property(node, "scale", Vector2.ONE, SECONDS).set_delay(delay)
	node.set_meta(&"ui_entrance", tween)
	if settle.is_valid():
		tween.finished.connect(settle)
	elif node.get_parent() is Container:
		tween.finished.connect((node.get_parent() as Container).queue_sort)
