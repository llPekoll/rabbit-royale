extends Control
## LE BANC DU CODEX ET DES CEREMONIES : le codex avec un compteur factice,
## un lot de coffre, et les deux tampons — en quatre cellules sur la nuit,
## pour les voir en une capture sans compte ni serveur.
##
##   godot --path godot scenes/bench/codex_bench.tscn -- --shot=codex.png --after=2
##
## LE TERRIER EST FACTICE ET POSE DIRECTEMENT sur l'autoload (`Home.burrow`)
## : personne n'est connecte, donc `Home.mark_quest` ne poste rien — et le
## codex a de toute facon `read_marks` a faux ici. Rien ne part vers le
## serveur.
##
## Les tampons et la ceremonie s'enlevent seuls dans le jeu ; ici ils
## RESTENT (`linger`, `skip_to_shown`), sinon la capture a deux secondes
## tomberait entre deux images.

## Ce que le compteur vaut ici : trois chapitres ouverts, le troisieme
## fraichement (2000 + moins de 500).
const FAKE_LIFETIME := 2350.0
const FAKE_LEVEL := 3


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	Home.burrow = {"lifetime": FAKE_LIFETIME, "level": FAKE_LEVEL}

	var view := get_viewport_rect().size
	var half := Vector2(view.x * 0.5, view.y * 0.5)

	# Le codex, a gauche sur toute la hauteur, pose a plat (pas par le
	# chrome, qui n'est pas la).
	var left := _cell(Vector2.ZERO, Vector2(half.x, view.y))
	var codex := LoreCodex.new()
	codex.read_marks = false
	left.add_child(codex)
	codex.position = Vector2(Kit.EDGE, Kit.EDGE)
	codex.size = Vector2(half.x, view.y) - Vector2(2.0 * Kit.EDGE, 2.0 * Kit.EDGE)

	# Le lot d'un coffre couronne : une piece, plus deux engrais.
	var right_top := _cell(Vector2(half.x, 0.0), half)
	var prize := ChestPrize.announce({"kind": "fertiliser", "amount": 2, "nft": true, "announced": true, "at": 0})
	if prize != null:
		right_top.add_child(prize)
		Kit.fill(prize)
		if prize is ChestPrize:
			(prize as ChestPrize).skip_to_shown.call_deferred()

	# Les deux tampons, en bas a droite.
	var quarter := Vector2(half.x * 0.5, half.y)
	var level_cell := _cell(Vector2(half.x, half.y), quarter)
	var level := LevelUpStamp.new()
	level.linger = true
	level.set_words(I18N.f("burrow.level", [FAKE_LEVEL]), I18N.t("burrow.gardenGrows"))
	level_cell.add_child(level)
	Kit.fill(level)

	var raid_cell := _cell(Vector2(half.x + quarter.x, half.y), quarter)
	var raided := RaidedStamp.announce({"by": "Peko", "others": 1, "carrots": 340, "defended": false, "count": 2})
	raided.linger = true
	raid_cell.add_child(raided)
	Kit.fill(raided)

	DevShot.arm(self)


## Une cellule du banc : un rectangle qui rogne ce qu'il porte.
func _cell(at: Vector2, box: Vector2) -> Control:
	var c := Control.new()
	c.position = at
	c.size = box
	c.clip_contents = true
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(c)
	return c
