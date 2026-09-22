class_name Palette
## LES COULEURS DU CHROME, celles que le web a choisies — et nulle part
## ailleurs. Un ecran qui invente un hexa a cote de ceux-ci derive.
##
## Deux familles, deux matieres :
##
##   • LA TERRE (burrow-chrome.tsx) : les cartes du terrier sont de la terre
##     tassee eclairee a la lampe. Echantillonnees sur l'art du terrier.
##   • LE BOIS ET LE PARCHEMIN (woodland/README.md, runtime.css) : les
##     planches, le cadre a feuilles, les bandeaux. L'encre est brune sur le
##     parchemin, creme sur le bois.
##
## La carotte est L'accent, la seule chose qui vaille d'etre eue. Le rouge ne
## sert qu'au vrai danger, jamais au decor.

# ── La terre ─────────────────────────────────────────────────────────────────
const SOIL := Color("#2a1810")          ## la face d'une carte — terre tassee
const SOIL_DEEP := Color("#1d100a")     ## son dessous, son biseau
const PLANK := Color("#4a2f1d")         ## un bloc en relief sur la terre
const CHALK := Color("#f5e6d3")         ## le texte — craie sur terre
const CHALK_DIM := Color("#b39877")     ## le texte secondaire
const CARROT := Color("#e07a2f")        ## L'accent
const CARROT_DEEP := Color("#a8521a")
const DANGER := Color("#c1442e")        ## le vrai danger seulement
const LAMP := Color("#ffb238")          ## la lampe — titres, chiffres vivants

# ── Le bois et le parchemin ──────────────────────────────────────────────────
const INK := Color("#352011")           ## l'encre sur le parchemin et l'or
const BARK := Color("#6c3e22")          ## l'encre secondaire du parchemin
const PARCHMENT := Color("#ffe4a1")
const GOLD := Color("#ffc83d")
const LEAF := Color("#87bd3a")
const ALERT := Color("#d84c39")
const CREAM := Color("#fff0cb")         ## l'encre sur le bois
const CREAM_SHADOW := Color("#352011")  ## son ombre d'un pixel
const RANK_GOLD := Color("#ffd138")     ## le rang sur la pastille
const PILL_INK := Color("#fde7bd")      ## le chiffre de la pastille
const PILL_SUB := Color("#a28b7b")

# ── Les matieres plates du runtime ───────────────────────────────────────────
const WELL_FACE := Color("#6b432c")     ## un creux : case d'objet, case de boutique
const WELL_RIM := Color("#4a2918")
const WELL_LIP := Color("#cc9654")
const BADGE_TOP := Color("#735337")     ## un compteur
const BADGE_BOTTOM := Color("#493321")
const BADGE_RIM := Color("#1d2a2d")
const BADGE_INK := Color("#fff1bf")
const TRACK_FACE := Color("#442d20")    ## une gouttiere (piste d'energie)
const TRACK_RIM := Color("#352011")
const TRACK_LIP := Color("#efbd68")
const TAB_TOP := Color("#805135")       ## un onglet au repos
const TAB_BOTTOM := Color("#583821")
const TAB_RIM := Color("#392515")
const TAB_ON_TOP := Color("#ffdc63")    ## un onglet choisi — dore
const TAB_ON_BOTTOM := Color("#f2ae25")
const TAB_ON_RIM := Color("#ffce44")

# ── La legende de l'ile, et la pastille des messages ─────────────────────────
## Pas une planche : une narration posee sur le plateau, sombre et translucide,
## pour rester hors du chemin de l'art.
const CAPTION_BG := Color(16.0 / 255.0, 14.0 / 255.0, 12.0 / 255.0, 0.72)
const CAPTION_INK := Color.WHITE
const CAPTION_DANGER_INK := Color("#ffb3a8")
const CAPTION_DANGER_RIM := Color(1.0, 107.0 / 255.0, 107.0 / 255.0, 0.55)
const CARRY_GLASS := Color(13.0 / 255.0, 17.0 / 255.0, 23.0 / 255.0, 0.82)

## Le voile derriere un dialogue : le brun presque noir du web a 78 %
## (`rgba(10,6,4,.78)`), pose sur le jeu floute (shaders/scrim_blur).
const SCRIM := Color(10.0 / 255.0, 6.0 / 255.0, 4.0 / 255.0, 0.78)

## Le fond de l'app, hors monde (project.godot default_clear_color).
const NIGHT := Color(0.051, 0.067, 0.09, 1.0)

## L'erreur sur le parchemin, et sur le bois.
const BAD_ON_PARCHMENT := Color("#a72e21")
const BAD_ON_WOOD := Color("#ffb4a2")
const BAD_ON_NIGHT := Color("#ff6b6b")
const MUTED_ON_NIGHT := Color("#8b949e")
