package rip.rabbit.godot.firebase

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * LE RETOUR DU NAVIGATEUR DANS LE JEU (2026-10-29, web2 seulement).
 *
 * « Continuer avec Google » ouvre Chrome ; une fois Google passé, le serveur
 * renvoie Chrome vers `<package>://signed-in` (androidReturnUrl,
 * src/lib/auth/handoff.ts) et Android réveille CETTE activité, déclarée au
 * manifest avec ce schéma. Elle ne montre rien : elle ramène au premier plan la
 * tâche du jeu, exactement comme un appui sur l'icône, et s'efface.
 *
 * Elle ne porte RIEN : le jeton arrive toujours par la requête d'attente du jeu
 * (/api/auth/handoff). Un lien que n'importe quelle page peut ouvrir ne doit
 * rien pouvoir faire d'autre que ramener le jeu devant.
 *
 * Pas l'activité de Godot elle-même : un intent-filter sur elle la relancerait
 * selon son launchMode, et le modèle de compilation où elle vit est réinstallé
 * à chaque montée de l'éditeur. Ici, le retour survit avec le plugin.
 *
 * Éteinte dans l'AAR web3 (rr_return_to_game, build.gradle.kts) : le Seeker ne
 * se connecte pas par Google.
 */
class ReturnToGameActivity : Activity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		packageManager.getLaunchIntentForPackage(packageName)?.let {
			// Le même intent que le lanceur : la tâche existante revient devant
			// telle quelle, partie en cours comprise ; sinon le jeu démarre.
			it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
			startActivity(it)
		}
		finish()
	}
}
