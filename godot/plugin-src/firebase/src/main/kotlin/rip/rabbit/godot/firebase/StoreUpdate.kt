package rip.rabbit.godot.firebase

import android.app.Activity
import android.util.Log
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability

/**
 * LA NOUVELLE VERSION DE L'APP PLAY (2026-10-29, web2 seulement).
 *
 * L'app Play ne se met jamais à jour toute seule (boot.gd : pas de pack OTA
 * hors du Seeker) : tout nouveau code arrive par une nouvelle version sur le
 * store. Plutôt que d'espérer que le joueur aille la chercher, on demande à
 * Play s'il en a une, et si oui on ouvre SON écran de mise à jour plein écran
 * (« in-app update », type IMMEDIATE) : Play télécharge, installe et relance
 * le jeu. Le joueur peut refuser (retour) ; on redemande au lancement suivant.
 *
 * Ne marche que pour une app installée PAR le Play Store (test interne
 * compris) : un APK posé à la main ne voit jamais de mise à jour.
 *
 * Classe à part, comme GoogleSignIn : sa dépendance (play app-update) n'est
 * exportée qu'avec le preset web2.
 */
internal object StoreUpdate {
	/** Sous 0xFFFF, et différent de REQ_NOTIFICATIONS (0x5242). */
	private const val REQ_UPDATE = 0x5243
	private const val TAG = RabbitNotifications.TAG

	/**
	 * `resumeOnly` : seulement reprendre une mise à jour déjà lancée (le
	 * joueur est sorti de l'écran de Play pendant l'installation) — c'est ce
	 * que Play demande de faire à chaque retour au premier plan.
	 */
	fun check(activity: Activity, resumeOnly: Boolean = false) {
		val manager = AppUpdateManagerFactory.create(activity)
		manager.appUpdateInfo
			.addOnSuccessListener { info ->
				val state = info.updateAvailability()
				val start = state == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS ||
					(!resumeOnly && state == UpdateAvailability.UPDATE_AVAILABLE &&
						info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE))
				if (!resumeOnly) Log.i(TAG, "store update: availability=$state start=$start")
				if (start) {
					manager.startUpdateFlowForResult(
						info,
						activity,
						AppUpdateOptions.defaultOptions(AppUpdateType.IMMEDIATE),
						REQ_UPDATE,
					)
				}
			}
			.addOnFailureListener { Log.i(TAG, "store update: ${it.message}") }
	}
}
