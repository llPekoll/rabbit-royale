class_name ElsewhereDialog
extends Dialog
## OUVERT AILLEURS : le compte vient de s'ouvrir sur un autre appareil, et un
## seul joue a la fois (server/index.ts `claimSession`, 2026-10-23). Le serveur
## a deja encaisse la partie en cours ici et ferme la socket ; GameSocket ne la
## rouvre pas d'elle-meme. Une seule sortie, JOUER ICI : on reprend la main,
## l'autre appareil recoit ce meme dialogue. Pas d'autre fermeture — derriere,
## l'ecran ne parle plus a personne.

const WIDTH := 440.0
const BUTTON_H := 44.0


func _init() -> void:
	super(I18N.t("elsewhere.title"), WIDTH, 0.0)
	close_button.visible = false


func _ready() -> void:
	ink_title()
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	body.add_child(Kit.note(I18N.t("elsewhere.body"), Palette.INK, 12))
	var b := Kit.button(I18N.shout(I18N.t("elsewhere.playHere")), "wood", 0.0, BUTTON_H)
	b.name = "ElsewherePlayHere"
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(_play_here)
	add_footer(b)


## Le voile, Echap et le [x] ne ferment rien : seul JOUER ICI.
func close_requested() -> void:
	pass


## La partie d'ici est encaissee cote serveur : une ile a l'ecran est morte,
## on rentre au terrier (meme chemin que la sortie du recap, chrome.gd), et la
## socket se rouvre sans redemander de place.
func _play_here() -> void:
	GameSocket.reclaim()
	if Screens.place == Screens.Place.ISLAND and RunState.current != null:
		RunState.current.go_home()
		Screens.cross(Screens.Place.BURROW)
	if Chrome.current != null:
		Chrome.current.close_dialog(true)
