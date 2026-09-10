-- Two demo players, so the season board is not just the dev's own accounts.
--
-- IDEMPOTENT: every statement is an upsert or is keyed on an id that only these
-- rows use, so running it twice changes nothing. That matters because this runs
-- against PRODUCTION, where a re-run that duplicated rows would be visible to
-- real players and awkward to unpick.
--
-- The ids are prefixed `sol:DEMO` on purpose. They are NOT valid base58 Solana
-- addresses and no wallet can ever sign for them, so these accounts cannot be
-- logged into, cannot be taken over, and are trivially greppable when it is
-- time to delete them:
--
--   DELETE FROM players WHERE id LIKE 'sol:DEMO%';
--
-- (the FKs cascade, so that one line removes their traps, raids and inventory).
--
-- WHAT CANNOT BE SEEDED: "currently out on the island" is in-memory state on the
-- WS server (store.all() / live.rabbits), not a row in this database. No INSERT
-- can put a rabbit on an island. What is seeded instead is everything the game
-- persists — the burrow that was left behind, the traps mining it, the raid
-- history, the bag — which is what the leaderboard and a raider actually read.

BEGIN;

-- ── 1. Clementine: the homebody ──────────────────────────────────────────────
-- Sits on a fat burrow and a big garden. A juicy raid target: high stock, and
-- her HP is down from a raid she has not repaired yet, so she reads as a place
-- worth visiting rather than as a wall.
INSERT INTO players (
  id, wallet, name, stock, season_score, lifetime_carrots,
  burrow_level, burrow_hp, hp_updated_at,
  energy, energy_updated_at, garden_collected_at,
  traps_owned, traps_claimed_at,
  runs_played, tiles_dug, created_at, last_seen_at
) VALUES (
  'sol:DEMOc1ementinewarren000000000000000000',
  'DEMOc1ementinewarren000000000000000000',
  'Clementine',
  4820,          -- a bank worth crossing a minefield for
  3140, 9260,    -- season score / lifetime: mid-table, believable
  5, 380,        -- level 5 (max 500 hp), dented and regenerating
  now() - interval '3 hours',
  44, now() - interval '2 hours',
  now() - interval '7 hours',   -- garden part-grown, not conveniently full
  2, now() - interval '9 hours',
  38, 1290,
  now() - interval '26 days',
  now() - interval '11 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ── 2. Bramble: the one who went out ─────────────────────────────────────────
-- The raider. Higher season score than his lifetime alone would earn, because
-- score is TAKEN in this game — he has been out taking it. Left home mined:
-- eight traps is TRAPS.MAX_PLACED, the most the game allows on a board.
INSERT INTO players (
  id, wallet, name, stock, season_score, lifetime_carrots,
  burrow_level, burrow_hp, hp_updated_at,
  energy, energy_updated_at, garden_collected_at,
  traps_owned, traps_claimed_at,
  runs_played, tiles_dug, created_at, last_seen_at
) VALUES (
  'sol:DEMObramb1ethumper00000000000000000000',
  'DEMObramb1ethumper00000000000000000000',
  'Bramble',
  1960,          -- lower bank: he spends it on traps and shields
  6480, 7310,    -- score ABOVE lifetime: the signature of a thief
  4, 400,        -- level 4, full hp: nobody has got through the traps
  now() - interval '30 hours',
  9, now() - interval '6 minutes',   -- energy nearly spent: he is out digging
  now() - interval '40 minutes',
  4, now() - interval '3 hours',
  91, 4870,
  now() - interval '31 days',
  now() - interval '2 minutes'       -- seen JUST now
) ON CONFLICT (id) DO NOTHING;

-- ── Bramble's minefield ──────────────────────────────────────────────────────
-- Eight tiles, TRAPS.MAX_PLACED exactly. Every index below is a real
-- `isTrappable` tile (burrowCell === 'ground'), taken from the 63 the burrow
-- layout actually offers — a made-up index would insert fine and then draw
-- nothing, because the scene only renders traps on cells it can place.
INSERT INTO traps (owner_id, tile, placed_at) VALUES
  ('sol:DEMObramb1ethumper00000000000000000000', 40,  now() - interval '2 days'),
  ('sol:DEMObramb1ethumper00000000000000000000', 43,  now() - interval '2 days'),
  ('sol:DEMObramb1ethumper00000000000000000000', 57,  now() - interval '2 days'),
  ('sol:DEMObramb1ethumper00000000000000000000', 71,  now() - interval '1 day'),
  ('sol:DEMObramb1ethumper00000000000000000000', 87,  now() - interval '1 day'),
  ('sol:DEMObramb1ethumper00000000000000000000', 100, now() - interval '1 day'),
  ('sol:DEMObramb1ethumper00000000000000000000', 133, now() - interval '5 hours'),
  ('sol:DEMObramb1ethumper00000000000000000000', 152, now() - interval '5 hours')
ON CONFLICT (owner_id, tile) DO NOTHING;

-- Clementine keeps a token defence, so the contrast between the two is legible:
-- she is not undefended, she is just not a fortress.
INSERT INTO traps (owner_id, tile, placed_at) VALUES
  ('sol:DEMOc1ementinewarren000000000000000000', 55, now() - interval '4 days'),
  ('sol:DEMOc1ementinewarren000000000000000000', 86, now() - interval '4 days')
ON CONFLICT (owner_id, tile) DO NOTHING;

-- ── The bags ─────────────────────────────────────────────────────────────────
-- Bramble is kitted for attack, Clementine for sitting still. `qty` is capped
-- by tuning (TRAPS.MAX_HELD = 12) so nothing here is above what play can reach.
INSERT INTO inventory (player_id, kind, qty) VALUES
  ('sol:DEMObramb1ethumper00000000000000000000', 'bomb',      6),
  ('sol:DEMObramb1ethumper00000000000000000000', 'lightning', 3),
  ('sol:DEMObramb1ethumper00000000000000000000', 'trap',      4),
  ('sol:DEMObramb1ethumper00000000000000000000', 'smoke',     1),
  ('sol:DEMOc1ementinewarren000000000000000000', 'shield',    2),
  ('sol:DEMOc1ementinewarren000000000000000000', 'trap',      2),
  ('sol:DEMOc1ementinewarren000000000000000000', 'bomb',      1)
ON CONFLICT (player_id, kind) DO UPDATE SET qty = EXCLUDED.qty;

-- ── The history that explains the numbers ────────────────────────────────────
-- Bramble raided Clementine: it is why her HP is down and why his season score
-- runs ahead of his lifetime. Seeding the score without the raid that moved it
-- would leave two numbers that contradict each other.
-- Keyed on a fixed uuid so a re-run updates rather than stacking duplicates.
INSERT INTO raids (
  id, attacker_id, defender_id, damage, result,
  carrots_looted, score_transferred, seen_by_defender, created_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'sol:DEMObramb1ethumper00000000000000000000',
  'sol:DEMOc1ementinewarren000000000000000000',
  120, 'looted', 640, 410, false, now() - interval '3 hours'
), (
  '22222222-2222-4222-8222-222222222222',
  'sol:DEMOc1ementinewarren000000000000000000',
  'sol:DEMObramb1ethumper00000000000000000000',
  0, 'blocked', 0, 0, true, now() - interval '1 day'
) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- What the board should read afterwards.
SELECT name, season_score, lifetime_carrots, burrow_level, burrow_hp,
       (SELECT count(*) FROM traps t WHERE t.owner_id = p.id) AS traps_placed
FROM players p
ORDER BY season_score DESC;
