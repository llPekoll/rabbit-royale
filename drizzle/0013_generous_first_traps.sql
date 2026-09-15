-- Hand every EXISTING burrow the full free trap allowance, once.
--
-- The bug this repairs: `traps_claimed_at` defaults to now() and `freeTraps()`
-- reads it as "how long has the allowance been refilling", so every player ever
-- created was born holding ZERO traps and could bury nothing for eight hours.
-- guest.ts and wallet-login.ts now backdate this column at creation; that fixes
-- only players created from here on, and this statement is the other half.
--
-- Backdating by 24h (TRAPS.REFILL_MS) fills the allowance: freeTraps() caps at
-- TRAPS.FREE_PER_DAY however far back the stamp points, so nobody ends up with
-- more than three.
--
-- Only moves stamps BACKWARDS. A player who has been away long enough to have
-- already refilled keeps their own stamp, so this can never take a trap away,
-- and re-running it is a no-op.
UPDATE "players"
SET "traps_claimed_at" = now() - interval '24 hours'
WHERE "traps_claimed_at" > now() - interval '24 hours';
