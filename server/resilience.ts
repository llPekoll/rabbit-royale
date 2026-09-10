/**
 * Keeping the game server alive.
 *
 * This process died repeatedly in production — Coolify reported "Exited /
 * Restart limit reached" — and the cause was structural rather than a
 * particular bug: nothing here was wrapped in anything.
 *
 * The chain was always the same. An `async` socket handler throws (Postgres
 * blinks, Redis drops a connection, a query times out), and because socket.io
 * never awaits a handler's promise, the rejection is unhandled. Node's default
 * for an unhandled rejection is to kill the process. Docker restarts it, the
 * next disconnect does it again, and after N restarts Docker gives up.
 *
 * Two things matter about that failure:
 *
 *  - It was triggered by ROUTINE events. `markOffline` runs on every
 *    disconnect, which is every closed tab — so one bad second from Redis took
 *    the whole server down and with it everyone else's live run.
 *  - The work that threw was usually OPTIONAL. Nobody's run should end because
 *    a presence set could not be updated.
 *
 * So the rule this module encodes: a failure while handling ONE socket must
 * never reach the other players. Log it, keep serving. The only thing allowed
 * to stop the process is a deliberate shutdown.
 */

/** How a handler failure is reported. Kept as one line so it greps cleanly. */
function report(scope: string, err: unknown): void {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`[rr-ws] ${scope} failed:`, message);
}

/**
 * Wrap a socket handler so a throw is logged instead of killing the server.
 *
 * socket.io calls handlers and drops the promise on the floor, which is what
 * turns any `await` in a handler into a process-level risk. This gives every
 * handler the try/catch that its call site does not.
 *
 * Deliberately swallows: the caller is a client event, there is nobody to
 * propagate to, and rethrowing would recreate the crash this exists to stop.
 */
export function guard<A extends unknown[]>(
  scope: string,
  // The return is deliberately `unknown`: handlers here idiomatically write
  // `return socket.emit(...)` as an early exit, and emit returns a boolean.
  // Demanding `void` would make the wrapper reject the very code it protects.
  handler: (...args: A) => unknown,
): (...args: A) => void {
  return (...args: A) => {
    try {
      const out = handler(...args);
      if (out instanceof Promise) out.catch((e) => report(scope, e));
    } catch (e) {
      report(scope, e);
    }
  };
}

/**
 * Run optional work that must never take a run down with it.
 *
 * For the writes that are nice to have and not load bearing: presence, the
 * leaderboard mirror, telemetry. A player's rabbit does not stop existing
 * because Redis did.
 */
export async function optional(scope: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (e) {
    report(scope, e);
  }
}

export interface ShutdownHooks {
  /** Stop accepting connections and let in-flight work finish. */
  close(): Promise<void>;
}

/**
 * The last line of defence, plus an orderly exit.
 *
 * `uncaughtException` and `unhandledRejection` are installed so that a bug
 * anywhere — including one this module's wrappers do not cover — degrades to a
 * log line rather than to a dead server. That IS the standard warning about
 * ignoring these events, and it is the right trade here: this process holds
 * live game state in memory for everyone currently playing, so crashing on a
 * single bad event throws away dozens of innocent runs to punish one. The
 * handlers log with full stacks, so nothing is hidden — it is triaged from logs
 * instead of from an outage.
 *
 * SIGTERM is what a deploy sends, and it IS honoured: the server stops taking
 * connections and exits, so a rolling deploy does not hang until Docker kills
 * it.
 */
export function installProcessGuards(hooks: ShutdownHooks): void {
  process.on('uncaughtException', (err) => {
    report('uncaughtException', err);
  });

  process.on('unhandledRejection', (reason) => {
    report('unhandledRejection', reason);
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[rr-ws] ${signal} — closing`);

    // A deploy waits on this. If the close hangs (a socket that will not drain),
    // exit anyway rather than let the orchestrator SIGKILL us at its own
    // timeout, which looks like a crash in the deployment log.
    const hard = setTimeout(() => {
      console.warn('[rr-ws] close timed out, exiting anyway');
      process.exit(0);
    }, 8000);
    hard.unref();

    hooks.close()
      .then(() => { clearTimeout(hard); process.exit(0); })
      .catch((e) => { report('shutdown', e); process.exit(0); });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
