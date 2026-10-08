extends Control
## LE BANC DE LA BARRE DU HAUT : la barre sur la nuit, avec un terrier et un
## joueur factices, pour la voir sans compte.
##
##   godot --path godot scenes/bench/top_bar_bench.tscn -- --shot=bar.png --after=2
##   ... -- --run      # en pleine manche : coffres, butin, energie de la manche
##   ... -- --refill   # retour de manche : le cadran vide remonte au reservoir
##
## Les reglages (ex `--sound`) sont un onglet du profil : dialogs_bench
## `--only=settings`.
##
## Home et Session sont des autoloads : on ecrit directement dedans, la
## barre les lit comme elle lirait le serveur. Rien ne part sur le reseau
## (`preview` coupe la lecture du classement).


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	Session.player = {"id": "bench", "name": "CursedRoot", "guest": true, "avatar": "orange"}
	var args := OS.get_cmdline_user_args()
	Home.player = {"avatar": "orange", "level": 1 if "--low" in args else 6, "solo": "--solo" in args}
	Home.burrow = {
		"level": 3, "stock": 1263, "lifetime": 4200, "gardenReady": 12,
		"energy": 17, "maxEnergy": Tuning.i("ENERGY.MAX"), "regenPerHour": 6,
		"yieldPerHour": 20, "gardenCeiling": 60,
	}

	var bar: TopBar = preload("res://scenes/ui/top_bar.tscn").instantiate()
	bar.preview = true
	Kit.fill(bar)
	add_child(bar)
	bar.set_rank(59, 340)
	bar.set_season_open(false)
	# `-- --run` : la barre en pleine manche — l'energie de la manche sur le
	# cadran, les coffres sous les carottes, le butin porte a droite.
	if "--run" in OS.get_cmdline_user_args():
		bar.set_run(18, {"taken": 0, "total": 1, "warnStage": 0})
		bar.set_run_energy(295)

	# `-- --refill` : le retour de manche — le cadran vide remonte au
	# reservoir (carrot_pill.gd `_refilled`), le chiffre imprime en route.
	if "--refill" in OS.get_cmdline_user_args():
		Home.burrow["energy"] = 240
		bar.set_run_energy(0)
		get_tree().create_timer(0.3).timeout.connect(func() -> void: bar.set_run_energy(-1))
		for i in 12:
			get_tree().create_timer(0.3 + i * 0.15).timeout.connect(func() -> void:
				print("[bench] dial ", bar.pill.dial.value))

	# Ce que la barre dit, imprime pour le banc.
	for s in ["energy_tapped", "add_pressed", "profile_pressed", "shop_pressed", "story_pressed", "season_pressed"]:
		bar.connect(s, func() -> void: print("[bench] ", s))

	# Une recolte a mi-chemin de la capture, et un refus juste apres.
	get_tree().create_timer(1.4).timeout.connect(func() -> void:
		Home.burrow["stock"] = 1305
		Home.changed.emit()
		Home.burst.emit(42))
	get_tree().create_timer(3.0).timeout.connect(bar.deny)

	DevShot.arm(self)
