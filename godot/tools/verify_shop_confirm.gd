extends SceneTree
## L'ACHAT EN DEUX PRESSIONS (shop.gd `_arm`) : sur l'etal du banc (donnees
## factices, ShopState en `fake` — rien ne part au serveur).
##
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tools/verify_shop_confirm.gd
##
## ATTENDU : chaque ligne finit par « ok ».
##
## Sans type Shop ni PlankButton ici : les nommer compile shop.gd avant que
## les autoloads (Home, I18N) existent. Tout passe par le noeud.

var _fails := 0


func _check(label: String, ok: bool) -> void:
	if not ok:
		_fails += 1
	print("%s %s" % [label, "ok" if ok else "ECHEC"])


func _init() -> void:
	_run.call_deferred()


func _wait(seconds: float) -> void:
	await create_timer(seconds).timeout


func _run() -> void:
	var bench := (load("res://scenes/bench/shop_bench.tscn") as PackedScene).instantiate()
	get_root().add_child(bench)
	await _wait(0.5)
	var shop: Node = _find_shop(bench)
	_check("etal ouvert", shop != null)
	if shop == null:
		quit(1)
		return
	var prices := _gold_buttons(shop)
	_check("des prix en carottes a payer", prices.size() >= 2)
	var a: Node = prices[0]
	var b: Node = prices[1]
	var danger: int = a.Board.DANGER
	var gold: int = a.Board.GOLD
	var arm_seconds: float = shop.ARM_SECONDS
	var price_a: String = a.text

	a.pressed.emit()
	_check("1re pression : arme, rien d'achete", shop._armed == a)
	_check("1re pression : rouge", a.board == danger)
	var i18n: Node = get_root().get_node("I18N")
	_check("1re pression : la question", a.text == i18n.shout(i18n.t("shop.confirmBuy")))
	# `-- --shot=x.png` (sans --headless) : l'etal, un prix arme.
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			await _wait(0.4)
			get_root().get_texture().get_image().save_png(arg.trim_prefix("--shot="))

	b.pressed.emit()
	_check("une autre carte : la premiere desarmee", a.board == gold and a.text == price_a)
	_check("une autre carte : elle s'arme a son tour", shop._armed == b)

	b.pressed.emit()
	_check("2e pression : achete et desarme", shop._armed == null and b.board == gold)

	a.pressed.emit()
	await _wait(arm_seconds + 0.3)
	_check("sans suite : desarme au bout de %.0f s" % arm_seconds,
		shop._armed == null and a.board == gold and a.text == price_a)

	print("%d echec(s)" % _fails)
	quit(1 if _fails > 0 else 0)


func _find_shop(n: Node) -> Node:
	if n.get_script() != null and (n.get_script() as Script).resource_path.ends_with("ui/shop.gd"):
		return n
	for c in n.get_children():
		var hit: Node = _find_shop(c)
		if hit != null:
			return hit
	return null


func _gold_buttons(n: Node) -> Array:
	var out: Array = []
	if n.get_script() != null and (n.get_script() as Script).resource_path.ends_with("plank_button.gd") \
			and n.board == n.Board.GOLD and not n.disabled:
		out.append(n)
	for c in n.get_children():
		out.append_array(_gold_buttons(c))
	return out
