'use client';

/**
 * What just came out of a chest, shown to the player who dug it.
 *
 * The last link in the chain: the server rolls the drop against the tier's
 * table, sends it privately to the digger, and this turns it into the kit's
 * full-screen ceremony — rumble, blow, whiteout, the prize under the draining
 * light, and a stamp.
 *
 * ## Two ladders, and why the stamp is careful
 *
 * A chest is BRONZE/SILVER/GOLD/CROWN. An RR Genesis piece has a rarity of its
 * OWN (common/rare/epic/legendary, 330/120/40/10 of the 500), and the two are
 * unrelated — a crown chest can hand over a common rabbit. So a won piece is
 * NEVER stamped with one of those four words here: at the moment of the drop
 * the piece has not been minted, its rarity is genuinely unknown, and a guess
 * would be read as the chest's tier by a player who has spent the session
 * reading chest tiers off the board. The stamp says RR GENESIS, which is the
 * one thing that is certainly true. When minting lands (BUILD-PLAN phase 114)
 * and the rarity is known, `genesisStamp` in config/chestConfig is the
 * prefixed form to use — "GENESIS COMMON", never a bare "COMMON".
 *
 * ## What does not get a ceremony
 *
 * Carrots. They already animate on the tile and land on the counter, and a
 * take-over several times a minute would stop the run dead — the filtering
 * happens in `use-game-socket`, at the event, so nothing renders and unmounts
 * for a drop that was never going to be shown.
 *
 * And chests that were never VISIBLE. A tiered box advertises its position and
 * colour on the board, so walking to it is a decision the player made and the
 * ceremony is the answer to it. A chest they could not see is something they
 * found while digging for something else — that one hands the item up with its
 * name (`LootFly`) and lets the run carry on. The split is `prize.announced`,
 * which the server derives from the tier; a Genesis piece overrides it, since
 * one turns up in a session or two and is worth any interruption.
 */
import { useEffect } from 'react';
import { ChestReveal, type RevealPhase, type RevealRarity } from '@domin8/arcade-kit';
import { playUiSfx } from '@/game/services/SoundManager';
import { ChestOpening } from './chest-opening';
import { LootFly } from './loot-fly';
import type { ChestPrize as Prize } from './use-game-socket';

/**
 * The art and words for each kind a chest can pay.
 *
 * `rarity` drives the kit's ray palette — poorest to richest, matching how much
 * the drop is worth rather than naming anything the player sees.
 */
const DROP: Record<string, { src: string; label: string; rarity: RevealRarity; aspect: number }> = {
  carrots: { src: '/assets/ui/icons/carrot.webp', label: 'CARROTS', rarity: 'common', aspect: 30 / 32 },
  water: { src: '/assets/ui/icons/water.webp', label: 'WATERING', rarity: 'rare', aspect: 33 / 32 },
  fertiliser: { src: '/assets/ui/icons/fertiliser.webp', label: 'FERTILISER', rarity: 'rare', aspect: 29 / 32 },
  bomb: { src: '/assets/ui/icons/bolt.webp', label: 'BOMB', rarity: 'epic', aspect: 29 / 24 },
  shield: { src: '/assets/ui/icons/shield.webp', label: 'SHIELD', rarity: 'epic', aspect: 1 },
  lightning: { src: '/assets/ui/icons/bolt.webp', label: 'LIGHTNING', rarity: 'epic', aspect: 29 / 24 },
};

/**
 * The piece a crown chest gave up.
 *
 * Sealed art for now, and honestly so: the player owns a piece of RR Genesis
 * from this moment, but WHICH one is not known here — that comes from the chain
 * once the mint runs (BUILD-PLAN phase 114). A random rabbit would be a picture
 * of somebody else's NFT.
 */
const GENESIS = { src: '/assets/nft/genesis-sealed.webp', rarity: 'legendary' as RevealRarity };

export interface ChestPrizeProps {
  prize: Prize;
  /** The player tapped through — the run continues. */
  onDone: () => void;
}

/**
 * The chest, heard. The ceremony had no sound at all: the coin chirp as the
 * box arrives, the chime as it blows open. A component rather than a call in
 * the render prop, so the sounds follow mount and `open`, not every render.
 */
function SoundedChest({ open }: { open: boolean }) {
  useEffect(() => { playUiSfx('coinStart'); }, []);
  useEffect(() => { if (open) playUiSfx('chime'); }, [open]);
  return <ChestOpening open={open} size={180} />;
}

export function ChestPrize({ prize, onDone }: ChestPrizeProps) {
  const drop = DROP[prize.kind];

  // A chest nobody could see is a find, not a destination: the player was
  // digging for something else and this turned up. It rises off the board with
  // its name and the run never stops. A Genesis piece is the exception at any
  // depth — it happens once in many sessions and it IS the event.
  if (!prize.announced && !prize.nft) {
    if (!drop) return null;
    return (
      <LootFly
        src={drop.src}
        label={drop.label}
        amount={prize.amount}
        aspect={drop.aspect}
        fireKey={prize.at}
        onDone={onDone}
      />
    );
  }

  // A piece outranks whatever else the chest held: it is the rarer half of the
  // drop and the reason the player crossed the island, so it is what the
  // ceremony is about. The item is named underneath rather than lost.
  const art = prize.nft ? GENESIS.src : drop?.src;
  const rarity = prize.nft ? GENESIS.rarity : drop?.rarity ?? 'common';
  const stamp = prize.nft
    // The rarity of the piece is not known until it is minted, so the stamp
    // names the collection rather than guessing a tier it may not have.
    ? 'RR GENESIS'
    : drop?.label ?? prize.kind.toUpperCase();
  const caption = prize.nft
    ? `A PIECE IS YOURS - PLUS ${prize.amount}x ${drop?.label ?? prize.kind.toUpperCase()}`
    : `+${prize.amount} ${drop?.label ?? ''}`.trim();

  // An unknown kind means a server newer than this client. Say something true
  // and plain rather than rendering an empty ceremony over a missing image.
  if (!art) return null;

  return (
    <ChestReveal
      rarity={rarity}
      chest={(phase: RevealPhase) => <SoundedChest open={phase === 'blow'} />}
      item={
        <img
          src={art}
          alt=""
          style={{
            width: prize.nft ? 180 : 112,
            height: prize.nft ? 180 : 112 * (drop?.aspect ?? 1),
            imageRendering: 'pixelated',
          }}
        />
      }
      stamp={stamp}
      caption={caption}
      onDone={onDone}
    />
  );
}
