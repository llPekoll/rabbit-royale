package rip.rabbit.godot.firebase

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.system.OsConstants
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.FirebaseAnalytics.ConsentStatus
import com.google.firebase.analytics.FirebaseAnalytics.ConsentType
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.messaging.FirebaseMessaging
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot
import org.json.JSONException
import org.json.JSONObject

/**
 * FIREBASE, ATTEINT DEPUIS GODOT : Analytics, Crashlytics et les
 * notifications push.
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

		/**
		 * La sonde de debug : `adb shell am start -n rip.rabbit.royale/com.godot.game.GodotAppLauncher
		 * --es rr_firebase_probe <mode>` — voir runDebugProbe. Ignorée dans un
		 * APK non débogable.
		 */
		private const val EXTRA_DEBUG_PROBE = "rr_firebase_probe"

		/**
		 * `[0] _send (res://scripts/net.gd:124)` — le format de
		 * ScriptBacktrace.format() (Godot 4.5+), une ligne par frame, la plus
		 * récente d'abord. Le nom de fonction peut contenir des espaces
		 * (`<anonymous lambda>`) : il court jusqu'à la parenthèse qui ouvre le
		 * chemin, et le numéro de ligne se prend après le DERNIER `:` — celui
		 * de `res://` n'est pas suivi de chiffres.
		 */
		private val FRAME_BACKTRACE = Regex("""^\s*\[\d+]\s+(.*?)\s+\((.*):(\d+)\)\s*$""")

		/**
		 * `Frame 0 - res://scripts/net.gd:124 in function '_send'` — le format
		 * de print_stack()/get_stack() mis en texte, qu'une façade plus
		 * ancienne pourrait encore envoyer. Accepté aussi : il ne coûte qu'une
		 * regex, et une trace qu'on n'arrive pas à lire est une trace perdue.
		 */
		private val FRAME_PRINT_STACK = Regex("""^\s*Frame\s+\d+\s+-\s+(.*):(\d+)\s+in function\s+'(.*)'\s*$""")
	}

	/**
	 * UNE ERREUR GDSCRIPT, HABILLÉE EN EXCEPTION JAVA POUR CRASHLYTICS.
	 *
	 * Crashlytics ne sait regrouper que des Throwable, et il les regroupe par
	 * leur PILE, pas par leur message. Une exception levée ici porterait la
	 * pile du pont JNI — la même pour toutes les erreurs du jeu, donc un seul
	 * « problème » géant dans la console. On remplace donc sa pile par celle
	 * du GDScript : chaque ligne du script qui échoue devient son propre
	 * problème, titré `net.gd:124`.
	 *
	 * Le nom de la classe est ce que la console affiche comme type : il doit
	 * dire d'où vient l'erreur, pas qu'elle est passée par Kotlin.
	 */
	class GDScriptError(message: String, frames: Array<StackTraceElement>) : Exception(message) {
		init {
			stackTrace = frames
		}

		// Rien à capturer : la pile Java d'ici ne dit rien, et on la
		// remplace de toute façon. Évite aussi de la calculer pour rien.
		override fun fillInStackTrace(): Throwable = this
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

	/**
	 * Déjà démarré quand on arrive ici : Crashlytics est un composant « eager »
	 * de FirebaseApp, lancé par FirebaseInitProvider avec l'app elle-même —
	 * donc avant le moteur, et c'est ce qui lui permet d'attraper un plantage
	 * natif de Godot au chargement. Nul exactement quand analytics l'est.
	 */
	private val crashlytics: FirebaseCrashlytics? =
		if (firebaseReady) FirebaseCrashlytics.getInstance() else null

	/**
	 * L'APK est-il débogable (export debug de Godot) ? C'est le drapeau du
	 * MANIFESTE FUSIONNÉ, pas le BuildConfig de cet AAR : un AAR debug peut
	 * finir dans un APK release, alors que ce drapeau-ci, Play refuse de
	 * publier un APK qui le porte. Il garde les méthodes de test.
	 */
	private val debuggable: Boolean =
		appContext != null && (appContext.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

	/** Le mode de la sonde de debug, lu sur l'intent de lancement. */
	private var debugProbe: String = ""

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
		if (debuggable) {
			debugProbe = getActivity()?.intent?.getStringExtra(EXTRA_DEBUG_PROBE).orEmpty()
		}
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
		if (debugProbe.isNotEmpty()) runDebugProbe(debugProbe)
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

	/**
	 * "" efface l'identifiant (déconnexion). Le MÊME pour Analytics et
	 * Crashlytics : un plantage se retrouve ainsi à côté du parcours du même
	 * joueur. Crashlytics veut une chaîne non nulle — "" y vaut effacement.
	 */
	@UsedByGodot
	fun setUserId(id: String) {
		analytics?.setUserId(id.ifEmpty { null })
		crashlytics?.setUserId(id)
	}

	/** "" efface la propriété. */
	@UsedByGodot
	fun setUserProperty(name: String, value: String) {
		analytics?.setUserProperty(name, value.ifEmpty { null })
	}

	/**
	 * CONSENT MODE v2 : ce que le joueur (ou sa région) autorise.
	 *
	 * `analyticsGranted` → ANALYTICS_STORAGE : l'identifiant d'instance, donc
	 * les sessions et la rétention par joueur. `adsGranted` → les trois
	 * autres d'un coup (AD_STORAGE, AD_USER_DATA, AD_PERSONALIZATION) : le jeu
	 * n'a pas d'écran qui les distingue, et v2 exige que AD_USER_DATA et
	 * AD_PERSONALIZATION soient dits explicitement — un v1 qui ne donnait
	 * qu'AD_STORAGE les laisserait à leur défaut du manifeste.
	 *
	 * Le SDK RETIENT la réponse d'un lancement à l'autre ; la redire à chaque
	 * démarrage ne coûte rien et répare un état qu'on aurait perdu. Avant tout
	 * appel, ce sont les défauts du manifeste qui valent : tout refusé.
	 *
	 * Crashlytics n'est PAS concerné : voir le manifeste.
	 */
	@UsedByGodot
	fun setConsent(analyticsGranted: Boolean, adsGranted: Boolean) {
		val analytics = this.analytics ?: return
		val a = if (analyticsGranted) ConsentStatus.GRANTED else ConsentStatus.DENIED
		val ads = if (adsGranted) ConsentStatus.GRANTED else ConsentStatus.DENIED
		analytics.setConsent(
			mapOf(
				ConsentType.ANALYTICS_STORAGE to a,
				ConsentType.AD_STORAGE to ads,
				ConsentType.AD_USER_DATA to ads,
				ConsentType.AD_PERSONALIZATION to ads,
			)
		)
		Log.i(TAG, "consent: analytics=$analyticsGranted ads=$adsGranted")
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

	// ─── Crashlytics ────────────────────────────────────────────────────────
	//
	// LES PLANTAGES, EUX, NE PASSENT PAS PAR ICI. Une exception Java non
	// rattrapée est prise par le gestionnaire que Crashlytics installe au
	// démarrage ; un SIGSEGV du moteur, par celui du NDK. Ce qui suit ne sert
	// qu'à ce que le jeu SAIT : ses erreurs non fatales, le fil des
	// évènements qui précède un plantage, et des clés qui le situent.
	//
	// Toujours actif, consentement ou pas (voir le manifeste) ; muet seulement
	// si Firebase n'est pas configuré. Aucune de ces méthodes n'attend : le
	// SDK écrit sur son propre fil, jamais sur celui du rendu.

	/**
	 * UNE ERREUR NON FATALE : un push_error, une réponse serveur qu'on n'a pas
	 * su lire, un état impossible. `stack` est le texte de
	 * ScriptBacktrace.format() (ou de print_stack) : chaque frame reconnue
	 * devient un StackTraceElement("GDScript", fonction, fichier, ligne), ce
	 * qui fait regrouper Crashlytics par ligne de script. Les lignes non
	 * reconnues (l'en-tête « GDScript backtrace… », les variables) sont sautées.
	 *
	 * Sans aucune frame lisible, une seule frame `GDScript.<no backtrace>`
	 * plutôt qu'une pile vide, que la console ne saurait pas titrer : toutes
	 * ces erreurs-là finissent dans un même problème, et c'est le signal
	 * qu'un appelant oublie sa trace.
	 *
	 * Écrites sur le disque tout de suite, ENVOYÉES AU LANCEMENT SUIVANT (la
	 * collecte automatique étant active, sendUnsentReports n'y change rien) ;
	 * le SDK n'en garde que les 8 dernières par session.
	 */
	@UsedByGodot
	fun recordError(message: String, stack: String) {
		val crashlytics = this.crashlytics ?: return
		crashlytics.recordException(GDScriptError(message, parseGdStack(stack)))
	}

	/**
	 * Une ligne du fil d'Ariane : les 64 Ko de journal les plus récents
	 * accompagnent le prochain rapport, fatal ou non. Pour « ce que faisait le
	 * joueur juste avant » — changement d'écran, requête envoyée, raid lancé.
	 */
	@UsedByGodot
	fun crashLog(message: String) {
		crashlytics?.log(message)
	}

	/**
	 * Une clé posée sur tous les rapports suivants (écran, niveau, version du
	 * serveur…). Au plus 64 clés ; une valeur est tronquée à 1 Ko. Toujours
	 * du texte : c'est ce que la console filtre, et le pont JNI n'a pas à
	 * choisir entre les surcharges int/long/double/bool.
	 */
	@UsedByGodot
	fun setCrashKey(key: String, value: String) {
		crashlytics?.setCustomKey(key, value)
	}

	/**
	 * DEBUG SEULEMENT : un plantage Java, pour vérifier la chaîne de bout en
	 * bout. Levée sur le thread UI, hors de toute pile Godot, pour que ce soit
	 * le gestionnaire de Crashlytics qui la voie, et non le pont JNI qui la
	 * transformerait en erreur GDScript. Le rapport est écrit et confié à
	 * DataTransport avant que le processus meure ; l'envoi HTTP, lui, se fait
	 * au lancement suivant (vu au logcat : « Status Code: 200 »).
	 * No-op (et un avertissement) dans un APK non débogable.
	 */
	@UsedByGodot
	fun testCrash() {
		if (!debuggable) {
			Log.w(TAG, "testCrash ignoré : APK non débogable")
			return
		}
		val activity = getActivity() ?: return
		Log.w(TAG, "testCrash: plantage Java volontaire")
		activity.runOnUiThread {
			throw RuntimeException("RabbitFirebase.testCrash — plantage Java volontaire")
		}
	}

	/**
	 * DEBUG SEULEMENT : un SIGSEGV envoyé au processus, pour vérifier le volet
	 * NDK. Pas de JNI : Process.sendSignal suffit, et le gestionnaire du NDK
	 * le reçoit comme n'importe quel SIGSEGV. Ce n'est pas un vrai accès
	 * mémoire invalide dans le moteur ; pour celui-là, `OS.crash()` côté
	 * GDScript fait planter Godot lui-même (CRASH_NOW, un trap natif).
	 *
	 * Le minidump est écrit au moment du signal, transformé en rapport et
	 * envoyé AU LANCEMENT SUIVANT (finalizePreviousNativeSession). Envoyé
	 * après le démarrage du moteur, il prouve aussi que Godot n'a pas
	 * remplacé le gestionnaire de signaux du NDK par le sien.
	 */
	@UsedByGodot
	fun testNativeCrash() {
		if (!debuggable) {
			Log.w(TAG, "testNativeCrash ignoré : APK non débogable")
			return
		}
		Log.w(TAG, "testNativeCrash: SIGSEGV volontaire")
		Process.sendSignal(Process.myPid(), OsConstants.SIGSEGV)
	}

	private fun parseGdStack(stack: String): Array<StackTraceElement> {
		val frames = stack.lineSequence().mapNotNull { line ->
			FRAME_BACKTRACE.matchEntire(line)?.destructured?.let { (fn, file, ln) ->
				StackTraceElement("GDScript", fn, file, ln.toInt())
			} ?: FRAME_PRINT_STACK.matchEntire(line)?.destructured?.let { (file, ln, fn) ->
				StackTraceElement("GDScript", fn, file, ln.toInt())
			}
		}.toList()
		return frames.ifEmpty { listOf(StackTraceElement("GDScript", "<no backtrace>", null, -1)) }
			.toTypedArray()
	}

	/**
	 * LA SONDE : appeler l'API Crashlytics/consentement sans une ligne de
	 * GDScript, pour vérifier un APK de debug au logcat (émulateur ou
	 * Seeker). Lancée au premier tour de boucle, comme le ferait le jeu :
	 *
	 *   adb shell am start -S -n rip.rabbit.royale/com.godot.game.GodotAppLauncher \
	 *     --es rr_firebase_probe <mode>
	 *
	 *   probe  → setConsent(true, false), crashLog, setCrashKey, puis
	 *            recordError avec une trace GDScript factice (envoyée au
	 *            lancement suivant) ;
	 *   crash  → testCrash() ;   native → testNativeCrash().
	 *
	 * Lue seulement si l'APK est débogable : un APK de Play l'ignore.
	 */
	private fun runDebugProbe(mode: String) {
		Log.i(TAG, "debug probe: $mode")
		when (mode) {
			"probe" -> {
				setConsent(true, false)
				crashLog("probe: breadcrumb")
				setCrashKey("probe", "yes")
				recordError(
					"probe: erreur GDScript factice",
					"GDScript backtrace (most recent call first):\n" +
						"    [0] _send (res://scripts/net.gd:124)\n" +
						"    [1] <anonymous lambda> (res://scripts/ui/shop.gd:57)\n",
				)
			}
			"crash" -> testCrash()
			"native" -> testNativeCrash()
		}
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
