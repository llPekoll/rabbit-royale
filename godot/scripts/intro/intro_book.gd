class_name IntroBook
extends Control
## LES TROIS LIVRES (2026-10-15) — l'histoire et les regles en pages qu'on
## tourne. Le user a prefere le livre a la cinematique (supprimee) ; les
## livres sont devenus le lore (le vieux codex est mis de cote).
##
## LE LIVRE DE SHIRO (`shiro`) : la famille royale, Maman partie avec la
## maree, Kuro qui prend la Couronne, puis les regles de l'ile (lire les
## chiffres, le X, les coffres, le terrier). Donne au premier terrier, avant
## l'ile du tuto ; rejoue par HISTOIRE et le codex.
## LE JOURNAL DE KURO (`kuro`) : la blessure, le raid, la defense, le regret.
## Donne une fois au terrier au niveau 2, quand BURY s'ouvre.
## LE LIVRE DE LA MER (`sea`) : la mer parle — l'ile a plusieurs, la poussee,
## l'eclair, l'encre, et la promesse. Donne une fois au terrier a RAID_MIN,
## quand RAID s'ouvre, hors Solo. Les trois : `Chrome.maybe_books`.
##
## A GAUCHE LE TEXTE, A DROITE L'IMAGE : l'illustration (`shots/<final>.webp`,
## ou son provisoire) ou, sur les pages des regles, LA VRAIE ILE qui joue la
## regle dans un cadre (IntroStage dans un SubViewport). Une page jouee se
## rejoue en la touchant. On lit A SON RYTHME : toucher la page de droite
## tourne la page, celle de gauche revient ; les fleches font pareil.
##
## LE LIVRE PEINT (sprite sheets, a deposer) : sans art, le livre est dessine
## ici (cuir, pages, pli). Deposer `assets/intro/book/<livre>/book.json` +
## `open` + `turn` (.webp ou .png) le remplace par les rendus — voir
## art-source/intro-book-20261015/README.md pour le format. `--book-art=<dir>`
## essaie un dossier hors du projet sans rien deposer.
##
##   godot --path godot scenes/intro/intro_book.tscn -- --book=kuro   (ou sea)
##   godot --path godot scenes/intro/intro_book.tscn -- --page=7 --size=890x400
##   godot --path godot scenes/intro/intro_book.tscn -- --auto=5
##     (tourne seul : 5 s par page apres la fin de son geste — pour filmer)
##   godot --path godot scenes/intro/intro_book.tscn -- --book-at=3:1.5,8:4 --book-out=/tmp/b
##   godot --path godot -- --open=book-sea --book-end=6   (le ferme apres 6 s)

signal finished

## LES MARQUES « DEJA LU » (`seen`), une section par livre.
const PATH := "user://intro.cfg"

## LES PROVISOIRES : une image plein cadre (`art`), un buste (`bust`), la
## couronne. Ils cedent la place aux vraies illustrations deposees dans
## `FINAL_DIR` (`shots/<final>.webp`, art-source/intro-book-20261015/prompts.md).
const ART := {
	"shared": preload("res://assets/intro/shared.webp"),
	"burrow": preload("res://assets/intro/burrow.webp"),
	"wide": preload("res://assets/intro/island-wide.webp"),
}
const BUST := {
	"kuro-evil": preload("res://assets/intro/kuro-evil.webp"),
	"kuro-smirk": preload("res://assets/intro/kuro-smirk.webp"),
	"kuro-scheming": preload("res://assets/intro/kuro-scheming.webp"),
	"kuro-panic": preload("res://assets/intro/kuro-panic.webp"),
	"shiro-serene": preload("res://assets/intro/shiro-serene.webp"),
	"shiro-focused": preload("res://assets/intro/shiro-focused.webp"),
}
const CROWN := preload("res://assets/ui/crown.png")
const FINAL_DIR := "res://assets/intro/shots/"

## LES PAGES. `chapter` : la cle du titre qui ouvre un chapitre ; `lines` :
## les lignes de la page de gauche. Une cle sans point est celle du livre
## (`intro.<livre>.<id>`) : chaque livre a ses textes. `who` : qui dit une
## ligne ; l'image (`final`, `art`, `night`, `sea`, `bust`,
## `crown`) ou `live` (un geste d'IntroStage, la vraie ile).
##
## L'HISTOIRE (validee le 2026-10-15) : Shiro et Kuro sont freres, de la
## famille royale. La Couronne passe de parent a enfant ; Maman, la derniere
## reine, est entree dans la mer et la maree ne l'a pas rendue (on ne dit
## jamais si elle est morte). L'ile a une loi plus vieille : la Couronne va au
## terrier le plus riche — Kuro a tout pille en une nuit. Le joueur est du sang
## des rois, et il lit.
const SHIRO_PAGES: Array[Dictionary] = [
	{"cover": true},
	{"chapter": "ch1", "lines": ["island"], "live": "rise_carrot"},
	# La Couronne et le chateau AVANT la reine (2026-10-16, le user : « c'est
	# trop brut quand on arrive a la mer ») : la page coupee du script valide.
	{"lines": ["crown"], "final": "castle", "art": "wide", "crown": true},
	{"chapter": "ch2", "lines": ["queen"], "final": "tide", "art": "wide", "sea": true},
	{"chapter": "ch3", "lines": ["kuro", "kuroSays"], "final": "crown", "art": "burrow", "night": true,
		"bust": "kuro-smirk", "crown": true, "who": {"kuroSays": "KURO"}},
	{"chapter": "ch4", "lines": ["numbers"], "live": "numbers"},
	{"chapter": "ch5", "lines": ["bomb"], "live": "mark_bomb"},
	{"chapter": "ch6", "lines": ["throne"], "live": "chest", "play": true},
]
## LE JOURNAL DE KURO : la blessure, le raid fier, la defense, le regret.
## Shiro ecrit dans la marge (`who`).
const KURO_PAGES: Array[Dictionary] = [
	{"cover": true},
	{"chapter": "ch1", "lines": ["note", "day1"], "final": "day1", "art": "wide", "sea": true,
		"bust": "kuro-scheming", "who": {"note": "SHIRO"}},
	{"chapter": "ch2", "lines": ["raid"], "final": "raid-walk", "art": "shared", "night": true, "bust": "kuro-scheming"},
	{"chapter": "ch3", "lines": ["bombs"], "live": "kuro_bomb"},
	{"chapter": "ch4", "lines": ["axe"], "final": "raid-axe", "art": "burrow", "bust": "kuro-smirk"},
	{"chapter": "ch5", "lines": ["defend"], "final": "bury", "art": "burrow", "bust": "shiro-focused", "side": "left",
		"who": {"defend": "SHIRO"}},
	{"chapter": "ch6", "lines": ["king"], "final": "far-light", "art": "wide", "sea": true, "play": true},
]
## LE LIVRE DE LA MER : c'est elle qui parle, froide et vraie — le multi
## (partager l'ile, la poussee, l'eclair et l'encre) puis la promesse. Ses
## gestes sont joues par la vraie ile, a deux lapins.
const SEA_PAGES: Array[Dictionary] = [
	{"cover": true},
	{"chapter": "ch1", "lines": ["share"], "live": "two"},
	{"chapter": "ch2", "lines": ["push"], "live": "push"},
	{"chapter": "ch3", "lines": ["weapons"], "live": "bolt_bloop"},
	{"chapter": "ch4", "lines": ["promise"], "final": "promise", "art": "wide", "sea": true, "crown": true},
	{"chapter": "ch5", "lines": ["margin"], "final": "salt", "art": "wide", "sea": true, "bust": "shiro-focused",
		"side": "left", "who": {"margin": "SHIRO"}, "play": true},
]
## LES COUVERTURES ET LEURS CUIRS. `pic` : le buste sur la couverture (la mer
## n'a pas de visage : la couronne qu'elle a pretee).
const BOOKS := {
	"shiro": {"pages": SHIRO_PAGES, "title": "intro.book.shiro", "sub": "intro.book.shiroSub", "play": "intro.play",
		"pic": "shiro-serene", "leather": Color("#7a4e26"), "edge": Color("#33200e"), "ink": Palette.GOLD},
	"kuro": {"pages": KURO_PAGES, "title": "intro.book.kuro", "sub": "intro.book.kuroSub", "play": "intro.book.kuroGo",
		"pic": "kuro-smirk", "leather": Color("#3b2243"), "edge": Color("#14091a"), "ink": Color("#f05a4e")},
	"sea": {"pages": SEA_PAGES, "title": "intro.book.sea", "sub": "intro.book.seaSub", "play": "intro.book.go",
		"pic": "", "leather": Color("#1f4f58"), "edge": Color("#0a1f24"), "ink": Color("#9fe8dc")},
}
const NUMERALS := ["I", "II", "III", "IV", "V", "VI"]

const DESK := Color("#140d09")
const PAGE := Color("#f4e4c1")
const PAGE_EDGE := Color("#c9ad7f")
const FRAME := Color("#3b2212")
const NIGHT := Color(0.42, 0.42, 0.68)
## Le provisoire d'une page de mer : bleu-vert, lave.
const SEA := Color(0.5, 0.78, 0.86)
## Largeur / hauteur du livre ouvert (dessine ; le livre peint a la sienne).
const RATIO := 2.25
const TURN_S := 0.22
## Le fondu au noir a l'entree et a la sortie du livre.
const FADE_S := 0.45
## LA TAILLE MAX DU LIVRE SUR UN GRAND ECRAN, en part de la hauteur : le jeu
## est etire depuis 890x400, donc un navigateur plein ecran le voyait aussi
## gros qu'un telephone (2026-10-16, « full screen c'est trop gros, fais une
## taille max »). Le telephone, lui, le garde en grand.
const DESK_SEEN := 0.72
## Le SubViewport de l'ile rend a ce multiple du cadre : net, et le chrome de
## l'ile (MARK A BOMB) a l'echelle d'une vignette.
const LIVE_DENSITY := 1.6
const ART_DIR := "res://assets/intro/book/"
## LA COURBE DE LA PAGE : `bend` du book.json = de combien le papier descend
## contre la reliure et au bord exterieur (px de l'image), sur le profil de
## page_plate.gdshader. L'image s'y colle ; le texte de gauche la suit aussi.
## Sans `bend` : la courbe du premier livre peint (18,5 / 12,5).
const BEND := Vector2(18.5, 12.5)
const TEXT_BEND := 1.0
## LA FACE DE LA COUVERTURE (le grimoire) : logo, titre et sous-titre poses a
## plat dans `_face_view`, puis projetes sur les coins de la couverture
## (`cover_quads` du book.json, un quadrilatere par image de `open`) : ils
## suivent sa perspective, et la couverture qui se souleve.
const LOGO := preload("res://assets/ui/rr-logo-1x.webp")
const FACE_SIZE := Vector2i(450, 506)
const FACE_SHADER := """
shader_type canvas_item;
uniform mat3 hinv;
uniform vec2 frame = vec2(1.0);
void fragment() {
	vec3 q = hinv * vec3(UV * frame, 1.0);
	vec2 uv = q.xy / q.z;
	if (q.z <= 0.0 || any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
		COLOR = vec4(0.0);
	} else {
		COLOR = texture(TEXTURE, uv);
	}
}
"""
const BEND_SHADER := """
shader_type canvas_item;
uniform float page_x;
uniform float page_w = 1.0;
uniform float px = 1.0;
uniform float inner;
uniform float outer;
void vertex() {
	float x = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).x;
	// Page de gauche : la reliure est a droite.
	float u = 1.0 - clamp((x - page_x) / page_w, 0.0, 1.0);
	float a = pow(max(1.0 - u / 0.33, 0.0), 1.5) * inner;
	float b = pow(max((u - 0.7) / 0.3, 0.0), 1.3) * outer;
	VERTEX.y += round((a + b) * px);
}
"""
## L'image collee sur la page courbe, avec son cadre (page_plate.gdshader).
const PLATE := preload("res://shaders/page_plate.gdshader")

## Quel livre : `shiro`, `kuro` ou `sea`. A poser avant l'entree dans l'arbre.
var book := "shiro"
var _pages: Array[Dictionary] = SHIRO_PAGES
var _at := -1
var _turning := false
var _stage: IntroStage
var _live_view: SubViewport

var _desk: ColorRect
## LE FOND : la vraie ile en plan large, ses rais et ses ombres de nuages,
## rendue a la taille logique de l'ecran (890x400 au Seeker) puis etiree — le
## flou d'un fond, et le prix d'un petit ecran.
var _backdrop_view: SubViewport
var _backdrop: IntroStage
var _hid_chrome := false
var _book: Panel
var _cover: Panel
var _cover_title: Label
var _cover_sub: Label
var _cover_pic: TextureRect
var _face_view: SubViewport
var _face: TextureRect
var _left: Panel
var _right: Panel
var _spine: TextureRect
var _chapter: Label
var _text: Label
var _rule: Control
var _folio_l: Label
var _folio_r: Label
var _frame: Panel
## LE CADRE DE L'IMAGE : `_frame` est rendu a plat dans `_plate`, et
## `_plate_view` le pose sur la page en suivant sa courbe.
var _plate: SubViewport
var _plate_view: TextureRect
## Ou est `_frame` sur la page de droite (px de `_right`), a plat.
var _frame_rect := Rect2()
var _art: TextureRect
var _live_tex: TextureRect
var _bust: TextureRect
var _crown: TextureRect
var _leaf: Panel
var _leaf_pic: TextureRect
## La page qui ne tourne pas, photographiee : elle reste a sa place tant que
## la feuille n'est pas retombee dessus.
var _stay: TextureRect
var _prev: PlankButton
var _next: PlankButton
var _skip: PlankButton
var _play: PlankButton
var _hint: Label
## OU J'EN SUIS : un carre par double page, en bas — dores ceux qu'on a lus.
var _progress: Control
var _curtain: ColorRect
## Le livre se ferme : le chrome ne se cache plus.
var _closing := false
## Le fondu d'entree est passe : le livre est a l'ecran.
var _entered := false

## LE LIVRE PEINT : vide = dessine ici. Sinon `frame` (Vector2), `open` et
## `turn` ({tex, frames, fps, cols}), `left` / `right` / `title` / `view`
## (Rect2, en px de l'image). `view` = ce qui doit tenir a l'ecran (l'image a
## du vide autour du livre ouvert) ; `title` = ou le titre s'ecrit, a cote du
## livre ferme.
var _sheet := {}
## La hauteur ou le texte de la page doit tenir (un Label grandit au lieu de
## couper : sa propre taille ne dit pas s'il deborde).
var _text_room := 0.0
## LE CADRE SUIT LE LIVRE : `cover_view` (le livre ferme) sur la couverture,
## `view` (le livre ouvert) en lisant, et l'un glisse vers l'autre pendant
## l'ouverture. 0 = ferme, 1 = ouvert.
var _opened := 1.0
var _sheet_view: TextureRect
var _atlas: AtlasTexture

var _auto := 0.0
var _probes: Array = []
var _probe_out := "/tmp/book"
var _probes_done := 0


## Par-dessus TOUT : le terrier et le chrome vivent dans des CanvasLayers
## (20, 50, la visite a 100) — pose a la racine sans couche, le livre de Kuro
## s'ouvrait SOUS le terrier. Sous PressAck (120).
const LAYER := 105


static func play_on(host: Node, which := "shiro") -> IntroBook:
	var b: IntroBook = (load("res://scenes/intro/intro_book.tscn") as PackedScene).instantiate()
	b.book = which
	var layer := CanvasLayer.new()
	layer.name = "IntroBook"
	layer.layer = LAYER
	layer.add_child(b)
	host.get_tree().root.add_child.call_deferred(layer)
	return b


## DEJA LU ? Par appareil ET par joueur, les trois livres : un deuxieme compte
## sur le meme telephone les recoit. Shiro etait par appareil seulement
## (`[intro] seen`) — un nouveau compte PLAY sur un navigateur qui l'avait deja
## lu n'avait plus le livre 1 (2026-10-16).
static func seen(which: String) -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return false
	return bool(cfg.get_value(which, _reader(), false))


static func mark_seen(which: String) -> void:
	var cfg := ConfigFile.new()
	cfg.load(PATH)
	cfg.set_value(which, _reader(), true)
	cfg.save(PATH)


## L'illustration deposee pour `name`, ou rien.
static func final_art(name: String) -> Texture2D:
	if name.is_empty():
		return null
	var path := FINAL_DIR + name + ".webp"
	return load(path) as Texture2D if ResourceLoader.exists(path) else null


static func _reader() -> String:
	return "p_" + str(Session.player.get("id", "anon")) if Session.player is Dictionary else "p_anon"


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	Sound.host(self)
	var from := 0
	var art_dir := ART_DIR
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--book=") and get_tree().current_scene == self:
			book = arg.trim_prefix("--book=")
		if arg.begins_with("--book-art="):
			art_dir = arg.trim_prefix("--book-art=").trim_suffix("/") + "/"
		if arg.begins_with("--page="):
			from = int(arg.trim_prefix("--page="))
		if arg.begins_with("--auto="):
			_auto = float(arg.trim_prefix("--auto="))
		# `--book-end=<s>` : ferme le livre comme son dernier bouton apres s
		# secondes — pour voir ce qui suit (la traversee du livre de la mer).
		if arg.begins_with("--book-end="):
			get_tree().create_timer(float(arg.trim_prefix("--book-end="))).timeout.connect(_finish.bind(false))
		if arg.begins_with("--book-out="):
			_probe_out = arg.trim_prefix("--book-out=")
		if arg.begins_with("--book-at="):
			for pair in arg.trim_prefix("--book-at=").split(","):
				var kv := pair.split(":")
				if kv.size() == 2:
					_probes.append([int(kv[0]), float(kv[1])])
	if not BOOKS.has(book):
		book = "shiro"
	_pages = BOOKS[book].pages
	from = clampi(from, 0, _pages.size() - 1)
	_sheet = _load_sheet(art_dir)
	_build()
	get_viewport().size_changed.connect(_measure)
	if get_tree().current_scene == self:
		DevShot.arm(self)
	Analytics.track("intro_book_begin", {"book": book})
	# L'ENTREE EN FONDU (2026-10-16, « rajoute une petite transition ») : ce
	# qu'il y avait dessous passe au noir, puis le livre sort du noir — plus
	# de coupure seche de l'accueil (ou du terrier) au rideau.
	if get_tree().current_scene != self:
		visible = false
		var veil := _veil(0.0)
		await veil.ready
		await create_tween().tween_property(veil, "color:a", 1.0, FADE_S).finished
		visible = true
		veil.queue_free()
	_entered = true
	await get_tree().process_frame
	_measure()
	create_tween().tween_property(_curtain, "color:a", 0.0, 0.6)
	_show(from, 0)


# ── Le livre peint ──────────────────────────────────────────────────────────

## `<dir><livre>/book.json` + `open` ; `turn` peut manquer et se prend chez
## Shiro (une page qui tourne est une page qui tourne). Rien = livre dessine.
func _load_sheet(dir: String) -> Dictionary:
	var own := dir + book + "/"
	var spec: Variant = _read_json(own + "book.json")
	if not spec is Dictionary:
		return {}
	var out := {}
	var fs: Array = spec.get("frame", [0, 0])
	out.frame = Vector2(float(fs[0]), float(fs[1]))
	for anim in ["open", "turn"]:
		var tex := _read_tex(own + anim)
		if tex == null:
			tex = _read_tex(dir + "shiro/" + anim)
		var info: Dictionary = spec.get(anim, {})
		if tex == null or info.is_empty():
			push_warning("IntroBook: %s%s manque, livre dessine" % [own, anim])
			return {}
		var cols := int(info.get("cols", info.get("frames", 1)))
		out[anim] = {"tex": tex, "frames": int(info.get("frames", 1)), "fps": float(info.get("fps", 12)), "cols": maxi(cols, 1)}
	# `filter: linear` : une peinture (le grimoire) se lisse ; sans, le pixel
	# art reste net. `title_angle` : le titre penche comme la couverture.
	out.linear = String(spec.get("filter", "")) == "linear"
	out.title_angle = float(spec.get("title_angle", 0.0))
	var bend: Array = spec.get("bend", [])
	out.bend = Vector2(float(bend[0]), float(bend[1])) if bend.size() == 2 else BEND
	out.cover_quads = spec.get("cover_quads", [])
	for side in ["left", "right", "title", "view", "cover_view"]:
		var r: Array = spec.get(side, [])
		if r.size() == 4:
			out[side] = Rect2(float(r[0]), float(r[1]), float(r[2]), float(r[3]))
	if not (out.has("left") and out.has("right")) or out.frame.x <= 0.0:
		push_warning("IntroBook: %sbook.json sans frame/left/right, livre dessine" % own)
		return {}
	return out


static func _read_json(path: String) -> Variant:
	if path.begins_with("res://"):
		if not ResourceLoader.exists(path):
			return null
		return (load(path) as JSON).data
	if not FileAccess.file_exists(path):
		return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))


static func _read_tex(stem: String) -> Texture2D:
	for ext in [".webp", ".png"]:
		var path: String = stem + ext
		if path.begins_with("res://"):
			if ResourceLoader.exists(path):
				return load(path)
		elif FileAccess.file_exists(path):
			var img := Image.load_from_file(path)
			if img != null:
				return ImageTexture.create_from_image(img)
	return null


func _sheet_frame(anim: String, i: int) -> void:
	var a: Dictionary = _sheet[anim]
	var fs: Vector2 = _sheet.frame
	var n := clampi(i, 0, int(a.frames) - 1)
	_atlas.atlas = a.tex
	_atlas.region = Rect2(Vector2(n % int(a.cols), n / int(a.cols)) * fs, fs)
	_place_face(anim, n)


## La face a plat : le logo des lapins, le titre et sa ligne du livre ouvert.
func _build_face(look: Dictionary) -> void:
	_face_view = SubViewport.new()
	_face_view.transparent_bg = true
	_face_view.size = FACE_SIZE
	_face_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_face_view)
	var logo := TextureRect.new()
	logo.texture = LOGO
	logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	logo.size = Vector2(210, 210)
	logo.position = Vector2((FACE_SIZE.x - 210) * 0.5, 46)
	# Imprime dans le cuir, pas colle dessus : un peu chaud, un peu passe.
	logo.self_modulate = Color(1.0, 0.93, 0.8, 0.96)
	_face_view.add_child(logo)
	for l: Label in [_cover_title, _cover_sub]:
		l.get_parent().remove_child(l)
		_face_view.add_child(l)
		l.visible = true
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.rotation = 0.0
	_cover_title.add_theme_font_size_override("font_size", 46)
	_cover_title.add_theme_constant_override("shadow_offset_y", 3)
	_cover_title.position = Vector2(24, 270)
	_cover_title.size = Vector2(FACE_SIZE.x - 48, 0)
	_cover_sub.add_theme_font_size_override("font_size", 24)
	_cover_sub.add_theme_color_override("font_shadow_color", look.edge)
	_cover_sub.add_theme_constant_override("shadow_offset_y", 2)
	_cover_sub.size = Vector2(FACE_SIZE.x - 64, 0)
	(func() -> void:
		_cover_sub.position = Vector2(32, 270 + _cover_title.get_minimum_size().y + 10)).call_deferred()
	_face = TextureRect.new()
	_face.texture = _face_view.get_texture()
	_face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_face.stretch_mode = TextureRect.STRETCH_SCALE
	_face.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = Shader.new()
	mat.shader.code = FACE_SHADER
	mat.set_shader_parameter("frame", _sheet.frame)
	_face.material = mat
	_book.add_child(_face)
	_book.move_child(_face, _sheet_view.get_index() + 1)


## La face sur la couverture de cette image de `open` (cachee ailleurs) : le
## carre de la face envoye sur ses quatre coins (Heckbert, carre -> quad), et
## le shader recoit l'inverse.
func _place_face(anim: String, n: int) -> void:
	if _face == null:
		return
	var quads: Array = _sheet.cover_quads
	var q: Variant = quads[n] if anim == "open" and n < quads.size() else null
	_face.visible = q != null
	if q == null:
		return
	(_face.material as ShaderMaterial).set_shader_parameter("hinv", face_hinv(q, Vector2.ZERO))


## L'inverse de la projection carre -> quad (Heckbert) que FACE_SHADER lit.
## `origin` : le coin de l'image affichee dans le repere des coins (l'etagere
## du codex recadre la couverture).
static func face_hinv(q: Array, origin: Vector2) -> Basis:
	var x0: float = q[0] - origin.x; var y0: float = q[1] - origin.y
	var x1: float = q[2] - origin.x; var y1: float = q[3] - origin.y
	var x2: float = q[4] - origin.x; var y2: float = q[5] - origin.y
	var x3: float = q[6] - origin.x; var y3: float = q[7] - origin.y
	var dx1 := x1 - x2; var dx2 := x3 - x2; var dx3 := x0 - x1 + x2 - x3
	var dy1 := y1 - y2; var dy2 := y3 - y2; var dy3 := y0 - y1 + y2 - y3
	var g := 0.0
	var h := 0.0
	if absf(dx3) > 0.0001 or absf(dy3) > 0.0001:
		var den := dx1 * dy2 - dx2 * dy1
		g = (dx3 * dy2 - dx2 * dy3) / den
		h = (dx1 * dy3 - dx3 * dy1) / den
	# Les colonnes de la matrice [a b c; d e f; g h 1].
	var m := Basis(Vector3(x1 - x0 + g * x1, y1 - y0 + g * y1, g),
		Vector3(x3 - x0 + h * x3, y3 - y0 + h * y3, h), Vector3(x0, y0, 1.0))
	return m.inverse()


func _exit_tree() -> void:
	_show_chrome()


## LE VOILE DES FONDUS, un noir a cote du livre (meme couche, dessus) :
## fondre le livre lui-meme laissait voir l'ile du fond a travers l'accueil.
func _veil(alpha: float) -> ColorRect:
	var veil := ColorRect.new()
	veil.color = Color(0, 0, 0, alpha)
	veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_STOP
	# Differe : pendant le `_ready` du livre, sa couche est encore occupee a
	# l'ajouter, et un `add_child` direct y echoue.
	get_parent().add_child.call_deferred(veil)
	return veil


func _hide_chrome() -> void:
	while not _entered and is_inside_tree():
		await get_tree().process_frame
	if is_inside_tree() and not _closing and Chrome.current != null and Chrome.current.visible:
		Chrome.current.visible = false
		_hid_chrome = true


func _show_chrome() -> void:
	if _hid_chrome and Chrome.current != null and is_instance_valid(Chrome.current):
		Chrome.current.visible = true
	_hid_chrome = false


## LE FOND DE PRES : le plan large montre l'ile entiere au milieu, donc
## cachee par le livre. Plus pres, son herbe deborde tout autour. Et il
## respire : un zoom tres lent, aller et retour, qui glisse un peu.
const BACKDROP_ZOOM := 1.7
const DRIFT_ZOOM := 0.18
const DRIFT_PAN := Vector2(-36.0, -14.0)
const DRIFT_S := 40.0

var _drift: Tween
var _drift_base := Vector2.ZERO
var _drift_scale := Vector2.ONE


## LE CHEMIN DU COMPTEUR : une carotte par double page jusqu'a la couronne
## (la derniere). Lues : en couleur ; a venir : en ombre ; celle qu'on lit
## sautille. Les pointilles se dorent derriere le lecteur.
var _bob := 0.0


func _draw_progress() -> void:
	var n := _pages.size() - 1
	if n <= 0 or _at <= 0:
		return
	var icon := 16.0
	var now := 22.0
	var link := 22.0
	var width := (n - 1) * (icon + link) + now
	var x := (_progress.size.x - width) * 0.5
	var mid := _progress.size.y * 0.5
	for i in range(1, n + 1):
		var side := now if i == _at else icon
		var last := i == n
		var tex: Texture2D = CROWN if last else Kit.ICONS["carrot"]
		var hop := -absf(sin(_bob)) * 4.0 if i == _at else 0.0
		var r := Rect2(x, mid - side * 0.5 + hop, side, side)
		var tint := Color.WHITE if i <= _at else Color(0.16, 0.11, 0.09, 0.85)
		_progress.draw_texture_rect(tex, r, false, tint)
		if i < n:
			# Les pointilles jusqu'a la suivante : dores si on l'a deja passee.
			var dot := Palette.GOLD if i < _at else Color(Palette.CHALK_DIM, 0.55)
			var from := x + side + 4.0
			for d in range(3):
				_progress.draw_rect(Rect2(from + d * 6.0, mid - 1.0, 3.0, 2.0), dot)
		x += side + link


func _frame_backdrop() -> void:
	if _backdrop == null or _backdrop.island == null:
		return
	_backdrop.go_wide(0.0)
	var isl := _backdrop.island
	var c := Vector2(_backdrop_view.size) * 0.5
	isl.position = c + (isl.position - c) * BACKDROP_ZOOM
	isl.scale *= BACKDROP_ZOOM
	# Rien qui attire l'oeil hors du livre : ni rochers ni canards.
	isl._ocean.rocks.visible = false
	isl._ocean.ducks.visible = false
	_drift_base = isl.position
	_drift_scale = isl.scale
	if _drift != null and _drift.is_valid():
		_drift.kill()
	_drift = create_tween().set_loops()
	_drift.tween_method(_drift_to, 0.0, 1.0, DRIFT_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_drift.tween_method(_drift_to, 1.0, 0.0, DRIFT_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _drift_to(t: float) -> void:
	if _backdrop == null or _backdrop.island == null:
		return
	var c := Vector2(_backdrop_view.size) * 0.5
	var k := 1.0 + DRIFT_ZOOM * t
	_backdrop.island.scale = _drift_scale * k
	_backdrop.island.position = c + (_drift_base - c) * k + DRIFT_PAN * t


## Le cadre glisse du livre ferme au livre ouvert (ou l'inverse) pendant que
## la bande joue.
func _reframe_to(to: float, anim: Dictionary) -> void:
	if not _sheet.has("cover_view"):
		_opened = to
		return
	create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT).tween_method(
		func(v: float) -> void:
			_opened = v
			_measure(), _opened, to, float(anim.frames) / float(anim.fps))


## Joue une bande, a l'endroit ou a l'envers, et attend sa fin.
func _sheet_play(anim: String, backwards: bool) -> void:
	var a: Dictionary = _sheet[anim]
	var last := float(int(a.frames) - 1)
	var t := create_tween()
	t.tween_method(func(f: float) -> void: _sheet_frame(anim, roundi(f)),
		last if backwards else 0.0, 0.0 if backwards else last, float(a.frames) / float(a.fps))
	await t.finished


# ── La construction ─────────────────────────────────────────────────────────

func _box(bg: Color, edge: Color, border: int, radius: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = edge
	s.set_border_width_all(border)
	s.set_corner_radius_all(radius)
	return s


func _panel(style: StyleBox) -> Panel:
	var p := Panel.new()
	p.add_theme_stylebox_override("panel", style)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


func _ink(size: int, color: Color = Palette.INK) -> Label:
	var l := Kit.label("", size, color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _build() -> void:
	var look: Dictionary = BOOKS[book]
	var painted := not _sheet.is_empty()
	# Par-dessus le jeu (le terrier), le vrai monde sert de fond : une deuxieme
	# ile la-dessous faisait tomber le Seeker a 42 i/s. Sur l'accueil, rien
	# derriere : l'ile du fond.
	if Screens.in_world():
		# Le terrier reste derriere le voile, mais pas ses quetes ni ses
		# boutons : l'oeil reste sur le livre. Rendu a la fermeture.
		# Cache sous le noir de l'entree (`_hide_chrome`), pas avant : le
		# fondu ne doit pas le voir disparaitre d'un coup.
		_hide_chrome.call_deferred()
	else:
		_backdrop_view = SubViewport.new()
		_backdrop_view.transparent_bg = false
		_backdrop_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		_backdrop_view.size = Vector2i(get_viewport_rect().size)
		add_child(_backdrop_view)
		_backdrop = IntroStage.new()
		_backdrop_view.add_child(_backdrop)
		_frame_backdrop.call_deferred()
		var backdrop := TextureRect.new()
		backdrop.texture = _backdrop_view.get_texture()
		backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
		backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		backdrop.stretch_mode = TextureRect.STRETCH_SCALE
		backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(backdrop)
	# Le bureau ne fait plus que voiler l'ile : assez sombre pour que l'oeil
	# reste sur le livre.
	_desk = ColorRect.new()
	_desk.color = Color(DESK, 0.62)
	_desk.set_anchors_preset(Control.PRESET_FULL_RECT)
	_desk.mouse_filter = Control.MOUSE_FILTER_STOP
	_desk.gui_input.connect(_on_input)
	add_child(_desk)

	# L'ILE DES PAGES JOUEES, rendue hors ecran et posee dans le cadre.
	_live_view = SubViewport.new()
	_live_view.transparent_bg = false
	_live_view.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_live_view)
	_stage = IntroStage.new()
	_stage.zoom = 1.45
	_live_view.size = Vector2i(760, 520)
	_live_view.add_child(_stage)

	var leather := _box(look.leather, look.edge, 4, 12)
	leather.shadow_color = Color(0, 0, 0, 0.55)
	leather.shadow_size = 14
	_book = _panel(StyleBoxEmpty.new() if painted else leather)
	add_child(_book)
	if painted:
		_atlas = AtlasTexture.new()
		_sheet_view = TextureRect.new()
		_sheet_view.texture = _atlas
		_sheet_view.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if _sheet.linear \
			else CanvasItem.TEXTURE_FILTER_NEAREST
		_sheet_view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_sheet_view.stretch_mode = TextureRect.STRETCH_SCALE
		_sheet_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_book.add_child(_sheet_view)
		_sheet_frame("open", 0)

	var page_style: StyleBox = StyleBoxEmpty.new() if painted else _box(PAGE, PAGE_EDGE, 1, 4)
	_left = _panel(page_style)
	_right = _panel(page_style)
	_book.add_child(_left)
	_book.add_child(_right)

	# LE CREUX DE LA RELIURE : une ombre qui fond des deux cotes.
	var grad := Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 0.42, 0.5, 0.58, 1.0])
	grad.colors = PackedColorArray([Color(0, 0, 0, 0), Color(0.2, 0.1, 0.03, 0.22), Color(0.12, 0.06, 0.02, 0.5),
		Color(0.2, 0.1, 0.03, 0.22), Color(0, 0, 0, 0)])
	var gt := GradientTexture2D.new()
	gt.gradient = grad
	gt.width = 64
	gt.height = 4
	_spine = TextureRect.new()
	_spine.texture = gt
	_spine.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_spine.stretch_mode = TextureRect.STRETCH_SCALE
	_spine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spine.visible = not painted
	_book.add_child(_spine)

	_chapter = _ink(17)
	_chapter.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_left.add_child(_chapter)
	# Le trait sous le chapitre, en tirets de 2 px colles : un seul rectangle
	# n'a que quatre coins et resterait droit sur la page courbe.
	_rule = Control.new()
	_rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rule.draw.connect(func() -> void:
		var x := 0.0
		while x < _rule.size.x:
			_rule.draw_rect(Rect2(x, 0.0, minf(2.0, _rule.size.x - x), _rule.size.y), Color(PAGE_EDGE, 0.9))
			x += 2.0)
	_rule.resized.connect(_rule.queue_redraw)
	_left.add_child(_rule)
	_text = _ink(17)
	_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_text.add_theme_constant_override("line_spacing", 4)
	_left.add_child(_text)
	_folio_l = _ink(11, Palette.BARK)
	if painted:
		var bent := ShaderMaterial.new()
		bent.shader = Shader.new()
		bent.shader.code = BEND_SHADER
		_left.material = bent
		for c: CanvasItem in [_chapter, _rule, _text, _folio_l]:
			c.use_parent_material = true
	_folio_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_left.add_child(_folio_l)
	_folio_r = _ink(11, Palette.BARK)
	_folio_r.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_right.add_child(_folio_r)

	_plate = SubViewport.new()
	_plate.transparent_bg = false
	_plate.gui_disable_input = true
	_plate.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_plate)
	_frame = _panel(_box(Color("#0e0a07"), FRAME, 0, 0))
	_frame.clip_contents = true
	_plate.add_child(_frame)
	_plate_view = TextureRect.new()
	_plate_view.texture = _plate.get_texture()
	_plate_view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_plate_view.stretch_mode = TextureRect.STRETCH_SCALE
	_plate_view.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_plate_view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = PLATE
	_plate_view.material = mat
	_right.add_child(_plate_view)
	_right.move_child(_plate_view, 0)
	_art = TextureRect.new()
	_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_art)
	_live_tex = TextureRect.new()
	_live_tex.texture = _live_view.get_texture()
	_live_tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_live_tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_live_tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_live_tex.visible = false
	_frame.add_child(_live_tex)
	_bust = TextureRect.new()
	_bust.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bust.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
	_bust.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_bust)
	_crown = TextureRect.new()
	_crown.texture = CROWN
	_crown.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_crown.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_crown.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_crown.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_crown)

	# LA COUVERTURE, par-dessus les pages tant que le livre est ferme. Peinte,
	# elle n'est que son titre (la planche 0 de `open` est le cuir).
	_cover = _panel(StyleBoxEmpty.new() if painted else _box(look.leather, look.edge, 4, 12))
	_book.add_child(_cover)
	_cover_pic = TextureRect.new()
	var pic := String(look.pic)
	_cover_pic.texture = CROWN if pic.is_empty() else BUST[pic]
	if pic.is_empty():
		_cover_pic.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_cover_pic.self_modulate = look.ink
	_cover_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_cover_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_cover_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cover_pic.visible = not painted
	_cover.add_child(_cover_pic)
	_cover_title = _ink(26, look.ink)
	_cover_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cover_title.add_theme_color_override("font_shadow_color", look.edge)
	_cover_title.add_theme_constant_override("shadow_offset_y", 2)
	_cover.add_child(_cover_title)
	_cover_sub = _ink(14, Palette.PARCHMENT)
	_cover_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_cover.add_child(_cover_sub)
	if painted and not _sheet.has("title"):
		_cover_title.visible = false
		_cover_sub.visible = false
	if painted and not (_sheet.cover_quads as Array).is_empty():
		_build_face(look)

	# LA FEUILLE QUI TOURNE (livre dessine) : la page d'avant, photographiee,
	# qui se replie sur la reliure.
	_leaf = _panel(_box(PAGE, PAGE_EDGE, 1, 4))
	_leaf.visible = false
	_leaf.clip_contents = true
	_book.add_child(_leaf)
	_leaf_pic = TextureRect.new()
	_leaf_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_leaf_pic.stretch_mode = TextureRect.STRETCH_SCALE
	_leaf_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_leaf.add_child(_leaf_pic)
	_stay = TextureRect.new()
	_stay.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_stay.stretch_mode = TextureRect.STRETCH_SCALE
	_stay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stay.visible = false
	_book.add_child(_stay)
	_book.move_child(_stay, _leaf.get_index())

	# Des fleches a la taille d'un pouce (le Seeker couche) : a cote du livre,
	# elles ont la place.
	_prev = Kit.button("<", "wood", 88.0, 64.0)
	_prev.label_size = 32
	_prev.pressed.connect(func() -> void: _turn(-1))
	add_child(_prev)
	_next = Kit.button(">", "wood", 88.0, 64.0)
	_next.label_size = 32
	_next.pressed.connect(func() -> void: _turn(1))
	add_child(_next)
	_skip = Kit.button(I18N.t("intro.skip"), "wood", 108.0, 32.0)
	_skip.pressed.connect(_finish.bind(true))
	add_child(_skip)
	_play = Kit.button(I18N.t(look.play), "gold", 180.0, 42.0)
	_play.pressed.connect(_finish.bind(false))
	_play.visible = false
	add_child(_play)
	_hint = _ink(11, Palette.CHALK_DIM)
	_hint.text = I18N.t("intro.next")
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_hint)
	_progress = Control.new()
	_progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_progress.draw.connect(_draw_progress)
	add_child(_progress)
	var hop := create_tween().set_loops()
	hop.tween_method(func(v: float) -> void:
		_bob = v
		_progress.queue_redraw(), 0.0, TAU, 1.4)

	_curtain = ColorRect.new()
	_curtain.color = Color.BLACK
	_curtain.set_anchors_preset(Control.PRESET_FULL_RECT)
	_curtain.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_curtain)

	_cover_title.text = I18N.t(look.title)
	_cover_sub.text = I18N.t(look.sub)
	I18N.apply_face([_chapter, _text, _folio_l, _folio_r, _cover_title, _cover_sub, _hint, _skip, _play])


## La hauteur visible permise : tout l'ecran sur un telephone, `DESK_SEEN`
## ailleurs.
static func _max_seen_h(view: Vector2) -> float:
	var phone := OS.has_feature("mobile") or OS.has_feature("web_android") or OS.has_feature("web_ios")
	return view.y if phone else view.y * DESK_SEEN


func _measure() -> void:
	if not is_inside_tree():
		return
	var view := get_viewport_rect().size
	if _backdrop_view != null and _backdrop_view.size != Vector2i(view):
		_backdrop_view.size = Vector2i(view)
		_frame_backdrop.call_deferred()
	var painted := not _sheet.is_empty()
	var ratio := RATIO
	if painted:
		ratio = _sheet.frame.x / _sheet.frame.y
	var w := minf(view.x - 24.0, (minf(view.y, _max_seen_h(view) + 46.0) - 46.0) * ratio)
	var h := w / ratio
	_book.size = Vector2(w, h)
	_book.position = Vector2((view.x - w) * 0.5, (view.y - h) * 0.5 - 6.0)
	# Ce qui se voit du livre : l'image entiere, ou seulement `view` (le vide
	# autour du livre peint peut deborder de l'ecran).
	var seen := Rect2(_book.position, _book.size)
	if painted and _sheet.has("view"):
		var v: Rect2 = _sheet.view
		if _sheet.has("cover_view"):
			var cv: Rect2 = _sheet.cover_view
			v = Rect2(cv.position.lerp(v.position, _opened), cv.size.lerp(v.size, _opened))
		# Les fleches sont a cote du livre (pas dessous) : la hauteur ne garde
		# que la ligne d'aide, la largeur leur fait place.
		var aside := (_prev.custom_minimum_size.x + 12.0 + Kit.EDGE) * 2.0
		var kv := minf((view.x - aside) / v.size.x, minf(view.y - 34.0, _max_seen_h(view)) / v.size.y)
		w = _sheet.frame.x * kv
		h = _sheet.frame.y * kv
		_book.size = Vector2(w, h)
		_book.position = (view - v.size * kv) * 0.5 - v.position * kv - Vector2(0, 6.0)
		seen = Rect2(_book.position + v.position * kv, v.size * kv)
	var pad := 9.0
	var half := (w - pad * 2.0) * 0.5
	if painted:
		# Les pages sont ou l'image les a peintes.
		var k := w / float(_sheet.frame.x)
		_sheet_view.position = Vector2.ZERO
		_sheet_view.size = Vector2(w, h)
		if _face != null:
			_face.position = Vector2.ZERO
			_face.size = Vector2(w, h)
		var l: Rect2 = _sheet.left
		var r: Rect2 = _sheet.right
		_left.position = l.position * k
		_left.size = l.size * k
		_right.position = r.position * k
		_right.size = r.size * k
		half = _right.size.x
	else:
		_left.position = Vector2(pad, pad)
		_left.size = Vector2(half, h - pad * 2.0)
		_right.position = Vector2(pad + half, pad)
		_right.size = Vector2(half, h - pad * 2.0)
	_spine.size = Vector2(40.0, h - pad * 2.0)
	_spine.position = Vector2(pad + half - 20.0, pad)
	_cover.position = Vector2.ZERO
	_cover.size = Vector2(w, h)

	if _left.material is ShaderMaterial:
		var bent := _left.material as ShaderMaterial
		bent.set_shader_parameter("page_x", _left.global_position.x)
		bent.set_shader_parameter("page_w", _left.size.x)
		bent.set_shader_parameter("px", w / float(_sheet.frame.x) * TEXT_BEND)
		bent.set_shader_parameter("inner", _sheet.bend.x)
		bent.set_shader_parameter("outer", _sheet.bend.y)
	var m := maxf(18.0, half * 0.07)
	var page := _left.size
	_chapter.position = Vector2(m, m * 0.8)
	_chapter.size = Vector2(page.x - m * 2.0, 0)
	var top := m * 0.8 + _chapter.get_combined_minimum_size().y + 8.0
	_rule.position = Vector2(m, top)
	_rule.size = Vector2(page.x - m * 2.0, 2.0)
	_rule.visible = not _chapter.text.is_empty()
	top += 10.0
	_text.position = Vector2(m, top)
	_text_room = page.y - top - 34.0
	_text.size = Vector2(page.x - m * 2.0, _text_room)
	if is_inside_tree() and not _text.text.is_empty():
		_fit_text.call_deferred()
	_folio_l.position = Vector2(0, page.y - 22.0)
	_folio_l.size = Vector2(page.x, 16.0)
	_folio_r.position = Vector2(0, _right.size.y - 22.0)
	_folio_r.size = Vector2(_right.size.x, 16.0)

	var rp := _right.size
	_frame_rect = Rect2(m * 0.8, m * 0.8, rp.x - m * 1.6, rp.y - m * 0.8 - 30.0)
	_frame.position = Vector2.ZERO
	_frame.size = _frame_rect.size
	var f := _frame.size
	var fi := Vector2i(f.round())
	if fi.x > 8 and _plate.size != fi:
		_plate.size = fi
	# La page peinte est courbe : l'image la suit, au pixel du livre. Le livre
	# dessine est plat, son cadre a des pixels de 2.
	var px := w / float(_sheet.frame.x) if painted else 2.0
	var curve: Vector2 = _sheet.bend if painted else Vector2.ZERO
	var sag := ceilf(curve.x)
	_plate_view.position = _frame_rect.position - Vector2(px, px) * 2.0
	_plate_view.size = f + Vector2(px * 4.0, px * (4.0 + sag))
	var mat := _plate_view.material as ShaderMaterial
	mat.set_shader_parameter("origin", _plate_view.position)
	mat.set_shader_parameter("size", _plate_view.size)
	mat.set_shader_parameter("page", rp)
	mat.set_shader_parameter("plate", Vector4(_frame_rect.position.x, _frame_rect.position.y, f.x, f.y))
	mat.set_shader_parameter("px", px)
	mat.set_shader_parameter("inner", curve.x)
	mat.set_shader_parameter("outer", curve.y)
	_art.position = Vector2.ZERO
	_art.size = f
	_art.pivot_offset = f * 0.5
	_live_tex.position = Vector2.ZERO
	_live_tex.size = f
	var want := Vector2i(roundi(f.x * LIVE_DENSITY), roundi(f.y * LIVE_DENSITY))
	if want.x > 8 and _live_view.size != want:
		_live_view.size = want
	var b := minf(f.y * 0.82, f.x * 0.62)
	_bust.size = Vector2(b, b)
	var spread := _pages[clampi(_at, 0, _pages.size() - 1)]
	var left_side := String(spread.get("side", "right")) == "left"
	_bust.position = Vector2(4.0 if left_side else f.x - b - 4.0, f.y - b + b * 0.04)
	var c := b * 0.42
	_crown.size = Vector2(c, c)
	_crown.position = _bust.position + Vector2((b - c) * 0.5 - b * 0.04, -c * 0.32 + 6.0)

	if painted and _sheet.has("title") and _face == null:
		var k := w / float(_sheet.frame.x)
		# Le titre et sa ligne, centres dans `title` et coupes a sa largeur :
		# la police ne retrecit pas avec le livre.
		var tr: Rect2 = _sheet.title
		for l: Label in [_cover_title, _cover_sub]:
			l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			l.size = Vector2(tr.size.x * k, 0)
		var th := _cover_title.get_minimum_size().y
		var sh := _cover_sub.get_minimum_size().y
		var y0 := tr.get_center().y * k - (th + 8.0 + sh) * 0.5
		_cover_title.position = Vector2(tr.position.x * k, y0)
		_cover_sub.position = Vector2(tr.position.x * k, y0 + th + 8.0)
		# Penches ensemble autour du centre de `title`.
		var pivot := tr.get_center() * k
		for l: Label in [_cover_title, _cover_sub]:
			l.pivot_offset = pivot - l.position
			l.rotation_degrees = _sheet.title_angle
	elif _face == null:
		_cover_pic.size = Vector2(h * 0.36, h * 0.36)
		_cover_pic.position = Vector2((w - _cover_pic.size.x) * 0.5, h * 0.08)
		_cover_title.position = Vector2(0, h * 0.5)
		_cover_title.size = Vector2(w, 34)
		_cover_sub.position = Vector2(0, h * 0.5 + 40.0)
		_cover_sub.size = Vector2(w, 20)

	_prev.size = _prev.custom_minimum_size
	_next.size = _next.custom_minimum_size
	if painted:
		# Le livre peint laisse de la place a cote : les fleches de part et
		# d'autre, a mi-hauteur.
		var mid := seen.get_center().y
		_prev.position = Vector2(maxf(Kit.EDGE, seen.position.x - _prev.size.x - 12.0), mid - _prev.size.y * 0.5)
		_next.position = Vector2(minf(view.x - _next.size.x - Kit.EDGE, seen.end.x + 12.0), mid - _next.size.y * 0.5)
	else:
		var under := seen.end.y
		_prev.position = Vector2(seen.position.x + 4.0, under - _prev.size.y * 0.5)
		_next.position = Vector2(seen.end.x - _next.size.x - 4.0, under - _next.size.y * 0.5)
	_skip.size = _skip.custom_minimum_size
	_skip.position = Vector2(view.x - _skip.size.x - Kit.EDGE, Kit.EDGE * 0.5)
	_play.size = _play.custom_minimum_size
	_play.position = _book.position + _right.position + Vector2((rp.x - _play.size.x) * 0.5, rp.y - _play.size.y - 26.0)
	_hint.position = Vector2(0, view.y - 18.0)
	_hint.size = Vector2(view.x, 14.0)
	_progress.position = Vector2(0, view.y - 26.0)
	_progress.size = Vector2(view.x, 26.0)


# ── Les pages ───────────────────────────────────────────────────────────────

func _on_input(event: InputEvent) -> void:
	var pos := Vector2.ZERO
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		pos = event.position
	elif event is InputEventScreenTouch and event.pressed:
		pos = event.position
	else:
		return
	if _at == 0:
		_turn(1)
		return
	var frame := Rect2(_right.global_position + _frame_rect.position, _frame_rect.size)
	var spread: Dictionary = _pages[_at]
	# UNE PAGE JOUEE SE REJOUE en touchant son image.
	if spread.has("live") and _live_tex.visible and frame.has_point(pos):
		_replay()
		return
	_turn(1 if pos.x > get_viewport_rect().size.x * 0.5 else -1)


func _turn(dir: int) -> void:
	var to := _at + dir
	if _turning or to < 0 or to >= _pages.size():
		return
	_show(to, dir)


## UNE DOUBLE PAGE. `dir` : 1 en avant (la feuille de droite part a gauche),
## -1 en arriere, 0 sans animation.
func _show(i: int, dir: int) -> void:
	var was := _at
	_at = i
	var spread: Dictionary = _pages[i]
	Analytics.track("intro_book_page", {"book": book, "page": i})
	_stage.cut()
	_live_view.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_play.visible = false
	# « Touche pour continuer » sur la couverture ; ensuite les fleches et le
	# compteur parlent.
	_hint.visible = i == 0
	_progress.queue_redraw()
	if not _sheet.is_empty():
		await _show_painted(spread, was, dir)
		return

	if spread.get("cover", false):
		_cover.visible = true
		_cover.scale = Vector2.ONE
		_prev.visible = false
		_next.visible = false
		_measure()
		_after_cover(i)
		return

	if was == 0 and dir > 0:
		# LA COUVERTURE S'OUVRE : elle se replie sur la reliure.
		_fill(spread)
		_turning = true
		_cover.pivot_offset = Vector2(0, 0)
		var t := create_tween()
		t.tween_property(_cover, "scale:x", 0.0, 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		Sound.play("page", 0.8)
		await t.finished
		_cover.visible = false
		_turning = false
		_after_turn(spread)
		return
	if dir == 0:
		_cover.visible = false
		_fill(spread)
		_after_turn(spread)
		return

	_turning = true
	await RenderingServer.frame_post_draw
	var view := get_viewport_rect().size
	var shot := get_viewport().get_texture().get_image()
	var k := Vector2(shot.get_width(), shot.get_height()) / view
	var going := _right if dir > 0 else _left
	var r := Rect2(going.global_position * k, going.size * k)
	_leaf_pic.texture = ImageTexture.create_from_image(shot.get_region(Rect2i(r)))
	_leaf.position = going.position
	_leaf.size = going.size
	_leaf_pic.position = Vector2.ZERO
	_leaf_pic.size = going.size
	_leaf.visible = true
	_leaf_pic.visible = true
	# Sous la feuille, la nouvelle page de son cote ; l'autre garde sa photo.
	var other := _left if dir > 0 else _right
	var o := Rect2(other.global_position * k, other.size * k)
	_stay.texture = ImageTexture.create_from_image(shot.get_region(Rect2i(o)))
	_stay.position = other.position
	_stay.size = other.size
	_stay.visible = true
	_fill(spread)
	# La feuille se replie sur la reliure...
	_leaf.pivot_offset = Vector2(0, 0) if dir > 0 else Vector2(going.size.x, 0)
	var t := create_tween()
	t.tween_property(_leaf, "scale:x", 0.0, TURN_S).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(_leaf, "modulate", Color(0.75, 0.7, 0.62), TURN_S)
	Sound.play("page", randf_range(0.95, 1.08))
	await t.finished
	# ...et retombe de l'autre cote, blanche, sur la page qui arrive.
	_leaf_pic.visible = false
	_leaf.position = other.position
	_leaf.pivot_offset = Vector2(other.size.x, 0) if dir > 0 else Vector2(0, 0)
	var u := create_tween()
	u.tween_property(_leaf, "scale:x", 1.0, TURN_S).from(0.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	u.parallel().tween_property(_leaf, "modulate", Color.WHITE, TURN_S)
	await u.finished
	_stay.visible = false
	var fade := create_tween()
	fade.tween_property(_leaf, "modulate:a", 0.0, 0.18)
	await fade.finished
	_leaf.visible = false
	_leaf.modulate = Color.WHITE
	_leaf.scale = Vector2.ONE
	_turning = false
	_after_turn(spread)


## LE LIVRE PEINT : l'encre s'efface, la bande joue (ouverture, page,
## fermeture), l'encre revient sur la page neuve.
func _show_painted(spread: Dictionary, was: int, dir: int) -> void:
	var cover: bool = spread.get("cover", false)
	_turning = true
	if dir != 0:
		var out := create_tween()
		out.tween_property(_left, "modulate:a", 0.0, 0.08)
		out.parallel().tween_property(_right, "modulate:a", 0.0, 0.08)
		out.parallel().tween_property(_cover, "modulate:a", 0.0, 0.08)
		await out.finished
	if cover:
		_left.modulate.a = 0.0
		_right.modulate.a = 0.0
		_prev.visible = false
		_next.visible = false
		if dir < 0:
			Sound.play("page", 0.8)
			_reframe_to(0.0, _sheet.open)
			await _sheet_play("open", true)
		_sheet_frame("open", 0)
		_opened = 0.0
		_cover.visible = true
		_measure()
		create_tween().tween_property(_cover, "modulate:a", 1.0, 0.2)
		_turning = false
		_after_cover(_at)
		return
	_cover.visible = false
	if dir > 0 and was == 0:
		Sound.play("page", 0.8)
		_reframe_to(1.0, _sheet.open)
		await _sheet_play("open", false)
	elif dir != 0:
		Sound.play("page", randf_range(0.95, 1.08))
		await _sheet_play("turn", dir < 0)
	_sheet_frame("open", int(_sheet.open.frames) - 1)
	_fill(spread)
	var back := create_tween()
	back.tween_property(_left, "modulate:a", 1.0, 0.15)
	back.parallel().tween_property(_right, "modulate:a", 1.0, 0.15)
	await back.finished
	_turning = false
	_after_turn(spread)


## CE QUE LA DOUBLE PAGE DIT ET MONTRE.
func _fill(spread: Dictionary) -> void:
	_measure()
	# Le chapitre : son numero dans CE livre, et son titre.
	var chapter := ""
	var n := 0
	var running := ""
	for k in range(1, _at + 1):
		if _pages[k].has("chapter"):
			n += 1
			running = String(_pages[k].chapter)
	if spread.has("chapter"):
		chapter = "%s. %s" % [NUMERALS[n - 1], I18N.t(_key(String(spread.chapter)))]
		_chapter.add_theme_font_size_override("font_size", 17)
		_chapter.add_theme_color_override("font_color", Palette.INK)
	elif not running.is_empty():
		chapter = I18N.t(_key(running))
		_chapter.add_theme_font_size_override("font_size", 11)
		_chapter.add_theme_color_override("font_color", Palette.BARK)
	_chapter.text = chapter
	var who: Dictionary = spread.get("who", {})
	var paras: Array[String] = []
	for id in spread.get("lines", []):
		var key := String(id)
		var line := I18N.t(_key(key))
		if who.has(id):
			line = "%s : %s" % [who[id], line] if I18N.locale == "fr" else "%s: %s" % [who[id], line]
		paras.append(line)
	_text.text = "\n\n".join(paras)
	_folio_l.text = str(_at * 2 - 1)
	_folio_r.text = str(_at * 2)
	_measure()
	_fit_text()

	# L'IMAGE : l'illustration deposee, son provisoire, ou l'ile qui joue.
	var final := final_art(String(spread.get("final", "")))
	# L'ile joue sa page, sauf si une illustration y a ete deposee (la page
	# de Shiro : son portrait sur l'ile, tant que son image manque).
	var live: bool = spread.has("live") and final == null
	_live_tex.visible = live
	# La vue de l'ile tourne des le fondu : sinon le cadre reste noir le temps
	# que la page apparaisse.
	if live:
		_live_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_art.visible = not live
	if not live:
		_art.texture = final if final != null else ART.get(String(spread.get("art", "wide")))
		var night: bool = spread.get("night", false) and final == null
		var sea: bool = spread.get("sea", false) and final == null
		_art.self_modulate = NIGHT if night else SEA if sea else Color.WHITE
		_art.scale = Vector2.ONE
	# Une vraie illustration montre deja qui parle : le buste ne reste que
	# devant un provisoire (sinon deux Kuro sur la meme image).
	var bust := String(spread.get("bust", ""))
	if final != null:
		bust = ""
	_bust.visible = not bust.is_empty()
	if _bust.visible:
		_bust.texture = BUST[bust]
	_crown.visible = spread.get("crown", false) and final == null
	_prev.visible = true
	_next.visible = _at < _pages.size() - 1


## LE TEXTE TIENT DANS SA PAGE : une langue plus longue, un petit ecran — la
## police descend d'un cran jusqu'a ce que toutes les lignes se voient.
func _fit_text() -> void:
	var gap := _text.get_theme_constant("line_spacing")
	for size in [17, 16, 15, 14, 13, 12, 11, 10]:
		_text.add_theme_font_size_override("font_size", size)
		var lines := _text.get_line_count()
		if lines * _text.get_line_height() + (lines - 1) * gap <= _text_room:
			break
	_text.size.y = _text_room


## Une cle sans point est celle du livre ouvert.
func _key(id: String) -> String:
	return id if "." in id else "intro.%s.%s" % [book, id]


func _after_cover(i: int) -> void:
	_capture_if_asked(i)
	if _auto > 0.0:
		await get_tree().create_timer(_auto).timeout
		if _at == i:
			_turn(1)


func _after_turn(spread: Dictionary) -> void:
	_capture_if_asked(_at)
	if spread.get("play", false):
		_play.visible = true
		_play.modulate.a = 0.0
		create_tween().tween_property(_play, "modulate:a", 1.0, 0.5).set_delay(0.4)
	if _art.visible:
		# Le lent zoom de l'image : une page vivante, meme peinte.
		_art.scale = Vector2.ONE
		create_tween().tween_property(_art, "scale", Vector2.ONE * 1.06, 8.0).set_trans(Tween.TRANS_SINE)
	if spread.get("crown", false) and _crown.visible:
		var top := _crown.position
		_crown.position = top - Vector2(0, 40)
		create_tween().tween_property(_crown, "position", top, 0.7).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
		Sound.play("coin_start")
	var at := _at
	if _live_tex.visible:
		await _replay()
	if _auto > 0.0 and at == _at:
		await get_tree().create_timer(_auto).timeout
		if at == _at and _at < _pages.size() - 1:
			_turn(1)


## L'ILE DE LA PAGE, neuve, et son geste.
func _replay() -> void:
	var spread: Dictionary = _pages[_at]
	if not spread.has("live"):
		return
	_live_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_stage.reset()
	await _stage.live(String(spread.live))


func _capture_if_asked(i: int) -> void:
	for probe in _probes:
		if probe[0] != i:
			continue
		var at: float = probe[1]
		get_tree().create_timer(at).timeout.connect(func() -> void:
			await RenderingServer.frame_post_draw
			var path := "%s-%d-%s.png" % [_probe_out, i, str(at)]
			get_viewport().get_texture().get_image().save_png(path)
			print("[shot] ", path)
			_probes_done += 1
			if _probes_done >= _probes.size():
				Sound.silence()
				get_tree().quit())


func _finish(skipped: bool) -> void:
	if not is_inside_tree():
		return
	_closing = true
	_stage.cut()
	Analytics.track("intro_book_end", {"book": book, "skipped": skipped, "page": _at})
	mark_seen(book)
	# « Read the stones » (la quete du tableau) : un livre lu, quel qu'il soit.
	if get_tree().current_scene != self and Session.signed_in():
		Home.mark_quest(Content.MARK_BOOK)
	_curtain.mouse_filter = Control.MOUSE_FILTER_STOP
	var t := create_tween()
	t.tween_property(_curtain, "color:a", 1.0, 0.4)
	await t.finished
	_show_chrome()
	finished.emit()
	if get_tree().current_scene == self:
		get_tree().quit()
		return
	# LA SORTIE EN FONDU : le noir s'efface sur ce qui suit (le lieu que
	# `finished` vient de lancer pose son rideau sous ce noir-ci).
	await get_tree().create_timer(0.15).timeout
	visible = false
	var veil := _veil(1.0)
	await create_tween().tween_property(veil, "color:a", 0.0, FADE_S).finished
	veil.queue_free()
	# Sa couche part avec lui (`play_on`).
	if get_parent() is CanvasLayer and get_parent().name.begins_with("IntroBook"):
		get_parent().queue_free()
	else:
		queue_free()
