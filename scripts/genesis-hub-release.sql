-- THE GAME'S RR GENESIS STOCK, TAKEN OUT OF THE HUB'S CATALOGUE (2026-10-20).
--
-- Run ON THE HUB'S DATABASE (Domin8: `ssh domin8`, container
-- yqoj7irwovw1yebsifht9808, database `circle`), never on Rabbit Royale's. The
-- casino keeps 100 free pieces; every other FREE piece leaves its catalogue
-- for the rabbits' wallet (FChws…uHB), to be won in crown chests. Prints the
-- mints that leave, one per line: that list is what
-- scripts/genesis-stock-move.ts transfers.
--
--   ssh domin8 "docker exec -i yqoj7irwovw1yebsifht9808 psql -U postgres -d circle -At -v ON_ERROR_STOP=1" \
--     < scripts/genesis-hub-release.sql > moving.txt
--
-- FREE = `status = 'vault'` in the RR Genesis collection. A piece the hub owes
-- a player (escrow) is already 'delivered' in the catalogue, and so are the
-- reserved ones: none of them can be picked.
--
-- THE 100 THAT STAY, by channel, so no hub feature is left empty ("au prorata
-- des canaux", 2026-10-20): `reserve` (held back on purpose) stays whole, and
-- the other 94 follow each channel's share of the 450 free on that day —
-- shop 285 -> 59, pass 65 -> 14, direct 56 -> 12, rr-chest 28 -> 6,
-- airdrop 16 -> 3. Which ones stay inside a channel is drawn at random, so
-- the casino keeps the collection's mix of rarities. A channel this table does
-- not name keeps everything.
--
-- ONE STATEMENT, so the hub cannot reserve a piece between the choice and the
-- marking: the rows are flipped to 'delivered', reserved_by
-- 'moved:rabbit-royale', the moment they are chosen, and the hub no longer
-- offers them. If a transfer then fails, put that row back by hand:
--   UPDATE nft_catalog SET status = 'vault', reserved_by = NULL WHERE mint_address = '<mint>';
WITH quota(channel, keep) AS (
  VALUES ('shop', 59), ('pass', 14), ('direct', 12), ('rr-chest', 6), ('airdrop', 3)
),
ranked AS (
  SELECT c.mint_address, c.channel,
         row_number() OVER (PARTITION BY c.channel ORDER BY random()) AS n
  FROM nft_catalog c
  WHERE c.status = 'vault'
    AND c.collection = 'GNkMLCVtP3i2imay4LSRKugEFaUeb77QYHR4uDcxB56A'
),
leaving AS (
  SELECT r.mint_address
  FROM ranked r
  JOIN quota q ON q.channel = r.channel
  WHERE r.n > q.keep
)
UPDATE nft_catalog c
SET status = 'delivered', reserved_by = 'moved:rabbit-royale', updated_at = now()
FROM leaving
WHERE c.mint_address = leaving.mint_address
  AND c.status = 'vault'
RETURNING c.mint_address;
