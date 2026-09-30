package rip.rabbit.godot.firebase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * CE QUE LE PLUGIN ET LE SERVICE PARTAGENT : les canaux, l'intent de retour, la
 * boîte aux lettres du token.
 *
 * Un objet à part parce que les deux côtés ne vivent pas en même temps. Le
 * plugin n'existe que tant que l'activité Godot tourne ; le service est réveillé
 * par Google Play services, jeu fermé, sans qu'aucun plugin n'ait jamais été
 * construit dans ce processus. Ce qui doit marcher dans les deux cas ne peut
 * appartenir à aucun des deux.
 */
internal object RabbitNotifications {
	const val TAG = "RabbitFirebase"

	/** Les ids sont figés : Android garde un canal par id pour toujours, avec
	 *  les réglages que le joueur y a faits. Renommer l'id en crée un second. */
	const val CHANNEL_DEFAULT = "rr_default"
	const val CHANNEL_RAID = "rr_raid"

	/** L'extra que l'activité reçoit au tap, lu par le plugin. Même nom que
	 *  dans la coquille WebView (android/…/RoyaleMessagingService.kt) et que la
	 *  clé `data.path` du message : le serveur n'a qu'un seul mot à connaître. */
	const val EXTRA_PATH = "path"

	private const val PREFS = "rabbit_firebase"
	private const val KEY_PENDING_TOKEN = "pending_push_token"

	/**
	 * Crée les deux canaux. Idempotent : Android ignore la création d'un canal
	 * qui existe déjà, et ne touche PAS aux réglages que le joueur y a changés
	 * (seuls nom et description se mettent à jour). On peut donc l'appeler à
	 * chaque init et à chaque message sans rien écraser.
	 *
	 * Les noms sont en dur, pas en ressources : ils s'affichent dans les
	 * réglages système du jeu, et le jeu n'est pour l'instant qu'en anglais
	 * côté Android. Les passer en values-xx/ le jour où ce ne sera plus vrai.
	 */
	fun ensureChannels(context: Context) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
		val manager = context.getSystemService(NotificationManager::class.java) ?: return
		manager.createNotificationChannel(
			NotificationChannel(
				CHANNEL_DEFAULT,
				"Rabbit Royale",
				NotificationManager.IMPORTANCE_DEFAULT,
			)
		)
		// HIGH = heads-up : la bannière descend par-dessus l'app en cours. C'est
		// réservé aux raids parce que c'est le seul cas où quelques minutes
		// comptent — la défense en direct n'a de sens que si le joueur arrive
		// pendant que le pillard est encore sur son terrier.
		manager.createNotificationChannel(
			NotificationChannel(
				CHANNEL_RAID,
				"Raids",
				NotificationManager.IMPORTANCE_HIGH,
			).apply { description = "Someone is raiding your burrow." }
		)
	}

	/**
	 * Le serveur choisit le canal par `data.channel` (ou par le channel_id du
	 * bloc notification). On accepte "raid" comme "rr_raid" : le premier est ce
	 * qu'on écrit naturellement côté serveur, le second est l'id réel.
	 * Tout le reste retombe sur le canal par défaut plutôt que sur un canal
	 * inexistant, où Android 8+ JETTE la notification sans rien dire.
	 */
	fun channelFor(requested: String?): String = when (requested) {
		CHANNEL_RAID, "raid" -> CHANNEL_RAID
		else -> CHANNEL_DEFAULT
	}

	/**
	 * L'intent qui rouvre le jeu sur `path`.
	 *
	 * On passe par getLaunchIntentForPackage plutôt que de nommer l'activité :
	 * elle s'appelle com.godot.game.GodotApp aujourd'hui, mais c'est un détail
	 * du modèle de compilation de Godot, pas de ce plugin.
	 *
	 * SINGLE_TOP | CLEAR_TOP : si le jeu tourne déjà, la MÊME activité reçoit
	 * onNewIntent (que GodotActivity transforme en setIntent) au lieu d'en
	 * empiler une seconde — deux moteurs Godot dans une tâche, c'est un crash.
	 */
	fun openGameIntent(context: Context, path: String?): Intent? =
		context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
			addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
			if (!path.isNullOrEmpty()) putExtra(EXTRA_PATH, path)
		}

	fun show(context: Context, title: String, body: String, path: String?, channel: String) {
		ensureChannels(context)
		val id = System.currentTimeMillis().toInt()
		val intent = openGameIntent(context, path)
		// requestCode = id, PAS 0. Deux PendingIntent de même requestCode et de
		// même intent (les extras ne comptent pas dans l'égalité) sont LE MÊME
		// objet pour Android : avec FLAG_UPDATE_CURRENT, la deuxième
		// notification réécrirait le `path` de la première, et taper sur « raid
		// en cours » ouvrirait l'écran de la saison.
		val pending = intent?.let {
			PendingIntent.getActivity(
				context, id, it,
				PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
			)
		}
		val notification = NotificationCompat.Builder(context, channel)
			.setSmallIcon(R.drawable.rr_notification_icon)
			.setContentTitle(title)
			.setContentText(body)
			.setStyle(NotificationCompat.BigTextStyle().bigText(body))
			.setAutoCancel(true)
			// Pour Android < 8, où le canal n'existe pas et où seule la
			// priorité décide du heads-up.
			.setPriority(
				if (channel == CHANNEL_RAID) NotificationCompat.PRIORITY_HIGH
				else NotificationCompat.PRIORITY_DEFAULT
			)
			.apply { if (pending != null) setContentIntent(pending) }
			.build()
		try {
			NotificationManagerCompat.from(context).notify(id, notification)
		} catch (e: SecurityException) {
			// POST_NOTIFICATIONS refusée (Android 13+). Rien à faire — et
			// surtout pas planter le service, que FCM relancerait en boucle.
			Log.i(TAG, "notification dropped: permission denied")
		}
	}

	/**
	 * LA BOÎTE AUX LETTRES DU TOKEN.
	 *
	 * onNewToken peut tomber jeu fermé : le service tourne, aucun GDScript
	 * n'écoute. On le dépose ici, et le plugin le relève à sa prochaine
	 * construction. Il n'est vidé qu'après un fetchPushToken réussi — le seul
	 * moment où l'on SAIT qu'un GDScript écoute, puisqu'il vient de le demander
	 * — jamais à la lecture : un token lu puis perdu serait un joueur qui ne
	 * reçoit plus rien, sans que rien n'ait échoué. Il peut donc être rendu
	 * deux fois ; le serveur doit enregistrer un token de façon idempotente.
	 */
	fun savePendingToken(context: Context, token: String) {
		prefs(context).edit().putString(KEY_PENDING_TOKEN, token).apply()
	}

	fun pendingToken(context: Context): String? =
		prefs(context).getString(KEY_PENDING_TOKEN, null)?.takeIf { it.isNotEmpty() }

	fun clearPendingToken(context: Context) {
		prefs(context).edit().remove(KEY_PENDING_TOKEN).apply()
	}

	private fun prefs(context: Context) =
		context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
