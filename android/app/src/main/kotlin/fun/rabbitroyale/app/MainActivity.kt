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

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true   // localStorage : la session survit au kill
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
            }
            addJavascriptInterface(WalletBridge(this@MainActivity, this, walletSender), "AndroidWallet")
        }
        setContentView(webView)
        webView.loadUrl(BuildConfig.GAME_URL)

        askNotificationPermission()
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
