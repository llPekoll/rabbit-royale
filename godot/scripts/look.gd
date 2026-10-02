class_name Look
## L'APPARENCE D'UN LAPIN : la planche que tout le monde lui voit porter — sur
## l'ile, dans son terrier, chez un autre pendant un raid, sur le podium.
##
## UNE SEULE REGLE, decidee par le serveur (lib/game/look.ts) : le skin porte,
## sinon le pelage choisi au profil (`players.avatar`), sinon le brun. Le
## serveur l'envoie sous `look` ; ce fichier ne fait que la peindre. Avant
## (2026-10-02), l'ile peignait un lapin selon son siege d'arrivee et le
## terrier le peignait toujours blanc : la couleur choisie ne se voyait que
## dans le profil.

## Le pelage de qui n'a jamais choisi (avatars.ts DEFAULT_AVATAR).
const DEFAULT := "brown"


## La planche d'une cle : un skin (Kit.SKINS), un pelage (Kit.AVATARS), ou le
## brun — jamais un trou.
static func sheet(key: Variant) -> Texture2D:
	var k := str(key) if key is String else ""
	if Kit.SKINS.has(k):
		return Kit.SKINS[k]
	if Kit.AVATARS.has(k):
		return Kit.AVATARS[k]
	return Kit.AVATARS[DEFAULT]


## L'apparence d'un lapin ou d'un joueur tel que le serveur l'ecrit. Une
## reponse sans `look` (un serveur plus ancien, une route qui ne la porte pas)
## est recomposee de `skin` et `avatar`, par la meme regle.
static func of(d: Dictionary) -> String:
	var v: Variant = d.get("look", null)
	if v is String and not String(v).is_empty():
		return v
	if d.has("equippedSkin"):
		var equipped: Variant = d["equippedSkin"]
		if equipped is String and Kit.SKINS.has(equipped):
			return equipped
		var fur: Variant = d.get("avatar", null)
		return String(fur) if fur is String and Kit.AVATARS.has(fur) else DEFAULT
	var skin := PassState.skin_in(d)
	if not skin.is_empty():
		return skin
	var a: Variant = d.get("avatar", null)
	return String(a) if a is String and Kit.AVATARS.has(a) else DEFAULT


## La mienne vient du choix sauvegarde. Posseder le ticket ne remplace pas
## une autre skin equipee : /api/pass decrit la possession, pas l'equipement.
static func mine() -> String:
	return Look.of(Session.player if not Session.player.is_empty() else Home.player)
