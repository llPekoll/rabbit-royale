package `fun`.rabbitroyale.app

import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.lifecycle.lifecycleScope
import com.funkatronics.encoders.Base58
import com.google.firebase.messaging.FirebaseMessaging
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Le pont entre la page web et le Mobile Wallet Adapter natif.
 *
 * La page expose `window.rrWallet` (voir use-wallet-login.ts) ; ce pont en est
 * l'implémentation native. Le serveur ne change pas d'un octet : la page lui
 * poste la même paire { address, signature } que depuis un wallet de bureau.
 *
 * `signMessagesDetached` signe des octets arbitraires — on lui donne le message
 * de challenge en UTF-8 et la signature revient en base58, exactement la forme
 * que verifySignature attend côté serveur.
 */
class WalletBridge(
    private val activity: MainActivity,
    private val webView: WebView,
    private val sender: ActivityResultSender,
) {
    private val adapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse("https://rabbitroyale.fun"),
            iconUri = Uri.parse("/favicon.svg"),
            identityName = "Rabbit Royale",
        ),
    )

    /**
     * Connecte le wallet et renvoie l'adresse SANS signer — c'est elle qu'il
     * faut pour demander son challenge au serveur. L'autorisation est mémorisée
     * par l'adapter, donc le signIn qui suit ne redemande pas l'accord.
     */
    @JavascriptInterface
    fun getAddress() {
        activity.lifecycleScope.launch {
            val result = adapter.transact(sender) {
                Base58.encodeToString(it.accounts.first().publicKey)
            }
            when (result) {
                is TransactionResult.Success ->
                    resolve(JSONObject().put("address", result.payload!!).put("signature", ""))
                is TransactionResult.NoWalletFound -> reject("Aucun wallet trouvé sur cet appareil.")
                is TransactionResult.Failure -> reject(result.e.message ?: "Connexion refusée.")
            }
        }
    }

    /** Signe le challenge du serveur. Sur un Seeker, c'est le Seed Vault qui répond. */
    @JavascriptInterface
    fun signIn(message: String) {
        activity.lifecycleScope.launch {
            val result = adapter.transact(sender) {
                val pubkey = it.accounts.first().publicKey
                val signed = signMessagesDetached(
                    arrayOf(message.toByteArray(Charsets.UTF_8)),
                    arrayOf(pubkey),
                )
                Pair(
                    Base58.encodeToString(pubkey),
                    Base58.encodeToString(signed.messages.first().signatures.first()),
                )
            }
            when (result) {
                is TransactionResult.Success -> {
                    val (address, signature) = result.payload!!
                    resolve(JSONObject().put("address", address).put("signature", signature))
                }
                is TransactionResult.NoWalletFound -> reject("Aucun wallet trouvé sur cet appareil.")
                is TransactionResult.Failure -> reject(result.e.message ?: "Signature refusée.")
            }
        }
    }

    /**
     * Le token FCM de cet appareil, résolu côté page. La page le POSTe ensuite
     * au serveur pour recevoir les notifs même application fermée — un raid subi
     * pendant la nuit doit réveiller le joueur, pas l'attendre.
     */
    @JavascriptInterface
    fun getFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                post("window.__fcmResolve && window.__fcmResolve(${JSONObject.quote(task.result)})")
            } else {
                val msg = task.exception?.message ?: "token fcm indisponible"
                post("window.__fcmReject && window.__fcmReject(${JSONObject.quote(msg)})")
            }
        }
    }

    /** True côté JS : permet à la page de savoir qu'elle tourne dans l'app native. */
    @JavascriptInterface
    fun isAvailable(): Boolean = true

    private fun resolve(json: JSONObject) = post("window.__mwaResolve && window.__mwaResolve($json)")
    private fun reject(msg: String) =
        post("window.__mwaReject && window.__mwaReject(${JSONObject.quote(msg)})")

    private fun post(js: String) = webView.post { webView.evaluateJavascript(js, null) }
}
