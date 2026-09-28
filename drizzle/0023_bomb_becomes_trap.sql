-- THE BOMB ITEM LEAVES THE GAME (2026-09-28). The thrown bomb had no use left
-- once the island stopped answering `plant`, and the burrow's trap already
-- looked like a bomb: the trap is now called the bomb, and every bomb still
-- held becomes one of them. `bomb` stays in the item_kind enum (Postgres
-- cannot drop a value), unused.
UPDATE "players" AS p
SET "traps_owned" = p."traps_owned" + i."qty"
FROM "inventory" AS i
WHERE i."player_id" = p."id" AND i."kind" = 'bomb' AND i."qty" > 0;
--> statement-breakpoint
DELETE FROM "inventory" WHERE "kind" = 'bomb';
--> statement-breakpoint
DELETE FROM "tuning" WHERE "key" IN ('SHOP.PRICES.bomb', 'SHOP.USDC_PRICES.bomb');
