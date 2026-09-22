extends RefCounted
class_name Rng
## LE TIRAGE AU SORT, BIT POUR BIT CELUI DU WEB.
##
## Porte de src/lib/game/rng.ts (`mulberry32`, `seedFrom`).
##
## POURQUOI CE FICHIER EXISTE PLUTOT QUE `RandomNumberGenerator`.
##
## Le generateur de Godot est excellent et il est INUTILISABLE ici : l'ile ne
## voyage jamais sur le fil, elle voyage comme une GRAINE. Le serveur cuit son
## relief, le client cuit le sien, et les deux doivent tomber sur la meme terre
## sans jamais se parler. Une suite aleatoire differente, c'est une ile
## differente — le lapin marche alors sur une falaise que le serveur croit
## plate, et le desaccord ne se voit qu'au moment ou un joueur tombe dedans.
##
## LES 32 BITS SONT LE PIEGE, et il est silencieux.
##
## JavaScript calcule en 32 bits : `Math.imul` multiplie et TRONQUE, `>>> 0`
## ramene dans les non signes. GDScript compte en 64 bits et ne deborde pas :
## sans masquage explicite, les produits continuent de grandir et la suite
## diverge du web des le troisieme ou quatrieme tirage — assez tard pour que
## les premieres cases coincident et qu'on croie le portage bon.
##
## VERIFIE, PAS SUPPOSE : sur les graines "default", "island:7", "content:abc"
## et "shape:first", ce fichier rend les memes valeurs que Node a NEUF
## DECIMALES. Le test les epingle ; s'il casse, l'ile du Seeker n'est plus
## celle du serveur.

## Le masque de 32 bits — la troncature que `Math.imul` et `>>> 0` font seuls.
const M32 := 0xFFFFFFFF

var _a: int


func _init(seed_value: int) -> void:
	_a = seed_value & M32


## `Math.imul` : multiplication entiere 32 bits, resultat tronque.
static func imul(a: int, b: int) -> int:
	return (a * b) & M32


## HACHE UNE GRAINE TEXTE vers l'entier 32 bits que veut mulberry32 (FNV-1a).
##
## Les graines du jeu sont des chaines — « content:… », « shape:… », l'id d'une
## ile — et c'est ce hachage qui doit correspondre au web, pas seulement le
## generateur qui le suit.
static func seed_from(s: String) -> int:
	var h := 2166136261
	for i in range(s.length()):
		h = (h ^ s.unicode_at(i)) & M32
		h = imul(h, 16777619)
	return h & M32


## Le prochain flottant dans [0, 1).
func next() -> float:
	_a = (_a + 0x6d2b79f5) & M32
	var t := imul(_a ^ (_a >> 15), 1 | _a)
	t = ((t + imul(t ^ (t >> 7), 61 | t)) ^ t) & M32
	return float((t ^ (t >> 14)) & M32) / 4294967296.0


## Un tirage depuis une graine TEXTE — la forme dont le jeu se sert partout.
static func from_seed(s: String) -> Rng:
	return Rng.new(seed_from(s))
