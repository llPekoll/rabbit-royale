/**
 * The bloop, wired end to end on the server (2026-09-24).
 *
 * Ink in a rival's eyes, aimed at the tile they stand on: who pays, when a
 * miss is refused, and the one thing it takes besides the view — the way home.
 * It replaced the bomb planted on the island, so this also pins that the
 * socket no longer answers `plant` (bombs are the burrow's defence now).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';
import { SHOP_KINDS } from '../src/lib/game/inventory';

const SERVER = readFileSync('server/index.ts', 'utf8');

function handler(name: string): string {
  const start = SERVER.indexOf(`socket.on('${name}'`);
  expect(start, `no '${name}' handler`).toBeGreaterThan(-1);
  const next = SERVER.indexOf('socket.on(', start + 10);
  return SERVER.slice(start, next === -1 ? undefined : next);
}

describe('the bloop handler', () => {
  const h = handler('bloop');

  it('refuses a miss and a locked level before it charges', () => {
    const charge = h.indexOf("eq(inventory.kind, 'bloop')");
    expect(charge).toBeGreaterThan(-1);
    expect(h.indexOf("'no-rival'")).toBeLessThan(charge);
    expect(h.indexOf("'level_locked'")).toBeLessThan(charge);
    // Conditional on the row still holding one: two taps cannot spend one bloop twice.
    expect(h).toMatch(/inventory\.qty\} > 0/);
  });

  it('inks a rival, never the thrower', () => {
    expect(h).toMatch(/r\.playerId !== data\.playerId/);
    expect(h).toMatch(/victim\.inkedUntil = Date\.now\(\) \+ BLOOP\.INK_MS/);
    expect(h).toMatch(/emit\('rabbit_inked'/);
  });

  it('lets a watcher throw it', () => {
    expect(h).not.toMatch(/\|\| data\.spectating\) return/);
  });
});

describe('inked, you stay', () => {
  it('refuses the way home while the ink holds', () => {
    const leave = handler('leave');
    expect(leave).toMatch(/inkedUntil/);
    expect(leave).toMatch(/emit\('leave_rejected', \{ reason: 'inked'/);
    // Checked before the run is banked, or the refusal would come too late.
    expect(leave.indexOf("'leave_rejected'")).toBeLessThan(leave.indexOf('bankRun('));
  });
});

describe('what it replaced', () => {
  it('no longer plants bombs on the island', () => {
    expect(SERVER).not.toMatch(/socket\.on\('plant'/);
  });

  it('sells the bloop in the mirage\'s place', () => {
    expect(SHOP_KINDS).toContain('bloop');
    expect(SHOP_KINDS).not.toContain('mirage');
  });

  it('has the words in all four languages, short enough for the corner', () => {
    for (const locale of LOCALES) {
      const { run, shop, items } = DICTIONARIES[locale];
      expect(run.bloop, locale).toBeTruthy();
      expect(run.aimingBloop, locale).toBeTruthy();
      expect(run.bloopRefused['no-rival'], locale).toBeTruthy();
      expect(run.inkedStay(4), locale).toContain('4');
      expect(shop.boughtBloop(1, ''), locale).toBeTruthy();
      expect(items.bloop.name, locale).toBeTruthy();
      const hit = run.hitBloop('BlackPaw');
      expect(hit, locale).toContain('BlackPaw');
      expect(hit.length, `${locale}: "${hit}"`).toBeLessThanOrEqual(32);
    }
  });
});
