extends RefCounted
class_name FirstRun
## CE QUE L'ILE DIT PENDANT LA PREMIERE MANCHE — une ligne par beat.
##
## Porte de src/config/first-run.ts, conditions comprises.
##
## LES MOTS NE SONT PAS ICI. La legende d'un beat est celle du dictionnaire
## (`I18n.first_run(id)`), appelee par cet `id` ; ce qui reste ici est la
## CONDITION, la meme dans les quatre langues.
##
## AUCUNE LEGENDE NE PRECEDE SA MECANIQUE, et aucune ne demande de lire plus de
## douze mots : c'est un bandeau au-dessus d'un plateau qu'on tapote, pas une
## carte qu'on lit.
##
## LA DERNIERE CONDITION VRAIE GAGNE — donc un beat que le joueur saute (il lit
## le « 1 » et ne marche jamais sur la bombe) ne parle simplement jamais : la
## lecon a ete apprise par l'autre bout.

## L'ETAT QUE LES CONDITIONS LISENT — des comptes, et deux faits de position.
##
## `armed` et `beside` ne sont pas des comptes, et c'est voulu : le X est la
## seule lecon qui porte sur un MODE et sur un ENDROIT plutot que sur quelque
## chose qui s'est produit.
class State:
	var tiles: int = 0
	var bombs: int = 0
	var goldens: int = 0
	var chests: int = 0
	## Les X rouges que ce joueur a eus JUSTES.
	var flags: int = 0
	## Le mode X est-il arme en ce moment ?
	var armed: bool = false
	## LE LAPIN EST-IL A COTE DE LA BOMBE ENSEIGNEE, maintenant ?
	##
	## La lecon du X etait appelee par le COMPTE (trois cases creusees), ce qui
	## tenait lieu de « tu as atteint la bombe » sur les plateaux de l'epoque.
	## Sur le couloir dessine a la main, le lapin est a cote de la bombe apres
	## UN creusage, et la retenue (`teaching_hold`) refuse tout autre coup — le
	## compte ne pouvait donc jamais atteindre trois, « le chiffre compte les
	## bombes » tenait pour toujours, et personne n'etait jamais invite a
	## presser MARQUER UNE BOMBE (2026-09-22 : « i can't progress past the
	## second checkpoint »). L'appel est la POSITION, le meme fait auquel le X
	## fantome et la fleche au-dessus du bouton repondent deja.
	var beside: bool = false
	var warn_stage: int = 0


## L'ARC, dans l'ordre d'enseignement : un chiffre, puis le X, puis le coffre.
##
## Trois lecons, chacune le sol de la suivante. Le X est indicible sans le
## chiffre (« il ne reste qu'une case » ne veut rien dire si le glyphe ne dit
## rien), et le coffre est le seul qui demande au joueur de QUITTER la case ou
## il est — une chose a demander une fois qu'il sait lire le sol qu'il traverse.
##
## POURQUOI LE X PREND TROIS BEATS. C'est la seule mecanique qui ne s'apprend
## pas par accident : personne n'arme un mode au hasard, donc il faut la
## provoquer, et un geste en deux temps enseigne en un seul est ce qui a ete
## livre avant. `prove` enonce la deduction et designe le BOUTON ; `aim` part
## une fois le mode arme et designe la CASE ; `marked` repond au resultat. Une
## consigne par beat, et chacune porte sur un seul objet.
##
## `sticky` : le beat TIENT jusqu'au suivant, au lieu de s'effacer sur une
## horloge.
const BEATS: Array[Dictionary] = [
	{"id": "tap", "sticky": true},
	# LE CHIFFRE D'ABORD, ET IL TIENT. Le glyphe est ce que tout beat ulterieur
	# designe, donc la manche n'avance pas tant que le joueur n'a pas creuse une
	# seconde case — une ligne qui s'efface au bout de quatre secondes
	# n'enseignait rien.
	{"id": "numbers", "sticky": true},
	{"id": "counts"},
	# A COTE DE LA BOMBE, ou trois cases creusees sur un plateau qui ne sait pas
	# rapporter `beside`. `mark` et `aim` TIENNENT : c'est la demande pour
	# laquelle tout le plateau refuse chaque autre pas, et une demande effacee
	# au bout de quatre secondes laissait le joueur avec un anneau qui vibre et
	# aucune phrase — la fleche au-dessus du bouton est un index, pas une
	# consigne.
	{"id": "prove"},
	{"id": "mark", "sticky": true},
	{"id": "aim", "sticky": true},
	{"id": "marked"},
	# ...puis le coffre, ou la premiere ile se termine deja, et qui porte deja
	# une fleche. Ce qui manquait etait la phrase qui envoie le joueur, au
	# moment ou le X vient de payer.
	{"id": "fetch"},
	{"id": "bomb"},
	{"id": "golden"},
	{"id": "chest"},
	{"id": "clock"},
]


## LA CONDITION D'UN BEAT. Une fonction par `id`, dans l'ordre de `BEATS`.
##
## GDScript n'a pas de litteral de fonction qu'on rangerait dans la table, donc
## la condition vit ici, en regard de son identifiant. Le `match` est exhaustif
## et rend `false` pour un id inconnu — un beat mal nomme se TAIT au lieu de
## parler a contretemps.
static func _holds(id: String, s: State) -> bool:
	match id:
		"tap": return true
		"numbers": return s.tiles >= 1
		"counts": return s.tiles >= 2
		"prove": return s.beside or s.tiles >= 3
		"mark": return (s.beside or s.tiles >= 3) and not s.armed
		"aim": return s.armed
		"marked": return s.flags >= 1
		"fetch": return s.flags >= 1 and s.chests < 1
		"bomb": return s.bombs >= 1
		"golden": return s.goldens >= 1
		"chest": return s.chests >= 1
		"clock": return s.warn_stage >= 1
	return false


## LE BEAT A MONTRER POUR UN ETAT : LE DERNIER dont la condition tient.
##
## L'ordre dans la liste est l'ordre d'enseignement, qui est aussi l'ordre dans
## lequel l'ile les fait arriver — donc « le dernier qui tient » est « la
## derniere chose que tu viens de faire ».
##
## Rend une chaine vide quand aucun ne tient, ce que l'appelant lit comme « pas
## de bandeau ».
static func beat(s: State) -> Dictionary:
	var found: Dictionary = {}
	for b in BEATS:
		if _holds(b["id"], s):
			found = b
	return found


static func beat_id(s: State) -> String:
	var b := beat(s)
	return b.get("id", "")
