/**
 * The server must not die because one socket had a bad moment.
 *
 * These are regression tests for a real outage: rr-ws went "Exited / Restart
 * limit reached" in production, and the cause was that nothing was wrapped.
 * An `async` socket handler that threw became an unhandled rejection, Node
 * killed the process by default, Docker restarted it, the next disconnect did
 * it again, and Docker gave up.
 *
 * What makes that shape dangerous is not the bug that throws — it is that the
 * throw was triggered by ROUTINE events (a closed tab calls `markOffline`) and
 * that it took every OTHER player's live run down with it. So what is asserted
 * here is containment: the failure is reported, and nothing else happens.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { guard, optional } from '../server/resilience';

let errors: unknown[][];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args); });
});
afterEach(() => vi.restoreAllMocks());

/** Wait for the microtask queue, where an unhandled rejection would surface. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('guard', () => {
  it('runs a healthy handler untouched', () => {
    const spy = vi.fn();
    guard('join', spy)('a', 'b');
    expect(spy).toHaveBeenCalledWith('a', 'b');
    expect(errors).toHaveLength(0);
  });

  it('contains a synchronous throw', () => {
    const wrapped = guard('move', () => { throw new Error('boom'); });
    expect(() => wrapped()).not.toThrow();
    expect(errors[0]?.[0]).toContain('move failed');
  });

  it('contains a rejected async handler', async () => {
    // THE production crash: socket.io never awaits a handler, so a rejection
    // here reached the process and killed it.
    const wrapped = guard('disconnect', async () => { throw new Error('redis down'); });
    wrapped();
    await settle();
    expect(errors[0]?.[0]).toContain('disconnect failed');
    expect(String(errors[0]?.[1])).toContain('redis down');
  });

  it('reports the scope so a log line says which handler broke', async () => {
    guard('spectate', async () => { throw new Error('nope'); })();
    await settle();
    expect(errors[0]?.[0]).toContain('spectate');
  });

  it('keeps serving the NEXT event after one fails', async () => {
    // The point of the whole exercise: one player's bad event must not end
    // anyone else's run.
    const good = vi.fn();
    const bad = guard('move', async () => { throw new Error('one bad move'); });
    bad();
    await settle();
    guard('move', good)('still here');
    expect(good).toHaveBeenCalledWith('still here');
  });

  it('tolerates a handler that returns a value', async () => {
    // Handlers idiomatically early-exit with `return socket.emit(...)`, which
    // returns a boolean — the wrapper must not care.
    const wrapped = guard('join', () => true);
    expect(() => wrapped()).not.toThrow();
    expect(errors).toHaveLength(0);
  });
});

describe('optional', () => {
  it('swallows a failure in nice-to-have work', async () => {
    await expect(optional('markOffline', async () => { throw new Error('no redis'); }))
      .resolves.toBeUndefined();
    expect(errors[0]?.[0]).toContain('markOffline failed');
  });

  it('lets the caller carry on after the failure', async () => {
    // A player joins even when presence cannot be written: the run is the
    // product, the presence set is bookkeeping.
    let joined = false;
    await optional('markOnline', async () => { throw new Error('down'); });
    joined = true;
    expect(joined).toBe(true);
  });

  it('does not report anything when the work succeeds', async () => {
    await optional('setScore', async () => 'fine');
    expect(errors).toHaveLength(0);
  });
});
