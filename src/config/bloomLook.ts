/**
 * Le bloom du jeu, en UN seul endroit.
 *
 * Meme principe que `waterLook.ts` : ce sont les valeurs arretees dans la
 * story `FX/Bloom`, et la story garde ses sliders — c'est a ca qu'elle sert —
 * mais ses DEFAUTS et les constantes du jeu sont les memes nombres, pour que
 * ce qui a ete regle la-bas soit ce qui ship ici.
 *
 * ## Le reglage retenu : SANS SEUIL, en tres doux
 *
 * `threshold` a 0, donc tous les pixels participent au halo — c'est le mode
 * que `BloomFilter` documente comme son contre-exemple, et c'est pourtant
 * celui qui a ete choisi a l'oeil. Ce n'est pas une erreur, c'est un choix
 * esthetique, et il se tient pour une raison precise : a `strength` 0.35 le
 * halo ne DELAVE pas, il ajoute une brume lumineuse uniforme sur toute l'ile.
 * Le ratage decrit dans `BloomFilter` (l'image qui blanchit) arrive a forte
 * intensite ; a un tiers de force, la meme absence de seuil se lit comme une
 * lumiere ambiante diurne.
 *
 * Ce que ca coute, et qu'il faut savoir : l'herbe et la roche participent au
 * halo comme le reste, donc les verts que la palette 2 separe se rapprochent
 * d'un cheveu. Si un jour les terrasses deviennent dures a distinguer en jeu,
 * c'est le premier suspect — monter `threshold` vers 0.7 rend leur contraste
 * sans toucher au reste.
 */
export const BLOOM_LOOK = {
  /**
   * 0 : aucun seuil, toute l'image nourrit le halo. Voir l'en-tete — c'est
   * deliberé, et c'est ce qui rend l'effet atmospherique plutot que ponctuel.
   */
  threshold: 0,
  /** Sans objet a seuil nul : il n'y a pas de bascule a adoucir. */
  knee: 0,
  /** Rayon du halo, en pixels de l'espace design (960x540). */
  radius: 6.5,
  /** Un tiers de force : c'est ce qui separe la brume du delavage. */
  strength: 0.35,
  /** Blanc chaud, la couleur d'une diffusion dans l'oeil. */
  tint: 0xfff4de,
  /** A mi-chemin entre un halo blanc et un halo de la couleur de la source. */
  saturation: 0.5,
} as const;
