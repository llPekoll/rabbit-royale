package `fun`.rabbitroyale.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Réception des notifications natives.
 *
 * Ce service existe pour le cas qui compte : l'application est FERMÉE. Une
 * notification web ne partirait pas, or c'est exactement le moment où le joueur
 * doit apprendre qu'on a pillé son terrier — le PvP ne fonctionne que si la
 * riposte est possible avant que le voleur ait tout dépensé.
 */
class RoyaleMessagingService : FirebaseMessagingService() {

    /**
     * Le token change (réinstallation, restauration, purge par Android). Le
     * serveur doit toujours avoir le dernier, sinon les notifs partent dans le
     * vide sans que rien n'échoue visiblement.
     */
    override fun onNewToken(token: String) {
        // La page enregistre le token dès qu'elle est chargée et authentifiée
        // (le POST a besoin de la session). On ne peut pas le faire ici sans
        // dupliquer l'auth, donc on laisse le prochain lancement s'en charger.
        getSharedPreferences("rr", MODE_PRIVATE).edit().putString("pending_fcm_token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "Rabbit Royale"
        val body = message.notification?.body ?: message.data["body"] ?: return

        ensureChannel()

        // Rouvrir l'app sur l'écran concerné : une notif "on t'a pillé" qui
        // atterrit sur l'accueil oblige à re-naviguer, ce qui perd la moitié
        // des joueurs en route.
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            message.data["path"]?.let { putExtra("path", it) }
        }
        val pending = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notif = NotificationCompat.Builder(this, getString(R.string.notif_channel_id))
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pending)
            .build()

        // Android 13+ : sans la permission accordée, notify() est ignoré en
        // silence — d'où la demande à l'exécution dans MainActivity.
        try {
            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), notif)
        } catch (_: SecurityException) {
            // Permission refusée par l'utilisateur : rien à faire, et surtout
            // pas planter.
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            getString(R.string.notif_channel_id),
            getString(R.string.notif_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = getString(R.string.notif_channel_desc) }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
