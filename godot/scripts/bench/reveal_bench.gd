extends Control
## LE BANC DE LA REVELATION — les ilots du terrier qui sortent de l'eau.
##
##   godot --path godot scenes/bench/reveal_bench.tscn
##   godot --path godot scenes/bench/reveal_bench.tscn -- --stage=3 --shot=/tmp/r.png --after=4
##
## Le vrai terrier (burrow.tscn), lance sans session, et quatre etapes :
##   0. pendant le tuto : aucun ilot ;
##   1. fin du tuto : DIG et SHOP ;
##   2. apres la premiere partie de DIG : + DEFEND ;
##   3. le bouclier de depart est tombe : + RAID.
## Passer a l'etape suivante fait sortir de l'eau ce qui s'ajoute ; « rejouer »
## oublie tout et refait monter l'etape en cours. Rien n'est ecrit : la memoire
## des ilots vus est celle du banc (BurrowLandmarks.bench_*), pas reveal.cfg.

const BURROW := preload("res://scenes/burrow.tscn")
const STAGES := [
	{"title": "0 · pendant le tuto", "doors": []},
	{"title": "1 · fin du tuto", "doors": ["dig", "shop"]},
	{"title": "2 · apres le 1er dig", "doors": ["dig", "shop", "defend"]},
	{"title": "3 · bouclier tombe", "doors": ["dig", "shop", "defend", "raid"]},
]

var _burrow: Node
var _stage := 0
var _label: Label


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var start := 1
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--stage="):
			start = clampi(int(arg.trim_prefix("--stage=")), 0, STAGES.size() - 1)
	BurrowLandmarks.bench = true
	BurrowLandmarks.bench_seen = []
	BurrowLandmarks.bench_doors.assign(STAGES[start]["doors"])
	_stage = start
	_burrow = BURROW.instantiate()
	add_child(_burrow)

	# Au-dessus du monde et de ses couches (la mer, les planches).
	var ui := CanvasLayer.new()
	ui.layer = 50
	add_child(ui)
	var bar := HBoxContainer.new()
	bar.position = Vector2(12, 12)
	bar.add_theme_constant_override("separation", 8)
	ui.add_child(bar)
	for i in range(STAGES.size()):
		var b := Button.new()
		b.text = STAGES[i]["title"]
		b.pressed.connect(_go.bind(i))
		bar.add_child(b)
	var again := Button.new()
	again.text = "rejouer"
	again.pressed.connect(_replay)
	bar.add_child(again)
	_label = Kit.label("", 16, Palette.CREAM, true)
	_label.position = Vector2(14, 52)
	ui.add_child(_label)
	_show()
	DevShot.arm(self)


func _exit_tree() -> void:
	BurrowLandmarks.bench = false


## Une etape : ce qui s'y ajoute sort de l'eau, ce qui en part disparait.
func _go(i: int) -> void:
	_stage = i
	BurrowLandmarks.bench_doors.assign(STAGES[i]["doors"])
	_burrow.call("_rebuild_islets")
	_show()


## Tout oublier : l'etape en cours remonte en entier.
func _replay() -> void:
	BurrowLandmarks.bench_seen = []
	_burrow.call("_rebuild_islets")


func _show() -> void:
	_label.text = "%s — %s" % [STAGES[_stage]["title"], ", ".join(STAGES[_stage]["doors"])]
