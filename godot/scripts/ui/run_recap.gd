class_name RunRecap
extends Dialog
## LA FIN D'UNE RUN, ET LA SORTIE.
##
## Porte de src/components/run-recap.tsx, sur le parchemin du kit plutot que
## sur le verre sombre du web — le chrome n'a qu'une surface de dialogue
## (dialog.gd), et c'est voulu.
##
## Ce que le web a decide, et qu'on garde :
##
##   • TOUTE RUN FINIT DE LA MEME FACON : `resolveMove` tue le lapin quand,
##     et seulement quand, son energie tombe a zero. « Run over » et « le
##     reservoir est vide » sont LE MEME EVENEMENT, et la recharge est
##     toujours l'offre qui va avec l'ecran. Rentrer est la porte simple : la
##     boutique n'est jamais la seule sortie d'un reservoir vide, sinon
##     l'attente devient un peage.
##   • QUATRE FINS : les coeurs, l'ile (videe), le coffre du tutoriel, ou UN
##     RIVAL. Les deux du milieu sont des VICTOIRES : pas de recharge offerte,
##     HOME est le bouton fort. Une poussee dans l'eau et un eclair disaient
##     « RUN OVER · Out of energy » — vrai des coeurs, faux de ce qui s'est
##     passe ; une defaite sans coupable se lit comme un jeu casse.
##   • UNE RUN GAGNEE S'EN VA TOUTE SEULE : une seule chose a presser, rien a
##     decider, et le compte se lit sur le bouton (« in 6 ») pour que la carte
##     tienne sa promesse. Une run PERDUE ne compte jamais : elle porte un
##     vrai choix, et pousser un joueur hors d'un choix, c'est comment une
##     boutique finit pressee par accident.
##   • LES COULEURS : HOME sur une ile videe est le SEUL bouton, il est
##     dore ; en face de « Get more energy » il est la planche de bois, la
##     tranquille (Paul, 2026-09-20 : « fait attention sur les couleurs on
##     dirait que c'est disable »).
##   • TROIS LIGNES, TROIS POIDS (22 septembre 2026) : le record est la
##     NOUVELLE de la run et garde l'or ; la banque est une lecture et prend
##     l'encre ordinaire ; le raid est un feu vert.

signal refill
signal go_home

const AUTO_HOME_SECONDS := 6
## Le vert « en train de creuser » de la liste des cibles.
const LIVE := Color("#4ade80")

var _recap: Dictionary = {}
var _first := false
var _bank: Dictionary = {}
var _record: Dictionary = {}

var _stats: Label
var _note: Label
var _bank_line: Label
var _record_line: Label
var _raid_line: Label
var _shop: PlankButton
var _home: PlankButton
var _tick: Timer
var _deadline_ms := 0
var _left := -1


## 480 et pas les 420 d'un dialogue : en anglais la face pixel est large, et
## a 420 trois lignes sur quatre cassaient avec un mot seul dessous
## (« water. », « 30) », « takes 5 ») pendant que les autres langues
## tenaient sur une (mesure 2026-09-23). Le telephone le plus etroit
## (852 de large) garde ses 186 px de chaque cote.
const WIDTH := 480.0


func _init() -> void:
	super("", WIDTH)


func _ready() -> void:

	_stats = Kit.label("", 14, Palette.INK)
	_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Kit.wrapped(_stats)
	body.add_child(_stats)
	_note = Kit.note("", Palette.BARK, 13)
	_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(_note)
	_record_line = Kit.note("", Palette.CARROT_DEEP, 12)
	_record_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(_record_line)
	_bank_line = Kit.note("", Palette.INK, 12)
	_bank_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(_bank_line)
	_raid_line = Kit.note("", LIVE.darkened(0.35), 12)
	_raid_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(_raid_line)

	var actions := Kit.vbox(Kit.PAD_TIGHT)
	_shop = Kit.button("", "gold", 0.0, 44.0)
	_shop.pressed.connect(func() -> void:
		_shop.wiggle()
		refill.emit())
	actions.add_child(_shop)
	_home = Kit.button("", "wood", 0.0, 44.0)
	_home.pressed.connect(_on_home)
	actions.add_child(_home)
	add_footer(actions)

	# Le compte est lu sur une ECHEANCE, pas decremente : un tick en retard
	# (une fenetre en arriere-plan) ne fait pas trainer la carte sur « 4 ».
	_tick = Timer.new()
	_tick.wait_time = 0.25
	_tick.timeout.connect(_on_tick)
	add_child(_tick)
	# LE COMPTE PART ICI : `show_recap` est appele AVANT l'entree dans l'arbre,
	# et `_enter_tree` passe avant ce `_ready` — le minuteur n'existait pas
	# encore, et « (6) » restait fige.
	if _deadline_ms > 0:
		_tick.start()

	I18N.locale_changed.connect(func(_code: String) -> void: _relabel())
	_relabel()


## Ce que la carte montre. `first` : le tout premier voyage, et la carte
## ajoute une ligne qui pointe vers le terrier — un lieu dont le joueur n'a
## pas encore entendu parler.
func show_recap(recap: Dictionary, first: bool = false, bank: Dictionary = {}, record: Dictionary = {}) -> void:
	_recap = recap
	_first = first
	_bank = bank
	_record = record
	if _won():
		_deadline_ms = Time.get_ticks_msec() + AUTO_HOME_SECONDS * 1000
		_left = AUTO_HOME_SECONDS
		if is_inside_tree():
			_tick.start()
	else:
		_deadline_ms = 0
		_left = -1
		_tick.stop()
	if is_node_ready():
		_relabel()


func _enter_tree() -> void:
	if _deadline_ms > 0 and _tick != null:
		_tick.start()


func _won() -> bool:
	return bool(_recap.get("cleared", false)) or bool(_recap.get("tutorialDone", false))


## Le rival qui a fini cette run, ou vide : jamais sur une run gagnee.
func _killer() -> Dictionary:
	if _won():
		return {}
	var k: Variant = _recap.get("killedBy", null)
	return k if k is Dictionary else {}


func _relabel() -> void:
	var done := bool(_recap.get("tutorialDone", false))
	var cleared := bool(_recap.get("cleared", false))
	var killer := _killer()
	var how := String(killer.get("how", ""))
	var who := String(killer.get("name", ""))

	if done:
		set_title(I18N.t("recap.tutorialDone"))
	elif cleared:
		set_title(I18N.t("recap.cleared"))
	elif not killer.is_empty():
		set_title(I18N.t("recap.shoved" if how == "shove" else "recap.struck"))
	else:
		set_title(I18N.t("recap.over"))

	# Une seule chaine pour les stats : l'ordre d'un compte et de son unite
	# n'est pas le meme dans toutes les langues.
	_stats.text = I18N.f("recap.stats", [int(_recap.get("carrots", 0)), int(_recap.get("tilesDug", 0)),
		int(_recap.get("bombsHit", 0)), I18N.run_time(float(_recap.get("durationMs", 0)))])

	var note := ""
	if done:
		note = I18N.t("recap.tutorialDoneNote")
	elif cleared:
		note = I18N.t("recap.clearedNote")
	elif not killer.is_empty():
		# Le nom peut manquer si le coupable a quitte l'ile avant que le fil
		# rattrape. Mieux que le silence : quelqu'un vous a fait ca.
		if who.is_empty():
			note = I18N.t("recap.shovedNoteAnon" if how == "shove" else "recap.struckNoteAnon")
		else:
			note = I18N.f("recap.shovedNote" if how == "shove" else "recap.struckNote", [who])
	else:
		note = I18N.t("recap.overNote")
	# Pas apres la note du tutoriel, qui dit deja ou aller.
	if _first and not done:
		note += " " + I18N.t("firstRun.recap")
	_note.text = note

	_record_line.visible = not _record.is_empty()
	if _record_line.visible:
		var previous := int(_record.get("previous", 0))
		_record_line.text = I18N.f("recap.record", [I18N.island_name(String(_record.get("tier", ""))),
			I18N.group_digits(int(_record.get("carrots", 0))),
			I18N.group_digits(previous) if previous > 0 else null])

	_bank_line.visible = not _bank.is_empty()
	if _bank_line.visible:
		_bank_line.text = I18N.f("recap.bank", [int(_bank.get("energy", 0)), int(_bank.get("max", 0)), int(_bank.get("cost", 0))])
	# CE QUI RENTRE EST UN RAID : le meme reservoir garde ce qu'une run
	# laisse, et repartir avec de quoi raider est le meilleur coup a tous les
	# paliers (mesure : le raid paie environ deux fois une run par point).
	_raid_line.visible = not _bank.is_empty() and int(_bank.get("energy", 0)) >= Tuning.raid_floor()
	if _raid_line.visible:
		_raid_line.text = I18N.f("recap.raidLeft", [int(_bank.get("energy", 0))])

	var won := _won()
	_shop.visible = not won
	_shop.relabel(I18N.shout(I18N.t("recap.getEnergy")))
	_home.board = PlankButton.tone_board("gold" if won else "wood")
	var home := I18N.shout(I18N.t("recap.goHome"))
	# Pas a zero : la carte part deja, et « (0) » n'est pas un compte.
	if won and _left > 0:
		home += " (%d)" % _left
	_home.relabel(home)


func _on_tick() -> void:
	if _deadline_ms <= 0:
		_tick.stop()
		return
	var n := int(ceil((_deadline_ms - Time.get_ticks_msec()) / 1000.0))
	if n > 0:
		if n != _left:
			_left = n
			_relabel()
		return
	_tick.stop()
	_deadline_ms = 0
	_left = 0
	_relabel()
	go_home.emit()


## Le [x] (et Echap) de la carte : RENTRER, comme HOME. Fermer la carte
## seule laissait le lapin sur une ile finie, sans sortie.
func close_requested() -> void:
	_on_home()


func _on_home() -> void:
	if _won():
		_home.wiggle()
	_tick.stop()
	_deadline_ms = 0
	go_home.emit()
