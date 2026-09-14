/**
 * Energy is shown where the decision is made, and it gates the one action.
 *
 * A player pressing "go farm" with nothing in the tank lands on an island that
 * ends immediately — the worst possible way to learn they had to wait. The
 * number belongs on the burrow, beside the button it governs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENERGY, OUT_OF_RUN_ENERGY } from '../config/tuning';
import { burrowView, chargeRun, msToNextEnergy, msToRun } from '../src/lib/game/burrow';

const PAGE = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

const now = Date.now();
const row = (energy: number, agoMs = 0) => ({
  stock: 0,
  lifetimeCarrots: 0,
  burrowLevel: 1,
  energy,
  energyUpdatedAt: new Date(now - agoMs),
  gardenCollectedAt: new Date(now),
});

describe('energy in the burrow view', () => {
  it('reports the value and its ceiling', () => {
    const v = burrowView(row(12), now);
    expect(v.energy).toBe(12);
    expect(v.maxEnergy).toBe(OUT_OF_RUN_ENERGY.MAX);
  });

  it('counts down to the next point', () => {
    const v = burrowView(row(0), now);
    expect(v.nextEnergyInMs).toBeGreaterThan(0);
    // Never longer than one point's worth of waiting.
    expect(v.nextEnergyInMs!).toBeLessThanOrEqual(3_600_000 / OUT_OF_RUN_ENERGY.REGEN_PER_HOUR);
  });

  it('stops counting at the ceiling', () => {
    // A "next in" beside a full bar is a countdown to nothing.
    expect(msToNextEnergy({ energy: OUT_OF_RUN_ENERGY.MAX, energyUpdatedAt: new Date(now) }, now))
      .toBeNull();
  });

  it('regenerates while the player is away', () => {
    const hour = 3_600_000;
    expect(burrowView(row(0, 3 * hour), now).energy)
      .toBe(Math.floor(3 * OUT_OF_RUN_ENERGY.REGEN_PER_HOUR));
  });
});

describe('a run is paid for out of the burrow', () => {
  const hour = 3_600_000;
  const perPoint = hour / OUT_OF_RUN_ENERGY.REGEN_PER_HOUR;

  it('costs a whole run, and the bar says so', () => {
    const v = burrowView(row(ENERGY.RUN_COST), now);
    expect(v.runCost).toBe(ENERGY.RUN_COST);
    expect(v.nextRunInMs).toBeNull();
  });

  it('takes the cost off the regenerated bar and restamps the clock', () => {
    // Three hours away on an empty bar: the regen is folded in FIRST, then the
    // cost comes off. Charging the stored value against the old stamp would
    // pay the same three hours out again on the next read.
    const paid = chargeRun(row(0, 3 * hour), now)!;
    expect(paid.energy).toBe(3 * OUT_OF_RUN_ENERGY.REGEN_PER_HOUR - ENERGY.RUN_COST);
    expect(paid.energyUpdatedAt.getTime()).toBe(now);
    expect(burrowView({ ...row(0), ...paid }, now).energy).toBe(paid.energy);
  });

  it('refuses a bar short of a run, by a single point', () => {
    expect(chargeRun(row(ENERGY.RUN_COST - 1), now)).toBeNull();
    expect(chargeRun(row(ENERGY.RUN_COST), now)).not.toBeNull();
  });

  it('never pays out of a ceiling it does not have', () => {
    // A bar left for a week is still capped: two runs, not two hundred.
    const first = chargeRun(row(0, 7 * 24 * hour), now)!;
    expect(first.energy).toBe(OUT_OF_RUN_ENERGY.MAX - ENERGY.RUN_COST);
  });

  it('counts down to a RUN, not to the next point', () => {
    // One point short: the wait is one point's worth, and it is the same
    // clock the bar itself ticks on.
    const short = row(ENERGY.RUN_COST - 1);
    expect(msToRun(short, now)).toBe(perPoint);
    expect(msToRun(short, now + perPoint)).toBeNull();
    // Empty: the wait is the whole cost's worth.
    expect(msToRun(row(0), now)).toBe(ENERGY.RUN_COST * perPoint);
    expect(burrowView(row(0), now).nextRunInMs).toBe(ENERGY.RUN_COST * perPoint);
  });

  it('is what the burrow gates the crossing on', () => {
    // The screen has to refuse what the server will refuse — a player sent to
    // an island that turns them round has been told twice, the second time
    // by a black screen.
    expect(PAGE).toMatch(/burrow === null \|\| burrow\.energy >= burrow\.runCost/);
  });

  it('does not buy an island from the burrow', () => {
    // Joining pays now, so the socket may only rejoin ON the island — the
    // reconnect case, which the server seats for free.
    const SOCKET = readFileSync(new URL('../src/components/use-game-socket.ts', import.meta.url), 'utf8');
    expect(SOCKET).not.toMatch(/socket\.emit\(spectate \? 'spectate' : 'join'/);
    expect(SOCKET).toMatch(/onIslandRef\.current && playerId && rabbitsRef\.current\.has\(playerId\)\) socket\.emit\('join'\)/);
    expect(PAGE).toMatch(/useGameSocket\(token, player\?\.id \?\? null, spectating, where === 'island' && !spectating\)/);
  });

  it('turns a refused seat into the popup, back on the burrow', () => {
    const SERVER = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
    expect(SERVER).toMatch(/code: 'no_energy'/);
    // Refused BEFORE a seat is taken or a room joined.
    expect(SERVER.indexOf("code: 'no_energy'")).toBeLessThan(SERVER.indexOf('live.rabbits.set(data.playerId, rabbit)'));
    expect(PAGE).toMatch(/if \(where === 'island'\) \{ goTo\('burrow'\); return; \}/);
  });
});

describe('the farm button answers an empty tank', () => {
  /**
   * It used to be `disabled`, and that was the bug this suite now guards
   * against: the ONE control on the screen answered a tap with silence, so an
   * empty bar and a broken button looked the same. The press is always
   * answered — with the island when there is energy, and with the popup that
   * says why not and sells the way out when there is not.
   */
  it('is never disabled', () => {
    expect(PAGE).not.toMatch(/label="Go farm"[\s\S]{0,160}disabled/);
  });

  it('opens the popup instead of crossing when the tank is empty', () => {
    expect(PAGE).toMatch(/onClick=\{goFarm\}/);
    const gate = PAGE.slice(PAGE.indexOf('const goFarm'));
    expect(gate.slice(0, 200)).toMatch(/if \(!hasEnergy\) \{ setEnergyOpen\(true\); return; \}/);
  });

  it('treats "still loading" as usable, not as empty', () => {
    // A null burrow is a screen that has not answered yet. Offering a refill
    // there would be a shop pitch aimed at a player who may be full.
    expect(PAGE).toMatch(/burrow === null \|\| burrow\.energy >= burrow\.runCost/);
  });
});

describe('the out-of-energy popup', () => {
  const POPUP = readFileSync(new URL('../src/components/energy-popup.tsx', import.meta.url), 'utf8');

  it('states the free route beside the paid one', () => {
    // A refill offered without the wait next to it is a toll, not a shortcut.
    expect(POPUP).toMatch(/nextEnergyInMs/);
    expect(POPUP).toMatch(/comes back on its own/);
  });

  it('offers the carrot price, and money only when the rail is on', () => {
    expect(POPUP).toMatch(/rr-pay-carrot/);
    expect(POPUP).toMatch(/onPayUsdc && item/);
    // Same rule as the Shed: no wallet, no USDC button rather than a button
    // that fails at the quote.
    //
    // THREE conditions, because the browser being able to build a transfer and
    // the server being able to receive one are different facts. /api/config's
    // `payments` is `Boolean(SOLANA_RPC_URL)`; /api/shop's `usdcEnabled` is
    // whether a treasury is configured. A deployment with an RPC and no
    // treasury satisfied the first and failed the second, and this popup —
    // unlike the Shed's own tiles, which always checked the treasury — put a
    // price in money on screen that could never be quoted.
    const gate = PAGE.slice(PAGE.indexOf('payEnergyUsdc()') - 400)
      .slice(0, 500);
    expect(gate).toMatch(/payments/);
    expect(gate).toMatch(/usdcEnabled/);
    expect(gate).toMatch(/!player\.guest/);
  });

  it('keeps the whole shed one press away', () => {
    expect(POPUP).toMatch(/onOpenShop/);
  });

  it('stays a small dialog on a phone', () => {
    // The Shed goes full-screen there because it is seven shelves; one
    // question blown up to full-screen reads as a page to escape from.
    expect(CSS).toMatch(/\.rr-shop-scrim:has\(\.rr-energy-modal\)/);
  });
});
