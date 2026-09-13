package `fun`.rabbitroyale.app

import com.google.firebase.messaging.FirebaseMessaging

/**
 * Version reelle, compilee quand google-services.json est present.
 *
 * Le token vit derriere cet objet plutot que dans WalletBridge pour qu'un build
 * sans Firebase (APK de test) puisse remplacer l'implementation entiere sans
 * toucher au pont wallet, qui lui doit marcher dans les deux cas.
 */
object FcmToken {
    const val AVAILABLE = true

    fun fetch(onToken: (String) -> Unit, onError: (String) -> Unit) {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) onToken(task.result)
            else onError(task.exception?.message ?: "token fcm indisponible")
        }
    }
}
