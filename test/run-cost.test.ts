/**
 * THE RUN'S COST IS SAID ON THE ISLAND — not discovered at home.
 *
 * Reported on 15 September 2026: "the energy spent is not clearly shown while
 * exploring". The crossing charges the burrow's bar (`payForRun`), and the
 * island showed hearts, carrots and a volcano — nothing about the 25 points
 * that had just left the bank. Asserted against the sources like the
 * freshness test, because what was missing is a WIRE, not a computation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const HOOK = read('../src/components/use-game-socket.ts');
const PAGE = read('../src/app/page.tsx');
const RECAP = read('../src/components/run-recap.tsx');

describe('the run cost reaches the island', () => {
  it('rides the snapshot only when a run was actually paid for', () => {
    // The bank is set INSIDE the `!existing` branch — a reconnect is the same
    // run and must not announce a charge that did not happen.
    const join = SERVER.slice(SERVER.indexOf("socket.on('join'"), SERVER.indexOf("socket.on('spectate'"));
    const paidBranch = join.slice(join.indexOf('if (!existing) {'), join.indexOf('const rabbit ='));
    expect(paidBranch).toMatch(/bank = \{ energy: paid\.energy, cost: ENERGY\.RUN_COST/);
    expect(join).toMatch(/socket\.emit\('island', \{ \.\.\.snapshot\(live\), bank \}\)/);
  });

  it('is the bar AFTER the charge, from the statement that charged it', () => {
    expect(SERVER).toMatch(/if \(charged\) return \{ ok: true, energy: paid\.energy \}/);
  });

  it('is exposed by the hook and reset per island', () => {
    expect(HOOK).toMatch(/setBank\(snap\.bank \?\? null\)/);
    expect(HOOK).toMatch(/firstRun, digs, bank,/);
  });

  it('is said on the island and again in the recap', () => {
    expect(PAGE).toMatch(/<RunCostNote bank=\{game\.bank\} seed=\{game\.islandSeed\} \/>/);
    expect(PAGE).toMatch(/bank=\{burrow \? \{ energy: burrow\.energy, max: burrow\.maxEnergy, cost: burrow\.runCost \} : null\}/);
    expect(RECAP).toMatch(/at the burrow &middot; a run takes \{bank\.cost\}/);
  });

  it('is never a second gauge on the strip', () => {
    // The raid HUD's lesson: two bolt-and-number bars read as one emptied bar.
    // The cost is a line that goes away, not a meter that stays.
    const HUD = read('../src/components/run-hud.tsx');
    // No `bank` prop, no `RunBank` type: the strip does not draw it.
    expect(HUD).not.toMatch(/\bbank\??:/);
    expect(HUD).not.toMatch(/RunBank/);
  });
});
