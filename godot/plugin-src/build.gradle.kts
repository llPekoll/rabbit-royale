// Le build des AAR des plugins (mwa → RabbitMWA, firebase → RabbitFirebase),
// à part du projet Godot lui-même.
//
// CE DOSSIER NE PART PAS DANS L'APK. Il produit des artefacts — les AAR sous
// addons/<Plugin>/bin/ — et ce sont eux que l'export embarque. Le garder
// hors de res:// évite que Godot importe des sources Kotlin comme des
// ressources de jeu.
//
// Versions alignées sur la coquille WebView (android/) : même AGP, même Kotlin,
// pour que les deux clients se compilent avec la même chaîne.
plugins {
	id("com.android.library") version "8.7.2" apply false
	id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}
