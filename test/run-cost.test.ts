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
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';
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
    // The debit moved to `payCrossing` on 21 September 2026, when a raid's
    // first step came to cost the same crossing — one conditional write for
    // both doors. The join still goes through it under its old name.
    const PAY = read('../src/lib/game/pay-crossing.ts');
    expect(PAY).toMatch(/if \(charged\) return \{ ok: true, energy: paid\.energy \}/);
    expect(SERVER).toMatch(/return payCrossing\(playerId, first\)/);
  });

  it('is exposed by the hook and reset per island', () => {
    expect(HOOK).toMatch(/setBank\(snap\.bank \?\? null\)/);
    expect(HOOK).toMatch(/firstRun, taughtBomb, teachReady, digs, bank,/);
  });

  it('is said on the island and again in the recap', () => {
    expect(PAGE).toMatch(/<RunCostNote bank=\{game\.bank\} seed=\{game\.islandSeed\} \/>/);
    expect(PAGE).toMatch(/bank=\{burrow \? \{ energy: burrow\.energy, max: burrow\.maxEnergy, cost: burrow\.runCost \} : null\}/);
    // The key, not the sentence: the line moved into the dictionaries, where
    // each language decides how a bar reading and a cost sit in one phrase.
    expect(RECAP).toMatch(/t\.recap\.bank\(bank\.energy, bank\.max, bank\.cost\)/);
    // And every language still states BOTH numbers — the bar and what the
    // crossing takes out of it — which is the whole point of the line.
    for (const locale of LOCALES) {
      const line = DICTIONARIES[locale].recap.bank(35, 60, 25);
      expect(line, locale).toContain('35');
      expect(line, locale).toContain('60');
      expect(line, locale).toContain('25');
    }
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
