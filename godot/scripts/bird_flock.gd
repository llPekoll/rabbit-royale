extends Node2D
class_name BirdFlock
## DES OISEAUX QUI REMONTENT LE CIEL, loin au-dessus de l'ile.
##
## Porte de `BirdFlock` (src/game/fx/Birds.ts). Le pendant aerien de `Ducks` :
## ils se deplacent en pixels, jamais sur le damier, et sont poses tels que
## dessines — la feuille est de profil strict, une rotation la reduirait a un
## trait.
##
## TOUS DU MEME COTE : une seule diagonale, vers le fond-gauche. `(-2, -1)`
## longe une arete que le joueur voit deja au sol ; un vol qui part tout entier
## du meme cote est un vol qui VA quelque part.
##
## LE VOL N'EST PAS UNE LIGNE DROITE : chaque oiseau garde une LIGNE DE VOL qui
## avance seule, et l'ondulation n'est qu'un decalage pose par-dessus. Ajoutee
## a la position reelle, elle se cumulerait et l'oiseau deriverait pour de bon.
##
## POSE DANS LE REPERE DE L'ILE, comme MoteField : `area` est le rectangle
## d'ecran ramene dans ce repere, `unit` la taille d'un pixel d'ecran dedans.
## SkyLight les tient a jour a chaque image — le vol reste epingle au CADRE,
## comme le `counterCamera` du web : un recul de camera ne le pose pas a
## hauteur de jardin.

const SHEET := preload("res://assets/fx/bird.png")

## La diagonale iso que suit le vol : vers le fond-gauche.
const DIR := Vector2(-2.0, -1.0)

## Vitesse de croisiere, en px d'ecran par seconde. Bien plus vite que les
## nuages : un nuage est de la meteo, un oiseau VOLE. Une dizaine de secondes
## pour traverser le cadre.
const SPEED_RANGE := Vector2(45.0, 70.0)

## Amplitude (px d'ecran) et frequence (Hz) de l'ondulation.
const SWAY := 6.0
const SWAY_HZ := Vector2(0.18, 0.34)

## LES TAILLES, tirees dans ce sac — des petits au loin, quelques gros tout
## pres. Des multiples ronds plutot qu'un tirage continu : le sprite est du
## pixel art, et a 2,37 ses pixels sortent inegaux. Le doublon de 2 fait du
## moyen le cas courant ; les gros restent l'exception.
const SIZES := [1.5, 2.0, 2.0, 3.0, 4.0, 5.0]

## La taille de reference : a elle, l'oiseau vole a SPEED_RANGE. Un plus gros
## est un oiseau plus PRES, qui file donc plus vite a l'ecran (parallaxe) —
## sans ca, un gros lent se lit comme un petit agrandi.
const SIZE_REF := 2.0

## LES FRAMES DU TAG `fly` (public/assets/fx/bird.json) : region dans la
## feuille, et coin de la frame rognee dans la case source de 32x29. Le cycle
## n'est pas regulier — un plane de 1000 ms coupe d'un battement de 3 x 100 ms.
## Une cadence unique ferait mouliner l'oiseau.
const SOURCE := Vector2(32.0, 29.0)
const FRAMES := [
	{"region": Rect2(1, 1, 17, 9), "offset": Vector2(7, 13), "ms": 1000},
	{"region": Rect2(19, 1, 7, 14), "offset": Vector2(13, 8), "ms": 100},
	{"region": Rect2(1, 16, 14, 7), "offset": Vector2(9, 16), "ms": 100},
	{"region": Rect2(16, 16, 7, 12), "offset": Vector2(14, 17), "ms": 100},
]

var area := Rect2(0, 0, 890, 400)
var unit := 1.0
## Combien en vol. Un ciel habite, pas une voliere.
var count := 3

var _rng := RandomNumberGenerator.new()
var _cycle_ms := 0
## Par oiseau, en px d'ECRAN depuis le coin de `area` : la ligne de vol, la
## vitesse, et de quoi l'onduler et le faire battre.
var _base: PackedVector2Array
var _vel: PackedVector2Array
var _size: PackedFloat32Array
var _phase: PackedFloat32Array
var _amp: PackedFloat32Array
var _hz: PackedFloat32Array
var _clock: PackedFloat32Array
## Une horloge partagee : les phases sont decalees a la naissance, un temps
## commun garde les ondulations stables les unes par rapport aux autres.
var _elapsed := 0.0


func _ready() -> void:
	# Pixel art : l'interpoler ferait baver ses bords francs.
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_rng.randomize()
	for f in FRAMES:
		_cycle_ms += int(f["ms"])
	var screen := _screen()
	for i in count:
		var size: float = SIZES[_rng.randi() % SIZES.size()]
		var near := size / SIZE_REF
		var cruise := _rng.randf_range(SPEED_RANGE.x, SPEED_RANGE.y) * near
		_vel.append(DIR.normalized() * cruise)
		# Sur toute la hauteur : groupes en haut, ils se liraient comme une
		# frise posee sur le bord du cadre.
		_base.append(Vector2(_rng.randf() * screen.x, 30.0 + _rng.randf() * maxf(1.0, screen.y - 90.0)))
		# Chacun sa taille, pour ne pas lire le meme sprite copie n fois.
		_size.append(size)
		_phase.append(_rng.randf() * TAU)
		_amp.append(SWAY * near * _rng.randf_range(0.6, 1.4))
		_hz.append(_rng.randf_range(SWAY_HZ.x, SWAY_HZ.y))
		# Le decalage de battement : sans lui ils battent tous ensemble.
		_clock.append(_rng.randf() * _cycle_ms)


## L'ecran en px d'ecran — `area` est dans le repere de l'ile.
func _screen() -> Vector2:
	return area.size / maxf(0.0001, unit)


func _process(delta: float) -> void:
	_elapsed += delta
	var screen := _screen()
	for i in _base.size():
		var b := _base[i] + _vel[i] * delta
		var span := SOURCE * _size[i]
		# Ils montent tous : celui qui sort par le haut revient par le BAS, a
		# une abscisse neuve — sinon le vol se lit comme une boucle. Le
		# rebouclage porte sur la LIGNE, pas sur le sprite.
		if b.y < -span.y:
			b = Vector2(_rng.randf() * screen.x, screen.y + span.y)
		# En diagonale un oiseau sort aussi par un cote.
		if b.x < -span.x:
			b.x = screen.x + span.x
		elif b.x > screen.x + span.x:
			b.x = -span.x
		_base[i] = b
		_clock[i] = fmod(_clock[i] + delta * 1000.0, float(_cycle_ms))
	queue_redraw()


func _frame_at(ms: float) -> Dictionary:
	var acc := 0.0
	for f in FRAMES:
		acc += float(f["ms"])
		if ms < acc:
			return f
	return FRAMES[0]


func _draw() -> void:
	for i in _base.size():
		# La normale a la course porte l'ondulation.
		var n := Vector2(-_vel[i].y, _vel[i].x).normalized()
		var sway := sin(_elapsed * _hz[i] * TAU + _phase[i]) * _amp[i]
		var at := _base[i] + n * sway
		var f := _frame_at(_clock[i])
		var region: Rect2 = f["region"]
		var k := _size[i] * unit
		# Ancre au centre de la case source, comme `anchor 0.5` du web : la
		# frame rognee se pose a son decalage dans cette case.
		var corner := area.position + at * unit + ((f["offset"] as Vector2) - SOURCE * 0.5) * k
		draw_texture_rect_region(SHEET, Rect2(corner, region.size * k), region)
