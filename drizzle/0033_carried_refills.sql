ALTER TYPE "public"."item_kind" ADD VALUE 'refill_3';--> statement-breakpoint
ALTER TYPE "public"."item_kind" ADD VALUE 'refill_10';--> statement-breakpoint
-- Refills are carried from now on (ENERGY_PACK.STARTING): every burrow that
-- already exists gets the three a new one is born with. Added to whatever the
-- bag already holds, under the shop's ceiling (SHOP.MAX_HELD = 20).
INSERT INTO "inventory" ("player_id", "kind", "qty")
SELECT "id", 'energy', 3 FROM "players"
ON CONFLICT ("player_id", "kind") DO UPDATE SET "qty" = LEAST("inventory"."qty" + 3, 20);--> statement-breakpoint
-- The window counted refills BOUGHT; it counts refills POURED now. Purchases
-- made today must not block the first pours.
UPDATE "players" SET "energy_packs_bought" = 0;
