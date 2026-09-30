/* LA CONFIGURATION WEB DE FIREBASE — publique par nature, commise exprès.
 *
 * Ces valeurs ne sont PAS des secrets : Firebase les met dans toute page web
 * qui l'utilise. Ce qui protege le projet, ce sont les regles de la console
 * (domaines autorises, restrictions de la cle API), pas leur absence du depot.
 *
 * Lue par DEUX endroits, d'ou le `self` : la page du jeu (shell.html, via
 * <script src="firebase-config.js">) et le service worker des notifications
 * (firebase-messaging-sw.js, via importScripts). Copiee a cote de index.html
 * par le Dockerfile, apres l'export Godot (l'export ne copie que ses fichiers).
 *
 * TANT QU'UNE VALEUR PORTE « TODO », TOUT SE TAIT : ni SDK charge, ni
 * evenement, ni demande de notification (window.rrFirebase le verifie).
 *
 * TODO(firebase) — a coller depuis la console Firebase :
 *   Parametres du projet > General > Vos applications > (app Web) >
 *   « Configuration du SDK » > Config : apiKey, authDomain, projectId,
 *   storageBucket, messagingSenderId, appId, measurementId.
 *   Parametres du projet > Cloud Messaging > Configuration Web >
 *   « Certificats Web Push » > paire de cles : la cle PUBLIQUE -> vapidKey.
 */
(typeof self !== 'undefined' ? self : window).RR_FIREBASE_CONFIG = {
	apiKey: 'AIzaSyDv9pBCl0o29oYq1UJ25F00wxDn_3__AUM',
	authDomain: 'rabbitroyale-5579e.firebaseapp.com',
	projectId: 'rabbitroyale-5579e',
	storageBucket: 'rabbitroyale-5579e.firebasestorage.app',
	messagingSenderId: '811224662744',
	appId: '1:811224662744:web:4631d3a25b61829b148dad',
	measurementId: 'G-PS1QXETHSS',
	vapidKey: 'BEsx49-VV-OJrcEzsjaNsIqsLiktBRLn8nljla3t14hKdQ-gWVHGRzHMwfgskpcAKix5bBHhK8GwUZhokJXKDpc',
};
