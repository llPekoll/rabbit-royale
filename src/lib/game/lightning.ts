/**
 * The lightning strike: sabotage that does not wait to be stepped on.
 *
 * A planted bomb is an ambush — it sits under one tile and pays off only if
 * the victim walks there. A strike lands where the attacker points and sets
 * off everything buried in the cells around it, immediately.
 *
 * What it deliberately does NOT do is re-cover dug ground. The shop's old copy
 * promised exactly that, and the GDD rejects it by name ("board re-covering
 * (breaks minesweeper logic)"): a board that can un-deduce itself makes
 * reading it pointless, which is the one thing this game cannot afford.
 *
 * So a strike REVEALS. Every unrevealed tile in the area is dug at once, and
 * whatever was under it happens — bombs detonate, carrots are simply lost to
 * whoever was going to dig them. That is the damage: not confusion, but ground
 * taken off the board, and a victim who now has to work around a hole they did
 * not make.
 *
 * Pure and seeded, like the rest of `lib/game`. Nothing here touches Pixi, a
 * socket or a clock.
 */
import { LIGHTNING } from '@config/tuning';
import { COLS, ROWS, toColRow, toIndex } from '@/config/gridConfig';
import { revealTile } from './island';
import { isPlayable } from './terrainBoard';
import type { Island, TileContent } from './types';

/** One tile the strike opened, and what was under it. */
export interface StruckTile {
  tile: number;
  content: TileContent;
  adjacent: number;
  /** Order within the strike, so the client can stagger the flashes. */
  step: number;
}

export interface StrikeResult {
  /** Who called it down. The victim is told — revenge is the point. */
  castBy: string;
  /** The tile aimed at. */
  target: number;
  /** Everything it opened, nearest the centre first. */
  struck: StruckTile[];
  /** How many of those were bombs. */
  bombs: number;
}

/**
 * The tiles a strike on `target` would cover.
 *
 * The square of `LIGHTNING.RADIUS` around it, minus anything the terrain does
 * not offer: sea, cliff rock, and cells no longer on the board. A strike aimed
 * at the shore therefore does less, which is a fair cost for a bad shot rather
 * than a rule anyone has to learn.
 */
export function strikeArea(seed: string, target: number): number[] {
  const { col, row } = toColRow(target);
  const r = LIGHTNING.RADIUS;
  const out: number[] = [];
  for (let dr = -r; dr <= r; dr++) {
    for (let dc = -r; dc <= r; dc++) {
      const c = col + dc;
      const rr = row + dr;
      if (c < 0 || rr < 0 || c >= COLS || rr >= ROWS) continue;
      const index = toIndex(c, rr);
      if (!isPlayable(seed, index)) continue;
      out.push(index);
    }
  }
  // Centre first, so the flashes read as spreading outward from the hit.
  return out.sort(
    (a, b) => ringDistance(target, a) - ringDistance(target, b) || a - b,
  );
}

/** Chebyshev distance in tiles — the number of steps between two cells. */
function ringDistance(a: number, b: number): number {
  const p = toColRow(a);
  const q = toColRow(b);
  return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row));
}

/**
 * Call the strike down. MUTATES the island: every covered tile is dug.
 *
 * Already-revealed tiles are skipped rather than re-dug — they are already
 * known, and counting them again would double whatever they hold. The result
 * lists only what this strike actually opened, which is also exactly what the
 * clients have to be told about.
 */
export function strike(island: Island, castBy: string, target: number): StrikeResult {
  const struck: StruckTile[] = [];
  let bombs = 0;

  for (const index of strikeArea(island.seed, target)) {
    const tile = island.tiles.get(index);
    if (!tile || tile.revealed) continue;

    revealTile(island, index, castBy);
    if (tile.content === 'bomb') bombs++;
    struck.push({
      tile: index,
      content: tile.content,
      adjacent: tile.adjacent,
      step: struck.length,
    });
  }

  return { castBy, target, struck, bombs };
}
