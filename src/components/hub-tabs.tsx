'use client';

/**
 * THE FOUR DOORS: shop, base, raiding, story — as one row of square tiles.
 *
 * WHY THEY LIVE TOGETHER NOW. Each of these was a `LauncherTab` declared beside
 * the thing it opens (`ShopButton` in shop-card.tsx, `ProtectButton` there too,
 * `RaidButton` in raid-panel.tsx, `LoreButton` in lore-codex.tsx). That made
 * sense while they were independent rows in a column. As a ROW they are one
 * object with one shared rhythm — four squares, four badges, four labels of the
 * same length — and a change to that rhythm has to happen in one place or the
 * row stops being a row. The old buttons stay where they are, unused by the
 * burrow but still exported; nothing else was reaching for them.
 *
 * WHAT EACH BADGE MEANS. The old tabs each carried a `sub` line of prose
 * ("0 IN THE SHED", "2/8 IN THE GROUND", "6.8k UNGUARDED"). A tile has no room
 * for a sentence, so every one of those had to become a number or disappear —
 * and the choice per tile is the interesting part, recorded at each call below.
 * The rule applied throughout: a badge is for something WAITING FOR YOU, not
 * for a status you could look up. A badge that is always lit is wallpaper.
 */
import { HubTab, HubTabRow } from './hub-tab';
import { LootChest } from './loot-chest';
import { LORE, unlockedCount } from '@/config/lore';
import type { ShopState } from './use-shop';
import type { Target } from './use-raid';

const SHIELD = '/assets/ui/icons/shield.webp';
const SWORDS = '/assets/ui/icons/swords.webp';
const SCROLL = '/assets/ui/scroll.png';

export interface HubTabsProps {
  shop: ShopState | null;
  targets: Target[];
  /** Lifetime carrots — what unlocks the story's chapters. */
  lifetime: number;
  onShop(): void;
  onProtect(): void;
  onRaid(): void;
  onStory(): void;
}

export function HubTabs({
  shop, targets, lifetime, onShop, onProtect, onRaid, onStory,
}: HubTabsProps) {
  const traps = shop?.traps;

  /* ── SHOP ──────────────────────────────────────────────────────────────
     The badge is what is ON THE SHELF waiting to be used, which is what the
     old "N IN THE SHED" line said. Unspent traps are a thing to act on, so
     they earn the badge; an empty shed simply has none. */
  const inShed = traps?.held ?? 0;

  /* ── BASE ──────────────────────────────────────────────────────────────
     No badge, deliberately. The old tab reported "2/8 IN THE GROUND", which
     is a STATUS — true all the time, actionable at no particular moment — and
     a permanently-lit badge is the thing this row must not have. The tile
     dims instead when there is nothing to do (no traps held and none buried
     to rearrange), which says "not now" without shouting. */
  const canEditBase = !!traps
    && (traps.placed > 0 || (traps.held > 0 && traps.placed < traps.maxPlaced));

  /* ── RAIDING ───────────────────────────────────────────────────────────
     Raidable burrows. Shielded ones are excluded because they are not
     targets: a badge counting doors you cannot open is the same lie the old
     tab's warm colour told over an empty street. */
  const openTargets = targets.filter((t) => !t.shielded).length;

  /* ── STORY ─────────────────────────────────────────────────────────────
     Chapters unlocked but NOT YET READ is what a player wants counted here.
     The codex does not track reading, so the honest count is the one thing it
     does know: chapters that have opened. Badging all of them would light the
     tile permanently once a player is deep enough, so it badges only what
     opened recently — the same 500-carrot window `LoreButton` used for its
     "NEW CHAPTER" line, carried over rather than invented. */
  const open = unlockedCount(lifetime);
  const freshChapter = open > 0 && lifetime - LORE[open - 1].unlockAt < 500;

  return (
    <HubTabRow>
      <HubTab
        /* The kit's animated chest: its idle highlight sweeps the lid every
           few seconds, which is what makes it read as an object lying on the
           tile rather than an icon printed on it.

           Sized by STYLE, not by its `size` prop. The chest draws into a
           canvas whose width and height it sets from that number, so a fixed
           `size` cannot follow a tile that changes width with the column —
           it rendered at a quarter of the tile while the other three marks
           filled theirs. The prop still seeds the canvas's backing store;
           the style is what puts it on the same share of the square as its
           neighbours. It is a wide, low sprite (23x14), so WIDTH is what fills
           the box and the height follows. */
        art={(
          <LootChest
            size={64}
            /* 82%, not 100%: the chest is a WIDE sprite, and filling the box
               edge to edge made it wider than the tile's other marks and left
               it touching the rounded corners. Backed off until its visual
               weight matches the shield and swords beside it. */
            style={{ width: '82%', height: 'auto', maxHeight: '100%' }}
          />
        )}
        label="SHOP"
        count={inShed}
        onClick={onShop}
        ariaLabel="Shop"
      />
      <HubTab
        sprite={SHIELD}
        label="BASE"
        disabled={!canEditBase}
        onClick={onProtect}
        ariaLabel="Protect your base"
      />
      <HubTab
        sprite={SWORDS}
        label="RAIDING"
        count={openTargets}
        onClick={onRaid}
        ariaLabel="Raid another burrow"
      />
      <HubTab
        sprite={SCROLL}
        label="STORY"
        count={freshChapter ? 1 : 0}
        onClick={onStory}
        ariaLabel="The Cursed Crown lore"
      />
    </HubTabRow>
  );
}
