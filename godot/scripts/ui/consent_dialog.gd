class_name ConsentDialog
extends Dialog
## « AVANT DE CREUSER » — la question de la mesure, posee aux joueurs europeens
## (consent.gd dit a qui) et rouverte depuis le profil par tous.
##
## LES REGLES DE LA CNIL, ET CE QU'ELLES DONNENT ICI :
##
##   • REFUSER AUSSI SIMPLE QU'ACCEPTER. Les deux planches ont la MEME taille,
##     le MEME bois, la meme ligne : pas d'or pour le oui et de gris pour le
##     non, pas de « parametrer » cache derriere un lien. Un tap, dans les deux
##     sens. Le refus est a gauche : l'oeil lit de gauche a droite, et le oui
##     n'y gagne pas la premiere place.
##   • PAS DE SORTIE SANS REPONSE A LA PREMIERE FOIS : ni [x], ni voile qui
##     ferme, ni Echap. Fermer sans repondre serait un refus qui ne dit pas son
##     nom — et la question reviendrait au lancement suivant. Rouvert depuis le
##     profil, le [x] revient : ne rien changer est alors une reponse.
##   • ECRIT DANS LA VOIX DU JEU, COURT. Ce qu'on mesure (ecrans, tapes, la pub
##     qui l'a amene), pourquoi (ce qu'il faut reparer), ce qu'on n'en fait pas
##     (rien n'est vendu) ; les rapports de plantage, qui partent sans ce oui ;
##     ou changer d'avis ; et la politique entiere a un lien.
##   • UN TELEPHONE COUCHE FAIT 400 PX DE HAUT : quatre lignes de texte, un
##     lien, une rangee de planches. Tout ce qui depasse irait sous le pouce.
##
## DEUX HOTES. En jeu, le chrome (`Chrome.current.open`) ; a l'ACCUEIL il n'y a
## pas de chrome (il nait en entrant dans le monde, screens.gd), donc
## `ask_on(title)` pose son propre voile sur l'ecran d'accueil.

## La reponse, apres qu'elle est gardee et posee sur le SDK.
signal answered(granted: bool)

## La largeur du dialogue : assez pour que les deux planches tiennent cote a
## cote avec leurs mots les plus longs (« Recusar », « Từ chối »), assez peu
## pour laisser le tableau de l'accueil se voir autour.
const WIDTH := 440.0
const BUTTON_H := 44.0

## Rouvert depuis le profil : le [x] est permis, et l'etat actuel est dit.
var _revisit := false
## D'ou vient la reponse, pour `consent_answer`.
var _where := "doorstep"
## Pose par `ask_on` : le dialogue se centre lui-meme et emporte son voile.
var _hosted := false


func _init(revisit: bool = false) -> void:
	super(I18N.t("consent.title"), WIDTH, 0.0)
	_revisit = revisit
	_where = "profile" if revisit else "doorstep"
	close_button.visible = revisit


func _ready() -> void:
	ink_title()
	body.add_theme_constant_override("separation", Kit.PAD_TIGHT)
	body.add_child(Kit.note(I18N.t("consent.body"), Palette.INK, 12))
	# Le chinois ne met pas d'espace entre deux phrases.
	var gap := "" if I18N.locale == "zh" else " "
	var small := I18N.t("consent.crash") + gap + I18N.t("consent.later")
	if _revisit:
		small += gap + I18N.t("consent.isOn" if Consent.analytics else "consent.isOff")
	body.add_child(Kit.note(small, Palette.BARK, 11))

	# LA POLITIQUE, un lien et pas une planche : ce n'est pas un troisieme
	# choix, c'est une lecture. Ouverte dans le navigateur du systeme.
	var policy := LinkButton.new()
	policy.text = I18N.t("consent.policy")
	policy.underline = LinkButton.UNDERLINE_MODE_ALWAYS
	policy.focus_mode = Control.FOCUS_NONE
	policy.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	policy.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	policy.add_theme_font_size_override("font_size", 11)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		policy.add_theme_color_override(state, Palette.BARK)
	policy.pressed.connect(func() -> void: OS.shell_open(Consent.PRIVACY_URL))
	body.add_child(policy)

	# LES DEUX PLANCHES, JUMELLES : meme bois, meme hauteur, meme part de la
	# largeur (EXPAND_FILL des deux cotes).
	var row := Kit.hbox(Kit.PAD)
	add_footer(row)
	for granted in [false, true]:
		var b := Kit.button(I18N.shout(I18N.t("consent.accept" if granted else "consent.refuse")),
			"wood", 0.0, BUTTON_H)
		b.name = "ConsentAccept" if granted else "ConsentRefuse"
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(_choose.bind(granted))
		row.add_child(b)

	if not _revisit:
		Analytics.consent_shown()


func _choose(granted: bool) -> void:
	Analytics.set_consent(granted, _where)
	answered.emit(granted)
	closed.emit()


## Echap ne ferme que si le [x] est la : a la premiere question, il faut
## repondre.
func close_requested() -> void:
	if _revisit:
		closed.emit()


## ROUVRIR DEPUIS LE JEU (le profil) : sur le chrome, voile qui ferme, [x].
static func open() -> ConsentDialog:
	var dialog := ConsentDialog.new(true)
	if Chrome.current != null:
		Chrome.current.open(dialog)
	return dialog


## POSER LA QUESTION SUR L'ACCUEIL, qui n'a pas de chrome : un voile a nous,
## le dialogue centre dessus, et les deux partent ensemble a la reponse.
## `await ConsentDialog.ask_on(self).answered` attend la reponse.
static func ask_on(host: Control) -> ConsentDialog:
	var layer := Control.new()
	layer.name = "ConsentLayer"
	# Au-dessus de la carotte d'attente (z 100, title.gd) et de tout
	# l'accueil ; le voile prend les taps, rien ne passe a la colonne.
	layer.z_index = 200
	layer.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(layer)
	var scrim := ColorRect.new()
	scrim.color = Palette.SCRIM
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	Kit.fill(scrim)
	layer.add_child(scrim)
	var dialog := ConsentDialog.new(false)
	dialog._hosted = true
	layer.add_child(dialog)
	host.add_child(layer)
	layer.modulate.a = 0.0
	layer.create_tween().tween_property(layer, "modulate:a", 1.0, 0.14)
	return dialog


func _enter_tree() -> void:
	if not _hosted:
		return
	# DES METHODES, pas des lambdas : un signal de la vue branche sur une
	# lambda survit au dialogue, et la rappeler apres lui est l'erreur
	# « Lambda capture at index 0 was freed ». Une methode se debranche seule
	# quand son objet meurt.
	if not get_viewport().size_changed.is_connected(_center_on_host):
		get_viewport().size_changed.connect(_center_on_host)
		minimum_size_changed.connect(_center_on_host)
		closed.connect(_drop_host)
	_center_on_host.call_deferred()


## La regle du chrome (`_center_dialog`) : le minimum du contenu, borne par la
## vue moins la gouttiere, centre.
func _center_on_host() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	var want := get_combined_minimum_size()
	size = Vector2(minf(want.x, view.x - 2.0 * Kit.EDGE), minf(want.y, view.y - 2.0 * Kit.EDGE))
	position = ((view - size) * 0.5).floor().max(Vector2(Kit.EDGE, Kit.EDGE))


func _drop_host() -> void:
	get_parent().queue_free()
