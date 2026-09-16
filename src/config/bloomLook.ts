/**
 * Le bloom du jeu, en UN seul endroit.
 *
 * Meme principe que `waterLook.ts` : ce sont les valeurs arretees dans la
 * story `FX/Bloom`, et la story garde ses sliders — c'est a ca qu'elle sert —
 * mais ses DEFAUTS et les constantes du jeu sont les memes nombres, pour que
 * ce qui a ete regle la-bas soit ce qui ship ici.
 *
 * ## Le reglage retenu : SEUIL A 0.7, en tres doux
 *
 * Le bloom a d'abord shippe SANS seuil (`threshold` 0) : tous les pixels
 * nourrissaient le halo, ce qui a `strength` 0.35 se lisait comme une brume
 * lumineuse diurne plutot qu'un delavage. Le cout etait connu et ecrit ici :
 * l'herbe et la roche participaient au halo comme le reste, donc les verts
 * que la palette 2 separe se rapprochaient d'un cheveu.
 *
 * Le 2026-09-16, Paul a compare sur le vrai plateau de DIG (890x400) trois
 * captures cote a cote — bloom sans seuil, sans bloom, seuil 0.7 — et a
 * retenu 0.7 : les terrasses et la falaise retrouvent le contraste de l'image
 * sans filtre, et le halo ne reste que sur ce qui brille vraiment, l'anneau
 * dore des cases atteignables, l'ecume, les chiffres. `knee` reste a 0 : la
 * bascule est franche, et a un tiers de force elle ne se voit pas.
 */
export const BLOOM_LOOK = {
  /** Seuls les pixels au-dessus de 0.7 de luminance nourrissent le halo —
   *  l'anneau dore, l'ecume, les chiffres ; pas l'herbe. Voir l'en-tete. */
  threshold: 0.7,
  /** Bascule franche : a un tiers de force, un genou ne se verrait pas. */
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
