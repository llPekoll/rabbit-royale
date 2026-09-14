/**
 * Opening a chest — the ceremony, end to end.
 *
 * The kit owns the stage (`@domin8/arcade-kit`'s `ChestReveal`): a full-screen
 * take-over in five beats — the chest rumbles and shakes harder while the roll
 * is in flight, the rays snap to the rarity and it blows, a white disc fills
 * the screen, the light is sucked back onto the prize, and a rarity stamp
 * slams on. We bring two things to it: the chest art, and the prize.
 *
 * ## What this story is for
 *
 * The ceremony is a SEQUENCE, and a sequence is the one thing a screenshot
 * cannot show. Each story here is one opening end to end, so the beats can be
 * watched at the speed a player meets them — and the lid's pop can be checked
 * against the burst it is supposed to land on.
 *
 * ## The prize art
 *
 * Every prize maps to one sprite through `PRIZE_ART`, which is also where its
 * aspect lives — the item icons are 32px wide but 29-33 tall, and squaring
 * them would visibly squash the carrot. A new prize is a line in that table.
 *
 * ## Two ladders, kept apart
 *
 * A chest is BRONZE/SILVER/GOLD/CROWN. An RR Genesis piece is
 * common/rare/epic/legendary — its own rarity, drawn from the collection's own
 * supply and unrelated to the box it came out of. A crown chest can hand over
 * a common rabbit, so the ceremony stamps the PIECE's rarity, prefixed
 * ("GENESIS COMMON"), and runs the rays off the piece rather than the chest.
 *
 * That is why the chest tiers are metals: sharing four words with the
 * collection is what made the same screen able to say "legendary" and "common"
 * about one prize.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChestReveal, type RevealPhase, type RevealRarity } from '@domin8/arcade-kit';
import { ChestOpening } from '@/components/chest-opening';
import {
  CHEST_TIER_ORDER, CHEST_TIER_PROMISE, GENESIS_SUPPLY, chestTierCss, genesisStamp,
  type ChestTier, type GenesisRarity,
} from '@/config/chestConfig';

/**
 * What each rarity pays out here.
 *
 * One prize per tier, matching `CHEST_TIER_PROMISE` — the story shows the
 * promise being KEPT, which is the only way to notice if the ladder ever says
 * one thing on the board and hands over another.
 */
const PRIZE: Record<ChestTier, { label: string; art: PrizeKind }> = {
  bronze: { label: '+64 CARROTS', art: 'carrot' },
  silver: { label: 'WATERING — 4H', art: 'water' },
  gold: { label: 'BOMB x2', art: 'raid' },
  // The Genesis piece is the crown chest's headline, so it is what the
  // ceremony shows — the lightning that comes with it is in the caption.
  crown: { label: 'LIGHTNING + RR GENESIS', art: 'nft' },
};

/**
 * Which ray palette the kit runs for a chest tier.
 *
 * The kit's `RevealRarity` is locked to common/rare/epic/legendary because
 * those names drive its palettes, and our chests no longer use those words —
 * so the two ladders are mapped here rather than conflated. This is a mapping
 * of INTENSITY (poorest to richest), not of meaning: nothing in the ceremony
 * tells the player the kit calls a crown chest "legendary".
 */
const TIER_RAYS: Record<ChestTier, RevealRarity> = {
  bronze: 'common',
  silver: 'rare',
  gold: 'epic',
  crown: 'legendary',
};

/**
 * What a crown chest's Genesis piece rolled.
 *
 * A piece's rarity is drawn from the collection's own supply (330/120/40/10),
 * NOT from the chest that held it — which is the whole reason the chest ladder
 * stopped using those four words. The story exposes it as a control so the
 * awkward case can be looked at directly: a CROWN chest paying out a COMMON
 * rabbit.
 */
const GENESIS_ART: Record<GenesisRarity, PrizeKind> = {
  common: 'nftCommon',
  rare: 'nftRare',
  epic: 'nftEpic',
  legendary: 'nft',
};

/**
 * The garden pair, side by side.
 *
 * Water and fertiliser are the two drops whose whole design rests on being
 * told apart — one lifts the RATE, the other the CEILING — and a player who
 * cannot tell the icons apart has no idea which of the two they just won. That
 * is a comparison, so it needs both on screen at once; `rare` only ever shows
 * the watering can.
 */
function GardenPair() {
  return (
    <div style={{ display: 'flex', gap: 48, alignItems: 'flex-end', padding: 32, background: '#0d1b12' }}>
      {(['water', 'fertiliser'] as const).map((art) => (
        <figure key={art} style={{ margin: 0, textAlign: 'center' }}>
          <PrizeArt art={art} />
          <figcaption style={{ font: '11px ui-monospace, monospace', color: '#8aa', marginTop: 10 }}>
            {art.toUpperCase()}
            <br />
            <span style={{ color: '#5a7' }}>
              {art === 'water' ? 'rate ×1.5, 4h' : 'cap +6h, 12h'}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * The prize art, drawn at its own aspect.
 *
 * Sized by WIDTH with the height following the sprite's own ratio: the three
 * item icons are 32px wide but 29-33 tall, and forcing them all into a square
 * would squash the carrot and stretch the fertiliser bag by a couple of pixels
 * each — which on a 32px sprite is a visibly broken drawing, not a rounding
 * error. `height: auto` keeps every one of them the shape it was drawn as.
 */
type PrizeKind =
  | 'carrot' | 'water' | 'fertiliser' | 'raid'
  | 'nft' | 'nftEpic' | 'nftRare' | 'nftCommon' | 'nftSealed';

const PRIZE_ART: Record<PrizeKind, { src: string; aspect: number; width?: number }> = {
  carrot: { src: '/assets/ui/icons/carrot.webp', aspect: 30 / 32 },
  water: { src: '/assets/ui/icons/water.webp', aspect: 33 / 32 },
  fertiliser: { src: '/assets/ui/icons/fertiliser.webp', aspect: 29 / 32 },
  raid: { src: '/assets/ui/icons/bolt.webp', aspect: 29 / 24 },
  /**
   * Real RR Genesis pieces, one per collection tier.
   *
   * These are the actual devnet artworks (#0001, #0002, #0004, #0007), kept
   * locally rather than hot-linked to `gateway.irys.xyz`: the gateway answers
   * 302 to a CDN, and a story whose art depends on a live redirect breaks
   * offline and on a bad network. A shipped chest reads its winner's own image
   * from the chain — these stand in for the ceremony, not for delivery.
   */
  nft: { src: '/assets/nft/genesis-legendary.webp', aspect: 1, width: 180 },
  nftEpic: { src: '/assets/nft/genesis-epic.webp', aspect: 1, width: 180 },
  nftRare: { src: '/assets/nft/genesis-rare.webp', aspect: 1, width: 180 },
  nftCommon: { src: '/assets/nft/genesis-common.webp', aspect: 1, width: 180 },
  /**
   * The collection's sealed placeholder.
   *
   * No longer worn by any piece — all 500 are revealed on both clusters — but
   * kept because it is the honest picture of a piece whose art has not been
   * fetched yet, and because the reveal rule (NFTS.md §2) says an unrevealed
   * piece must look identical to every other one.
   */
  nftSealed: { src: '/assets/nft/genesis-sealed.webp', aspect: 1, width: 180 },
};

function PrizeArt({ art }: { art: PrizeKind }) {
  const { src, aspect, width = 112 } = PRIZE_ART[art];
  return (
    <img
      src={src}
      alt=""
      style={{ width, height: width * aspect, imageRendering: 'pixelated' }}
    />
  );
}

interface CeremonyProps {
  tier: ChestTier;
  /** Hold the rumble, as if the server roll were still in flight. */
  pending: boolean;
  /** For a crown chest: what the Genesis piece itself rolled. */
  genesis: GenesisRarity;
}

/**
 * One opening, replayable.
 *
 * `key` on the reveal is what makes REPLAY work: the ceremony runs off its own
 * internal clock from mount, so restarting it means mounting a new one rather
 * than poking at the old.
 */
function Ceremony({ tier, pending, genesis }: CeremonyProps) {
  const [run, setRun] = useState(0);
  const [open, setOpen] = useState(false);

  // A crown chest hands over a Genesis piece, and the piece's own rarity is
  // what the stamp has to name — prefixed, so the word cannot be read as the
  // chest's tier. Every other chest stamps its own tier, which is unambiguous
  // because no metal is a collection rarity.
  const isGenesis = tier === 'crown';
  const stamp = isGenesis ? genesisStamp(genesis) : tier.toUpperCase();
  const art = isGenesis ? GENESIS_ART[genesis] : PRIZE[tier].art;
  const caption = isGenesis
    ? `${PRIZE.crown.label} — ${GENESIS_SUPPLY[genesis]} OF 500`
    : PRIZE[tier].label;

  return (
    <div style={{ minHeight: 420, background: '#0d1b12', display: 'grid', placeItems: 'center' }}>
      {open ? (
        <ChestReveal
          key={run}
          // Null keeps the chest shaking, which is the "roll in flight" case —
          // the rumble is the waiting room and escalates for as long as asked.
          //
          // For a crown chest the rays follow the PIECE, not the chest: the
          // light that lands on a common rabbit should not be the light of a
          // legendary one, however grand the box it came out of.
          rarity={pending ? null : (isGenesis ? genesis : TIER_RAYS[tier])}
          chest={(phase: RevealPhase) => <ChestOpening open={phase === 'blow'} size={180} />}
          item={<PrizeArt art={art} />}
          stamp={stamp}
          caption={caption}
          onDone={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setRun((n) => n + 1); setOpen(true); }}
          style={{
            font: '14px ui-monospace, monospace', padding: '10px 18px', cursor: 'pointer',
            background: '#1a2a1a', color: chestTierCss(tier),
            border: `2px solid ${chestTierCss(tier)}`,
          }}
        >
          OPEN A {tier.toUpperCase()} CHEST
        </button>
      )}
      <p style={{ font: '12px ui-monospace, monospace', color: '#8aa', maxWidth: 420, textAlign: 'center' }}>
        {CHEST_TIER_PROMISE[tier]}
      </p>
    </div>
  );
}

const meta = {
  title: 'Chests/Opening',
  component: Ceremony,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    tier: { control: 'inline-radio', options: CHEST_TIER_ORDER },
    genesis: {
      control: 'inline-radio',
      options: ['common', 'rare', 'epic', 'legendary'],
      description: 'Crown chests only — what the Genesis piece itself rolled',
    },
    pending: { control: 'boolean', description: 'Roll still in flight — the chest keeps shaking' },
  },
  args: { tier: 'crown', pending: false, genesis: 'legendary' },
} satisfies Meta<typeof Ceremony>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A crown chest paying out a legendary Genesis piece — the best outcome in the
 * game, and the one the full-screen take-over exists for.
 */
export const CrownChest: Story = {};

/**
 * THE case the two ladders were separated for: a CROWN chest handing over a
 * COMMON rabbit.
 *
 * Read it as a player would. The box was the rarest thing on the island, and
 * the stamp says GENESIS COMMON — which is honest (it IS the commonest of the
 * four) and still a one-in-five-hundred artwork. Had the chest also been called
 * "legendary", the same screen would have said legendary and common about one
 * prize, and the player would have read a generous drop as a swindle.
 */
export const CrownPaysCommon: Story = { args: { genesis: 'common' } };

/** The cheapest chest. Same beats, and deliberately so: a bronze that skipped
 *  the ceremony would teach players to dread finding one. */
export const BronzeChest: Story = { args: { tier: 'bronze' } };

/** A garden drop — the tier that pays water or fertiliser. */
export const SilverChest: Story = { args: { tier: 'silver' } };

/**
 * The roll still in flight: the chest shakes and the rays stay neutral until
 * the answer lands. This is the state a real opening spends most of its time
 * in, and the reason the rumble escalates rather than loops.
 */
export const RollPending: Story = { args: { pending: true } };

/**
 * The two garden icons together — the only view that answers "can a player
 * tell a watering from a feeding at a glance?".
 */
export const GardenIcons: StoryObj = { render: () => <GardenPair /> };

/**
 * The NFT prize — and the ladder inside the ladder.
 *
 * RR Genesis is minted AND revealed on both clusters: 500 pieces, 500 distinct
 * artworks, each carrying its own rarity (330 common / 120 rare / 40 epic /
 * 10 legendary). These four are the real devnet pieces #0007, #0004, #0002 and
 * #0001, and the sealed skull is the collection's placeholder — no longer worn
 * by any piece, but still what a not-yet-fetched one honestly looks like.
 *
 * THE DESIGN QUESTION this story exists to settle: a Genesis piece has a rarity
 * of its own, and it has nothing to do with the chest's. A LEGENDARY chest can
 * pay out a COMMON rabbit. Two words called "legendary" meaning different
 * things on the same screen is how a player ends up feeling cheated by a prize
 * that was actually generous — so either the ceremony names the piece's rarity
 * clearly, or the chest ladder stops using the same four words.
 */
export const NftPrize: StoryObj = {
  render: () => (
    <div style={{ padding: 32, background: '#0d1b12' }}>
      <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {([
          ['nftSealed', 'SEALED', 'not fetched yet — identical for every piece'],
          ['nftCommon', 'COMMON', '330 of 500 — #0007'],
          ['nftRare', 'RARE', '120 of 500 — #0004'],
          ['nftEpic', 'EPIC', '40 of 500 — #0002'],
          ['nft', 'LEGENDARY', '10 of 500, 1-of-1 — #0001'],
        ] as const).map(([art, title, note]) => (
          <figure key={art} style={{ margin: 0, textAlign: 'center', maxWidth: 180 }}>
            <PrizeArt art={art} />
            <figcaption style={{ font: '11px ui-monospace, monospace', color: '#8aa', marginTop: 12 }}>
              {title}
              <br />
              <span style={{ color: '#5a7' }}>{note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p style={{ font: '12px ui-monospace, monospace', color: '#8aa', maxWidth: 620, marginTop: 28 }}>
        A piece&apos;s rarity is its own. A LEGENDARY chest can hand over a COMMON
        rabbit — which is still a 1-in-500 artwork, but reads as a let-down if the
        ceremony has just stamped LEGENDARY over it.
      </p>
    </div>
  ),
};
