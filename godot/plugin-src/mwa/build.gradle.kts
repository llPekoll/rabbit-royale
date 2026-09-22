import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
	id("com.android.library")
	id("org.jetbrains.kotlin.android")
}

/**
 * Le nom, en UN seul endroit. Il doit correspondre à trois autres :
 * getPluginName() dans le Kotlin, le suffixe du meta-data au manifest, et
 * SINGLETON dans scripts/wallet.gd.
 */
val pluginName = "RabbitMWA"
val pluginPackageName = "rip.rabbit.godot.mwa"

android {
	namespace = pluginPackageName
	compileSdk = 35

	defaultConfig {
		// 24, comme la coquille WebView (android/app/build.gradle.kts) : le
		// plancher est fixé par le jeu, pas par ce module.
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
	// `implementation`, pas `compileOnly` : c'est ce que fait le template
	// officiel. Godot dédoublonne au moment de l'export.
	//
	// LA VERSION DOIT SUIVRE L'ÉDITEUR. Un AAR compilé contre une autre 4.x
	// charge, puis échoue à l'appel sur une signature qui a bougé.
	implementation("org.godotengine:godot:4.7.2.stable")

	// Mobile Wallet Adapter — parle au Seed Vault du Seeker.
	//
	// 2.0.8 EXACTEMENT, parce que c'est ce que la coquille WebView embarque
	// déjà (android/app/build.gradle.kts). Les deux clients doivent se
	// comporter pareil devant le wallet ; monter de version est une décision à
	// prendre des deux côtés à la fois, pas ici en passant.
	implementation("com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.8")
	implementation("io.github.funkatronics:multimult:0.2.6")

	// Déclarées EN PROPRE plutôt que reprises du transitif des deux lignes
	// ci-dessus. Le code les nomme directement — ComponentActivity pour le
	// cast de l'activité Godot, les coroutines pour le scope qui porte
	// `transact` — et une dépendance qu'on importe sans déclarer disparaît le
	// jour où celui qui l'apportait change d'avis.
	implementation("androidx.activity:activity-ktx:1.9.0")
	implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}

/**
 * L'AAR n'est pas lu là où Gradle le pose : le plugin d'export le cherche sous
 * addons/RabbitMWA/bin/<debug|release>/. On l'y recopie plutôt que de faire
 * pointer l'export sur build/, qui est un dossier jetable et non versionné.
 */
val copyDebugAar by tasks.registering(Copy::class) {
	from("build/outputs/aar/$pluginName-debug.aar")
	into("../../addons/$pluginName/bin/debug")
}

val copyReleaseAar by tasks.registering(Copy::class) {
	from("build/outputs/aar/$pluginName-release.aar")
	into("../../addons/$pluginName/bin/release")
}

// Accroché à CHAQUE variante, pas au seul `assemble` : `assembleDebug` est ce
// qu'on lance en itérant, et suspendu à `assemble` la copie ne s'y déclenchait
// pas — l'AAR restait dans build/ pendant que l'export cherchait dans addons/.
//
// Via `afterEvaluate` parce que les tâches de variante n'existent pas encore
// quand ce fichier est lu : AGP les crée à l'évaluation, et un `tasks.named`
// direct échoue sur "Task with name 'assembleDebug' not found".
afterEvaluate {
	tasks.named("assembleDebug") { finalizedBy(copyDebugAar) }
	tasks.named("assembleRelease") { finalizedBy(copyReleaseAar) }
}
