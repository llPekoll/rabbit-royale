extends Node2D
class_name MoteField
## LES POUSSIERES DANS L'AIR, EN PARTICULES — essai du 2026-09-24.
##
## Elles vivaient dans god_rays.gdshader, multipliees par le faisceau : pour
## une poignee de grains, un voile ADDITIF remplissait tout l'ecran a chaque
## image. Ici ce sont `count` petits carres dessines un par un — le cout suit
## le nombre de grains, pas la surface de l'ecran.
##
## Les trois regles du shader sont gardees, chacune pour sa raison :
##   • une DUREE DE VIE (l'opacite descend, un sinus autour) — des grains permanents
##     se lisent comme une texture qui glisse ;
##   • une MONTEE LENTE avec un balancement, pas en rang comme des bulles ;
##   • PEU de grains.
##
## Ce qui change : ils ne sont plus limites au coeur d'un rai, puisqu'il n'y a
## plus de rai dans l'air. Ils flottent partout, clairsemes.
##
## POSE DANS LE REPERE DE L'ILE, comme les voiles de SkyLight : `area` est le
## rectangle d'ecran ramene dans ce repere, `unit` la taille d'un pixel d'ecran
## dedans. SkyLight les tient a jour a chaque image.

var area := Rect2(0, 0, 890, 400)
var unit := 1.0

## Copie modifiable : le tuner (sea_tuner.gd) y ecrit ses curseurs.
var look: Dictionary = SkyLook.AIR_MOTES.duplicate()
var _tint: Color = SkyLook.SKY["ray_tint"]
var _rng := RandomNumberGenerator.new()
# Par grain : position en fraction de `area`, age, duree de vie, phase.
var _pos: PackedVector2Array
var _age: PackedFloat32Array
var _life: PackedFloat32Array
var _phase: PackedFloat32Array


func _ready() -> void:
	# ADDITIF, comme l'etait le voile : de la lumiere qui s'ajoute.
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = mat
	_rng.randomize()
	var n: int = look["count"]
	_pos.resize(n)
	_age.resize(n)
	_life.resize(n)
	_phase.resize(n)
	for i in n:
		_spawn(i)
		# Des ages etales, sinon tous naissent et meurent ensemble.
		_age[i] = _rng.randf() * _life[i]


func _spawn(i: int) -> void:
	_pos[i] = Vector2(_rng.randf(), _rng.randf())
	_age[i] = 0.0
	_life[i] = _rng.randf_range(look["life_min"], look["life_max"])
	_phase[i] = _rng.randf() * TAU


func _process(delta: float) -> void:
	var rise: float = look["rise"] * delta
	for i in _pos.size():
		_age[i] += delta
		if _age[i] >= _life[i]:
			_spawn(i)
			continue
		# La montee, en fraction de la hauteur d'ecran.
		# `area` est en unites de l'ile ; l'ecran y fait area.size.y / unit.
		var p := _pos[i]
		p.y -= rise * unit / maxf(1.0, area.size.y)
		_pos[i] = p
	queue_redraw()


func _draw() -> void:
	var t := Time.get_ticks_msec() / 1000.0
	var side: float = maxf(1.0, round(look["size"])) * unit
	var sway: float = look["sway"] * unit
	var base: float = look["alpha"]
	var flicker: float = look["flicker"]
	var hz: float = look["flicker_hz"]
	for i in _pos.size():
		var life := _age[i] / _life[i]
		# UNE DESCENTE, ET UN SINUS AUTOUR. Pleine a la naissance, nulle a la
		# fin ; le sinus oscille autour de cette pente, avec la phase du grain.
		# Les 6 premiers pour cent montent quand meme, sinon le grain apparait
		# d'un coup a pleine opacite.
		var bright := (1.0 - life) * minf(1.0, life / 0.06)
		bright *= 1.0 + flicker * sin(TAU * hz * _age[i] + _phase[i])
		if bright <= 0.01:
			continue
		var p := area.position + _pos[i] * area.size
		p.x += sin(t * 0.2 + _phase[i]) * sway
		# UN CARRE CALE SUR LA GRILLE DES PIXELS D'ECRAN, comme le grain du
		# shader des rais : un disque antialiase se lisait comme une bulle.
		# `area.position` est le coin de l'ecran : on arrondit l'ecart a lui.
		p = area.position + ((p - area.position) / unit).round() * unit
		var c := _tint
		c.a = base * bright
		draw_rect(Rect2(p - Vector2(side, side) * 0.5, Vector2(side, side)), c)
