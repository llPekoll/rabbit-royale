package rip.rabbit.godot.firebase

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.messaging.FirebaseMessaging
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot
import org.json.JSONException
import org.json.JSONObject

/**
 * FIREBASE, ATTEINT DEPUIS GODOT : Analytics et les notifications push.
 *
 * Le jeu ne voit jamais cette classe : il appelle une façade GDScript, qui
 * appelle ce singleton par son nom (Engine.get_singleton("RabbitFirebase")).
 * Hors Android — web, iOS, éditeur — le singleton n'existe pas, et c'est la
 * façade qui doit s'en accommoder, pas ce fichier.
 *
 * SANS google-services.json AU BUILD, TOUT CECI DORT. Le build passe (voir
 * plugin-src/firebase/build.gradle.kts), FirebaseApp n'est jamais initialisé,
 * et chaque méthode ci-dessous devient un no-op au lieu de lever
 * IllegalStateException("Default FirebaseApp is not initialized") — qui, levée
 * sur le thread de rendu depuis un appel GDScript, tuerait le jeu entier pour
 * une statistique.
 */
class RabbitFirebasePlugin(godot: Godot) : GodotPlugin(godot) {

	companion object {
		/**
		 * DOIT être égal au suffixe du meta-data dans AndroidManifest.xml
		 * (`org.godotengine.plugin.v2.RabbitFirebase`), à PLUGIN_NAME dans
		 * addons/RabbitFirebase/export_plugin.gd, et au nom que la façade
		 * GDScript passe à Engine.get_singleton.
		 */
		private const val PLUGIN_NAME = "RabbitFirebase"

		private const val TAG = RabbitNotifications.TAG

		/**
		 * Le requestCode de la demande POST_NOTIFICATIONS. Godot relaie à TOUS
		 * les plugins chaque résultat de permission ; c'est ce code qui nous
		 * dit que celui-ci est le nôtre. Sous 0xFFFF : FragmentActivity rejette
		 * les codes qui ne tiennent pas sur 16 bits.
		 */
		private const val REQ_NOTIFICATIONS = 0x5242

		/**
		 * Le token FCM, ou "" quand il n'y en a pas (Firebase non configuré,
		 * Play services absents, réseau). Toujours émis en réponse à
		 * fetchPushToken, même vide : une façade qui fait `await push_token`
		 * resterait suspendue pour toujours sinon.
		 */
		private val SIG_TOKEN = SignalInfo("push_token", String::class.java)

		/** Le `path` d'une notification tapée pendant que le jeu tournait. */
		private val SIG_OPENED = SignalInfo("push_opened", String::class.java)

		/**
		 * Le verdict de requestPushPermission. `javaObjectType` et pas
		 * `Boolean::class.java` : ce dernier est le primitif `boolean`, et
		 * emitSignal vérifie chaque argument par Class.isInstance — toujours
		 * faux pour un type primitif. Le signal serait refusé à chaque émission.
		 */
		private val SIG_PERMISSION =
			SignalInfo("push_permission", Boolean::class.javaObjectType)

		/**
		 * Le plugin vivant, pour RabbitMessagingService.onNewToken. Le service
		 * et le plugin partagent le processus mais pas de référence ; ce champ
		 * est le seul pont, et il est nul dès que l'activité est détruite.
		 */
		@Volatile
		internal var instance: RabbitFirebasePlugin? = null
	}

	private val appContext: Context? = getActivity()?.applicationContext

	/**
	 * FirebaseInitProvider tourne avant Application.onCreate : s'il a trouvé
	 * sa configuration, l'app par défaut existe déjà quand Godot construit ce
	 * plugin. getApps est la seule question qu'on peut poser sans risquer
	 * l'exception — getInstance() lève justement quand la réponse est non.
	 */
	private val firebaseReady: Boolean =
		appContext != null && FirebaseApp.getApps(appContext).isNotEmpty()

	private val analytics: FirebaseAnalytics? =
		if (firebaseReady) FirebaseAnalytics.getInstance(appContext!!) else null

	/** Le `path` de l'intent qui a lancé le jeu, en attente de consumeLaunchPath. */
	@Volatile
	private var launchPath: String = ""

	/** Un token déposé jeu fermé par le service, à rendre au premier tour. */
	private var pendingToken: String? = null

	init {
		instance = this
		appContext?.let {
			RabbitNotifications.ensureChannels(it)
			pendingToken = RabbitNotifications.pendingToken(it)
		}
		// PRIS ET RETIRÉ DE L'INTENT MAINTENANT, avant le premier onMainResume.
		// Sinon ce dernier le verrait aussi et émettrait push_opened au
		// démarrage à froid — avant que le moindre GDScript ne soit connecté,
		// donc dans le vide, et consumeLaunchPath rendrait ensuite "".
		launchPath = getActivity()?.intent?.let(::takePath).orEmpty()
		// Une ligne par tap, pour pouvoir dire au logcat du Seeker si une
		// notification qui « n'ouvre rien » est arrivée jusqu'ici ou non.
		if (launchPath.isNotEmpty()) Log.i(TAG, "launch path: $launchPath")
		if (!firebaseReady) {
			Log.i(TAG, "google-services.json absent au build : Firebase en veille")
		}
	}

	override fun getPluginName() = PLUGIN_NAME

	override fun getPluginSignals(): MutableSet<SignalInfo> =
		mutableSetOf(SIG_TOKEN, SIG_OPENED, SIG_PERMISSION)

	/**
	 * Le premier moment où GDScript écoute : Main::start() a rendu la main,
	 * donc les autoloads ont fait leur _ready et branché leurs signaux. Un
	 * token rendu plus tôt partirait dans le vide.
	 */
	override fun onGodotMainLoopStarted() {
		pendingToken?.let { deliverToken(it) }
		pendingToken = null
	}

	/**
	 * Le jeu revient au premier plan — peut-être parce qu'on a tapé une
	 * notification. GodotActivity.onNewIntent fait setIntent(nouvel intent)
	 * juste avant ce onResume ; le `path` est donc sur getIntent(), et Godot
	 * n'offre pas d'autre crochet onNewIntent aux plugins.
	 */
	override fun onMainResume() {
		val path = getActivity()?.intent?.let(::takePath)
		if (!path.isNullOrEmpty()) {
			Log.i(TAG, "push_opened: $path")
			emitSignal(SIG_OPENED.name, path)
		}
	}

	override fun onMainDestroy() {
		if (instance === this) instance = null
	}

	/** Firebase a-t-il été configuré au build ? Faux = tout est no-op. */
	@UsedByGodot
	fun isAvailable(): Boolean = firebaseReady

	// ─── Analytics ──────────────────────────────────────────────────────────

	/**
	 * Un évènement, ses paramètres en objet JSON.
	 *
	 * JSON et pas Dictionary : le pont JNI de Godot convertit un Dictionary en
	 * un objet Java qu'il faudrait re-typer clé par clé, et ses nombres
	 * arrivent tous en double. Le JSON garde la différence entre 3 et 3.0, qui
	 * est exactement celle qu'Analytics fait entre un long et un double.
	 *
	 * Les types, un pour un : entier → long, décimal → double, texte → string,
	 * booléen → long 0/1 (Analytics n'a pas de booléen ; 0/1 se somme et se
	 * filtre dans BigQuery, "true" ne se somme pas). Objet ou tableau imbriqué
	 * → son texte JSON, tronqué par Firebase à 100 caractères. null → omis.
	 *
	 * Un JSON invalide n'empêche PAS l'évènement de partir sans paramètres :
	 * perdre le comptage entier pour un paramètre mal formé serait pire.
	 */
	@UsedByGodot
	fun logEvent(name: String, paramsJson: String) {
		val analytics = this.analytics ?: return
		analytics.logEvent(name, bundleOf(paramsJson))
	}

	/** "" efface l'identifiant (déconnexion). */
	@UsedByGodot
	fun setUserId(id: String) {
		analytics?.setUserId(id.ifEmpty { null })
	}

	/** "" efface la propriété. */
	@UsedByGodot
	fun setUserProperty(name: String, value: String) {
		analytics?.setUserProperty(name, value.ifEmpty { null })
	}

	private fun bundleOf(json: String): Bundle? {
		if (json.isBlank()) return null
		val obj = try {
			JSONObject(json)
		} catch (e: JSONException) {
			Log.w(TAG, "logEvent: paramètres JSON invalides, envoyé sans : $json")
			return null
		}
		val bundle = Bundle()
		for (key in obj.keys()) {
			when (val value = obj.opt(key)) {
				null, JSONObject.NULL -> Unit
				is Boolean -> bundle.putLong(key, if (value) 1L else 0L)
				// org.json rend Integer pour "3", Long au-delà de 2^31, Double
				// pour "3.0" — la distinction du texte JSON est préservée.
				is Int, is Long -> bundle.putLong(key, (value as Number).toLong())
				is Number -> bundle.putDouble(key, value.toDouble())
				is String -> bundle.putString(key, value)
				else -> bundle.putString(key, value.toString())
			}
		}
		return bundle
	}

	// ─── Notifications ──────────────────────────────────────────────────────

	/**
	 * Demande la permission de notifier (Android 13+), puis, si elle est
	 * accordée, va chercher le token : la façade n'a qu'un appel à faire et
	 * qu'un signal à attendre.
	 *
	 * SOUS ANDROID 13 il n'y a rien à demander — la permission n'existe pas à
	 * l'exécution — donc on saute directement au token. push_permission y
	 * reflète tout de même areNotificationsEnabled, pour que la façade sache
	 * si le joueur a coupé les notifications dans les réglages.
	 *
	 * Déjà accordée : pas de dialogue, token directement. Refusée pour de bon
	 * (deux refus) : Android ne montre plus rien et répond « refusé » tout de
	 * suite — le jeu ne doit donc pas appeler ceci en boucle en espérant
	 * mieux, mais renvoyer vers les réglages.
	 */
	@UsedByGodot
	fun requestPushPermission() {
		val activity = getActivity() ?: return emitSignal(SIG_PERMISSION.name, false)
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
			emitSignal(
				SIG_PERMISSION.name,
				NotificationManagerCompat.from(activity).areNotificationsEnabled(),
			)
			fetchPushToken()
			return
		}
		val permission = Manifest.permission.POST_NOTIFICATIONS
		if (ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED) {
			emitSignal(SIG_PERMISSION.name, true)
			fetchPushToken()
			return
		}
		// Sur le thread UI : @UsedByGodot est appelé depuis le thread de rendu,
		// et le dialogue système n'aime pas être ouvert d'ailleurs. Celui de
		// l'activité, pas GodotPlugin.runOnUiThread, déprécié en 4.7.
		activity.runOnUiThread {
			ActivityCompat.requestPermissions(activity, arrayOf(permission), REQ_NOTIFICATIONS)
		}
	}

	/**
	 * La réponse du dialogue. GodotActivity → Godot → chaque plugin, avec le
	 * requestCode d'origine ; Godot émet aussi de son côté
	 * OS.on_request_permissions_result, qu'on peut ignorer.
	 */
	override fun onMainRequestPermissionsResult(
		requestCode: Int,
		permissions: Array<out String>?,
		grantResults: IntArray?,
	) {
		if (requestCode != REQ_NOTIFICATIONS) return
		val granted = grantResults?.firstOrNull() == PackageManager.PERMISSION_GRANTED
		emitSignal(SIG_PERMISSION.name, granted)
		if (granted) fetchPushToken()
	}

	/**
	 * Le token actuel, émis sur push_token. À appeler une fois connecté : c'est
	 * GDScript qui a la session pour l'envoyer au serveur.
	 *
	 * Un fetch réussi vide la boîte aux lettres du service : le token frais
	 * remplace forcément celui qu'on y avait déposé.
	 */
	@UsedByGodot
	fun fetchPushToken() {
		if (!firebaseReady) return emitSignal(SIG_TOKEN.name, "")
		// getToken est DÉPRÉCIÉ depuis firebase-messaging 25.1 au profit de
		// register() + FirebaseMessagingService.onRegistered. Gardé exprès : il
		// fonctionne toujours, il rend le token ICI, en réponse directe à la
		// demande de GDScript, là où register() le ferait arriver plus tard par
		// le service. Le service écoute déjà onRegistered, donc la bascule le
		// jour où getToken disparaîtra se limite à cette fonction.
		@Suppress("DEPRECATION")
		FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
			val token = if (task.isSuccessful) task.result.orEmpty() else {
				Log.w(TAG, "fetchPushToken failed", task.exception)
				""
			}
			emitSignal(SIG_TOKEN.name, token)
			if (token.isNotEmpty()) appContext?.let(RabbitNotifications::clearPendingToken)
		}
	}

	/**
	 * Le `path` de la notification qui a LANCÉ le jeu (démarrage à froid), puis
	 * "" à tous les appels suivants. Tirer plutôt que pousser : à froid, aucun
	 * signal émis à la construction n'aurait d'auditeur. La façade l'appelle
	 * quand elle est prête à naviguer — après la connexion, typiquement.
	 */
	@UsedByGodot
	fun consumeLaunchPath(): String = synchronized(this) {
		val path = launchPath
		launchPath = ""
		path
	}

	/**
	 * Appelé par le service quand le token change jeu ouvert. N'efface PAS la
	 * boîte aux lettres : rien ne garantit qu'un GDScript écoutait à cet
	 * instant, et le token doit survivre jusqu'au prochain fetch réussi.
	 */
	internal fun deliverToken(token: String) {
		emitSignal(SIG_TOKEN.name, token)
	}

	/** Lit et RETIRE l'extra : un même tap ne doit naviguer qu'une fois. */
	private fun takePath(intent: Intent): String? {
		val path = intent.getStringExtra(RabbitNotifications.EXTRA_PATH) ?: return null
		intent.removeExtra(RabbitNotifications.EXTRA_PATH)
		return path
	}
}
