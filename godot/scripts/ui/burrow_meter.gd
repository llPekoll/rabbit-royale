class_name BurrowMeter
extends Control
## UNE JAUGE DU TERRIER, dessinee dans les SPRITES de la barre d'energie
## (burrow-chrome.tsx `BurrowMeter`, globals.css `.rr-pix-meter`).
##
## L'ancien `.rr-meter` etait un degrade CSS dans une piste arrondie — le
## seul element de l'ecran sans un pixel dedans. Ici, la coquille en trois
## morceaux et le remplissage de tools/gen_energy_bar.py : la couleur est un
## JEU DE SPRITES, jamais un hexa, et la palette vit dans l'art.
##
## LES MESURES SONT PRISES SUR LE SPRITE, pas divisees par deux. La coquille
## fait 51 de haut ; le canal sombre court de y=11 a y=34, donc le mur du
## haut est plus mince (11) que la levre ombree du bas (16). Le bout fait 24
## de large mais 13 sont la douille sombre ou la barre s'emboite : le canal
## s'ouvre a x=11, et un remplissage decale de tout le bout laissait un trou
## noir a gauche. Symetrique : le bout droit ferme a 11 de son bord.
##
## LE REMPLISSAGE S'ARRETE SUR UN PIXEL ENTIER : une crete a mi-pixel rend
## deux colonnes a demi allumees, ce que le pixel art ne fait jamais.

## L'echelle du web (`--rr-gauge-px: 0.55`) : la barre revient a ~28 px, la
## hauteur qu'elle a toujours eue dans une bande dessinee pour un telephone.
const PX := 0.55
const SHELL_H := 51.0
const CAP_W := 24.0
const WALL_TOP := 11.0
const WALL_BOTTOM := 16.0
const WALL := 11.0
const FILL_H := 24.0

@export var value := 0.0:
	set(v):
		value = v
		queue_redraw()

@export var max_value := 1.0:
	set(v):
		max_value = v
		queue_redraw()

## "carrot", "warn" ou "danger" — un jeu de sprites (Kit.GAUGE_FILL).
@export var tone := "carrot":
	set(v):
		tone = v
		queue_redraw()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(2.0 * CAP_W * PX, SHELL_H * PX)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL


func ratio() -> float:
	return clampf(value / max_value, 0.0, 1.0) if max_value > 0.0 else 0.0


func _draw() -> void:
	var w := size.x
	var h := size.y
	if w <= 0.0 or h <= 0.0:
		return
	var k := h / SHELL_H
	var cap := CAP_W * k

	# La coquille : la base a gauche, le bout a droite, le milieu entre.
	draw_texture_rect(Kit.GAUGE_SHELL_BASE, Rect2(0, 0, cap, h), false)
	if w > 2.0 * cap:
		draw_texture_rect(Kit.GAUGE_SHELL_MID, Rect2(cap, 0, w - 2.0 * cap, h), false)
	draw_texture_rect(Kit.GAUGE_SHELL_CAP, Rect2(w - cap, 0, cap, h), false)

	# Le remplissage, dans le canal que les murs laissent.
	var pct := ratio()
	if pct <= 0.0:
		return
	var channel_w := w - 2.0 * WALL * k
	var fill_w := floorf(channel_w * pct)
	if fill_w < 1.0:
		return
	var top := WALL_TOP * k
	var fill_h := h - top - WALL_BOTTOM * k
	var set: Array = Kit.GAUGE_FILL.get(tone, Kit.GAUGE_FILL["carrot"])
	var mid: Texture2D = set[0]
	var crest: Texture2D = set[1]
	var crest_w := minf(fill_w, floorf(float(crest.get_width()) * fill_h / FILL_H))
	var x := WALL * k
	if fill_w - crest_w > 0.0:
		draw_texture_rect(mid, Rect2(x, top, fill_w - crest_w, fill_h), false)
	draw_texture_rect(crest, Rect2(x + fill_w - crest_w, top, crest_w, fill_h), false)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()
