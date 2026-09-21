/**
 * THE ISLAND IS CHOSEN (Paul, 21 September 2026: difficulty is progressive
 * while learning, chosen afterwards). A `join` may name an island or a tier;
 * both are held to the ladder and to the one `joinable` rule, and the default
 * — no choice — seats the player on their OWN tier, which `findJoinable` used
 * to ignore. The list on DIG is only for players past the tutorial.
 *
 * Asserted against the sources: a selection order and a gate.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const STORE = read('../server/islands/store.ts');
const PAGE = read('../src/app/page.tsx');

describe('joining is held to the ladder', () => {
  it('seats a newcomer on their own tier by default, never above it', () => {
    expect(STORE).toMatch(/findJoinable\(tier\?: string\): LiveIsland \| undefined \{[\s\S]{0,400}if \(tier !== undefined && live\.island\.tier !== tier\) continue;/);
    expect(SERVER).toMatch(/\?\? store\.findJoinable\(tierFor\(player\.lifetimeCarrots\)\.name\)\s*\?\? newIsland\(player\.lifetimeCarrots\);/);
  });

  it('refuses a chosen island above the ladder or no longer joinable, and a locked tier', () => {
    expect(SERVER).toMatch(/if \(!live \|\| !store\.joinable\(live\)\) return socket\.emit\('error_msg', \{ code: 'island_gone' \}\);/);
    expect(SERVER).toMatch(/if \(tierIndex\(live\.island\.tier\) > unlocked\) return socket\.emit\('error_msg', \{ code: 'tier_locked' \}\);/);
    expect(SERVER).toMatch(/if \(idx < 0 \|\| idx > unlocked\) return socket\.emit\('error_msg', \{ code: 'tier_locked' \}\);/);
    // A held seat and the tutorial come before any choice.
    const order = SERVER.match(/const live = store\.seatOf\(data\.playerId\)[\s\S]{0,300}?newIsland\(player\.lifetimeCarrots\);/)?.[0] ?? '';
    expect(order.indexOf('newFirstIsland')).toBeGreaterThan(-1);
    expect(order.indexOf('newFirstIsland')).toBeLessThan(order.indexOf('?? chosen'));
  });

  it('lists only what a newcomer could be seated on, with what decides the choice', () => {
    expect(STORE).toMatch(/listJoinable\(\): LiveIsland\[\] \{\s*return \[\.\.\.this\.islands\.values\(\)\]\.filter\(\(live\) => this\.joinable\(live\)\);/);
    expect(SERVER).toMatch(/socket\.on\('islands', async \(ack\?:[\s\S]{0,1600}chestsLeft: live\.chestsTotal - live\.chestsTaken,/);
  });
});

describe('the list on DIG', () => {
  it('is skipped on the first trip, and opens for every trip after', () => {
    expect(PAGE).toMatch(/if \(\(burrow\?\.runs \?\? 0\) === 0\) \{ goTo\('island'\); return; \}\s*setIslandList\(null\);\s*setPickingIsland\(true\);/);
    expect(PAGE).toMatch(/game\.chooseIsland\(choice\);\s*setPickingIsland\(false\);\s*goTo\('island'\);/);
  });

  it('closes with the burrow and says why a choice was refused', () => {
    expect(PAGE).toMatch(/setPickingTarget\(false\);\s*setPickingIsland\(false\);\s*setEnergyPanelOpen\(false\);\s*setLoreOpen\(false\);/);
    expect(PAGE).toMatch(/r\.code === 'island_gone' \? t\.islandPick\.gone : t\.islandPick\.tierLocked/);
  });
});
