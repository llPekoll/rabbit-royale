package `fun`.rabbitroyale.app

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import android.Manifest
import android.content.pm.PackageManager
import android.view.WindowManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender

/**
 * Coquille NATIVE du jeu — délibérément pas un TWA.
 *
 * Un TWA délègue le rendu à Chrome, ce qui coûte trois choses dont le jeu ne
 * peut pas se passer : dessiner sous l'encoche (sinon bande noire), garder le
 * plein écran immersif pendant une partie, et surtout pouvoir injecter un pont
 * JavaScript vers le Seed Vault et vers FCM. Ici NOUS tenons la fenêtre.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // Doit être créé AU DÉBUT de onCreate (avant STARTED) — sinon MWA lève
    // "registerForActivityResult must be called before onStart".
    private val walletSender = ActivityResultSender(this)

    // Android 13+ exige une demande À L'EXÉCUTION pour afficher des
    // notifications : la déclaration au manifest ne suffit pas. Même contrainte
    // de création précoce que le sender ci-dessus.
    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* accepté ou non */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Edge-to-edge : le contenu passe SOUS les barres système.
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // 2. Dessiner DANS la zone de l'encoche — précisément ce qu'un TWA ne
        //    sait pas faire, et ce qui laissait une bande noire.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            }
        }

        // 3. Barres transparentes et masquées : une partie se joue en immersif,
        //    elles reviennent au swipe puis se recachent.
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        // 4. Inspection depuis chrome://inspect — en build debug UNIQUEMENT.
        //    Sans ca, une lenteur dans la WebView ne se diagnostique pas : on
        //    ne voit ni la timeline reseau, ni le contexte WebGL reellement
        //    obtenu. Jamais en release : ce serait ouvrir la page a qui
        //    branche un cable.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this).apply {
            // Couche materielle explicite, pour la meme raison que le manifeste :
            // c'est ce qui garantit le contexte WebGL dont Pixi a besoin.
            setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true   // localStorage : la session survit au kill
                // Le cache HTTP de la WebView, d'un lancement a l'autre. C'est
                // la mesure la plus rentable du boot : sans lui les 18 chunks
                // JS et l'art repartent sur le reseau a chaque demarrage, et
                // chaque requete paie un aller-retour vers Helsinki (~370ms de
                // TCP+TLS mesures). Avec, le second lancement ne demande plus
                // un octet (0Ko reseau, 17/18 en cache) et `load` tombe de
                // ~6800ms a ~1400ms sur un Seeker.
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            }
            // Rester dans l'app pour nos domaines, ouvrir le reste dehors : un
            // lien externe qui s'ouvre en plein écran sans barre d'URL est un
            // piège à phishing.
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: android.webkit.WebResourceRequest,
                ): Boolean {
                    val host = request.url.host ?: return false
                    val ours = host.endsWith("datemeee.com") || host.endsWith("rabbitroyale.fun")
                    if (ours) return false
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, request.url))
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (BuildConfig.DEBUG) probeRendering(view)
                }
            }
            addJavascriptInterface(WalletBridge(this@MainActivity, this, walletSender), "AndroidWallet")
        }
        setContentView(webView)
        webView.loadUrl(BuildConfig.GAME_URL)

        askNotificationPermission()
    }

    /**
     * Le rapport de demarrage, dans logcat : ou passe le temps du boot.
     *
     * Quatre choses, dans cet ordre : le chemin de RENDU (materiel ou logiciel
     * — un renderer SwiftShader ou llvmpipe fait passer chaque texture Pixi par
     * le CPU), le HTML phase par phase, la ventilation des requetes par type
     * avec ce qui sort du cache, et les cinq ressources les plus lentes.
     *
     * Comment le lire : un `attente` eleve en face de peu d'octets designe la
     * LATENCE du lien, pas le poids du jeu — ce sont deux problemes differents
     * et un seul se corrige en optimisant le code. La colonne `en cache` dit si
     * le cache de la WebView fait son travail d'un lancement a l'autre.
     *
     * Debug uniquement (voir l'appel), et sans effet sur le jeu : la sonde lit
     * un contexte jetable et les compteurs que le navigateur tient deja.
     *
     * Lecture :  adb logcat -s RRBoot
     */
    private fun probeRendering(view: WebView) {
        val js = """
            (function () {
              try {
                var out = [];
                var ms = function (n) { return Math.round(n || 0) + 'ms'; };
                var ko = function (n) { return Math.round((n || 0) / 1024) + 'Ko'; };

                // --- Rendu : materiel ou logiciel ---
                var c = document.createElement('canvas');
                var gl = c.getContext('webgl2') || c.getContext('webgl');
                if (!gl) {
                  out.push('RENDU: aucun contexte WebGL — logiciel certain');
                } else {
                  var dbg = gl.getExtension('WEBGL_debug_renderer_info');
                  var r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'masque';
                  out.push('RENDU: ' + r + ' | webgl2=' + !!c.getContext('webgl2')
                    + ' | LOGICIEL=' + /swiftshader|llvmpipe|software|mesa/i.test(r));
                }

                // --- Le HTML, phase par phase. C'est ici que se voit la latence :
                //     un `attente` eleve pour un `octets` faible = le lien, pas le poids.
                var nav = performance.getEntriesByType('navigation')[0];
                if (nav) {
                  out.push('HTML: dns=' + ms(nav.domainLookupEnd - nav.domainLookupStart)
                    + ' tcp=' + ms(nav.connectEnd - nav.connectStart)
                    + ' tls=' + ms(nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0)
                    + ' attente=' + ms(nav.responseStart - nav.requestStart)
                    + ' download=' + ms(nav.responseEnd - nav.responseStart)
                    + ' total=' + ms(nav.responseEnd));
                  out.push('PAGE: domReady=' + ms(nav.domContentLoadedEventEnd)
                    + ' load=' + ms(nav.loadEventEnd));
                }

                // --- Ventilation par type, avec ce qui sort DU CACHE.
                //     transferSize 0 avec decodedBodySize > 0 = servi par le cache :
                //     c'est la mesure qui dit si le cache WebView fait son travail.
                var res = performance.getEntriesByType('resource');
                var g = {};
                res.forEach(function (e) {
                  var k = e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch' ? 'api'
                        : /\.js(\?|$)/.test(e.name) ? 'js'
                        : /\.(png|webp|jpg|svg|avif)(\?|$)/.test(e.name) ? 'img'
                        : /\.css(\?|$)/.test(e.name) ? 'css'
                        : /\.(mp3|ogg|wav)(\?|$)/.test(e.name) ? 'audio' : 'autre';
                  var a = g[k] || (g[k] = { n: 0, ms: 0, octets: 0, cache: 0 });
                  a.n++; a.ms += e.duration; a.octets += e.transferSize || 0;
                  if ((e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0) a.cache++;
                });
                Object.keys(g).sort().forEach(function (k) {
                  var a = g[k];
                  out.push('  ' + k + ': ' + a.n + ' req, ' + ms(a.ms) + ' cumule, '
                    + ko(a.octets) + ' reseau, ' + a.cache + '/' + a.n + ' en cache');
                });
                out.push('TOTAL: ' + res.length + ' requetes');

                // --- Les 5 plus lentes, pour savoir QUOI attaquer.
                res.slice().sort(function (a, b) { return b.duration - a.duration; })
                  .slice(0, 5).forEach(function (e) {
                    out.push('  lent: ' + ms(e.duration) + ' ' + e.name.split('/').pop().slice(0, 48));
                  });

                return out.join('\n');
              } catch (e) { return 'sonde en echec: ' + e.message; }
            })();
        """.trimIndent()
        view.evaluateJavascript(js) { result ->
            // evaluateJavascript rend une chaine JSON : les \n y sont echappes.
            // On les redeplie pour que logcat affiche un vrai rapport multi-lignes.
            val report = result
                .removeSurrounding("\"")
                .replace("\\n", "\n")
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
            for (line in report.lines()) android.util.Log.i("RRBoot", line)
        }
    }

    /**
     * Les notifs sont le moteur du retour (on t'a pillé, ta saison finit) : sans
     * elles la boucle PvP ne rappelle personne. On demande donc dès le premier
     * lancement, et une seule fois — Android ne rouvre pas la boîte si l'utilisateur
     * a déjà refusé, et insister n'y changerait rien.
     */
    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /** Le bouton retour navigue dans la WebView avant de quitter l'app. */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }
}
