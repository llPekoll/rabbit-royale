/**
 * The rabbits a player can show up as.
 *
 * A profile picture here is a CHOICE among the game's own art, not an upload:
 * the bunny sheets already exist, they are already the thing the player watches
 * for a whole run, and picking one costs no storage, no moderation and no CDN.
 *
 * Stored on the player row as a plain key (`players.avatar`). That column is
 * deliberately just text, so the minted NFTs can move in later as a second kind
 * of value without a second migration — see `isBuiltInAvatar`.
 *
 * Each entry points at a sprite SHEET; the avatar is its first idle frame,
 * cropped by CSS (see .rr-avatar). Frames are 32x32 on an 8-wide sheet, matching
 * game/services/AssetLoader.
 */

/** Source-pixel size of one frame on a bunny sheet. */
export const AVATAR_FRAME = 32;

export interface AvatarChoice {
  key: string;
  /** Shown in the picker — the colour IS the identity here. */
  label: string;
  src: string;
}

export const AVATARS: AvatarChoice[] = [
  { key: 'brown', label: 'Brown', src: '/assets/bunnies/Bunny Sprite Sheet - Brown.webp' },
  { key: 'gray', label: 'Gray', src: '/assets/bunnies/Bunny Sprite Sheet - Gray.webp' },
  { key: 'orange', label: 'Orange', src: '/assets/bunnies/Bunny Sprite Sheet - Orange.webp' },
  { key: 'white', label: 'White', src: '/assets/bunnies/Bunny Sprite Sheet - White.webp' },
  { key: 'yellow', label: 'Yellow', src: '/assets/bunnies/Bunny Sprite Sheet - Yellowish.webp' },
];

/** What a player who never picked one shows up as. */
export const DEFAULT_AVATAR = AVATARS[0].key;

export function isBuiltInAvatar(key: string): boolean {
  return AVATARS.some((a) => a.key === key);
}

/** The sheet to draw, falling back rather than rendering a hole. */
export function avatarSrc(key: string | null | undefined): string {
  return (AVATARS.find((a) => a.key === key) ?? AVATARS[0]).src;
}
