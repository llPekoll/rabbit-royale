class_name RaidedStamp
extends ScreenStamp
## « TU AS ETE PILLE » — sur l'ecran, une fois, quand le terrier est revu
## avec des raids non lus contre lui.
##
## Porte de raided-stamp.tsx : la grammaire du tampon de niveau (stamp.gd)
## dans le rouge de danger, tenue une seconde de plus — c'est une histoire
## avec un nom dedans, pas un hourra. Quand chaque raid non lu a rebondi sur
## un bouclier, la nouvelle est bonne et le dit en or : DEFENDED.
##
## LA NOUVELLE VIENT D'AILLEURS. Le web la somme depuis /api/player/history
## (`raidedNews` : les raids non lus, en tete de `against`) ; ici c'est le
## profil qui la lit et la tend a `announce`, sous la forme du web :
##
##   {by: String, others: int, carrots: int, defended: bool, count: int}
##
## `by` est le dernier pilleur, `others` combien d'AUTRES sont venus,
## `carrots` ce qu'ils ont pris en tout, `count` combien de raids.

## STAMP_MS 2600 ; le depart a 2150 ms ; la vignette tient 2550 ms.
const STAY_S := 2.6
const OUT_AT_S := 2.15
const DIM_S := 2.55

## L'eclat rouge (`.rr-raided .rr-levelup-flash`) : 0%, 20%, 64% du rayon.
const FLASH_DANGER := PackedColorArray([
	Color(1.0, 210.0 / 255.0, 200.0 / 255.0, 0.9),
	Color(1.0, 90.0 / 255.0, 90.0 / 255.0, 0.7),
	Color(1.0, 60.0 / 255.0, 60.0 / 255.0, 0.0),
])
const FLASH_DANGER_OFFSETS := PackedFloat32Array([0.0, 20.0 / 64.0, 1.0])
## L'eclat de la defense (`.rr-raided.defended`) : 0, 18, 42, 68 %.
const FLASH_DEFENDED := PackedColorArray([
	Color(1.0, 248.0 / 255.0, 214.0 / 255.0, 1.0),
	Color(1.0, 214.0 / 255.0, 92.0 / 255.0, 0.85),
	Color(1.0, 160.0 / 255.0, 40.0 / 255.0, 0.35),
	Color(1.0, 160.0 / 255.0, 40.0 / 255.0, 0.0),
])
const FLASH_DEFENDED_OFFSETS := PackedFloat32Array([0.0, 18.0 / 68.0, 42.0 / 68.0, 1.0])
## Le halo rouge derriere les lettres.
const HALO_DANGER := PackedColorArray([
	Color(1.0, 90.0 / 255.0, 90.0 / 255.0, 0.55),
	Color(230.0 / 255.0, 40.0 / 255.0, 40.0 / 255.0, 0.22),
	Color(230.0 / 255.0, 40.0 / 255.0, 40.0 / 255.0, 0.0),
])


func _init() -> void:
	super()
	stay_s = STAY_S
	out_at_s = OUT_AT_S
	dim_s = DIM_S


## ANNONCER LA NOUVELLE. Rouge quand des carottes sont parties, or quand tout
## a rebondi. (`announce`, parce que `show()` est celui de CanvasItem.)
static func announce(news: Dictionary) -> RaidedStamp:
	var stamp := RaidedStamp.new()
	var defended := bool(news.get("defended", false))
	var by := String(news.get("by", ""))
	var others := int(news.get("others", 0))
	var carrots := int(news.get("carrots", 0))
	var count := int(news.get("count", 1))
	var who := "%s +%d" % [by, others] if others > 0 else by

	if defended:
		stamp.flash_stops = FLASH_DEFENDED
		stamp.flash_offsets = FLASH_DEFENDED_OFFSETS
		stamp.set_words(I18N.t("raid.defended"), I18N.f("raid.bounced", [count]))
	else:
		stamp.ink = Palette.BAD_ON_NIGHT
		stamp.ink_shadow = ScreenStamp.SHADOW_DANGER
		stamp.small_ink = ScreenStamp.SMALL_DANGER
		stamp.flash_stops = FLASH_DANGER
		stamp.flash_offsets = FLASH_DANGER_OFFSETS
		stamp.flash_vmin = 64.0
		stamp.halo_stops = HALO_DANGER
		# Le nom en capitales, comme le web (`who.toUpperCase()`) : un nom de
		# joueur n'est pas une chaine du dictionnaire, `shout` ne le voit pas.
		var line := I18N.f("raid.byWho", [who.to_upper(), carrots]) if carrots > 0 \
			else I18N.f("raid.byWhoNothing", [who.to_upper()])
		stamp.set_words(I18N.t("raid.raided"), line)
	ScreenStamp.mount(stamp)
	return stamp
