class_name LoadingNote
extends HBoxContainer
## « CA CHARGE » — la ligne qu'un panneau montre tant que sa premiere lecture
## n'est pas rentree.
##
## Un panneau s'ouvre au doigt et lit le serveur ensuite. Avant, il montrait
## son VIDE pendant ce temps : « personne n'a encore marque » au classement,
## « personne » dans la liste des cibles, « ferme » sur le pass — un mensonge
## d'une seconde que le joueur lisait comme la reponse (2026-10-01). La
## carotte qui se remplit (CarrotLoader) et le mot « Loading » a la place.


func _init(size: int = 12, color: Color = Palette.BARK) -> void:
	alignment = BoxContainer.ALIGNMENT_CENTER
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_theme_constant_override("separation", 6)
	var carrot := CarrotLoader.new()
	carrot.side = roundf(size * 1.3)
	carrot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(carrot)
	var words := Kit.label(I18N.shout(I18N.t("chrome.loading")) + "...", size, color)
	words.uppercase = I18N.pixel_face()
	add_child(words)
	visibility_changed.connect(func() -> void:
		if visible:
			carrot.restart())
