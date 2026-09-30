import groovy.json.JsonSlurper
import java.util.UUID
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
 * 34.19.0 → firebase-analytics 23.2.0, firebase-messaging 25.1.3,
 * firebase-crashlytics et firebase-crashlytics-ndk 20.1.1 (qui tirent
 * firebase-sessions 3.0.8).
 *
 * MONTER LA BoM = RELIRE CrashlyticsBuildId PLUS BAS : les noms de ressources
 * qu'il écrit sont ceux que Crashlytics 20.1.1 cherche, relevés dans son AAR.
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
	// Crashlytics ET son volet NDK. Le second n'est pas un bonus : le jeu est
	// un moteur C++ (libgodot_android.so), et un SIGSEGV dans le rendu ou le
	// GDScript ne passe JAMAIS par Thread.UncaughtExceptionHandler — sans le
	// NDK, les plantages qui comptent le plus seraient exactement ceux qu'on
	// ne voit pas. Le NDK installe un gestionnaire de signaux (crashpad) au
	// démarrage du processus, avant même que Godot ne charge son moteur.
	implementation("com.google.firebase:firebase-crashlytics")
	implementation("com.google.firebase:firebase-crashlytics-ndk")

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

/**
 * LE « BUILD ID » DE CRASHLYTICS, ÉCRIT ICI, PAS PAR SON PLUGIN GRADLE.
 *
 * Même problème, même réponse que google-services ci-dessus. Au démarrage,
 * CrashlyticsCore.onPreExecute cherche une chaîne
 * `com.google.firebase.crashlytics.mapping_file_id` (à défaut, l'ancienne
 * `com.crashlytics.android.build_id`, qu'on n'écrit donc pas) ; vide ou
 * absente, il lève « The
 * Crashlytics build ID is missing » — et cette exception-là N'EST PAS
 * rattrapée : l'app meurt au lancement. C'est `com.google.firebase.crashlytics`
 * (le plugin Gradle) qui l'écrit d'ordinaire, et il faudrait l'appliquer dans
 * godot/android/build — le dossier que Godot écrase à chaque réinstallation
 * du modèle. On l'écrit donc dans l'AAR, qui survit.
 *
 * LES NOMS SONT CEUX DE CRASHLYTICS 20.1.1, relevés dans ses classes
 * (CommonUtils.getMappingFileId, CrashlyticsCore.isBuildIdValid), pas
 * devinés. À relire à chaque montée de BoM.
 *
 * CE QUE VAUT L'IDENTIFIANT. Côté console, il ne sert qu'à apparier un
 * mapping R8/ProGuard aux rapports d'un build — et le modèle Godot ne minifie
 * pas le Java, il n'y a rien à apparier. Il doit simplement exister et être
 * non vide. Il change À CHAQUE BUILD DE L'AAR (un UUID neuf, jamais mis en
 * cache), comme le fait le plugin de Google ; deux exports tirés du même AAR
 * partagent donc le même, ce qui est sans conséquence ici.
 *
 * CE QU'ON N'ÉCRIT PAS : les tableaux `com.google.firebase.crashlytics
 * .build_ids_lib/_arch/_build_id`, que le plugin de Google remplit avec le
 * build-id ELF de chaque .so de l'APK. Cet AAR ne voit jamais
 * libgodot_android.so (elle vient du modèle d'export), il ne peut pas les
 * calculer. Leur absence ne coûte qu'une ligne de debug (« Could not find
 * resources ») : le minidump d'un plantage natif porte lui-même le build-id
 * de chaque module chargé, et c'est sur lui que se fait l'appariement avec
 * des symboles envoyés par `firebase crashlytics:symbols:upload`.
 *
 * INDÉPENDANT DE google-services.json, et exprès : si Firebase est configuré,
 * Crashlytics démarre et DOIT trouver cette chaîne ; s'il ne l'est pas,
 * Crashlytics ne démarre pas et la chaîne ne gêne personne. L'écrire toujours,
 * c'est ne jamais pouvoir livrer un APK qui meurt au lancement.
 */
abstract class CrashlyticsBuildId : DefaultTask() {
	@get:OutputDirectory
	abstract val outputDir: DirectoryProperty

	@TaskAction
	fun generate() {
		val out = outputDir.get().asFile
		out.deleteRecursively()
		// 32 hexadécimaux sans tirets : le format que le plugin de Google écrit.
		val id = UUID.randomUUID().toString().replace("-", "")
		val values = File(out, "values").apply { mkdirs() }
		// tools:keep : Crashlytics lit ces chaînes par getIdentifier, donc par
		// leur NOM. Un rétrécissement des ressources qui ne voit aucune
		// référence dans le code les supprimerait.
		File(values, "crashlytics_build_id.xml").writeText(buildString {
			appendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
			appendLine("<!-- Généré par plugin-src/firebase (CrashlyticsBuildId). Ne pas éditer. -->")
			appendLine("<resources xmlns:tools=\"http://schemas.android.com/tools\"")
			appendLine("    tools:keep=\"@string/com.google.firebase.crashlytics.mapping_file_id\">")
			appendLine("    <string name=\"com.google.firebase.crashlytics.mapping_file_id\" translatable=\"false\" tools:ignore=\"UnusedResources\">$id</string>")
			appendLine("</resources>")
		})
	}
}

val crashlyticsBuildId by tasks.registering(CrashlyticsBuildId::class) {
	outputDir.set(layout.buildDirectory.dir("generated/res/crashlyticsBuildId"))
	// Aucune entrée : sans cette ligne, Gradle la jugerait à jour dès le
	// deuxième build et ressortirait l'identifiant du premier pour toujours.
	outputs.upToDateWhen { false }
}

androidComponents {
	onVariants { variant ->
		variant.sources.res?.addGeneratedSourceDirectory(
			googleServicesValues,
			GoogleServicesValues::outputDir,
		)
		variant.sources.res?.addGeneratedSourceDirectory(
			crashlyticsBuildId,
			CrashlyticsBuildId::outputDir,
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
