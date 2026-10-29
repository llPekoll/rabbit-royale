/**
 * LA CONNEXION SUR IPHONE, SANS SAFARI (2026-10-29, web2 seulement).
 *
 * Sur Android, « Continuer avec Google » ouvrait Chrome, et Chrome restait
 * ouvert derrière le jeu à chaque connexion : une app peut renvoyer le
 * navigateur vers elle, jamais le fermer. Sur iPhone, OS.shell_open ferait la
 * même chose avec Safari. Ici, deux feuilles système à la place :
 *
 *   sign_in_with_apple   ASAuthorizationController : la feuille Apple, sans
 *                        page web. Obligatoire dès qu'on propose Google
 *                        (règle 4.8 de l'App Store). Rend l'identityToken (un
 *                        JWT signé par Apple), que /api/auth/apple/native
 *                        vérifie.
 *   open_auth_session    ASWebAuthenticationSession : la page Google dans une
 *                        feuille AU-DESSUS du jeu, qui se referme seule dès que
 *                        le serveur redirige vers `<bundle id>://signed-in`
 *                        (callback Google avec return: 'ios'). Le jeton, lui,
 *                        arrive toujours par l'attente du jeu
 *                        (/api/auth/handoff), comme avant.
 *
 * Les réponses repassent par call_deferred : jamais d'émission depuis un
 * rappel UIKit au milieu d'une image du moteur. L'objet est retrouvé par son
 * ObjectID : si le GDScript l'a lâché entre-temps, la réponse se perd au lieu
 * de viser un pointeur mort.
 */
#include "apple_auth.h"

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/object.hpp>
#include <godot_cpp/variant/utility_functions.hpp>

#import <AuthenticationServices/AuthenticationServices.h>
#import <UIKit/UIKit.h>

using namespace godot;

static String to_godot(NSString *s) {
	return s ? String::utf8(s.UTF8String) : String();
}

static void deliver(uint64_t owner, const char *signal, const Array &args) {
	Object *o = ObjectDB::get_instance(owner);
	if (!o) return;
	Array call;
	call.push_back(StringName(signal));
	call.append_array(args);
	Callable(o, "emit_signal").bindv(call).call_deferred();
}

static UIWindow *key_window() {
	UIWindow *any = nil;
	for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
		if (![scene isKindOfClass:UIWindowScene.class]) continue;
		for (UIWindow *w in ((UIWindowScene *)scene).windows) {
			if (w.isKeyWindow) return w;
			if (!any) any = w;
		}
	}
	return any;
}

/** Un délégué par demande ; `live` le garde en vie jusqu'à la réponse. */
@interface RRAuthRequest : NSObject <ASAuthorizationControllerDelegate,
		ASAuthorizationControllerPresentationContextProviding,
		ASWebAuthenticationPresentationContextProviding>
@property(nonatomic) uint64_t owner;
@property(nonatomic, strong) id holder;  // le contrôleur ou la session en cours
@end

static NSMutableSet<RRAuthRequest *> *live() {
	static NSMutableSet *set = [NSMutableSet set];
	return set;
}

@implementation RRAuthRequest

- (ASPresentationAnchor)presentationAnchorForAuthorizationController:(ASAuthorizationController *)controller {
	return key_window();
}

- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession *)session {
	return key_window();
}

- (void)finishApple:(NSString *)token code:(NSString *)code name:(NSString *)name error:(NSString *)error {
	Array args;
	args.push_back(to_godot(token));
	args.push_back(to_godot(code));
	args.push_back(to_godot(name));
	args.push_back(to_godot(error));
	deliver(self.owner, "apple_done", args);
	self.holder = nil;
	[live() removeObject:self];
}

- (void)authorizationController:(ASAuthorizationController *)controller
		didCompleteWithAuthorization:(ASAuthorization *)authorization {
	if (![authorization.credential isKindOfClass:ASAuthorizationAppleIDCredential.class]) {
		[self finishApple:nil code:nil name:nil error:@"failed"];
		return;
	}
	ASAuthorizationAppleIDCredential *c = (ASAuthorizationAppleIDCredential *)authorization.credential;
	NSString *token = c.identityToken ? [[NSString alloc] initWithData:c.identityToken encoding:NSUTF8StringEncoding] : nil;
	NSString *code = c.authorizationCode ? [[NSString alloc] initWithData:c.authorizationCode encoding:NSUTF8StringEncoding] : nil;
	// Le prénom n'est donné qu'à la TOUTE PREMIÈRE connexion, jamais après.
	[self finishApple:token code:code name:c.fullName.givenName error:token ? nil : @"failed"];
}

- (void)authorizationController:(ASAuthorizationController *)controller didCompleteWithError:(NSError *)error {
	NSLog(@"[AppleAuth] Sign in with Apple: %@", error);
	BOOL cancelled = error.code == ASAuthorizationErrorCanceled;
	[self finishApple:nil code:nil name:nil error:cancelled ? @"cancelled" : @"failed"];
}

@end

void AppleAuth::_bind_methods() {
	ClassDB::bind_method(D_METHOD("is_available"), &AppleAuth::is_available);
	ClassDB::bind_method(D_METHOD("sign_in_with_apple"), &AppleAuth::sign_in_with_apple);
	ClassDB::bind_method(D_METHOD("open_auth_session", "url", "callback_scheme"), &AppleAuth::open_auth_session);
	ADD_SIGNAL(MethodInfo("apple_done",
			PropertyInfo(Variant::STRING, "identity_token"),
			PropertyInfo(Variant::STRING, "authorization_code"),
			PropertyInfo(Variant::STRING, "given_name"),
			PropertyInfo(Variant::STRING, "error")));
	ADD_SIGNAL(MethodInfo("web_done",
			PropertyInfo(Variant::STRING, "callback_url"),
			PropertyInfo(Variant::STRING, "error")));
}

bool AppleAuth::is_available() const {
	if (@available(iOS 13.0, *)) return true;
	return false;
}

void AppleAuth::sign_in_with_apple() {
	RRAuthRequest *r = [RRAuthRequest new];
	r.owner = get_instance_id();
	ASAuthorizationAppleIDRequest *request = [[ASAuthorizationAppleIDProvider new] createRequest];
	request.requestedScopes = @[ ASAuthorizationScopeFullName, ASAuthorizationScopeEmail ];
	ASAuthorizationController *controller = [[ASAuthorizationController alloc] initWithAuthorizationRequests:@[ request ]];
	controller.delegate = r;
	controller.presentationContextProvider = r;
	r.holder = controller;
	[live() addObject:r];
	[controller performRequests];
}

void AppleAuth::open_auth_session(const String &url, const String &callback_scheme) {
	RRAuthRequest *r = [RRAuthRequest new];
	uint64_t owner = get_instance_id();
	r.owner = owner;
	NSURL *target = [NSURL URLWithString:[NSString stringWithUTF8String:url.utf8().get_data()]];
	NSString *scheme = [NSString stringWithUTF8String:callback_scheme.utf8().get_data()];
	__weak RRAuthRequest *weak = r;
	ASWebAuthenticationSession *session = [[ASWebAuthenticationSession alloc]
			initWithURL:target
			callbackURLScheme:scheme
			completionHandler:^(NSURL *callback, NSError *error) {
				if (error) NSLog(@"[AppleAuth] web session: %@", error);
				BOOL cancelled = error.code == ASWebAuthenticationSessionErrorCodeCanceledLogin;
				Array args;
				args.push_back(to_godot(callback.absoluteString));
				args.push_back(String(error ? (cancelled ? "cancelled" : "failed") : ""));
				deliver(owner, "web_done", args);
				RRAuthRequest *strong = weak;
				if (strong) {
					strong.holder = nil;
					[live() removeObject:strong];
				}
			}];
	// Partage les cookies de Safari : un joueur déjà connecté à Google n'a
	// qu'à choisir son compte (au prix de l'alerte « … veut utiliser google.com »).
	session.prefersEphemeralWebBrowserSession = NO;
	session.presentationContextProvider = r;
	r.holder = session;
	[live() addObject:r];
	if (![session start]) {
		Array args;
		args.push_back(String());
		args.push_back(String("failed"));
		deliver(owner, "web_done", args);
		r.holder = nil;
		[live() removeObject:r];
	}
}
