class_name Flag
## LES DRAPEAUX DU SELECTEUR DE LANGUE, dessines au pixel.
##
## C'etaient des emoji (« 🇫🇷 », deux lettres regionales), peints par la face
## emoji du systeme. Dans le navigateur, Godot n'a AUCUNE face systeme : la
## paire sortait en « FR » dans des carres (export web, 2026-09-25). Une
## texture ne depend de rien, et elle est dans le style du jeu.
##
## 11 x 7, une lettre par pixel ; mis a l'echelle au plus proche.

const ART := {
	"en": [
		"bbrwbrbwrbb",
		"rbbwwrwwbbr",
		"wwwwwrwwwww",
		"rrrrrrrrrrr",
		"wwwwwrwwwww",
		"rbbwwrwwbbr",
		"bbrwbrbwrbb",
	],
	"fr": [
		"bbbbwwwwrrr",
		"bbbbwwwwrrr",
		"bbbbwwwwrrr",
		"bbbbwwwwrrr",
		"bbbbwwwwrrr",
		"bbbbwwwwrrr",
		"bbbbwwwwrrr",
	],
	"zh": [
		"RRYRRRRRRRR",
		"RYYYRYRRRRR",
		"RRYRRRRRRRR",
		"RYRYRYRRRRR",
		"RRRRRRRRRRR",
		"RRRRRRRRRRR",
		"RRRRRRRRRRR",
	],
	"pt-BR": [
		"ggggggggggg",
		"ggggyyygggg",
		"gggyyBByygg",
		"ggyyBBBBygg",
		"gggyyBByygg",
		"ggggyyygggg",
		"ggggggggggg",
	],
}

const INK := {
	"b": Color("#1f3a8a"),
	"w": Color("#f4f1e6"),
	"r": Color("#c8202e"),
	"R": Color("#d92b1f"),
	"Y": Color("#ffd23f"),
	"g": Color("#1f9447"),
	"y": Color("#f7d117"),
	"B": Color("#23408e"),
}

static var _cache := {}


static func texture(code: String) -> Texture2D:
	if _cache.has(code):
		return _cache[code]
	var rows: Array = ART.get(code, ART["en"])
	var img := Image.create(rows[0].length(), rows.size(), false, Image.FORMAT_RGBA8)
	for y in rows.size():
		var row: String = rows[y]
		for x in row.length():
			img.set_pixel(x, y, INK[row[x]])
	var tex := ImageTexture.create_from_image(img)
	_cache[code] = tex
	return tex


## Le drapeau a une hauteur donnee, net au pixel.
static func rect(code: String, height: float) -> TextureRect:
	var r := Kit.icon(texture(code), height)
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	return r
