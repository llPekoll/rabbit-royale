@tool
extends EditorPlugin
## GOOGLE PLAY BILLING (godot-sdk-integrations/godot-google-play-billing 3.3.0,
## Billing Library 9.1). Le plugin officiel, vendorise tel quel (bin/,
## BillingClient.gd, LICENSE) SAUF ce fichier : l'original embarque l'AAR dans
## tout export Android, le Seeker compris.
##
## LE BUILD GOOGLE PLAY SEUL (marque `web2` du preset) l'embarque : le Seeker
## paie en crypto et n'a rien a faire de la permission BILLING. Meme lecture
## de la marque qu'addons/RabbitMWA, dans l'autre sens. Le jeu ne le cherche
## que sur ce build (store_pay.gd).

var _export_plugin: BillingExportPlugin


func _enter_tree() -> void:
	_export_plugin = BillingExportPlugin.new()
	add_export_plugin(_export_plugin)


func _exit_tree() -> void:
	remove_export_plugin(_export_plugin)
	_export_plugin = null


class BillingExportPlugin extends EditorExportPlugin:
	## Le nom du singleton Java, celui que BillingClient.gd cherche.
	const PLUGIN_NAME := "GodotGooglePlayBilling"

	func _supports_platform(platform: EditorExportPlatform) -> bool:
		return platform is EditorExportPlatformAndroid

	func _web2() -> bool:
		var preset := get_export_preset()
		if preset == null:
			return false
		for feature in preset.get_custom_features().split(","):
			if feature.strip_edges() == "web2":
				return true
		return false

	func _get_android_libraries(_platform: EditorExportPlatform, debug: bool) -> PackedStringArray:
		if not _web2():
			return PackedStringArray()
		var flavour := "debug" if debug else "release"
		return PackedStringArray(["%s/bin/%s/%s-%s.aar" % [PLUGIN_NAME, flavour, PLUGIN_NAME, flavour]])

	func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
		if not _web2():
			return PackedStringArray()
		return PackedStringArray(["com.android.billingclient:billing-ktx:9.1.0"])

	func _get_name() -> String:
		return PLUGIN_NAME
