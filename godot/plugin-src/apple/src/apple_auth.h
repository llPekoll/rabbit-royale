#pragma once

#include <godot_cpp/classes/ref_counted.hpp>

namespace godot {

/**
 * LA CONNEXION SUR IPHONE, SANS SAFARI (2026-10-29). Voir apple_auth.mm.
 *
 * Un RefCounted : le GDScript qui attend la réponse (Session) le garde en vie
 * pendant que la feuille est ouverte. Les réponses arrivent en signaux, sur le
 * thread du jeu.
 */
class AppleAuth : public RefCounted {
	GDCLASS(AppleAuth, RefCounted)

protected:
	static void _bind_methods();

public:
	/** Vrai là où les feuilles existent (iOS 13+). */
	bool is_available() const;

	/** La feuille « Se connecter avec Apple » → apple_done. */
	void sign_in_with_apple();

	/**
	 * Une page de connexion dans une feuille qui se REFERME SEULE quand la
	 * page part vers `callback_scheme://…` → web_done.
	 */
	void open_auth_session(const String &url, const String &callback_scheme);
};

} // namespace godot
