class_name SkinState
extends Node
## Permanent wardrobe; all ownership and prices come from /api/skins.
signal changed
static var current: SkinState
const SALE_NAMES := {"solana": "Solana", "carrot": "Carrot"}

var catalog: Dictionary = {}
var busy := false
var loading := false
var note := ""
var failed := false
var _fake := false
var _seq := 0
var _pay := Shop.UsdcPay.new()


static func shared() -> SkinState:
	if current == null:
		current = SkinState.new()
		current.name = "SkinState"
		(Engine.get_main_loop() as SceneTree).root.call_deferred("add_child", current)
	return current


func _ready() -> void:
	_pay.changed.connect(func() -> void: changed.emit())
	Session.changed.connect(_session_changed)
	ShopState.shared().bought.connect(_bought)


func _session_changed() -> void:
	if _fake:
		return
	_seq += 1
	catalog = {}
	if Session.signed_in():
		refresh()
	else:
		note = ""
		changed.emit()


func _bought(kind: String, _qty: int) -> void:
	if kind in ["skin_solana", "skin_carrot", "season_pass"] and not _fake and not busy:
		refresh()


func refresh() -> void:
	if _fake or not Session.signed_in():
		return
	_seq += 1
	var seq := _seq
	var token := Session.token
	loading = true
	changed.emit()
	var answer: Answer = await Net.get_json("/api/skins", token)
	if seq != _seq or token != Session.token:
		return
	loading = false
	failed = not answer.ok
	if answer.ok:
		catalog = answer.body
		if note == I18N.t("skins.loadFailed"):
			note = ""
		_sync_look()
	else:
		note = I18N.t("skins.loadFailed")
	changed.emit()


func _sync_look() -> void:
	var look := String(catalog.get("look", Look.mine()))
	var equipped: Variant = catalog.get("equipped", null)
	if Session.player.get("look", "") == look and Session.player.get("equippedSkin", null) == equipped:
		return
	Session.player["look"] = look
	Session.player["equippedSkin"] = equipped
	# Notify the burrow/portrait without turning a read into another session read.
	Home.player["look"] = look
	Home.player["equippedSkin"] = equipped
	Home.changed.emit()


func item(key: String = "solana") -> Dictionary:
	for skin in catalog.get("skins", []):
		if skin.get("key", "") == key:
			return skin
	return {}


func owns(key: String) -> bool:
	return key in catalog.get("owned", [])


func stage_text() -> String:
	return Shop.UsdcPay.stage_line(_pay.stage)


func buy(key: String, rail: String) -> void:
	var skin := item(key)
	if busy or owns(key) or skin.is_empty():
		return
	busy = true
	failed = false
	note = ""
	changed.emit()
	if _fake:
		catalog["owned"].append(key)
		skin["owned"] = true
	else:
		var token := Session.token
		await _pay.pay(String(skin["kind"]), 1, rail)
		if token != Session.token:
			busy = false
			return
		note = _pay.error
		failed = not note.is_empty()
		await refresh()
	busy = false
	if owns(key):
		note = I18N.t("skins.success")
		failed = false
	changed.emit()


func equip(key: Variant) -> void:
	if busy or (key != null and not owns(String(key))):
		return
	busy = true
	note = ""
	failed = false
	changed.emit()
	if _fake:
		catalog["equipped"] = key
		catalog["look"] = key if key != null else "white"
	else:
		var token := Session.token
		var answer: Answer = await Net.send_json("/api/player", HTTPClient.METHOD_PATCH, {"skin": key}, token)
		if token != Session.token:
			busy = false
			return
		if answer.ok:
			var player := Session.player.duplicate()
			player.merge(answer.body.get("player", {}), true)
			Session._adopt({"player": player})
			await refresh()
		else:
			failed = true
			note = I18N.t("err_offline") if answer.error() == "offline" else I18N.t("skins.equipFailed")
	busy = false
	changed.emit()


func recover(key: String = "solana") -> void:
	if busy:
		return
	if _fake:
		return
	busy = true
	note = I18N.t("skins.recovering")
	failed = false
	changed.emit()
	var token := Session.token
	await ShopState.shared().claim()
	if token != Session.token:
		busy = false
		return
	await refresh()
	busy = false
	if failed:
		changed.emit()
		return
	if owns(key):
		note = I18N.t("skins.success")
	elif bool(item(key).get("pending", false)):
		note = I18N.t("skins.pending")
	else:
		note = I18N.t("skins.checked")
	changed.emit()


func fake(data: Dictionary) -> void:
	_fake = true
	catalog = data.duplicate(true)
	changed.emit()
