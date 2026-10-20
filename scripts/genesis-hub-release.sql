-- THE GAME'S RR GENESIS STOCK, TAKEN OUT OF THE HUB'S CATALOGUE (2026-10-20).
--
-- Run ON THE HUB'S DATABASE (Domin8), never on Rabbit Royale's. The casino
-- keeps 100 free pieces; every other FREE piece leaves its catalogue for the
-- rabbits' wallet (FChws…uHB), to be won in crown chests. Prints the mints
-- that leave, one per line: that list is what scripts/genesis-stock-move.ts
-- transfers.
--
--   psql "$HUB_DATABASE_URL" -At -v ON_ERROR_STOP=1 -f scripts/genesis-hub-release.sql > moving.txt
--
-- FREE = in the vault per the catalogue (`status = 'vault'`), of the RR Genesis
-- collection, and held in escrow for nobody (`nft_holdings.custody = 'escrow'`
-- is a piece the hub owes a player, which must never leave). Reserved and
-- delivered rows are not free either. Which 100 stay is drawn at random, so
-- the casino keeps the collection's mix of rarities.
--
-- ONE STATEMENT, so the hub cannot reserve a piece between the choice and the
-- marking: the rows are flipped to 'delivered', reserved_by
-- 'moved:rabbit-royale', the moment they are chosen, and the hub no longer
-- offers them. If a transfer then fails, put that row back by hand:
--   UPDATE nft_catalog SET status = 'vault', reserved_by = NULL WHERE mint_address = '<mint>';
WITH free AS (
  SELECT c.mint_address
  FROM nft_catalog c
  WHERE c.status = 'vault'
    AND c.collection = 'GNkMLCVtP3i2imay4LSRKugEFaUeb77QYHR4uDcxB56A'
    AND NOT EXISTS (
      SELECT 1 FROM nft_holdings h
      WHERE h.mint_address = c.mint_address AND h.custody = 'escrow'
    )
),
keep AS (
  SELECT mint_address FROM free ORDER BY random() LIMIT 100
)
UPDATE nft_catalog c
SET status = 'delivered', reserved_by = 'moved:rabbit-royale', updated_at = now()
FROM free
WHERE c.mint_address = free.mint_address
  AND c.mint_address NOT IN (SELECT mint_address FROM keep)
RETURNING c.mint_address;
