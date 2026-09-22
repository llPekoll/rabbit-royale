class_name AvatarFace
## LE PORTRAIT D'UN LAPIN : une image fixe decoupee dans sa planche.
##
## Le web (lib/game/avatars.ts, podium-rabbit.tsx, profile-menu.tsx) ne
## dessine jamais un second asset pour l'avatar : c'est la premiere pose de
## repos de la PLANCHE du lapin, cadree par le CSS. Trois endroits font ce
## decoupage sur le web — le chip du wallet, le podium de la saison, le
## selecteur du profil — et lib/game/podium.ts a fini par porter la geometrie
## pour que « des copies de geometrie sont la maniere dont une maquette et un
## produit derivent ». Meme regle ici : un seul fichier sait ou est le lapin.
##
## LA FENETRE EST CELLE DE L'ART, PAS CELLE DE LA CASE. Dans la case 0 de
## 32x32, le lapin occupe x 8..22, y 18..32 (mesure sur les planches, les cinq
## sont identiques). Cadrer la case entiere posait la tete « dans une poche de
## vide », podium.ts le dit ; cadrer l'art la remplit.

## `ART` de podium.ts : ou est le lapin dans la case 0, en pixels source.
const ART := Rect2(8, 18, 14, 14)

## La cle d'un joueur qui n'a jamais choisi (avatars.ts DEFAULT_AVATAR).
const DEFAULT_KEY := "brown"

## Les cles dans l'ordre du web (AVATARS), pour un selecteur qui les enumere.
const KEYS := ["brown", "gray", "orange", "white", "yellow"]


## La planche d'une cle, ou celle par defaut : « falling back rather than
## rendering a hole » (avatarSrc).
static func sheet(key: Variant) -> Texture2D:
	if key is String and Kit.AVATARS.has(key):
		return Kit.AVATARS[key]
	return Kit.AVATARS[DEFAULT_KEY]


## La texture du portrait seul : la fenetre ART sur la planche.
static func texture(key: Variant) -> AtlasTexture:
	var atlas := AtlasTexture.new()
	atlas.atlas = sheet(key)
	atlas.region = ART
	return atlas


## LE PORTRAIT a `scale` fois ses pixels source (le web parle en multiples de
## la planche : 2 pour un runner-up, 4 pour le grand portrait du profil).
## Filtre au pixel pres par le projet (default_texture_filter = nearest).
static func portrait(key: Variant, scale: float) -> TextureRect:
	var r := TextureRect.new()
	r.texture = texture(key)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = ART.size * scale
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r
