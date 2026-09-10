/**
 * Carrots survive every way OUT of a run, not just running the tank dry.
 *
 * The bug: `bankRun` was called from exactly one place — the dig that took the
 * last point of energy. Every other exit deleted the rabbit and its carrots
 * together:
 *
 *  - walk back to the burrow with a full sack, and the seat is held for the
 *    45s reconnect grace and then swept away, unbanked;
 *  - close the tab, same;
 *  - be on an island that erupts while dead, and the island is deleted with
 *    the rabbit still holding the run.
 *
 * Digging and then leaving is the ORDINARY way to play. It must not be the way
 * to lose a run, which is what "the carrots are not really added" meant.
 *
 * The fix moves the run's paperwork off `socket.data` and onto the rabbit —
 * the seat outlives the connection, and the sweep that frees it has no socket
 * to read — and makes banking idempotent so several exits can race safely.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SERVER = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
const TYPES = readFileSync(new URL('../src/lib/game/types.ts', import.meta.url), 'utf8');

/** The body of `bankRun`, for assertions about what it reads. */
const bankBody = (() => {
  const at = SERVER.indexOf('async function bankRun(');
  return SERVER.slice(at, SERVER.indexOf('\n}', at));
})();

describe('banking a run', () => {
  it('reads the run off the RABBIT, not off the socket', () => {
    // The sweep has no socket. Taking the paperwork from `socket.data` is what
    // made that exit unable to bank at all.
    expect(SERVER).toMatch(/async function bankRun\(rabbit: Rabbit\)/);
    expect(TYPES).toMatch(/run\?: \{/);
    expect(bankBody).not.toMatch(/data\./);
  });

  it('is idempotent, so several exits can race', () => {
    // A dig can end a run AND the seat can later be swept. Both call this; the
    // run id is cleared up front so the second call is a no-op rather than a
    // second payout.
    expect(bankBody).toMatch(/if \(!run\?\.id\) return/);
    expect(bankBody).toMatch(/run\.id = undefined/);
  });

  it('banks when the sweep gives a seat up for good', () => {
    // THE bug: this loop used to delete the rabbit and return.
    const sweep = SERVER.slice(SERVER.indexOf('for (const [playerId, at] of live.disconnectedAt)'));
    const body = sweep.slice(0, sweep.indexOf('\n    }'));
    expect(body).toMatch(/bankRun\(rabbit\)/);
  });

  it('banks the finished runs an eruption is about to delete', () => {
    const erupt = SERVER.slice(SERVER.indexOf('const survivors ='));
    const body = erupt.slice(0, erupt.indexOf('store.delete'));
    expect(body).toMatch(/bankRun\(rabbit\)/);
  });

  it('carries the run across an eruption for the survivors', () => {
    // A moved rabbit with no run id can never bank what it digs next.
    expect(SERVER).toMatch(/moved\.run = rabbit\.run/);
  });

  it('counts tiles and bombs on the rabbit too', () => {
    // The banked figures come from the rabbit now, so a tally kept only on the
    // socket would write zeroes for every swept run.
    expect(SERVER).toMatch(/rabbit\.run\.tilesDug \+= 1/);
    expect(SERVER).toMatch(/rabbit\.run\.bombsHit \+= 1/);
  });

  it('still feeds all three counters in one statement', () => {
    // The GDD rule: one carrot event, three columns, never drifting apart.
    expect(bankBody).toMatch(/stock: raw/);
    expect(bankBody).toMatch(/seasonScore: raw/);
    expect(bankBody).toMatch(/lifetimeCarrots: raw/);
  });
});
