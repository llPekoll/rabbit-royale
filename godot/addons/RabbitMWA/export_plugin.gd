@tool
extends EditorPlugin
## CE QUI FAIT ENTRER L'AAR DANS L'APK.
##
## Un plugin Android v2 n'est pas déclaré par un fichier de config lu par
## l'export : c'est un EditorExportPlugin qui, au moment de l'export, nomme
## l'AAR à embarquer et les dépendances Maven à résoudre. Ce script ne tourne
## donc QUE dans l'éditeur, et rien de lui ne part dans le jeu.
##
## (Le mécanisme .gdap des plugins v1 est retiré depuis Godot 4.2 — il n'y a
## pas de fichier .gdap à écrire ici, et aucune clé `plugins/...` à ajouter à
## export_presets.cfg.)

var _export_plugin: AndroidExportPlugin


func _enter_tree() -> void:
	_export_plugin = AndroidExportPlugin.new()
	add_export_plugin(_export_plugin)


func _exit_tree() -> void:
	remove_export_plugin(_export_plugin)
	_export_plugin = null


class AndroidExportPlugin extends EditorExportPlugin:
	## Le même nom qu'au manifest de l'AAR, qu'à getPluginName() côté Kotlin et
	## qu'à SINGLETON dans scripts/wallet.gd.
	const PLUGIN_NAME := "RabbitMWA"

	func _supports_platform(platform: EditorExportPlatform) -> bool:
		return platform is EditorExportPlatformAndroid

	## Chemins relatifs au dossier addons/. Le build Gradle du plugin dépose
	## l'AAR à ces deux endroits (voir plugin-src/mwa/build.gradle.kts).
	func _get_android_libraries(_platform: EditorExportPlatform, debug: bool) -> PackedStringArray:
		var flavour := "debug" if debug else "release"
		return PackedStringArray(
			["%s/bin/%s/%s-%s.aar" % [PLUGIN_NAME, flavour, PLUGIN_NAME, flavour]]
		)

	## LES MÊMES DÉPENDANCES QUE build.gradle.kts, RÉPÉTÉES ICI.
	##
	## Ce n'est pas un doublon inutile : le premier sert à COMPILER l'AAR, le
	## second à les résoudre dans l'APK final. En oublier un donne un plugin qui
	## se charge puis meurt en NoClassDefFoundError au premier appel — l'erreur
	## classique de ce système.
	func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
		return PackedStringArray([
			"com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.8",
			"io.github.funkatronics:multimult:0.2.6",
			"androidx.activity:activity-ktx:1.9.0",
			"org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1",
		])

	func _get_name() -> String:
		return PLUGIN_NAME
