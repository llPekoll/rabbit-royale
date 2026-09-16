/**
 * THE JUICE IS WIRED — every moment that used to end in a text toast now
 * plays something.
 *
 * Audited on 15 September 2026: the React layer was silent while a full SFX
 * bus sat unused, the golden carrot sounded like a normal one, a run's haul
 * arrived home as a number quietly changing, and the eruption was four
 * seconds of a still board. Pinned against the sources, like the freshness
 * test: what was missing were WIRES, and a wire is only visible in the code
 * that draws it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGE = read('../src/app/page.tsx');
const HOOK = read('../src/components/use-game-socket.ts');
const SCENE = read('../src/game/scenes/IslandScene.ts');
const BURROW = read('../src/game/scenes/BurrowScene.ts');
const TERRAIN = read('../src/game/burrow/BurrowTerrain.ts');
const SOUND = read('../src/game/services/SoundManager.ts');
const CSS = read('../src/app/globals.css');

describe('the DOM layer has a voice', () => {
  it('exposes a one-shot bus the chrome can play', () => {
    expect(SOUND).toMatch(/export function playUiSfx/);
  });

  it('plays on every burrow action', () => {
    // harvest, upgrade, shop (both rails), trap, quest done, quest claim,
    // lore, rank, coming home, raid loss — one call each, at least.
    expect(PAGE.match(/playUiSfx\(/g)?.length ?? 0).toBeGreaterThanOrEqual(11);
    expect(PAGE).toMatch(/if \(res\.harvested\) \{[\s\S]{0,300}playUiSfx\('coin'\)/);
    expect(PAGE).toMatch(/else if \(res\.spent\) \{[\s\S]{0,400}playUiSfx\('match'\)/);
    expect(PAGE).toMatch(/if \(r && !won\) playUiSfx\('die'\)/);
  });
});

describe('the quest speaks', () => {
  it('lights the card when the ask is done, and says so on the island', () => {
    expect(PAGE).toMatch(/setQuestDoneKey\(\(k\) => k \+ 1\)/);
    expect(PAGE).toMatch(/setQuestNote\(t\.notes\.questDone\(activeTitle\)\)/);
    expect(CSS).toMatch(/@keyframes rr-quest-glow/);
  });

  it('throws confetti on a claim and flies an item reward to the bag', () => {
    expect(PAGE).toMatch(/if \(res\.claimed\) \{[\s\S]{0,120}setQuestClaimKey/);
    expect(PAGE).toMatch(/<LootFly[\s\S]{0,400}src=\{QUEST_ITEM_ART\[flyItem\.kind\]\.src\}/);
  });

  it('no longer mows the garden on a quest claim', () => {
    // The garden empties on a HARVEST key, not on the counter's burst key —
    // a quest's reward used to burst the counter and harvest the field's art.
    expect(PAGE).toMatch(/if \(harvestKey > 0\) handles\.current\?\.burrow\?\.harvestGarden\(\)/);
    expect(PAGE).not.toMatch(/if \(burstKey > 0\) handles\.current\?\.burrow\?\.harvestGarden\(\)/);
  });
});

describe('the island has its moments', () => {
  it('gives the golden carrot its own sting, flash and coins', () => {
    const golden = SCENE.slice(SCENE.indexOf("content === 'golden') {"), SCENE.indexOf("content === 'carrot') {"));
    expect(golden).toMatch(/playCoinStart\(\)/);
    expect(golden).toMatch(/tile\.flash\(\)/);
    expect(golden).toMatch(/coinSpray\(index\)/);
  });

  it('floats the gain for the digger alone', () => {
    // From `move_result` (private), never from `tile_revealed` (shared).
    const mover = HOOK.slice(HOOK.indexOf("socket.on('move_result'"), HOOK.indexOf("socket.on('hints_changed'"));
    expect(mover).toMatch(/s\.floatGain\(tile, carrotDelta!, c === 'golden'\)/);
    const shared = HOOK.slice(HOOK.indexOf("socket.on('tile_revealed'"), HOOK.indexOf("socket.on('hints_revealed'"));
    expect(shared).not.toMatch(/floatGain/);
  });

  it('handles the eruption it used to ignore', () => {
    expect(HOOK).toMatch(/socket\.on\('eruption'/);
    expect(HOOK).toMatch(/s\.playEruption\(durationMs\)/);
    expect(SCENE).toMatch(/playEruption\(durationMs: number\)/);
    expect(SCENE).toMatch(/resetEruption\(\)/);
    expect(PAGE).toMatch(/<EruptionOverlay ms=\{game\.erupting\} \/>/);
  });

  it('rumbles at each volcano stage', () => {
    expect(HOOK).toMatch(/s\.rumble\(stage\)/);
  });
});

describe('the burrow has its moments', () => {
  it('bursts the counter when a run is brought home', () => {
    expect(HOOK).toMatch(/setBankedCarrots\(b\?\.carrots \?\? 0\)/);
    expect(PAGE).toMatch(/pendingHome\.current = game\.bankedCarrots/);
    // The haul stands on the DIG slab, not in the card column's grey note.
    expect(PAGE).toMatch(/setBroughtHome\(\{ amount, key: Date\.now\(\) \}\)/);
    expect(PAGE).toMatch(/broughtHome=\{broughtHome\}/);
    expect(PAGE).not.toMatch(/setNote\(`\+\$\{amount\} 🥕 brought home`\)/);
    expect(read('../src/components/loop-bar.tsx'))
      .toMatch(/className="rr-home-haul"[\s\S]{0,700}t\.loop\.broughtHome/);
    expect(CSS).toMatch(/@keyframes rr-home-haul/);
  });

  it('stamps a level-up and pops the building', () => {
    expect(PAGE).toMatch(/<LevelUpStamp/);
    expect(BURROW).toMatch(/if \(celebrate\) this\.terrain\?\.celebrateLevel\(\)/);
    expect(TERRAIN).toMatch(/celebrateLevel\(\): void;/);
  });

  it('throws dust when a trap goes in', () => {
    expect(BURROW).toMatch(/this\.dustPuff\(group\)/);
  });
});

describe('the small pops', () => {
  it('badges pop on arrival, tiles pop on news, ranks pop on change', () => {
    expect(read('../src/components/loop-bar.tsx')).toMatch(/className="rr-hub-badge"/);
    expect(CSS).toMatch(/\.rr-hub-badge \{ animation: rr-badge-pop/);
    // The quest's slab pops when the quest lands on it; the STORY icon pops
    // when a chapter opens.
    expect(read('../src/components/loop-bar.tsx')).toMatch(/rr-tab-pop/);
    expect(PAGE).toMatch(/className=\{lorePulseKey > 0 \? 'rr-tab-pop' : undefined\}/);
    expect(read('../src/components/carrot-pill.tsx')).toMatch(/className="rr-rank-pop"/);
    expect(read('../src/components/leaderboard-drawer.tsx')).toMatch(/rr-crown-glint/);
  });

  it('respects reduced motion for every one of them', () => {
    // The juice block's own reduced-motion guard, wherever it sits in the file.
    const guard = CSS.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,600}?animation: none;\s*\}/g) ?? [];
    const mine = guard.find((g) => g.includes('rr-hub-badge'));
    expect(mine).toBeDefined();
    for (const cls of ['rr-hub-badge', 'rr-tab-pop', 'rr-quest-done', 'rr-rank-pop', 'rr-crown-glint', 'rr-levelup-stamp', 'rr-eruption-line']) {
      expect(mine, cls).toContain(cls);
    }
  });
});
