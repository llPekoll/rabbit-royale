/* LE SERVICE WORKER DES NOTIFICATIONS WEB (Firebase Cloud Messaging).
 *
 * Servi sous /play/ et enregistre par shell.html avec la portee /play/ : il ne
 * voit que la page du jeu, jamais l'accueil ni le deck. Il n'a PAS de `fetch`
 * — il ne met rien en cache et ne touche a aucune requete : le jeu se charge
 * exactement comme sans lui (le sw.js du site, a la racine, garde sa page hors
 * ligne pour le reste).
 *
 * DEUX CHOSES, et c'est tout :
 *   1. Un message qui arrive onglet ferme ou cache : le SDK l'affiche seul
 *      quand il porte un bloc `notification` (ce que le serveur envoie,
 *      src/lib/notify/fcm.ts) ; un message DATA seul est affiche ici.
 *   2. La tape sur la notification : on rouvre le jeu sur le bon ecran —
 *      l'onglet du jeu deja ouvert est ramene au premier plan et recoit le
 *      chemin (postMessage, relaye a Godot par shell.html) ; sinon un onglet
 *      s'ouvre sur /play/?push=<chemin>, que Godot lit au demarrage.
 *
 * Le rappel du clic est pose AVANT d'importer le SDK : le SDK a le sien
 * (qui ouvrirait `fcm_options.link`, sans le chemin), et le premier inscrit
 * l'arrete (`stopImmediatePropagation`).
 */
const FIREBASE_VERSION = '12.19.0';

/* Le chemin porte par une notification : le bloc `data` du message, que le
 * SDK range sous FCM_MSG quand c'est lui qui l'a affichee. */
function pathOf(notification) {
	const d = (notification && notification.data) || {};
	const fcm = d.FCM_MSG || {};
	return String((fcm.data && fcm.data.path) || d.path || '');
}

self.addEventListener('notificationclick', (event) => {
	event.stopImmediatePropagation();
	event.notification.close();
	const path = pathOf(event.notification);
	const scope = self.registration.scope; // https://rabbit.rip/play/
	const target = scope + (path ? '?push=' + encodeURIComponent(path) : '');
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			for (const client of list) {
				if (client.url.startsWith(scope) && 'focus' in client) {
					client.postMessage({ rrPush: path });
					return client.focus();
				}
			}
			return self.clients.openWindow(target);
		}),
	);
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* LA CONFIG, et le SDK seulement si elle est remplie : avec les placeholders
 * ce worker ne fait rien d'autre que le clic ci-dessus. */
try {
	importScripts('firebase-config.js');
} catch (e) {
	/* Pas de config servie : rien a faire. */
}

const cfg = self.RR_FIREBASE_CONFIG;
const ready = !!cfg && ['apiKey', 'projectId', 'messagingSenderId', 'appId'].every(
	(k) => typeof cfg[k] === 'string' && cfg[k] && !/TODO/.test(cfg[k]),
);

if (ready) {
	importScripts(
		'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-app-compat.js',
		'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/firebase-messaging-compat.js',
	);
	firebase.initializeApp({
		apiKey: cfg.apiKey,
		authDomain: cfg.authDomain,
		projectId: cfg.projectId,
		messagingSenderId: cfg.messagingSenderId,
		appId: cfg.appId,
	});
	const messaging = firebase.messaging();
	messaging.onBackgroundMessage((payload) => {
		// Avec un bloc `notification`, le SDK l'affiche deja : ne pas doubler.
		if (payload.notification) return;
		const d = payload.data || {};
		if (!d.title && !d.body) return;
		return self.registration.showNotification(d.title || 'Rabbit Royale', {
			body: d.body || '',
			icon: '/icons/icon-192.png',
			tag: d.tag || d.kind || undefined,
			data: { path: d.path || '' },
		});
	});
}
