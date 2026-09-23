extends Control
## LE BANC DE LA RUN : le HUD de l'ile sur des donnees factices, le bouton
## MARK A BOMB arme, un recap et un selecteur d'ile poses a plat — pour voir
## en une capture que les pieces sont les bonnes sans ile ni compte.
##
##   godot --path godot scenes/bench/run_bench.tscn -- --shot=run.png --after=2
##
## Pas un ecran du jeu — un outil, comme ui_bench.tscn.

const HUD_SCENE := preload("res://scenes/ui/run_hud.tscn")
const RECAP_SCENE := preload("res://scenes/ui/run_recap.tscn")


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	# L'ETAT FACTICE, avant le HUD pour qu'il le lise au montage : ma run sur
	# la premiere ile, la maree a deux points, trois rivaux qui regardent,
	# l'energie sous deux bombes (ambre), une traversee facturee.
	var state := RunState.current
	state.fake({
		"me_id": "me",
		"seed": "first:bench",
		"rabbits": [
			{"playerId": "me", "name": "Clover", "tile": 40, "energy": 55, "carrots": 12, "alive": true, "crowned": false},
			{"playerId": "rival", "name": "Blackpaw", "tile": 12, "energy": 120, "carrots": 30, "alive": true, "crowned": true},
		],
		"warn_stage": 2,
		"dug_fraction": 0.62,
		"chests_taken": 3,
		"chests_total": 10,
		"first_run": true,
		"taught_bomb": 41,
		"teach_ready": true,
		"digs": {"tiles": 1, "bombs": 0, "goldens": 0, "chests": 0, "flags": 0},
		"watchers": 3,
		"bank": {"energy": 35, "max": 60, "cost": 5},
		"shoved": {"byId": "rival", "byName": "Blackpaw", "fatal": false, "at": Time.get_ticks_msec()},
		"hit": {"by": "rival", "kind": "bolt", "at": Time.get_ticks_msec()},
		"bag": {"lightning": 2, "bombs": 1},
	})

	var hud: RunHud = HUD_SCENE.instantiate()
	hud.always = true
	add_child(hud)
	# Le bouton arme : sa legende et le bois sombre.
	state.set_flag_mode(true, 3)

	# UN RECAP, pose a plat (pas par le chrome) : une poussee fatale, avec la
	# banque et un record.
	var recap: RunRecap = RECAP_SCENE.instantiate()
	recap.position = Vector2(Kit.EDGE, 150.0)
	recap.size = Vector2(380.0, 0.0)
	add_child(recap)
	recap.show_recap(
		{"carrots": 42, "tilesDug": 31, "bombsHit": 1, "durationMs": 214000,
			"killedBy": {"id": "rival", "name": "Blackpaw", "how": "shove"}},
		false,
		{"energy": 50, "max": 60, "cost": 5},
		{"tier": "Meadow", "carrots": 42, "previous": 30})

	DevShot.arm(self)
