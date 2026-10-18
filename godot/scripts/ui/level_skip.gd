class_name LevelSkip
extends RefCounted
## LES ETAPES DU TERRIER ET LEUR RACCOURCI (2026-10-15, le soir ; une seule
## etape avant les raids depuis le 2026-10-16).
##
## Le terrier s'ouvre apres le livre de Shiro, le tuto et le journal de Kuro
## (Chrome.maybe_books) :
##
##   2. sous RAID_MIN — DIG + DEFEND ; a la place de RAID : SKIP TO RAID
##      (→ niveau 6, les iles a plusieurs).
##   3. RAID_MIN et plus — DIG + DEFEND + RAID (le livre de la mer).
##
## L'etape 1 (DIG seul + SKIP TO DEFEND) est retiree : le user, « degage-le
## completement du code ». Le saut est `skip_level` (le serveur, `nextSkip` :
## RABBIT_LEVELS.SKIP_TO sous RAID_MIN). Il se confirme : on ne redescend pas.


## L'ETAPE du joueur : 2 ou 3.
static func stage() -> int:
	var level := int(Home.player.get("level", 1))
	return 3 if level >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3) else 2


## Ou mene le saut de ce joueur, ou 0 (comme `nextSkip` au serveur).
static func next_rung() -> int:
	if not Home.loaded():
		return 0
	var level := int(Home.player.get("level", 1))
	if level >= Tuning.i("RABBIT_LEVELS.RAID_MIN", 3):
		return 0
	for to in Tuning.list("RABBIT_LEVELS.SKIP_TO"):
		if int(to) > level:
			return int(to)
	return 0


## LA CONFIRMATION : ce que le saut ouvre, et qu'on ne redescend pas.
static func ask() -> void:
	var to := next_rung()
	if to <= 0 or Chrome.current == null:
		return
	var dialog := Dialog.new(I18N.f("rabbitLevel.skipTitle", [to]), 460.0)
	var why := Kit.wrapped(Kit.label(I18N.t("rabbitLevel.skipWhyRaid"), 13, Palette.INK))
	dialog.body.add_child(why)
	var row := Kit.hbox(Kit.PAD)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	dialog.body.add_child(row)
	var stay := Kit.button(I18N.t("rabbitLevel.skipStay"), "wood", 130.0, 40.0)
	stay.pressed.connect(dialog.close_requested)
	row.add_child(stay)
	var go := Kit.button(I18N.f("rabbitLevel.skipYes", [to]), "gold", 150.0, 40.0)
	go.pressed.connect(func() -> void:
		dialog.close_requested()
		skip(to))
	row.add_child(go)
	I18N.apply_face([why, stay, go])
	Chrome.current.open(dialog)


## LE SAUT : le tampon du niveau, puis le livre de l'etape qui s'ouvre.
static func skip(to: int) -> void:
	var res: Dictionary = await Home.act("skip_level")
	var got := int(res.get("skipped", 0))
	Analytics.track("level_skip", {"to": to, "ok": got > 0})
	if got > 0:
		# Sauter, c'est passer le tuto : l'ile du tuto ne revient plus.
		Island.skip_tutorial()
	if got > 0 and Chrome.current != null:
		LevelUpStamp.announce_rabbit(got)
		Chrome.current.toast(I18N.f("rabbitLevel.skipped", [got]))
		Chrome.current.maybe_books(2.8)
