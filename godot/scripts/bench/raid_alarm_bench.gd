extends Control
## L'ALERTE DU RAID SUBI, HORS DU TERRIER : le HUD de l'ile sur des donnees
## factices, et par-dessus l'alerte telle que le chrome la pose quand le
## raid arrive pendant qu'on creuse (chrome.gd `_raid_away`) — bandeau et
## bouton DEFENDRE.
##
##   godot --path godot scenes/bench/raid_alarm_bench.tscn -- --shot=alarm.png --after=1.5

const HUD_SCENE := preload("res://scenes/ui/run_hud.tscn")


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Palette.NIGHT
	Kit.fill(bg)
	add_child(bg)

	RunState.current.fake({
		"me_id": "me",
		"seed": "first:bench",
		"rabbits": [{"playerId": "me", "name": "Shiro", "tile": 40, "energy": 55, "carrots": 12, "alive": true, "crowned": false}],
		"dug_fraction": 0.3,
		"chests_taken": 1,
		"chests_total": 4,
	})
	var hud: RunHud = HUD_SCENE.instantiate()
	hud.always = true
	add_child(hud)

	var alarm := RaidAlarm.new()
	alarm.who = "Kuro"
	alarm.action = I18N.t("loop.defend")
	alarm.acted.connect(func() -> void: print("[bench] DEFEND"))
	add_child(alarm)
	Kit.fill(alarm)
	DevShot.arm(self)
