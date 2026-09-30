import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
	id("com.android.library")
	id("org.jetbrains.kotlin.android")
}

/**
 * Le nom, en UN seul endroit. Il doit correspondre à trois autres :
 * getPluginName() dans le Kotlin, le suffixe du meta-data au manifest, et
 * PLUGIN_NAME dans addons/RabbitFirebase/export_plugin.gd.
 */
val pluginName = "RabbitFirebase"
val pluginPackageName = "rip.rabbit.godot.firebase"

/**
 * L'applicationId du jeu (package/unique_name dans export_presets.cfg).
 * google-services.json peut décrire plusieurs apps Android d'un même projet
 * Firebase ; c'est CELLE-CI qu'on y cherche.
 */
val gameApplicationId = "rip.rabbit.royale"

/**
 * FIREBASE_BOM : la SEULE version Firebase de ce module. Les artefacts sont
 * déclarés sans version et la BoM les choisit ensemble — mélanger à la main
 * firebase-messaging et firebase-analytics de deux vagues différentes donne des
 * NoSuchMethodError entre firebase-common et les modules.
 *
 * DOIT être égale à FIREBASE_BOM dans addons/RabbitFirebase/export_plugin.gd.
 * 34.19.0 → firebase-analytics 23.2.0, firebase-messaging 25.1.3.
 */
val firebaseBom = "34.19.0"

android {
	namespace = pluginPackageName
	compileSdk = 35

	defaultConfig {
		// Le plancher du jeu (Godot exporte en minSdk 24). Firebase 34 demande
		// 23 : il ne contraint rien ici.
		minSdk = 24
		setProperty("archivesBaseName", pluginName)
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}
}

kotlin {
	compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
	// Même règle que pour RabbitMWA : SUIT L'ÉDITEUR, à la version près.
	implementation("org.godotengine:godot:4.7.2.stable")

	implementation(platform("com.google.firebase:firebase-bom:$firebaseBom"))
	implementation("com.google.firebase:firebase-analytics")
	implementation("com.google.firebase:firebase-messaging")

	// Déclarée EN PROPRE : NotificationCompat, NotificationManagerCompat et
	// ContextCompat sont nommés dans le code. Firebase et Godot l'apportent
	// déjà en transitif, mais une dépendance qu'on importe sans la déclarer
	// disparaît le jour où celui qui l'apportait change d'avis.
	implementation("androidx.core:core:1.13.1")
}

/**
 * GOOGLE-SERVICES.JSON LU ICI, PAS PAR LE PLUGIN GRADLE DE GOOGLE.
 *
 * Tout ce que `com.google.gms.google-services` fait encore (4.4.x) : lire le
 * JSON et écrire une poignée de <string> — google_app_id, google_api_key,
 * gcm_defaultSenderId, project_id… — que FirebaseInitProvider relit au
 * démarrage. Rien d'autre. On fait donc la même chose ici, dans l'AAR du
 * plugin : les ressources d'un AAR sont fusionnées dans l'APK, et
 * FirebaseOptions.fromResource les y trouve exactement comme si l'app les avait
 * déclarées.
 *
 * POURQUOI PAS LE PLUGIN DE GOOGLE DANS godot/android/build : ce dossier est le
 * modèle de compilation de Godot. Il est ignoré par git (godot/.gitignore) et
 * doit être RÉINSTALLÉ à chaque montée de version de l'éditeur, ce qui
 * écraserait son build.gradle et, avec lui, la ligne qui applique le plugin.
 * Firebase disparaîtrait alors en silence du build suivant — l'app démarre,
 * aucune notification n'arrive, rien ne dit pourquoi. Ici, la configuration vit
 * à côté du code qui en dépend, et survit aux réinstallations du modèle.
 *
 * FICHIER ABSENT = BUILD QUI PASSE QUAND MÊME, comme la coquille WebView
 * (android/app/build.gradle.kts) : aucune chaîne n'est générée,
 * FirebaseInitProvider logue « FirebaseApp initialization unsuccessful », et le
 * plugin se met en veille (voir firebaseReady dans RabbitFirebasePlugin.kt). Un
 * APK de test doit pouvoir se construire sans compte Firebase.
 *
 * FICHIER PRÉSENT MAIS SANS NOTRE APP = BUILD QUI ÉCHOUE. Ne rien générer dans
 * ce cas-là donnerait le même silence que ci-dessus, alors que c'est une erreur
 * de configuration qu'on peut dire tout de suite.
 */
abstract class GoogleServicesValues : DefaultTask() {
	@get:InputFiles
	@get:PathSensitive(PathSensitivity.NONE)
	abstract val jsonFile: ConfigurableFileCollection

	@get:Input
	abstract val applicationId: Property<String>

	@get:OutputDirectory
	abstract val outputDir: DirectoryProperty

	@TaskAction
	fun generate() {
		val out = outputDir.get().asFile
		out.deleteRecursively()
		val json = jsonFile.files.firstOrNull { it.exists() } ?: return

		@Suppress("UNCHECKED_CAST")
		val root = JsonSlurper().parse(json) as Map<String, Any?>
		val project = root["project_info"] as? Map<String, Any?> ?: emptyMap()
		@Suppress("UNCHECKED_CAST")
		val clients = root["client"] as? List<Map<String, Any?>> ?: emptyList()
		val appId = applicationId.get()
		val client = clients.firstOrNull {
			val info = it["client_info"] as? Map<*, *>
			val android = info?.get("android_client_info") as? Map<*, *>
			android?.get("package_name") == appId
		} ?: throw GradleException(
			"${json.path} ne décrit aucune app Android « $appId ». Ajoute-la au " +
				"projet Firebase (Paramètres du projet → Vos applications) et " +
				"retélécharge le fichier."
		)

		val info = client["client_info"] as Map<*, *>
		val apiKey = (client["api_key"] as? List<*>)
			?.firstNotNullOfOrNull { (it as? Map<*, *>)?.get("current_key") as? String }

		// Les noms sont ceux que le plugin de Google écrit, un pour un :
		// FirebaseOptions.fromResource ne connaît que ceux-là.
		val strings = linkedMapOf(
			"google_app_id" to info["mobilesdk_app_id"] as? String,
			"gcm_defaultSenderId" to project["project_number"] as? String,
			"google_api_key" to apiKey,
			"google_crash_reported_api_key" to apiKey,
			"project_id" to project["project_id"] as? String,
			"google_storage_bucket" to project["storage_bucket"] as? String,
			"firebase_database_url" to project["firebase_url"] as? String,
		).filterValues { !it.isNullOrEmpty() }

		val values = File(out, "values").apply { mkdirs() }
		File(values, "google_services.xml").writeText(buildString {
			appendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
			appendLine("<!-- Généré depuis google-services.json par plugin-src/firebase. Ne pas éditer. -->")
			appendLine("<resources>")
			for ((name, value) in strings) {
				val escaped = value!!.replace("&", "&amp;").replace("<", "&lt;")
				appendLine("    <string name=\"$name\" translatable=\"false\">$escaped</string>")
			}
			appendLine("</resources>")
		})
	}
}

val googleServicesValues by tasks.registering(GoogleServicesValues::class) {
	// Une FileCollection plutôt qu'un RegularFileProperty : elle accepte un
	// fichier absent sans faire échouer la validation des entrées, et Gradle
	// relance la tâche quand le fichier apparaît, change ou disparaît.
	jsonFile.from("google-services.json")
	applicationId.set(gameApplicationId)
	outputDir.set(layout.buildDirectory.dir("generated/res/googleServices"))
}

androidComponents {
	onVariants { variant ->
		variant.sources.res?.addGeneratedSourceDirectory(
			googleServicesValues,
			GoogleServicesValues::outputDir,
		)
	}
}

/**
 * Même mécanique que plugin-src/mwa : l'export cherche l'AAR sous
 * addons/RabbitFirebase/bin/<debug|release>/, pas dans build/.
 */
val copyDebugAar by tasks.registering(Copy::class) {
	from("build/outputs/aar/$pluginName-debug.aar")
	into("../../addons/$pluginName/bin/debug")
}

val copyReleaseAar by tasks.registering(Copy::class) {
	from("build/outputs/aar/$pluginName-release.aar")
	into("../../addons/$pluginName/bin/release")
}

afterEvaluate {
	tasks.named("assembleDebug") { finalizedBy(copyDebugAar) }
	tasks.named("assembleRelease") { finalizedBy(copyReleaseAar) }
}
