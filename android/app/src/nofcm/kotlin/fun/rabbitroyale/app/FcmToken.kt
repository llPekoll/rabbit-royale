package `fun`.rabbitroyale.app

/**
 * Version stub, compilee quand google-services.json est absent.
 *
 * Elle echoue proprement au lieu de manquer : la page appelle getFcmToken() sans
 * savoir si le build a Firebase, et doit recevoir un rejet explicite plutot
 * qu'une promesse qui ne se resout jamais.
 */
object FcmToken {
    const val AVAILABLE = false

    fun fetch(onToken: (String) -> Unit, onError: (String) -> Unit) {
        onError("build sans firebase : notifications indisponibles")
    }
}
