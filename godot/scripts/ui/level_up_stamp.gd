class_name LevelUpStamp
extends ScreenStamp
## LE TERRIER A MONTE D'UN NIVEAU — dit sur tout l'ecran, une fois.
##
## Porte de level-up-stamp.tsx. Une amelioration est la plus grosse chose
## qu'un joueur achete dans ce jeu, et elle arrivait en pastille de texte :
## « Burrow deepened: 250 ». La maison changeait de texture dans la meme
## image. Maintenant un eclat chaud fleurit du milieu, le niveau claque comme
## la victoire d'un raid, et il s'enleve une seconde plus tard (stamp.gd
## porte la mecanique). Le plateau joue sa propre part dessous
## (`BurrowTerrain.celebrateLevel`, a venir dans burrow*.gd).
##
## LES MOTS SONT CEUX DU WEB : `burrow.level` (« BURROW LVL {0} ») et
## `burrow.gardenGrows` — le web ecrit « BURROW LEVEL » en dur dans le
## composant, mais la pastille du terrier dit « LVL » dans les quatre
## langues, et c'est le dictionnaire qui fait foi ici.
##
## Un tampon par montee : deux ameliorations de suite sont deux tampons,
## comme la `key` du web.

## Combien de temps le tampon reste (STAMP_MS), et quand il part
## (`rr-levelup-out` a 1700 ms).
const STAY_S := 2.2
const OUT_AT_S := 1.7
const DIM_S := 2.1


func _init() -> void:
	super()
	stay_s = STAY_S
	out_at_s = OUT_AT_S
	dim_s = DIM_S


## ANNONCER LE NIVEAU : pose le tampon sur le chrome et le rend (un banc le
## pose lui-meme). `announce` et non `show` : `show()` est deja celui de
## CanvasItem, et une statique du meme nom ne se resout pas.
static func announce(level: int) -> LevelUpStamp:
	var stamp := LevelUpStamp.new()
	stamp.set_words(I18N.f("burrow.level", [level]), I18N.t("burrow.gardenGrows"))
	ScreenStamp.mount(stamp)
	return stamp


## BRANCHER SUR LE TERRIER : chaque `Home.level_up` devient un tampon. A
## appeler une fois, par celui qui monte le chrome (chrome.gd `_mount`).
static func arm() -> void:
	if not Home.level_up.is_connected(LevelUpStamp.announce):
		Home.level_up.connect(LevelUpStamp.announce)
