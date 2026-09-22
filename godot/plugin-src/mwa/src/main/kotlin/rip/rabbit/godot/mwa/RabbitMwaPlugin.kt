package rip.rabbit.godot.mwa

import androidx.activity.ComponentActivity
import com.funkatronics.encoders.Base58
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot

/**
 * LE SEED VAULT, ATTEINT DEPUIS GODOT.
 *
 * Le pendant natif de scripts/wallet.gd. Le jeu ne voit jamais cette classe :
 * il appelle la façade GDScript, qui appelle ce singleton par son nom.
 *
 * Le protocole serveur est celui du client web, à l'octet près — même
 * challenge, même signature base58 — donc le serveur n'apprend pas qu'un
 * second client existe. C'est délibéré : android/.../WalletBridge.kt fait
 * exactement la même chose derrière une WebView, et les deux doivent rester
 * interchangeables.
 *
 * DEUX APPELS, PAS UN. `getAddress` autorise sans signer, parce que le
 * challenge est frappé POUR une adresse : il n'y a rien à signer tant que le
 * wallet n'en a pas nommé une. L'autorisation est mémorisée par l'adapter, donc
 * le `signIn` qui suit ne redemande pas l'accord.
 */
class RabbitMwaPlugin(godot: Godot) : GodotPlugin(godot) {

	companion object {
		/**
		 * DOIT être égal au suffixe du meta-data dans AndroidManifest.xml
		 * (`org.godotengine.plugin.v2.RabbitMWA`) ET à SINGLETON dans
		 * scripts/wallet.gd. Trois endroits, un seul nom : l'engine enregistre
		 * le singleton sous ce nom exact.
		 */
		private const val PLUGIN_NAME = "RabbitMWA"

		/**
		 * L'adresse seule, sans signature. Arg vide = refus ou absence de
		 * wallet ; wallet.gd le lit comme "l'utilisateur a fermé la feuille".
		 */
		private val SIG_ADDRESS = SignalInfo("address_received", String::class.java)

		/** L'adresse ET la signature base58, dans cet ordre. */
		private val SIG_SIGNED =
			SignalInfo("signed", String::class.java, String::class.java)

		/**
		 * Un vrai échec, déjà rédigé pour l'écran. Un refus n'en est PAS un :
		 * il arrive comme un argument vide sur les signaux ci-dessus.
		 */
		private val SIG_ERROR = SignalInfo("wallet_error", String::class.java)
	}

	/**
	 * CONSTRUIT ICI, ET NULLE PART AILLEURS.
	 *
	 * `ActivityResultSender` appelle `registerForActivityResult` dans son
	 * initialiseur de propriété, et AndroidX exige que cet enregistrement soit
	 * fait AVANT que l'activité n'atteigne STARTED — sinon IllegalStateException
	 * ("must be called before onStart"). C'est la contrainte que
	 * android/.../MainActivity.kt documente déjà pour la coquille WebView.
	 *
	 * Un plugin Godot est instancié par GodotPluginRegistry depuis
	 * GodotFragment.onCreate → initEngine, donc pendant onCreate : ici, nous
	 * sommes en règle.
	 *
	 * NE JAMAIS le rendre paresseux (`by lazy`) ni le créer dans une méthode
	 * @UsedByGodot : appelée depuis GDScript, l'activité est RESUMED depuis
	 * longtemps et l'enregistrement lèverait. C'est LE piège de ce fichier.
	 */
	private val sender: ActivityResultSender? =
		(getActivity() as? ComponentActivity)?.let { ActivityResultSender(it) }

	private val adapter = MobileWalletAdapter(
		connectionIdentity = ConnectionIdentity(
			identityUri = android.net.Uri.parse("https://rabbit.rip"),
			iconUri = android.net.Uri.parse("/favicon.svg"),
			identityName = "Rabbit Royale",
		),
	)

	/**
	 * Notre propre scope, sur le thread principal.
	 *
	 * Pas le render thread : `transact` est suspend et attend `whenResumed`,
	 * donc l'y lancer bloquerait le rendu du jeu derrière une feuille système.
	 * SupervisorJob pour qu'une connexion refusée n'annule pas la suivante.
	 */
	private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

	override fun getPluginName() = PLUGIN_NAME

	override fun getPluginSignals(): MutableSet<SignalInfo> =
		mutableSetOf(SIG_ADDRESS, SIG_SIGNED, SIG_ERROR)

	/**
	 * Y a-t-il un wallet à qui parler ? Faux quand l'activité n'est pas une
	 * ComponentActivity — auquel cas le sender n'a pas pu être construit et
	 * rien ici ne peut fonctionner. Le doorstep grise le bouton là-dessus.
	 */
	@UsedByGodot
	fun isAvailable(): Boolean = sender != null

	/**
	 * L'adresse, sans rien signer. Première moitié d'une connexion.
	 */
	@UsedByGodot
	fun getAddress() {
		val sender = this.sender ?: return fail(SIG_ADDRESS, "")
		scope.launch {
			when (val result = adapter.transact(sender) {
				Base58.encodeToString(it.accounts.first().publicKey)
			}) {
				is TransactionResult.Success ->
					emitSignal(SIG_ADDRESS.name, result.payload.orEmpty())
				// Pas de wallet installé : un vrai échec, à dire.
				is TransactionResult.NoWalletFound -> fail(SIG_ADDRESS, "no_wallet")
				// Fermer la feuille arrive ici aussi. On ne peut pas distinguer
				// un refus d'une panne, donc on choisit le silence : une alarme
				// pour un geste volontaire est la pire des deux erreurs.
				is TransactionResult.Failure -> emitSignal(SIG_ADDRESS.name, "")
			}
		}
	}

	/**
	 * Signe le challenge du serveur. Sur un Seeker, c'est le Seed Vault qui
	 * répond.
	 *
	 * `signMessagesDetached` signe des octets arbitraires : on lui donne le
	 * message en UTF-8 et la signature revient en base58, exactement la forme
	 * que verifySignature attend côté serveur.
	 */
	@UsedByGodot
	fun signIn(message: String) {
		val sender = this.sender ?: return fail(SIG_SIGNED, "")
		scope.launch {
			when (val result = adapter.transact(sender) {
				val pubkey = it.accounts.first().publicKey
				val signed = signMessagesDetached(
					arrayOf(message.toByteArray(Charsets.UTF_8)),
					arrayOf(pubkey),
				)
				Pair(
					Base58.encodeToString(pubkey),
					Base58.encodeToString(signed.messages.first().signatures.first()),
				)
			}) {
				is TransactionResult.Success -> {
					val (address, signature) = result.payload!!
					emitSignal(SIG_SIGNED.name, address, signature)
				}
				is TransactionResult.NoWalletFound -> fail(SIG_SIGNED, "no_wallet")
				is TransactionResult.Failure -> emitSignal(SIG_SIGNED.name, "", "")
			}
		}
	}

	/**
	 * Un échec rapporté sur DEUX canaux : le signal d'erreur pour l'écran, et
	 * le signal attendu avec des arguments vides — parce que wallet.gd attend
	 * ce dernier et resterait suspendu pour toujours sans lui.
	 */
	private fun fail(signal: SignalInfo, reason: String) {
		if (reason.isNotEmpty()) emitSignal(SIG_ERROR.name, reason)
		// Autant d'arguments vides que la signature en déclare.
		when (signal.name) {
			SIG_SIGNED.name -> emitSignal(SIG_SIGNED.name, "", "")
			else -> emitSignal(SIG_ADDRESS.name, "")
		}
	}
}
