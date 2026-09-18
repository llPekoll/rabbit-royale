/**
 * Le trou de visibilité autour du lapin, en UN seul endroit.
 *
 * Même principe que `bloomLook.ts` : la story `FX/Depth hole` garde ses
 * sliders, mais ses DÉFAUTS et les constantes du jeu sont les mêmes nombres,
 * pour que ce qui a été réglé là-bas soit ce qui ship ici.
 *
 * ## Ce que c'est
 *
 * Tout ce qui est dessiné DEVANT le lapin — arbres, buissons, rochers,
 * moutons, autres lapins, ce qui traîne sur les cases voisines — est percé
 * d'un disque centré sur lui. Le disque est franc au centre et se referme sur
 * un dégradé fait en tramage ordonné (Bayer) : un pixel est gardé ou retiré,
 * jamais à moitié, comme dans du pixel art. Voir `fx/DepthHole.ts`.
 *
 * Ça remplace l'ancien fondu par kind (`fadeTo` dans `blocking.ts`) : un
 * objet devant le lapin passait à 45 % d'alpha, mais seulement celui de la
 * rangée juste devant — deux cases plus loin, l'arbre redevenait opaque et le
 * lapin disparaissait dedans. Ici le critère est la profondeur de tri, pas la
 * distance en cases : tout ce qui se dessine après le lapin et touche le
 * disque est percé.
 */
export const DEPTH_HOLE_LOOK = {
  /** Rayon du disque entièrement ouvert, en pixels du plateau (une case fait 44 de large). */
  radius: 35,
  /** Largeur de la couronne tramée, au-delà du rayon, en pixels du plateau. */
  feather: 11,
  /** Taille d'un point de trame, en pixels d'art (1 = un pixel du sprite à l'écran). */
  dot: 1,
  /** Matrice de Bayer : 2, 4 ou 8. 8 a 63 paliers de gris, assez pour qu'une couronne de 11 px se lise en dégradé. */
  matrix: 8 as 2 | 4 | 8,
  /**
   * Ce qu'il reste d'un pixel retiré, en alpha. 0 serait un trou net ; à 0.1
   * l'objet percé laisse un fantôme qui dit encore « il y a un arbre ici »
   * sans cacher le lapin.
   */
  ghost: 0.1,
  /**
   * Jusqu'où devant le lapin on regarde, en unités de tri (une diagonale de
   * cases vaut 16). Un sprite plus loin que ça ne peut pas remonter jusqu'au
   * disque, et ça exclut d'office les calques plein écran (ciel, nuages).
   */
  depthWindow: 12 * 16,
} as const;
