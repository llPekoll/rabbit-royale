class_name UpdateDialog
extends Dialog
## NOUVELLE VERSION : le serveur a redemarre sous un jeu ouvert.
##
## Un redemarrage de rr-ws, c'est un deploiement, et il emporte les iles (elles
## vivent dans sa memoire). Le client, lui, gardait l'ancienne a l'ecran : des
## cases sombres ou creuser ne revelait plus rien, et le code d'avant sur un
## serveur d'apres (2026-10-11). GameSocket reconnait le redemarrage
## (`server_updated`) ; ce dialogue ne propose qu'une chose, relancer, et ne se
## ferme pas autrement — derriere lui il n'y a plus rien de juste.
##
## RELANCER selon la plateforme : le web recharge la page, le bureau se
## relance lui-meme. Android et iOS ne savent pas se relancer : l'appli se
## ferme et le dit, et c'est au lancement suivant que boot.gd prend le
## nouveau pack.

const WIDTH := 400.0
const BUTTON_H := 44.0


func _init() -> void:
	super(I18N.t("update.title"), WIDTH, 0.0)
	close_button.visible = false


func _ready() -> void:
	ink_title()
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	body.add_child(Kit.note(I18N.t("update.body"), Palette.INK, 12))
	if _mobile():
		body.add_child(Kit.note(I18N.t("update.reopen"), Palette.BARK, 11))
	var b := Kit.button(I18N.shout(I18N.t("update.restart")), "wood", 0.0, BUTTON_H)
	b.name = "UpdateRestart"
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(_restart)
	add_footer(b)


## Pas de sortie sans relancer : le voile, Echap et le [x] ne ferment rien.
func close_requested() -> void:
	pass


func _restart() -> void:
	match OS.get_name():
		"Web":
			JavaScriptBridge.eval("location.reload()")
		"Android", "iOS":
			get_tree().quit()
		_:
			OS.set_restart_on_exit(true, OS.get_cmdline_args())
			get_tree().quit()


static func _mobile() -> bool:
	return OS.get_name() in ["Android", "iOS"]


static func open() -> UpdateDialog:
	var dialog := UpdateDialog.new()
	if Chrome.current != null:
		Chrome.current.open(dialog, false)
	return dialog
