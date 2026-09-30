@tool
extends EditorPlugin
## CE QUI FAIT ENTRER FIREBASE DANS L'APK.
##
## Même mécanique que addons/RabbitMWA : un EditorExportPlugin qui, au moment de
## l'export Android, nomme l'AAR du plugin et les dépendances Maven à résoudre.
## Ce script ne tourne QUE dans l'éditeur ; rien de lui ne part dans le jeu.
##
## L'AAR se construit depuis plugin-src/ (module `firebase`) :
##     android/gradlew -p godot/plugin-src :firebase:assembleDebug :firebase:assembleRelease
## La configuration Firebase (google-services.json) est lue À CE MOMENT-LÀ, pas
## à l'export — voir plugin-src/firebase/build.gradle.kts pour le pourquoi.

var _export_plugin: AndroidExportPlugin


func _enter_tree() -> void:
	_export_plugin = AndroidExportPlugin.new()
	add_export_plugin(_export_plugin)


func _exit_tree() -> void:
	remove_export_plugin(_export_plugin)
	_export_plugin = null


class AndroidExportPlugin extends EditorExportPlugin:
	## Le même nom qu'au manifest de l'AAR, qu'à getPluginName() côté Kotlin et
	## qu'à Engine.get_singleton() dans la façade GDScript.
	const PLUGIN_NAME := "RabbitFirebase"

	## DOIT être égale à `firebaseBom` dans plugin-src/firebase/build.gradle.kts.
	## L'AAR est compilé contre l'une, l'APK résout l'autre : un écart entre les
	## deux, c'est un plugin compilé contre des classes qui ne sont pas celles
	## qu'il rencontre à l'exécution.
	const FIREBASE_BOM := "34.19.0"

	func _supports_platform(platform: EditorExportPlatform) -> bool:
		return platform is EditorExportPlatformAndroid

	## Chemins relatifs au dossier addons/. Le build Gradle du plugin dépose
	## l'AAR à ces deux endroits.
	func _get_android_libraries(_platform: EditorExportPlatform, debug: bool) -> PackedStringArray:
		var flavour := "debug" if debug else "release"
		return PackedStringArray(
			["%s/bin/%s/%s-%s.aar" % [PLUGIN_NAME, flavour, PLUGIN_NAME, flavour]]
		)

	## LES MÊMES DÉPENDANCES QUE build.gradle.kts, RÉPÉTÉES ICI — un AAR ne
	## transporte pas les siennes. En oublier une donne un plugin qui se charge
	## puis meurt en NoClassDefFoundError au premier appel ; oublier
	## firebase-messaging ici, c'est aussi un service déclaré au manifest dont la
	## classe mère n'existe pas, donc un crash au premier message reçu.
	##
	## `platform(...)` SANS GUILLEMETS, et ce n'est pas une coquetterie : le
	## build.gradle du modèle Godot reconnaît cette forme par une regex, et avec
	## des guillemets le `"` final est capturé dans la coordonnée Maven, qui ne
	## se résout plus. Les artefacts Firebase sont sans version : c'est la BoM
	## qui la donne.
	##
	## CRASHLYTICS : les deux, Java ET NDK. Oublier le second ici, c'est un
	## APK qui démarre, qui rapporte les exceptions Java, et qui ne voit aucun
	## plantage du moteur — sans rien qui le signale. Le build-id qu'il exige
	## au lancement est dans l'AAR (plugin-src/firebase/build.gradle.kts,
	## CrashlyticsBuildId), pas dans un plugin Gradle à appliquer ici.
	func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
		return PackedStringArray([
			"platform(com.google.firebase:firebase-bom:%s)" % FIREBASE_BOM,
			"com.google.firebase:firebase-analytics",
			"com.google.firebase:firebase-messaging",
			"com.google.firebase:firebase-crashlytics",
			"com.google.firebase:firebase-crashlytics-ndk",
			"androidx.core:core:1.13.1",
		])

	func _get_name() -> String:
		return PLUGIN_NAME
