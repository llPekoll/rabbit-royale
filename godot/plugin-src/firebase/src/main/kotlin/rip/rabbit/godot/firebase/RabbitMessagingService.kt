package rip.rabbit.godot.firebase

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * LA RÉCEPTION DES NOTIFICATIONS, JEU OUVERT OU FERMÉ.
 *
 * Le cas qui justifie tout ce plugin : le jeu est FERMÉ et quelqu'un pille le
 * terrier. La défense en direct n'a de valeur que si le joueur l'apprend
 * pendant que le raid dure encore — ce service est ce qui le lui dit.
 *
 * QUAND ON EST APPELÉ, ET QUAND ON NE L'EST PAS (règle de FCM, pas la nôtre) :
 *  - message data-only : onMessageReceived TOUJOURS, jeu ouvert ou fermé. C'est
 *    la forme que le serveur devrait préférer, parce qu'elle seule nous laisse
 *    choisir le canal (Raids en heads-up) à chaque fois.
 *  - message avec un bloc `notification` : onMessageReceived seulement jeu au
 *    premier plan. En arrière-plan, la bibliothèque l'affiche SANS NOUS, avec
 *    l'icône et le canal par défaut du manifest ; au tap, les clés `data` (dont
 *    `path`) arrivent comme extras de l'intent de lancement — le plugin les lit
 *    alors par le même chemin que les nôtres.
 */
class RabbitMessagingService : FirebaseMessagingService() {

	/**
	 * Le token change : réinstallation, restauration, purge par Android. Le
	 * serveur doit toujours avoir le dernier, sinon les notifications partent
	 * dans le vide sans que rien n'échoue visiblement.
	 *
	 * On ne l'envoie PAS au serveur d'ici : le POST demande la session du
	 * joueur, qui vit côté GDScript. On le passe au plugin s'il est en vie, et
	 * on le dépose toujours dans la boîte aux lettres pour le cas contraire.
	 */
	@Deprecated("FCM 25.1 : remplacé par onRegistered, toujours appelé pour getToken()")
	override fun onNewToken(token: String) = receiveToken(token)

	/**
	 * Le chemin de FCM 25.1+ (register() → onRegistered). On ne l'utilise pas
	 * encore — voir fetchPushToken — mais un token qui arriverait par là doit
	 * suivre exactement le même chemin qu'un onNewToken, pas se perdre.
	 */
	override fun onRegistered(token: String) = receiveToken(token)

	private fun receiveToken(token: String) {
		if (token.isEmpty()) return
		RabbitNotifications.savePendingToken(this, token)
		RabbitFirebasePlugin.instance?.deliverToken(token)
	}

	override fun onMessageReceived(message: RemoteMessage) {
		val data = message.data
		val notif = message.notification
		// Un message sans texte est un signal pour le jeu, pas pour le joueur :
		// ne rien afficher plutôt qu'une notification vide.
		val body = notif?.body ?: data["body"] ?: return
		val title = notif?.title ?: data["title"] ?: "Rabbit Royale"
		val channel = RabbitNotifications.channelFor(data["channel"] ?: notif?.channelId)
		RabbitNotifications.show(this, title, body, data["path"], channel)
	}
}
