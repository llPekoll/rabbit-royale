/**
 * A bomb under the scenery, and what the blast is allowed to take with it.
 *
 * The scatter comes from the PUBLIC seed and the bombs from the private one
 * (`lib/game/island.ts`), so nothing can reconcile the two when the island is
 * generated without turning the trees into a readable map of the safe ground.
 * They are reconciled at the blast instead — which only works if everyone
 * agrees on which things a blast may remove.
 *
 * Two facts are pinned here, and the second is the one that bites:
 *
 *   - a bush or a prop leaves its cell FARMABLE, so bombs really are dealt
 *     under the scatter. If that ever stops being true the crater-clearing is
 *     dead code, and the reason it was written has been lost;
 *   - a SHEEP leaves its cell farmable too, because it wanders. The view must
 *     not sweep one on a blast: the server owns the flock and goes on
 *     broadcasting `sheep_moved` for an animal this client destroyed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateIsland } from '../src/lib/game/island';
import { terrainFor } from '../src/lib/game/terrainBoard';
import { toColRow } from '../src/config/gridConfig';
import { blocksCell, wanders, type ThingKind } from '../src/game/island/blocking';

/** Every bomb dealt across a spread of islands, paired with what stands on it. */
function bombsUnderScenery() {
  const found = new Map<ThingKind, number>();
  let bombs = 0;
  for (let s = 0; s < 40; s++) {
    const seed = `deco-bomb-${s}`;
    const deco = new Map<string, ThingKind>();
    for (const p of terrainFor(seed).placements) deco.set(`${p.x},${p.y}`, p.kind);
    const island = generateIsland({ seed, contentSeed: `content-${s}` });
    for (const [index, tile] of island.tiles) {
      if (tile.content !== 'bomb') continue;
      bombs++;
      const { col, row } = toColRow(index);
      const kind = deco.get(`${col},${row}`);
      if (kind) found.set(kind, (found.get(kind) ?? 0) + 1);
    }
  }
  return { bombs, found };
}

describe('bombs are dealt under the scatter', () => {
  it('buries them under bushes and props, which do not block', () => {
    const { bombs, found } = bombsUnderScenery();
    expect(bombs).toBeGreaterThan(0);
    // Not a fixed count — the deal is seeded and may be retuned. What must
    // hold is that the case EXISTS and is common enough to be worth drawing:
    // these are the bushes that used to stand in their own crater.
    expect(found.get('bush')).toBeGreaterThan(0);
    expect(found.get('prop')).toBeGreaterThan(0);
  });

  it('never buries one under something that blocks', () => {
    // The other half, and the reason only bush/prop/sheep turn up: a tree
    // takes its cell off the board entirely (`isFarmable`), so it cannot be
    // holding a bomb. A blocking kind here would mean a prize under a trunk.
    const { found } = bombsUnderScenery();
    for (const [kind] of found) {
      if (wanders(kind)) continue;
      expect(blocksCell(kind)).toBe(false);
    }
  });
});

describe('a blast clears the scenery but never the flock', () => {
  const VIEW = readFileSync(new URL('../src/game/island/IsoIslandView.ts', import.meta.url), 'utf8');

  it('deals bombs under sheep, which is why the exclusion is needed', () => {
    // If this ever comes back zero the guard below looks like dead weight and
    // the next reader deletes it. It is not: the flock stands on farmable
    // ground by design (`board.ts` — only fixed things take a cell off).
    const { found } = bombsUnderScenery();
    expect(found.get('sheep')).toBeGreaterThan(0);
  });

  it('spares every wandering kind at both exits of the blink', () => {
    // Source-read for the same reason as `island-layering`: the view needs a
    // GL context to instantiate, and what matters is a decision, not a pixel.
    const blast = VIEW.slice(VIEW.indexOf('blastDeco('), VIEW.indexOf('private clearCell('));
    // The scan that decides whether anything is here at all,
    expect(blast).toMatch(/!wanders\(e\.occupant\.kind\)/);
    // the immediate exit, and the one at the end of the flicker,
    expect(blast.match(/clearCell\([^)]*, wanders\)/g)).toHaveLength(2);
    // and the flicker itself, so a sheep that walks in mid-exit is untouched.
    expect(blast).toMatch(/if \(wanders\(entry\.occupant\.kind\)\) continue;/);
  });

  it('keeps the chests clearing a cell outright', () => {
    // `clearDecoOver` passes no filter on purpose — a sheep in front of a
    // chest does have to go. The bomb's exclusion must not leak into it.
    const chests = VIEW.slice(VIEW.indexOf('clearDecoOver('), VIEW.indexOf('blastDeco('));
    expect(chests).toMatch(/this\.clearCell\(k\);/);
  });
});
