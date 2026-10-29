package rip.rabbit.godot.firebase

import android.app.Activity
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

/**
 * « CONTINUER AVEC GOOGLE » SANS NAVIGATEUR (2026-10-29, web2 seulement).
 *
 * La feuille de comptes d'Android (Credential Manager) s'ouvre AU-DESSUS du
 * jeu ; le joueur choisit son compte et on rend un id_token, que le jeu poste
 * à /api/auth/google/native. Le passage par Chrome laissait un onglet
 * « You are signed in » derrière chaque connexion : on peut renvoyer Chrome
 * vers l'app, jamais le fermer.
 *
 * `webClientId` est le client WEB du serveur (GET /api/auth/google/native) :
 * c'est à lui que le jeton est adressé. Google ne le délivre que si un client
 * ANDROID du même projet porte ce package et l'empreinte SHA-1 de la clé qui
 * a signé l'APK (pour Play, celle de la signature d'app Play) — sinon
 * « Developer console is not set up correctly » et le jeu retombe sur le
 * navigateur.
 *
 * Classe à part, chargée au premier appel seulement : ses dépendances
 * (androidx.credentials, googleid) ne sont exportées qu'avec le preset web2
 * (addons/RabbitFirebase/export_plugin.gd). L'APK du Seeker ne la touche
 * jamais.
 */
internal object GoogleSignIn {
	/** `done(idToken, error)` : un des deux est "", sur le thread UI. */
	fun start(activity: Activity, webClientId: String, done: (String, String) -> Unit) {
		val request = GetCredentialRequest.Builder()
			.addCredentialOption(GetSignInWithGoogleOption.Builder(webClientId).build())
			.build()
		CredentialManager.create(activity).getCredentialAsync(
			activity,
			request,
			null,
			ContextCompat.getMainExecutor(activity),
			object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
				override fun onResult(result: GetCredentialResponse) {
					val credential = result.credential
					if (credential !is CustomCredential ||
						credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
					) {
						Log.w(TAG, "googleSignIn: credential inattendu ${credential.type}")
						return done("", "failed")
					}
					try {
						done(GoogleIdTokenCredential.createFrom(credential.data).idToken, "")
					} catch (e: GoogleIdTokenParsingException) {
						Log.w(TAG, "googleSignIn: jeton illisible", e)
						done("", "failed")
					}
				}

				override fun onError(e: GetCredentialException) {
					// Le message dit POURQUOI au logcat (« Developer console is not
					// set up correctly » = client Android ou SHA-1 manquant).
					Log.w(TAG, "googleSignIn: ${e.type} ${e.message}")
					done(
						"",
						when (e) {
							is GetCredentialCancellationException -> "cancelled"
							is NoCredentialException -> "no_credential"
							else -> "failed"
						},
					)
				}
			},
		)
	}

	private const val TAG = RabbitNotifications.TAG
}
