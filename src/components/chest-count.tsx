'use client';

/**
 * THE GOAL LINE: how many chests are out of the island's ground.
 *
 * IT USED TO BE A SENTENCE — "0/1 chests", then "82% dug" before that. The
 * word was doing no work the picture cannot do better: the chest is the most
 * distinctive object on the board, the player has just watched one open, and
 * the strip is the one place in the game where width is genuinely scarce
 * (Paul, 2026-09-20: "les chest avec une icone plutot que le mot"). Dropping
 * it buys about 50px on a phone — most of what the watched-player's name was
 * short of — and costs nothing: the sprite beside the count names the unit,
 * exactly as the carrot does on the pill.
 *
 * THE SPRITE IS THE GAME'S OWN CHEST, the kit's `LOOT_BOX_ATLAS` cropped to
 * its ink (`loot-chest.tsx`), not an emoji and not a second drawing. The chest
 * the counter names must be the chest in the ground; a lookalike would read as
 * a different object, which on a goal line is a different goal.
 *
 * NO SHINE. `LootChest` sweeps a highlight across the lid every few seconds,
 * which is right on a shop tile the eye is meant to find and wrong on a HUD
 * readout that is on screen for the whole run — a glint that never stops is an
 * icon the player learns to stop seeing. Held at rest.
 *
 * THE WORD SURVIVES IN THE LABEL. `aria-label` and the tooltip still say it in
 * full, in the player's own language: the picture replaces the word on screen,
 * it does not replace it for a screen reader, and the tooltip is where "taken
 * by everyone on this island, and it sinks at the last one" is explained.
 */
import type { CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import { LootChest } from './loot-chest';

export interface ChestCountProps {
  /** Chests out of the ground. */
  taken: number;
  /** How many the island holds. */
  total: number;
  /**
   * The volcano's smoke. Past zero the count goes red, so the two readings
   * agree rather than compete — at that point the count IS the warning, said
   * precisely.
   */
  warnStage?: number;
}

/** Matched to the strip's line, not to the chest's own art: the sprite is a
 *  wide, shallow 23x14, so a width of 26 stands about as tall as a digit. */
const CHEST_W = 26;

export function ChestCount({ taken, total, warnStage = 0 }: ChestCountProps) {
  const t = useT();
  return (
    <span
      className="rr-chest-count"
      /* Only the WARNING is stated inline. The resting colour belongs to the
         surface: the strip's glass wants its grey, the carrot board wants the
         board's cream, and neither is this component's business. Left as an
         inline `var(--muted)` it beat both (the board's own rule could not
         override it) and the count came out darker than the grain it sat on. */
      style={warnStage > 0 ? { color: 'var(--danger)' } : undefined}
      title={t.run.chestsTitle}
      aria-label={t.run.chests(taken, total)}
    >
      <LootChest size={CHEST_W} shine={false} style={chestArt} />
      {/* Said without the noun the sprite already carries. Tabular, so the
          count does not jitter as it climbs. */}
      <span aria-hidden style={figure}>{taken}/{total}</span>
    </span>
  );
}

/** The sprite sits on the line's baseline rather than floating above it. */
const chestArt: CSSProperties = {
  flexShrink: 0,
};

const figure: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
};
